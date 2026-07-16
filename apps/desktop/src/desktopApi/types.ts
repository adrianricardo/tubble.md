import type {
	AuthorityManifest,
	AuthorityManifestSummary,
	AuthorityRequestedShare,
	LiveDocumentImportResult,
	PendingProjectionOperation,
	ProjectionScope,
	ReconcileOutcome,
} from "@hubble.md/sync";

export type { ReconcileOutcome };
export type ConsequentialMoveOperation = Extract<
	PendingProjectionOperation,
	{ kind: "consequential-move" }
>;
export type DeletionReviewOperation = Extract<
	PendingProjectionOperation,
	{ kind: "deletion-review" }
>;
export type TrashUndoOperation = Extract<
	PendingProjectionOperation,
	{ kind: "trash-undo" }
> & { phase: "undo-available" };

export type PendingMoveApprovalResult =
	| { status: "completed" }
	| { status: "refreshed" };

export type PendingMoveCancellationResult = {
	status: "cancelled" | "collision";
};

export type PendingDeletionResult = {
	processed: number;
	remaining: number;
};

export type TrashUndoResult = {
	status: "restored" | "collision";
};

export type FileEntry = {
	path: string;
	modified_at: number;
};

export type FolderEntry = FileEntry;

export type DirectoryListing = {
	files: FileEntry[];
	folders: FolderEntry[];
};

export type FolderAuthorityPlacement = {
	id: string;
	repoRoot: string;
	relativePath: string;
	workspaceId: string;
	cloudFolderId: string;
	formerGitFingerprint: string;
	projection: { scopeKey: string; localPath: string } | null;
	createdAt: number;
	updatedAt: number;
};

export type AuthorityTransferPhase =
	| "draft"
	| "validating"
	| "staging"
	| "verifying"
	| "cutting-over"
	| "needs-attention"
	| "completed"
	| "cancelled";

export type AuthorityTransferOperation = {
	id: string;
	direction: "git-to-cloud" | "cloud-to-git";
	intent: "move" | "share" | "export-copy";
	phase: AuthorityTransferPhase;
	source:
		| { kind: "git"; repoRoot: string; relativePath: string }
		| { kind: "cloud"; workspaceId: string; folderId: string };
	destination:
		| { kind: "git"; repoRoot: string; relativePath: string }
		| {
				kind: "cloud";
				workspaceId: string;
				parentFolderId: string | null;
		  }
		| null;
	manifestSummary: AuthorityManifestSummary | null;
	manifestHash: string | null;
	previewFingerprint: string | null;
	destinationPreviewFingerprint?: string | null;
	cloudTransferId?: string | null;
	cloudRootFolderId?: string | null;
	cutoverToken?: string | null;
	recoveryPath?: string | null;
	temporaryPath?: string | null;
	archiveFingerprint?: string | null;
	destinationWasEmpty?: boolean;
	completionFingerprint?: string | null;
	sourcePlacement?: FolderAuthorityPlacement | null;
	requestedShares?: AuthorityRequestedShare[];
	audienceFingerprint?: string | null;
	lastError: string | null;
	createdAt: number;
	updatedAt: number;
};

export type GitWorkingTreeChange = {
	path: string;
	status: string;
};

export type GitFolderInspection = {
	sourcePath: string;
	repoRoot: string;
	repoName: string;
	repoRemoteUrl: string | null;
	relativePath: string;
	manifest: AuthorityManifest;
	trackedFileCount: number;
	workingTreeChanges: GitWorkingTreeChange[];
	workingTreeChangesTruncated: boolean;
	previewFingerprint: string;
	confirmationBlocked: boolean;
};

export type GitDestinationInspection = {
	repoRoot: string;
	repoName: string;
	repoRemoteUrl: string | null;
	destinationPath: string;
	relativePath: string;
	collision: "empty" | "occupied";
	destinationExists: boolean;
	workingTreeChanges: GitWorkingTreeChange[];
	workingTreeChangesTruncated: boolean;
	previewFingerprint: string;
};

export type GitDestinationInspectionInput = {
	repositoryPath: string;
	relativePath: string;
};

export type GitToCloudAuthorityMoveInput = {
	operationId: string;
	folderPath: string;
	workspaceId: string;
	parentFolderId: string | null;
	deploymentUrl: string;
	authToken: string;
	expectedPreviewFingerprint: string;
	expectedAudienceFingerprint: string;
	intent: "move" | "share";
	requestedShares?: AuthorityRequestedShare[];
};

