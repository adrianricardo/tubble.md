import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { currentActorName } from "./authIdentity";
import {
	findUserIdByEmail,
	normalizeEmail,
	upsertFolderInvite,
} from "./members";
import {
	type DocumentRole,
	documentRole,
	FOLDER_INHERITANCE_DEPTH_CAP,
	folderRole,
	isFolderAuthorityActive,
	requireActiveFolder,
	requireDocumentWrite,
	requireWorkspaceMember,
	workspaceRole,
} from "./permissions";

type AnyCtx = MutationCtx | QueryCtx;

const documentRoleValidator = v.union(
	v.literal("owner"),
	v.literal("editor"),
	v.literal("commenter"),
	v.literal("viewer"),
);

// Link shares are capped BELOW owner: an inherited folder owner can manage
// shares, so a public "owner" link would leak a management capability.
const linkRoleValidator = v.union(
	v.literal("editor"),
	v.literal("commenter"),
	v.literal("viewer"),
);

function normalizeFolderName(name: string) {
	const trimmed = name.trim();
	if (!trimmed) throw new Error("Folder name is required");
	return trimmed;
}

// ---------------------------------------------------------------------------
// Authorization helpers (guest-aware, D12)
// ---------------------------------------------------------------------------

/** True if the current identity is any member of the folder's workspace. */
async function isWorkspaceMember(
	ctx: AnyCtx,
	workspaceId: Id<"workspaces">,
): Promise<boolean> {
	return (await workspaceRole(ctx, workspaceId)) !== null;
}

/**
 * Access role for guest-safe subtree reads (RB2): inherited `folderRole` for
 * guests, with a workspace-membership fallback so a member who opens a
 * `/folder/<id>` invite link to their own workspace is not dead-ended with
 * "Unauthorized" (they have no folderShares row — membership already grants
 * access via `documentRole`; this mirrors that for folder-level listings).
 */
async function subtreeReadRole(
	ctx: AnyCtx,
	folder: Doc<"folders">,
): Promise<DocumentRole | null> {
	if (!(await isFolderAuthorityActive(ctx, folder._id))) return null;
	const shared = await folderRole(ctx, folder._id);
	if (shared) return shared;
	const membership = await workspaceRole(ctx, folder.workspaceId);
	if (membership === "owner" || membership === "admin") return "owner";
	if (membership === "member") return "editor";
	return null;
}

/** Workspace owner/admin, or an inherited folder `owner`, may manage shares. */
async function requireFolderManage(ctx: AnyCtx, folder: Doc<"folders">) {
	await requireActiveFolder(ctx, folder._id);
	const wsRole = await workspaceRole(ctx, folder.workspaceId);
	if (wsRole === "owner" || wsRole === "admin") return;
	if ((await folderRole(ctx, folder._id)) === "owner") return;
	throw new Error("Unauthorized");
}

/** Any workspace member, or an inherited folder `editor`+, may write. */
async function requireFolderWrite(ctx: AnyCtx, folder: Doc<"folders">) {
	await requireActiveFolder(ctx, folder._id);
	if (await isWorkspaceMember(ctx, folder.workspaceId)) return;
	const role = await folderRole(ctx, folder._id);
	if (role === "editor" || role === "owner") return;
	throw new Error("Unauthorized");
}

// ---------------------------------------------------------------------------
// Subtree collection (shared with documents.ts guest read paths)
// ---------------------------------------------------------------------------

/**
 * Collect the active folder subtree rooted at `rootFolderId`: descendant
 * folders (excluding the root) and every active document in the root or any
 * descendant. Cycle-safe. Used by guest read paths and share resolution.
 */
