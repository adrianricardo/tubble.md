import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	internalMutation,
	type MutationCtx,
	mutation,
	query,
} from "./_generated/server";
import {
	assetCleanupDeviceId,
	orphanAssetCandidates,
	referencedAssetPaths,
} from "./orphanAssets";
import {
	isFolderAuthorityActive,
	requireWorkspaceMember,
	workspaceRole,
} from "./permissions";

async function contentHash(content: string): Promise<string> {
	const data = new TextEncoder().encode(content);
	const hash = await crypto.subtle.digest("SHA-256", data);
	const bytes = new Uint8Array(hash);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function upsertFile(
	ctx: MutationCtx,
	args: {
		workspaceId: Id<"workspaces">;
		path: string;
		contentHash: string;
		content: string;
		deviceId: string;
	},
) {
	const { workspaceId, path, contentHash, content, deviceId } = args;
	const existing = await ctx.db
		.query("files")
		.withIndex("by_workspace_path", (q) =>
			q.eq("workspaceId", workspaceId).eq("path", path),
		)
		.unique();

	const now = Date.now();
	if (existing) {
		await ctx.db.patch(existing._id, {
			contentHash,
			content,
			updatedAt: now,
			deviceId,
			deleted: false,
		});
		return existing._id;
	}
	return ctx.db.insert("files", {
		workspaceId,
		path,
		contentHash,
		content,
		updatedAt: now,
		deviceId,
		deleted: false,
	});
}

async function ensureWorkspaceMember(
	ctx: MutationCtx,
	args: {
		workspaceId: Id<"workspaces">;
		userId: Id<"users">;
		role: "owner" | "admin" | "member";
	},
) {
	const existing = await ctx.db
		.query("members")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
		)
		.unique();
	if (existing) {
		if (existing.role !== args.role) {
			await ctx.db.patch(existing._id, { role: args.role });
		}
		return existing._id;
	}
	return ctx.db.insert("members", {
		...args,
		createdAt: Date.now(),
	});
}

export const getWorkspace = query({
	args: { name: v.string() },
	handler: async (ctx, { name }) => {
		const workspace = await ctx.db
			.query("workspaces")
			.withIndex("by_name", (q) => q.eq("name", name))
			.unique();
		if (!workspace) return null;
		return (await workspaceRole(ctx, workspace._id)) ? workspace : null;
	},
});

export const createWorkspace = mutation({
	args: { name: v.string() },
	handler: async (ctx, { name }) => {
		const existing = await ctx.db
			.query("workspaces")
			.withIndex("by_name", (q) => q.eq("name", name))
			.unique();
		if (existing) throw new Error(`Workspace "${name}" already exists`);
		const ownerId = await getAuthUserId(ctx);
		const workspaceId = await ctx.db.insert("workspaces", {
			name,
			ownerId: ownerId ?? undefined,
			createdAt: Date.now(),
		});
		if (ownerId) {
			await ensureWorkspaceMember(ctx, {
				workspaceId,
				userId: ownerId,
				role: "owner",
			});
		}
		return workspaceId;
	},
});

export const listWorkspaces = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		const workspaces = await ctx.db.query("workspaces").collect();
		if (!userId) {
			// Never leak real (owned) workspaces to unauthenticated callers. Legacy
			// anonymous workspaces (ownerId === undefined) stay reachable for CLI/test
			// flows, consistent with workspaceRole()'s anonymous "owner" semantics.
			return workspaces.filter((workspace) => workspace.ownerId === undefined);
		}

		const memberships = await ctx.db
			.query("members")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const memberWorkspaceIds = new Set(
			memberships.map((member) => member.workspaceId),
		);
		return workspaces.filter(
			(workspace) =>
				workspace.ownerId === userId || memberWorkspaceIds.has(workspace._id),
		);
	},
});

export const listWorkspaceMembers = query({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, { workspaceId }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const members = await ctx.db
			.query("members")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		return Promise.all(
			members.map(async (member) => ({
				...member,
				user: await ctx.db.get(member.userId),
			})),
		);
	},
});

export const getFilesByWorkspace = query({
	args: {
		workspaceId: v.id("workspaces"),
		since: v.optional(v.number()),
		includeDeleted: v.optional(v.boolean()),
	},
	handler: async (ctx, { workspaceId, since, includeDeleted }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const q = ctx.db.query("files").withIndex("by_workspace", (q) => {
			const base = q.eq("workspaceId", workspaceId);
			return since !== undefined ? base.gt("updatedAt", since) : base;
		});
		const files = await q.collect();
		return includeDeleted ? files : files.filter((file) => !file.deleted);
	},
});

