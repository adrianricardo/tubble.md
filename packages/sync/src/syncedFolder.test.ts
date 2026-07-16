import { describe, expect, it } from "vitest";
import type { Folder, SyncBackend, Workspace } from "./backend.js";
import { contentHash, type FileSystem } from "./fs.js";
import { liveDocumentBaseCacheRoot, readReconcileBase } from "./reconcile.js";
import {
	materializeMountFolder,
	materializeSyncedFolder,
	materializeWorkspaceRoot,
	planWorkspaceRoot,
} from "./sync.js";
import {
	diffSyncedFolderIndex,
	loadSyncedFolderIndex,
	rekeySyncedFolderEntry,
	type SyncedFolderIndex,
	type SyncedFolderIndexEntry,
	saveSyncedFolderIndex,
	syncedFolderIndexPath,
} from "./syncedFolderIndex.js";
import type {
	LiveDocumentProjection,
	SharedSubtreeDocument,
	SharedWithMe,
} from "./types.js";

/** In-memory FileSystem recording read-only chmod calls. */
function createMemoryFs(initial: Record<string, string> = {}): FileSystem & {
	readOnly: Map<string, boolean>;
	writes: Array<{ path: string; content: string }>;
	directories: Set<string>;
} {
	const files = new Map<string, string>(Object.entries(initial));
	const readOnly = new Map<string, boolean>();
	const writes: Array<{ path: string; content: string }> = [];
	const directories = new Set<string>();
	const unsupported = () => {
		throw new Error("not supported in memory fs");
	};
	return {
		readOnly,
		writes,
		directories,
		async readFile(path) {
			const content = files.get(path);
			if (content === undefined) throw new Error(`ENOENT: ${path}`);
			return content;
		},
		async writeFile(path, content) {
			writes.push({ path, content });
			files.set(path, content);
		},
		async deleteFile(path) {
			files.delete(path);
		},
		async readFileOrNull(path) {
			return files.get(path) ?? null;
		},
		async ensureDir(path) {
			directories.add(path);
		},
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
	shared?: SharedWithMe;
	subtreeDocuments?: Record<string, SharedSubtreeDocument[]>;
}): Pick<
	SyncBackend,
	| "listWorkspaces"
	| "getFolders"
	| "getLiveDocuments"
	| "getSharedWithMe"
	| "getFolderSubtreeDocuments"
> {
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
		async getSharedWithMe() {
			return data.shared ?? { folders: [], documents: [] };
		},
		async getFolderSubtreeDocuments(folderId) {
			return data.subtreeDocuments?.[folderId] ?? [];
		},
	};
}

