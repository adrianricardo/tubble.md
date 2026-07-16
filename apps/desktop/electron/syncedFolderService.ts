import { statSync } from "node:fs";
import {
	createConvexBackend,
	createConvexSubscriber,
	type Subscriber,
} from "@hubble.md/convex-client";
import {
	type BackstopReason,
	captureProjectionSnapshot,
	compareProjectionPlanWithDisk,
	contentHash,
	correlateStartupProjectionMoves,
	diffSyncedFolderIndex,
	type FileSystem,
	guardProjectionFileSystem,
	inspectStartupProjectionDrift,
	liveDocumentBaseCacheRoot,
	loadProjectionOperations,
	loadSyncedFolderIndexManifest,
	materializeMountFolder,
	materializeSyncedFolder,
	materializeWorkspaceRoot,
	type PendingProjectionOperation,
	ProjectionGuardConflict,
	type ProjectionScope,
	type ProjectionSnapshot,
	planMountFolder,
	planSyncedFolder,
	planWorkspaceRoot,
	reconcileProjectionFile,
	rekeySyncedFolderEntry,
	removeProjectionOperation,
	type SyncBackend,
	type SyncedFolderIndex,
	type SyncedFolderIndexEntry,
	type SyncedFolderIndexManifest,
	type SyncedFolderMountIdentity,
	saveProjectionOperations,
	saveSyncedFolderIndexManifest,
	toLocalEditName,
	upsertProjectionOperation,
	writeReconcileBase,
} from "@hubble.md/sync";
import { createNodeFileSystem } from "@hubble.md/sync/node";
import type {
	SyncedFolderEventDetail,
	SyncedFolderStatus,
	SyncedFolderTelemetry,
} from "../src/desktopApi/types";
import {
	acquireSingleWriterLock,
	classifySyncedFolderChange,
	flushExpiredUnlinks,
	type HeldUnlink,
	heartbeatSingleWriterLock,
	OWNER_LOCK_STALE_MS,
	type RawWatcherEvent,
	releaseSingleWriterLock,
	shouldIgnoreSyncedPath,
} from "./syncedFolderClassify";

/** Opaque handle over whatever filesystem watcher the host wired up. */
export type WatcherHandle = { close(): Promise<void> | void };

export type SyncedFolderServiceOptions = {
	scope: ProjectionScope;
	createBackend?: (url: string, authToken?: string) => SyncBackend;
	createSubscriber?: (url: string, authToken?: string) => Subscriber;
	fs?: FileSystem;
	/** Report an engine-local event to the projection coordinator. */
	emit?: (event: SyncedFolderEventDetail) => void;
	/** Injectable clock (tests). */
	now?: () => number;
	/** This machine's stable id (single-writer lock identity). */
	deviceId?: string;
	pid?: number;
	/** `inode` lookup; defaults to `fs.statSync`. Tests may omit it. */
	statInode?: (absPath: string) => number | null;
	/** Injectable connectivity predicate. When true, watcher events are queued. */
	isOffline?: () => boolean;
	/** Checks that a root or parent directory still exists before cloud deletion. */
	isPathAvailable?: (path: string) => boolean;
	/**
	 * Factory for the real watcher. Returns `null` to skip wiring a watcher
	 * (unit tests drive {@link SyncedFolderService.handleRawEvent} directly).
	 */
	createWatcher?: (args: {
		syncRoot: string;
		onEvent: (event: RawWatcherEvent) => void;
	}) => WatcherHandle | null;
};

export type ConnectFolderInput = {
	syncRoot: string;
	deploymentUrl: string;
	authToken: string;
};

const CORRELATION_WINDOW_MS = 750;
const CHANGE_DEBOUNCE_MS = 250;
const CLOUD_MATERIALIZE_DEBOUNCE_MS = 250;
const HEARTBEAT_MS = 10_000;
const SELF_WRITE_TTL_MS = 5_000;
const PROJECTION_OPERATION_BATCH_SIZE = 25;

const QUEUE_DIR_REL = ".hubble/queue";
const QUEUE_MANIFEST_REL = `${QUEUE_DIR_REL}/events.json`;
/** Where access-lost local bytes are parked instead of being hard-deleted. */
const TRASH_DIR_REL = ".hubble/trash";
const RECENT_TELEMETRY_EVENTS = 8;

type DeletionReviewOperation = Extract<
	PendingProjectionOperation,
	{ kind: "deletion-review" }
>;

type QueuedWatcherEvent = RawWatcherEvent & {
	id: string;
	queuedAt: number;
	attempts: number;
	lastError?: string;
};

type QueueManifest = {
	version: 1;
	events: QueuedWatcherEvent[];
};

function memoizeAsync<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
	const cache = new Map<string, Promise<TResult>>();
	return (...args) => {
		const key = JSON.stringify(args);
		const existing = cache.get(key);
		if (existing) return existing;
		const result = fn(...args);
		cache.set(key, result);
		return result;
	};
}

/** Reuse one cloud snapshot for a no-write preflight and its materialize pass. */
function memoizeProjectionBackend(backend: SyncBackend): SyncBackend {
	return {
		...backend,
		listWorkspaces: memoizeAsync(() => backend.listWorkspaces()),
		getFolders: memoizeAsync((workspaceId: string) =>
			backend.getFolders(workspaceId),
		),
		getLiveDocuments: memoizeAsync((workspaceId: string) =>
			backend.getLiveDocuments(workspaceId),
		),
		getSharedWithMe: memoizeAsync(() => backend.getSharedWithMe()),
		getFolderSubtreeDocuments: memoizeAsync((folderId: string) =>
			backend.getFolderSubtreeDocuments(folderId),
		),
	};
}

function projectionTopology(
	syncRoot: string,
	index: SyncedFolderIndex,
): SyncedFolderIndexManifest["topology"] {
	const byFolder = new Map<
		string,
		SyncedFolderIndexManifest["topology"][number]
	>();
	for (const [path, entry] of Object.entries(index)) {
		if (!entry.folderId || byFolder.has(entry.folderId)) continue;
		const relative = path.startsWith(`${syncRoot}/`)
			? path.slice(syncRoot.length + 1)
			: path;
		const slash = relative.lastIndexOf("/");
		byFolder.set(entry.folderId, {
			folderId: entry.folderId,
			workspaceId: entry.workspaceId,
			relativePath: slash === -1 ? "" : relative.slice(0, slash),
		});
	}
	return [...byFolder.values()].sort((a, b) =>
		a.relativePath.localeCompare(b.relativePath),
	);
}

/**
 * Synced-folder engine for the Electron main process (SYNCED-FOLDER Phase 3b).
 *
 * On {@link connect}: acquire the single-writer lock → `materializeSyncedFolder`
 * (cloud → disk, the initial full pass) → start the bounded watcher. Routes
 * classified watcher changes back to the cloud: `reconcile` →
 * {@link reconcileProjectionFile}, `rename`/`move` → `renameDocument` /
 * `moveDocument` + re-key the index, `create` → `importLiveDocument` + base
 * cache. A local `delete` is **logged/emitted only** in this slice — the
 * direction-aware cloud delete is Phase 5.
 *
 * Backend, filesystem, clock, and watcher are all injectable so the lock,
 * classification, and routing are unit-tested with no chokidar or Electron.
 */
export class SyncedFolderService {
	#createBackend: (url: string, authToken?: string) => SyncBackend;
	#createSubscriber: (url: string, authToken?: string) => Subscriber;
	#fs: FileSystem;
	#emit: (event: SyncedFolderEventDetail) => void;
	#now: () => number;
	#deviceId: string;
	#pid: number;
	#statInode: (absPath: string) => number | null;
	#isOffline: () => boolean;
	#isPathAvailable: (path: string) => boolean;
	#createWatcher: SyncedFolderServiceOptions["createWatcher"];
	#scope: ProjectionScope;

	#backend: SyncBackend | null = null;
	#syncRoot: string | null = null;
	#index: SyncedFolderIndex = {};
	#state: SyncedFolderStatus["state"] = "idle";
	#lastError: string | null = null;
	#lastReconcileAt: number | null = null;
	#lastEventAt: number | null = null;
	#pendingOperationCount = 0;
	#verificationReason: "offline" | "access" | null = null;
	#indexManifest: SyncedFolderIndexManifest | null = null;
	#telemetry: SyncedFolderTelemetry = emptyTelemetry();

	#heldUnlinks: HeldUnlink[] = [];
	#recentlyWrittenByUs = new Map<string, { hash: string; at: number }>();
	#changeTimers = new Map<string, ReturnType<typeof setTimeout>>();
	#flushTimer: ReturnType<typeof setTimeout> | null = null;
	#cloudMaterializeTimer: ReturnType<typeof setTimeout> | null = null;
	#cloudMaterializeRunning = false;
	#cloudMaterializePending = false;
	#materializeTask: Promise<void> | null = null;
	#startupProjectionSnapshot: ProjectionSnapshot | null = null;
	#startupProjectionPlan: SyncedFolderIndex | null = null;
	#heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	#watcher: WatcherHandle | null = null;
	#subscriber: Subscriber | null = null;
	#unsubscribeSyncedFolder: (() => void) | null = null;
	#connectionGeneration = 0;
	#operationTask: Promise<void> = Promise.resolve();
	#connectInput: ConnectFolderInput | null = null;
	#startupIncomplete = false;

