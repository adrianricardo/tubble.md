import { statSync } from "node:fs";
import { createConvexBackend } from "@hubble.md/convex-client";
import {
	contentHash,
	type FileSystem,
	loadSyncedFolderIndex,
	materializeSyncedFolder,
	reconcileProjectionFile,
	rekeySyncedFolderEntry,
	saveSyncedFolderIndex,
	type SyncBackend,
	type SyncedFolderIndex,
	type SyncedFolderIndexEntry,
	writeReconcileBase,
} from "@hubble.md/sync";
import { createNodeFileSystem } from "@hubble.md/sync/node";
import type { SyncedFolderEvent, SyncedFolderStatus } from "../src/desktopApi/types";
import {
	acquireSingleWriterLock,
	classifySyncedFolderChange,
	flushExpiredUnlinks,
	heartbeatSingleWriterLock,
	type HeldUnlink,
	OWNER_LOCK_STALE_MS,
	type RawWatcherEvent,
	releaseSingleWriterLock,
	shouldIgnoreSyncedPath,
} from "./syncedFolderClassify";

/** Opaque handle over whatever filesystem watcher the host wired up. */
export type WatcherHandle = { close(): Promise<void> | void };

export type SyncedFolderServiceOptions = {
	createBackend?: (url: string) => SyncBackend;
	fs?: FileSystem;
	/** Push a `desktop:live-sync:event` to the renderer. */
	emit?: (event: SyncedFolderEvent) => void;
	/** Injectable clock (tests). */
	now?: () => number;
	/** This machine's stable id (single-writer lock identity). */
	deviceId?: string;
	pid?: number;
	/** `inode` lookup; defaults to `fs.statSync`. Tests may omit it. */
	statInode?: (absPath: string) => number | null;
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
	deviceId?: string;
};