export const pushFile = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		path: v.string(),
		contentHash: v.string(),
		content: v.string(),
		deviceId: v.string(),
	},
	handler: async (
		ctx,
		{ workspaceId, path, contentHash, content, deviceId },
	) => {
		await requireWorkspaceMember(ctx, workspaceId);
		return upsertFile(ctx, {
			workspaceId,
			path,
			contentHash,
			content,
			deviceId,
		});
	},
});

export const softDeleteFile = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		path: v.string(),
		deviceId: v.string(),
	},
	handler: async (ctx, { workspaceId, path, deviceId }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const existing = await ctx.db
			.query("files")
			.withIndex("by_workspace_path", (q) =>
				q.eq("workspaceId", workspaceId).eq("path", path),
			)
			.unique();
		if (!existing) return;
		await ctx.db.patch(existing._id, {
			deleted: true,
			updatedAt: Date.now(),
			deviceId,
		});
	},
});

// --- Asset sync ---

async function upsertAsset(
	ctx: MutationCtx,
	args: {
		workspaceId: Id<"workspaces">;
		path: string;
		storageId: Id<"_storage">;
		contentHash: string;
		deviceId: string;
	},
) {
	const { workspaceId, path, storageId, contentHash, deviceId } = args;
	const existing = await ctx.db
		.query("assets")
		.withIndex("by_workspace_path", (q) =>
			q.eq("workspaceId", workspaceId).eq("path", path),
		)
		.unique();

	const now = Date.now();
	if (existing) {
		if (existing.storageId !== storageId) {
			await ctx.storage.delete(existing.storageId);
		}
		await ctx.db.patch(existing._id, {
			storageId,
			contentHash,
			updatedAt: now,
			orphanedAt: undefined,
			deviceId,
			deleted: false,
		});
		return existing._id;
	}
	return ctx.db.insert("assets", {
		workspaceId,
		path,
		storageId,
		contentHash,
		updatedAt: now,
		deviceId,
		deleted: false,
	});
}

export const generateAssetUploadUrl = mutation({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, { workspaceId }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		return ctx.storage.generateUploadUrl();
	},
});

export const pushAsset = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		path: v.string(),
		storageId: v.id("_storage"),
		contentHash: v.string(),
		deviceId: v.string(),
	},
	handler: async (
		ctx,
		{ workspaceId, path, storageId, contentHash, deviceId },
	) => {
		await requireWorkspaceMember(ctx, workspaceId);
		return upsertAsset(ctx, {
			workspaceId,
			path,
			storageId,
			contentHash,
			deviceId,
		});
	},
});

export const getAssetsByWorkspace = query({
	args: {
		workspaceId: v.id("workspaces"),
		since: v.optional(v.number()),
	},
	handler: async (ctx, { workspaceId, since }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const q = ctx.db.query("assets").withIndex("by_workspace", (q) => {
			const base = q.eq("workspaceId", workspaceId);
			return since !== undefined ? base.gt("updatedAt", since) : base;
		});
		const assets = await q.collect();
		const visible = [];
		for (const asset of assets) {
			if (
				!asset.authorityRootId ||
				(await isFolderAuthorityActive(ctx, asset.authorityRootId))
			) {
				visible.push(asset);
			}
		}
		return visible;
	},
});

export const getAssetDownloadUrl = query({
	args: { storageId: v.id("_storage") },
	handler: async (ctx, { storageId }) => {
		const asset = await ctx.db
			.query("assets")
			.withIndex("by_storage", (q) => q.eq("storageId", storageId))
			.unique();
		if (
			!asset ||
			asset.deleted ||
			(asset.authorityRootId &&
				!(await isFolderAuthorityActive(ctx, asset.authorityRootId)))
		) {
			return null;
		}
		await requireWorkspaceMember(ctx, asset.workspaceId);
		return ctx.storage.getUrl(storageId);
	},
});

export const softDeleteAsset = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		path: v.string(),
		deviceId: v.string(),
	},
	handler: async (ctx, { workspaceId, path, deviceId }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const existing = await ctx.db
			.query("assets")
			.withIndex("by_workspace_path", (q) =>
				q.eq("workspaceId", workspaceId).eq("path", path),
			)
			.unique();
		if (!existing) return;
		// Eagerly delete blob — unlike markdown files (content stored inline),
		// keeping orphaned blobs in storage has real cost with no restore path.
		await ctx.storage.delete(existing.storageId);
		await ctx.db.patch(existing._id, {
			deleted: true,
			updatedAt: Date.now(),
			deviceId,
		});
	},
});

