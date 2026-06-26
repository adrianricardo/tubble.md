/**
 * Pure, framework-free classification + locking helpers for the synced-folder
 * watcher (SYNCED-FOLDER §2, §4, §6). No chokidar, Electron, or backend code
 * lives here, so every rule below is unit-testable against plain inputs.
 *
 * The watcher engine (`syncedFolderService.ts`) owns the stateful side
 * (chokidar, timers, the loaded index, the cloud connection) and delegates the
 * "what does this raw event mean?" decision to {@link classifySyncedFolderChange}.
 */

import type {
	SyncedFolderIndex,
	SyncedFolderIndexEntry,
} from "@hubble.md/sync";

/** A raw filesystem event as reported by chokidar, normalized for classify. */
export type RawWatcherEvent = {
	type: "add" | "unlink" | "change";
	/** Absolute path of the affected file. */
	absPath: string;
	/** `fs.stat` inode, when the file still exists (add/change). Move key #1. */
	inode?: number | null;
	/** `contentHash` of the file, when readable (add/change). Move key #2. */
	hash?: string | null;
	/** Event timestamp (ms). */
	at: number;
};

/** An `unlink` of an indexed path, held open for rename/move correlation. */
export type HeldUnlink = {
	absPath: string;
	entry: SyncedFolderIndexEntry;
	at: number;
};

/** What the engine has most recently written itself, to suppress feedback. */
export type RecentlyWrittenByUs = ReadonlyMap<string, { hash: string }>;

export type ClassifyContext = {
	syncRoot: string;
	index: SyncedFolderIndex;
	/** Open `unlink`s awaiting a correlated `add` (§2 step 1). */
	heldUnlinks: readonly HeldUnlink[];
	/** Self-write suppression set (§2 / §6 case 6). */
	recentlyWrittenByUs: RecentlyWrittenByUs;
	/** Move-correlation window, ms (§2 ~750). */
	correlationWindowMs: number;
};

export type ClassifyDecision =
	| { kind: "ignore"; reason: string }
	/** Indexed path changed in place → run the file reconciler. */
	| {
			kind: "reconcile";
			documentId: string;
			absPath: string;
			entry: SyncedFolderIndexEntry;
	  }
	/** Same-directory basename change → `documents.rename`. */
	| {
			kind: "rename";
			documentId: string;
			fromPath: string;
			toPath: string;
			entry: SyncedFolderIndexEntry;
	  }
	/** Different-directory move → `folders.moveDocument` (+ rename). */
	| {
			kind: "move";
			documentId: string;
			fromPath: string;
			toPath: string;
			entry: SyncedFolderIndexEntry;
	  }
	/** New `.md` inside a workspace folder → `documents.importMarkdown`. */
	| {
			kind: "create";
			absPath: string;
			relPath: string;
			workspaceId: string;
			folderId: string | null;
	  }
	/** Indexed `unlink` with no correlated add yet → hold for the window. */
	| { kind: "hold"; absPath: string; entry: SyncedFolderIndexEntry }
	/** Correlation window expired → treat as a local delete (Phase 5 routes it). */
	| { kind: "delete"; documentId: string; absPath: string; entry: SyncedFolderIndexEntry };

const TEMP_SUFFIXES = [".tmp", ".swp", ".swx", ".swo", ".crswap", "~"];
const TEMP_PREFIXES = [".#", "~$"];

function basename(absPath: string): string {
	const slash = absPath.lastIndexOf("/");
	return slash === -1 ? absPath : absPath.slice(slash + 1);
}

function dirname(absPath: string): string {
	const slash = absPath.lastIndexOf("/");
	return slash === -1 ? "" : absPath.slice(0, slash);
}

/**
 * §4 ignore rules: `.hubble/**`, dotfiles, editor scratch/atomic-save temp
 * names, and non-`.md` files are never content and never classified.
 */
