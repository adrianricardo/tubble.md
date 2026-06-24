import type {
	LiveDocumentExportResult,
	LiveDocumentImportInput,
	LiveDocumentImportResult,
	RemoteAsset,
	RemoteFile,
} from "./types.js";

/** Backend-agnostic interface for sync operations. */
export interface SyncBackend {
	getWorkspace(name: string): Promise<string | null>;
	createWorkspace(name: string): Promise<string>;

	importLiveDocument(
		args: LiveDocumentImportInput,
	): Promise<LiveDocumentImportResult>;
	exportLiveDocumentMarkdown(
		documentId: string,
	): Promise<LiveDocumentExportResult>;

	getFiles(
		workspaceId: string,
		opts?: { since?: number; includeDeleted?: boolean },
	): Promise<RemoteFile[]>;
	pushFile(args: {
		workspaceId: string;
		path: string;
		contentHash: string;
		content: string;
		deviceId: string;
	}): Promise<void>;
	softDeleteFile(args: {
		workspaceId: string;
		path: string;
		deviceId: string;
	}): Promise<void>;

	getAssets(workspaceId: string, since?: number): Promise<RemoteAsset[]>;
	pushAsset(args: {
		workspaceId: string;
		path: string;
		storageId: string;
		contentHash: string;
		deviceId: string;
	}): Promise<void>;
	softDeleteAsset(args: {
		workspaceId: string;
		path: string;
		deviceId: string;
	}): Promise<void>;

	generateAssetUploadUrl(): Promise<string>;
	getAssetDownloadUrl(storageId: string): Promise<string | null>;
}
