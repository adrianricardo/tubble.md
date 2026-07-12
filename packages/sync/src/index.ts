export type {
	AgentDocument,
	AgentPatchIntent,
	DocumentPatchResult,
	DocumentRelocationImpact,
	DocumentRelocationResult,
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
export type { ProjectionSnapshot } from "./projectionApply.js";
export {
	captureProjectionSnapshot,
	guardProjectionFileSystem,
	ProjectionGuardConflict,
} from "./projectionApply.js";
export type {
	PendingProjectionOperation,
	PendingProjectionOperationInput,
	ProjectionOperationsManifest,
} from "./projectionOperations.js";
export {
	loadProjectionOperations,
	PROJECTION_OPERATIONS_REL,
	projectionOperationsPath,
	saveProjectionOperations,
	upsertProjectionOperation,
} from "./projectionOperations.js";
export type { ProjectionDiskComparison } from "./projectionPlan.js";
export { compareProjectionPlanWithDisk } from "./projectionPlan.js";
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
	materializeMountFolder,
	materializeSyncedFolder,
	planMountFolder,
	planSyncedFolder,
	projectionFileName,
	status,
	sync,
	writeLiveDocumentProjections,
} from "./sync.js";
export type {
	StartupProjectionDrift,
	StartupProjectionMove,
	StartupProjectionMoveCorrelation,
	SyncedFolderIndex,
	SyncedFolderIndexDiff,
	SyncedFolderIndexEntry,
	SyncedFolderIndexManifest,
	SyncedFolderMountIdentity,
	SyncedFolderRole,
	SyncedFolderTopologyEntry,
	SyncedFolderVerification,
} from "./syncedFolderIndex.js";
export {
	correlateStartupProjectionMoves,
	diffSyncedFolderIndex,
	emptySyncedFolderIndexManifest,
	inspectStartupProjectionDrift,
	loadSyncedFolderIndex,
	loadSyncedFolderIndexManifest,
	rekeySyncedFolderEntry,
	SYNCED_FOLDER_INDEX_REL,
	saveSyncedFolderIndex,
	saveSyncedFolderIndexManifest,
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
	SharedFolderNode,
	SharedLiveDocumentProjection,
	SharedSubtreeDocument,
	SharedWithMe,
	SyncResult,
	SyncState,
	WorkspaceConfig,
} from "./types.js";
