import type { FileSystem } from "./fs.js";
import { contentHash } from "./fs.js";

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

export type SyncedFolderMountIdentity =
	| { kind: "workspace-mirror" }
	| { kind: "workspace"; workspaceId: string }
	| { kind: "folder"; folderId: string };

export type SyncedFolderTopologyEntry = {
	folderId: string;
	workspaceId: string;
	/** Present once the backend projection contract supplies explicit ancestry. */
	parentFolderId?: string | null;
	relativePath: string;
};

export type SyncedFolderVerification = {
	state: "verified" | "pending";
	reason: "offline" | "access" | null;
	updatedAt: number;
};

export type SyncedFolderIndexManifest = {
	version: 2;
	mount: SyncedFolderMountIdentity;
	syncRoot: string;
	topology: SyncedFolderTopologyEntry[];
	verification: SyncedFolderVerification;
	entries: SyncedFolderIndex;
};

export type StartupProjectionDrift =
	| { kind: "unchanged"; path: string; entry: SyncedFolderIndexEntry }
	| {
			kind: "changed";
			path: string;
			entry: SyncedFolderIndexEntry;
			markdown: string;
			hash: string;
	  }
	| { kind: "missing"; path: string; entry: SyncedFolderIndexEntry };

export type StartupProjectionMove = {
	fromPath: string;
	toPath: string;
	entry: SyncedFolderIndexEntry;
	matchedBy: "inode" | "hash";
};

export type StartupProjectionMoveCorrelation = {
	moves: StartupProjectionMove[];
	ambiguous: Array<{
		path: string;
		entry: SyncedFolderIndexEntry;
		candidatePaths: string[];
	}>;
	missing: Array<{ path: string; entry: SyncedFolderIndexEntry }>;
};

export type SyncedFolderIndexDiff = {
	added: Array<{ path: string; entry: SyncedFolderIndexEntry }>;
	removed: Array<{ path: string; entry: SyncedFolderIndexEntry }>;
	changed: Array<{
		path: string;
		entry: SyncedFolderIndexEntry;
		previous: SyncedFolderIndexEntry;
	}>;
};

export const SYNCED_FOLDER_INDEX_REL = ".hubble/index/synced-folder.json";

/** Where the reverse index lives within a sync root. */
export function syncedFolderIndexPath(syncRoot: string): string {
	return `${syncRoot}/${SYNCED_FOLDER_INDEX_REL}`;
}

export function emptySyncedFolderIndexManifest(
	syncRoot: string,
	mount: SyncedFolderMountIdentity,
): SyncedFolderIndexManifest {
	return {
		version: 2,
		mount,
		syncRoot,
		topology: [],
		verification: { state: "pending", reason: null, updatedAt: 0 },
		entries: {},
	};
}

/** Load and migrate the versioned reverse-index envelope. */
export async function loadSyncedFolderIndexManifest(
	fs: Pick<FileSystem, "readFileOrNull">,
	syncRoot: string,
	mount: SyncedFolderMountIdentity,
): Promise<SyncedFolderIndexManifest> {
	const raw = await fs.readFileOrNull(syncedFolderIndexPath(syncRoot));
	if (raw === null) return emptySyncedFolderIndexManifest(syncRoot, mount);
	const parsed = JSON.parse(raw) as unknown;
	if (typeof parsed === "object" && parsed !== null && "version" in parsed) {
		const manifest = parsed as SyncedFolderIndexManifest;
		if (manifest.version !== 2 || !manifest.entries) {
			throw new Error("Unsupported synced-folder index version");
		}
		if (
			manifest.syncRoot !== syncRoot ||
			JSON.stringify(manifest.mount) !== JSON.stringify(mount)
		) {
			throw new Error("Synced-folder index belongs to a different mount");
		}
		return manifest;
	}
	// V1 was the bare absPath → entry map. Preserve every binding while adding
	// mount identity; topology is populated by the next verified cloud plan.
	return {
		...emptySyncedFolderIndexManifest(syncRoot, mount),
		entries: parsed as SyncedFolderIndex,
	};
}

