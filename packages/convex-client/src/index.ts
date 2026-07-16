import type { ProjectionScope, SyncBackend } from "@hubble.md/sync";
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
	onSyncedFolderChanged(
		scope: SyncedFolderSubscriptionScope,
		callback: () => void,
		onError: (err: Error) => void,
	): () => void;
	close(): Promise<void>;
};

export type SyncedFolderSubscriptionScope = ProjectionScope;

type ConvexSharedSubtreeDocument = {
	_id: Id<"documents">;
	workspaceId: Id<"workspaces">;
	workspaceName: string;
	folderId: Id<"folders"> | null;
	title: string;
	path: string | null;
	markdown: string;
	version: number | null;
	role: "owner" | "editor" | "commenter" | "viewer" | null;
	canWrite: boolean;
	updatedAt: number;
	deletedAt?: number;
	relativePath: string;
};

function mapSharedSubtreeDocument(document: ConvexSharedSubtreeDocument) {
	return {
		_id: document._id,
		workspaceId: document.workspaceId,
		workspaceName: document.workspaceName,
		folderId: document.folderId ?? null,
		title: document.title,
		path: document.path ?? null,
		markdown: document.markdown,
		version: document.version,
		role: document.role,
		canWrite: document.canWrite,
		updatedAt: document.updatedAt,
		deletedAt: document.deletedAt,
		relativePath: document.relativePath,
	};
}

