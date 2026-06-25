import { describe, expect, it } from "vitest";
import type { Folder, SyncBackend, Workspace } from "./backend.js";
import { contentHash, type FileSystem } from "./fs.js";
import { liveDocumentBaseCacheRoot, readReconcileBase } from "./reconcile.js";
import { materializeSyncedFolder } from "./sync.js";
import {
	diffSyncedFolderIndex,
	loadSyncedFolderIndex,
	rekeySyncedFolderEntry,
	type SyncedFolderIndex,
	type SyncedFolderIndexEntry,
	saveSyncedFolderIndex,
	syncedFolderIndexPath,
} from "./syncedFolderIndex.js";
import type { LiveDocumentProjection } from "./types.js";

/** In-memory FileSystem recording read-only chmod calls. */
function createMemoryFs(initial: Record<string, string> = {}): FileSystem & {
	readOnly: Map<string, boolean>;
} {
	const files = new Map<string, string>(Object.entries(initial));
	const readOnly = new Map<string, boolean>();
	const unsupported = () => {
		throw new Error("not supported in memory fs");
	};
	return {
		readOnly,
		async readFile(path) {
			const content = files.get(path);
			if (content === undefined) throw new Error(`ENOENT: ${path}`);
			return content;
		},
		async writeFile(path, content) {
			files.set(path, content);
		},
		async deleteFile(path) {
			files.delete(path);
		},
		async readFileOrNull(path) {
			return files.get(path) ?? null;
		},
		async ensureDir() {},
		async setReadOnly(path, ro) {
			readOnly.set(path, ro);
		},
		listMarkdownFiles: unsupported,
		readBinaryFile: unsupported,
		writeBinaryFile: unsupported,
		listAssetFiles: unsupported,
	};
}

/** Build a fake SyncBackend over fixed workspace/folder/document data. */
function createBackend(data: {
	workspaces: Workspace[];
	folders: Record<string, Folder[]>;
	documents: Record<string, LiveDocumentProjection[]>;
}): Pick<SyncBackend, "listWorkspaces" | "getFolders" | "getLiveDocuments"> {
	return {
		async listWorkspaces() {
			return data.workspaces;
		},
		async getFolders(workspaceId) {
			return data.folders[workspaceId] ?? [];
		},
		async getLiveDocuments(workspaceId) {
			return data.documents[workspaceId] ?? [];
		},
	};
}

function doc(
	overrides: Partial<LiveDocumentProjection> &
		Pick<LiveDocumentProjection, "_id" | "title">,
): LiveDocumentProjection {
	return {
		path: null,
		folderId: null,
		markdown: `# ${overrides.title}\n`,
		version: 1,
		role: "editor",
		canWrite: true,
		updatedAt: 0,
		...overrides,
	};
}

const SYNC_ROOT = "/Hubble";

describe("syncedFolderIndex", () => {
	const entry = (
		over: Partial<SyncedFolderIndexEntry> = {},
	): SyncedFolderIndexEntry => ({
		documentId: "d1",
		workspaceId: "w1",
		folderId: null,
		inode: null,
		hash: "h1",
		role: "editor",
		...over,
	});

	it("loads {} when the index is absent", async () => {
		const fs = createMemoryFs();
		expect(await loadSyncedFolderIndex(fs, SYNC_ROOT)).toEqual({});
	});

	it("round-trips through save → load", async () => {
		const fs = createMemoryFs();
		const index: SyncedFolderIndex = {
			"/Hubble/A/Note.md": entry(),
		};
		await saveSyncedFolderIndex(fs, SYNC_ROOT, index);
		// Written at the documented location.
		expect(await fs.readFileOrNull(syncedFolderIndexPath(SYNC_ROOT))).not.toBe(
			null,
		);
		expect(await loadSyncedFolderIndex(fs, SYNC_ROOT)).toEqual(index);
	});

	it("diffs added / removed / changed", () => {
		const current: SyncedFolderIndex = {
			"/a.md": entry({ documentId: "a", hash: "h-a" }),
			"/b.md": entry({ documentId: "b", hash: "h-b" }),
		};
		const desired: SyncedFolderIndex = {
			"/a.md": entry({ documentId: "a", hash: "h-a2" }), // changed (hash)
			"/c.md": entry({ documentId: "c", hash: "h-c" }), // added
		};
		const diff = diffSyncedFolderIndex(desired, current);
		expect(diff.added.map((d) => d.path)).toEqual(["/c.md"]);
		expect(diff.removed.map((d) => d.path)).toEqual(["/b.md"]);
		expect(diff.changed.map((d) => d.path)).toEqual(["/a.md"]);
		expect(diff.changed[0]?.previous.hash).toBe("h-a");
		expect(diff.changed[0]?.entry.hash).toBe("h-a2");
	});

	it("does not flag identical entries as changed", () => {
		const same: SyncedFolderIndex = { "/a.md": entry() };
		const diff = diffSyncedFolderIndex({ ...same }, { ...same });
		expect(diff.added).toHaveLength(0);
		expect(diff.removed).toHaveLength(0);
		expect(diff.changed).toHaveLength(0);
	});

	it("re-keys an entry on move, preserving documentId", () => {
		const index: SyncedFolderIndex = {
			"/Hubble/A/Old.md": entry({ documentId: "keep" }),
		};
		const moved = rekeySyncedFolderEntry(
			index,
			"/Hubble/A/Old.md",
			"/Hubble/B/New.md",
		);
		expect(moved["/Hubble/A/Old.md"]).toBeUndefined();
		expect(moved["/Hubble/B/New.md"]?.documentId).toBe("keep");
		// Input is untouched.
		expect(index["/Hubble/A/Old.md"]).toBeDefined();
	});

	it("re-key is a no-op when the source path is absent", () => {
		const index: SyncedFolderIndex = { "/x.md": entry() };
		expect(rekeySyncedFolderEntry(index, "/missing.md", "/y.md")).toEqual(
			index,
		);
	});
});

