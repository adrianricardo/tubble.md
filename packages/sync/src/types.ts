import { z } from "zod/v4";

export const WorkspaceConfigSchema = z.object({
	cloudSync: z
		.object({
			provider: z.literal("convex"),
			deploymentUrl: z.string(),
			workspaceId: z.string(),
			deviceId: z.string(),
			backgroundSync: z.boolean(),
		})
		.optional(),
});
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
export type CloudSyncConfig = NonNullable<WorkspaceConfig["cloudSync"]>;

export const FileStateSchema = z.object({
	hash: z.string(),
	lastSyncedAt: z.number(),
});
export type FileState = z.infer<typeof FileStateSchema>;

export const SyncStateSchema = z.object({
	lastSyncedAt: z.number(),
	files: z.record(z.string(), FileStateSchema),
	assets: z.record(z.string(), FileStateSchema).optional(),
});
export type SyncState = z.infer<typeof SyncStateSchema>;

export type SyncResult = {
	pushed: string[];
	pulled: string[];
	deleted: string[];
	conflicts: string[];
	unchanged: number;
	assetsPushed: number;
	assetsPulled: number;
	assetsDeleted: number;
	assetsFailed: string[];
};

export type LiveDocumentProjection = {
	_id: string;
	path: string | null;
	folderId: string | null;
	title: string;
	markdown: string;
	version: number | null;
	role?: "owner" | "editor" | "commenter" | "viewer" | null;
	canWrite?: boolean;
	updatedAt: number;
	deletedAt?: number;
};

export type SharedLiveDocumentProjection = LiveDocumentProjection & {
	workspaceId: string;
	workspaceName: string;
};

/**
 * A document inside a shared folder subtree (RB4). Extends the flat shared
 * projection with `relativePath` — the containing-folder path relative to the
 * shared root ("" for a root-level or per-document share).
 */
export type SharedSubtreeDocument = SharedLiveDocumentProjection & {
	relativePath: string;
};

/**
 * A top-most folder shared directly with the signed-in user (RB4 / D12). Carries
 * its descendant folders + documents so the desktop can materialize the whole
 * subtree with real nesting under `Shared with me/<Workspace> - <Folder>/…`.
 */
export type SharedFolderNode = {
	folderId: string;
	name: string;
	workspaceId: string;
	workspaceName: string;
	parentId: string | null;
	role: "owner" | "editor" | "commenter" | "viewer" | null;
	repoName: string | null;
	repoRemoteUrl: string | null;
	folders: Array<{
		_id: string;
		name: string;
		parentId: string | null;
		relativePath: string;
	}>;
	documents: SharedSubtreeDocument[];
};

/** Return shape of `documents.listSharedWithMe` (subtree, RB4). */
export type SharedWithMe = {
	folders: SharedFolderNode[];
	documents: SharedSubtreeDocument[];
};

export type LiveDocumentImport = {
	documentId: string;
	path: string;
	title: string;
	created: boolean;
};

export type LiveDocumentExportResult = {
	exported: string[];
	skipped: string[];
};

export type LiveDocumentProjectionWriteResult = {
	root: string;
	baseCacheRoot: string;
	written: string[];
	skipped: string[];
};

export type LiveDocumentImportResult = {
	imported: string[];
	created: string[];
	reused: string[];
};

export type RemoteFile = {
	_id: string;
	path: string;
	contentHash: string;
	content: string;
	updatedAt: number;
	deviceId: string;
	deleted: boolean;
};

export type RemoteAsset = {
	_id: string;
	path: string;
	storageId: string;
	contentHash: string;
	updatedAt: number;
	deviceId: string;
	deleted: boolean;
};
