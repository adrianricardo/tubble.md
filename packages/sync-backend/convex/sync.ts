import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
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

function normalizeFolderPrefix(prefix: string): string {
	const normalized = prefix.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
	if (
		normalized.length === 0 ||
		normalized.split("/").some((part) => part.length === 0 || part === ".")
	) {
		throw new Error("Folder prefix must be a non-empty workspace path");
	}
	if (normalized.split("/").some((part) => part === "..")) {
		throw new Error("Folder prefix cannot contain parent segments");
	}
	return `${normalized}/`;
}

function pathWithRenamedPrefix(
	path: string,
	fromPrefix: string,
	toPrefix: string,
): string | null {
	return path.startsWith(fromPrefix)
		? `${toPrefix}${path.slice(fromPrefix.length)}`
		: null;
}

const markdownUrlPattern =
	/(!?\[[^\]\n]*\]\()([^)\s]+)(\)|\s+["'][^"']*["']\))/g;

function renameMarkdownRootUrls(
	content: string,
	fromPrefix: string,
	toPrefix: string,
): string {
	const fromRootPrefix = `/${fromPrefix}`;
	const toRootPrefix = `/${toPrefix}`;
	return content.replace(
		markdownUrlPattern,
		(match, opener: string, url: string, closer: string) => {
			if (url.startsWith(fromPrefix)) {
				return `${opener}${toPrefix}${url.slice(fromPrefix.length)}${closer}`;
			}
			if (url.startsWith(fromRootPrefix)) {
				return `${opener}${toRootPrefix}${url.slice(fromRootPrefix.length)}${closer}`;
			}
			return match;
		},
	);
}

type RenameCollision = {
	path: string;
	kind: "file" | "asset";
};

function collisionMessage(collisions: RenameCollision[]): string {
	const preview = collisions
		.slice(0, 5)
		.map((collision) => `${collision.kind}:${collision.path}`)
		.join(", ");
	const suffix =
		collisions.length > 5 ? ` and ${collisions.length - 5} more` : "";
	return `Folder rename target collides with existing paths: ${preview}${suffix}`;
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

export const renameFolderPrefix = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		fromPrefix: v.string(),
		toPrefix: v.string(),
		deviceId: v.string(),
	},
	handler: async (ctx, { workspaceId, fromPrefix, toPrefix, deviceId }) => {
		const from = normalizeFolderPrefix(fromPrefix);
		const to = normalizeFolderPrefix(toPrefix);
		if (from === to) return { filesRenamed: 0, assetsRenamed: 0 };
		if (to.startsWith(from)) {
			throw new Error("Folder cannot be renamed into itself");
		}

		const files = await ctx.db
			.query("files")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		const assets = await ctx.db
			.query("assets")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();

		const movedFileTargets = new Map<Id<"files">, string>();
		const movedAssetTargets = new Map<Id<"assets">, string>();
		for (const file of files) {
			const nextPath = pathWithRenamedPrefix(file.path, from, to);
			if (nextPath) movedFileTargets.set(file._id, nextPath);
		}
		for (const asset of assets) {
			const nextPath = pathWithRenamedPrefix(asset.path, from, to);
			if (nextPath) movedAssetTargets.set(asset._id, nextPath);
		}

		const movedFileTargetPaths = new Set(movedFileTargets.values());
		const movedAssetTargetPaths = new Set(movedAssetTargets.values());
		const collisions: RenameCollision[] = [];
		for (const file of files) {
			if (
				!movedFileTargets.has(file._id) &&
				!file.deleted &&
				movedFileTargetPaths.has(file.path)
			) {
				collisions.push({ kind: "file", path: file.path });
			}
		}
		for (const asset of assets) {
			if (
				!movedAssetTargets.has(asset._id) &&
				!asset.deleted &&
				movedAssetTargetPaths.has(asset.path)
			) {
				collisions.push({ kind: "asset", path: asset.path });
			}
		}
		if (collisions.length > 0) throw new Error(collisionMessage(collisions));

		const now = Date.now();
		const fileByPath = new Map(files.map((file) => [file.path, file]));
		for (const file of files) {
			const nextPath = movedFileTargets.get(file._id);
			const nextContent = renameMarkdownRootUrls(file.content, from, to);
			if (nextPath) {
				const target = fileByPath.get(nextPath);
				const targetContentHash =
					nextContent === file.content
						? file.contentHash
						: await contentHash(nextContent);
				const targetPatch: Partial<Doc<"files">> = {
					contentHash: targetContentHash,
					content: nextContent,
					updatedAt: now,
					deviceId,
					deleted: file.deleted,
				};
				if (target) {
					await ctx.db.patch(target._id, targetPatch);
				} else {
					await ctx.db.insert("files", {
						workspaceId,
						path: nextPath,
						contentHash: targetContentHash,
						content: nextContent,
						updatedAt: now,
						deviceId,
						deleted: file.deleted,
					});
				}
			}

			const sourcePatch: Partial<Doc<"files">> = {
				updatedAt: now,
				deviceId,
			};
			if (nextPath) {
				sourcePatch.deleted = true;
			} else if (nextContent !== file.content) {
				sourcePatch.content = nextContent;
				sourcePatch.contentHash = await contentHash(nextContent);
			}
			if (nextPath || nextContent !== file.content) {
				await ctx.db.patch(file._id, sourcePatch);
			}
		}
		const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
		for (const asset of assets) {
			const nextPath = movedAssetTargets.get(asset._id);
			if (!nextPath) continue;
			const target = assetByPath.get(nextPath);
			const targetPatch: Partial<Doc<"assets">> = {
				storageId: asset.storageId,
				contentHash: asset.contentHash,
				updatedAt: now,
				orphanedAt: asset.orphanedAt,
				deviceId,
				deleted: asset.deleted,
			};
			if (target) {
				await ctx.db.patch(target._id, targetPatch);
			} else {
				await ctx.db.insert("assets", {
					workspaceId,
					path: nextPath,
					storageId: asset.storageId,
					contentHash: asset.contentHash,
					updatedAt: now,
					orphanedAt: asset.orphanedAt,
					deviceId,
					deleted: asset.deleted,
				});
			}
			await ctx.db.patch(asset._id, {
				updatedAt: now,
				deviceId,
				deleted: true,
			});
		}

		return {
			filesRenamed: movedFileTargets.size,
			assetsRenamed: movedAssetTargets.size,
		};
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