export async function collectFolderSubtree(
	ctx: AnyCtx,
	rootFolderId: Id<"folders">,
): Promise<{
	root: Doc<"folders"> | null;
	descendants: Array<Doc<"folders">>;
	documents: Array<Doc<"documents">>;
}> {
	const root = await ctx.db.get(rootFolderId);
	if (!root || !(await isFolderAuthorityActive(ctx, rootFolderId))) {
		return { root: null, descendants: [], documents: [] };
	}

	const allFolders = await ctx.db
		.query("folders")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", root.workspaceId))
		.collect();
	const childrenByParent = new Map<string, Array<Doc<"folders">>>();
	for (const folder of allFolders) {
		if (folder.deletedAt !== undefined) continue;
		if (!(await isFolderAuthorityActive(ctx, folder._id))) continue;
		const key = folder.parentId ?? "__root__";
		const list = childrenByParent.get(key);
		if (list) list.push(folder);
		else childrenByParent.set(key, [folder]);
	}

	const inSubtree = new Set<Id<"folders">>([rootFolderId]);
	const descendants: Array<Doc<"folders">> = [];
	const queue: Array<Id<"folders">> = [rootFolderId];
	while (queue.length > 0) {
		const parent = queue.shift();
		if (!parent) break;
		for (const child of childrenByParent.get(parent) ?? []) {
			if (inSubtree.has(child._id)) continue; // cycle guard
			inSubtree.add(child._id);
			descendants.push(child);
			queue.push(child._id);
		}
	}

	const documents: Array<Doc<"documents">> = [];
	for (const folderId of inSubtree) {
		const docs = await ctx.db
			.query("documents")
			.withIndex("by_workspace_folder", (q) =>
				q.eq("workspaceId", root.workspaceId).eq("folderId", folderId),
			)
			.collect();
		for (const doc of docs) {
			if (doc.deletedAt === undefined) documents.push(doc);
		}
	}

	return { root, descendants, documents };
}

/**
 * Path of `folderId` relative to `rootFolderId` (exclusive of the root),
 * built from folder names joined by "/". Returns "" when folderId === root.
 */
export function folderRelativePath(
	folderId: Id<"folders">,
	rootFolderId: Id<"folders">,
	folderById: Map<Id<"folders">, Doc<"folders">>,
): string {
	const segments: string[] = [];
	let current: Id<"folders"> | undefined = folderId;
	let depth = 0;
	while (
		current &&
		current !== rootFolderId &&
		depth < FOLDER_INHERITANCE_DEPTH_CAP
	) {
		const folder = folderById.get(current);
		if (!folder) break;
		segments.unshift(folder.name);
		current = folder.parentId;
		depth++;
	}
	return segments.join("/");
}

/** True if any ancestor of `folder` (excluding itself) is in `folderIds`. */
export async function hasAncestorIn(
	ctx: AnyCtx,
	folder: Doc<"folders">,
	folderIds: Set<Id<"folders">>,
): Promise<boolean> {
	const seen = new Set<Id<"folders">>([folder._id]);
	let current = folder.parentId;
	let depth = 0;
	while (current && depth < FOLDER_INHERITANCE_DEPTH_CAP) {
		if (seen.has(current)) break; // cycle guard
		if (folderIds.has(current)) return true;
		seen.add(current);
		const parent: Doc<"folders"> | null = await ctx.db.get(current);
		if (!parent) break;
		current = parent.parentId;
		depth++;
	}
	return false;
}

/** True if `candidateId` is `folderId` or one of its descendants (cycle-safe). */
async function isSelfOrDescendant(
	ctx: AnyCtx,
	folderId: Id<"folders">,
	candidateId: Id<"folders">,
): Promise<boolean> {
	const seen = new Set<Id<"folders">>();
	let current: Id<"folders"> | undefined = candidateId;
	let depth = 0;
	while (current && depth < FOLDER_INHERITANCE_DEPTH_CAP) {
		if (current === folderId) return true;
		if (seen.has(current)) break; // cycle guard
		seen.add(current);
		const folder: Doc<"folders"> | null = await ctx.db.get(current);
		if (!folder) break;
		current = folder.parentId;
		depth++;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const list = query({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, { workspaceId }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const folders = await ctx.db
			.query("folders")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		const visible: Array<Doc<"folders">> = [];
		for (const folder of folders) {
			if (
				folder.deletedAt === undefined &&
				(await isFolderAuthorityActive(ctx, folder._id))
			) {
				visible.push(folder);
			}
		}
		return visible.sort((a, b) => a.name.localeCompare(b.name));
	},
});

export const listTrash = query({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, { workspaceId }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const folders = await ctx.db
			.query("folders")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		const visible = [];
		for (const folder of folders) {
			if (
				folder.deletedAt !== undefined &&
				(await isFolderAuthorityActive(ctx, folder._id))
			) {
				visible.push(folder);
			}
		}
		return visible.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
	},
});

