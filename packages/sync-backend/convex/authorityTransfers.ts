import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { currentActorName } from "./authIdentity";
import {
	assertLiveDocumentMarkdownWithinCap,
	projectDocumentMarkdownForAuthority,
	replaceLiveDocumentMarkdown,
} from "./documents";
import { collectFolderSubtree, folderRelativePath } from "./folders";
import {
	applyFolderShareRole,
	findUserIdByEmail,
	normalizeEmail,
	upsertFolderInvite,
} from "./members";
import {
	folderRole,
	isFolderAuthorityActive,
	requireWorkspaceMember,
	workspaceRole,
} from "./permissions";

const MAX_BATCH_ITEMS = 16;
const MAX_BATCH_BYTES = 512 * 1024;
const MAX_MANIFEST_ITEMS = 2_048;
const MAX_REQUESTED_SHARES = 20;

const requestedShareValidator = v.object({
	email: v.string(),
	role: v.union(
		v.literal("editor"),
		v.literal("commenter"),
		v.literal("viewer"),
	),
});

type RequestedShare = {
	email: string;
	role: "editor" | "commenter" | "viewer";
};

const stagedItemValidator = v.union(
	v.object({
		kind: v.literal("markdown"),
		relativePath: v.string(),
		contentHash: v.string(),
		size: v.number(),
		markdown: v.string(),
		title: v.optional(v.string()),
	}),
	v.object({
		kind: v.literal("asset"),
		relativePath: v.string(),
		contentHash: v.string(),
		size: v.number(),
		storageId: v.id("_storage"),
	}),
);

type AuthorityCtx = MutationCtx | QueryCtx;

function canonicalPath(value: string): string {
	const normalized = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	const parts = normalized.split("/");
	if (
		!normalized ||
		parts.some(
			(part) => !part || part === "." || part === ".." || part.includes("\0"),
		)
	) {
		throw new Error("Invalid authority item path");
	}
	return parts.join("/");
}

function normalizedRootName(value: string): string {
	const name = value.trim();
	if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
		throw new Error("Invalid destination folder name");
	}
	return name;
}

async function sha256(value: string | ArrayBuffer): Promise<string> {
	const data =
		typeof value === "string" ? new TextEncoder().encode(value) : value;
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

async function currentAudience(
	ctx: AuthorityCtx,
	workspaceId: Id<"workspaces">,
	requestedShares: RequestedShare[] = [],
) {
	if (requestedShares.length > MAX_REQUESTED_SHARES) {
		throw new Error(
			`Share supports at most ${MAX_REQUESTED_SHARES} recipients`,
		);
	}
	const canonicalRequestedShares = [
		...new Map(
			requestedShares.map((share) => {
				const email = normalizeEmail(share.email);
				if (!email) throw new Error("Share recipient email is required");
				return [email, { email, role: share.role }] as const;
			}),
		).values(),
	].sort((left, right) => left.email.localeCompare(right.email));
	const workspace = await ctx.db.get(workspaceId);
	if (!workspace) throw new Error("Workspace not found");
	const members = await ctx.db
		.query("members")
		.withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
		.collect();
	const invites = await ctx.db
		.query("invites")
		.withIndex("by_workspace_email", (query) =>
			query.eq("workspaceId", workspaceId),
		)
		.collect();
	const memberAudience = await Promise.all(
		members.map(async (member) => {
			const user = await ctx.db.get(member.userId);
			return {
				kind: "member" as const,
				id: member.userId as string,
				email: user?.email ?? null,
				name: user?.name ?? null,
				role: member.role,
			};
		}),
	);
	if (
		workspace.ownerId &&
		!members.some((member) => member.userId === workspace.ownerId)
	) {
		const owner = await ctx.db.get(workspace.ownerId);
		memberAudience.push({
			kind: "member",
			id: workspace.ownerId,
			email: owner?.email ?? null,
			name: owner?.name ?? null,
			role: "owner",
		});
	}
	const requestedAudience = await Promise.all(
		canonicalRequestedShares.map(async (share) => {
			const userId = await findUserIdByEmail(ctx, share.email);
			const user = userId ? await ctx.db.get(userId) : null;
			return {
				kind: userId ? ("folderShare" as const) : ("invite" as const),
				id: userId ?? `requested:${share.email}`,
				email: share.email,
				name: user?.name ?? null,
				role: share.role,
			};
		}),
	);
	const audience = [
		...memberAudience,
		...invites.map((invite) => ({
			kind: "invite" as const,
			id: invite._id as string,
			email: invite.email,
			name: null,
			role: invite.workspaceRole ?? "member",
		})),
		...requestedAudience,
	].sort((left, right) =>
		`${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`),
	);
	return {
		audience,
		requestedShares: canonicalRequestedShares,
		fingerprint: await sha256(
			JSON.stringify(
				audience.map(({ kind, id, email, role }) => ({
					kind,
					id,
					email,
					role,
				})),
			),
		),
	};
}

async function operationFingerprint(args: {
	manifestHash: string;
	sourceFingerprint: string;
	destinationFingerprint: string;
	audienceFingerprint: string;
	workspaceId: Id<"workspaces">;
	parentFolderId?: Id<"folders">;
	rootName: string;
}) {
	return sha256(
		JSON.stringify({
			manifestHash: args.manifestHash,
			sourceFingerprint: args.sourceFingerprint,
			destinationFingerprint: args.destinationFingerprint,
			audienceFingerprint: args.audienceFingerprint,
			workspaceId: args.workspaceId,
			parentFolderId: args.parentFolderId ?? null,
			rootName: args.rootName,
		}),
	);
}

async function requireTransferOwner(
	ctx: AuthorityCtx,
	transferId: Id<"authorityTransfers">,
): Promise<Doc<"authorityTransfers">> {
	const ownerId = await getAuthUserId(ctx);
	const transfer = await ctx.db.get(transferId);
	if (!ownerId || !transfer || transfer.ownerId !== ownerId) {
		throw new Error("Unauthorized");
	}
	return transfer;
}