export const listOrphanAssetCandidates = query({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, { workspaceId }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		// Full-workspace scan for admin inspection. Avoid calling from reactive UI
		// paths or save/sync flows; large workspaces should use an indexed design.
		const [files, assets] = await Promise.all([
			ctx.db
				.query("files")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
				.collect(),
			ctx.db
				.query("assets")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
				.collect(),
		]);

		return orphanAssetCandidates(files, assets);
	},
});

async function markOrphanAssetCandidatesForWorkspace(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
) {
	// First phase of delayed cleanup. This is deliberately conservative: it
	// records candidates but leaves blobs in place for a later sweep.
	const [files, assets] = await Promise.all([
		ctx.db
			.query("files")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect(),
		ctx.db
			.query("assets")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect(),
	]);
	const references = referencedAssetPaths(files);
	const now = Date.now();
	let marked = 0;
	let restored = 0;

	for (const asset of assets) {
		if (asset.deleted) continue;
		if (references.has(asset.path)) {
			if (asset.orphanedAt !== undefined) {
				await ctx.db.patch(asset._id, { orphanedAt: undefined });
				restored++;
			}
			continue;
		}
		if (asset.orphanedAt === undefined) {
			await ctx.db.patch(asset._id, { orphanedAt: now });
			marked++;
		}
	}

	return { marked, restored };
}

export const markOrphanAssetCandidates = mutation({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, { workspaceId }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		return markOrphanAssetCandidatesForWorkspace(ctx, workspaceId);
	},
});

async function deleteOrphanAssetsForWorkspace(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
	gracePeriodMs: number,
) {
	// Second phase of delayed cleanup. Re-scan before deleting so assets that
	// became referenced during the grace period are restored instead of swept.
	const [files, assets] = await Promise.all([
		ctx.db
			.query("files")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect(),
		ctx.db
			.query("assets")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect(),
	]);
	const references = referencedAssetPaths(files);
	const cutoff = Date.now() - gracePeriodMs;
	const deleted: string[] = [];

	for (const asset of assets) {
		if (references.has(asset.path)) {
			if (asset.orphanedAt !== undefined) {
				await ctx.db.patch(asset._id, { orphanedAt: undefined });
			}
			continue;
		}
		if (
			asset.deleted ||
			asset.orphanedAt === undefined ||
			asset.orphanedAt > cutoff
		) {
			continue;
		}
		await ctx.storage.delete(asset.storageId);
		await ctx.db.patch(asset._id, {
			deleted: true,
			updatedAt: Date.now(),
			deviceId: assetCleanupDeviceId(),
		});
		deleted.push(asset.path);
	}

	return { deleted };
}

export const deleteOrphanAssets = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		gracePeriodMs: v.number(),
	},
	handler: async (ctx, { workspaceId, gracePeriodMs }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		return deleteOrphanAssetsForWorkspace(ctx, workspaceId, gracePeriodMs);
	},
});

export const runOrphanAssetCleanupForAllWorkspaces = internalMutation({
	args: { gracePeriodMs: v.number() },
	handler: async (ctx, { gracePeriodMs }) => {
		// Scheduled maintenance MVP: scan each workspace in one transaction. This is
		// acceptable while workspaces hold thousands of documents, not millions.
		const workspaces = await ctx.db.query("workspaces").collect();
		let marked = 0;
		let restored = 0;
		let deleted = 0;

		for (const workspace of workspaces) {
			const markResult = await markOrphanAssetCandidatesForWorkspace(
				ctx,
				workspace._id,
			);
			const deleteResult = await deleteOrphanAssetsForWorkspace(
				ctx,
				workspace._id,
				gracePeriodMs,
			);
			marked += markResult.marked;
			restored += markResult.restored;
			deleted += deleteResult.deleted.length;
		}

		return { workspaces: workspaces.length, marked, restored, deleted };
	},
});

export const debugRemoteEdit = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		path: v.string(),
		content: v.string(),
		deviceId: v.optional(v.string()),
	},
	handler: async (ctx, { workspaceId, path, content, deviceId }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		return upsertFile(ctx, {
			workspaceId,
			path,
			content,
			contentHash: await contentHash(content),
			deviceId: deviceId ?? "debug-remote-edit",
		});
	},
});
