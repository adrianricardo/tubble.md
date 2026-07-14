import { promises as fs, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	LOCAL_AVAILABILITY_VERSION,
	LocalAvailabilityStore,
} from "./localAvailabilityStore";

const tempDirs: string[] = [];

function tempDir(): string {
	const directory = mkdtempSync(path.join(os.tmpdir(), "hubble-availability-"));
	tempDirs.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("LocalAvailabilityStore", () => {
	it("migrates legacy repo mounts once without modifying the legacy file", async () => {
		const directory = tempDir();
		const filePath = path.join(directory, "local-availability.json");
		const legacyPath = path.join(directory, "repo-mounts.json");
		const legacy = JSON.stringify({
			mounts: [
				{ invalid: true },
				{
					folderId: "folder-a",
					folderName: "Strategy",
					workspaceId: "workspace-a",
					mountPath: "/repo/Strategy",
					repoDir: "/repo",
					repoName: "acme",
					repoRemoteUrl: "git@example.com:acme/repo.git",
				},
			],
		});
		await fs.writeFile(legacyPath, legacy);
		const store = new LocalAvailabilityStore({
			filePath,
			legacyRepoMountsPath: legacyPath,
			now: () => 42,
		});

		await expect(store.list()).resolves.toEqual([
			expect.objectContaining({
				scopeKey: "folder:folder-a",
				scope: {
					kind: "folder",
					workspaceId: "workspace-a",
					folderId: "folder-a",
				},
				association: "repo",
				localRoot: "/repo/Strategy",
				createdAt: 42,
			}),
		]);
		expect(await fs.readFile(legacyPath, "utf8")).toBe(legacy);
		expect(JSON.parse(await fs.readFile(filePath, "utf8"))).toMatchObject({
			version: LOCAL_AVAILABILITY_VERSION,
		});

		await fs.writeFile(
			legacyPath,
			JSON.stringify({ mounts: [{ invalid: true }] }),
		);
		await expect(store.list()).resolves.toHaveLength(1);
	});

	it("uses the versioned registry as authority and validates stable scope keys", async () => {
		const directory = tempDir();
		const store = new LocalAvailabilityStore({
			filePath: path.join(directory, "local-availability.json"),
			legacyRepoMountsPath: path.join(directory, "repo-mounts.json"),
		});
		await store.upsert({
			scopeKey: "workspace:workspace-a",
			scope: { kind: "workspace", workspaceId: "workspace-a" },
			displayName: "Acme",
			localRoot: "/Users/test/Hubble/Acme",
			association: "standalone",
			repoRoot: null,
			repoName: null,
			repoRemoteUrl: null,
			gitExclusion: { status: "not-applicable" },
			createdAt: 1,
			updatedAt: 1,
			lastConnectedAt: null,
		});
		await expect(store.list()).resolves.toHaveLength(1);

		await expect(
			store.upsert({
				...(await store.list())[0],
				scopeKey: "workspace:wrong",
			}),
		).rejects.toThrow("scope key");
	});
});
