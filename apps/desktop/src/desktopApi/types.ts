import type { ReconcileOutcome } from "@hubble.md/sync";

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

export type LiveSyncStatusState = "idle" | "connected" | "syncing" | "error";

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
};

/** Status of the synced-folder watcher engine (Phase 3b). */
export type SyncedFolderStatus = {
	state: LiveSyncStatusState;
	connected: boolean;
	/** The bounded watch root (the user's `~/Hubble`), or null when idle. */
	syncRoot: string | null;
	/** Number of indexed Live Documents in the mirror. */
	documentCount: number;
	lastEventAt: number | null;
	lastError: string | null;
};

export type SyncedFolderConnectInput = {
	/** The user-chosen sync root (bounded watch root). */
	syncRoot: string;
	deploymentUrl: string;
	deviceId?: string;
};

/** Pushed to the renderer over `desktop:live-sync:event` as the mirror changes. */
export type SyncedFolderEvent =
	| { kind: "reconciled" }
	| { kind: "renamed" }
	| { kind: "moved" }
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
	disconnectSyncedFolder(): Promise<SyncedFolderStatus>;
	getSyncedFolderStatus(): Promise<SyncedFolderStatus>;
	/**
	 * True when `absPath` is a synced Live Document (present in the main-process
	 * synced-folder reverse index). The renderer consults this to defer entirely
	 * to the synced-folder reconcile engine and skip the legacy whole-file
	 * conflict classifier for that path (SYNCED-FOLDER §4 routing isolation).
	 */
	isSyncedFolderDocument(absPath: string): Promise<boolean>;
	/** Subscribe to synced-folder mirror events (reconciled/renamed/created/…). */
	onSyncedFolderEvent(callback: (event: SyncedFolderEvent) => void): Unsubscribe;
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