	constructor(options: SyncedFolderServiceOptions) {
		this.#createBackend = options.createBackend ?? createConvexBackend;
		this.#createSubscriber = options.createSubscriber ?? createConvexSubscriber;
		this.#fs = options.fs ?? createNodeFileSystem();
		this.#emit = options.emit ?? (() => {});
		this.#now = options.now ?? (() => Date.now());
		this.#deviceId = options.deviceId ?? "desktop-unknown";
		this.#pid =
			options.pid ?? (typeof process !== "undefined" ? process.pid : 0);
		this.#statInode =
			options.statInode ??
			((absPath) => {
				try {
					return statSync(absPath).ino;
				} catch {
					return null;
				}
			});
		this.#isOffline = options.isOffline ?? (() => false);
		this.#isPathAvailable =
			options.isPathAvailable ??
			(options.fs
				? () => true
				: (candidate) => {
						try {
							return statSync(candidate).isDirectory();
						} catch {
							return false;
						}
					});
		this.#createWatcher = options.createWatcher;
		this.#scope = options.scope;
	}

	get connected(): boolean {
		return this.#syncRoot !== null;
	}

	/**
	 * True when `absPath` is a synced Live Document — i.e. present in the loaded
	 * reverse index (`.hubble/index/synced-folder.json`). This is the query the
	 * renderer uses to defer to the reconcile engine and skip the legacy
	 * whole-file conflict classifier (SYNCED-FOLDER §4). Returns `false` when
	 * disconnected or when the path is not a mirrored document.
	 */
	isLiveDocument(absPath: string): boolean {
		return this.#index[absPath] !== undefined;
	}

	#cloudDocumentPath(absPath: string): string {
		const relativePath = this.#syncRoot
			? relPath(this.#syncRoot, absPath)
			: absPath;
		// Only the legacy broad mirror adds a top-level Workspace wrapper.
		return this.#scope.kind === "all-accessible"
			? stripTopLevelWorkspaceDir(relativePath)
			: relativePath;
	}

	/** The reverse-index entry for `absPath`, or `null` when not a synced doc. */
	lookup(absPath: string): SyncedFolderIndexEntry | null {
		return this.#index[absPath] ?? null;
	}

	findDocumentPath(documentId: string): string | null {
		return (
			Object.entries(this.#index).find(
				([, entry]) => entry.documentId === documentId,
			)?.[0] ?? null
		);
	}