async function assertDestinationAvailable(
	ctx: AuthorityCtx,
	args: {
		workspaceId: Id<"workspaces">;
		parentFolderId?: Id<"folders">;
		rootName: string;
		exceptFolderId?: Id<"folders">;
	},
) {
	if (args.parentFolderId) {
		const parent = await ctx.db.get(args.parentFolderId);
		if (
			!parent ||
			parent.workspaceId !== args.workspaceId ||
			parent.deletedAt !== undefined ||
			!(await isFolderAuthorityActive(ctx, parent._id))
		) {
			throw new Error("Destination folder is unavailable");
		}
	}
	const siblings = await ctx.db
		.query("folders")
		.withIndex("by_workspace_parent", (query) =>
			query
				.eq("workspaceId", args.workspaceId)
				.eq("parentId", args.parentFolderId),
		)
		.collect();
	if (
		siblings.some(
			(folder) =>
				folder._id !== args.exceptFolderId &&
				folder.deletedAt === undefined &&
				folder.authorityState !== "staging" &&
				folder.authorityState !== "archivedToGit" &&
				folder.name.localeCompare(args.rootName, undefined, {
					sensitivity: "accent",
				}) === 0,
		)
	) {
		throw new Error(
			"A folder with that name already exists at the destination",
		);
	}
}

export const prepareGitFolderMove = mutation({
	args: {
		operationKey: v.string(),
		workspaceId: v.id("workspaces"),
		parentFolderId: v.optional(v.id("folders")),
		rootName: v.string(),
		manifestHash: v.string(),
		manifestItemCount: v.number(),
		manifestMarkdownCount: v.number(),
		manifestAssetCount: v.number(),
		manifestTotalBytes: v.number(),
		sourceFingerprint: v.string(),
		destinationFingerprint: v.string(),
		expectedAudienceFingerprint: v.string(),
		requestedShares: v.optional(v.array(requestedShareValidator)),
	},
	handler: async (ctx, args) => {
		const ownerId = await getAuthUserId(ctx);
		if (!ownerId) throw new Error("Unauthorized");
		await requireWorkspaceMember(ctx, args.workspaceId);
		const rootName = normalizedRootName(args.rootName);
		const operationKey = args.operationKey.trim();
		if (!operationKey) throw new Error("Operation key is required");
		if (
			!Number.isSafeInteger(args.manifestItemCount) ||
			args.manifestItemCount < 1 ||
			args.manifestItemCount > MAX_MANIFEST_ITEMS ||
			args.manifestMarkdownCount < 1 ||
			args.manifestMarkdownCount + args.manifestAssetCount !==
				args.manifestItemCount ||
			args.manifestTotalBytes < 0
		) {
			throw new Error("Invalid manifest summary");
		}
		await assertDestinationAvailable(ctx, { ...args, rootName });
		const audience = await currentAudience(
			ctx,
			args.workspaceId,
			args.requestedShares,
		);
		if (audience.fingerprint !== args.expectedAudienceFingerprint) {
			throw new Error("Authority move audience changed; refresh the preview");
		}
		const fingerprint = await operationFingerprint({
			...args,
			rootName,
			audienceFingerprint: audience.fingerprint,
		});
		const existing = await ctx.db
			.query("authorityTransfers")
			.withIndex("by_owner_and_operation_key", (query) =>
				query.eq("ownerId", ownerId).eq("operationKey", operationKey),
			)
			.unique();
		if (existing) {
			if (existing.operationFingerprint !== fingerprint) {
				throw new Error("Operation key already belongs to a different preview");
			}
			return {
				transferId: existing._id,
				rootFolderId: existing.rootFolderId,
				operationFingerprint: fingerprint,
				audience: audience.audience,
				state: existing.state,
			};
		}
		const now = Date.now();
		const transferId = await ctx.db.insert("authorityTransfers", {
			operationKey,
			ownerId,
			direction: "gitToCloud",
			workspaceId: args.workspaceId,
			parentFolderId: args.parentFolderId,
			state: "prepared",
			manifestHash: args.manifestHash,
			manifestItemCount: args.manifestItemCount,
			manifestMarkdownCount: args.manifestMarkdownCount,
			manifestAssetCount: args.manifestAssetCount,
			manifestTotalBytes: args.manifestTotalBytes,
			stagedItemCount: 0,
			sourceFingerprint: args.sourceFingerprint,
			destinationFingerprint: args.destinationFingerprint,
			audienceFingerprint: audience.fingerprint,
			requestedShares: audience.requestedShares,
			operationFingerprint: fingerprint,
			recoveryState: "source",
			createdAt: now,
			updatedAt: now,
		});
		const rootFolderId = await ctx.db.insert("folders", {
			workspaceId: args.workspaceId,
			parentId: args.parentFolderId,
			name: rootName,
			createdBy: await currentActorName(ctx),
			createdAt: now,
			updatedAt: now,
			authorityState: "staging",
			authorityTransferId: transferId,
			authorityStagingPath: "",
		});
		await ctx.db.patch(transferId, { rootFolderId });
		return {
			transferId,
			rootFolderId,
			operationFingerprint: fingerprint,
			audience: audience.audience,
			state: "prepared" as const,
		};
	},
});

export const getGitFolderMoveAudience = query({
	args: {
		workspaceId: v.id("workspaces"),
		parentFolderId: v.optional(v.id("folders")),
		rootName: v.string(),
		requestedShares: v.optional(v.array(requestedShareValidator)),
	},
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);
		const rootName = normalizedRootName(args.rootName);
		await assertDestinationAvailable(ctx, { ...args, rootName });
		return currentAudience(ctx, args.workspaceId, args.requestedShares);
	},
});