export function shouldIgnoreSyncedPath(
	absPath: string,
	syncRoot: string,
): boolean {
	if (absPath === syncRoot) return true;
	if (!absPath.startsWith(`${syncRoot}/`)) return true;
	const rel = absPath.slice(syncRoot.length + 1);
	// All Hubble state lives here; never a document.
	if (rel === ".hubble" || rel.startsWith(".hubble/")) return true;
	// Any dotfile / dot-directory segment.
	if (rel.split("/").some((segment) => segment.startsWith("."))) return true;
	const name = basename(absPath);
	if (TEMP_PREFIXES.some((p) => name.startsWith(p))) return true;
	if (TEMP_SUFFIXES.some((s) => name.endsWith(s))) return true;
	if (!name.toLowerCase().endsWith(".md")) return true;
	return false;
}

/**
 * Watcher-level `ignored` predicate (chokidar). Unlike
 * {@link shouldIgnoreSyncedPath} this must NOT reject directories or non-`.md`
 * files — chokidar skips an ignored directory's *entire subtree*, so filtering
 * by extension here would stop traversal. It only prunes the `.hubble/` state
 * tree, dotfiles, and editor temp/scratch names; the `.md` + workspace-folder
 * filtering happens later in {@link classifySyncedFolderChange}.
 */
export function shouldIgnoreForWatch(
	absPath: string,
	syncRoot: string,
): boolean {
	if (absPath === syncRoot) return false;
	if (!absPath.startsWith(`${syncRoot}/`)) return true;
	const rel = absPath.slice(syncRoot.length + 1);
	if (rel === ".hubble" || rel.startsWith(".hubble/")) return true;
	if (rel.split("/").some((segment) => segment.startsWith("."))) return true;
	const name = basename(absPath);
	if (TEMP_PREFIXES.some((p) => name.startsWith(p))) return true;
	if (TEMP_SUFFIXES.some((s) => name.endsWith(s))) return true;
	return false;
}

/** True when this event is the echo of one of our own writes (§2 / §6). */
function isSelfWrite(event: RawWatcherEvent, ctx: ClassifyContext): boolean {
	// An `unlink` is never one of our own writes — the materializer and the
	// reconciler only ever *write* files, never delete them. Suppressing an
	// unlink here would drop the leading half of a rename/move (unlink+add) that
	// happens right after materialize, when the path is still in the self-write
	// set. Only add/change can be a self-write.
	if (event.type === "unlink") return false;
	const recent = ctx.recentlyWrittenByUs.get(event.absPath);
	if (!recent) return false;
	// If we know the hash, only suppress when it matches what we wrote — a later
	// genuine user edit to the same path (different hash) must still classify.
	if (event.hash != null) return event.hash === recent.hash;
	return true;
}

/** Find an open held unlink that this `add` is the other half of (§2 step 2). */
function findCorrelatedUnlink(
	event: RawWatcherEvent,
	ctx: ClassifyContext,
): HeldUnlink | null {
	for (const held of ctx.heldUnlinks) {
		if (event.at - held.at > ctx.correlationWindowMs) continue;
		const byInode =
			event.inode != null &&
			held.entry.inode != null &&
			event.inode === held.entry.inode;
		const byHash = event.hash != null && event.hash === held.entry.hash;
		if (byInode || byHash) return held;
	}
	return null;
}

/**
 * Resolve the `workspaceId`/`folderId` a brand-new file at `absPath` belongs to
 * by consulting indexed siblings (§5). `workspaceId` comes from any indexed doc
 * sharing the top-level workspace directory; `folderId` from any indexed doc in
 * the *same* directory (so a new file lands in its on-disk folder's cloud
 * folder, or the workspace root when the directory holds only root-level docs).
 * Returns `null` when the path is not inside a known workspace directory.
 */