describe("materializeSyncedFolder", () => {
	function fixture() {
		const workspaces: Workspace[] = [
			{ _id: "ws_a", name: "Product Team" },
			{ _id: "ws_b", name: "Personal" },
		];
		const folders: Record<string, Folder[]> = {
			ws_a: [
				{ _id: "f_specs", name: "Specs", parentId: null, workspaceId: "ws_a" },
				{
					_id: "f_arch",
					name: "Archive",
					parentId: "f_specs",
					workspaceId: "ws_a",
				},
			],
			ws_b: [],
		};
		const documents: Record<string, LiveDocumentProjection[]> = {
			ws_a: [
				doc({ _id: "d_roadmap", title: "Roadmap", version: 3 }),
				doc({ _id: "d_rtc", title: "Realtime Collab", folderId: "f_specs" }),
				doc({
					_id: "d_old",
					title: "Old Plan",
					folderId: "f_arch",
					role: "viewer",
					canWrite: false,
				}),
				// Sibling-title collision at the workspace root.
				doc({ _id: "d_notes1", title: "Notes" }),
				doc({ _id: "d_notes2", title: "Notes" }),
			],
			ws_b: [doc({ _id: "d_journal", title: "Journal" })],
		};
		return { workspaces, folders, documents };
	}

	it("builds the nested tree, base caches, index, chmod and collisions", async () => {
		const fs = createMemoryFs();
		const backend = createBackend(fixture());

		const result = await materializeSyncedFolder(backend, fs, {
			syncRoot: SYNC_ROOT,
		});

		// --- Nested on-disk paths from (workspace, folder tree, title). ---
		expect(await fs.readFile(`${SYNC_ROOT}/Product Team/Roadmap.md`)).toBe(
			"# Roadmap\n",
		);
		expect(
			await fs.readFile(`${SYNC_ROOT}/Product Team/Specs/Realtime Collab.md`),
		).toBe("# Realtime Collab\n");
		expect(
			await fs.readFile(`${SYNC_ROOT}/Product Team/Specs/Archive/Old Plan.md`),
		).toBe("# Old Plan\n");
		expect(await fs.readFile(`${SYNC_ROOT}/Personal/Journal.md`)).toBe(
			"# Journal\n",
		);

		// --- Sibling-title collision → ` (2)` suffix. ---
		expect(await fs.readFile(`${SYNC_ROOT}/Product Team/Notes.md`)).toBe(
			"# Notes\n",
		);
		expect(await fs.readFile(`${SYNC_ROOT}/Product Team/Notes (2).md`)).toBe(
			"# Notes\n",
		);

		// --- Base caches at the reconcileProjectionFile-expected location. ---
		const cacheRoot = liveDocumentBaseCacheRoot(SYNC_ROOT);
		expect(await fs.readFile(`${cacheRoot}/d_roadmap.base.md`)).toBe(
			"# Roadmap\n",
		);
		const base = await readReconcileBase(fs, SYNC_ROOT, "d_roadmap");
		expect(base?.metadata.revision).toBe(3);
		expect(base?.metadata.path).toBe("Product Team/Roadmap.md");

		// --- Reverse index: absPath ↔ documentId, written to disk. ---
		const index = await loadSyncedFolderIndex(fs, SYNC_ROOT);
		expect(index).toEqual(result.index);
		expect(index[`${SYNC_ROOT}/Product Team/Roadmap.md`]?.documentId).toBe(
			"d_roadmap",
		);
		expect(index[`${SYNC_ROOT}/Product Team/Specs/Realtime Collab.md`]).toEqual(
			{
				documentId: "d_rtc",
				workspaceId: "ws_a",
				folderId: "f_specs",
				inode: null,
				hash: await contentHash("# Realtime Collab\n"),
				role: "editor",
			},
		);
		expect(index[`${SYNC_ROOT}/Product Team/Notes (2).md`]?.documentId).toBe(
			"d_notes2",
		);

		// --- Read-only chmod by role. ---
		expect(
			fs.readOnly.get(`${SYNC_ROOT}/Product Team/Specs/Archive/Old Plan.md`),
		).toBe(true);
		expect(fs.readOnly.get(`${SYNC_ROOT}/Product Team/Roadmap.md`)).toBe(false);

		// --- Result summary. ---
		expect(result.written).toHaveLength(6);
		expect(result.syncRoot).toBe(SYNC_ROOT);
	});
});
