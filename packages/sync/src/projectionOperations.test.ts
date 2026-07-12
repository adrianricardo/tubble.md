import { describe, expect, it } from "vitest";
import {
	loadProjectionOperations,
	projectionOperationsPath,
	saveProjectionOperations,
	upsertProjectionOperation,
} from "./projectionOperations.js";

function memoryFs() {
	const files = new Map<string, string>();
	return {
		files,
		async ensureDir() {},
		async readFileOrNull(path: string) {
			return files.get(path) ?? null;
		},
		async writeFile(path: string, content: string) {
			files.set(path, content);
		},
	};
}

describe("projection operations manifest", () => {
	it("persists a versioned journal with stable identity and creation time", async () => {
		const fs = memoryFs();
		const input = {
			kind: "missing-document" as const,
			documentId: "d1",
			workspaceId: "ws1",
			folderId: "f1",
			path: "/mount/note.md",
			baseHash: "base",
		};
		const first = await saveProjectionOperations(fs, "/mount", [input], 10);
		const second = await saveProjectionOperations(fs, "/mount", [input], 20);

		expect(first.version).toBe(1);
		expect(second.operations[0]).toMatchObject({
			id: first.operations[0]?.id,
			createdAt: 10,
			updatedAt: 20,
		});
		expect(await loadProjectionOperations(fs, "/mount")).toEqual(second);
		expect(fs.files.has(projectionOperationsPath("/mount"))).toBe(true);
	});

	it("clears resolved startup blockers durably", async () => {
		const fs = memoryFs();
		await saveProjectionOperations(
			fs,
			"/mount",
			[
				{
					kind: "path-collision",
					documentId: "d1",
					workspaceId: "ws1",
					folderId: null,
					path: "/mount/note.md",
					localHash: "local",
					desiredHash: "cloud",
				},
			],
			10,
		);
		const manifest = await saveProjectionOperations(fs, "/mount", [], 20);
		expect(manifest.operations).toEqual([]);
	});

	it("upserts a move without discarding unrelated recovery work", async () => {
		const fs = memoryFs();
		await saveProjectionOperations(
			fs,
			"/mount",
			[
				{
					kind: "missing-document",
					documentId: "d1",
					workspaceId: "ws1",
					folderId: null,
					path: "/mount/old.md",
					baseHash: "base",
				},
			],
			10,
		);
		const manifest = await upsertProjectionOperation(
			fs,
			"/mount",
			{
				kind: "consequential-move",
				documentId: "d2",
				workspaceId: "ws1",
				folderId: null,
				path: "/mount/from.md",
				toPath: "/mount/to.md",
				toFolderId: "f2",
				title: "to",
				fingerprint: "reviewed",
				impact: {
					gainingUserCount: 1,
					losingUserCount: 0,
					publicAccessChanged: false,
					repoExposureChanged: true,
				},
				latestHash: "local",
			},
			20,
		);
		expect(manifest.operations.map((operation) => operation.kind)).toEqual([
			"missing-document",
			"consequential-move",
		]);
		const afterStartupRefresh = await saveProjectionOperations(
			fs,
			"/mount",
			[],
			30,
		);
		expect(afterStartupRefresh.operations).toHaveLength(1);
		expect(afterStartupRefresh.operations[0]?.kind).toBe("consequential-move");
	});
});