	getStatus(): SyncedFolderStatus {
		return {
			state: this.#state,
			connected: this.connected,
			syncRoot: this.#syncRoot,
			documentCount: Object.keys(this.#index).length,
			pendingOperationCount: this.#pendingOperationCount,
			verificationReason: this.#verificationReason,
			lastReconcileAt: this.#lastReconcileAt,
			lastEventAt: this.#lastEventAt,
			lastError: this.#lastError,
			telemetry: cloneTelemetry(this.#telemetry),
		};
	}

	async listPendingOperations() {
		if (!this.#syncRoot) return [];
		return (await loadProjectionOperations(this.#fs, this.#syncRoot))
			.operations;
	}

	async approvePendingMove(operationId: string) {
		const syncRoot = this.#syncRoot;
		const backend = this.#backend;
		if (!syncRoot || !backend?.confirmDocumentRelocation) {
			throw new Error("The synced folder is not ready to review moves");
		}
		const current = await loadProjectionOperations(this.#fs, syncRoot);
		const operation = current.operations.find(({ id }) => id === operationId);
		if (!operation || operation.kind !== "consequential-move") {
			throw new Error("Pending move not found");
		}
		const result = await backend.confirmDocumentRelocation({
			documentId: operation.documentId,
			folderId: operation.toFolderId,
			title: operation.title,
			path: this.#cloudDocumentPath(operation.toPath),
			fingerprint: operation.fingerprint,
		});
		if (result.status === "confirmation-required") {
			const {
				id: _id,
				state: _state,
				createdAt: _createdAt,
				updatedAt: _updatedAt,
				...input
			} = operation;
			const manifest = await upsertProjectionOperation(
				this.#fs,
				syncRoot,
				{ ...input, fingerprint: result.fingerprint, impact: result.impact },
				this.#now(),
			);
			this.#pendingOperationCount = manifest.operations.length;
			return { status: "refreshed" as const };
		}
		const manifest = await removeProjectionOperation(
			this.#fs,
			syncRoot,
			operationId,
		);
		this.#pendingOperationCount = manifest.operations.length;
		this.#state =
			manifest.operations.length === 0 ? "connected" : "pending-review";
		await this.#resumeStartupAfterReview();
		return { status: "completed" as const };
	}

	async cancelPendingMove(operationId: string) {
		const syncRoot = this.#syncRoot;
		if (!syncRoot) throw new Error("The synced folder is not connected");
		const current = await loadProjectionOperations(this.#fs, syncRoot);
		const operation = current.operations.find(({ id }) => id === operationId);
		if (!operation || operation.kind !== "consequential-move") {
			throw new Error("Pending move not found");
		}
		const latest = await this.#fs.readFile(operation.toPath);
		const source = await this.#fs.readFileOrNull(operation.path);
		if (source !== null) {
			await upsertProjectionOperation(
				this.#fs,
				syncRoot,
				{
					kind: "path-collision",
					documentId: operation.documentId,
					workspaceId: operation.workspaceId,
					folderId: operation.folderId,
					path: operation.path,
					localHash: await contentHash(source),
					desiredHash: await contentHash(latest),
				},
				this.#now(),
			);
			const afterRemoval = await removeProjectionOperation(
				this.#fs,
				syncRoot,
				operationId,
			);
			this.#pendingOperationCount = afterRemoval.operations.length;
			return { status: "collision" as const };
		}
		await this.#fs.writeFile(operation.path, latest);
		this.#markWrittenByUs(operation.path, latest);
		// Point the index at the restored file before unlinking the destination so
		// the watcher cannot misclassify our cancellation as a local cloud delete.
		this.#rekey(operation.toPath, operation.path, {
			folderId: operation.folderId,
		});
		await this.#saveCurrentIndex();
		await this.#fs.deleteFile(operation.toPath);
		const manifest = await removeProjectionOperation(
			this.#fs,
			syncRoot,
			operationId,
		);
		this.#pendingOperationCount = manifest.operations.length;
		this.#state =
			manifest.operations.length === 0 ? "connected" : "pending-review";
		await this.#resumeStartupAfterReview();
		return { status: "cancelled" as const };
	}

	async approvePendingDeletion(operationId: string) {
		const syncRoot = this.#syncRoot;
		if (!syncRoot || !this.#backend) {
			throw new Error("The synced folder is not ready to review deletions");
		}
		const current = await loadProjectionOperations(this.#fs, syncRoot);
		const operation = current.operations.find(({ id }) => id === operationId);
		if (!operation || operation.kind !== "deletion-review") {
			throw new Error("Pending deletion review not found");
		}
		const batch = operation.items.slice(0, PROJECTION_OPERATION_BATCH_SIZE);
		if (batch.some((item) => item.role !== "owner" && item.role !== "editor")) {
			throw new Error("Read-only documents cannot be moved to Trash");
		}
		for (const item of batch) {
			const entry = this.#index[item.path];
			if (!entry) continue;
			await this.#trashDocument(item.path, entry);
		}
		const remainingItems = operation.items.slice(batch.length);
		await this.#replaceDeletionReview(operation, remainingItems);
		await this.#resumeStartupAfterReview();
		return { processed: batch.length, remaining: remainingItems.length };
	}

	async cancelPendingDeletion(operationId: string) {
		const syncRoot = this.#syncRoot;
		const backend = this.#backend;
		if (!syncRoot || !backend) {
			throw new Error("The synced folder is not ready to restore deletions");
		}
		const current = await loadProjectionOperations(this.#fs, syncRoot);
		const operation = current.operations.find(({ id }) => id === operationId);
		if (!operation || operation.kind !== "deletion-review") {
			throw new Error("Pending deletion review not found");
		}
		const batch = operation.items.slice(0, PROJECTION_OPERATION_BATCH_SIZE);
		for (const item of batch) {
			const document = await backend.getDocumentForAgent(item.documentId);
			if (!document) continue;
			const existing = await this.#fs.readFileOrNull(item.path);
			if (existing !== null) {
				await upsertProjectionOperation(
					this.#fs,
					syncRoot,
					{
						kind: "path-collision",
						documentId: item.documentId,
						workspaceId: item.workspaceId ?? operation.workspaceId,
						folderId: item.folderId ?? operation.folderId,
						path: item.path,
						localHash: await contentHash(existing),
						desiredHash: await contentHash(document.markdown),
					},
					this.#now(),
				);
				continue;
			}
			await this.#fs.writeFile(item.path, document.markdown);
			this.#markWrittenByUs(item.path, document.markdown);
			await this.#refreshIndexEntry(item.path, document.markdown);
		}
		const remainingItems = operation.items.slice(batch.length);
		await this.#replaceDeletionReview(operation, remainingItems);
		await this.#resumeStartupAfterReview();
		return { processed: batch.length, remaining: remainingItems.length };
	}

	async undoTrashedDocument(operationId: string) {
		const syncRoot = this.#syncRoot;
		const backend = this.#backend;
		if (!syncRoot || !backend?.restoreDocument) {
			throw new Error("The synced folder is not ready to restore Trash");
		}
		const current = await loadProjectionOperations(this.#fs, syncRoot);
		const operation = current.operations.find(({ id }) => id === operationId);
		if (
			!operation ||
			operation.kind !== "trash-undo" ||
			operation.phase !== "undo-available"
		) {
			throw new Error("Trash undo operation not found");
		}
		await backend.restoreDocument(operation.documentId, "synced-folder-undo");
		await removeProjectionOperation(this.#fs, syncRoot, operationId);
		const existing = await this.#fs.readFileOrNull(operation.path);
		if (existing !== null) {
			const document = await backend.getDocumentForAgent(operation.documentId);
			if (document) {
				await upsertProjectionOperation(
					this.#fs,
					syncRoot,
					{
						kind: "path-collision",
						documentId: operation.documentId,
						workspaceId: operation.workspaceId,
						folderId: operation.folderId,
						path: operation.path,
						localHash: await contentHash(existing),
						desiredHash: await contentHash(document.markdown),
					},
					this.#now(),
				);
			}
			this.#state = "pending-review";
			return { status: "collision" as const };
		}
		await this.#materialize();
		return { status: "restored" as const };
	}

	async dismissTrashUndo(operationId: string) {
		const syncRoot = this.#syncRoot;
		if (!syncRoot) throw new Error("The synced folder is not connected");
		const manifest = await removeProjectionOperation(
			this.#fs,
			syncRoot,
			operationId,
		);
		this.#pendingOperationCount = manifest.operations.length;
		return { status: "dismissed" as const };
	}

	/**
	 * Acquire the lock, materialize the mirror, and (in production) start the
	 * bounded watcher. Throws when another fresh device already owns the folder
	 * (§6 case 4 detect-and-refuse).
	 */
	async connect(input: ConnectFolderInput): Promise<SyncedFolderStatus> {
		if (this.connected) {
			await this.disconnect();
		}

		const { syncRoot, deploymentUrl, authToken } = input;
		const deviceId = this.#deviceId;
		const connectionGeneration = this.#connectionGeneration + 1;

		const lock = await acquireSingleWriterLock(this.#fs, syncRoot, {
			deviceId,
			pid: this.#pid,
			now: this.#now(),
			staleMs: OWNER_LOCK_STALE_MS,
		});
		if (!lock.acquired) {
			this.#state = "error";
			this.#lastError = `Already syncing this folder on device ${lock.current.deviceId}`;
			throw new Error(this.#lastError);
		}

		this.#backend = this.#createBackend(deploymentUrl, authToken);
		this.#syncRoot = syncRoot;
		this.#connectInput = { syncRoot, deploymentUrl, authToken };
		this.#startupIncomplete = true;
		this.#connectionGeneration = connectionGeneration;
		this.#lastError = null;
		this.#verificationReason = null;
		this.#state = "verifying";

		await this.#fs.ensureDir(`${syncRoot}/${QUEUE_DIR_REL}`);

		// Replay offline edits against the previous index before materializing;
		// otherwise cloud→disk sync could overwrite the unsynced local bytes.
		const mount = this.#mountIdentity();
		try {
			this.#indexManifest = await loadSyncedFolderIndexManifest(
				this.#fs,
				syncRoot,
				mount,
			);
		} catch (error) {
			this.#state = "pending-review";
			this.#lastError = error instanceof Error ? error.message : String(error);
			this.#recordEvent({ kind: "error" });
			return this.getStatus();
		}
		this.#index = this.#indexManifest.entries;
		const pendingOperations = await loadProjectionOperations(
			this.#fs,
			syncRoot,
		);
		this.#pendingOperationCount = pendingOperations.operations.length;
		if (this.#isOffline()) {
			await this.#pauseForVerification("offline");
			return this.getStatus();
		}
		let queueDrained: boolean;
		try {
			queueDrained = await this.#flushQueue();
		} catch (error) {
			await this.#pauseForStartupError(error);
			return this.getStatus();
		}
		if (!queueDrained) {
			this.#state = "error";
			return this.getStatus();
		}
		try {
			await this.#resumePendingTrashOperations();
			const startupSafe = await this.#reconcileStartupDrift();
			if (!startupSafe) return this.getStatus();
			const projectionSafe = await this.#verifyProjectionPlan();
			if (!projectionSafe) return this.getStatus();
		} catch (error) {
			await this.#pauseForStartupError(error);
			return this.getStatus();
		}

		try {
			await this.#materialize(connectionGeneration);
		} catch (error) {
			if (!(error instanceof ProjectionGuardConflict)) throw error;
			await this.#recordGuardConflict(error);
			return this.getStatus();
		}
		this.#startCloudSubscriptions(deploymentUrl, authToken);

		this.#heartbeatTimer = setInterval(() => {
			void this.#heartbeat();
		}, HEARTBEAT_MS);
		if (typeof this.#heartbeatTimer.unref === "function") {
			this.#heartbeatTimer.unref();
		}

		if (this.#createWatcher) {
			this.#watcher = this.#createWatcher({
				syncRoot,
				onEvent: (event) => this.#onRawEvent(event),
			});
		}

		this.#state = "connected";
		this.#verificationReason = null;
		this.#startupIncomplete = false;
		return this.getStatus();
	}

	async #resumeStartupAfterReview(): Promise<void> {
		const input = this.#connectInput;
		if (!this.#startupIncomplete || !input) return;
		const manifest = await loadProjectionOperations(this.#fs, input.syncRoot);
		if (
			manifest.operations.some((operation) => operation.kind !== "trash-undo")
		) {
			return;
		}
		await this.connect(input);
	}

	#mountIdentity(): SyncedFolderMountIdentity {
		switch (this.#scope.kind) {
			case "all-accessible":
				return { kind: "workspace-mirror" };
			case "workspace":
				return {
					kind: "workspace",
					workspaceId: this.#scope.workspaceId,
				};
			case "folder":
				return { kind: "folder", folderId: this.#scope.folderId };
		}
	}

	#planProjection(backend: SyncBackend, syncRoot: string) {
		switch (this.#scope.kind) {
			case "all-accessible":
				return planSyncedFolder(backend, { syncRoot });
			case "workspace":
				return planWorkspaceRoot(backend, {
					syncRoot,
					workspaceId: this.#scope.workspaceId,
				});
			case "folder":
				return planMountFolder(backend, {
					syncRoot,
					folderId: this.#scope.folderId,
				});
		}
	}

	#materializeProjection(
		backend: SyncBackend,
		fs: Pick<
			FileSystem,
			"ensureDir" | "writeFile" | "readFileOrNull" | "setReadOnly"
		>,
		syncRoot: string,
	) {
		switch (this.#scope.kind) {
			case "all-accessible":
				return materializeSyncedFolder(backend, fs, { syncRoot });
			case "workspace":
				return materializeWorkspaceRoot(backend, fs, {
					syncRoot,
					workspaceId: this.#scope.workspaceId,
				});
			case "folder":
				return materializeMountFolder(backend, fs, {
					syncRoot,
					folderId: this.#scope.folderId,
				});
		}
	}

	async #pauseForStartupError(error: unknown): Promise<void> {
		const message = error instanceof Error ? error.message : String(error);
		const accessFailure =
			/auth|unauthori[sz]ed|forbidden|permission|access/i.test(message);
		const networkFailure =
			this.#isOffline() ||
			/fetch|network|offline|timed? out|unavailable|connection/i.test(message);
		if (accessFailure || networkFailure) {
			await this.#pauseForVerification(accessFailure ? "access" : "offline");
			return;
		}
		this.#lastError = message;
		this.#state = "error";
		this.#recordEvent({ kind: "error" });
	}

	async #pauseForVerification(reason: "offline" | "access"): Promise<void> {
		const manifest = this.#indexManifest;
		const syncRoot = this.#syncRoot;
		this.#verificationReason = reason;
		this.#state = reason === "offline" ? "offline" : "pending-review";
		this.#lastError =
			reason === "offline"
				? "Cloud state could not be verified while offline; local files were left untouched."
				: "Current cloud access could not be verified; local files were left untouched.";
		if (manifest && syncRoot) {
			manifest.verification = {
				state: "pending",
				reason,
				updatedAt: this.#now(),
			};
			await saveSyncedFolderIndexManifest(this.#fs, syncRoot, manifest);
		}
	}

	async #verifyProjectionPlan(): Promise<boolean> {
		const backend = this.#backend;
		const syncRoot = this.#syncRoot;
		if (!backend || !syncRoot) return false;
		const plan = await this.#planProjection(backend, syncRoot);
		const comparison = await compareProjectionPlanWithDisk(
			this.#fs,
			syncRoot,
			plan,
			this.#index,
		);
		const operations = comparison.collisions.map(({ path, file }) => {
			const entry = plan[path];
			if (!entry)
				throw new Error(`Missing desired projection entry for ${path}`);
			return {
				kind: "path-collision" as const,
				documentId: entry.documentId,
				workspaceId: entry.workspaceId,
				folderId: entry.folderId,
				path,
				localHash: file.hash,
				desiredHash: entry.hash,
			};
		});
		const manifest = await saveProjectionOperations(
			this.#fs,
			syncRoot,
			operations,
			this.#now(),
		);
		this.#pendingOperationCount = manifest.operations.length;
		const blockers = manifest.operations.filter(
			(operation) => operation.kind !== "trash-undo",
		);
		if (blockers.length === 0) {
			this.#startupProjectionPlan = plan;
			this.#startupProjectionSnapshot = await captureProjectionSnapshot(
				this.#fs,
				plan,
			);
			return true;
		}
		this.#lastError =
			comparison.collisions.length > 0
				? `Startup verification found ${comparison.collisions.length} untracked Markdown path collision${comparison.collisions.length === 1 ? "" : "s"}; cloud materialization is paused to preserve local files.`
				: "A pending filesystem operation requires review before cloud materialization can continue.";
		this.#state = "pending-review";
		this.#recordEvent({ kind: "error" });
		return false;
	}

