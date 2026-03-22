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
});
