import { describe, expect, it } from "vitest";
import { contentHash, type LocalFile } from "./fs.js";
import { compareProjectionPlanWithDisk } from "./projectionPlan.js";
import type { SyncedFolderIndex } from "./syncedFolderIndex.js";

describe("compareProjectionPlanWithDisk", () => {
	it("separates untracked Markdown from desired-path collisions without writes", async () => {
		const files: LocalFile[] = [
			{ relativePath: "Notes.md", content: "local", hash: "local-hash" },
			{ relativePath: "draft.md", content: "draft", hash: "draft-hash" },
			{ relativePath: "tracked.md", content: "same", hash: "tracked-hash" },
		];
		const entry = {
			documentId: "d1",
			workspaceId: "ws1",
			folderId: null,
			inode: null,
			hash: await contentHash("cloud"),
			role: "editor" as const,
		};
		const desired: SyncedFolderIndex = {
			"/mount/Notes.md": entry,
			"/mount/tracked.md": { ...entry, documentId: "d2" },
		};
		const prior: SyncedFolderIndex = {
			"/mount/tracked.md": { ...entry, documentId: "d2" },
		};

		const comparison = await compareProjectionPlanWithDisk(
			{ listMarkdownFiles: async () => files },
			"/mount",
			desired,
			prior,
		);

		expect(comparison.collisions.map(({ path }) => path)).toEqual([
			"/mount/Notes.md",
		]);
		expect(comparison.untracked.map(({ path }) => path)).toEqual([
			"/mount/draft.md",
		]);
	});

	it("normalizes Windows separators returned by the filesystem adapter", async () => {
		const entry = {
			documentId: "d1",
			workspaceId: "ws1",
			folderId: null,
			inode: null,
			hash: "hash",
			role: "editor" as const,
		};
		const comparison = await compareProjectionPlanWithDisk(
			{
				listMarkdownFiles: async () => [
					{ relativePath: "folder\\note.md", content: "local", hash: "hash" },
				],
			},
			"C:/mount",
			{ "C:/mount/folder/note.md": entry },
			{},
		);
		expect(comparison.collisions).toHaveLength(1);
	});
});
