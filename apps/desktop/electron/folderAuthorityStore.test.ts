import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	FOLDER_AUTHORITY_VERSION,
	type FolderAuthorityPlacement,
	FolderAuthorityStore,
} from "./folderAuthorityStore";

const roots: string[] = [];

async function fixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), "hubble-authority-store-"));
	roots.push(root);
	return {
		root,
		filePath: path.join(root, "folder-authority.json"),
		store: new FolderAuthorityStore(path.join(root, "folder-authority.json")),
	};
}

function placement(
	repoRoot: string,
	overrides: Partial<FolderAuthorityPlacement> = {},
): FolderAuthorityPlacement {
	return {
		id: "placement-1",
		repoRoot,
		relativePath: "docs/shared",
		workspaceId: "workspace-1",
		cloudFolderId: "folder-1",
		formerGitFingerprint: "fingerprint-1",
		projection: null,
		createdAt: 1,
		updatedAt: 1,
		...overrides,
	};
}

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true })),
	);
});

describe("FolderAuthorityStore", () => {
	it("atomically persists canonical direct placements", async () => {
		const { filePath, root, store } = await fixture();
		await store.upsert(placement(root, { relativePath: "docs\\shared" }));

		expect(await store.list()).toMatchObject([
			{ id: "placement-1", repoRoot: root, relativePath: "docs/shared" },
		]);
		expect(JSON.parse(await readFile(filePath, "utf8"))).toMatchObject({
			version: FOLDER_AUTHORITY_VERSION,
			placements: [{ id: "placement-1" }],
		});
	});

	it("rejects overlapping cloud roots in one Git hierarchy", async () => {
		const { root, store } = await fixture();
		await store.upsert(placement(root));

		await expect(
			store.upsert(
				placement(root, {
					id: "placement-2",
					relativePath: "docs/shared/nested",
					cloudFolderId: "folder-2",
				}),
			),
		).rejects.toThrow("Authority placements overlap");
		expect(await store.list()).toHaveLength(1);
	});

	it("rejects paths that escape the repository", async () => {
		const { root, store } = await fixture();
		await expect(
			store.upsert(placement(root, { relativePath: "../outside" })),
		).rejects.toThrow("Placement path must stay within its repository");
	});
});