/**
 * Guest-safe subtree listing, authorized by inherited `folderRole` rather than
 * workspace membership. Returns the folder, the caller's resolved role, the
 * descendant folders, and the active documents (metadata only — no markdown)
 * with each item's path relative to the requested folder.
 */
export const listSubtree = query({
	args: { folderId: v.id("folders") },
	handler: async (ctx, { folderId }) => {
		const preRoot = await ctx.db.get(folderId);
		if (!preRoot) throw new Error("Unauthorized");
		const role = await subtreeReadRole(ctx, preRoot);
		if (!role) throw new Error("Unauthorized");
		const { root, descendants, documents } = await collectFolderSubtree(
			ctx,
			folderId,
		);
		if (!root || root.deletedAt !== undefined) return null;

		const folderById = new Map<Id<"folders">, Doc<"folders">>();
		folderById.set(root._id, root);
		for (const folder of descendants) folderById.set(folder._id, folder);

		const canWrite = role === "owner" || role === "editor";
		return {
			folder: {
				_id: root._id,
				name: root.name,
				workspaceId: root.workspaceId,
				parentId: root.parentId ?? null,
				repoName: root.repoName ?? null,
				repoRemoteUrl: root.repoRemoteUrl ?? null,
			},
			role,
			canWrite,
			folders: descendants
				.map((folder) => ({
					_id: folder._id,
					name: folder.name,
					parentId: folder.parentId ?? null,
					relativePath: folderRelativePath(folder._id, root._id, folderById),
				}))
				.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
			documents: documents
				.map((doc) => ({
					_id: doc._id,
					title: doc.title,
					path: doc.path ?? null,
					folderId: doc.folderId ?? null,
					updatedAt: doc.updatedAt,
					updatedBy: doc.updatedBy,
					relativePath: doc.folderId
						? folderRelativePath(doc.folderId, root._id, folderById)
						: "",
				}))
				.sort((a, b) => b.updatedAt - a.updatedAt),
		};
	},
});

export const getContextCapabilities = query({
	args: {
		workspaceId: v.id("workspaces"),
		folderId: v.optional(v.id("folders")),
	},
	handler: async (ctx, { workspaceId, folderId }) => {
		const membershipRole = await workspaceRole(ctx, workspaceId);
		if (membershipRole) {
			return {
				mode: "uniform" as const,
				canWrite: true,
				canShare: membershipRole === "owner" || membershipRole === "admin",
			};
		}
		if (!folderId) throw new Error("Unauthorized");
		const folder = await ctx.db.get(folderId);
		if (
			!folder ||
			folder.deletedAt !== undefined ||
			!(await isFolderAuthorityActive(ctx, folderId)) ||
			folder.workspaceId !== workspaceId
		) {
			throw new Error("Unauthorized");
		}
		const role = await folderRole(ctx, folderId);
		if (!role) throw new Error("Unauthorized");
		// A descendant can have a stronger direct share than the visible root, so
		// row actions need per-node capabilities instead of inheriting one UI flag.
		const subtree = await collectFolderSubtree(ctx, folderId);
		const folders = subtree.root
			? [subtree.root, ...subtree.descendants]
			: subtree.descendants;
		const folderRoles = await Promise.all(
			folders.map((candidate) => folderRole(ctx, candidate._id)),
		);
		const documentRoles = await Promise.all(
			subtree.documents.map((document) => documentRole(ctx, document._id)),
		);
		return {
			mode: "per-node" as const,
			canWrite: role === "owner" || role === "editor",
			canShare: role === "owner",
			writableFolderIds: folders.flatMap((candidate, index) => {
				const candidateRole = folderRoles[index];
				return candidateRole === "owner" || candidateRole === "editor"
					? [candidate._id]
					: [];
			}),
			shareableFolderIds: folders.flatMap((candidate, index) =>
				folderRoles[index] === "owner" ? [candidate._id] : [],
			),
			readableFolderIds: folders.map((candidate) => candidate._id),
			writableDocumentIds: subtree.documents.flatMap((document, index) => {
				const candidateRole = documentRoles[index];
				return candidateRole === "owner" || candidateRole === "editor"
					? [document._id]
					: [];
			}),
		};
	},
});

