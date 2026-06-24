import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	workspaces: defineTable({
		name: v.string(),
		createdAt: v.number(),
	}).index("by_name", ["name"]),

	files: defineTable({
		workspaceId: v.id("workspaces"),
		path: v.string(),
		contentHash: v.string(),
		content: v.string(),
		updatedAt: v.number(),
		deviceId: v.string(),
		deleted: v.boolean(),
	})
		.index("by_workspace", ["workspaceId", "updatedAt"])
		.index("by_workspace_path", ["workspaceId", "path"]),

	assets: defineTable({
		workspaceId: v.id("workspaces"),
		path: v.string(),
		storageId: v.id("_storage"),
		contentHash: v.string(),
		updatedAt: v.number(),
		orphanedAt: v.optional(v.number()),
		deviceId: v.string(),
		deleted: v.boolean(),
	})
		.index("by_workspace", ["workspaceId", "updatedAt"])
		.index("by_workspace_path", ["workspaceId", "path"]),

	livePocUsers: defineTable({
		workspaceId: v.id("workspaces"),
		docId: v.string(),
		userId: v.string(),
		name: v.string(),
		anchor: v.optional(v.number()),
		head: v.optional(v.number()),
		updatedAt: v.number(),
	})
		.index("by_doc", ["docId", "updatedAt"])
		.index("by_doc_user", ["docId", "userId"]),
});