async function ensureFolderPath(
	ctx: MutationCtx,
	transfer: Doc<"authorityTransfers">,
	folderPath: string,
): Promise<Id<"folders">> {
	if (!transfer.rootFolderId) throw new Error("Transfer has no staging root");
	if (!folderPath) return transfer.rootFolderId;
	let parentId = transfer.rootFolderId;
	const segments = folderPath.split("/");
	for (let index = 0; index < segments.length; index++) {
		const path = segments.slice(0, index + 1).join("/");
		const existing = await ctx.db
			.query("folders")
			.withIndex("by_authority_transfer_and_staging_path", (query) =>
				query
					.eq("authorityTransferId", transfer._id)
					.eq("authorityStagingPath", path),
			)
			.unique();
		if (existing) {
			parentId = existing._id;
			continue;
		}
		const now = Date.now();
		parentId = await ctx.db.insert("folders", {
			workspaceId: transfer.workspaceId,
			parentId,
			name: segments[index] ?? path,
			createdAt: now,
			updatedAt: now,
			authorityTransferId: transfer._id,
			authorityStagingPath: path,
		});
	}
	return parentId;
}

export const stageAuthorityFolderBatch = mutation({
	args: {
		transferId: v.id("authorityTransfers"),
		items: v.array(stagedItemValidator),
	},
	handler: async (ctx, { transferId, items }) => {
		const transfer = await requireTransferOwner(ctx, transferId);
		if (!["prepared", "staging"].includes(transfer.state)) {
			throw new Error("Transfer is not accepting staged items");
		}
		if (items.length < 1 || items.length > MAX_BATCH_ITEMS) {
			throw new Error(`Stage batches must contain 1-${MAX_BATCH_ITEMS} items`);
		}
		if (
			items.reduce(
				(total, item) => total + (item.kind === "markdown" ? item.size : 0),
				0,
			) > MAX_BATCH_BYTES
		) {
			throw new Error("Stage batch exceeds the byte limit");
		}
		const root = transfer.rootFolderId
			? await ctx.db.get(transfer.rootFolderId)
			: null;
		if (!root || root.authorityState !== "staging") {
			throw new Error("Transfer staging root is unavailable");
		}
		let created = 0;
		for (const rawItem of items) {
			const relativePath = canonicalPath(rawItem.relativePath);
			if (!Number.isSafeInteger(rawItem.size) || rawItem.size < 0) {
				throw new Error("Invalid authority item size");
			}
			const existing = await ctx.db
				.query("authorityTransferItems")
				.withIndex("by_transfer_and_relative_path", (query) =>
					query.eq("transferId", transferId).eq("relativePath", relativePath),
				)
				.unique();
			if (existing) {
				if (
					existing.kind !== rawItem.kind ||
					existing.contentHash !== rawItem.contentHash ||
					existing.size !== rawItem.size
				) {
					throw new Error(`Staged item changed: ${relativePath}`);
				}
				continue;
			}
			const segments = relativePath.split("/");
			const fileName = segments.pop() ?? relativePath;
			const folderId = await ensureFolderPath(
				ctx,
				transfer,
				segments.join("/"),
			);
			const now = Date.now();
			let stagedDocumentId: Id<"documents"> | undefined;
			let stagedAssetId: Id<"assets"> | undefined;
			if (rawItem.kind === "markdown") {
				assertLiveDocumentMarkdownWithinCap(rawItem.markdown);
				const bytes = new TextEncoder().encode(rawItem.markdown);
				if (
					bytes.byteLength !== rawItem.size ||
					(await sha256(bytes.buffer)) !== rawItem.contentHash
				) {
					throw new Error(
						`Markdown bytes do not match the manifest: ${relativePath}`,
					);
				}
				stagedDocumentId = await ctx.db.insert("documents", {
					workspaceId: transfer.workspaceId,
					folderId,
					title: rawItem.title?.trim() || fileName.replace(/\.md$/i, ""),
					path: `${root.name}/${relativePath}`,
					importKey: `authority:${transferId}:${relativePath}`,
					createdAt: now,
					updatedAt: now,
				});
				await replaceLiveDocumentMarkdown(
					ctx,
					stagedDocumentId,
					rawItem.markdown,
				);
			} else {
				const metadata = await ctx.db.system.get("_storage", rawItem.storageId);
				if (
					!metadata ||
					metadata.size !== rawItem.size ||
					metadata.sha256 !== rawItem.contentHash
				) {
					throw new Error(
						`Asset bytes do not match the manifest: ${relativePath}`,
					);
				}
				stagedAssetId = await ctx.db.insert("assets", {
					workspaceId: transfer.workspaceId,
					path: `${root.name}/${relativePath}`,
					storageId: rawItem.storageId,
					contentHash: rawItem.contentHash,
					updatedAt: now,
					deviceId: `authority:${transferId}`,
					deleted: false,
					authorityRootId: transfer.rootFolderId,
				});
			}
			await ctx.db.insert("authorityTransferItems", {
				transferId,
				relativePath,
				kind: rawItem.kind,
				contentHash: rawItem.contentHash,
				size: rawItem.size,
				stagedDocumentId,
				stagedAssetId,
				verified: true,
				createdAt: now,
				updatedAt: now,
			});
			created++;
		}
		await ctx.db.patch(transferId, {
			state: "staging",
			stagedItemCount: transfer.stagedItemCount + created,
			updatedAt: Date.now(),
		});
		return {
			created,
			stagedItemCount: transfer.stagedItemCount + created,
			expectedItemCount: transfer.manifestItemCount,
		};
	},
});

