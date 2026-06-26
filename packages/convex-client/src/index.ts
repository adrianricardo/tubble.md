import type { SyncBackend } from "@hubble.md/sync";
import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { ConvexClient, ConvexHttpClient } from "convex/browser";

export type Subscriber = {
	onFilesChanged(
		workspaceId: string,
		callback: () => void,
		onError: (err: Error) => void,
	): () => void;
	onAssetsChanged(
		workspaceId: string,
		callback: () => void,
		onError: (err: Error) => void,
	): () => void;
	close(): Promise<void>;
};

export function createConvexBackend(
	url: string,
	authToken?: string,
): SyncBackend {
	const client = new ConvexHttpClient(url);
	if (authToken) {
		client.setAuth(authToken);
	}
	return {
		async getWorkspace(name) {
			const workspace = await client.query(api.sync.getWorkspace, { name });
			return workspace?._id ?? null;
		},
		async createWorkspace(name) {
			return client.mutation(api.sync.createWorkspace, { name });
		},
		async listWorkspaces() {
			const workspaces = await client.query(api.sync.listWorkspaces, {});
			return workspaces.map((workspace) => ({
				_id: workspace._id,
				name: workspace.name,
			}));
		},
		async getFolders(workspaceId) {
			const folders = await client.query(api.folders.list, {
				workspaceId: workspaceId as Id<"workspaces">,
			});
			return folders.map((folder) => ({
				_id: folder._id,
				name: folder.name,
				parentId: folder.parentId ?? null,
				workspaceId: folder.workspaceId,
			}));
		},
		async getFiles(workspaceId, opts) {
			const files = await client.query(api.sync.getFilesByWorkspace, {
				workspaceId: workspaceId as Id<"workspaces">,
				since: opts?.since,
				includeDeleted: opts?.includeDeleted,
			});
			return opts?.includeDeleted
				? files
				: files.filter((file) => !file.deleted);
		},
		async pushFile(args) {
			await client.mutation(api.sync.pushFile, {
				...args,
				workspaceId: args.workspaceId as Id<"workspaces">,
			});
		},
		async softDeleteFile(args) {
			await client.mutation(api.sync.softDeleteFile, {
				...args,
				workspaceId: args.workspaceId as Id<"workspaces">,
			});
		},
		async getLiveDocuments(workspaceId) {
			const documents = await client.query(api.documents.listWithMarkdown, {
				workspaceId: workspaceId as Id<"workspaces">,
			});
			return documents.map((document) => ({
				_id: document._id,
				path: document.path ?? null,
				folderId: document.folderId ?? null,
				title: document.title,
				markdown: document.markdown,
				version: document.version,
				role: document.role,
				canWrite: document.canWrite,
				updatedAt: document.updatedAt,
				deletedAt: document.deletedAt,
			}));
		},
		async importLiveDocument(args) {
			return client.mutation(api.documents.importMarkdown, {
				...args,
				workspaceId: args.workspaceId as Id<"workspaces">,
			});
		},
		async renameDocument(documentId, args) {
			await client.mutation(api.documents.rename, {
				documentId: documentId as Id<"documents">,
				title: args.title,
				path: args.path,
				actor: args.actor,
			});
		},
		async moveDocument(documentId, folderId) {
			await client.mutation(api.folders.moveDocument, {
				documentId: documentId as Id<"documents">,
				folderId: folderId ? (folderId as Id<"folders">) : undefined,
			});
		},
		async removeDocument(documentId, actor) {
			await client.mutation(api.documents.remove, {
				documentId: documentId as Id<"documents">,
				actor,
			});
		},
		async getDocumentForAgent(documentId) {
			const document = await client.query(api.documents.getForAgent, {
				documentId: documentId as Id<"documents">,
			});
			if (!document) return null;
			return {
				documentId: document.documentId,
				revision: document.revision,
				markdown: document.markdown,
				path: document.path,
				role: document.role,
				canWrite: document.canWrite,
			};
		},
		async applyDocumentPatch(args) {
			const result = await client.mutation(api.documents.applyPatch, {
				documentId: args.documentId as Id<"documents">,
				baseRevision: args.baseRevision,
				intent: args.intent,
				actor: args.actor,
			});
			return {
				documentId: result.documentId,
				revision: result.revision,
				markdown: result.markdown,
			};
		},
		async getAssets(workspaceId, since) {
			return client.query(api.sync.getAssetsByWorkspace, {
				workspaceId: workspaceId as Id<"workspaces">,
				since,
			});
		},
		async pushAsset(args) {
			await client.mutation(api.sync.pushAsset, {
				...args,
				workspaceId: args.workspaceId as Id<"workspaces">,
				storageId: args.storageId as Id<"_storage">,
			});
		},
		async softDeleteAsset(args) {
			await client.mutation(api.sync.softDeleteAsset, {
				...args,
				workspaceId: args.workspaceId as Id<"workspaces">,
			});
		},
		async generateAssetUploadUrl(workspaceId) {
			return client.mutation(api.sync.generateAssetUploadUrl, {
				workspaceId: workspaceId as Id<"workspaces">,
			});
		},
		async getAssetDownloadUrl(storageId) {
			return client.query(api.sync.getAssetDownloadUrl, {
				storageId: storageId as Id<"_storage">,
			});
		},
	};
}

export function createConvexSubscriber(url: string): Subscriber {
	const client = new ConvexClient(url);
	return {
		onFilesChanged(workspaceId, callback, onError) {
			// Convex's onUpdate fires immediately with current state, then on
			// every change. We invoke `callback` for every fire — including the
			// initial — so the consumer can use it as the canonical source of
			// file-list state without an extra fetch and without a race window
			// where changes during subscription setup get dropped.
			return client.onUpdate(
				api.sync.getFilesByWorkspace,
				{ workspaceId: workspaceId as Id<"workspaces"> },
				() => callback(),
				onError,
			);
		},
		onAssetsChanged(workspaceId, callback, onError) {
			return client.onUpdate(
				api.sync.getAssetsByWorkspace,
				{ workspaceId: workspaceId as Id<"workspaces"> },
				() => callback(),
				onError,
			);
		},
		async close() {
			await client.close();
		},
	};
}