export type GitToCloudAuthorityMoveResult =
	| {
			status: "completed";
			cloudFolderId: string;
			recoveryPath: string;
	  }
	| { status: "stale"; inspection: GitFolderInspection }
	| { status: "needs-attention"; message: string; recoveryPath: string | null };

export type CancelGitToCloudAuthorityMoveInput = {
	operationId: string;
	deploymentUrl: string;
	authToken: string;
};

export type CloudToGitAuthorityMoveInput = {
	operationId: string;
	cloudFolderId: string;
	repositoryPath: string;
	relativePath: string;
	placementId: string | null;
	deploymentUrl: string;
	authToken: string;
	expectedCloudPreviewFingerprint: string;
	expectedDestinationFingerprint: string;
	intent: "move" | "export-copy";
};

export type CloudToGitAuthorityMoveResult =
	| {
			status: "completed";
			repoRoot: string;
			destinationPath: string;
			archiveFingerprint: string | null;
			undoEligible: boolean;
			cloudArchived: boolean;
			workingTreeChanges: GitWorkingTreeChange[];
	  }
	| {
			status: "stale";
			cloudPreviewFingerprint: string;
			destination: GitDestinationInspection;
	  }
	| {
			status: "needs-attention";
			message: string;
			temporaryPath: string | null;
	  };

export type CancelCloudToGitAuthorityMoveInput = {
	operationId: string;
	deploymentUrl: string;
	authToken: string;
};

export type UndoCloudToGitAuthorityMoveInput = {
	operationId: string;
	deploymentUrl: string;
	authToken: string;
};

export type CloudToGitUndoResult =
	| { status: "restored"; cloudFolderId: string; recoveryPath: string }
	| { status: "changed" }
	| { status: "unavailable"; message: string };

export type HtmlAppFileEntry = {
	name: string;
	path: string;
	modified_at: number;
	size: number;
};

export type PersistPastedImageInput = {
	filePath: string;
	bytes: number[];
	mimeType: string | null;
};

export type PersistPastedImageOutput = {
	relativeMarkdownPath: string;
	deduped: boolean;
};

export type WatchOptions = {
	recursive: boolean;
};

export type Unsubscribe = () => void;

export type MenuState = {
	hasWorkspace: boolean;
};

export type DesktopUpdateStatus =
	| "idle"
	| "checking"
	| "up-to-date"
	| "downloading"
	| "ready"
	| "error";

export type DesktopUpdateState = {
	isSupported: boolean;
	status: DesktopUpdateStatus;
	currentVersion: string;
	availableVersion: string | null;
	progressPercent: number | null;
	message: string | null;
	lastCheckedAt: number | null;
};

export type DesktopPlatform = NodeJS.Platform;

export type LiveSyncStatusState =
	| "idle"
	| "verifying"
	| "connected"
	| "syncing"
	| "offline"
	| "pending-review"
	| "error";

export type LiveSyncStatus = {
	state: LiveSyncStatusState;
	connected: boolean;
	workspacePath: string | null;
	workspaceId: string | null;
	/** In-flight reconcile operations (manual-trigger only in Phase 2). */
	pending: number;
	lastReconciledAt: number | null;
	lastError: string | null;
};

export type LiveSyncConnectInput = {
	workspacePath: string;
	deploymentUrl: string;
	workspaceId: string;
	/** Convex Auth JWT from the renderer session. IPC carries a string, not a token fetcher. */
	authToken: string;
};

export type SyncedFolderTelemetryEvent = {
	kind: SyncedFolderEventDetail["kind"];
	at: number;
	reason?: "missing-base" | "read-only";
};

export type SyncedFolderTelemetry = {
	reconciledCount: number;
	backstopCount: number;
	readOnlyRejectedCount: number;
	errorCount: number;
	queuedEventCount: number;
	recentEvents: SyncedFolderTelemetryEvent[];
};

/** Status of the synced-folder watcher engine (Phase 3b). */
export type SyncedFolderStatus = {
	state: LiveSyncStatusState;
	connected: boolean;
	/** The bounded watch root (the user's `~/Hubble`), or null when idle. */
	syncRoot: string | null;
	/** Number of indexed Live Documents in the mirror. */
	documentCount: number;
	/** Durable startup blockers awaiting review or recovery. */
	pendingOperationCount: number;
	/** Why startup cannot currently verify cloud state and access. */
	verificationReason: "offline" | "access" | null;
	/** Last successful cloud-to-disk materialize/reconcile pass. */
	lastReconcileAt: number | null;
	lastEventAt: number | null;
	lastError: string | null;
	telemetry: SyncedFolderTelemetry;
};

