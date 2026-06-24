import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const ACTIVE_WINDOW_MS = 30_000;

export const heartbeat = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		docId: v.string(),
		userId: v.string(),
		name: v.string(),
		anchor: v.optional(v.number()),
		head: v.optional(v.number()),
	},
	handler: async (ctx, { workspaceId, docId, userId, name, anchor, head }) => {
		const now = Date.now();
		const cursor =
			anchor !== undefined && head !== undefined ? { anchor, head } : {};
		const existing = await ctx.db
			.query("livePocUsers")
			.withIndex("by_doc_user", (q) =>
				q.eq("docId", docId).eq("userId", userId),
			)
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, { name, updatedAt: now, ...cursor });
			return existing._id;
		}

		return ctx.db.insert("livePocUsers", {
			workspaceId,
			docId,
			userId,
			name,
			...cursor,
			updatedAt: now,
		});
	},
});

export const listActive = query({
	args: { docId: v.string() },
	handler: async (ctx, { docId }) => {
		const cutoff = Date.now() - ACTIVE_WINDOW_MS;
		const users = await ctx.db
			.query("livePocUsers")
			.withIndex("by_doc", (q) => q.eq("docId", docId).gte("updatedAt", cutoff))
			.collect();

		return users
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.map(({ userId, name, anchor, head, updatedAt }) => ({
				userId,
				name,
				anchor,
				head,
				updatedAt,
			}));
	},
});