function resolveCreateTarget(
	absPath: string,
	ctx: ClassifyContext,
): { workspaceId: string; folderId: string | null } | null {
	const rel = absPath.slice(ctx.syncRoot.length + 1);
	const segments = rel.split("/");
	// Must be at least <workspace>/<file>.md — never a stray file at the root.
	if (segments.length < 2) return null;
	const topDir = `${ctx.syncRoot}/${segments[0]}`;
	const fileDir = dirname(absPath);

	let workspaceId: string | null = null;
	let folderId: string | null = null;
	let folderResolved = false;

	for (const [indexedPath, entry] of Object.entries(ctx.index)) {
		const sameWorkspaceDir =
			indexedPath === topDir || indexedPath.startsWith(`${topDir}/`);
		if (!sameWorkspaceDir) continue;
		workspaceId ??= entry.workspaceId;
		if (!folderResolved && dirname(indexedPath) === fileDir) {
			folderId = entry.folderId;
			folderResolved = true;
		}
	}

	if (workspaceId === null) return null;
	return { workspaceId, folderId };
}

/**
 * Classify a single raw watcher event against the loaded index, the open
 * held-unlinks, and the self-write set. Pure: same inputs → same decision.
 *
 * Order: ignore globs / self-write first, then per event type:
 *  - `change` on an indexed path → `reconcile`.
 *  - `unlink` of an indexed path → `hold` (await correlation); else `ignore`.
 *  - `add` correlated to a held unlink → `rename` (same dir) / `move` (diff dir);
 *    `add` on an already-indexed path → `reconcile` (atomic-save over);
 *    `add` with no index hit inside a workspace folder → `create`; else `ignore`.
 */
export function classifySyncedFolderChange(
	event: RawWatcherEvent,
	ctx: ClassifyContext,
): ClassifyDecision {
	if (shouldIgnoreSyncedPath(event.absPath, ctx.syncRoot)) {
		return { kind: "ignore", reason: "ignored-path" };
	}
	if (isSelfWrite(event, ctx)) {
		return { kind: "ignore", reason: "self-write" };
	}

	if (event.type === "change") {
		const entry = ctx.index[event.absPath];
		if (entry) {
			return {
				kind: "reconcile",
				documentId: entry.documentId,
				absPath: event.absPath,
				entry,
			};
		}
		return { kind: "ignore", reason: "change-not-indexed" };
	}

	if (event.type === "unlink") {
		const entry = ctx.index[event.absPath];
		if (entry) return { kind: "hold", absPath: event.absPath, entry };
		return { kind: "ignore", reason: "unlink-not-indexed" };
	}

	// event.type === "add"
	const correlated = findCorrelatedUnlink(event, ctx);
	if (correlated) {
		const sameDir = dirname(correlated.absPath) === dirname(event.absPath);
		return {
			kind: sameDir ? "rename" : "move",
			documentId: correlated.entry.documentId,
			fromPath: correlated.absPath,
			toPath: event.absPath,
			entry: correlated.entry,
		};
	}

	const indexed = ctx.index[event.absPath];
	if (indexed) {
		return {
			kind: "reconcile",
			documentId: indexed.documentId,
			absPath: event.absPath,
			entry: indexed,
		};
	}

	const target = resolveCreateTarget(event.absPath, ctx);
	if (target) {
		return {
			kind: "create",
			absPath: event.absPath,
			relPath: event.absPath.slice(ctx.syncRoot.length + 1),
			workspaceId: target.workspaceId,
			folderId: target.folderId,
		};
	}

	return { kind: "ignore", reason: "add-outside-workspace" };
}

/**
 * Partition held unlinks at `now`: those past the correlation window become
 * `delete` decisions (real local deletes, §2 step 3); the rest stay held.
 */
export function flushExpiredUnlinks(
	held: readonly HeldUnlink[],
	now: number,
	windowMs: number,
): { expired: ClassifyDecision[]; remaining: HeldUnlink[] } {
	const expired: ClassifyDecision[] = [];
	const remaining: HeldUnlink[] = [];
	for (const h of held) {
		if (now - h.at > windowMs) {
			expired.push({
				kind: "delete",
				documentId: h.entry.documentId,
				absPath: h.absPath,
				entry: h.entry,
			});
		} else {
			remaining.push(h);
		}
	}
	return { expired, remaining };
}