const CORRELATION_WINDOW_MS = 750;
const CHANGE_DEBOUNCE_MS = 250;
const HEARTBEAT_MS = 10_000;
const SELF_WRITE_TTL_MS = 5_000;

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
	#createBackend: (url: string) => SyncBackend;
	#fs: FileSystem;
	#emit: (event: SyncedFolderEvent) => void;
	#now: () => number;
	#deviceId: string;
	#pid: number;
	#statInode: (absPath: string) => number | null;
	#createWatcher: SyncedFolderServiceOptions["createWatcher"];

	#backend: SyncBackend | null = null;
	#syncRoot: string | null = null;
	#index: SyncedFolderIndex = {};
	#state: SyncedFolderStatus["state"] = "idle";
	#lastError: string | null = null;
	#lastEventAt: number | null = null;

	#heldUnlinks: HeldUnlink[] = [];
	#recentlyWrittenByUs = new Map<string, { hash: string; at: number }>();
	#changeTimers = new Map<string, ReturnType<typeof setTimeout>>();
	#flushTimer: ReturnType<typeof setTimeout> | null = null;
	#heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	#watcher: WatcherHandle | null = null;

	constructor(options: SyncedFolderServiceOptions = {}) {
		this.#createBackend = options.createBackend ?? createConvexBackend;
		this.#fs = options.fs ?? createNodeFileSystem();
		this.#emit = options.emit ?? (() => {});
		this.#now = options.now ?? (() => Date.now());
		this.#deviceId = options.deviceId ?? "desktop-unknown";
		this.#pid = options.pid ?? (typeof process !== "undefined" ? process.pid : 0);
		this.#statInode =
			options.statInode ??
			((absPath) => {
				try {
					return statSync(absPath).ino;
				} catch {
					return null;
				}
			});
		this.#createWatcher = options.createWatcher;
	}

	get connected(): boolean {
		return this.#syncRoot !== null;
	}

	getStatus(): SyncedFolderStatus {
		return {
			state: this.#state,
			connected: this.connected,
			syncRoot: this.#syncRoot,
			documentCount: Object.keys(this.#index).length,
			lastEventAt: this.#lastEventAt,
			lastError: this.#lastError,
		};
	}

	/**
	 * Acquire the lock, materialize the mirror, and (in production) start the
	 * bounded watcher. Throws when another fresh device already owns the folder
	 * (§6 case 4 detect-and-refuse).
	 */
	async connect(input: ConnectFolderInput): Promise<SyncedFolderStatus> {
		const { syncRoot, deploymentUrl } = input;
		const deviceId = input.deviceId ?? this.#deviceId;
		this.#deviceId = deviceId;

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

		this.#backend = this.#createBackend(deploymentUrl);
		this.#syncRoot = syncRoot;
		this.#lastError = null;

		await this.#materialize();

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
		return this.getStatus();
	}

	async disconnect(): Promise<SyncedFolderStatus> {
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
		for (const timer of this.#changeTimers.values()) clearTimeout(timer);
		this.#changeTimers.clear();

		if (this.#syncRoot) {
			await releaseSingleWriterLock(this.#fs, this.#syncRoot, this.#deviceId);
		}

		this.#backend = null;
		this.#syncRoot = null;
		this.#index = {};
		this.#heldUnlinks = [];
		this.#recentlyWrittenByUs.clear();
		this.#state = "idle";
		return this.getStatus();
	}

	/**
	 * Re-run the full materialize pass and reload the index (cloud → disk).
	 *
	 * SEAM: this is the polling fallback. The intended steady-state path is a
	 * reactive Convex subscription (`ConvexClient.onUpdate` over
	 * `listWithMarkdown` / `folders.list` / `listWorkspaces`) that pushes
	 * incremental diffs; that reactive client is the Phase 3b follow-up and is
	 * deliberately **not** half-built here (SYNCED-FOLDER §3 "On cloud changes").
	 */
	async refresh(): Promise<SyncedFolderStatus> {
		if (!this.#backend || !this.#syncRoot) {
			throw new Error("Synced folder is not connected; call connect() first.");
		}
		await this.#materialize();
		return this.getStatus();
	}

	async #materialize(): Promise<void> {
		if (!this.#backend || !this.#syncRoot) return;
		const result = await materializeSyncedFolder(this.#backend, this.#fs, {
			syncRoot: this.#syncRoot,
		});
		// Fill `inode` (Phase 3a left it null) and seed self-write suppression so
		// the watcher never re-classifies the materializer's own writes.
		const now = this.#now();
		for (const [absPath, entry] of Object.entries(result.index)) {
			entry.inode = this.#statInode(absPath);
			this.#recentlyWrittenByUs.set(absPath, { hash: entry.hash, at: now });
		}
		await saveSyncedFolderIndex(this.#fs, this.#syncRoot, result.index);
		this.#index = result.index;
	}

	async #heartbeat(): Promise<void> {
		if (!this.#syncRoot) return;
		await heartbeatSingleWriterLock(this.#fs, this.#syncRoot, {
			deviceId: this.#deviceId,
			pid: this.#pid,
			now: this.#now(),
		}).catch(() => {});
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
		this.#sweepSelfWrites();

		const decision = classifySyncedFolderChange(event, {
			syncRoot: this.#syncRoot,
			index: this.#index,
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
			this.#emit({ kind: "error" });
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
					this.#emit({ kind: "reconciled" });
				} else if (outcome.status === "backstop") {
					// Phase 5 writes the `*.local-edit-<ts>` copy + re-materializes.
					this.#emit({ kind: "backstop", reason: outcome.reason });
				}
				return;
			}

			case "rename": {
				await backend.renameDocument(decision.documentId, {
					title: titleFromPath(decision.toPath),
					path: relPath(syncRoot, decision.toPath),
					actor: "synced-folder",
				});
				this.#rekey(decision.fromPath, decision.toPath, {});
				this.#emit({ kind: "renamed" });
				return;
			}

			case "move": {
				const folderId = this.#resolveFolderIdForDir(dir(decision.toPath));
				await backend.moveDocument(decision.documentId, folderId);
				await backend.renameDocument(decision.documentId, {
					title: titleFromPath(decision.toPath),
					path: relPath(syncRoot, decision.toPath),
					actor: "synced-folder",
				});
				this.#rekey(decision.fromPath, decision.toPath, { folderId });
				this.#emit({ kind: "moved" });
				return;
			}

			case "create": {
				const markdown = await this.#fs.readFile(decision.absPath);
				const imported = await backend.importLiveDocument({
					workspaceId: decision.workspaceId,
					path: decision.relPath,
					title: titleFromPath(decision.absPath),
					markdown,
					actor: "synced-folder",
				});
				if (decision.folderId !== null) {
					await backend.moveDocument(imported.documentId, decision.folderId);
				}
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
					hash: await contentHash(markdown),
					role: "editor",
				};
				this.#markWrittenByUs(decision.absPath, markdown);
				await saveSyncedFolderIndex(this.#fs, syncRoot, this.#index);
				this.#emit({ kind: "created" });
				return;
			}

			case "delete": {
				// v1: a local delete does NOT call `documents.remove` — the
				// direction-aware cloud delete is Phase 5. Just drop the local index
				// entry and surface the event.
				delete this.#index[decision.absPath];
				await saveSyncedFolderIndex(this.#fs, syncRoot, this.#index);
				this.#emit({ kind: "deleted-local" });
				return;
			}
		}
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
		for (const decision of expired) {
			await this.#route(decision, {
				type: "unlink",
				absPath: decision.kind === "delete" ? decision.absPath : "",
				at: now,
			});
		}
		if (remaining.length > 0) this.#scheduleFlush();
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
			await saveSyncedFolderIndex(this.#fs, this.#syncRoot, this.#index);
		}
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
			void saveSyncedFolderIndex(this.#fs, this.#syncRoot, this.#index);
		}
	}

	#resolveFolderIdForDir(targetDir: string): string | null {
		for (const [path, entry] of Object.entries(this.#index)) {
			if (dir(path) === targetDir) return entry.folderId;
		}
		return null;
	}
}

function dir(absPath: string): string {
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
