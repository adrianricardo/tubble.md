import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	type CloudFolderMovePreview,
	contentHash,
	type SyncBackend,
} from "@hubble.md/sync";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
	AuthorityTransferOperation,
	CloudToGitAuthorityMoveInput,
	GitDestinationInspection,
} from "../src/desktopApi/types";
import { AuthorityTransferStore } from "./authorityTransferStore";
import { CloudToGitAuthorityMoveCoordinator } from "./cloudToGitAuthorityMoveCoordinator";
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
	const base = await fs.mkdtemp(path.join(os.tmpdir(), "hubble-cloud-to-git-"));
	roots.push(base);
	const repoRoot = path.join(base, "repo");
	await fs.mkdir(path.join(repoRoot, ".git"), { recursive: true });
	const markdown = "# Cloud source\n";
	const asset = new TextEncoder().encode("asset-bytes");
	const preview: CloudFolderMovePreview = {
		root: {
			folderId: "cloud-folder-1",
			workspaceId: "workspace-1",
			parentFolderId: null,
			name: "Cloud notes",
		},
		manifest: {
			manifestHash: "manifest-1",
			itemCount: 2,
			markdownCount: 1,
			assetCount: 1,
			totalBytes: Buffer.byteLength(markdown) + asset.byteLength,
			excludedAuthorityRoots: [],
			items: [
				{
					kind: "markdown",
					relativePath: "guide/readme.md",
					contentHash: await contentHash(markdown),
					size: Buffer.byteLength(markdown),
				},
				{
					kind: "asset",
					relativePath: "guide/readme.assets/image.png",
					contentHash: await contentHash(asset),
					size: asset.byteLength,
				},
			],
		},
		audience: { entries: [], publicLinkRole: null, fingerprint: "audience-1" },
		history: { documentCount: 1, revisionCount: 3, becomesGitCommits: false },
		recovery: { kind: "cloudArchive", expiresAt: null },
		previewFingerprint: "cloud-preview-1",
	};
	const destination: GitDestinationInspection = {
		repoRoot,
		repoName: "repo",
		repoRemoteUrl: null,
		destinationPath: path.join(repoRoot, "notes"),
		relativePath: "notes",
		collision: "empty",
		destinationExists: false,
		workingTreeChanges: [],
		workingTreeChangesTruncated: false,
		previewFingerprint: "git-preview-1",
	};
	return {
		base,
		repoRoot,
		markdown,
		asset,
		preview,
		destination,
		transferStore: new AuthorityTransferStore(
			path.join(base, "transfers.json"),
		),
		placementStore: new FolderAuthorityStore(
			path.join(base, "placements.json"),
		),
	};
}

function backend(
	preview: CloudFolderMovePreview,
	asset: Uint8Array,
	options: { archiveError?: Error; staleOnRevalidate?: boolean } = {},
) {
	let previewCalls = 0;
	let state: "prepared" | "active" | "cancelled" = "prepared";
	return {
		getCloudFolderMovePreview: vi.fn(async () => {
			previewCalls++;
			return options.staleOnRevalidate && previewCalls > 1
				? { ...preview, previewFingerprint: "cloud-preview-changed" }
				: preview;
		}),
		prepareCloudFolderMove: vi.fn(async () => ({
			...preview,
			transferId: "transfer-cloud-1",
		})),
		getCloudFolderExportBatch: vi.fn(async () => ({
			items: [
				{
					...preview.manifest.items[0],
					kind: "markdown" as const,
					documentId: "document-1",
					markdown: "# Cloud source\n",
				},
				{
					...preview.manifest.items[1],
					kind: "asset" as const,
					storageId: "storage-1",
					downloadUrl: "https://assets.example/image.png",
				},
			],
			nextPath: null,
		})),
		archiveAuthorityFolder: vi.fn(async () => {
			if (options.archiveError) throw options.archiveError;
			state = "active";
			return {
				state: "archivedToGit" as const,
				archiveFingerprint: "archive-1",
			};
		}),
		restoreArchivedAuthorityFolder: vi.fn(async () => ({
			state: "active" as const,
			rootFolderId: "cloud-folder-1",
		})),
		getAuthorityTransferStatus: vi.fn(async () => ({
			state,
			items: [],
		})),
		cancelAuthorityTransferBatch: vi.fn(async () => {
			state = "cancelled";
			return { done: true, removed: 0 };
		}),
		asset,
	} as unknown as SyncBackend & { asset: Uint8Array };
}

