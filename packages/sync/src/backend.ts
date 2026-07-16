import type {
	LiveDocumentImport,
	LiveDocumentProjection,
	RemoteAsset,
	RemoteFile,
	SharedSubtreeDocument,
	SharedWithMe,
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

export type DocumentAccessRole = "owner" | "editor" | "commenter" | "viewer";

export type DocumentRelocationImpact = {
	gainingUserCount: number;
	losingUserCount: number;
	publicAccessChanged: boolean;
	repoExposureChanged: boolean;
	/** Optional so pending moves written by older desktop builds remain readable. */
	userChanges?: Array<{
		userId: string;
		name: string | null;
		email: string | null;
		fromRole: DocumentAccessRole | null;
		toRole: DocumentAccessRole | null;
	}>;
	userChangesTruncated?: boolean;
	publicAccessChange?: {
		fromRole: DocumentAccessRole | null;
		toRole: DocumentAccessRole | null;
	};
	repositoryChanges?: Array<{
		change: "added" | "removed";
		folderId: string;
		folderPath: string;
		repoName: string | null;
		repoRemoteUrl: string | null;
	}>;
};

export type DocumentRelocationResult =
	| { status: "completed" }
	| {
			status: "confirmation-required";
			fingerprint: string;
			impact: DocumentRelocationImpact;
	  };

export type AuthorityAudienceEntry = {
	kind: "member" | "invite" | "folderShare";
	id: string;
	email: string | null;
	name: string | null;
	role: string;
};

export type AuthorityRequestedShare = {
	email: string;
	role: "editor" | "commenter" | "viewer";
};

export type CloudFolderMovePreview = {
	root: {
		folderId: string;
		workspaceId: string;
		parentFolderId: string | null;
		name: string;
	};
	manifest: {
		manifestHash: string;
		itemCount: number;
		markdownCount: number;
		assetCount: number;
		totalBytes: number;
		items: Array<{
			relativePath: string;
			kind: "markdown" | "asset";
			contentHash: string;
			size: number;
		}>;
		excludedAuthorityRoots: Array<{
			folderId: string;
			name: string;
			relativePath: string;
			authority: "git";
		}>;
	};
	audience: {
		entries: AuthorityAudienceEntry[];
		publicLinkRole: string | null;
		fingerprint: string;
	};
	history: {
		documentCount: number;
		revisionCount: number;
		becomesGitCommits: false;
	};
	recovery: { kind: "cloudArchive"; expiresAt: number | null };
	previewFingerprint: string;
};

export type CloudFolderExportCopyPreview = {
	root: CloudFolderMovePreview["root"];
	manifest: CloudFolderMovePreview["manifest"];
	history: CloudFolderMovePreview["history"];
	previewFingerprint: string;
};

export type CloudFolderExportItem =
	| {
			kind: "markdown";
			relativePath: string;
			contentHash: string;
			size: number;
			documentId: string;
			markdown: string;
	  }
	| {
			kind: "asset";
			relativePath: string;
			contentHash: string;
			size: number;
			storageId: string;
			downloadUrl: string | null;
	  };

export type PrepareGitFolderMoveResult = {
	transferId: string;
	rootFolderId?: string;
	operationFingerprint: string;
	audience: AuthorityAudienceEntry[];
	state:
		| "prepared"
		| "staging"
		| "verified"
		| "active"
		| "cancelled"
		| "needsAttention";
};

export type AuthorityStageItem =
	| {
			kind: "markdown";
			relativePath: string;
			contentHash: string;
			size: number;
			markdown: string;
			title?: string;
	  }
	| {
			kind: "asset";
			relativePath: string;
			contentHash: string;
			size: number;
			storageId: string;
	  };

/** Backend-agnostic interface for sync operations. */
export interface SyncBackend {
	getCloudFolderMovePreview(folderId: string): Promise<CloudFolderMovePreview>;
	getCloudFolderExportCopyPreview(
		folderId: string,
	): Promise<CloudFolderExportCopyPreview>;
	getCloudFolderExportCopyBatch(args: {
		folderId: string;
		expectedPreviewFingerprint: string;
		afterPath?: string;
	}): Promise<{ items: CloudFolderExportItem[]; nextPath: string | null }>;
	prepareCloudFolderMove(args: {
		operationKey: string;
		folderId: string;
		expectedPreviewFingerprint: string;
		destinationFingerprint: string;
	}): Promise<CloudFolderMovePreview & { transferId: string }>;
	getCloudFolderExportBatch(args: {
		transferId: string;
		afterPath?: string;
	}): Promise<{ items: CloudFolderExportItem[]; nextPath: string | null }>;
	archiveAuthorityFolder(args: {
		transferId: string;
		expectedPreviewFingerprint: string;
		destinationFingerprint: string;
	}): Promise<{ state: "archivedToGit"; archiveFingerprint: string }>;
	restoreArchivedAuthorityFolder(args: {
		transferId: string;
		archiveFingerprint: string;
	}): Promise<{ state: "active"; rootFolderId: string }>;
	prepareGitFolderMove(args: {
		operationKey: string;
		workspaceId: string;
		parentFolderId?: string;
		rootName: string;
		manifestHash: string;
		manifestItemCount: number;
		manifestMarkdownCount: number;
		manifestAssetCount: number;
		manifestTotalBytes: number;
		sourceFingerprint: string;
		destinationFingerprint: string;
		expectedAudienceFingerprint: string;
		requestedShares?: AuthorityRequestedShare[];
	}): Promise<PrepareGitFolderMoveResult>;
	stageAuthorityFolderBatch(args: {
		transferId: string;
		items: AuthorityStageItem[];
	}): Promise<{
		created: number;
		stagedItemCount: number;
		expectedItemCount: number;
	}>;
	verifyAuthorityStaging(args: {
		transferId: string;
		manifestHash: string;
	}): Promise<{ cutoverToken: string }>;
	activateAuthorityFolder(args: {
		transferId: string;
		cutoverToken: string;
		sourceFingerprint: string;
		destinationFingerprint: string;
	}): Promise<{ rootFolderId?: string; state: "active" }>;
	getAuthorityTransferStatus(transferId: string): Promise<{
		state:
			| "prepared"
			| "staging"
			| "verified"
			| "active"
			| "cancelled"
			| "needsAttention";
		rootFolderId?: string;
		cutoverToken?: string;
		items: Array<{
			relativePath: string;
			kind: "markdown" | "asset";
			contentHash: string;
			size: number;
			verified: boolean;
		}>;
	}>;
	cancelAuthorityTransferBatch(transferId: string): Promise<{
		done: boolean;
		removed: number;
	}>;
	getWorkspace(name: string): Promise<string | null>;
	createWorkspace(name: string): Promise<string>;
	/** Workspaces the signed-in user belongs to (drives the synced-folder mirror). */
	listWorkspaces(): Promise<Workspace[]>;
	/** Folder tree for a workspace; nested via `parentId`. */
	getFolders(workspaceId: string): Promise<Folder[]>;
	/**
	 * Create a folder in a workspace (over `folders.create`). Returns the new
	 * folderId. Used by hubble-init apply-mode (CLI folder-create surface).
	 */
	createFolder(args: {
		workspaceId: string;
		parentId?: string;
		name: string;
		actor?: string;
	}): Promise<string>;

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
	/**
	 * "Shared with me" as the RB4 subtree shape: top-most shared folder nodes
	 * (each carrying its nested folders + docs) plus legacy per-document shares.
	 */
	getSharedWithMe(): Promise<SharedWithMe>;
	/**
	 * Documents of a single folder's subtree, with markdown + relative paths
	 * (over `documents.listFolderWithMarkdown`). Drives the desktop repo-link
	 * mount (RB3): one engine instance materializes exactly this subtree.
	 */
	getFolderSubtreeDocuments(folderId: string): Promise<SharedSubtreeDocument[]>;
	/**
	 * Persist repo-link **display metadata** on a folder (over
	 * `folders.setFolderRepoLink`). The local mount path is never sent — it is
	 * per-machine desktop config (D11).
	 */
	setFolderRepoLink(args: {
		folderId: string;
		repoName?: string;
		repoRemoteUrl?: string;
	}): Promise<void>;
	/**
	 * Folder-aware create with optional initial markdown (over
	 * `documents.create`). Returns the new `documentId`. Used by RB5's `BRAIN.md`
	 * seeding at repo-link time.
	 */
	createDocument(args: {
		workspaceId: string;
		folderId?: string;
		title: string;
		path?: string;
		markdown?: string;
		actor?: string;
	}): Promise<string>;
	importLiveDocument(args: {
		workspaceId: string;
		folderId?: string;
		path: string;
		title: string;
		markdown: string;
		idempotencyKey: string;
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
	prepareDocumentRelocation?(args: {
		documentId: string;
		folderId: string | null;
		title: string;
		path: string;
	}): Promise<DocumentRelocationResult>;
	confirmDocumentRelocation?(args: {
		documentId: string;
		folderId: string | null;
		title: string;
		path: string;
		fingerprint: string;
	}): Promise<DocumentRelocationResult>;
	/**
	 * Soft-delete a Live Document (over `documents.remove`) after a **local
	 * delete** — a watcher `unlink` whose rename/move correlation window expired.
	 * This is the cloud-side half of the direction-aware removal split
	 * (SYNCED-FOLDER §6 case 1): only a watcher-origin disappearance reaches here.
	 * An **access-loss** (a doc leaving the cloud query while still existing) must
	 * NEVER call this — it is removed locally instead. The desktop persists an
	 * Undo operation before calling this mutation and restores through
	 * `restoreDocument` (§6 case 2).
	 */
	removeDocument(documentId: string, actor?: string): Promise<void>;
	/** Restore a soft-deleted Live Document from cloud Trash. */
	restoreDocument?(documentId: string, actor?: string): Promise<void>;
	/** Distinguish cloud Trash from access loss when a document leaves a projection. */
	getDocumentTrashState?(
		documentId: string,
	): Promise<"active" | "trashed" | "inaccessible">;

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