export function createConvexBackend(
	url: string,
	authToken?: string,
): SyncBackend {
	const client = new ConvexHttpClient(url);
	if (authToken) {
		client.setAuth(authToken);
	}
	return {
		async getCloudFolderMovePreview(folderId) {
			return client.query(api.authorityTransfers.getCloudFolderMovePreview, {
				folderId: folderId as Id<"folders">,
			});
		},
		async getCloudFolderExportCopyPreview(folderId) {
			return client.query(
				api.authorityTransfers.getCloudFolderExportCopyPreview,
				{ folderId: folderId as Id<"folders"> },
			);
		},
		async getCloudFolderExportCopyBatch(args) {
			return client.query(
				api.authorityTransfers.getCloudFolderExportCopyBatch,
				{
					...args,
					folderId: args.folderId as Id<"folders">,
				},
			);
		},
		async prepareCloudFolderMove(args) {
			return client.mutation(api.authorityTransfers.prepareCloudFolderMove, {
				...args,
				folderId: args.folderId as Id<"folders">,
			});
		},
		async getCloudFolderExportBatch(args) {
			return client.query(api.authorityTransfers.getCloudFolderExportBatch, {
				transferId: args.transferId as Id<"authorityTransfers">,
				afterPath: args.afterPath,
			});
		},
		async archiveAuthorityFolder(args) {
			return client.mutation(api.authorityTransfers.archiveAuthorityFolder, {
				...args,
				transferId: args.transferId as Id<"authorityTransfers">,
			});
		},
		async restoreArchivedAuthorityFolder(args) {
			return client.mutation(
				api.authorityTransfers.restoreArchivedAuthorityFolder,
				{
					transferId: args.transferId as Id<"authorityTransfers">,
					archiveFingerprint: args.archiveFingerprint,
				},
			);
		},
		async prepareGitFolderMove(args) {
			return client.mutation(api.authorityTransfers.prepareGitFolderMove, {
				...args,
				workspaceId: args.workspaceId as Id<"workspaces">,
				parentFolderId: args.parentFolderId
					? (args.parentFolderId as Id<"folders">)
					: undefined,
			});
		},
		async stageAuthorityFolderBatch(args) {
			return client.mutation(api.authorityTransfers.stageAuthorityFolderBatch, {
				transferId: args.transferId as Id<"authorityTransfers">,
				items: args.items.map((item) =>
					item.kind === "asset"
						? {
								...item,
								storageId: item.storageId as Id<"_storage">,
							}
						: item,
				),
			});
		},
		async verifyAuthorityStaging(args) {
			return client.mutation(api.authorityTransfers.verifyAuthorityStaging, {
				transferId: args.transferId as Id<"authorityTransfers">,
				manifestHash: args.manifestHash,
			});
		},
		async activateAuthorityFolder(args) {
			return client.mutation(api.authorityTransfers.activateAuthorityFolder, {
				...args,
				transferId: args.transferId as Id<"authorityTransfers">,
			});
		},
		async getAuthorityTransferStatus(transferId) {
			return client.query(api.authorityTransfers.getAuthorityTransferStatus, {
				transferId: transferId as Id<"authorityTransfers">,
			});
		},
		async cancelAuthorityTransferBatch(transferId) {
			return client.mutation(
				api.authorityTransfers.cancelAuthorityTransferBatch,
				{ transferId: transferId as Id<"authorityTransfers"> },
			);
		},
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
		async createFolder(args) {
			return client.mutation(api.folders.create, {
				workspaceId: args.workspaceId as Id<"workspaces">,
				parentId: args.parentId ? (args.parentId as Id<"folders">) : undefined,
				name: args.name,
				actor: args.actor,
			});
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
		async getSharedWithMe() {
			// RB4: consume the nested subtree shape directly — top-most shared folder
			// nodes (each with descendant folders + docs) plus per-document shares.
			const shared = await client.query(api.documents.listSharedWithMe, {});
			return {
				folders: shared.folders.map((folder) => ({
					folderId: folder.folderId,
					name: folder.name,
					workspaceId: folder.workspaceId,
					workspaceName: folder.workspaceName,
					parentId: folder.parentId ?? null,
					role: folder.role,
					repoName: folder.repoName ?? null,
					repoRemoteUrl: folder.repoRemoteUrl ?? null,
					folders: folder.folders.map((child) => ({
						_id: child._id,
						name: child.name,
						parentId: child.parentId ?? null,
						relativePath: child.relativePath,
					})),
					documents: folder.documents.map(mapSharedSubtreeDocument),
				})),
				documents: shared.documents.map(mapSharedSubtreeDocument),
			};
		},
		async getFolderSubtreeDocuments(folderId) {
			const documents = await client.query(
				api.documents.listFolderWithMarkdown,
				{ folderId: folderId as Id<"folders"> },
			);
			return documents.map(mapSharedSubtreeDocument);
		},
		async setFolderRepoLink(args) {
			await client.mutation(api.folders.setFolderRepoLink, {
				folderId: args.folderId as Id<"folders">,
				repoName: args.repoName,
				repoRemoteUrl: args.repoRemoteUrl,
			});
		},
		async createDocument(args) {
			return client.mutation(api.documents.create, {
				workspaceId: args.workspaceId as Id<"workspaces">,
				folderId: args.folderId ? (args.folderId as Id<"folders">) : undefined,
				title: args.title,
				path: args.path,
				markdown: args.markdown,
				actor: args.actor,
			});
		},
		async importLiveDocument(args) {
			return client.mutation(api.documents.importMarkdown, {
				...args,
				workspaceId: args.workspaceId as Id<"workspaces">,
				folderId: args.folderId ? (args.folderId as Id<"folders">) : undefined,
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
		async prepareDocumentRelocation(args) {
			return client.mutation(api.folders.prepareDocumentRelocation, {
				documentId: args.documentId as Id<"documents">,
				folderId: args.folderId ? (args.folderId as Id<"folders">) : undefined,
				title: args.title,
				path: args.path,
			});
		},
		async confirmDocumentRelocation(args) {
			return client.mutation(api.folders.confirmDocumentRelocation, {
				documentId: args.documentId as Id<"documents">,
				folderId: args.folderId ? (args.folderId as Id<"folders">) : undefined,
				title: args.title,
				path: args.path,
				fingerprint: args.fingerprint,
			});
		},
		async removeDocument(documentId, actor) {
			await client.mutation(api.documents.remove, {
				documentId: documentId as Id<"documents">,
				actor,
			});
		},
		async restoreDocument(documentId, actor) {
			await client.mutation(api.documents.restoreRemoved, {
				documentId: documentId as Id<"documents">,
				actor,
			});
		},
		async getDocumentTrashState(documentId) {
			return client.query(api.documents.getTrashState, {
				documentId: documentId as Id<"documents">,
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

export function createConvexSubscriber(
	url: string,
	authToken?: string,
): Subscriber {
	const client = new ConvexClient(url);
	if (authToken) {
		client.setAuth(async () => authToken);
	}
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
		onSyncedFolderChanged(scope, callback, onError) {
			if (scope.kind === "folder") {
				// One reactive subtree query covers descendant folder and document reads,
				// so a repo mount does not need the global Workspace subscription graph.
				return client.onUpdate(
					api.documents.listFolderWithMarkdown,
					{ folderId: scope.folderId as Id<"folders"> },
					() => callback(),
					onError,
				);
			}
			if (scope.kind === "workspace") {
				const args = {
					workspaceId: scope.workspaceId as Id<"workspaces">,
				};
				const unsubscribeFolders = client.onUpdate(
					api.folders.list,
					args,
					() => callback(),
					onError,
				);
				const unsubscribeDocuments = client.onUpdate(
					api.documents.listWithMarkdown,
					args,
					() => callback(),
					onError,
				);
				return () => {
					unsubscribeFolders();
					unsubscribeDocuments();
				};
			}
			const workspaceUnsubscribes = new Map<string, Array<() => void>>();

			const clearWorkspaceSubscriptions = () => {
				for (const unsubscribes of workspaceUnsubscribes.values()) {
					for (const unsubscribe of unsubscribes) unsubscribe();
				}
				workspaceUnsubscribes.clear();
			};

			const unsubscribeWorkspaces = client.onUpdate(
				api.sync.listWorkspaces,
				{},
				(workspaces) => {
					const nextWorkspaceIds = new Set(
						workspaces.map((workspace) => workspace._id),
					);
					for (const workspaceId of workspaceUnsubscribes.keys()) {
						if (!nextWorkspaceIds.has(workspaceId as Id<"workspaces">)) {
							const unsubscribes = workspaceUnsubscribes.get(workspaceId) ?? [];
							for (const unsubscribe of unsubscribes) unsubscribe();
							workspaceUnsubscribes.delete(workspaceId);
						}
					}

					for (const workspace of workspaces) {
						if (workspaceUnsubscribes.has(workspace._id)) continue;
						const args = { workspaceId: workspace._id };
						workspaceUnsubscribes.set(workspace._id, [
							client.onUpdate(
								api.folders.list,
								args,
								() => callback(),
								onError,
							),
							client.onUpdate(
								api.documents.listWithMarkdown,
								args,
								() => callback(),
								onError,
							),
						]);
					}
					callback();
				},
				onError,
			);
			const unsubscribeSharedWithMe = client.onUpdate(
				api.documents.listSharedWithMe,
				{},
				() => callback(),
				onError,
			);

			return () => {
				unsubscribeWorkspaces();
				unsubscribeSharedWithMe();
				clearWorkspaceSubscriptions();
			};
		},
		async close() {
			await client.close();
		},
	};
}
