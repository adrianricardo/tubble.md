export type {
	AgentDocument,
	DocumentPatchResult,
	Folder,
	ReplaceRangeIntent,
	SyncBackend,
	Workspace,
} from "./backend.js";
export {
	isInitialized,
	readConfig,
	readConfigOrDefault,
	readSyncState,
	removeCloudSyncConfig,
	writeCloudSyncConfig,
	writeConfig,
	writeSyncState,
} from "./config.js";
export type {
	FileSystem,
	InitFileSystem,
	LocalAsset,
	LocalFile,
} from "./fs.js";
export { contentHash } from "./fs.js";
export type {
	BackstopReason,
	ChangedRange,
	ReconcileBaseMetadata,
	ReconcileOutcome,
	ReconcileProjectionFileArgs,
} from "./reconcile.js";
export {
	changedRange,
	liveDocumentBaseCacheRoot,
	readReconcileBase,
	reconcileProjectionFile,
	toLocalEditName,
	writeReconcileBase,
} from "./reconcile.js";
export type { MaterializeSyncedFolderResult } from "./sync.js";
export {
	assertLiveDocumentMarkdownWithinCap,
	exportLiveDocuments,
	importLiveDocuments,
	init,
	LIVE_DOCUMENT_MARKDOWN_MAX_BYTES,
	materializeSyncedFolder,
	status,
	sync,
	writeLiveDocumentProjections,
} from "./sync.js";
export type {
	SyncedFolderIndex,
	SyncedFolderIndexDiff,
	SyncedFolderIndexEntry,
	SyncedFolderRole,
} from "./syncedFolderIndex.js";
export {
	diffSyncedFolderIndex,
	loadSyncedFolderIndex,
	rekeySyncedFolderEntry,
	saveSyncedFolderIndex,
	syncedFolderIndexPath,
} from "./syncedFolderIndex.js";
export type {
	CloudSyncConfig,
	FileState,
	LiveDocumentExportResult,
	LiveDocumentImport,
	LiveDocumentImportResult,
	LiveDocumentProjection,
	LiveDocumentProjectionWriteResult,
	RemoteAsset,
	RemoteFile,
	SyncResult,
	SyncState,
	WorkspaceConfig,
} from "./types.js";