/** Build a SharedSubtreeDocument for shared/mount fixtures. */
function sharedDoc(
	overrides: Partial<SharedSubtreeDocument> &
		Pick<SharedSubtreeDocument, "_id" | "title" | "workspaceId">,
): SharedSubtreeDocument {
	return {
		path: null,
		folderId: null,
		markdown: `# ${overrides.title}\n`,
		version: 1,
		role: "editor",
		canWrite: true,
		updatedAt: 0,
		workspaceName: "Shared",
		relativePath: "",
		...overrides,
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
				doc({
					_id: "d_path",
					title: "Notes",
					path: "Pinned/Canonical.md",
					markdown: "# Stored path wins\n",
				}),
				doc({
					_id: "d_legacy_prefixed",
					title: "Legacy Prefixed",
					path: "Product Team/Legacy Prefixed.md",
					markdown: "# Legacy prefix\n",
				}),
			],
			ws_b: [doc({ _id: "d_journal", title: "Journal" })],
		};
		const shared: SharedWithMe = {
			folders: [],
			documents: [
				sharedDoc({
					_id: "d_budget",
					title: "Budget 2026",
					markdown: "# Budget\n",
					role: "commenter",
					canWrite: false,
					version: 7,
					workspaceId: "ws_alice",
					workspaceName: "Alice Finance",
				}),
			],
		};
		return { workspaces, folders, documents, shared };
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
		expect(
			await fs.readFile(
				`${SYNC_ROOT}/Shared with me/Alice Finance - Budget 2026.md`,
			),
		).toBe("# Budget\n");

		// --- Sibling-title collision → ` (2)` suffix. ---
		expect(await fs.readFile(`${SYNC_ROOT}/Product Team/Notes.md`)).toBe(
			"# Notes\n",
		);
		expect(await fs.readFile(`${SYNC_ROOT}/Product Team/Notes (2).md`)).toBe(
			"# Notes\n",
		);
		expect(
			await fs.readFile(`${SYNC_ROOT}/Product Team/Pinned/Canonical.md`),
		).toBe("# Stored path wins\n");
		expect(
			await fs.readFile(`${SYNC_ROOT}/Product Team/Legacy Prefixed.md`),
		).toBe("# Legacy prefix\n");

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
		expect(
			index[`${SYNC_ROOT}/Product Team/Pinned/Canonical.md`]?.documentId,
		).toBe("d_path");
		expect(
			index[`${SYNC_ROOT}/Product Team/Legacy Prefixed.md`]?.documentId,
		).toBe("d_legacy_prefixed");
		expect(
			index[`${SYNC_ROOT}/Shared with me/Alice Finance - Budget 2026.md`],
		).toEqual({
			documentId: "d_budget",
			workspaceId: "ws_alice",
			folderId: null,
			inode: null,
			hash: await contentHash("# Budget\n"),
			role: "commenter",
		});

		// --- Read-only chmod by role. ---
		expect(
			fs.readOnly.get(`${SYNC_ROOT}/Product Team/Specs/Archive/Old Plan.md`),
		).toBe(true);
		expect(
			fs.readOnly.get(
				`${SYNC_ROOT}/Shared with me/Alice Finance - Budget 2026.md`,
			),
		).toBe(true);
		expect(fs.readOnly.get(`${SYNC_ROOT}/Product Team/Roadmap.md`)).toBe(false);

		// --- Result summary. ---
		expect(result.written).toHaveLength(9);
		expect(result.syncRoot).toBe(SYNC_ROOT);
	});

	it("keeps the Shared with me directory reserved when a workspace has the same name", async () => {
		const fs = createMemoryFs();
		const backend = createBackend({
			workspaces: [{ _id: "ws_collision", name: "Shared with me" }],
			folders: { ws_collision: [] },
			documents: {
				ws_collision: [doc({ _id: "d_own", title: "Own Doc" })],
			},
			shared: {
				folders: [],
				documents: [
					sharedDoc({
						_id: "d_shared",
						title: "Shared Doc",
						workspaceId: "ws_other",
						workspaceName: "Other Team",
					}),
				],
			},
		});

		await materializeSyncedFolder(backend, fs, { syncRoot: SYNC_ROOT });

		expect(
			await fs.readFile(`${SYNC_ROOT}/Shared with me (2)/Own Doc.md`),
		).toBe("# Own Doc\n");
		expect(
			await fs.readFile(
				`${SYNC_ROOT}/Shared with me/Other Team - Shared Doc.md`,
			),
		).toBe("# Shared Doc\n");
	});

	it("sanitizes cloud-controlled names as path segments", async () => {
		const fs = createMemoryFs();
		const backend = createBackend({
			workspaces: [{ _id: "ws_a", name: "../Team" }],
			folders: {
				ws_a: [
					{
						_id: "f_escape",
						name: "..\\Secrets",
						parentId: null,
						workspaceId: "ws_a",
					},
				],
			},
			documents: {
				ws_a: [
					doc({
						_id: "d_escape",
						title: "../../Plan",
						folderId: "f_escape",
					}),
				],
			},
			shared: {
				folders: [
					{
						folderId: "f_shared_escape",
						name: "../Escape",
						workspaceId: "ws_other",
						workspaceName: "../Other",
						parentId: null,
						role: "editor",
						repoName: null,
						repoRemoteUrl: null,
						folders: [],
						documents: [
							sharedDoc({
								_id: "d_nested_escape",
								title: "../Nested",
								workspaceId: "ws_other",
								workspaceName: "../Other",
								folderId: "f_shared_escape",
								relativePath: "../inner",
							}),
						],
					},
				],
				documents: [
					sharedDoc({
						_id: "d_shared_escape",
						title: "../Shared",
						workspaceId: "ws_other",
						workspaceName: "../Other",
					}),
				],
			},
		});

		const result = await materializeSyncedFolder(backend, fs, {
			syncRoot: SYNC_ROOT,
		});

		expect(result.written).toContain(`${SYNC_ROOT}/Team/Secrets/Plan.md`);
		expect(result.written).toContain(
			`${SYNC_ROOT}/Shared with me/Other - Shared.md`,
		);
		expect(result.written).toContain(
			`${SYNC_ROOT}/Shared with me/Other - Escape/inner/Nested.md`,
		);
		expect(result.written.some((path) => path.includes(".."))).toBe(false);
	});

	it("materializes shared folder subtrees with real nesting, chmod, and index (RB4)", async () => {
		const fs = createMemoryFs();
		const backend = createBackend({
			workspaces: [],
			folders: {},
			documents: {},
			shared: {
				folders: [
					{
						folderId: "f_root",
						name: "Strategy",
						workspaceId: "ws_x",
						workspaceName: "Acme",
						parentId: null,
						role: "editor",
						repoName: "acme-app",
						repoRemoteUrl: "git@github.com:acme/app.git",
						folders: [
							{
								_id: "f_child",
								name: "Child",
								parentId: "f_root",
								relativePath: "Child",
							},
						],
						documents: [
							sharedDoc({
								_id: "sd_root",
								title: "Overview",
								workspaceId: "ws_x",
								workspaceName: "Acme",
								folderId: "f_root",
								version: 5,
							}),
							sharedDoc({
								_id: "sd_nested",
								title: "Deep Doc",
								workspaceId: "ws_x",
								workspaceName: "Acme",
								folderId: "f_child",
								relativePath: "Child",
								role: "viewer",
								canWrite: false,
							}),
							// Sibling collision inside the subtree directory.
							sharedDoc({
								_id: "sd_dup",
								title: "Overview",
								workspaceId: "ws_x",
								workspaceName: "Acme",
								folderId: "f_root",
							}),
						],
					},
				],
				documents: [],
			},
		});

		const result = await materializeSyncedFolder(backend, fs, {
			syncRoot: SYNC_ROOT,
		});

		const base = `${SYNC_ROOT}/Shared with me/Acme - Strategy`;
		expect(await fs.readFile(`${base}/Overview.md`)).toBe("# Overview\n");
		expect(await fs.readFile(`${base}/Overview (2).md`)).toBe("# Overview\n");
		expect(await fs.readFile(`${base}/Child/Deep Doc.md`)).toBe("# Deep Doc\n");

		// Index keyed by absPath → documentId/folderId (rename-stable binding).
		const index = await loadSyncedFolderIndex(fs, SYNC_ROOT);
		expect(index[`${base}/Overview.md`]).toMatchObject({
			documentId: "sd_root",
			folderId: "f_root",
			workspaceId: "ws_x",
		});
		expect(index[`${base}/Child/Deep Doc.md`]).toMatchObject({
			documentId: "sd_nested",
			folderId: "f_child",
			role: "viewer",
		});

		// Role chmod: viewer → read-only.
		expect(fs.readOnly.get(`${base}/Child/Deep Doc.md`)).toBe(true);
		expect(fs.readOnly.get(`${base}/Overview.md`)).toBe(false);

		// Base cache per doc for reconcile.
		const reconcileBase = await readReconcileBase(fs, SYNC_ROOT, "sd_root");
		expect(reconcileBase?.metadata.revision).toBe(5);
		expect(reconcileBase?.metadata.path).toBe(
			"Shared with me/Acme - Strategy/Overview.md",
		);
		expect(result.written).toHaveLength(3);
	});

	it("a subtree doc also in a member workspace is not materialized twice", async () => {
		const fs = createMemoryFs();
		const backend = createBackend({
			workspaces: [{ _id: "ws_a", name: "Team" }],
			folders: { ws_a: [] },
			documents: { ws_a: [doc({ _id: "d_dupe", title: "Doc" })] },
			shared: {
				folders: [
					{
						folderId: "f_s",
						name: "Folder",
						workspaceId: "ws_a",
						workspaceName: "Team",
						parentId: null,
						role: "editor",
						repoName: null,
						repoRemoteUrl: null,
						folders: [],
						documents: [
							sharedDoc({
								_id: "d_dupe",
								title: "Doc",
								workspaceId: "ws_a",
								workspaceName: "Team",
							}),
						],
					},
				],
				documents: [],
			},
		});

		const result = await materializeSyncedFolder(backend, fs, {
			syncRoot: SYNC_ROOT,
		});

		expect(result.written).toEqual([`${SYNC_ROOT}/Team/Doc.md`]);
		expect(
			result.written.filter((path) => path.includes("Shared with me")),
		).toHaveLength(0);
	});

	it("does not rewrite an unchanged projection during materialization", async () => {
		const fs = createMemoryFs({
			[`${SYNC_ROOT}/Product Team/Roadmap.md`]: "# Roadmap\n",
		});
		const backend = createBackend({
			...fixture(),
			documents: {
				ws_a: [doc({ _id: "d_roadmap", title: "Roadmap", version: 3 })],
				ws_b: [],
			},
		});

		await materializeSyncedFolder(backend, fs, {
			syncRoot: SYNC_ROOT,
		});

		expect(
			fs.writes.some(
				(write) => write.path === `${SYNC_ROOT}/Product Team/Roadmap.md`,
			),
		).toBe(false);
		expect(fs.readOnly.get(`${SYNC_ROOT}/Product Team/Roadmap.md`)).toBe(false);
		const base = await readReconcileBase(fs, SYNC_ROOT, "d_roadmap");
		expect(base?.baseMarkdown).toBe("# Roadmap\n");
		expect(base?.metadata.revision).toBe(3);
	});
});

