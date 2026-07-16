import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	buildAuthorityManifest,
	contentHash,
	type SyncBackend,
} from "@hubble.md/sync";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
	AuthorityTransferOperation,
	GitFolderInspection,
	GitToCloudAuthorityMoveInput,
} from "../src/desktopApi/types";
import { AuthorityMoveCoordinator } from "./authorityMoveCoordinator";
import { AuthorityTransferStore } from "./authorityTransferStore";
import { FolderAuthorityStore } from "./folderAuthorityStore";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots
			.splice(0)
			.map((root) => fs.rm(root, { recursive: true, force: true })),
	);
});

async function fixture() {
	const base = await fs.mkdtemp(
		path.join(os.tmpdir(), "hubble-authority-move-"),
	);
	roots.push(base);
	const repoRoot = path.join(base, "repo");
	const sourcePath = path.join(repoRoot, "notes");
	await fs.mkdir(sourcePath, { recursive: true });
	const markdown = "# Move me\n";
	await fs.writeFile(path.join(sourcePath, "readme.md"), markdown);
	const hash = await contentHash(markdown);
	const manifest = await buildAuthorityManifest({
		items: [
			{
				relativePath: "readme.md",
				kind: "markdown",
				size: Buffer.byteLength(markdown),
				hash,
				gitState: "tracked",
				readOnly: false,
				executable: false,
			},
		],
		exclusions: [],
	});
	const inspection: GitFolderInspection = {
		sourcePath,
		repoRoot,
		repoName: "repo",
		repoRemoteUrl: null,
		relativePath: "notes",
		manifest,
		trackedFileCount: 1,
		workingTreeChanges: [],
		workingTreeChangesTruncated: false,
		previewFingerprint: "preview-1",
		confirmationBlocked: false,
	};
	return {
		base,
		repoRoot,
		sourcePath,
		inspection,
		transferStore: new AuthorityTransferStore(
			path.join(base, "transfers.json"),
		),
		placementStore: new FolderAuthorityStore(
			path.join(base, "placements.json"),
		),
	};
}

function backend(
	options: {
		stageError?: Error;
		verificationError?: Error;
		activationError?: Error;
	} = {},
) {
	let state:
		| "prepared"
		| "staging"
		| "verified"
		| "active"
		| "cancelled"
		| "needsAttention" = "prepared";
	let cutoverToken: string | undefined;
	const staged: Array<{
		relativePath: string;
		kind: "markdown" | "asset";
		contentHash: string;
		size: number;
		verified: boolean;
	}> = [];
	return {
		prepareGitFolderMove: vi.fn(async () => ({
			transferId: "transfer-1",
			rootFolderId: "cloud-folder-1",
			operationFingerprint: "operation-fingerprint",
			audience: [],
			state,
		})),
		getAuthorityTransferStatus: vi.fn(async () => ({
			state,
			rootFolderId: "cloud-folder-1",
			cutoverToken,
			items: staged,
		})),
		stageAuthorityFolderBatch: vi.fn(async ({ items }) => {
			if (options.stageError) throw options.stageError;
			for (const item of items) {
				staged.push({
					relativePath: item.relativePath,
					kind: item.kind,
					contentHash: item.contentHash,
					size: item.size,
					verified: true,
				});
			}
			state = "staging";
			return {
				created: items.length,
				stagedItemCount: staged.length,
				expectedItemCount: staged.length,
			};
		}),
		verifyAuthorityStaging: vi.fn(async () => {
			if (options.verificationError) throw options.verificationError;
			state = "verified";
			cutoverToken = "cutover-1";
			return { cutoverToken };
		}),
		activateAuthorityFolder: vi.fn(async () => {
			if (options.activationError) throw options.activationError;
			state = "active";
			return { rootFolderId: "cloud-folder-1", state: "active" as const };
		}),
		cancelAuthorityTransferBatch: vi.fn(async () => {
			state = "cancelled";
			return { done: true, removed: staged.length };
		}),
		generateAssetUploadUrl: vi.fn(),
	} as unknown as SyncBackend;
}

function input(sourcePath: string): GitToCloudAuthorityMoveInput {
	return {
		operationId: "operation-1",
		folderPath: sourcePath,
		workspaceId: "workspace-1",
		parentFolderId: null,
		deploymentUrl: "https://example.convex.cloud",
		authToken: "token",
		expectedPreviewFingerprint: "preview-1",
		expectedAudienceFingerprint: "audience-1",
		intent: "move",
	};
}

