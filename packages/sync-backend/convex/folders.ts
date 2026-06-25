import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { currentActorName } from "./authIdentity";
import { requireDocumentWrite, requireWorkspaceMember } from "./permissions";

function normalizeFolderName(name: string) {
	const trimmed = name.trim();
	if (!trimmed) throw new Error("Folder name is required");
	return trimmed;
}

export const list = query({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, { workspaceId }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const folders = await ctx.db
			.query("folders")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		return folders
			.filter((folder) => folder.deletedAt === undefined)
			.sort((a, b) => a.name.localeCompare(b.name));
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
		return folders
			.filter((folder) => folder.deletedAt !== undefined)
			.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
	},
});

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		parentId: v.optional(v.id("folders")),
		name: v.string(),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { workspaceId, parentId, name, actor }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		if (parentId) {
			const parent = await ctx.db.get(parentId);
			if (!parent || parent.workspaceId !== workspaceId) {
				throw new Error("Parent folder not found");
			}
		}
		const now = Date.now();
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
		await requireWorkspaceMember(ctx, folder.workspaceId);
		await ctx.db.patch(folderId, {
			name: normalizeFolderName(name),
			updatedAt: Date.now(),
		});
	},
});

export const remove = mutation({
	args: { folderId: v.id("folders") },
	handler: async (ctx, { folderId }) => {
		const folder = await ctx.db.get(folderId);
		if (!folder || folder.deletedAt !== undefined) return;
		await requireWorkspaceMember(ctx, folder.workspaceId);
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
		await requireWorkspaceMember(ctx, folder.workspaceId);
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
		if (folderId) {
			const folder = await ctx.db.get(folderId);
			if (
				!folder ||
				folder.deletedAt !== undefined ||
				folder.workspaceId !== document.workspaceId
			) {
				throw new Error("Folder not found");
			}
		}
		await ctx.db.patch(documentId, {
			folderId,
			updatedAt: Date.now(),
		});
	},
});
