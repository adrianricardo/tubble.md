import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function normalizeTitle(title: string): string {
	const trimmed = title.trim();
	if (!trimmed) throw new Error("Document title is required");
	return trimmed;
}

export const list = query({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, { workspaceId }) => {
		const documents = await ctx.db
			.query("documents")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		return documents
			.filter((document) => document.deletedAt === undefined)
			.sort((a, b) => b.updatedAt - a.updatedAt);
	},
});

export const get = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const document = await ctx.db.get(documentId);
		if (!document || document.deletedAt !== undefined) return null;
		return document;
	},
});

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		title: v.string(),
		path: v.optional(v.string()),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { workspaceId, title, path, actor }) => {
		const now = Date.now();
		return ctx.db.insert("documents", {
			workspaceId,
			title: normalizeTitle(title),
			path: path?.trim() || undefined,
			createdBy: actor,
			createdAt: now,
			updatedBy: actor,
			updatedAt: now,
		});
	},
});

export const rename = mutation({
	args: {
		documentId: v.id("documents"),
		title: v.string(),
		path: v.optional(v.string()),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { documentId, title, path, actor }) => {
		const document = await ctx.db.get(documentId);
		if (!document || document.deletedAt !== undefined) {
			throw new Error("Document not found");
		}
		await ctx.db.patch(documentId, {
			title: normalizeTitle(title),
			path: path?.trim() || undefined,
			updatedBy: actor,
			updatedAt: Date.now(),
		});
	},
});

export const remove = mutation({
	args: {
		documentId: v.id("documents"),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { documentId, actor }) => {
		const document = await ctx.db.get(documentId);
		if (!document || document.deletedAt !== undefined) return;
		const now = Date.now();
		await ctx.db.patch(documentId, {
			deletedAt: now,
			updatedBy: actor,
			updatedAt: now,
		});
	},
});