/** Link a cloud folder to a local git repo working directory (RB3 / D11). */
export type RepoLinkInput = {
	folderId: string;
	folderName: string;
	workspaceId: string;
	/** The git repo working directory the user picked. */
	repoDir: string;
	/** Optional explicit mount path; defaults to `<repoDir>/<sanitized-name>/`. */
	mountPath?: string;
	deploymentUrl: string;
	/** Convex Auth JWT from the renderer session. */
	authToken: string;
};

export type RepoLinkResult = {
	folderId: string;
	repoDir: string;
	mountPath: string;
	isGitRepo: boolean;
	/** True when the mount path was appended to `.git/info/exclude`. */
	excluded: boolean;
	/** When exclude could not be written, the manual `.gitignore` line to add. */
	manualGitignoreLine: string | null;
	repoName: string | null;
	repoRemoteUrl: string | null;
	/** True when a `BRAIN.md` was seeded (false when one already existed). */
	brainSeeded: boolean;
	documentCount: number;
};

/** A persisted per-machine repo-link mount (folderId → local root). */
export type RepoMount = {
	folderId: string;
	folderName: string;
	workspaceId: string;
	mountPath: string;
	repoDir: string;
	repoName: string | null;
	repoRemoteUrl: string | null;
	/** Live engine state, present only while the app has reconnected the mount. */
	status: LiveSyncStatusState | "disconnected";
	lastReconcileAt: number | null;
};

export type BlockedRepoMountCleanliness = {
	state: "blocked";
	reason: LiveSyncStatusState | "disconnected" | "dirty";
	message: string;
};

export type RepoMountCleanliness =
	| { state: "clean" }
	| BlockedRepoMountCleanliness;

export type RepoMountStopResult =
	| { status: "stopped"; mountPath: string; keptFiles: boolean }
	| { status: "blocked"; cleanliness: BlockedRepoMountCleanliness };

export type RepoMountRelocateInput = {
	folderId: string;
	mountPath: string;
	deploymentUrl: string;
	authToken: string;
};

export type RepoMountRelocateResult =
	| { status: "relocated"; mount: RepoMount }
	| { status: "blocked"; cleanliness: BlockedRepoMountCleanliness };

export type DesktopAuthState = {
	deploymentUrl: string;
	email?: string;
	name?: string;
} | null;

export type DesktopAuthHandoffEvent = {
	deploymentUrl: string;
	code: string;
};

export type RepoLinkLinkedEvent = {
	folderId: string;
	folderName: string;
	mountPath: string;
	repoDir: string;
};

export type RepoLinkUndoResult = {
	folderId: string;
	mountPath: string;
	removedFiles: boolean;
};

/** Reconnect all persisted repo mounts after app launch / sign-in. */
export type RepoMountReconnectInput = {
	deploymentUrl: string;
	authToken: string;
};

export type DirectProjectionScope = Exclude<
	ProjectionScope,
	{ kind: "all-accessible" }
>;

export type LocalAvailabilityRecord = {
	scopeKey: string;
	scope: ProjectionScope;
	displayName: string;
	localRoot: string;
	association: "standalone" | "repo" | "legacy";
	incompatible: boolean;
	repoRoot: string | null;
	repoName: string | null;
	repoRemoteUrl: string | null;
	gitExclusion:
		| { status: "excluded"; pattern: string }
		| { status: "manual"; pattern: string }
		| { status: "not-applicable" };
	state: LiveSyncStatusState | "disconnected";
	lastSyncAt: number | null;
	pendingOperationCount: number;
	recoveryCount: number;
	createdAt: number | null;
	updatedAt: number | null;
	lastConnectedAt: number | null;
};

type LocalAvailabilityCreateBase = {
	displayName: string;
	localRoot: string;
	deploymentUrl: string;
	authToken: string;
};

export type LocalAvailabilityCreateInput =
	| (LocalAvailabilityCreateBase & {
			scope: DirectProjectionScope;
			association: "standalone";
	  })
	| (LocalAvailabilityCreateBase & {
			scope: Extract<DirectProjectionScope, { kind: "folder" }>;
			association: "repo";
			repoRoot: string;
	  });

export type LocalAvailabilityRelocateInput = {
	scopeKey: string;
	localRoot: string;
	deploymentUrl: string;
	authToken: string;
};

export type LocalAvailabilityRelocateResult =
	| { status: "relocated"; availability: LocalAvailabilityRecord }
	| { status: "blocked"; cleanliness: BlockedRepoMountCleanliness };