	async #recordGuardConflict(error: ProjectionGuardConflict): Promise<void> {
		const syncRoot = this.#syncRoot;
		const plan = this.#startupProjectionPlan;
		const entry = plan?.[error.path];
		if (!syncRoot || !entry) return;
		const manifest = await saveProjectionOperations(
			this.#fs,
			syncRoot,
			[
				{
					kind: "guard-conflict",
					documentId: entry.documentId,
					workspaceId: entry.workspaceId,
					folderId: entry.folderId,
					path: error.path,
					expectedHash: error.expectedHash,
					actualHash: error.actualHash,
					desiredHash: entry.hash,
				},
			],
			this.#now(),
		);
		this.#pendingOperationCount = manifest.operations.length;
		this.#lastError = `Projection destination changed after startup verification; materialization paused without overwriting ${error.path}.`;
		this.#state = "pending-review";
		this.#recordEvent({ kind: "error" });
	}

	async #reconcileStartupDrift(): Promise<boolean> {
		const backend = this.#backend;
		const syncRoot = this.#syncRoot;
		if (!backend || !syncRoot) return false;

		const drift = await inspectStartupProjectionDrift(this.#fs, this.#index);
		const correlation = await correlateStartupProjectionMoves(
			this.#fs,
			syncRoot,
			this.#index,
			drift,
			this.#statInode,
		);
		const blockers = [
			...correlation.missing.map(({ path, entry }) => ({
				kind: "missing-document" as const,
				documentId: entry.documentId,
				workspaceId: entry.workspaceId,
				folderId: entry.folderId,
				path,
				baseHash: entry.hash,
			})),
			...correlation.moves.map((move) => ({
				kind: "startup-move" as const,
				documentId: move.entry.documentId,
				workspaceId: move.entry.workspaceId,
				folderId: move.entry.folderId,
				path: move.fromPath,
				toPath: move.toPath,
				matchedBy: move.matchedBy,
			})),
			...correlation.ambiguous.map(({ path, entry, candidatePaths }) => ({
				kind: "ambiguous-startup-move" as const,
				documentId: entry.documentId,
				workspaceId: entry.workspaceId,
				folderId: entry.folderId,
				path,
				candidatePaths,
			})),
		];
		if (blockers.length > 0) {
			const manifest = await saveProjectionOperations(
				this.#fs,
				syncRoot,
				blockers,
				this.#now(),
			);
			this.#pendingOperationCount = manifest.operations.length;
			this.#lastError = `Startup verification found ${blockers.length} pending filesystem operation${blockers.length === 1 ? "" : "s"}; cloud materialization is paused for review.`;
			this.#state = "pending-review";
			this.#recordEvent({ kind: "error" });
			return false;
		}

		for (const item of drift) {
			if (item.kind !== "changed") continue;
			const outcome = await reconcileProjectionFile(backend, this.#fs, {
				documentId: item.entry.documentId,
				projectionPath: item.path,
				workspacePath: syncRoot,
				actor: "startup-reconcile",
			});
			if (outcome.status === "backstop") {
				this.#lastError = `Startup verification could not safely reconcile ${item.path} (${outcome.reason}); cloud materialization is paused.`;
				this.#state = "error";
				this.#recordEvent({ kind: "error" });
				return false;
			}
			if (outcome.status === "reconciled") {
				await this.#refreshIndexEntry(item.path, outcome.markdown);
				this.#recordEvent({ kind: "reconciled" });
			}
		}
		return true;
	}

	async disconnect(): Promise<SyncedFolderStatus> {
		this.#connectionGeneration += 1;
		await this.#stopCloudSubscriptions();
		if (this.#watcher) {
			await this.#watcher.close();
			this.#watcher = null;
		}
		if (this.#heartbeatTimer) {
			clearInterval(this.#heartbeatTimer);
			this.#heartbeatTimer = null;
		}
		if (this.#flushTimer) {
			clearTimeout(this.#flushTimer);
			this.#flushTimer = null;
		}
		if (this.#cloudMaterializeTimer) {
			clearTimeout(this.#cloudMaterializeTimer);
			this.#cloudMaterializeTimer = null;
		}
		for (const timer of this.#changeTimers.values()) clearTimeout(timer);
		this.#changeTimers.clear();
		this.#cloudMaterializeRunning = false;
		this.#cloudMaterializePending = false;

		if (this.#syncRoot) {
			await releaseSingleWriterLock(this.#fs, this.#syncRoot, this.#deviceId);
		}

		this.#backend = null;
		this.#syncRoot = null;
		this.#index = {};
		this.#indexManifest = null;
		this.#pendingOperationCount = 0;
		this.#connectInput = null;
		this.#startupIncomplete = false;
		this.#verificationReason = null;
		this.#startupProjectionPlan = null;
		this.#startupProjectionSnapshot = null;
		this.#heldUnlinks = [];
		this.#recentlyWrittenByUs.clear();
		this.#state = "idle";
		return this.getStatus();
	}

	/**
	 * Re-run the full materialize pass and reload the index (cloud → disk).
	 * Steady-state updates arrive through the root-scoped Convex subscription;
	 * this remains the explicit/manual refresh seam.
	 */
	async refresh(): Promise<SyncedFolderStatus> {
		if (!this.#backend || !this.#syncRoot) {
			throw new Error("Synced folder is not connected; call connect() first.");
		}
		await this.#materialize();
		return this.getStatus();
	}

	async #materialize(
		connectionGeneration = this.#connectionGeneration,
	): Promise<void> {
		if (this.#materializeTask) {
			await this.#materializeTask;
			return;
		}
		const task = this.#performMaterialize(connectionGeneration);
		this.#materializeTask = task;
		try {
			await task;
		} finally {
			if (this.#materializeTask === task) this.#materializeTask = null;
		}
	}

	async #performMaterialize(connectionGeneration: number): Promise<void> {
		const backend = this.#backend;
		const syncRoot = this.#syncRoot;
		if (!backend || !syncRoot) return;
		const previous = this.#index;
		const snapshot = this.#startupProjectionSnapshot;
		this.#startupProjectionSnapshot = null;
		const materializeBackend = snapshot
			? backend
			: memoizeProjectionBackend(backend);
		if (!snapshot) {
			const plan = await this.#planProjection(materializeBackend, syncRoot);
			const comparison = await compareProjectionPlanWithDisk(
				this.#fs,
				syncRoot,
				plan,
				previous,
			);
			if (comparison.collisions.length > 0) {
				for (const { path, file } of comparison.collisions) {
					const entry = plan[path];
					if (!entry) continue;
					await upsertProjectionOperation(
						this.#fs,
						syncRoot,
						{
							kind: "path-collision",
							documentId: entry.documentId,
							workspaceId: entry.workspaceId,
							folderId: entry.folderId,
							path,
							localHash: file.hash,
							desiredHash: entry.hash,
						},
						this.#now(),
					);
				}
				const manifest = await loadProjectionOperations(this.#fs, syncRoot);
				this.#pendingOperationCount = manifest.operations.length;
				this.#state = "pending-review";
				this.#lastError =
					"Cloud restore paused because its local path is occupied; both versions were preserved.";
				this.#recordEvent({ kind: "error" });
				return;
			}
		}
		const projectionFs = snapshot
			? guardProjectionFileSystem(this.#fs, snapshot)
			: this.#fs;
		const result = await this.#materializeProjection(
			materializeBackend,
			projectionFs,
			syncRoot,
		);
		if (
			connectionGeneration !== this.#connectionGeneration ||
			backend !== this.#backend ||
			syncRoot !== this.#syncRoot
		) {
			return;
		}
		// Fill `inode` (Phase 3a left it null) and seed self-write suppression so
		// the watcher never re-classifies the materializer's own writes.
		const now = this.#now();
		for (const [absPath, entry] of Object.entries(result.index)) {
			entry.inode = this.#statInode(absPath);
			this.#recentlyWrittenByUs.set(absPath, { hash: entry.hash, at: now });
		}
		const manifest = this.#indexManifest ?? {
			version: 2 as const,
			mount: this.#mountIdentity(),
			syncRoot,
			topology: [],
			verification: {
				state: "verified" as const,
				reason: null,
				updatedAt: now,
			},
			entries: {},
		};
		manifest.entries = result.index;
		manifest.topology =
			result.topology.length > 0
				? result.topology
				: projectionTopology(syncRoot, result.index);
		manifest.verification = { state: "verified", reason: null, updatedAt: now };
		await saveSyncedFolderIndexManifest(this.#fs, syncRoot, manifest);
		this.#indexManifest = manifest;
		this.#index = result.index;
		this.#lastReconcileAt = this.#now();

		// ── Access-loss (§6 case 1, MATERIALIZE-origin direction) ──────────────
		// A doc that was in the previous index but is absent from the freshly
		// materialized desired set: the user lost access while the doc still
		// exists in the cloud (a revoked share, a removed membership, or a
		// cloud-trash). This is the ONE cloud-driven removal signal. It is kept
		// strictly separate from the watcher's local-delete (`#route` `case
		// "delete"`): a local `unlink` drops its own index entry inside that
		// route *before* the next materialize, so it can never re-surface here.
		// Therefore everything `diff.removed` reports is access-loss → trash the
		// local bytes, NEVER call `removeDocument`.
		const diff = diffSyncedFolderIndex(result.index, previous);
		for (const { path, entry } of diff.removed) {
			const moved = findIndexEntryByDocumentId(result.index, entry.documentId);
			if (moved) {
				await this.#handleCloudPathChange(path, moved.path);
				continue;
			}
			await this.#handleAccessLoss(path, entry);
		}
	}

	async #saveCurrentIndex(): Promise<void> {
		const syncRoot = this.#syncRoot;
		const manifest = this.#indexManifest;
		if (!syncRoot || !manifest) return;
		manifest.entries = this.#index;
		manifest.topology = projectionTopology(syncRoot, this.#index);
		await saveSyncedFolderIndexManifest(this.#fs, syncRoot, manifest);
	}

	#startCloudSubscriptions(deploymentUrl: string, authToken: string): void {
		this.#subscriber = this.#createSubscriber(deploymentUrl, authToken);
		this.#unsubscribeSyncedFolder = this.#subscriber.onSyncedFolderChanged(
			this.#scope,
			() => this.#scheduleCloudMaterialize(),
			(error) => this.#handleSubscriptionError(error),
		);
	}

	async #stopCloudSubscriptions(): Promise<void> {
		if (this.#unsubscribeSyncedFolder) {
			this.#unsubscribeSyncedFolder();
			this.#unsubscribeSyncedFolder = null;
		}
		if (this.#subscriber) {
			await this.#subscriber.close();
			this.#subscriber = null;
		}
	}

	#scheduleCloudMaterialize(): void {
		if (!this.#backend || !this.#syncRoot) return;
		if (this.#cloudMaterializeTimer) {
			clearTimeout(this.#cloudMaterializeTimer);
		}
		this.#cloudMaterializeTimer = setTimeout(() => {
			this.#cloudMaterializeTimer = null;
			void this.#runCloudMaterialize(this.#connectionGeneration);
		}, CLOUD_MATERIALIZE_DEBOUNCE_MS);
		if (typeof this.#cloudMaterializeTimer.unref === "function") {
			this.#cloudMaterializeTimer.unref();
		}
	}

	async #runCloudMaterialize(connectionGeneration: number): Promise<void> {
		if (connectionGeneration !== this.#connectionGeneration) return;
		if (this.#pendingOperationCount > 0) {
			this.#state = "pending-review";
			return;
		}
		if (this.#cloudMaterializeRunning) {
			this.#cloudMaterializePending = true;
			return;
		}
		this.#cloudMaterializeRunning = true;
		this.#state = "syncing";
		try {
			await this.#materialize(connectionGeneration);
			this.#lastError = null;
			this.#state = this.connected ? "connected" : "idle";
		} catch (error) {
			this.#lastError = error instanceof Error ? error.message : String(error);
			this.#state = "error";
			this.#recordEvent({ kind: "error" });
		} finally {
			this.#cloudMaterializeRunning = false;
		}
		if (this.#cloudMaterializePending) {
			this.#cloudMaterializePending = false;
			this.#scheduleCloudMaterialize();
		}
	}

	#handleSubscriptionError(error: Error): void {
		this.#lastError = error.message;
		this.#state = "error";
		this.#recordEvent({ kind: "error" });
	}

	async #heartbeat(): Promise<void> {
		if (!this.#syncRoot) return;
		const result = await heartbeatSingleWriterLock(this.#fs, this.#syncRoot, {
			deviceId: this.#deviceId,
			pid: this.#pid,
			now: this.#now(),
		}).catch(() => {});
		if (!result || result.acquired) return;
		this.#lastError = `Already syncing this folder on device ${result.current?.deviceId ?? "another device"}`;
		this.#state = "error";
		this.#recordEvent({ kind: "error" });
		await this.#stopAfterLockLoss();
	}

	async #stopAfterLockLoss(): Promise<void> {
		this.#connectionGeneration += 1;
		await this.#stopCloudSubscriptions();
		if (this.#watcher) {
			await this.#watcher.close();
			this.#watcher = null;
		}
		if (this.#heartbeatTimer) {
			clearInterval(this.#heartbeatTimer);
			this.#heartbeatTimer = null;
		}
		if (this.#flushTimer) {
			clearTimeout(this.#flushTimer);
			this.#flushTimer = null;
		}
		if (this.#cloudMaterializeTimer) {
			clearTimeout(this.#cloudMaterializeTimer);
			this.#cloudMaterializeTimer = null;
		}
		for (const timer of this.#changeTimers.values()) clearTimeout(timer);
		this.#changeTimers.clear();
		this.#cloudMaterializeRunning = false;
		this.#cloudMaterializePending = false;
		this.#backend = null;
	}

	// ─── Raw event intake (production watcher) ─────────────────────────────────

	/**
	 * Production entry point from the chokidar watcher: stat the file for
	 * inode/hash, debounce `change` bursts, then route. `add`/`unlink` are routed
	 * promptly so the rename/move correlation window stays tight.
	 */
	#onRawEvent(event: RawWatcherEvent): void {
		if (!this.#syncRoot) return;
		if (shouldIgnoreSyncedPath(event.absPath, this.#syncRoot)) return;

		if (this.#isOffline()) {
			if (event.type === "unlink" && this.#index[event.absPath]) {
				void this.#queueDeletionReview(
					[{ absPath: event.absPath, entry: this.#index[event.absPath] }],
					"offline",
				);
			} else {
				void this.#enqueue(event);
			}
			return;
		}

		if (event.type === "change") {
			const existing = this.#changeTimers.get(event.absPath);
			if (existing) clearTimeout(existing);
			const timer = setTimeout(() => {
				this.#changeTimers.delete(event.absPath);
				void this.handleRawEvent(event);
			}, CHANGE_DEBOUNCE_MS);
			this.#changeTimers.set(event.absPath, timer);
			return;
		}
		void this.handleRawEvent(event);
	}

	/**
	 * Classify and route a single raw event. Pure-ish: classification is fully
	 * deterministic over the loaded index + held unlinks + self-write set; only
	 * the backend calls and index writes are effects. Directly callable from
	 * tests (no chokidar required).
	 */
	async handleRawEvent(event: RawWatcherEvent): Promise<void> {
		if (!this.#backend || !this.#syncRoot) return;
		if (this.#isOffline()) {
			const entry = this.#index[event.absPath];
			if (event.type === "unlink" && entry) {
				await this.#queueDeletionReview(
					[{ absPath: event.absPath, entry }],
					"offline",
				);
			} else {
				await this.#enqueue(event);
			}
			return;
		}
		await this.#handleRawEventOnline(event, true);
	}

	async #handleRawEventOnline(
		event: RawWatcherEvent,
		enqueueOnError: boolean,
	): Promise<void> {
		if (!this.#backend || !this.#syncRoot) return;
		// Chokidar can emit an `add` before a multi-file cloud materialize pass has
		// installed its new reverse index/self-write hashes. Wait for that atomic
		// boundary so our own file can never be classified as a new local document.
		if (this.#materializeTask) await this.#materializeTask;
		if (!this.#backend || !this.#syncRoot) return;
		this.#sweepSelfWrites();

		const decision = classifySyncedFolderChange(event, {
			syncRoot: this.#syncRoot,
			index: this.#index,
			topology: this.#indexManifest?.topology,
			heldUnlinks: this.#heldUnlinks,
			recentlyWrittenByUs: this.#recentlyWrittenByUs,
			correlationWindowMs: CORRELATION_WINDOW_MS,
		});

		this.#lastEventAt = this.#now();

		try {
			await this.#route(decision, event);
			this.#lastError = null;
		} catch (error) {
			this.#lastError = error instanceof Error ? error.message : String(error);
			this.#state = "error";
			if (enqueueOnError) {
				await this.#enqueue(event, this.#lastError);
			}
			this.#recordEvent({ kind: "error" });
		}
	}

	async #route(
		decision: ReturnType<typeof classifySyncedFolderChange>,
		event: RawWatcherEvent,
	): Promise<void> {
		const backend = this.#backend;
		const syncRoot = this.#syncRoot;
		if (!backend || !syncRoot) return;

		switch (decision.kind) {
			case "ignore":
				return;

			case "hold": {
				this.#heldUnlinks.push({
					absPath: decision.absPath,
					entry: decision.entry,
					at: event.at,
				});
				this.#scheduleFlush();
				return;
			}

			case "reconcile": {
				const outcome = await reconcileProjectionFile(backend, this.#fs, {
					documentId: decision.documentId,
					projectionPath: decision.absPath,
					workspacePath: syncRoot,
					actor: "file-reconcile",
				});
				if (outcome.status === "reconciled") {
					this.#markWrittenByUs(decision.absPath, outcome.markdown);
					await this.#refreshIndexEntry(decision.absPath, outcome.markdown);
					await this.#refreshPendingMoveHash(
						decision.documentId,
						outcome.markdown,
					);
					this.#recordEvent({ kind: "reconciled" });
				} else if (outcome.status === "backstop") {
					await this.#backstop(
						decision.absPath,
						outcome.documentId,
						outcome.reason,
					);
				}
				return;
			}

			case "rename": {
				const title = titleFromPath(decision.toPath);
				const path = this.#cloudDocumentPath(decision.toPath);
				const result = backend.prepareDocumentRelocation
					? await backend.prepareDocumentRelocation({
							documentId: decision.documentId,
							folderId: decision.entry.folderId,
							title,
							path,
						})
					: null;
				if (!result) {
					await backend.renameDocument(decision.documentId, {
						title,
						path,
						actor: "synced-folder",
					});
				}
				if (result?.status === "confirmation-required") {
					await this.#recordConsequentialMove(decision, result, title);
					return;
				}
				this.#rekey(decision.fromPath, decision.toPath, {});
				this.#recordEvent({ kind: "renamed" });
				return;
			}

			case "move": {
				const folderId = this.#resolveFolderIdForDir(dir(decision.toPath));
				const title = titleFromPath(decision.toPath);
				const path = this.#cloudDocumentPath(decision.toPath);
				const result = backend.prepareDocumentRelocation
					? await backend.prepareDocumentRelocation({
							documentId: decision.documentId,
							folderId,
							title,
							path,
						})
					: null;
				if (!result) {
					await backend.moveDocument(decision.documentId, folderId);
					await backend.renameDocument(decision.documentId, {
						title,
						path,
						actor: "synced-folder",
					});
				}
				if (result?.status === "confirmation-required") {
					await this.#recordConsequentialMove(
						decision,
						result,
						title,
						folderId,
					);
					return;
				}
				this.#rekey(decision.fromPath, decision.toPath, { folderId });
				this.#recordEvent({ kind: "moved" });
				return;
			}

			case "create": {
				const markdown = await this.#fs.readFile(decision.absPath);
				const markdownHash = await contentHash(markdown);
				const workspaceRelativePath = stripTopLevelWorkspaceDir(
					decision.relPath,
				);
				const imported = await backend.importLiveDocument({
					workspaceId: decision.workspaceId,
					folderId: decision.folderId ?? undefined,
					path: workspaceRelativePath,
					title: titleFromPath(decision.absPath),
					markdown,
					idempotencyKey: `synced-folder:${decision.workspaceId}:${decision.folderId ?? "root"}:${workspaceRelativePath}:${markdownHash}`,
					actor: "synced-folder",
				});
				await writeReconcileBase(this.#fs, syncRoot, imported.documentId, {
					markdown,
					revision: 0,
					path: decision.relPath,
				});
				this.#index[decision.absPath] = {
					documentId: imported.documentId,
					workspaceId: decision.workspaceId,
					folderId: decision.folderId,
					inode: this.#statInode(decision.absPath),
					hash: markdownHash,
					role: "editor",
				};
				this.#markWrittenByUs(decision.absPath, markdown);
				await this.#saveCurrentIndex();
				this.#recordEvent({ kind: "created" });
				return;
			}

			case "delete": {
				// ── Local delete (§6 case 1, WATCHER-origin direction) ───────────
				// The user removed the file and the rename/move correlation window
				// expired. This is the ONLY entry point that calls the cloud
				// soft-delete; access-loss (materialize-origin) is handled in
				// `#materialize` and NEVER reaches here. Keeping the two directions
				// in two distinct routes is the data-loss-critical guarantee.
				await this.#trashDocument(decision.absPath, decision.entry);
				return;
			}
		}
	}

	async #replaceDeletionReview(
		operation: DeletionReviewOperation,
		items: DeletionReviewOperation["items"],
	): Promise<void> {
		const syncRoot = this.#syncRoot;
		if (!syncRoot) return;
		const remainingIds = new Set(items.map((item) => item.documentId));
		const resolvedIds = new Set(
			operation.items
				.filter((item) => !remainingIds.has(item.documentId))
				.map((item) => item.documentId),
		);
		const before = await loadProjectionOperations(this.#fs, syncRoot);
		for (const blocker of before.operations) {
			if (
				blocker.kind === "missing-document" &&
				resolvedIds.has(blocker.documentId)
			) {
				await removeProjectionOperation(this.#fs, syncRoot, blocker.id);
			}
		}
		if (items.length === 0) {
			await removeProjectionOperation(this.#fs, syncRoot, operation.id);
		} else {
			await upsertProjectionOperation(
				this.#fs,
				syncRoot,
				{
					kind: "deletion-review",
					documentId: operation.documentId,
					workspaceId: operation.workspaceId,
					folderId: operation.folderId,
					path: operation.path,
					reason: operation.reason,
					items,
				},
				this.#now(),
			);
		}
		const manifest = await loadProjectionOperations(this.#fs, syncRoot);
		this.#pendingOperationCount = manifest.operations.length;
		const hasBlocker = manifest.operations.some(
			(candidate) => candidate.kind !== "trash-undo",
		);
		if (!hasBlocker && this.connected) this.#state = "connected";
	}

	async #trashDocument(
		path: string,
		entry: SyncedFolderIndexEntry,
	): Promise<void> {
		const syncRoot = this.#syncRoot;
		const backend = this.#backend;
		if (!syncRoot || !backend) return;
		const pending = await upsertProjectionOperation(
			this.#fs,
			syncRoot,
			{
				kind: "trash-undo",
				documentId: entry.documentId,
				workspaceId: entry.workspaceId,
				folderId: entry.folderId,
				path,
				phase: "pending-trash",
				trashedAt: null,
			},
			this.#now(),
		);
		this.#pendingOperationCount = pending.operations.length;
		delete this.#index[path];
		await this.#dropBaseCache(entry.documentId);
		await this.#saveCurrentIndex();
		await backend.removeDocument(entry.documentId, "synced-folder");
		const available = await upsertProjectionOperation(
			this.#fs,
			syncRoot,
			{
				kind: "trash-undo",
				documentId: entry.documentId,
				workspaceId: entry.workspaceId,
				folderId: entry.folderId,
				path,
				phase: "undo-available",
				trashedAt: this.#now(),
			},
			this.#now(),
		);
		this.#pendingOperationCount = available.operations.length;
		const operation = pending.operations.find(
			(candidate) =>
				candidate.kind === "trash-undo" &&
				candidate.documentId === entry.documentId,
		);
		this.#recordEvent({
			kind: "trashed-local",
			operationId: operation?.id ?? "",
		});
	}

	async #resumePendingTrashOperations(): Promise<void> {
		const syncRoot = this.#syncRoot;
		const backend = this.#backend;
		if (!syncRoot || !backend) return;
		const current = await loadProjectionOperations(this.#fs, syncRoot);
		for (const operation of current.operations) {
			if (
				operation.kind !== "trash-undo" ||
				operation.phase !== "pending-trash"
			) {
				continue;
			}
			delete this.#index[operation.path];
			await this.#dropBaseCache(operation.documentId);
			await this.#saveCurrentIndex();
			await backend.removeDocument(
				operation.documentId,
				"synced-folder-resume",
			);
			await upsertProjectionOperation(
				this.#fs,
				syncRoot,
				{
					kind: "trash-undo",
					documentId: operation.documentId,
					workspaceId: operation.workspaceId,
					folderId: operation.folderId,
					path: operation.path,
					phase: "undo-available",
					trashedAt: this.#now(),
				},
				this.#now(),
			);
		}
		const manifest = await loadProjectionOperations(this.#fs, syncRoot);
		this.#pendingOperationCount = manifest.operations.length;
	}

	async #recordConsequentialMove(
		decision: Extract<
			ReturnType<typeof classifySyncedFolderChange>,
			{ kind: "rename" | "move" }
		>,
		result: Extract<
			Awaited<
				ReturnType<NonNullable<SyncBackend["prepareDocumentRelocation"]>>
			>,
			{ status: "confirmation-required" }
		>,
		title: string,
		folderId = decision.entry.folderId,
	): Promise<void> {
		const syncRoot = this.#syncRoot;
		if (!syncRoot) return;
		const markdown = await this.#fs.readFile(decision.toPath);
		const manifest = await upsertProjectionOperation(
			this.#fs,
			syncRoot,
			{
				kind: "consequential-move",
				documentId: decision.documentId,
				workspaceId: decision.entry.workspaceId,
				folderId: decision.entry.folderId,
				path: decision.fromPath,
				toPath: decision.toPath,
				toFolderId: folderId,
				title,
				fingerprint: result.fingerprint,
				impact: result.impact,
				latestHash: await contentHash(markdown),
			},
			this.#now(),
		);
		this.#pendingOperationCount = manifest.operations.length;
		this.#state = "pending-review";
		this.#rekey(decision.fromPath, decision.toPath, { folderId });
		const operation = manifest.operations.find(
			(candidate) =>
				candidate.kind === "consequential-move" &&
				candidate.documentId === decision.documentId,
		);
		if (operation) {
			this.#recordEvent({
				kind: "move-review-required",
				operationId: operation.id,
			});
		}
	}

	async #refreshPendingMoveHash(
		documentId: string,
		markdown: string,
	): Promise<void> {
		const syncRoot = this.#syncRoot;
		if (!syncRoot) return;
		const current = await loadProjectionOperations(this.#fs, syncRoot);
		const operation = current.operations.find(
			(candidate) =>
				candidate.kind === "consequential-move" &&
				candidate.documentId === documentId,
		);
		if (!operation || operation.kind !== "consequential-move") return;
		const {
			id: _id,
			state: _state,
			createdAt: _createdAt,
			updatedAt: _updatedAt,
			...input
		} = operation;
		const manifest = await upsertProjectionOperation(
			this.#fs,
			syncRoot,
			{ ...input, latestHash: await contentHash(markdown) },
			this.#now(),
		);
		this.#pendingOperationCount = manifest.operations.length;
	}

	#scheduleFlush(): void {
		if (this.#flushTimer) return;
		this.#flushTimer = setTimeout(() => {
			this.#flushTimer = null;
			void this.flushHeldUnlinks(this.#now());
		}, CORRELATION_WINDOW_MS + 50);
		if (typeof this.#flushTimer.unref === "function") this.#flushTimer.unref();
	}

	/**
	 * Resolve expired held unlinks into local deletes (§2 step 3). Exposed so
	 * tests can drive the correlation window deterministically.
	 */
	async flushHeldUnlinks(now: number): Promise<void> {
		const { expired, remaining } = flushExpiredUnlinks(
			this.#heldUnlinks,
			now,
			CORRELATION_WINDOW_MS,
		);
		this.#heldUnlinks = remaining;
		const deletions = expired.filter((decision) => decision.kind === "delete");
		const writable = deletions.filter(
			({ entry }) => entry.role === "owner" || entry.role === "editor",
		);
		const rootAvailable = this.#isPathAvailable(this.#syncRoot ?? "");
		const parentsAvailable = deletions.every(({ absPath }) =>
			this.#isPathAvailable(dirname(absPath)),
		);
		if (!rootAvailable) {
			await this.#recordDeletionReview(deletions, "root");
		} else if (!parentsAvailable) {
			await this.#recordDeletionReview(deletions, "storage");
		} else if (deletions.length === 1 && writable.length === 1) {
			await this.#route(deletions[0], {
				type: "unlink",
				absPath: deletions[0].absPath,
				at: now,
			});
		} else if (deletions.length > 0) {
			await this.#recordDeletionReview(
				deletions,
				deletions.length > 1 ? "bulk" : "read-only",
			);
		}
		if (remaining.length > 0) this.#scheduleFlush();
	}

	async #recordDeletionReview(
		deletions: Array<{
			absPath: string;
			entry: SyncedFolderIndexEntry;
		}>,
		reason: "offline" | "bulk" | "read-only" | "storage" | "root",
	): Promise<void> {
		const syncRoot = this.#syncRoot;
		const first = deletions[0];
		if (!syncRoot || !first) return;
		const current = await loadProjectionOperations(this.#fs, syncRoot);
		const offlineCandidate =
			reason === "offline"
				? current.operations.find(
						(operation) =>
							operation.kind === "deletion-review" &&
							operation.reason === "offline",
					)
				: undefined;
		const existingOffline =
			offlineCandidate?.kind === "deletion-review"
				? offlineCandidate
				: undefined;
		const items = new Map(
			(existingOffline?.items ?? []).map((item) => [item.documentId, item]),
		);
		for (const { absPath, entry } of deletions) {
			items.set(entry.documentId, {
				documentId: entry.documentId,
				path: absPath,
				role: entry.role,
				workspaceId: entry.workspaceId,
				folderId: entry.folderId,
			});
		}
		const manifest = await upsertProjectionOperation(
			this.#fs,
			syncRoot,
			{
				kind: "deletion-review",
				documentId: existingOffline?.documentId ?? first.entry.documentId,
				workspaceId: existingOffline?.workspaceId ?? first.entry.workspaceId,
				folderId: existingOffline?.folderId ?? first.entry.folderId,
				path: existingOffline?.path ?? first.absPath,
				reason,
				items: [...items.values()],
			},
			this.#now(),
		);
		this.#pendingOperationCount = manifest.operations.length;
		this.#state = "pending-review";
		this.#recordEvent({ kind: "deletion-review-required" });
	}

	#queueDeletionReview(
		deletions: Array<{ absPath: string; entry: SyncedFolderIndexEntry }>,
		reason: "offline" | "bulk" | "read-only" | "storage" | "root",
	): Promise<void> {
		// Watcher callbacks are intentionally fire-and-forget. Serialize journal
		// updates so simultaneous offline unlinks cannot overwrite one another.
		const task = this.#operationTask.then(() =>
			this.#recordDeletionReview(deletions, reason),
		);
		this.#operationTask = task.catch(() => {});
		return task;
	}

	#markWrittenByUs(absPath: string, markdown: string): void {
		void contentHash(markdown).then((hash) => {
			this.#recentlyWrittenByUs.set(absPath, { hash, at: this.#now() });
		});
	}

	#sweepSelfWrites(): void {
		const cutoff = this.#now() - SELF_WRITE_TTL_MS;
		for (const [path, value] of this.#recentlyWrittenByUs) {
			if (value.at < cutoff) this.#recentlyWrittenByUs.delete(path);
		}
	}

	async #refreshIndexEntry(absPath: string, markdown: string): Promise<void> {
		const entry = this.#index[absPath];
		if (!entry) return;
		entry.hash = await contentHash(markdown);
		entry.inode = this.#statInode(absPath);
		if (this.#syncRoot) {
			await this.#saveCurrentIndex();
		}
	}

	/**
	 * Backstop host (§6 case 3). Reconcile could not be safely scoped
	 * (`missing-base`) or the doc is read-only (`read-only`). Never a silent
	 * clobber and never lost user bytes:
	 *  1. write the on-disk bytes to a `*.local-edit-<ts>` sibling so the user's
	 *     copy sits right next to the doc;
	 *  2. re-materialize the authoritative cloud markdown over the projection
	 *     path (re-applying the read-only chmod by role);
	 *  3. refresh the base cache + reverse-index entry so the next save diffs
	 *     cleanly against authoritative;
	 *  4. surface it — `read-only` is its own `read-only-rejected` signal (a write
	 *     to a doc the user cannot edit), everything else is a `backstop`.
	 *
	 * A read-only doc never reaches `applyPatch`: `reconcileProjectionFile`
	 * refuses it (re-checked against `getDocumentForAgent`) and returns the
	 * `read-only` backstop before any cloud write — this host only reacts to it.
	 */
	async #backstop(
		absPath: string,
		documentId: string,
		reason: BackstopReason,
	): Promise<void> {
		const syncRoot = this.#syncRoot;
		const backend = this.#backend;
		if (!syncRoot || !backend) return;

		// 1. Preserve the user's on-disk bytes in a sibling copy.
		const onDisk = await this.#fs.readFileOrNull(absPath);
		if (onDisk !== null) {
			const sibling = toLocalEditName(absPath);
			if (this.#fs.setReadOnly) {
				await this.#fs.setReadOnly(sibling, false).catch(() => {});
			}
			await this.#fs.writeFile(sibling, onDisk);
			this.#markWrittenByUs(sibling, onDisk);
		}

		// 2. Re-materialize the authoritative markdown over the projection path.
		const authoritative = await backend.getDocumentForAgent(documentId);
		if (authoritative) {
			if (this.#fs.setReadOnly) {
				await this.#fs.setReadOnly(absPath, false).catch(() => {});
			}
			await this.#fs.writeFile(absPath, authoritative.markdown);
			if (this.#fs.setReadOnly) {
				await this.#fs.setReadOnly(absPath, authoritative.canWrite === false);
			}
			// 3. Refresh base cache + index so the next reconcile starts clean.
			await writeReconcileBase(this.#fs, syncRoot, documentId, {
				markdown: authoritative.markdown,
				revision: authoritative.revision,
				path: relPath(syncRoot, absPath),
			});
			this.#markWrittenByUs(absPath, authoritative.markdown);
			await this.#refreshIndexEntry(absPath, authoritative.markdown);
		}

		// 4. Surface the right signal.
		if (reason === "read-only") {
			this.#recordEvent({ kind: "read-only-rejected" });
		} else {
			this.#recordEvent({ kind: "backstop", reason });
		}
	}

	/**
	 * Access-loss handler (§6 case 1, MATERIALIZE-origin). The doc left the
	 * desired cloud set while still existing in the cloud (revoked share, removed
	 * membership, cloud trash). Move the local bytes to `.hubble/trash/` — NEVER
	 * hard-delete the user's file — drop the index + base-cache entries, and emit
	 * `removed-access`. This path NEVER calls `removeDocument`: the cloud copy is
	 * untouched, and restore happens by the doc re-entering the desired set on a
	 * later materialize (which recreates the file).
	 */
	async #handleAccessLoss(
		absPath: string,
		entry: SyncedFolderIndexEntry,
	): Promise<void> {
		const syncRoot = this.#syncRoot;
		if (!syncRoot) return;

		const trashState = this.#backend?.getDocumentTrashState
			? await this.#backend.getDocumentTrashState(entry.documentId)
			: "inaccessible";
		const bytes = await this.#fs.readFileOrNull(absPath);
		if (bytes !== null) {
			if (trashState !== "trashed") {
				const trashDir = `${syncRoot}/${TRASH_DIR_REL}`;
				await this.#fs.ensureDir(trashDir);
				await this.#fs.writeFile(
					`${trashDir}/${entry.documentId}__${basename(absPath)}`,
					bytes,
				);
			}
			if (this.#fs.setReadOnly) {
				await this.#fs.setReadOnly(absPath, false).catch(() => {});
			}
			await this.#fs.deleteFile(absPath);
		}

		delete this.#index[absPath];
		await this.#dropBaseCache(entry.documentId);
		await this.#saveCurrentIndex();
		this.#recordEvent({
			kind:
				trashState === "trashed" ? "removed-remote-trash" : "removed-access",
		});
	}

	/**
	 * The document still exists in the desired cloud set under a different path
	 * (cloud rename/move, or the echo of our own local rename). Clean up the old
	 * projection path, but do not treat it as access loss: no trash copy, no base
	 * cache drop, and never a cloud delete.
	 */
	async #handleCloudPathChange(
		fromPath: string,
		toPath: string,
	): Promise<void> {
		if (fromPath === toPath) return;
		const bytes = await this.#fs.readFileOrNull(fromPath);
		if (bytes === null) return;
		if (this.#fs.setReadOnly) {
			await this.#fs.setReadOnly(fromPath, false).catch(() => {});
		}
		await this.#fs.deleteFile(fromPath);
		this.#recentlyWrittenByUs.delete(fromPath);
		this.#heldUnlinks = this.#heldUnlinks.filter((h) => h.absPath !== fromPath);
	}

	/** Delete a per-document reconcile base cache (markdown + metadata). */
	async #dropBaseCache(documentId: string): Promise<void> {
		if (!this.#syncRoot) return;
		const root = liveDocumentBaseCacheRoot(this.#syncRoot);
		await this.#fs.deleteFile(`${root}/${documentId}.base.md`).catch(() => {});
		await this.#fs.deleteFile(`${root}/${documentId}.json`).catch(() => {});
	}

	// ─── Offline queue (RD6) ───────────────────────────────────────────────────

	async #enqueue(event: RawWatcherEvent, lastError?: string): Promise<void> {
		if (!this.#syncRoot) return;
		const manifest = await this.#readQueueManifest();
		manifest.events.push({
			...event,
			id: `${this.#now()}-${manifest.events.length}-${Math.random()
				.toString(36)
				.slice(2)}`,
			queuedAt: this.#now(),
			attempts: 0,
			...(lastError ? { lastError } : {}),
		});
		await this.#writeQueueManifest(manifest);
	}

	async #flushQueue(): Promise<boolean> {
		if (!this.#syncRoot) return true;
		const manifest = await this.#readQueueManifest();
		this.#telemetry.queuedEventCount = manifest.events.length;
		if (manifest.events.length === 0) return true;
		if (this.#isOffline()) return false;

		const pending = [...manifest.events];
		while (pending.length > 0) {
			const queued = pending[0];
			try {
				await this.#handleRawEventOnline(
					{
						type: queued.type,
						absPath: queued.absPath,
						hash: queued.hash,
						inode: queued.inode,
						at: queued.at,
					},
					false,
				);
				if (this.#lastError) {
					queued.attempts += 1;
					queued.lastError = this.#lastError;
					await this.#writeQueueManifest({ version: 1, events: pending });
					return false;
				}
				pending.shift();
				await this.#writeQueueManifest({ version: 1, events: pending });
			} catch (error) {
				queued.attempts += 1;
				queued.lastError =
					error instanceof Error ? error.message : String(error);
				await this.#writeQueueManifest({ version: 1, events: pending });
				this.#lastError = queued.lastError;
				this.#recordEvent({ kind: "error" });
				return false;
			}
		}
		return true;
	}

	async #readQueueManifest(): Promise<QueueManifest> {
		if (!this.#syncRoot) return { version: 1, events: [] };
		const raw = await this.#fs.readFileOrNull(this.#queueManifestPath());
		if (!raw) {
			this.#telemetry.queuedEventCount = 0;
			return { version: 1, events: [] };
		}
		try {
			const parsed = JSON.parse(raw) as QueueManifest;
			if (parsed.version === 1 && Array.isArray(parsed.events)) {
				this.#telemetry.queuedEventCount = parsed.events.length;
				return parsed;
			}
		} catch {
			// Corrupt queue metadata should not crash the sync engine. Preserve
			// local files on disk and start a fresh queue manifest.
		}
		this.#telemetry.queuedEventCount = 0;
		return { version: 1, events: [] };
	}

	async #writeQueueManifest(manifest: QueueManifest): Promise<void> {
		if (!this.#syncRoot) return;
		this.#telemetry.queuedEventCount = manifest.events.length;
		await this.#fs.ensureDir(`${this.#syncRoot}/${QUEUE_DIR_REL}`);
		await this.#fs.writeFile(
			this.#queueManifestPath(),
			JSON.stringify(manifest, null, 2),
		);
	}

	#queueManifestPath(): string {
		return `${this.#syncRoot}/${QUEUE_MANIFEST_REL}`;
	}

	#rekey(
		fromPath: string,
		toPath: string,
		patch: Partial<SyncedFolderIndexEntry>,
	): void {
		this.#index = rekeySyncedFolderEntry(this.#index, fromPath, toPath);
		const entry = this.#index[toPath];
		if (entry) {
			Object.assign(entry, patch);
			entry.inode = this.#statInode(toPath);
		}
		// Drop the matching held unlink so it can't later fire as a delete.
		this.#heldUnlinks = this.#heldUnlinks.filter((h) => h.absPath !== fromPath);
		if (this.#syncRoot) {
			void this.#saveCurrentIndex();
		}
	}

	#resolveFolderIdForDir(targetDir: string): string | null {
		const syncRoot = this.#syncRoot;
		if (syncRoot) {
			const relativeDir = targetDir.slice(syncRoot.length + 1);
			const explicit = this.#indexManifest?.topology.find(
				(folder) => folder.relativePath === relativeDir,
			);
			if (explicit) return explicit.folderId;
		}
		for (const [path, entry] of Object.entries(this.#index)) {
			if (dir(path) === targetDir) return entry.folderId;
		}
		return null;
	}

	#recordEvent(event: SyncedFolderEventDetail): void {
		const at = this.#now();
		this.#lastEventAt = at;
		switch (event.kind) {
			case "reconciled":
				this.#telemetry.reconciledCount += 1;
				break;
			case "backstop":
				this.#telemetry.backstopCount += 1;
				break;
			case "read-only-rejected":
				this.#telemetry.readOnlyRejectedCount += 1;
				break;
			case "error":
				this.#telemetry.errorCount += 1;
				break;
		}
		this.#telemetry.recentEvents = [
			{
				kind: event.kind,
				at,
				...("reason" in event ? { reason: event.reason } : {}),
			},
			...this.#telemetry.recentEvents,
		].slice(0, RECENT_TELEMETRY_EVENTS);
		this.#emit(event);
	}
}

