import type {
	LiveDocumentImport,
	LiveDocumentProjection,
	RemoteAsset,
	RemoteFile,
	SharedLiveDocumentProjection,
} from "./types.js";

/** A workspace the signed-in user can see (from `sync.listWorkspaces`). */
export type Workspace = {
	_id: string;
	name: string;
};

/** A folder within a workspace (from `folders.list`), nested via `parentId`. */
export type Folder = {
	_id: string;
	name: string;
	parentId: string | null;
	workspaceId: string;
};

/** A Live Document as seen by an agent/reconcile client. */
export type AgentDocument = {
	documentId: string;
	revision: number;
	markdown: string;
	path?: string | null;
	role?: "owner" | "editor" | "commenter" | "viewer" | null;
	canWrite: boolean;
};

/** Scoped, rebasable replace-range patch used by the file reconciler. */
export type ReplaceRangeIntent = {
	kind: "replace-range";
	baseMarkdown: string;
	from: number;
	to: number;
	markdown: string;
};

/** Patch intents accepted by the Live Document agent API. */
export type AgentPatchIntent =
	| { kind: "replace-document"; markdown: string }
	| { kind: "append-markdown"; markdown: string }
	| { kind: "insert-after-heading"; heading: string; markdown: string }
	| ReplaceRangeIntent
	| {
			kind: "markdown-diff";
			baseMarkdown: string;
			from: number;
			to: number;
			markdown: string;
	  };

/** Result of applying a document patch. */
export type DocumentPatchResult = {
	documentId: string;
	revision: number;
	markdown: string;
};

/** Backend-agnostic interface for sync operations. */
export interface SyncBackend {
	getWorkspace(name: string): Promise<string | null>;
	createWorkspace(name: string): Promise<string>;
	/** Workspaces the signed-in user belongs to (drives the synced-folder mirror). */
	listWorkspaces(): Promise<Workspace[]>;
	/** Folder tree for a workspace; nested via `parentId`. */
	getFolders(workspaceId: string): Promise<Folder[]>;

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

	getLiveDocuments(workspaceId: string): Promise<LiveDocumentProjection[]>;
	getSharedWithMe(): Promise<SharedLiveDocumentProjection[]>;
	importLiveDocument(args: {
		workspaceId: string;
		path: string;
		title: string;
		markdown: string;
		actor?: string;
	}): Promise<LiveDocumentImport>;

	/**
	 * Rename / re-path a Live Document after a Finder rename or move (over
	 * `documents.rename`). `title` drives the on-disk filename; `path` is the
	 * mutable relative-path metadata. Identity (`documentId`) is unchanged.
	 */
	renameDocument(
		documentId: string,
		args: { title: string; path?: string; actor?: string },
	): Promise<void>;
	/**
	 * Move a Live Document into a different folder after a cross-folder Finder
	 * drag (over `folders.moveDocument`). `folderId === null` → workspace root.
	 */
	moveDocument(documentId: string, folderId: string | null): Promise<void>;
	/**
	 * Soft-delete a Live Document (over `documents.remove`) after a **local
	 * delete** — a watcher `unlink` whose rename/move correlation window expired.
	 * This is the cloud-side half of the direction-aware removal split
	 * (SYNCED-FOLDER §6 case 1): only a watcher-origin disappearance reaches here.
	 * An **access-loss** (a doc leaving the cloud query while still existing) must
	 * NEVER call this — it is trashed locally instead. v1 keeps local deletes
	 * one-way and relies on the cloud trash UI for restore (§6 case 2).
	 */
	removeDocument(documentId: string, actor?: string): Promise<void>;

	getDocumentForAgent(documentId: string): Promise<AgentDocument | null>;
	applyDocumentPatch(args: {
		documentId: string;
		baseRevision: number;
		intent: AgentPatchIntent;
		actor?: string;
	}): Promise<DocumentPatchResult>;

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

	generateAssetUploadUrl(workspaceId: string): Promise<string>;
	getAssetDownloadUrl(storageId: string): Promise<string | null>;
}