export const verifyAuthorityStaging = mutation({
	args: {
		transferId: v.id("authorityTransfers"),
		manifestHash: v.string(),
	},
	handler: async (ctx, { transferId, manifestHash }) => {
		const transfer = await requireTransferOwner(ctx, transferId);
		if (transfer.manifestHash !== manifestHash) {
			throw new Error("Manifest changed before verification");
		}
		if (transfer.state === "verified" && transfer.cutoverToken !== undefined) {
			return { cutoverToken: transfer.cutoverToken };
		}
		if (transfer.state !== "staging") {
			throw new Error("Transfer is not ready for verification");
		}
		const items = await ctx.db
			.query("authorityTransferItems")
			.withIndex("by_transfer", (query) => query.eq("transferId", transferId))
			.take(transfer.manifestItemCount + 1);
		const markdownCount = items.filter(
			(item) => item.kind === "markdown",
		).length;
		const assetCount = items.filter((item) => item.kind === "asset").length;
		const totalBytes = items.reduce((total, item) => total + item.size, 0);
		if (
			items.length !== transfer.manifestItemCount ||
			items.some((item) => !item.verified) ||
			markdownCount !== transfer.manifestMarkdownCount ||
			assetCount !== transfer.manifestAssetCount ||
			totalBytes !== transfer.manifestTotalBytes
		) {
			throw new Error("Staging is incomplete or does not match the manifest");
		}
		const itemFingerprint = items
			.map(
				(item) =>
					`${item.relativePath}:${item.kind}:${item.contentHash}:${item.size}`,
			)
			.sort()
			.join("\n");
		const cutoverToken = await sha256(
			`${transfer.operationFingerprint}\n${itemFingerprint}`,
		);
		await ctx.db.patch(transferId, {
			state: "verified",
			cutoverToken,
			updatedAt: Date.now(),
		});
		return { cutoverToken };
	},
});

export const getAuthorityTransferStatus = query({
	args: { transferId: v.id("authorityTransfers") },
	handler: async (ctx, { transferId }) => {
		const transfer = await requireTransferOwner(ctx, transferId);
		const items = await ctx.db
			.query("authorityTransferItems")
			.withIndex("by_transfer", (candidate) =>
				candidate.eq("transferId", transferId),
			)
			.take(MAX_MANIFEST_ITEMS + 1);
		return {
			state: transfer.state,
			rootFolderId: transfer.rootFolderId,
			cutoverToken: transfer.cutoverToken,
			items: items.map((item) => ({
				relativePath: item.relativePath,
				kind: item.kind,
				contentHash: item.contentHash,
				size: item.size,
				verified: item.verified,
			})),
		};
	},
});

export const cancelAuthorityTransferBatch = mutation({
	args: { transferId: v.id("authorityTransfers") },
	handler: async (ctx, { transferId }) => {
		const transfer = await requireTransferOwner(ctx, transferId);
		if (transfer.state === "active") {
			throw new Error("An active authority transfer cannot be cancelled");
		}
		if (transfer.state === "cancelled") return { done: true, removed: 0 };
		const items = await ctx.db
			.query("authorityTransferItems")
			.withIndex("by_transfer", (candidate) =>
				candidate.eq("transferId", transferId),
			)
			.take(MAX_BATCH_ITEMS + 1);
		if (items.length > 0) {
			const batch = items.slice(0, MAX_BATCH_ITEMS);
			for (const item of batch) {
				if (item.stagedDocumentId) {
					await ctx.runMutation(components.prosemirrorSync.lib.deleteDocument, {
						id: `document:${item.stagedDocumentId}`,
					});
					await ctx.db.delete(item.stagedDocumentId);
				}
				if (item.stagedAssetId) {
					const asset = await ctx.db.get(item.stagedAssetId);
					if (asset) await ctx.storage.delete(asset.storageId);
					await ctx.db.delete(item.stagedAssetId);
				}
				await ctx.db.delete(item._id);
			}
			return { done: false, removed: batch.length };
		}
		const folders = await ctx.db
			.query("folders")
			.withIndex("by_authority_transfer_and_staging_path", (candidate) =>
				candidate.eq("authorityTransferId", transferId),
			)
			.take(MAX_BATCH_ITEMS + 1);
		if (folders.length > 0) {
			const batch = folders.slice(0, MAX_BATCH_ITEMS);
			for (const folder of batch) await ctx.db.delete(folder._id);
			return { done: false, removed: batch.length };
		}
		await ctx.db.patch(transferId, {
			state: "cancelled",
			updatedAt: Date.now(),
		});
		return { done: true, removed: 0 };
	},
});

async function applyRequestedFolderShares(
	ctx: MutationCtx,
	folderId: Id<"folders">,
	shares: RequestedShare[],
	invitedBy: Id<"users">,
) {
	for (const share of shares) {
		const userId = await findUserIdByEmail(ctx, share.email);
		if (!userId) {
			await upsertFolderInvite(ctx, {
				folderId,
				email: share.email,
				role: share.role,
				invitedBy,
			});
			continue;
		}
		await applyFolderShareRole(ctx, {
			folderId,
			userId,
			role: share.role,
		});
	}
}

export const activateAuthorityFolder = mutation({
	args: {
		transferId: v.id("authorityTransfers"),
		cutoverToken: v.string(),
		sourceFingerprint: v.string(),
		destinationFingerprint: v.string(),
	},
	handler: async (ctx, args) => {
		const transfer = await requireTransferOwner(ctx, args.transferId);
		if (transfer.state === "active") {
			return { rootFolderId: transfer.rootFolderId, state: "active" as const };
		}
		if (
			transfer.state !== "verified" ||
			!transfer.rootFolderId ||
			transfer.cutoverToken !== args.cutoverToken
		) {
			throw new Error("Transfer is not verified for this cutover token");
		}
		await requireWorkspaceMember(ctx, transfer.workspaceId);
		const role = await workspaceRole(ctx, transfer.workspaceId);
		if (!role) throw new Error("Unauthorized");
		const root = await ctx.db.get(transfer.rootFolderId);
		if (!root || root.authorityState !== "staging") {
			throw new Error("Staging root is unavailable");
		}
		await assertDestinationAvailable(ctx, {
			workspaceId: transfer.workspaceId,
			parentFolderId: transfer.parentFolderId,
			rootName: root.name,
			exceptFolderId: root._id,
		});
		const audience = await currentAudience(
			ctx,
			transfer.workspaceId,
			transfer.requestedShares,
		);
		const fingerprint = await operationFingerprint({
			manifestHash: transfer.manifestHash,
			sourceFingerprint: args.sourceFingerprint,
			destinationFingerprint: args.destinationFingerprint,
			audienceFingerprint: audience.fingerprint,
			workspaceId: transfer.workspaceId,
			parentFolderId: transfer.parentFolderId,
			rootName: root.name,
		});
		if (
			args.sourceFingerprint !== transfer.sourceFingerprint ||
			args.destinationFingerprint !== transfer.destinationFingerprint ||
			fingerprint !== transfer.operationFingerprint
		) {
			throw new Error("Authority move preview is stale");
		}
		await applyRequestedFolderShares(
			ctx,
			root._id,
			audience.requestedShares,
			transfer.ownerId,
		);
		const now = Date.now();
		await ctx.db.patch(root._id, {
			authorityState: "active",
			updatedAt: now,
		});
		await ctx.db.patch(transfer._id, {
			state: "active",
			recoveryState: "retained",
			updatedAt: now,
		});
		return { rootFolderId: root._id, state: "active" as const };
	},
});