function emptyTelemetry(): SyncedFolderTelemetry {
	return {
		reconciledCount: 0,
		backstopCount: 0,
		readOnlyRejectedCount: 0,
		errorCount: 0,
		queuedEventCount: 0,
		recentEvents: [],
	};
}

function cloneTelemetry(
	telemetry: SyncedFolderTelemetry,
): SyncedFolderTelemetry {
	return {
		...telemetry,
		recentEvents: telemetry.recentEvents.map((event) => ({ ...event })),
	};
}

function dir(absPath: string): string {
	const slash = absPath.lastIndexOf("/");
	return slash === -1 ? "" : absPath.slice(0, slash);
}

function basename(absPath: string): string {
	const slash = absPath.lastIndexOf("/");
	return slash === -1 ? absPath : absPath.slice(slash + 1);
}

function dirname(absPath: string): string {
	const slash = absPath.lastIndexOf("/");
	return slash === -1 ? "" : absPath.slice(0, slash);
}

function relPath(syncRoot: string, absPath: string): string {
	return absPath.startsWith(`${syncRoot}/`)
		? absPath.slice(syncRoot.length + 1)
		: absPath;
}

function titleFromPath(absPath: string): string {
	const name = absPath.slice(absPath.lastIndexOf("/") + 1);
	return name.replace(/\.md$/i, "") || "Untitled";
}

function stripTopLevelWorkspaceDir(relPath: string): string {
	const slash = relPath.indexOf("/");
	if (slash === -1) return relPath;
	return relPath.slice(slash + 1) || relPath;
}

function findIndexEntryByDocumentId(
	index: SyncedFolderIndex,
	documentId: string,
): { path: string; entry: SyncedFolderIndexEntry } | null {
	for (const [path, entry] of Object.entries(index)) {
		if (entry.documentId === documentId) return { path, entry };
	}
	return null;
}
