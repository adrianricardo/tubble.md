import { describe, expect, it } from "vitest";
import { contentHash } from "./fs.js";
import {
	correlateStartupProjectionMoves,
	inspectStartupProjectionDrift,
	loadSyncedFolderIndexManifest,
	type SyncedFolderIndex,
	saveSyncedFolderIndexManifest,
} from "./syncedFolderIndex.js";

describe("inspectStartupProjectionDrift", () => {
	it("refuses to reuse a Workspace-root index for another Workspace", async () => {
		const raw = JSON.stringify({
			version: 2,
			mount: { kind: "workspace", workspaceId: "ws_original" },
			syncRoot: "/mount",
			topology: [],
			verification: { state: "verified", reason: null, updatedAt: 1 },
			entries: {},
		});

		await expect(
			loadSyncedFolderIndexManifest(
				{ readFileOrNull: async () => raw },
				"/mount",
				{ kind: "workspace", workspaceId: "ws_other" },
			),
		).rejects.toThrow("different mount");
	});

	it("migrates a v1 bare index into the versioned mount envelope", async () => {
		const entry = {
			documentId: "d1",
			workspaceId: "ws1",
			folderId: "f1",
			inode: null,
			hash: "hash",
			role: "editor" as const,
		};
		let written = "";
		const manifest = await loadSyncedFolderIndexManifest(
			{
				readFileOrNull: async () => JSON.stringify({ "/mount/doc.md": entry }),
			},
			"/mount",
			{ kind: "folder", folderId: "f1" },
		);
		await saveSyncedFolderIndexManifest(
			{
				ensureDir: async () => {},
				writeFile: async (_path, value) => {
					written = value;
				},
			},
			"/mount",
			manifest,
		);

		expect(JSON.parse(written)).toMatchObject({
			version: 2,
			mount: { kind: "folder", folderId: "f1" },
			entries: { "/mount/doc.md": { documentId: "d1" } },
		});
	});
	it("classifies indexed projections without mutating disk", async () => {
		const files = new Map([
			["/mount/unchanged.md", "same"],
			["/mount/changed.md", "local edit"],
		]);
		const entry = {
			documentId: "d1",
			workspaceId: "ws1",
			folderId: "f1",
			inode: null,
			hash: await contentHash("same"),
			role: "editor" as const,
		};
		const index: SyncedFolderIndex = {
			"/mount/unchanged.md": entry,
			"/mount/changed.md": { ...entry, documentId: "d2" },
			"/mount/missing.md": { ...entry, documentId: "d3" },
		};

		const drift = await inspectStartupProjectionDrift(
			{ readFileOrNull: async (path) => files.get(path) ?? null },
			index,
		);

		expect(drift.map(({ kind, path }) => ({ kind, path }))).toEqual([
			{ kind: "unchanged", path: "/mount/unchanged.md" },
			{ kind: "changed", path: "/mount/changed.md" },
			{ kind: "missing", path: "/mount/missing.md" },
		]);
		expect(files.get("/mount/changed.md")).toBe("local edit");
	});
});

describe("correlateStartupProjectionMoves", () => {
	it("correlates a unique quit-time move by inode before hash", async () => {
		const entry = {
			documentId: "d1",
			workspaceId: "ws1",
			folderId: "f1",
			inode: 42,
			hash: await contentHash("before"),
			role: "editor" as const,
		};
		const result = await correlateStartupProjectionMoves(
			{
				listMarkdownFiles: async () => [
					{
						relativePath: "archive/renamed.md",
						content: "edited after move",
						hash: await contentHash("edited after move"),
					},
				],
			},
			"/mount",
			{ "/mount/original.md": entry },
			[{ kind: "missing", path: "/mount/original.md", entry }],
			() => 42,
		);

		expect(result.moves).toEqual([
			{
				fromPath: "/mount/original.md",
				toPath: "/mount/archive/renamed.md",
				entry,
				matchedBy: "inode",
			},
		]);
		expect(result.ambiguous).toEqual([]);
	});

	it("preserves duplicate-hash candidates as ambiguous", async () => {
		const hash = await contentHash("same");
		const entry = {
			documentId: "d1",
			workspaceId: "ws1",
			folderId: null,
			inode: null,
			hash,
			role: "owner" as const,
		};
		const result = await correlateStartupProjectionMoves(
			{
				listMarkdownFiles: async () =>
					["a.md", "b.md"].map((relativePath) => ({
						relativePath,
						content: "same",
						hash,
					})),
			},
			"/mount",
			{ "/mount/original.md": entry },
			[{ kind: "missing", path: "/mount/original.md", entry }],
			() => null,
		);

		expect(result.moves).toEqual([]);
		expect(result.ambiguous[0]).toMatchObject({
			path: "/mount/original.md",
			candidatePaths: ["/mount/a.md", "/mount/b.md"],
		});
	});
});
