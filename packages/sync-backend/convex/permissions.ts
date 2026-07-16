import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type DocumentRole = "owner" | "editor" | "commenter" | "viewer";
export type WorkspaceRole = "owner" | "admin" | "member";

type PermissionCtx = MutationCtx | QueryCtx;

const roleRank: Record<DocumentRole, number> = {
	viewer: 1,
	commenter: 2,
	editor: 3,
	owner: 4,
};

export function documentIdFromSyncId(syncId: string): Id<"documents"> | null {
	if (!syncId.startsWith("document:")) return null;
	return syncId.slice("document:".length) as Id<"documents">;
}

export function canCommentRole(role: DocumentRole | null): boolean {
	return role === "owner" || role === "editor" || role === "commenter";
}

export function canWriteRole(role: DocumentRole | null): boolean {
	return role === "owner" || role === "editor";
}

export async function workspaceRole(
	ctx: PermissionCtx,
	workspaceId: Id<"workspaces">,
): Promise<WorkspaceRole | null> {
	const workspace = await ctx.db.get(workspaceId);
	if (!workspace) return null;
	const userId = await getAuthUserId(ctx);
	if (!userId) {
		return workspace.ownerId === undefined ? "owner" : null;
	}
	if (workspace.ownerId === userId) return "owner";
	const membership = await ctx.db
		.query("members")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", workspaceId).eq("userId", userId),
		)
		.unique();
	return membership?.role ?? null;
}

export async function requireWorkspaceMember(
	ctx: PermissionCtx,
	workspaceId: Id<"workspaces">,
) {
	const role = await workspaceRole(ctx, workspaceId);
	if (!role) throw new Error("Unauthorized");
	return role;
}

// Depth cap for the folder-inheritance walk. Folder nesting this deep is not a
// real UX; the cap is a safety bound against pathological/cyclic parent chains
// on the authorize hot path (Convex has no request-local cache).
export const FOLDER_INHERITANCE_DEPTH_CAP = 64;

// Per-query memoization for the folder-role walk. Convex `ctx` has no
// request-local cache, so list-shaped queries that resolve many documents in
// the same subtree pass one shared cache to avoid re-walking ancestors.
export type FolderRoleCache = Map<Id<"folders">, DocumentRole | null>;

/**
 * Whether a folder is under an active authority root. Legacy folders omit the
 * field and are active. Checking every ancestor also protects direct document
 * IDs inside a staged or archived subtree.
 */
export async function isFolderAuthorityActive(
	ctx: PermissionCtx,
	folderId: Id<"folders">,
): Promise<boolean> {
	const seen = new Set<Id<"folders">>();
	let current: Id<"folders"> | undefined = folderId;
	let depth = 0;
	while (current && depth < FOLDER_INHERITANCE_DEPTH_CAP) {
		// Preserve the existing cycle-safe authorization behavior. A cycle is not
		// itself an inactive authority boundary; any staging/archive marker met
		// before the loop is still denied.
		if (seen.has(current)) return true;
		seen.add(current);
		const folder: Doc<"folders"> | null = await ctx.db.get(current);
		if (!folder) return false;
		if (
			folder.authorityState === "staging" ||
			folder.authorityState === "archivedToGit"
		) {
			return false;
		}
		current = folder.parentId;
		depth++;
	}
	return true;
}

export async function requireActiveFolder(
	ctx: PermissionCtx,
	folderId: Id<"folders">,
): Promise<void> {
	if (!(await isFolderAuthorityActive(ctx, folderId))) {
		throw new Error("Unauthorized");
	}
}

function combineRole(
	current: DocumentRole | null,
	candidate: DocumentRole | null | undefined,
): DocumentRole | null {
	if (!candidate) return current;
	if (current === null || roleRank[candidate] > roleRank[current]) {
		return candidate;
	}
	return current;
}

// Role-max across a SINGLE folder's own share rows for the current identity:
// the user's direct folder share plus any public link share. No ancestor walk.
async function ownFolderShareRole(
	ctx: PermissionCtx,
	folderId: Id<"folders">,
	userId: Id<"users"> | null,
): Promise<DocumentRole | null> {
	const publicShare = await ctx.db
		.query("folderShares")
		.withIndex("by_folder_link", (q) =>
			q.eq("folderId", folderId).eq("linkScope", "public"),
		)
		.unique();
	if (!userId) return publicShare?.role ?? null;
	const userShare = await ctx.db
		.query("folderShares")
		.withIndex("by_folder_user", (q) =>
			q.eq("folderId", folderId).eq("userId", userId),
		)
		.unique();
	return combineRole(publicShare?.role ?? null, userShare?.role);
}