// ─── Single-writer lock (SYNCED-FOLDER §6 case 4) ────────────────────────────

/** Contents of `.hubble/index/owner.json`. */
export type OwnerLock = {
	deviceId: string;
	pid: number;
	heartbeatAt: number;
};

/** A foreign heartbeat older than this is considered stale and reclaimable. */
export const OWNER_LOCK_STALE_MS = 30_000;

export function ownerLockPath(syncRoot: string): string {
	return `${syncRoot}/.hubble/index/owner.json`;
}

/**
 * Result of a single-writer lock acquire. Modeled as a flat record (not a
 * discriminated union) on purpose: the desktop electron tsconfig
 * (`tsconfig.node.json`) is non-strict, so TS will not narrow a union on a
 * boolean discriminant — flat optional fields keep the `acquired` /
 * `reason` / `current` access sites type-checking under non-strict mode.
 */
export type AcquireLockResult = {
	acquired: boolean;
	/** Present when `acquired` is true. */
	lock?: OwnerLock;
	/** Present when `acquired` is false. */
	reason?: "held-by-other";
	/** The conflicting foreign lock when `acquired` is false. */
	current?: OwnerLock;
};

/**
 * Acquire the single-writer lock: free / stale / our own device → take it;
 * a *fresh* foreign heartbeat → refuse (detect-and-refuse, §6 case 4). Pure
 * over the injected `fs`, `now`, and identity, so it tests without real disk.
 */
export async function acquireSingleWriterLock(
	fs: {
		readFileOrNull(path: string): Promise<string | null>;
		ensureDir(path: string): Promise<void>;
		writeFile(path: string, content: string): Promise<void>;
	},
	syncRoot: string,
	identity: { deviceId: string; pid: number; now: number; staleMs?: number },
): Promise<AcquireLockResult> {
	const path = ownerLockPath(syncRoot);
	const raw = await fs.readFileOrNull(path);
	const staleMs = identity.staleMs ?? OWNER_LOCK_STALE_MS;
	if (raw !== null) {
		const current = JSON.parse(raw) as OwnerLock;
		const fresh = identity.now - current.heartbeatAt <= staleMs;
		if (fresh && current.deviceId !== identity.deviceId) {
			return { acquired: false, reason: "held-by-other", current };
		}
	}
	const lock: OwnerLock = {
		deviceId: identity.deviceId,
		pid: identity.pid,
		heartbeatAt: identity.now,
	};
	await fs.ensureDir(`${syncRoot}/.hubble/index`);
	await fs.writeFile(path, JSON.stringify(lock, null, 2));
	return { acquired: true, lock };
}

/** Refresh our heartbeat in place (called on an interval while watching). */
export async function heartbeatSingleWriterLock(
	fs: {
		ensureDir(path: string): Promise<void>;
		writeFile(path: string, content: string): Promise<void>;
	},
	syncRoot: string,
	identity: { deviceId: string; pid: number; now: number },
): Promise<void> {
	await fs.ensureDir(`${syncRoot}/.hubble/index`);
	await fs.writeFile(
		ownerLockPath(syncRoot),
		JSON.stringify(
			{
				deviceId: identity.deviceId,
				pid: identity.pid,
				heartbeatAt: identity.now,
			} satisfies OwnerLock,
			null,
			2,
		),
	);
}

/** Release the lock if (and only if) we still own it. */
export async function releaseSingleWriterLock(
	fs: {
		readFileOrNull(path: string): Promise<string | null>;
		deleteFile(path: string): Promise<void>;
	},
	syncRoot: string,
	deviceId: string,
): Promise<void> {
	const path = ownerLockPath(syncRoot);
	const raw = await fs.readFileOrNull(path);
	if (raw === null) return;
	const current = JSON.parse(raw) as OwnerLock;
	if (current.deviceId === deviceId) await fs.deleteFile(path);
}