type CloudExportItem =
	| {
			kind: "markdown";
			relativePath: string;
			contentHash: string;
			size: number;
			documentId: Id<"documents">;
			markdown: string;
	  }
	| {
			kind: "asset";
			relativePath: string;
			contentHash: string;
			size: number;
			storageId: Id<"_storage">;
	  };

type ExcludedCloudAuthorityRoot = {
	folderId: Id<"folders">;
	name: string;
	relativePath: string;
	authority: "git";
};

async function excludedCloudAuthorityRoots(
	ctx: AuthorityCtx,
	root: Doc<"folders">,
): Promise<ExcludedCloudAuthorityRoot[]> {
	const folders = await ctx.db
		.query("folders")
		.withIndex("by_workspace", (query) =>
			query.eq("workspaceId", root.workspaceId),
		)
		.collect();
	const children = new Map<string, Array<Doc<"folders">>>();
	for (const folder of folders) {
		if (folder.deletedAt !== undefined) continue;
		const siblings = children.get(folder.parentId ?? "") ?? [];
		siblings.push(folder);
		children.set(folder.parentId ?? "", siblings);
	}
	const excluded: ExcludedCloudAuthorityRoot[] = [];
	const queue: Array<{ folderId: Id<"folders">; path: string }> = [
		{ folderId: root._id, path: "" },
	];
	const seen = new Set<Id<"folders">>();
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || seen.has(current.folderId)) continue;
		seen.add(current.folderId);
		for (const child of children.get(current.folderId) ?? []) {
			const relativePath = canonicalPath(
				[current.path, child.name].filter(Boolean).join("/"),
			);
			if (child.authorityState === "archivedToGit") {
				excluded.push({
					folderId: child._id,
					name: child.name,
					relativePath,
					authority: "git",
				});
				continue;
			}
			if (child.authorityState === "staging") {
				throw new Error("Cloud folder contains an authority move in progress");
			}
			queue.push({ folderId: child._id, path: relativePath });
		}
	}
	return excluded.sort((left, right) =>
		left.relativePath.localeCompare(right.relativePath),
	);
}

async function hasCloudMoveManagePermission(
	ctx: AuthorityCtx,
	root: Doc<"folders">,
): Promise<boolean> {
	const role = await workspaceRole(ctx, root.workspaceId);
	if (role === "owner" || role === "admin") return true;
	const userId = await getAuthUserId(ctx);
	if (!userId) return false;
	const seen = new Set<Id<"folders">>();
	let current: Id<"folders"> | undefined = root._id;
	for (let depth = 0; current && depth < 64; depth++) {
		if (seen.has(current)) break;
		seen.add(current);
		const share = await ctx.db
			.query("folderShares")
			.withIndex("by_folder_user", (query) =>
				query.eq("folderId", current as Id<"folders">).eq("userId", userId),
			)
			.unique();
		if (share?.role === "owner") return true;
		const folder: Doc<"folders"> | null = await ctx.db.get(current);
		current = folder?.parentId;
	}
	return false;
}

async function requireCloudMoveManage(
	ctx: AuthorityCtx,
	folderId: Id<"folders">,
	options: { allowArchived?: boolean } = {},
): Promise<Doc<"folders">> {
	const root = await ctx.db.get(folderId);
	if (
		!root ||
		root.deletedAt !== undefined ||
		(!options.allowArchived && !(await isFolderAuthorityActive(ctx, folderId)))
	) {
		throw new Error("Folder not found");
	}
	if (!(await hasCloudMoveManagePermission(ctx, root))) {
		throw new Error("Unauthorized");
	}
	return root;
}

async function requireCloudExportRead(
	ctx: AuthorityCtx,
	folderId: Id<"folders">,
): Promise<Doc<"folders">> {
	const root = await ctx.db.get(folderId);
	if (
		!root ||
		root.deletedAt !== undefined ||
		!(await isFolderAuthorityActive(ctx, folderId))
	) {
		throw new Error("Folder not found");
	}
	if (
		!(await workspaceRole(ctx, root.workspaceId)) &&
		!(await folderRole(ctx, folderId))
	) {
		throw new Error("Unauthorized");
	}
	return root;
}

function exportDocumentFileName(document: Doc<"documents">): string {
	const candidate = document.path
		?.replace(/\\/g, "/")
		.split("/")
		.filter(Boolean)
		.pop();
	if (candidate && /\.(?:md|markdown|mdown)$/i.test(candidate)) {
		return candidate;
	}
	const title = document.title.trim().replace(/[\\/\0]/g, "-") || "Untitled";
	return `${title}.md`;
}