function input(repoRoot: string): CloudToGitAuthorityMoveInput {
	return {
		operationId: "operation-cloud-1",
		cloudFolderId: "cloud-folder-1",
		repositoryPath: repoRoot,
		relativePath: "notes",
		placementId: null,
		deploymentUrl: "https://example.convex.cloud",
		authToken: "token",
		expectedCloudPreviewFingerprint: "cloud-preview-1",
		expectedDestinationFingerprint: "git-preview-1",
		intent: "move",
	};
}

describe("CloudToGitAuthorityMoveCoordinator", () => {
	test("exports a verified detached copy without archiving cloud authority", async () => {
		const setup = await fixture();
		const cloud = backend(setup.preview, setup.asset);
		cloud.getCloudFolderExportCopyPreview = vi.fn(async () => ({
			root: setup.preview.root,
			manifest: setup.preview.manifest,
			history: setup.preview.history,
			previewFingerprint: setup.preview.previewFingerprint,
		}));
		cloud.getCloudFolderExportCopyBatch = vi.fn(async () => ({
			items: [
				{
					...setup.preview.manifest.items[0],
					kind: "markdown" as const,
					documentId: "document-1",
					markdown: "# Cloud source\n",
				},
				{
					...setup.preview.manifest.items[1],
					kind: "asset" as const,
					storageId: "storage-1",
					downloadUrl: "https://assets.example/image.png",
				},
			],
			nextPath: null,
		}));
		const coordinator = new CloudToGitAuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectDestination: vi.fn(async () => setup.destination),
			fetchBytes: vi.fn(async () => setup.asset),
		});

		const result = await coordinator.move({
			...input(setup.repoRoot),
			intent: "export-copy",
		});

		expect(result).toMatchObject({
			status: "completed",
			cloudArchived: false,
			archiveFingerprint: null,
		});
		expect(cloud.prepareCloudFolderMove).not.toHaveBeenCalled();
		expect(cloud.archiveAuthorityFolder).not.toHaveBeenCalled();
		expect(
			await fs.readFile(
				path.join(setup.destination.destinationPath, "guide/readme.md"),
				"utf8",
			),
		).toBe("# Cloud source\n");
	});

	test("finalizes a placed export copy after relaunch without exporting again", async () => {
		const setup = await fixture();
		const cloud = backend(setup.preview, setup.asset);
		cloud.getCloudFolderExportCopyPreview = vi.fn(async () => ({
			root: setup.preview.root,
			manifest: setup.preview.manifest,
			history: setup.preview.history,
			previewFingerprint: setup.preview.previewFingerprint,
		}));
		cloud.getCloudFolderExportCopyBatch = vi.fn();
		await fs.mkdir(path.join(setup.destination.destinationPath, "guide"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(setup.destination.destinationPath, "guide/readme.md"),
			setup.markdown,
		);
		await fs.mkdir(
			path.join(setup.destination.destinationPath, "guide/readme.assets"),
			{ recursive: true },
		);
		await fs.writeFile(
			path.join(
				setup.destination.destinationPath,
				"guide/readme.assets/image.png",
			),
			setup.asset,
		);
		await setup.transferStore.upsert({
			id: "operation-cloud-1",
			direction: "cloud-to-git",
			intent: "export-copy",
			phase: "cutting-over",
			source: {
				kind: "cloud",
				workspaceId: "workspace-1",
				folderId: "cloud-folder-1",
			},
			destination: {
				kind: "git",
				repoRoot: setup.repoRoot,
				relativePath: "notes",
			},
			manifestSummary: null,
			manifestHash: "manifest-1",
			previewFingerprint: "cloud-preview-1",
			destinationPreviewFingerprint: "git-preview-1",
			lastError: null,
			createdAt: 1,
			updatedAt: 1,
		});
		const coordinator = new CloudToGitAuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectDestination: vi.fn(async () => setup.destination),
		});

		const result = await coordinator.move({
			...input(setup.repoRoot),
			intent: "export-copy",
		});

		expect(result).toMatchObject({ status: "completed", cloudArchived: false });
		expect(cloud.getCloudFolderExportCopyBatch).not.toHaveBeenCalled();
		expect(cloud.archiveAuthorityFolder).not.toHaveBeenCalled();
		expect((await setup.transferStore.list())[0]?.phase).toBe("completed");
	});

	test("exports exact bytes before archive and leaves uncommitted Git files", async () => {
		const setup = await fixture();
		const cloud = backend(setup.preview, setup.asset);
		const coordinator = new CloudToGitAuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectDestination: vi.fn(async () => setup.destination),
			fetchBytes: vi.fn(async () => setup.asset),
			now: () => 10,
		});

		const result = await coordinator.move(input(setup.repoRoot));

		expect(result).toMatchObject({
			status: "completed",
			destinationPath: setup.destination.destinationPath,
			archiveFingerprint: "archive-1",
		});
		expect(
			await fs.readFile(
				path.join(setup.destination.destinationPath, "guide/readme.md"),
				"utf8",
			),
		).toBe(setup.markdown);
		expect(
			new Uint8Array(
				await fs.readFile(
					path.join(
						setup.destination.destinationPath,
						"guide/readme.assets/image.png",
					),
				),
			),
		).toEqual(setup.asset);
		expect(cloud.archiveAuthorityFolder).toHaveBeenCalledTimes(1);
		expect((await setup.transferStore.list())[0]).toMatchObject({
			phase: "completed",
			archiveFingerprint: "archive-1",
		});
	});

	test("moves placed bytes back out when cloud archive fails", async () => {
		const setup = await fixture();
		const cloud = backend(setup.preview, setup.asset, {
			archiveError: new Error("archive failed"),
		});
		const coordinator = new CloudToGitAuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectDestination: vi.fn(async () => setup.destination),
			fetchBytes: vi.fn(async () => setup.asset),
		});

		const result = await coordinator.move(input(setup.repoRoot));

		expect(result).toMatchObject({
			status: "needs-attention",
			message: "archive failed",
		});
		expect(
			await fs.lstat(setup.destination.destinationPath).catch(() => null),
		).toBeNull();
		if (result.status !== "needs-attention" || !result.temporaryPath) {
			throw new Error("Expected retained temporary export");
		}
		expect(
			await fs.readFile(
				path.join(result.temporaryPath, "guide/readme.md"),
				"utf8",
			),
		).toBe(setup.markdown);
	});

	test("does not archive against a concurrent cloud change", async () => {
		const setup = await fixture();
		const cloud = backend(setup.preview, setup.asset, {
			staleOnRevalidate: true,
		});
		const coordinator = new CloudToGitAuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectDestination: vi.fn(async () => setup.destination),
			fetchBytes: vi.fn(async () => setup.asset),
		});

		const result = await coordinator.move(input(setup.repoRoot));

		expect(result).toMatchObject({
			status: "stale",
			cloudPreviewFingerprint: "cloud-preview-changed",
		});
		expect(cloud.archiveAuthorityFolder).not.toHaveBeenCalled();
		expect(
			await fs.lstat(setup.destination.destinationPath).catch(() => null),
		).toBeNull();
	});

	test("cancels an exported draft without changing the Git destination", async () => {
		const setup = await fixture();
		const cloud = backend(setup.preview, setup.asset, {
			staleOnRevalidate: true,
		});
		const coordinator = new CloudToGitAuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectDestination: vi.fn(async () => setup.destination),
			fetchBytes: vi.fn(async () => setup.asset),
		});
		await coordinator.move(input(setup.repoRoot));

		const cancelled = await coordinator.cancel("operation-cloud-1");

		expect(cancelled.phase).toBe("cancelled");
		expect(cloud.cancelAuthorityTransferBatch).toHaveBeenCalledTimes(1);
		expect(
			await fs.lstat(setup.destination.destinationPath).catch(() => null),
		).toBeNull();
	});

	test("finishes placement cleanup after an archived cutover crash", async () => {
		const setup = await fixture();
		const cloud = backend(setup.preview, setup.asset);
		await fs.mkdir(path.join(setup.destination.destinationPath, "guide"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(setup.destination.destinationPath, "guide/readme.md"),
			setup.markdown,
		);
		await fs.mkdir(
			path.join(setup.destination.destinationPath, "guide/readme.assets"),
			{ recursive: true },
		);
		await fs.writeFile(
			path.join(
				setup.destination.destinationPath,
				"guide/readme.assets/image.png",
			),
			setup.asset,
		);
		await setup.placementStore.upsert({
			id: "placement-1",
			repoRoot: setup.repoRoot,
			relativePath: "notes",
			workspaceId: "workspace-1",
			cloudFolderId: "cloud-folder-1",
			formerGitFingerprint: "former-git",
			projection: null,
			createdAt: 1,
			updatedAt: 1,
		});
		const operation: AuthorityTransferOperation = {
			id: "operation-cloud-1",
			direction: "cloud-to-git",
			intent: "move",
			phase: "cutting-over",
			source: {
				kind: "cloud",
				workspaceId: "workspace-1",
				folderId: "cloud-folder-1",
			},
			destination: {
				kind: "git",
				repoRoot: setup.repoRoot,
				relativePath: "notes",
			},
			manifestSummary: null,
			manifestHash: "manifest-1",
			previewFingerprint: "cloud-preview-1",
			destinationPreviewFingerprint: "git-preview-1",
			cloudTransferId: "transfer-cloud-1",
			lastError: null,
			createdAt: 1,
			updatedAt: 1,
		};
		await setup.transferStore.upsert(operation);
		cloud.getAuthorityTransferStatus = vi.fn(async () => ({
			state: "active" as const,
			items: [],
		}));
		const coordinator = new CloudToGitAuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectDestination: vi.fn(async () => setup.destination),
		});

		const result = await coordinator.move({
			...input(setup.repoRoot),
			placementId: "placement-1",
		});

		expect(result.status).toBe("completed");
		expect(await setup.placementStore.list()).toEqual([]);
		expect((await setup.transferStore.list())[0]?.phase).toBe("completed");
	});

	test("offers one-step Undo only while exported Git bytes are unchanged", async () => {
		const setup = await fixture();
		const cloud = backend(setup.preview, setup.asset);
		const coordinator = new CloudToGitAuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectDestination: vi.fn(async () => setup.destination),
			fetchBytes: vi.fn(async () => setup.asset),
		});
		await coordinator.move(input(setup.repoRoot));
		expect(await coordinator.canUndo("operation-cloud-1")).toBe(true);

		const result = await coordinator.undo("operation-cloud-1");

		expect(result).toMatchObject({
			status: "restored",
			cloudFolderId: "cloud-folder-1",
		});
		expect(
			await fs.lstat(setup.destination.destinationPath).catch(() => null),
		).toBeNull();
		expect(cloud.restoreArchivedAuthorityFolder).toHaveBeenCalledTimes(1);
	});

	test("opens the reverse journey instead of Undo after Git bytes change", async () => {
		const setup = await fixture();
		const cloud = backend(setup.preview, setup.asset);
		const coordinator = new CloudToGitAuthorityMoveCoordinator({
			backend: cloud,
			transferStore: setup.transferStore,
			placementStore: setup.placementStore,
			inspectDestination: vi.fn(async () => setup.destination),
			fetchBytes: vi.fn(async () => setup.asset),
		});
		await coordinator.move(input(setup.repoRoot));
		await fs.appendFile(
			path.join(setup.destination.destinationPath, "guide/readme.md"),
			"changed",
		);

		expect(await coordinator.canUndo("operation-cloud-1")).toBe(false);
		expect(await coordinator.undo("operation-cloud-1")).toEqual({
			status: "changed",
		});
		expect(cloud.restoreArchivedAuthorityFolder).not.toHaveBeenCalled();
	});
});
