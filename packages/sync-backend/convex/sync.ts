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

// --- Live Documents (Stage 2 realtime-collab) ---

async function assertNoActiveDocumentPath(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
	path: string,
	ignoreDocumentId?: Id<"documents">,
) {
	const matches = await ctx.db
		.query("documents")
		.withIndex("by_workspace_path", (q) =>
			q.eq("workspaceId", workspaceId).eq("path", path),
		)
		.collect();
	const conflict = matches.find(
		(document) =>
			document.deletedAt === undefined && document._id !== ignoreDocumentId,
	);
	if (conflict) {
		throw new Error(`Live Document path already exists: ${path}`);
	}
}

export const listDocumentsByWorkspace = query({
	args: {
		workspaceId: v.id("workspaces"),
		includeDeleted: v.optional(v.boolean()),
	},
	handler: async (ctx, { workspaceId, includeDeleted }) => {
		const documents = await ctx.db
			.query("documents")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		return includeDeleted
			? documents
			: documents.filter((document) => document.deletedAt === undefined);
	},
});

export const createDocument = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		title: v.string(),
		path: v.optional(v.string()),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { workspaceId, title, path, actor }) => {
		const normalizedTitle = title.trim();
		if (!normalizedTitle) throw new Error("Document title is required");
		const normalizedPath = path?.trim() || undefined;
		if (normalizedPath) {
			await assertNoActiveDocumentPath(ctx, workspaceId, normalizedPath);
		}
		const now = Date.now();
		return ctx.db.insert("documents", {
			workspaceId,
			title: normalizedTitle,
			path: normalizedPath,
			createdAt: now,
			createdBy: actor,
			updatedAt: now,
			updatedBy: actor,
		});
	},
});

export const renameDocument = mutation({
	args: {
		documentId: v.id("documents"),
		title: v.string(),
		path: v.optional(v.string()),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { documentId, title, path, actor }) => {
		const existing = await ctx.db.get(documentId);
		if (!existing || existing.deletedAt !== undefined) {
			throw new Error("Live Document not found");
		}
		const normalizedTitle = title.trim();
		if (!normalizedTitle) throw new Error("Document title is required");
		const normalizedPath = path?.trim() || undefined;
		if (normalizedPath) {
			await assertNoActiveDocumentPath(
				ctx,
				existing.workspaceId,
				normalizedPath,
				documentId,
			);
		}
		await ctx.db.patch(documentId, {
			title: normalizedTitle,
			path: normalizedPath,
			updatedAt: Date.now(),
			updatedBy: actor,
		});
	},
});

export const deleteDocument = mutation({
	args: {
		documentId: v.id("documents"),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { documentId, actor }) => {
		const existing = await ctx.db.get(documentId);
		if (!existing || existing.deletedAt !== undefined) return;
		const now = Date.now();
		await ctx.db.patch(documentId, {
			deletedAt: now,
			updatedAt: now,
			updatedBy: actor,
		});
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

export const listOrphanAssetCandidates = query({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, { workspaceId }) => {
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
		return upsertFile(ctx, {
			workspaceId,
			path,
			content,
			contentHash: await contentHash(content),
			deviceId: deviceId ?? "debug-remote-edit",
		});
	},
});