export type LocalAvailabilityStopInput = {
	scopeKey: string;
	keepFiles: boolean;
	deploymentUrl: string;
	authToken: string;
};

export type LocalAvailabilityStopResult =
	| { status: "stopped"; localRoot: string; keptFiles: boolean }
	| { status: "blocked"; cleanliness: BlockedRepoMountCleanliness };

export type LocalAvailabilityReconnectInput = {
	deploymentUrl: string;
	authToken: string;
};

export type LocalAvailabilityProgressEvent = {
	scopeKey: string;
	phase: "verifying" | "materializing";
};

export type SyncedFolderConnectInput = {
	/** The user-chosen sync root (bounded watch root). */
	syncRoot: string;
	deploymentUrl: string;
	/** Convex Auth JWT from the renderer session. IPC carries a string, not a token fetcher. */
	authToken: string;
};

export type SyncedFolderRootInspection = {
	state: "empty" | "existing-hubble" | "non-empty-foreign";
};

export type SyncedFolderImportInput = {
	/** The user-chosen sync root containing markdown files to import. */
	syncRoot: string;
	deploymentUrl: string;
	/** Explicit target workspace selected by the user. */
	workspaceId: string;
	/** Convex Auth JWT from the renderer session. IPC carries a string, not a token fetcher. */
	authToken: string;
};

/** Pushed to the renderer over `desktop:live-sync:event` as the mirror changes. */
export type ProjectionRootScope = {
	scopeKey: string;
	kind: "all-accessible" | "workspace" | "folder";
	workspaceId: string | null;
	folderId: string | null;
	localRoot: string | null;
};

export type SyncedFolderEventDetail =
	| { kind: "reconciled" }
	| { kind: "renamed" }
	| { kind: "moved" }
	| { kind: "move-review-required"; operationId: string }
	| { kind: "deletion-review-required" }
	| { kind: "trashed-local"; operationId: string }
	| { kind: "removed-remote-trash" }
	| { kind: "created" }
	/**
	 * The user lost access to a doc that still exists in the cloud (materialize-
	 * origin); the local file was moved to `.hubble/trash/`, the cloud doc was
	 * left untouched (§6 case 1).
	 */
	| { kind: "removed-access" }
	/** Reconcile could not be safely scoped; the on-disk edit was backstopped (§6 case 3). */
	| { kind: "backstop"; reason: "missing-base" | "read-only" }
	/** A change to a read-only doc was rejected; the local edit was backstopped (§3). */
	| { kind: "read-only-rejected" }
	| { kind: "error" };

export type SyncedFolderEvent = SyncedFolderEventDetail & {
	scope: ProjectionRootScope;
};

export type LiveSyncReconcileInput = {
	documentId: string;
	/** Absolute path to the editable projection file on disk. */
	projectionPath: string;
	actor?: string;
	/** Relative path stored in base-cache metadata (fallback). */
	path?: string;
};

export type WorkspaceConfig = {
	version: 1;
	pinnedNotes: string[];
};