export const listFolderShares = query({
	args: { folderId: v.id("folders") },
	handler: async (ctx, { folderId }) => {
		const folder = await ctx.db.get(folderId);
		if (!folder) throw new Error("Folder not found");
		await requireFolderManage(ctx, folder);
		const shares = await ctx.db
			.query("folderShares")
			.withIndex("by_folder", (q) => q.eq("folderId", folderId))
			.collect();
		return Promise.all(
			shares.map(async (share) => ({
				...share,
				user: share.userId ? await ctx.db.get(share.userId) : null,
			})),
		);
	},
});

// ---------------------------------------------------------------------------
// Mutations — folder CRUD (guest-aware)
// ---------------------------------------------------------------------------

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		parentId: v.optional(v.id("folders")),
		name: v.string(),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { workspaceId, parentId, name, actor }) => {
		if (parentId) {
			const parent = await ctx.db.get(parentId);
			if (
				!parent ||
				parent.deletedAt !== undefined ||
				parent.workspaceId !== workspaceId
			) {
				throw new Error("Parent folder not found");
			}
			// Members can create anywhere; guests need editor+ on the parent.
			await requireFolderWrite(ctx, parent);
		} else {
			await requireWorkspaceMember(ctx, workspaceId);
		}
		const now = Date.now();
		// Created folders inherit their parent's shares (D12) — no extra ACL rows.
		return ctx.db.insert("folders", {
			workspaceId,
			parentId,
			name: normalizeFolderName(name),
			createdBy: await currentActorName(ctx, actor),
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const rename = mutation({
	args: {
		folderId: v.id("folders"),
		name: v.string(),
	},
	handler: async (ctx, { folderId, name }) => {
		const folder = await ctx.db.get(folderId);
		if (!folder || folder.deletedAt !== undefined) {
			throw new Error("Folder not found");
		}
		await requireFolderWrite(ctx, folder);
		await ctx.db.patch(folderId, {
			name: normalizeFolderName(name),
			updatedAt: Date.now(),
		});
	},
});

export const move = mutation({
	args: {
		folderId: v.id("folders"),
		parentId: v.optional(v.id("folders")),
	},
	handler: async (ctx, { folderId, parentId }) => {
		const folder = await ctx.db.get(folderId);
		if (!folder || folder.deletedAt !== undefined) {
			throw new Error("Folder not found");
		}
		const member = await isWorkspaceMember(ctx, folder.workspaceId);
		await requireFolderWrite(ctx, folder);

		if (parentId) {
			if (parentId === folderId)
				throw new Error("Cannot move a folder into itself");
			const parent = await ctx.db.get(parentId);
			if (
				!parent ||
				parent.deletedAt !== undefined ||
				parent.workspaceId !== folder.workspaceId ||
				!(await isFolderAuthorityActive(ctx, parentId))
			) {
				throw new Error("Parent folder not found");
			}
			if (await isSelfOrDescendant(ctx, folderId, parentId)) {
				throw new Error("Cannot move a folder into its own subtree");
			}
		}

		if (!member) {
			// Guests cannot move content out of the subtree shared with them:
			// moving to workspace root, or into a folder they cannot write, escapes.
			if (!parentId) throw new Error("Unauthorized");
			const destRole = await folderRole(ctx, parentId);
			if (destRole !== "owner" && destRole !== "editor") {
				throw new Error("Unauthorized");
			}
		}

		await ctx.db.patch(folderId, { parentId, updatedAt: Date.now() });
	},
});

export const remove = mutation({
	args: { folderId: v.id("folders") },
	handler: async (ctx, { folderId }) => {
		const folder = await ctx.db.get(folderId);
		if (!folder || folder.deletedAt !== undefined) return;
		await requireFolderWrite(ctx, folder);
		await ctx.db.patch(folderId, {
			deletedAt: Date.now(),
			updatedAt: Date.now(),
		});
	},
});

export const restoreRemoved = mutation({
	args: { folderId: v.id("folders") },
	handler: async (ctx, { folderId }) => {
		const folder = await ctx.db.get(folderId);
		if (!folder || folder.deletedAt === undefined) return;
		await requireFolderWrite(ctx, folder);
		await ctx.db.patch(folderId, {
			deletedAt: undefined,
			updatedAt: Date.now(),
		});
	},
});

export const moveDocument = mutation({
	args: {
		documentId: v.id("documents"),
		folderId: v.optional(v.id("folders")),
	},
	handler: async (ctx, { documentId, folderId }) => {
		await requireDocumentWrite(ctx, documentId);
		const document = await ctx.db.get(documentId);
		if (!document || document.deletedAt !== undefined) {
			throw new Error("Document not found");
		}
		const member = await isWorkspaceMember(ctx, document.workspaceId);
		if (folderId) {
			const folder = await ctx.db.get(folderId);
			if (
				!folder ||
				folder.deletedAt !== undefined ||
				folder.workspaceId !== document.workspaceId ||
				!(await isFolderAuthorityActive(ctx, folderId))
			) {
				throw new Error("Folder not found");
			}
		}
		if (!member) {
			// Guest: destination must stay within a subtree they can write.
			if (!folderId) throw new Error("Unauthorized");
			const destRole = await folderRole(ctx, folderId);
			if (destRole !== "owner" && destRole !== "editor") {
				throw new Error("Unauthorized");
			}
		}
		await ctx.db.patch(documentId, {
			folderId,
			updatedAt: Date.now(),
		});
	},
});

type RelocationBoundary = {
	users: Array<{ userId: Id<"users">; role: DocumentRole }>;
	publicRole: DocumentRole | null;
	repoRoots: Array<{
		folderId: Id<"folders">;
		folderPath: string;
		repoName: string | null;
		repoRemoteUrl: string | null;
	}>;
};

const relocationRoleRank: Record<DocumentRole, number> = {
	viewer: 1,
	commenter: 2,
	editor: 3,
	owner: 4,
};

function strongerRelocationRole(
	current: DocumentRole | null | undefined,
	candidate: DocumentRole,
): DocumentRole {
	return !current || relocationRoleRank[candidate] > relocationRoleRank[current]
		? candidate
		: current;
}

async function relocationBoundary(
	ctx: MutationCtx,
	folderId: Id<"folders"> | undefined,
): Promise<RelocationBoundary> {
	const users = new Map<Id<"users">, DocumentRole>();
	const chain: Doc<"folders">[] = [];
	let publicRole: DocumentRole | null = null;
	let current = folderId;
	let depth = 0;
	while (current && depth < FOLDER_INHERITANCE_DEPTH_CAP) {
		const folderId = current;
		const folder = await ctx.db.get(folderId);
		if (!folder || folder.deletedAt !== undefined) break;
		chain.push(folder);
		for (const share of await ctx.db
			.query("folderShares")
			.withIndex("by_folder", (q) => q.eq("folderId", folderId))
			.take(256)) {
			if (share.userId) {
				users.set(
					share.userId,
					strongerRelocationRole(users.get(share.userId), share.role),
				);
			}
			if (share.linkScope === "public") {
				publicRole = strongerRelocationRole(publicRole, share.role);
			}
		}
		current = folder.parentId;
		depth++;
	}
	return {
		users: [...users]
			.map(([userId, role]) => ({ userId, role }))
			.sort((a, b) => a.userId.localeCompare(b.userId)),
		publicRole,
		repoRoots: chain
			.map((folder, index) => ({ folder, index }))
			.filter(({ folder }) => folder.repoName || folder.repoRemoteUrl)
			.map(({ folder, index }) => ({
				folderId: folder._id,
				folderPath: chain
					.slice(index)
					.reverse()
					.map((ancestor) => ancestor.name)
					.join("/"),
				repoName: folder.repoName ?? null,
				repoRemoteUrl: folder.repoRemoteUrl ?? null,
			}))
			.sort((a, b) => a.folderId.localeCompare(b.folderId)),
	};
}

function relocationFingerprint(
	source: RelocationBoundary,
	destination: RelocationBoundary,
): string {
	return JSON.stringify({ source, destination });
}

async function relocationImpact(
	ctx: MutationCtx,
	source: RelocationBoundary,
	destination: RelocationBoundary,
) {
	const sourceUsers = new Map(
		source.users.map(({ userId, role }) => [userId, role]),
	);
	const destinationUsers = new Map(
		destination.users.map(({ userId, role }) => [userId, role]),
	);
	const changedUserIds = [
		...new Set([...sourceUsers.keys(), ...destinationUsers.keys()]),
	]
		.filter(
			(userId) => sourceUsers.get(userId) !== destinationUsers.get(userId),
		)
		.sort((a, b) => a.localeCompare(b));
	// Counts stay exact, while identity details are capped to keep the mutation
	// response and the device-local review journal bounded.
	const detailedUserIds = changedUserIds.slice(0, 25);
	const userDetails = await Promise.all(
		detailedUserIds.map(async (userId) => ({
			userId,
			user: await ctx.db.get(userId),
		})),
	);
	const sourceRepos = new Map(
		source.repoRoots.map((repository) => [repository.folderId, repository]),
	);
	const destinationRepos = new Map(
		destination.repoRoots.map((repository) => [
			repository.folderId,
			repository,
		]),
	);
	const repositoryChanges = [
		...source.repoRoots
			.filter(({ folderId }) => !destinationRepos.has(folderId))
			.map((repository) => ({ change: "removed" as const, ...repository })),
		...destination.repoRoots
			.filter(({ folderId }) => !sourceRepos.has(folderId))
			.map((repository) => ({ change: "added" as const, ...repository })),
	];
	return {
		gainingUserCount: changedUserIds.filter(
			(userId) => !sourceUsers.has(userId) && destinationUsers.has(userId),
		).length,
		losingUserCount: changedUserIds.filter(
			(userId) => sourceUsers.has(userId) && !destinationUsers.has(userId),
		).length,
		publicAccessChanged: source.publicRole !== destination.publicRole,
		repoExposureChanged: repositoryChanges.length > 0,
		userChanges: userDetails.map(({ userId, user }) => ({
			userId,
			name: user?.name ?? null,
			email: user?.email ?? null,
			fromRole: sourceUsers.get(userId) ?? null,
			toRole: destinationUsers.get(userId) ?? null,
		})),
		userChangesTruncated: changedUserIds.length > detailedUserIds.length,
		publicAccessChange: {
			fromRole: source.publicRole,
			toRole: destination.publicRole,
		},
		repositoryChanges,
	};
}

export const prepareDocumentRelocation = mutation({
	args: {
		documentId: v.id("documents"),
		folderId: v.optional(v.id("folders")),
		title: v.string(),
		path: v.string(),
	},
	handler: async (ctx, args) => {
		await requireDocumentWrite(ctx, args.documentId);
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt !== undefined) {
			throw new Error("Document not found");
		}
		if (args.folderId) {
			const destination = await ctx.db.get(args.folderId);
			if (
				!destination ||
				destination.deletedAt !== undefined ||
				destination.workspaceId !== document.workspaceId ||
				!(await isFolderAuthorityActive(ctx, args.folderId))
			)
				throw new Error("Folder not found");
		}
		const member = await isWorkspaceMember(ctx, document.workspaceId);
		if (!member) {
			if (!args.folderId) throw new Error("Unauthorized");
			const role = await folderRole(ctx, args.folderId);
			if (role !== "owner" && role !== "editor")
				throw new Error("Unauthorized");
		}
		const source = await relocationBoundary(ctx, document.folderId);
		const destination = await relocationBoundary(ctx, args.folderId);
		const fingerprint = relocationFingerprint(source, destination);
		const impact = await relocationImpact(ctx, source, destination);
		if (
			impact.userChanges.length === 0 &&
			!impact.publicAccessChanged &&
			!impact.repoExposureChanged
		) {
			await ctx.db.patch(args.documentId, {
				folderId: args.folderId,
				title: args.title.trim() || "Untitled",
				path: args.path,
				updatedAt: Date.now(),
			});
			return { status: "completed" as const };
		}
		return {
			status: "confirmation-required" as const,
			fingerprint,
			impact,
		};
	},
});

export const confirmDocumentRelocation = mutation({
	args: {
		documentId: v.id("documents"),
		folderId: v.optional(v.id("folders")),
		title: v.string(),
		path: v.string(),
		fingerprint: v.string(),
	},
	handler: async (ctx, args) => {
		await requireDocumentWrite(ctx, args.documentId);
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt !== undefined) {
			throw new Error("Document not found");
		}
		if (args.folderId) {
			const destination = await ctx.db.get(args.folderId);
			if (
				!destination ||
				destination.deletedAt !== undefined ||
				destination.workspaceId !== document.workspaceId ||
				!(await isFolderAuthorityActive(ctx, args.folderId))
			)
				throw new Error("Folder not found");
		}
		const member = await isWorkspaceMember(ctx, document.workspaceId);
		if (!member) {
			if (!args.folderId) throw new Error("Unauthorized");
			const role = await folderRole(ctx, args.folderId);
			if (role !== "owner" && role !== "editor")
				throw new Error("Unauthorized");
		}

		const source = await relocationBoundary(ctx, document.folderId);
		const destination = await relocationBoundary(ctx, args.folderId);
		const fingerprint = relocationFingerprint(source, destination);
		const impact = await relocationImpact(ctx, source, destination);
		if (fingerprint !== args.fingerprint) {
			return {
				status: "confirmation-required" as const,
				fingerprint,
				impact,
			};
		}

		await ctx.db.patch(args.documentId, {
			folderId: args.folderId,
			title: args.title.trim() || "Untitled",
			path: args.path,
			updatedAt: Date.now(),
		});
		return { status: "completed" as const };
	},
});

// ---------------------------------------------------------------------------
// Mutations — folder sharing + repo-link metadata
// ---------------------------------------------------------------------------

async function ensureFolderShare(
	ctx: MutationCtx,
	args: {
		folderId: Id<"folders">;
		userId?: Id<"users">;
		linkScope?: "public";
		role: DocumentRole;
	},
) {
	const now = Date.now();
	const existing =
		args.userId !== undefined
			? await ctx.db
					.query("folderShares")
					.withIndex("by_folder_user", (q) =>
						q.eq("folderId", args.folderId).eq("userId", args.userId),
					)
					.unique()
			: args.linkScope !== undefined
				? await ctx.db
						.query("folderShares")
						.withIndex("by_folder_link", (q) =>
							q.eq("folderId", args.folderId).eq("linkScope", args.linkScope),
						)
						.unique()
				: null;
	if (existing) {
		await ctx.db.patch(existing._id, { role: args.role, updatedAt: now });
		return existing._id;
	}
	return ctx.db.insert("folderShares", {
		folderId: args.folderId,
		userId: args.userId,
		linkScope: args.linkScope,
		role: args.role,
		createdAt: now,
		updatedAt: now,
	});
}

export const setFolderUserShare = mutation({
	args: {
		folderId: v.id("folders"),
		userId: v.id("users"),
		role: documentRoleValidator,
	},
	handler: async (ctx, { folderId, userId, role }) => {
		const folder = await ctx.db.get(folderId);
		if (!folder) throw new Error("Folder not found");
		await requireFolderManage(ctx, folder);
		await ensureFolderShare(ctx, { folderId, userId, role });
	},
});

export const setFolderUserShareByEmail = mutation({
	args: {
		folderId: v.id("folders"),
		email: v.string(),
		role: documentRoleValidator,
	},
	handler: async (ctx, { folderId, email, role }) => {
		const folder = await ctx.db.get(folderId);
		if (!folder) throw new Error("Folder not found");
		await requireFolderManage(ctx, folder);
		const normalizedEmail = normalizeEmail(email);
		if (!normalizedEmail) throw new Error("Email is required");
		const existingUserId = await findUserIdByEmail(ctx, normalizedEmail);
		if (existingUserId) {
			await ensureFolderShare(ctx, { folderId, userId: existingUserId, role });
			return { status: "shared" as const, userId: existingUserId };
		}
		// No account yet: record a pending folder invite resolved at signup.
		const invitedBy = (await getAuthUserId(ctx)) ?? undefined;
		await upsertFolderInvite(ctx, {
			folderId,
			email: normalizedEmail,
			role,
			invitedBy,
		});
		return { status: "invited" as const, userId: null };
	},
});

export const removeFolderUserShare = mutation({
	args: {
		folderId: v.id("folders"),
		userId: v.id("users"),
	},
	handler: async (ctx, { folderId, userId }) => {
		const folder = await ctx.db.get(folderId);
		if (!folder) throw new Error("Folder not found");
		await requireFolderManage(ctx, folder);
		const existing = await ctx.db
			.query("folderShares")
			.withIndex("by_folder_user", (q) =>
				q.eq("folderId", folderId).eq("userId", userId),
			)
			.unique();
		if (existing) await ctx.db.delete(existing._id);
	},
});

export const setFolderLinkShare = mutation({
	args: {
		folderId: v.id("folders"),
		role: linkRoleValidator,
	},
	handler: async (ctx, { folderId, role }) => {
		const folder = await ctx.db.get(folderId);
		if (!folder) throw new Error("Folder not found");
		await requireFolderManage(ctx, folder);
		await ensureFolderShare(ctx, { folderId, linkScope: "public", role });
	},
});

export const clearFolderLinkShare = mutation({
	args: { folderId: v.id("folders") },
	handler: async (ctx, { folderId }) => {
		const folder = await ctx.db.get(folderId);
		if (!folder) throw new Error("Folder not found");
		await requireFolderManage(ctx, folder);
		const existing = await ctx.db
			.query("folderShares")
			.withIndex("by_folder_link", (q) =>
				q.eq("folderId", folderId).eq("linkScope", "public"),
			)
			.unique();
		if (existing) await ctx.db.delete(existing._id);
	},
});

export const setFolderRepoLink = mutation({
	args: {
		folderId: v.id("folders"),
		repoName: v.optional(v.string()),
		repoRemoteUrl: v.optional(v.string()),
	},
	handler: async (ctx, { folderId, repoName, repoRemoteUrl }) => {
		const folder = await ctx.db.get(folderId);
		if (!folder || folder.deletedAt !== undefined) {
			throw new Error("Folder not found");
		}
		// Display metadata only (D11) — any folder-editor may set it.
		await requireFolderWrite(ctx, folder);
		await ctx.db.patch(folderId, {
			repoName: repoName?.trim() || undefined,
			repoRemoteUrl: repoRemoteUrl?.trim() || undefined,
			updatedAt: Date.now(),
		});
	},
});