describe("AuthorityMoveCoordinator", () => {
	test("stages, verifies, renames to recovery, activates, and records placement", async () => {
		const setup = await fixture();
		const cloud = backend();
		const coordinator = new AuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectFolder: vi.fn(async () => setup.inspection),
			now: () => 10,
		});

		const result = await coordinator.moveGitFolderToCloud(
			input(setup.sourcePath),
		);

		expect(result).toMatchObject({
			status: "completed",
			cloudFolderId: "cloud-folder-1",
		});
		expect(await fs.stat(setup.sourcePath).catch(() => null)).toBeNull();
		if (result.status !== "completed") throw new Error("Expected completion");
		expect(
			await fs.readFile(path.join(result.recoveryPath, "readme.md"), "utf8"),
		).toBe("# Move me\n");
		expect(await setup.placementStore.list()).toMatchObject([
			{
				repoRoot: setup.repoRoot,
				relativePath: "notes",
				cloudFolderId: "cloud-folder-1",
			},
		]);
		expect((await setup.transferStore.list())[0]?.phase).toBe("completed");
		expect(cloud.stageAuthorityFolderBatch).toHaveBeenCalledTimes(1);
		expect(cloud.activateAuthorityFolder).toHaveBeenCalledTimes(1);
	});

	test("restores the source when cloud activation fails", async () => {
		const setup = await fixture();
		const cloud = backend({ activationError: new Error("activation failed") });
		const coordinator = new AuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectFolder: vi.fn(async () => setup.inspection),
		});

		const result = await coordinator.moveGitFolderToCloud(
			input(setup.sourcePath),
		);

		expect(result).toMatchObject({
			status: "needs-attention",
			message: "activation failed",
		});
		expect(
			await fs.readFile(path.join(setup.sourcePath, "readme.md"), "utf8"),
		).toBe("# Move me\n");
		expect(await setup.placementStore.list()).toEqual([]);
		expect((await setup.transferStore.list())[0]).toMatchObject({
			phase: "needs-attention",
			lastError: "activation failed",
		});
	});

	test.each([
		["staging", { stageError: new Error("stage failed") }],
		["verification", { verificationError: new Error("verify failed") }],
	] as const)("leaves Git authoritative when %s fails", async (_phase, cloudOptions) => {
		const setup = await fixture();
		const cloud = backend(cloudOptions);
		const coordinator = new AuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectFolder: vi.fn(async () => setup.inspection),
		});
		await expect(
			coordinator.moveGitFolderToCloud(input(setup.sourcePath)),
		).resolves.toMatchObject({ status: "needs-attention" });
		expect(
			await fs.readFile(path.join(setup.sourcePath, "readme.md"), "utf8"),
		).toBe("# Move me\n");
		expect(await setup.placementStore.list()).toEqual([]);
	});

	test("cleans cloud staging before marking a failed local operation cancelled", async () => {
		const setup = await fixture();
		const cloud = backend({ stageError: new Error("stage failed") });
		const coordinator = new AuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectFolder: vi.fn(async () => setup.inspection),
		});
		await coordinator.moveGitFolderToCloud(input(setup.sourcePath));

		await expect(
			coordinator.cancelGitToCloudMove("operation-1"),
		).resolves.toMatchObject({ phase: "cancelled" });
		expect(cloud.cancelAuthorityTransferBatch).toHaveBeenCalledWith(
			"transfer-1",
		);
	});

	test("retains recovery and resumes forward when placement persistence fails after activation", async () => {
		const setup = await fixture();
		const cloud = backend();
		vi.spyOn(setup.placementStore, "upsert").mockRejectedValueOnce(
			new Error("placement write failed"),
		);
		const coordinator = new AuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectFolder: vi.fn(async () => setup.inspection),
		});

		const failed = await coordinator.moveGitFolderToCloud(
			input(setup.sourcePath),
		);
		expect(failed).toMatchObject({
			status: "needs-attention",
			message: "placement write failed",
		});
		expect(await fs.stat(setup.sourcePath).catch(() => null)).toBeNull();
		if (failed.status !== "needs-attention" || !failed.recoveryPath) {
			throw new Error("Expected retained recovery");
		}
		expect(
			await fs.readFile(path.join(failed.recoveryPath, "readme.md"), "utf8"),
		).toBe("# Move me\n");

		await expect(
			coordinator.moveGitFolderToCloud(input(setup.sourcePath)),
		).resolves.toMatchObject({ status: "completed" });
		expect(await setup.placementStore.list()).toHaveLength(1);
	});

	test("returns a refreshed preview before any cloud mutation", async () => {
		const setup = await fixture();
		const cloud = backend();
		const changed = {
			...setup.inspection,
			previewFingerprint: "preview-2",
		};
		const coordinator = new AuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectFolder: vi.fn(async () => changed),
		});

		await expect(
			coordinator.moveGitFolderToCloud(input(setup.sourcePath)),
		).resolves.toEqual({ status: "stale", inspection: changed });
		expect(cloud.prepareGitFolderMove).not.toHaveBeenCalled();
		expect(await setup.transferStore.list()).toEqual([]);
	});

	test("repairs local placement after an activation-time crash", async () => {
		const setup = await fixture();
		const cloud = backend();
		const recoveryPath = path.join(setup.base, "retained", "notes");
		await fs.mkdir(path.dirname(recoveryPath), { recursive: true });
		await fs.rename(setup.sourcePath, recoveryPath);
		const operation: AuthorityTransferOperation = {
			id: "operation-1",
			direction: "git-to-cloud",
			intent: "move",
			phase: "cutting-over",
			source: {
				kind: "git",
				repoRoot: setup.repoRoot,
				relativePath: "notes",
			},
			destination: {
				kind: "cloud",
				workspaceId: "workspace-1",
				parentFolderId: null,
			},
			manifestSummary: setup.inspection.manifest.summary,
			manifestHash: setup.inspection.manifest.manifestHash,
			previewFingerprint: "preview-1",
			cloudTransferId: "transfer-1",
			cloudRootFolderId: "cloud-folder-1",
			cutoverToken: "cutover-1",
			recoveryPath,
			lastError: null,
			createdAt: 1,
			updatedAt: 1,
		};
		await setup.transferStore.upsert(operation);
		// Drive the fake backend to its active state.
		await cloud.activateAuthorityFolder({
			transferId: "transfer-1",
			cutoverToken: "cutover-1",
			sourceFingerprint: "preview-1",
			destinationFingerprint: "destination",
		});
		const coordinator = new AuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectFolder: vi.fn(async () => {
				throw new Error("Source must not be inspected after activation");
			}),
		});

		await expect(
			coordinator.moveGitFolderToCloud(input(setup.sourcePath)),
		).resolves.toMatchObject({ status: "completed" });
		expect(await setup.placementStore.list()).toHaveLength(1);
	});
});