async function cloudFolderAudience(ctx: AuthorityCtx, root: Doc<"folders">) {
	const workspaceAudience = await currentAudience(ctx, root.workspaceId);
	const entries: Array<{
		kind: "member" | "invite" | "folderShare";
		id: string;
		email: string | null;
		name: string | null;
		role: string;
	}> = [...workspaceAudience.audience];
	let publicLinkRole: string | null = null;
	const seen = new Set<Id<"folders">>();
	let current: Id<"folders"> | undefined = root._id;
	for (let depth = 0; current && depth < 64; depth++) {
		if (seen.has(current)) break;
		seen.add(current);
		const shares = await ctx.db
			.query("folderShares")
			.withIndex("by_folder", (query) =>
				query.eq("folderId", current as Id<"folders">),
			)
			.take(257);
		if (shares.length > 256) {
			throw new Error("Folder audience exceeds the exact preview limit");
		}
		for (const share of shares) {
			if (share.linkScope === "public") {
				publicLinkRole = share.role;
				continue;
			}
			if (!share.userId) continue;
			const user = await ctx.db.get(share.userId);
			entries.push({
				kind: "folderShare",
				id: share.userId,
				email: user?.email ?? null,
				name: user?.name ?? null,
				role: share.role,
			});
		}
		const invites = await ctx.db
			.query("invites")
			.withIndex("by_folder_email", (query) =>
				query.eq("folderId", current as Id<"folders">),
			)
			.take(257);
		if (invites.length > 256) {
			throw new Error("Folder audience exceeds the exact preview limit");
		}
		for (const invite of invites) {
			entries.push({
				kind: "invite",
				id: invite._id,
				email: invite.email,
				name: null,
				role: invite.folderRole ?? "viewer",
			});
		}
		const folder: Doc<"folders"> | null = await ctx.db.get(current);
		current = folder?.parentId;
	}
	const deduped = new Map<string, (typeof entries)[number]>();
	for (const entry of entries) {
		const key = `${entry.kind}:${entry.id}:${entry.role}`;
		deduped.set(key, entry);
	}
	const audience = [...deduped.values()].sort((left, right) =>
		`${left.kind}:${left.id}:${left.role}`.localeCompare(
			`${right.kind}:${right.id}:${right.role}`,
		),
	);
	return {
		entries: audience,
		publicLinkRole,
		fingerprint: await sha256(JSON.stringify({ audience, publicLinkRole })),
	};
}

async function cloudFolderSnapshot(
	ctx: AuthorityCtx,
	root: Doc<"folders">,
): Promise<{
	items: CloudExportItem[];
	excludedAuthorityRoots: ExcludedCloudAuthorityRoot[];
	manifestHash: string;
	markdownCount: number;
	assetCount: number;
	totalBytes: number;
	historyRevisionCount: number;
}> {
	const [{ descendants, documents }, excludedAuthorityRoots] =
		await Promise.all([
			collectFolderSubtree(ctx, root._id),
			excludedCloudAuthorityRoots(ctx, root),
		]);
	const folderById = new Map<Id<"folders">, Doc<"folders">>([[root._id, root]]);
	for (const folder of descendants) folderById.set(folder._id, folder);
	const items: CloudExportItem[] = [];
	let historyRevisionCount = 0;
	for (const document of documents) {
		if (!document.folderId) continue;
		const projection = await projectDocumentMarkdownForAuthority(
			ctx,
			document._id,
		);
		const bytes = new TextEncoder().encode(projection.markdown);
		const folderPath = folderRelativePath(
			document.folderId,
			root._id,
			folderById,
		);
		const relativePath = canonicalPath(
			[folderPath, exportDocumentFileName(document)].filter(Boolean).join("/"),
		);
		items.push({
			kind: "markdown",
			relativePath,
			contentHash: await sha256(bytes.buffer),
			size: bytes.byteLength,
			documentId: document._id,
			markdown: projection.markdown,
		});
		historyRevisionCount += (
			await ctx.db
				.query("revisions")
				.withIndex("by_document", (query) =>
					query.eq("documentId", document._id),
				)
				.take(MAX_MANIFEST_ITEMS + 1)
		).length;
	}
	const assetPrefix = `${root.name}/`;
	const authorityAssets = await ctx.db
		.query("assets")
		.withIndex("by_authority_root", (query) =>
			query.eq("authorityRootId", root._id),
		)
		.take(MAX_MANIFEST_ITEMS + 1);
	const pathAssets = await ctx.db
		.query("assets")
		.withIndex("by_workspace_path", (query) =>
			query
				.eq("workspaceId", root.workspaceId)
				.gte("path", assetPrefix)
				.lt("path", `${assetPrefix}\uffff`),
		)
		.take(MAX_MANIFEST_ITEMS + 1);
	const assets = new Map(
		[...authorityAssets, ...pathAssets].map((asset) => [asset._id, asset]),
	);
	if (assets.size > MAX_MANIFEST_ITEMS) {
		throw new Error(
			`Cloud folder export must contain 1-${MAX_MANIFEST_ITEMS} items`,
		);
	}
	for (const asset of assets.values()) {
		if (asset.deleted) continue;
		if (
			asset.authorityRootId !== root._id &&
			!asset.path.startsWith(assetPrefix)
		) {
			continue;
		}
		const relativePath = canonicalPath(
			asset.path.startsWith(assetPrefix)
				? asset.path.slice(assetPrefix.length)
				: asset.path,
		);
		if (
			excludedAuthorityRoots.some(
				(boundary) =>
					relativePath === boundary.relativePath ||
					relativePath.startsWith(`${boundary.relativePath}/`),
			)
		) {
			continue;
		}
		const metadata = await ctx.db.system.get("_storage", asset.storageId);
		if (!metadata)
			throw new Error(`Cloud asset is unavailable: ${relativePath}`);
		items.push({
			kind: "asset",
			relativePath,
			contentHash: metadata.sha256,
			size: metadata.size,
			storageId: asset.storageId,
		});
	}
	items.sort((left, right) =>
		left.relativePath.localeCompare(right.relativePath),
	);
	if (items.length < 1 || items.length > MAX_MANIFEST_ITEMS) {
		throw new Error(
			`Cloud folder export must contain 1-${MAX_MANIFEST_ITEMS} items`,
		);
	}
	for (let index = 1; index < items.length; index++) {
		if (items[index - 1]?.relativePath === items[index]?.relativePath) {
			throw new Error(
				`Cloud folder has a duplicate path: ${items[index]?.relativePath}`,
			);
		}
	}
	const manifestHash = await sha256(
		[
			...items.map(
				(item) =>
					`${item.relativePath}:${item.kind}:${item.contentHash}:${item.size}`,
			),
			...excludedAuthorityRoots.map(
				(boundary) => `nested-authority:${boundary.relativePath}`,
			),
		].join("\n"),
	);
	return {
		items,
		excludedAuthorityRoots,
		manifestHash,
		markdownCount: items.filter((item) => item.kind === "markdown").length,
		assetCount: items.filter((item) => item.kind === "asset").length,
		totalBytes: items.reduce((total, item) => total + item.size, 0),
		historyRevisionCount,
	};
}

