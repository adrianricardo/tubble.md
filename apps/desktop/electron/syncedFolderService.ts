import { statSync } from "node:fs";
import { createConvexBackend } from "@hubble.md/convex-client";
import {
	type BackstopReason,
	contentHash,
	diffSyncedFolderIndex,
	type FileSystem,
	liveDocumentBaseCacheRoot,
	materializeSyncedFolder,
	reconcileProjectionFile,
	rekeySyncedFolderEntry,
	saveSyncedFolderIndex,
	type SyncBackend,
	type SyncedFolderIndex,
	type SyncedFolderIndexEntry,
	toLocalEditName,
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
 * Reserved for the offline decision (SYNCED-FOLDER §7 closing note). The queue
 * directory is created on connect but NOTHING is written to it here — durable
 * queueing and replay are a separate, not-yet-designed slice.
 */
const QUEUE_DIR_REL = ".hubble/queue";
/** Where access-lost local bytes are parked instead of being hard-deleted. */
const TRASH_DIR_REL = ".hubble/trash";

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
	/**
	 * Offline seam (SYNCED-FOLDER §7): always `false` in this build. The offline
	 * decision flips it on to divert watcher events into the durable queue
	 * instead of routing them to the cloud. Reserved here, not implemented.
	 */
	#offline = false;
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

	/** The reverse-index entry for `absPath`, or `null` when not a synced doc. */
	lookup(absPath: string): SyncedFolderIndexEntry | null {
		return this.#index[absPath] ?? null;
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

		// Reserve the offline-queue directory (seam only; see #flushQueue).
		await this.#fs.ensureDir(`${syncRoot}/${QUEUE_DIR_REL}`);

		await this.#materialize();
		// Flush-on-reconnect seam: no-op until the offline decision lands.
		await this.#flushQueue();

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
		const previous = this.#index;
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
			await this.#handleAccessLoss(path, entry);
		}
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

		// Offline seam (§7): when the offline decision flips `#offline` on, watcher
		// events are diverted into the durable queue instead of routed. No-op here.
		if (this.#offline) {
			this.#enqueue(event);
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
					await this.#backstop(
						decision.absPath,
						outcome.documentId,
						outcome.reason,
					);
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
				// ── Local delete (§6 case 1, WATCHER-origin direction) ───────────
				// The user removed the file and the rename/move correlation window
				// expired. This is the ONLY entry point that calls the cloud
				// soft-delete; access-loss (materialize-origin) is handled in
				// `#materialize` and NEVER reaches here. Keeping the two directions
				// in two distinct routes is the data-loss-critical guarantee.
				// One-way in v1: restore via the cloud trash UI (§6 case 2).
				await backend.removeDocument(decision.documentId, "synced-folder");
				delete this.#index[decision.absPath];
				await this.#dropBaseCache(decision.documentId);
				await saveSyncedFolderIndex(this.#fs, syncRoot, this.#index);
				this.#emit({ kind: "removed-local" });
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
			this.#emit({ kind: "read-only-rejected" });
		} else {
			this.#emit({ kind: "backstop", reason });
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

		const bytes = await this.#fs.readFileOrNull(absPath);
		if (bytes !== null) {
			const trashDir = `${syncRoot}/${TRASH_DIR_REL}`;
			await this.#fs.ensureDir(trashDir);
			await this.#fs.writeFile(
				`${trashDir}/${entry.documentId}__${basename(absPath)}`,
				bytes,
			);
			if (this.#fs.setReadOnly) {
				await this.#fs.setReadOnly(absPath, false).catch(() => {});
			}
			await this.#fs.deleteFile(absPath);
		}

		delete this.#index[absPath];
		await this.#dropBaseCache(entry.documentId);
		await saveSyncedFolderIndex(this.#fs, syncRoot, this.#index);
		this.#emit({ kind: "removed-access" });
	}

	/** Delete a per-document reconcile base cache (markdown + metadata). */
	async #dropBaseCache(documentId: string): Promise<void> {
		if (!this.#syncRoot) return;
		const root = liveDocumentBaseCacheRoot(this.#syncRoot);
		await this.#fs.deleteFile(`${root}/${documentId}.base.md`).catch(() => {});
		await this.#fs.deleteFile(`${root}/${documentId}.json`).catch(() => {});
	}

	// ─── Offline queue (SEAM ONLY — owned by the offline decision) ─────────────
	//
	// SYNCED-FOLDER §7 closing note: queued watcher edits flushed on reconnect
	// are NOT designed or built in Phase 5. The two stubs below are deliberate
	// no-ops that reserve the shape — `enqueue` a watcher event while offline,
	// `flush` the queue on reconnect — and the `${syncRoot}/.hubble/queue/`
	// directory (created in `connect`). The offline decision owns the durable
	// queue + replay; do not implement queueing here.

	#enqueue(_event: RawWatcherEvent): void {
		// SEAM: no-op. The offline decision persists `_event` under
		// `${this.#syncRoot}/${QUEUE_DIR_REL}` for replay on reconnect.
	}

	async #flushQueue(): Promise<void> {
		// SEAM: no-op. The offline decision replays `${QUEUE_DIR_REL}` here on
		// reconnect, re-driving each queued event through `handleRawEvent`.
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

function basename(absPath: string): string {
	const slash = absPath.lastIndexOf("/");
	return slash === -1 ? absPath : absPath.slice(slash + 1);
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
