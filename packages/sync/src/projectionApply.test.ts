import { describe, expect, it } from "vitest";
import {
	captureProjectionSnapshot,
	guardProjectionFileSystem,
	ProjectionGuardConflict,
} from "./projectionApply.js";

describe("guarded projection application", () => {
	it("rejects a destination changed after planning without overwriting it", async () => {
		const files = new Map([["/mount/note.md", "planned"]]);
		const fs = {
			async ensureDir() {},
			async readFileOrNull(path: string) {
				return files.get(path) ?? null;
			},
			async writeFile(path: string, content: string) {
				files.set(path, content);
			},
		};
		const desired = {
			"/mount/note.md": {
				documentId: "d1",
				workspaceId: "ws1",
				folderId: null,
				inode: null,
				hash: "cloud",
				role: "editor" as const,
			},
		};
		const snapshot = await captureProjectionSnapshot(fs, desired);
		files.set("/mount/note.md", "changed after plan");

		await expect(
			guardProjectionFileSystem(fs, snapshot).writeFile(
				"/mount/note.md",
				"cloud",
			),
		).rejects.toBeInstanceOf(ProjectionGuardConflict);
		expect(files.get("/mount/note.md")).toBe("changed after plan");
	});

	it("allows the reviewed write and advances the guard for another write", async () => {
		const files = new Map<string, string>();
		const fs = {
			async ensureDir() {},
			async readFileOrNull(path: string) {
				return files.get(path) ?? null;
			},
			async writeFile(path: string, content: string) {
				files.set(path, content);
			},
		};
		const snapshot = { "/mount/note.md": null };
		const guarded = guardProjectionFileSystem(fs, snapshot);
		await guarded.writeFile("/mount/note.md", "first");
		await guarded.writeFile("/mount/note.md", "second");
		expect(files.get("/mount/note.md")).toBe("second");
	});
});
