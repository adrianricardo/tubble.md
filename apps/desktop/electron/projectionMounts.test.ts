import { promises as fs, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	assertCloudProjectionRootsDisjoint,
	assertLocalProjectionRootsDisjoint,
	canonicalizeProjectionRoot,
	type ProjectionMount,
} from "./projectionMounts";

const tempDirs: string[] = [];

function tempDir(): string {
	const dir = mkdtempSync(path.join(os.tmpdir(), "hubble-mounts-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function mount(overrides: Partial<ProjectionMount> = {}): ProjectionMount {
	return {
		localRoot: "/repos/a/brain",
		workspaceId: "workspace-a",
		folderId: "folder-a",
		...overrides,
	};
}

describe("projection mount validation", () => {
	it("canonicalizes a missing target through its nearest existing symlink ancestor", async () => {
		const root = tempDir();
		const actual = path.join(root, "actual");
		const linked = path.join(root, "linked");
		await fs.mkdir(actual);
		await fs.symlink(actual, linked);
		const canonicalActual = await fs.realpath(actual);

		await expect(
			canonicalizeProjectionRoot(path.join(linked, "new", "brain"), {
				realpath: fs.realpath,
			}),
		).resolves.toBe(path.join(canonicalActual, "new", "brain"));
	});

	it("rejects identical, ancestor, descendant, and symlink-resolved local roots", async () => {
		const root = tempDir();
		const actual = path.join(root, "actual");
		const linked = path.join(root, "linked");
		await fs.mkdir(actual);
		await fs.symlink(actual, linked);
		const existing = mount({ localRoot: path.join(actual, "brain") });

		for (const localRoot of [
			path.join(actual, "brain"),
			actual,
			path.join(actual, "brain", "nested"),
			path.join(linked, "brain"),
		]) {
			await expect(
				assertLocalProjectionRootsDisjoint(mount({ localRoot }), [existing], {
					realpath: fs.realpath,
				}),
			).rejects.toThrow("Local projection roots overlap");
		}
	});

	it("allows disjoint local roots", async () => {
		const root = tempDir();
		const first = path.join(root, "first");
		const second = path.join(root, "second");
		await fs.mkdir(first);
		await fs.mkdir(second);
		await expect(
			assertLocalProjectionRootsDisjoint(
				mount({ localRoot: first }),
				[mount({ localRoot: second })],
				{ realpath: fs.realpath },
			),
		).resolves.toBeUndefined();
	});

	it("rejects the same cloud folder and parent-child folder mounts", () => {
		const folders = [
			{
				_id: "folder-a",
				name: "A",
				parentId: null,
				workspaceId: "workspace-a",
			},
			{
				_id: "folder-b",
				name: "B",
				parentId: "folder-a",
				workspaceId: "workspace-a",
			},
			{
				_id: "folder-c",
				name: "C",
				parentId: null,
				workspaceId: "workspace-a",
			},
		];

		expect(() =>
			assertCloudProjectionRootsDisjoint(mount(), [mount()], folders),
		).toThrow("overlaps an existing projection");
		expect(() =>
			assertCloudProjectionRootsDisjoint(
				mount({ folderId: "folder-b" }),
				[mount({ folderId: "folder-a" })],
				folders,
			),
		).toThrow("overlaps an existing projection");
		expect(() =>
			assertCloudProjectionRootsDisjoint(
				mount({ folderId: "folder-c" }),
				[mount({ folderId: "folder-a" })],
				folders,
			),
		).not.toThrow();
	});
});