async function buildCloudFolderMovePreview(
	ctx: AuthorityCtx,
	folderId: Id<"folders">,
) {
	const root = await requireCloudMoveManage(ctx, folderId);
	const [snapshot, audience] = await Promise.all([
		cloudFolderSnapshot(ctx, root),
		cloudFolderAudience(ctx, root),
	]);
	const previewFingerprint = await sha256(
		JSON.stringify({
			folderId: root._id,
			workspaceId: root.workspaceId,
			parentFolderId: root.parentId ?? null,
			manifestHash: snapshot.manifestHash,
			audienceFingerprint: audience.fingerprint,
			historyRevisionCount: snapshot.historyRevisionCount,
		}),
	);
	return {
		root: {
			folderId: root._id,
			workspaceId: root.workspaceId,
			parentFolderId: root.parentId ?? null,
			name: root.name,
		},
		manifest: {
			manifestHash: snapshot.manifestHash,
			itemCount: snapshot.items.length,
			markdownCount: snapshot.markdownCount,
			assetCount: snapshot.assetCount,
			totalBytes: snapshot.totalBytes,
			items: snapshot.items.map(
				({ relativePath, kind, contentHash, size }) => ({
					relativePath,
					kind,
					contentHash,
					size,
				}),
			),
			excludedAuthorityRoots: snapshot.excludedAuthorityRoots,
		},
		audience,
		history: {
			documentCount: snapshot.markdownCount,
			revisionCount: snapshot.historyRevisionCount,
			becomesGitCommits: false as const,
		},
		recovery: { kind: "cloudArchive" as const, expiresAt: null },
		previewFingerprint,
	};
}

export const getCloudFolderMovePreview = query({
	args: { folderId: v.id("folders") },
	handler: (ctx, { folderId }) => buildCloudFolderMovePreview(ctx, folderId),
});

async function buildCloudFolderExportCopyPreview(
	ctx: AuthorityCtx,
	folderId: Id<"folders">,
) {
	const root = await requireCloudExportRead(ctx, folderId);
	const snapshot = await cloudFolderSnapshot(ctx, root);
	const previewFingerprint = await sha256(
		JSON.stringify({
			folderId: root._id,
			workspaceId: root.workspaceId,
			manifestHash: snapshot.manifestHash,
			historyRevisionCount: snapshot.historyRevisionCount,
		}),
	);
	return {
		root: {
			folderId: root._id,
			workspaceId: root.workspaceId,
			parentFolderId: root.parentId ?? null,
			name: root.name,
		},
		manifest: {
			manifestHash: snapshot.manifestHash,
			itemCount: snapshot.items.length,
			markdownCount: snapshot.markdownCount,
			assetCount: snapshot.assetCount,
			totalBytes: snapshot.totalBytes,
			items: snapshot.items.map(
				({ relativePath, kind, contentHash, size }) => ({
					relativePath,
					kind,
					contentHash,
					size,
				}),
			),
			excludedAuthorityRoots: snapshot.excludedAuthorityRoots,
		},
		history: {
			documentCount: snapshot.markdownCount,
			revisionCount: snapshot.historyRevisionCount,
			becomesGitCommits: false as const,
		},
		previewFingerprint,
	};
}

export const getCloudFolderExportCopyPreview = query({
	args: { folderId: v.id("folders") },
	handler: (ctx, { folderId }) =>
		buildCloudFolderExportCopyPreview(ctx, folderId),
});

export const getCloudFolderExportCopyBatch = query({
	args: {
		folderId: v.id("folders"),
		expectedPreviewFingerprint: v.string(),
		afterPath: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const preview = await buildCloudFolderExportCopyPreview(ctx, args.folderId);
		if (preview.previewFingerprint !== args.expectedPreviewFingerprint) {
			throw new Error("Cloud folder changed; refresh the preview");
		}
		const root = await requireCloudExportRead(ctx, args.folderId);
		const snapshot = await cloudFolderSnapshot(ctx, root);
		const afterPath = args.afterPath;
		const remaining = afterPath
			? snapshot.items.filter((item) => item.relativePath > afterPath)
			: snapshot.items;
		const batch = remaining.slice(0, MAX_BATCH_ITEMS);
		return {
			items: await Promise.all(
				batch.map(async (item) =>
					item.kind === "markdown"
						? item
						: {
								...item,
								downloadUrl: await ctx.storage.getUrl(item.storageId),
							},
				),
			),
			nextPath:
				batch.length === MAX_BATCH_ITEMS
					? (batch[batch.length - 1]?.relativePath ?? null)
					: null,
		};
	},
});