describe("materializeWorkspaceRoot", () => {
	const WORKSPACE_ROOT = "/Hubble/Acme";

	it("places only the selected Workspace at the root with explicit empty-folder topology", async () => {
		const fs = createMemoryFs();
		const backend = createBackend({
			workspaces: [
				{ _id: "ws_acme", name: "Acme" },
				{ _id: "ws_other", name: "Other" },
			],
			folders: {
				ws_acme: [
					{
						_id: "f_product",
						name: "Product",
						parentId: null,
						workspaceId: "ws_acme",
					},
					{
						_id: "f_empty",
						name: "Empty",
						parentId: "f_product",
						workspaceId: "ws_acme",
					},
				],
			},
			documents: {
				ws_acme: [
					doc({ _id: "d_root", title: "Root", path: "Root.md" }),
					doc({
						_id: "d_nested",
						title: "Roadmap",
						path: null,
						folderId: "f_product",
						role: "viewer",
						canWrite: false,
					}),
				],
				ws_other: [doc({ _id: "d_other", title: "Secret" })],
			},
			shared: {
				folders: [],
				documents: [
					sharedDoc({
						_id: "d_shared",
						title: "Shared",
						workspaceId: "ws_other",
					}),
				],
			},
		});

		const result = await materializeWorkspaceRoot(backend, fs, {
			syncRoot: WORKSPACE_ROOT,
			workspaceId: "ws_acme",
		});

		expect(result.written).toEqual([
			`${WORKSPACE_ROOT}/Root.md`,
			`${WORKSPACE_ROOT}/Product/Roadmap.md`,
		]);
		expect(result.written.some((path) => path.includes("Other"))).toBe(false);
		expect(result.written.some((path) => path.includes("Shared with me"))).toBe(
			false,
		);
		expect(fs.directories).toContain(`${WORKSPACE_ROOT}/Product/Empty`);
		expect(result.topology).toEqual([
			{
				folderId: "f_product",
				workspaceId: "ws_acme",
				parentFolderId: null,
				relativePath: "Product",
			},
			{
				folderId: "f_empty",
				workspaceId: "ws_acme",
				parentFolderId: "f_product",
				relativePath: "Product/Empty",
			},
		]);
		expect(fs.readOnly.get(`${WORKSPACE_ROOT}/Product/Roadmap.md`)).toBe(true);
	});

	it("plans the same canonical paths without writing document bytes", async () => {
		const backend = createBackend({
			workspaces: [],
			folders: { ws_acme: [] },
			documents: {
				ws_acme: [
					doc({
						_id: "d_path",
						title: "Display title",
						path: "admin/activity-log.md",
					}),
				],
			},
		});

		const plan = await planWorkspaceRoot(backend, {
			syncRoot: WORKSPACE_ROOT,
			workspaceId: "ws_acme",
		});

		expect(Object.keys(plan)).toEqual([
			`${WORKSPACE_ROOT}/admin/activity-log.md`,
		]);
	});
});

