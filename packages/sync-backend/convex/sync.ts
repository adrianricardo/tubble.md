import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";

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

export const getWorkspace = query({
	args: { name: v.string() },
	handler: async (ctx, { name }) => {
		return ctx.db
			.query("workspaces")
			.withIndex("by_name", (q) => q.eq("name", name))
			.unique();
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
		return ctx.db.insert("workspaces", { name, createdAt: Date.now() });
	},
});

export const listWorkspaces = query({
	args: {},
	handler: async (ctx) => {
		return ctx.db.query("workspaces").collect();
	},
});

export const getFilesByWorkspace = query({
	args: {
		workspaceId: v.id("workspaces"),
		since: v.optional(v.number()),
		includeDeleted: v.optional(v.boolean()),
	},
	handler: async (ctx, { workspaceId, since, includeDeleted }) => {
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
	args: {},
	handler: async (ctx) => {
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
		const q = ctx.db.query("assets").withIndex("by_workspace", (q) => {
			const base = q.eq("workspaceId", workspaceId);
			return since !== undefined ? base.gt("updatedAt", since) : base;
		});
		return q.collect();
	},
});

export const getAssetDownloadUrl = query({
	args: { storageId: v.id("_storage") },
	handler: async (ctx, { storageId }) => {
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

export const debugRemoteEdit = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		path: v.string(),
		content: v.string(),
		deviceId: v.optional(v.string()),
	},
	handler: async (ctx, { workspaceId, path, content, deviceId }) => {
		return upsertFile(ctx, {
			workspaceId,
			path,
			content,
			contentHash: await contentHash(content),
			deviceId: deviceId ?? "debug-remote-edit",
		});
	},
});