// Drive-style subtree resolution (D12): walk the folder's `parentId` ancestors
// and take the role-max of every folderShares row that applies to the current
// identity. Additive only — inherited access is never subtracted. Cycle guard +
// depth cap keep the authorize hot path bounded.
export async function folderRole(
	ctx: PermissionCtx,
	folderId: Id<"folders">,
	options: { cache?: FolderRoleCache } = {},
): Promise<DocumentRole | null> {
	if (!(await isFolderAuthorityActive(ctx, folderId))) return null;
	const cache = options.cache;
	if (cache?.has(folderId)) return cache.get(folderId) ?? null;

	const userId = await getAuthUserId(ctx);
	let role: DocumentRole | null = null;
	const seen = new Set<Id<"folders">>();
	let current: Id<"folders"> | undefined = folderId;
	let depth = 0;

	while (current && depth < FOLDER_INHERITANCE_DEPTH_CAP) {
		if (seen.has(current)) break; // cycle guard
		seen.add(current);
		// A cached ancestor already carries the role-max up its own chain.
		if (cache?.has(current)) {
			role = combineRole(role, cache.get(current) ?? null);
			break;
		}
		const folder: Doc<"folders"> | null = await ctx.db.get(current);
		if (!folder) break;
		role = combineRole(role, await ownFolderShareRole(ctx, current, userId));
		current = folder.parentId;
		depth++;
	}

	cache?.set(folderId, role);
	return role;
}

export async function documentRole(
	ctx: PermissionCtx,
	documentId: Id<"documents">,
	options: { includeDeleted?: boolean; folderCache?: FolderRoleCache } = {},
): Promise<DocumentRole | null> {
	const document = await ctx.db.get(documentId);
	if (
		!document ||
		(document.deletedAt !== undefined && !options.includeDeleted)
	) {
		return null;
	}
	if (
		document.folderId &&
		!(await isFolderAuthorityActive(ctx, document.folderId))
	) {
		return null;
	}

	const workspace = await ctx.db.get(document.workspaceId);
	const userId = await getAuthUserId(ctx);
	const publicShare = await ctx.db
		.query("docShares")
		.withIndex("by_document_link", (q) =>
			q.eq("documentId", documentId).eq("linkScope", "public"),
		)
		.unique();

	// Inherited folder access (D12) is additive and applies to every identity,
	// including anonymous public-folder-link visitors.
	const inheritedFolderRole = document.folderId
		? await folderRole(ctx, document.folderId, { cache: options.folderCache })
		: null;

	if (!userId) {
		// Anonymous access is preserved for legacy/test workspaces created before
		// production auth. Real shared docs require an explicit public link share.
		if (workspace?.ownerId === undefined) return "editor";
		return combineRole(publicShare?.role ?? null, inheritedFolderRole);
	}

	let role: DocumentRole | null = null;
	const setRole = (candidate: DocumentRole | undefined) => {
		if (!candidate) return;
		if (role === null || roleRank[candidate] > roleRank[role]) {
			role = candidate;
		}
	};

	if (workspace?.ownerId === userId) setRole("owner");

	const [userShare, membership, workspaceShare] = await Promise.all([
		ctx.db
			.query("docShares")
			.withIndex("by_document_user", (q) =>
				q.eq("documentId", documentId).eq("userId", userId),
			)
			.unique(),
		ctx.db
			.query("members")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", document.workspaceId).eq("userId", userId),
			)
			.unique(),
		ctx.db
			.query("docShares")
			.withIndex("by_document_link", (q) =>
				q.eq("documentId", documentId).eq("linkScope", "workspace"),
			)
			.unique(),
	]);

	setRole(userShare?.role);
	if (membership?.role === "owner" || membership?.role === "admin") {
		setRole("owner");
	} else if (membership?.role === "member") {
		setRole("editor");
	}
	if (membership && workspaceShare) {
		setRole(workspaceShare.role);
	}
	setRole(publicShare?.role);
	setRole(inheritedFolderRole ?? undefined);

	return role;
}

export async function requireDocumentRole(
	ctx: PermissionCtx,
	documentId: Id<"documents">,
	allowed: DocumentRole[],
): Promise<DocumentRole> {
	const role = await documentRole(ctx, documentId);
	if (!role || !allowed.includes(role)) {
		throw new Error("Unauthorized");
	}
	return role;
}

export async function requireDocumentRead(
	ctx: PermissionCtx,
	documentId: Id<"documents">,
	options?: { includeDeleted?: boolean },
) {
	const role = await documentRole(ctx, documentId, options);
	if (!role) throw new Error("Unauthorized");
}

export async function requireDocumentComment(
	ctx: PermissionCtx,
	documentId: Id<"documents">,
) {
	const role = await documentRole(ctx, documentId);
	if (!canCommentRole(role)) throw new Error("Unauthorized");
}

export async function requireDocumentWrite(
	ctx: PermissionCtx,
	documentId: Id<"documents">,
	options?: { includeDeleted?: boolean },
) {
	const role = await documentRole(ctx, documentId, options);
	if (!canWriteRole(role)) throw new Error("Unauthorized");
}

export async function requireDocumentOwner(
	ctx: PermissionCtx,
	documentId: Id<"documents">,
) {
	await requireDocumentRole(ctx, documentId, ["owner"]);
}
