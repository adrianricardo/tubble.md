import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { contentHash, SYNCED_FOLDER_INDEX_REL } from "@hubble.md/sync";
import { afterEach, describe, expect, it } from "vitest";
import {
	isMountClean,
	mountCleanliness,
	rewriteProjectionIndexRoot,
} from "./repoMountClean";

const tempDirs: string[] = [];

async function tempMount(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hubble-mount-clean-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	for (const dir of tempDirs.splice(0)) {
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("isMountClean", () => {
	it("returns true when indexed files match and only state files are extra", async () => {
		const mount = await tempMount();
		const docPath = path.join(mount, "Doc.md");
		await fs.writeFile(docPath, "hello");
		await writeIndex(mount, {
			[docPath]: {
				documentId: "d1",
				workspaceId: "w1",
				folderId: "f1",
				inode: null,
				hash: await contentHash("hello"),
				role: "editor",
			},
		});

		expect(await isMountClean(mount)).toBe(true);
	});

	it("returns false when an indexed file has local edits", async () => {
		const mount = await tempMount();
		const docPath = path.join(mount, "Doc.md");
		await fs.writeFile(docPath, "hello");
		await writeIndex(mount, {
			[docPath]: {
				documentId: "d1",
				workspaceId: "w1",
				folderId: "f1",
				inode: null,
				hash: await contentHash("hello"),
				role: "editor",
			},
		});
		await fs.writeFile(docPath, "local edit");

		expect(await isMountClean(mount)).toBe(false);
	});

	it("returns false when an untracked file exists outside .hubble state", async () => {
		const mount = await tempMount();
		const docPath = path.join(mount, "Doc.md");
		await fs.writeFile(docPath, "hello");
		await writeIndex(mount, {
			[docPath]: {
				documentId: "d1",
				workspaceId: "w1",
				folderId: "f1",
				inode: null,
				hash: await contentHash("hello"),
				role: "editor",
			},
		});
		await fs.writeFile(path.join(mount, "scratch.md"), "new");

		expect(await isMountClean(mount)).toBe(false);
	});
});

describe("mountCleanliness", () => {
	it("requires a connected engine and matching indexed bytes", () => {
		expect(mountCleanliness("connected", true)).toEqual({ state: "clean" });
		expect(mountCleanliness("connected", false)).toMatchObject({
			state: "blocked",
			reason: "dirty",
		});
		expect(mountCleanliness("pending-review", true)).toMatchObject({
			state: "blocked",
			reason: "pending-review",
		});
	});
});

describe("rewriteProjectionIndexRoot", () => {
	it("rekeys a legacy bare index", async () => {
		const mount = await tempMount();
		await writeIndex(mount, {
			[`${mount}/note.md`]: { documentId: "doc" },
		});
		const relocated = `${mount}-next`;
		await rewriteProjectionIndexRoot(mount, mount, relocated);
		const indexPath = path.join(mount, ...SYNCED_FOLDER_INDEX_REL.split("/"));
		expect(JSON.parse(await fs.readFile(indexPath, "utf8"))).toEqual({
			[`${relocated}/note.md`]: { documentId: "doc" },
		});
	});

	it("rekeys a v2 manifest before a clean mount relocation", async () => {
		const mount = await tempMount();
		const indexPath = path.join(mount, ".hubble/index/synced-folder.json");
		await fs.mkdir(path.dirname(indexPath), { recursive: true });
		await fs.writeFile(
			indexPath,
			JSON.stringify({
				version: 2,
				mount: { kind: "folder", folderId: "folder" },
				syncRoot: mount,
				topology: [],
				verification: { state: "verified", reason: null, updatedAt: 1 },
				entries: { [`${mount}/note.md`]: { documentId: "doc" } },
			}),
		);
		const relocated = `${mount}-next`;
		await rewriteProjectionIndexRoot(mount, mount, relocated);
		const result = JSON.parse(await fs.readFile(indexPath, "utf8"));
		expect(result.syncRoot).toBe(relocated);
		expect(result.entries).toEqual({
			[`${relocated}/note.md`]: { documentId: "doc" },
		});
	});
});

async function writeIndex(
	mount: string,
	index: Record<string, unknown>,
): Promise<void> {
	const indexPath = path.join(mount, ...SYNCED_FOLDER_INDEX_REL.split("/"));
	await fs.mkdir(path.dirname(indexPath), { recursive: true });
	await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
	await fs.writeFile(path.join(mount, ".hubble", "state.json"), "{}");
}