export const prepareCloudFolderMove = mutation({
	args: {
		operationKey: v.string(),
		folderId: v.id("folders"),
		expectedPreviewFingerprint: v.string(),
		destinationFingerprint: v.string(),
	},
	handler: async (ctx, args) => {
		const ownerId = await getAuthUserId(ctx);
		if (!ownerId) throw new Error("Unauthorized");
		const operationKey = args.operationKey.trim();
		if (!operationKey) throw new Error("Operation key is required");
		const preview = await buildCloudFolderMovePreview(ctx, args.folderId);
		if (preview.previewFingerprint !== args.expectedPreviewFingerprint) {
			throw new Error("Cloud folder changed; refresh the preview");
		}
		const operationFingerprint = await sha256(
			`${preview.previewFingerprint}\n${args.destinationFingerprint}`,
		);
		const existing = await ctx.db
			.query("authorityTransfers")
			.withIndex("by_owner_and_operation_key", (query) =>
				query.eq("ownerId", ownerId).eq("operationKey", operationKey),
			)
			.unique();
		if (existing) {
			if (
				existing.direction !== "cloudToGit" ||
				existing.operationFingerprint !== operationFingerprint
			) {
				throw new Error("Operation key already belongs to a different preview");
			}
			return { transferId: existing._id, ...preview };
		}
		const now = Date.now();
		const transferId = await ctx.db.insert("authorityTransfers", {
			operationKey,
			ownerId,
			direction: "cloudToGit",
			workspaceId: preview.root.workspaceId,
			parentFolderId: preview.root.parentFolderId ?? undefined,
			rootFolderId: preview.root.folderId,
			state: "prepared",
			manifestHash: preview.manifest.manifestHash,
			manifestItemCount: preview.manifest.itemCount,
			manifestMarkdownCount: preview.manifest.markdownCount,
			manifestAssetCount: preview.manifest.assetCount,
			manifestTotalBytes: preview.manifest.totalBytes,
			stagedItemCount: 0,
			sourceFingerprint: preview.previewFingerprint,
			destinationFingerprint: args.destinationFingerprint,
			audienceFingerprint: preview.audience.fingerprint,
			operationFingerprint,
			recoveryState: "source",
			createdAt: now,
			updatedAt: now,
		});
		return { transferId, ...preview };
	},
});

export const getCloudFolderExportBatch = query({
	args: {
		transferId: v.id("authorityTransfers"),
		afterPath: v.optional(v.string()),
	},
	handler: async (ctx, { transferId, afterPath }) => {
		const transfer = await requireTransferOwner(ctx, transferId);
		if (transfer.direction !== "cloudToGit" || !transfer.rootFolderId) {
			throw new Error("Transfer is not a cloud-to-Git export");
		}
		const preview = await buildCloudFolderMovePreview(
			ctx,
			transfer.rootFolderId,
		);
		if (preview.previewFingerprint !== transfer.sourceFingerprint) {
			throw new Error("Cloud folder changed; refresh the preview");
		}
		const root = await ctx.db.get(transfer.rootFolderId);
		if (!root) throw new Error("Folder not found");
		const snapshot = await cloudFolderSnapshot(ctx, root);
		const remaining = afterPath
			? snapshot.items.filter((item) => item.relativePath > afterPath)
			: snapshot.items;
		const batch = remaining.slice(0, MAX_BATCH_ITEMS);
		return {
			items: await Promise.all(
				batch.map(async (item) =>
					item.kind === "markdown"
						? item
						: {
								...item,
								downloadUrl: await ctx.storage.getUrl(item.storageId),
							},
				),
			),
			nextPath:
				batch.length === MAX_BATCH_ITEMS
					? (batch[batch.length - 1]?.relativePath ?? null)
					: null,
		};
	},
});

export const archiveAuthorityFolder = mutation({
	args: {
		transferId: v.id("authorityTransfers"),
		expectedPreviewFingerprint: v.string(),
		destinationFingerprint: v.string(),
	},
	handler: async (ctx, args) => {
		const transfer = await requireTransferOwner(ctx, args.transferId);
		if (transfer.direction !== "cloudToGit" || !transfer.rootFolderId) {
			throw new Error("Transfer is not a cloud-to-Git move");
		}
		if (transfer.state === "active" && transfer.archiveFingerprint) {
			return {
				state: "archivedToGit" as const,
				archiveFingerprint: transfer.archiveFingerprint,
			};
		}
		const preview = await buildCloudFolderMovePreview(
			ctx,
			transfer.rootFolderId,
		);
		if (
			preview.previewFingerprint !== args.expectedPreviewFingerprint ||
			preview.previewFingerprint !== transfer.sourceFingerprint ||
			args.destinationFingerprint !== transfer.destinationFingerprint
		) {
			throw new Error("Authority move preview is stale");
		}
		const archiveFingerprint = await sha256(
			`${preview.previewFingerprint}\n${args.destinationFingerprint}`,
		);
		const now = Date.now();
		await ctx.db.patch(transfer.rootFolderId, {
			authorityState: "archivedToGit",
			authorityTransferId: transfer._id,
			updatedAt: now,
		});
		await ctx.db.patch(transfer._id, {
			state: "active",
			recoveryState: "retained",
			archiveFingerprint,
			archivedAt: now,
			updatedAt: now,
		});
		return { state: "archivedToGit" as const, archiveFingerprint };
	},
});

export const restoreArchivedAuthorityFolder = mutation({
	args: {
		transferId: v.id("authorityTransfers"),
		archiveFingerprint: v.string(),
	},
	handler: async (ctx, args) => {
		const transfer = await requireTransferOwner(ctx, args.transferId);
		if (
			transfer.direction !== "cloudToGit" ||
			!transfer.rootFolderId ||
			transfer.archiveFingerprint !== args.archiveFingerprint
		) {
			throw new Error("Archived recovery fingerprint changed");
		}
		const root = await requireCloudMoveManage(ctx, transfer.rootFolderId, {
			allowArchived: true,
		});
		if (root.authorityState !== "archivedToGit") {
			return { state: "active" as const, rootFolderId: root._id };
		}
		await assertDestinationAvailable(ctx, {
			workspaceId: root.workspaceId,
			parentFolderId: root.parentId,
			rootName: root.name,
			exceptFolderId: root._id,
		});
		const now = Date.now();
		await ctx.db.patch(root._id, { authorityState: "active", updatedAt: now });
		await ctx.db.patch(transfer._id, {
			state: "needsAttention",
			recoveryState: "restored",
			updatedAt: now,
		});
		return { state: "active" as const, rootFolderId: root._id };
	},
});
