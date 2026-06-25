import type { FileSystem } from "./fs.js";

/**
 * Reverse index for the synced folder: `absPath → documentId` (plus the
 * disambiguators the watcher needs). This is the registry the bounded watcher
 * consults to answer "is this path a Live Document, and which one?" — the
 * mirror-wide generalization of the per-document base cache.
 *
 * Stored as `.hubble/index/synced-folder.json` under the sync root. The binding
 * is `documentId`; the path is mutable metadata (a Finder move/rename re-keys
 * the entry, the `documentId` is unchanged).
 */

export type SyncedFolderRole =
	| "owner"
	| "editor"
	| "commenter"
	| "viewer"
	| null;

export type SyncedFolderIndexEntry = {
	documentId: string;
	workspaceId: string;
	folderId: string | null;
	/** `fs.stat` inode for move correlation; `null` when unavailable. */
	inode: number | null;
	/** `contentHash` of the materialized markdown. */
	hash: string;
	role: SyncedFolderRole;
};

/** `absPath → entry`. */
export type SyncedFolderIndex = Record<string, SyncedFolderIndexEntry>;

export type SyncedFolderIndexDiff = {
	added: Array<{ path: string; entry: SyncedFolderIndexEntry }>;
	removed: Array<{ path: string; entry: SyncedFolderIndexEntry }>;
	changed: Array<{
		path: string;
		entry: SyncedFolderIndexEntry;
		previous: SyncedFolderIndexEntry;
	}>;
};

/** Where the reverse index lives within a sync root. */
export function syncedFolderIndexPath(syncRoot: string): string {
	return `${syncRoot}/.hubble/index/synced-folder.json`;
}

/** Load the reverse index, returning `{}` when it has not been written yet. */
export async function loadSyncedFolderIndex(
	fs: Pick<FileSystem, "readFileOrNull">,
	syncRoot: string,
): Promise<SyncedFolderIndex> {
	const raw = await fs.readFileOrNull(syncedFolderIndexPath(syncRoot));
	if (raw === null) return {};
	return JSON.parse(raw) as SyncedFolderIndex;
}

/** Persist the reverse index under `.hubble/index/synced-folder.json`. */
export async function saveSyncedFolderIndex(
	fs: Pick<FileSystem, "ensureDir" | "writeFile">,
	syncRoot: string,
	index: SyncedFolderIndex,
): Promise<void> {
	await fs.ensureDir(`${syncRoot}/.hubble/index`);
	await fs.writeFile(
		syncedFolderIndexPath(syncRoot),
		JSON.stringify(index, null, 2),
	);
}

/** True when two entries differ on any materially significant field. */
function entriesDiffer(
	a: SyncedFolderIndexEntry,
	b: SyncedFolderIndexEntry,
): boolean {
	return (
		a.documentId !== b.documentId ||
		a.workspaceId !== b.workspaceId ||
		a.folderId !== b.folderId ||
		a.hash !== b.hash ||
		a.role !== b.role
	);
}

/**
 * Diff a desired index (from a fresh materialize pass) against the current one.
 * `added` = paths only in desired, `removed` = paths only in current,
 * `changed` = paths in both whose entry changed (e.g. new markdown hash, a role
 * flip, or a re-pointed `documentId`).
 */
export function diffSyncedFolderIndex(
	desired: SyncedFolderIndex,
	current: SyncedFolderIndex,
): SyncedFolderIndexDiff {
	const diff: SyncedFolderIndexDiff = {
		added: [],
		removed: [],
		changed: [],
	};

	for (const [path, entry] of Object.entries(desired)) {
		const previous = current[path];
		if (!previous) {
			diff.added.push({ path, entry });
		} else if (entriesDiffer(entry, previous)) {
			diff.changed.push({ path, entry, previous });
		}
	}

	for (const [path, entry] of Object.entries(current)) {
		if (!(path in desired)) diff.removed.push({ path, entry });
	}

	return diff;
}

/**
 * Re-key an entry after a Finder move/rename. The `documentId` is preserved;
 * only the path (the key) changes. Returns a new index; the input is untouched.
 * A no-op when `fromPath` is absent or equals `toPath`.
 */
export function rekeySyncedFolderEntry(
	index: SyncedFolderIndex,
	fromPath: string,
	toPath: string,
): SyncedFolderIndex {
	const entry = index[fromPath];
	if (!entry || fromPath === toPath) return { ...index };
	const next = { ...index };
	delete next[fromPath];
	next[toPath] = entry;
	return next;
}
