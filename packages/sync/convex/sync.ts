import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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

export const getFilesByWorkspace = query({
	args: {
		workspaceId: v.id("workspaces"),
		since: v.optional(v.number()),
	},
	handler: async (ctx, { workspaceId, since }) => {
		const q = ctx.db
			.query("files")
			.withIndex("by_workspace", (q) => {
				const base = q.eq("workspaceId", workspaceId);
				return since !== undefined ? base.gt("updatedAt", since) : base;
			});
		return q.collect();
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
	handler: async (ctx, { workspaceId, path, contentHash, content, deviceId }) => {
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
	},
});