export type DesktopApi = {
	platform: DesktopPlatform;
	homeDir: string;
	listDirectory(path: string): Promise<DirectoryListing>;
	listFolderAuthorityPlacements(): Promise<FolderAuthorityPlacement[]>;
	listAuthorityTransferOperations(): Promise<AuthorityTransferOperation[]>;
	saveAuthorityTransferOperation(
		operation: AuthorityTransferOperation,
	): Promise<void>;
	cancelAuthorityTransferOperation(
		operationId: string,
	): Promise<AuthorityTransferOperation>;
	inspectGitAuthorityFolder(path: string): Promise<GitFolderInspection>;
	inspectGitAuthorityDestination(
		input: GitDestinationInspectionInput,
	): Promise<GitDestinationInspection>;
	moveGitFolderToCloud(
		input: GitToCloudAuthorityMoveInput,
	): Promise<GitToCloudAuthorityMoveResult>;
	cancelGitToCloudAuthorityMove(
		input: CancelGitToCloudAuthorityMoveInput,
	): Promise<AuthorityTransferOperation>;
	moveCloudFolderToGit(
		input: CloudToGitAuthorityMoveInput,
	): Promise<CloudToGitAuthorityMoveResult>;
	cancelCloudToGitAuthorityMove(
		input: CancelCloudToGitAuthorityMoveInput,
	): Promise<AuthorityTransferOperation>;
	getCloudToGitUndoEligibility(operationId: string): Promise<boolean>;
	undoCloudToGitAuthorityMove(
		input: UndoCloudToGitAuthorityMoveInput,
	): Promise<CloudToGitUndoResult>;
	onFolderAuthorityChanged(callback: () => void): Unsubscribe;
	listHtmlAppFiles(
		workspacePath: string,
		glob: string,
	): Promise<HtmlAppFileEntry[]>;
	readWorkspaceConfig(workspacePath: string): Promise<WorkspaceConfig>;
	writeWorkspaceConfig(
		workspacePath: string,
		config: WorkspaceConfig,
	): Promise<void>;
	readFileText(path: string): Promise<string>;
	pathForDroppedFile(file: File): Promise<string>;
	writeFileText(path: string, content: string): Promise<void>;
	renameFile(fromPath: string, toPath: string): Promise<void>;
	pathExists(path: string): Promise<boolean>;
	persistPastedImage(
		input: PersistPastedImageInput,
	): Promise<PersistPastedImageOutput>;
	deleteFile(path: string, options?: { recursive?: boolean }): Promise<void>;
	readBinaryFile(path: string): Promise<number[]>;
	writeBinaryFile(path: string, bytes: number[]): Promise<void>;
	openFilePicker(options: { defaultPath?: string }): Promise<string | null>;
	openFolderPicker(): Promise<string | null>;
	createFolderPicker(options?: {
		defaultPath?: string;
		title?: string;
		create?: boolean;
	}): Promise<string | null>;
	saveMarkdownFilePicker(options: {
		defaultPath?: string;
	}): Promise<string | null>;
	watchPath(
		path: string,
		options: WatchOptions,
		callback: (paths: string[]) => void,
	): Promise<Unsubscribe>;
	openExternalUrl(url: string): Promise<void>;
	revealFile(path: string): Promise<void>;
	resolvePath(path: string): Promise<string>;
	realPath(path: string): Promise<string>;
	toAssetUrl(path: string): string;
	getLaunchFilePath(): Promise<string | null>;
	getLaunchWorkspacePath(): Promise<string | null>;
	setMenuState(state: MenuState): Promise<void>;
	/**
	 * Engage/disengage always-on background mode (tray + survive window close).
	 * Renderer calls this when a cloud Live-Document workspace is connected /
	 * disconnected (Decision C). Phase 2's live-sync connect/disconnect drives
	 * the same flag from the main process.
	 */
	setBackgroundActive(active: boolean): Promise<void>;
	/**
	 * Connect the main-process live-sync engine to a cloud workspace. Engages
	 * always-on background mode (Decision C). Phase 2: no workspace-wide watcher
	 * yet — reconcile is manual via {@link DesktopApi.reconcileLiveDocument}.
	 */
	connectLiveSync(input: LiveSyncConnectInput): Promise<LiveSyncStatus>;
	disconnectLiveSync(): Promise<LiveSyncStatus>;
	getLiveSyncStatus(): Promise<LiveSyncStatus>;
	/** Manual "reconcile this doc now" trigger; returns the reconcile outcome. */
	reconcileLiveDocument(
		input: LiveSyncReconcileInput,
	): Promise<ReconcileOutcome>;
	/**
	 * Connect the synced-folder engine to a sync root (Phase 3b): acquire the
	 * single-writer lock, materialize the cloud → disk mirror, and start the
	 * bounded watcher. Engages always-on background mode (Decision C). This is
	 * the connect trigger for the synced folder; there is no separate settings UI
	 * yet — the renderer calls this after a folder pick.
	 */
	connectSyncedFolder(
		input: SyncedFolderConnectInput,
	): Promise<SyncedFolderStatus>;
	inspectSyncedFolderRoot(
		syncRoot: string,
	): Promise<SyncedFolderRootInspection>;
	importSyncedFolderMarkdown(
		input: SyncedFolderImportInput,
	): Promise<LiveDocumentImportResult>;
	disconnectSyncedFolder(): Promise<SyncedFolderStatus>;
	getSyncedFolderStatus(): Promise<SyncedFolderStatus>;
	listPendingProjectionOperations(): Promise<PendingProjectionOperation[]>;
	approvePendingProjectionMove(
		operationId: string,
	): Promise<PendingMoveApprovalResult>;
	cancelPendingProjectionMove(
		operationId: string,
	): Promise<PendingMoveCancellationResult>;
	approvePendingProjectionDeletion(
		operationId: string,
	): Promise<PendingDeletionResult>;
	cancelPendingProjectionDeletion(
		operationId: string,
	): Promise<PendingDeletionResult>;
	undoTrashedProjectionDocument(operationId: string): Promise<TrashUndoResult>;
	dismissProjectionTrashUndo(
		operationId: string,
	): Promise<{ status: "dismissed" }>;
	listLocalAvailability(): Promise<LocalAvailabilityRecord[]>;
	createLocalAvailability(
		input: LocalAvailabilityCreateInput,
	): Promise<LocalAvailabilityRecord>;
	inspectLocalAvailability(scopeKey: string): Promise<RepoMountCleanliness>;
	relocateLocalAvailability(
		input: LocalAvailabilityRelocateInput,
	): Promise<LocalAvailabilityRelocateResult>;
	stopLocalAvailability(
		input: LocalAvailabilityStopInput,
	): Promise<LocalAvailabilityStopResult>;
	reconnectLocalAvailability(
		input: LocalAvailabilityReconnectInput,
	): Promise<LocalAvailabilityRecord[]>;
	onLocalAvailabilityProgress(
		callback: (event: LocalAvailabilityProgressEvent) => void,
	): Unsubscribe;
	/**
	 * Link a cloud folder to a local git repo (RB3 / D11): materialize the
	 * folder's subtree at the mount path, register a per-mount sync engine, append
	 * the mount to `.git/info/exclude`, persist the per-machine mapping, publish
	 * repo display metadata to the cloud, and seed `BRAIN.md` (RB5).
	 */
	linkRepoFolder(input: RepoLinkInput): Promise<RepoLinkResult>;
	resolveGitRepoRoot(selectedDir: string): Promise<string | null>;
	/** Undo a socket-created mount: unlink, then remove files only if clean. */
	undoRepoLink(input: { folderId: string }): Promise<RepoLinkUndoResult>;
	/** Deregister a repo mount and leave the materialized files on disk. */
	unlinkRepoFolder(folderId: string): Promise<void>;
	inspectRepoMount(folderId: string): Promise<RepoMountCleanliness>;
	stopRepoMount(input: {
		folderId: string;
		keepFiles: boolean;
		deploymentUrl: string;
		authToken: string;
	}): Promise<RepoMountStopResult>;
	relocateRepoMount(
		input: RepoMountRelocateInput,
	): Promise<RepoMountRelocateResult>;
	/** All persisted repo mounts on this machine, with live engine status. */
	listRepoMounts(): Promise<RepoMount[]>;
	/** Reconnect persisted mounts (post sign-in) so their engines resume syncing. */
	reconnectRepoMounts(input: RepoMountReconnectInput): Promise<RepoMount[]>;
	/**
	 * True when `absPath` is a synced Live Document (present in the main-process
	 * synced-folder reverse index). The renderer consults this to defer entirely
	 * to the synced-folder reconcile engine and skip the legacy whole-file
	 * conflict classifier for that path (SYNCED-FOLDER §4 routing isolation).
	 */
	isSyncedFolderDocument(absPath: string): Promise<boolean>;
	/** Subscribe to synced-folder mirror events (reconciled/renamed/created/…). */
	onSyncedFolderEvent(
		callback: (event: SyncedFolderEvent) => void,
	): Unsubscribe;
	setAuthState(state: DesktopAuthState): Promise<void>;
	onAuthHandoff(
		callback: (event: DesktopAuthHandoffEvent) => void,
	): Unsubscribe;
	onRepoLinkLinked(callback: (event: RepoLinkLinkedEvent) => void): Unsubscribe;
	getUpdateState(): Promise<DesktopUpdateState>;
	getFullScreen(): Promise<boolean>;
	checkForUpdates(): Promise<void>;
	installUpdate(): Promise<void>;
	onOpenFile(callback: (path: string) => void): Unsubscribe;
	onUpdateStateChange(
		callback: (state: DesktopUpdateState) => void,
	): Unsubscribe;
	onMenuCreateMarkdownFile(callback: () => void): Unsubscribe;
	onMenuOpenFile(callback: () => void): Unsubscribe;
	onMenuOpenFolder(callback: () => void): Unsubscribe;
	onMenuOpenSettings(callback: () => void): Unsubscribe;
	onMenuShowWorkspaceSwitcher(callback: () => void): Unsubscribe;
	onMenuSyncWorkspace(callback: () => void): Unsubscribe;
	onWindowFocus(callback: () => void): Unsubscribe;
	onFullScreenChange(callback: (isFullScreen: boolean) => void): Unsubscribe;
};