describe("materializeMountFolder (RB3 repo-link mount)", () => {
	const MOUNT_ROOT = "/repo/acme-brain";

	it("materializes the folder subtree at the mount root with index + base caches", async () => {
		const fs = createMemoryFs();
		const backend = createBackend({
			workspaces: [],
			folders: {},
			documents: {},
			subtreeDocuments: {
				f_link: [
					sharedDoc({
						_id: "m_brain",
						title: "BRAIN",
						workspaceId: "ws_x",
						folderId: "f_link",
						markdown: "# BRAIN.md\n",
						version: 2,
					}),
					sharedDoc({
						_id: "m_notes",
						title: "Notes",
						workspaceId: "ws_x",
						folderId: "f_sub",
						relativePath: "Research/2026",
						role: "viewer",
						canWrite: false,
					}),
				],
			},
		});

		const result = await materializeMountFolder(backend, fs, {
			syncRoot: MOUNT_ROOT,
			folderId: "f_link",
		});

		// Subtree-relative layout directly under the mount root — no wrapper dirs.
		expect(await fs.readFile(`${MOUNT_ROOT}/BRAIN.md`)).toBe("# BRAIN.md\n");
		expect(await fs.readFile(`${MOUNT_ROOT}/Research/2026/Notes.md`)).toBe(
			"# Notes\n",
		);

		const index = await loadSyncedFolderIndex(fs, MOUNT_ROOT);
		expect(index[`${MOUNT_ROOT}/BRAIN.md`]).toMatchObject({
			documentId: "m_brain",
			folderId: "f_link",
		});
		expect(fs.readOnly.get(`${MOUNT_ROOT}/Research/2026/Notes.md`)).toBe(true);

		// Base cache rooted at the mount so reconcileProjectionFile finds it.
		const base = await readReconcileBase(fs, MOUNT_ROOT, "m_brain");
		expect(base?.metadata.revision).toBe(2);
		expect(base?.metadata.path).toBe("BRAIN.md");
		expect(result.written).toHaveLength(2);
	});

	it("uses the document path filename while keeping the title as display text", async () => {
		const fs = createMemoryFs();
		const backend = createBackend({
			workspaces: [],
			folders: {},
			documents: {},
			subtreeDocuments: {
				f_link: [
					sharedDoc({
						_id: "m_activity",
						title: "Brain Activity Log",
						path: "admin/activity-log.md",
						workspaceId: "ws_x",
						relativePath: "admin",
					}),
				],
			},
		});

		const result = await materializeMountFolder(backend, fs, {
			syncRoot: MOUNT_ROOT,
			folderId: "f_link",
		});

		expect(result.written).toEqual([`${MOUNT_ROOT}/admin/activity-log.md`]);
		expect(await fs.readFile(`${MOUNT_ROOT}/admin/activity-log.md`)).toBe(
			"# Brain Activity Log\n",
		);
	});

	it("drops path-escape segments from cloud-controlled relative paths", async () => {
		const fs = createMemoryFs();
		const backend = createBackend({
			workspaces: [],
			folders: {},
			documents: {},
			subtreeDocuments: {
				f_link: [
					sharedDoc({
						_id: "m_escape",
						title: "../Evil",
						workspaceId: "ws_x",
						relativePath: "../../outside",
					}),
				],
			},
		});

		const result = await materializeMountFolder(backend, fs, {
			syncRoot: MOUNT_ROOT,
			folderId: "f_link",
		});

		expect(result.written).toEqual([`${MOUNT_ROOT}/outside/Evil.md`]);
		expect(result.written.some((path) => path.includes(".."))).toBe(false);
	});
});