/** Load only the entries for callers that do not need envelope metadata. */
export async function loadSyncedFolderIndex(
	fs: Pick<FileSystem, "readFileOrNull">,
	syncRoot: string,
): Promise<SyncedFolderIndex> {
	const raw = await fs.readFileOrNull(syncedFolderIndexPath(syncRoot));
	if (raw === null) return {};
	const parsed = JSON.parse(raw) as unknown;
	if (
		typeof parsed === "object" &&
		parsed !== null &&
		"version" in parsed &&
		(parsed as { version: unknown }).version === 2
	) {
		return (parsed as SyncedFolderIndexManifest).entries;
	}
	return parsed as SyncedFolderIndex;
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

export async function saveSyncedFolderIndexManifest(
	fs: Pick<FileSystem, "ensureDir" | "writeFile">,
	syncRoot: string,
	manifest: SyncedFolderIndexManifest,
): Promise<void> {
	await fs.ensureDir(`${syncRoot}/.hubble/index`);
	await fs.writeFile(
		syncedFolderIndexPath(syncRoot),
		JSON.stringify(manifest, null, 2),
	);
}

/**
 * Inspect previously managed files before cloud state is fetched or written.
 * This is deliberately limited to stable indexed identities; untracked files
 * and move correlation belong to the projection planner rather than being
 * guessed here.
 */
export async function inspectStartupProjectionDrift(
	fs: Pick<FileSystem, "readFileOrNull">,
	index: SyncedFolderIndex,
): Promise<StartupProjectionDrift[]> {
	return Promise.all(
		Object.entries(index).map(async ([path, entry]) => {
			const markdown = await fs.readFileOrNull(path);
			if (markdown === null) return { kind: "missing", path, entry } as const;
			const hash = await contentHash(markdown);
			if (hash === entry.hash)
				return { kind: "unchanged", path, entry } as const;
			return { kind: "changed", path, entry, markdown, hash } as const;
		}),
	);
}

/** Correlate files moved while the app was quit without guessing ambiguous identity. */
export async function correlateStartupProjectionMoves(
	fs: Pick<FileSystem, "listMarkdownFiles">,
	syncRoot: string,
	index: SyncedFolderIndex,
	drift: StartupProjectionDrift[],
	statInode: (path: string) => number | null,
): Promise<StartupProjectionMoveCorrelation> {
	const missing = drift.filter(
		(item): item is Extract<StartupProjectionDrift, { kind: "missing" }> =>
			item.kind === "missing",
	);
	const candidates = (await fs.listMarkdownFiles(syncRoot))
		.map((file) => {
			const path = `${syncRoot}/${file.relativePath.split("\\").join("/")}`;
			return { path, hash: file.hash, inode: statInode(path) };
		})
		.filter(({ path }) => !index[path]);
	const matches = new Map<string, Array<(typeof candidates)[number]>>();
	const matchedBy = new Map<string, "inode" | "hash">();
	for (const item of missing) {
		const inodeMatches =
			item.entry.inode === null
				? []
				: candidates.filter(({ inode }) => inode === item.entry.inode);
		const options =
			inodeMatches.length > 0
				? inodeMatches
				: candidates.filter(({ hash }) => hash === item.entry.hash);
		matches.set(item.path, options);
		matchedBy.set(item.path, inodeMatches.length > 0 ? "inode" : "hash");
	}

	const sourceCountByTarget = new Map<string, number>();
	for (const options of matches.values()) {
		for (const option of options) {
			sourceCountByTarget.set(
				option.path,
				(sourceCountByTarget.get(option.path) ?? 0) + 1,
			);
		}
	}

	const result: StartupProjectionMoveCorrelation = {
		moves: [],
		ambiguous: [],
		missing: [],
	};
	for (const item of missing) {
		const options = matches.get(item.path) ?? [];
		const uniqueCandidate = options.length === 1 ? options[0] : undefined;
		if (
			uniqueCandidate &&
			sourceCountByTarget.get(uniqueCandidate.path) === 1
		) {
			result.moves.push({
				fromPath: item.path,
				toPath: uniqueCandidate.path,
				entry: item.entry,
				matchedBy: matchedBy.get(item.path) ?? "hash",
			});
		} else if (options.length > 0) {
			result.ambiguous.push({
				path: item.path,
				entry: item.entry,
				candidatePaths: options.map(({ path }) => path).sort(),
			});
		} else {
			result.missing.push(item);
		}
	}
	return result;
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
