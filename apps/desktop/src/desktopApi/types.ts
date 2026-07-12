import type {
	LiveDocumentImportResult,
	ReconcileOutcome,
} from "@hubble.md/sync";

export type { ReconcileOutcome };

export type FileEntry = {
	path: string;
	modified_at: number;
};

export type FolderEntry = FileEntry;

export type DirectoryListing = {
	files: FileEntry[];
	folders: FolderEntry[];
};

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
	kind: SyncedFolderEvent["kind"];
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
export type SyncedFolderEvent =
	| { kind: "reconciled" }
	| { kind: "renamed" }
	| { kind: "moved" }
	| { kind: "move-review-required"; operationId: string }
	| { kind: "created" }
	/** A local `unlink` (watcher-origin) soft-deleted the cloud document (§6 case 1). */
	| { kind: "removed-local" }
	/**
	 * The user lost access to a doc that still exists in the cloud (materialize-
	 * origin); the local file was moved to `.hubble/trash/`, the cloud doc was
	 * left untouched (§6 case 1). Direction-aware counterpart of `removed-local`.
	 */
	| { kind: "removed-access" }
	/** Reconcile could not be safely scoped; the on-disk edit was backstopped (§6 case 3). */
	| { kind: "backstop"; reason: "missing-base" | "read-only" }
	/** A change to a read-only doc was rejected; the local edit was backstopped (§3). */
	| { kind: "read-only-rejected" }
	| { kind: "error" };

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
	createFolderPicker(): Promise<string | null>;
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
