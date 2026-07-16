import fs from "node:fs/promises";
import path from "node:path";
import type { AuthorityStageItem, SyncBackend } from "@hubble.md/sync";
import { contentHash } from "@hubble.md/sync";
import type {
	AuthorityTransferOperation,
	GitFolderInspection,
	GitToCloudAuthorityMoveInput,
	GitToCloudAuthorityMoveResult,
} from "../src/desktopApi/types";
import type { AuthorityTransferStore } from "./authorityTransferStore";
import type { FolderAuthorityStore } from "./folderAuthorityStore";

const STAGE_BATCH_SIZE = 16;
const STAGE_MARKDOWN_BYTES = 512 * 1024;

type CoordinatorOptions = {
	backend: SyncBackend;
	transferStore: AuthorityTransferStore;
	placementStore: FolderAuthorityStore;
	inspectFolder: (folderPath: string) => Promise<GitFolderInspection>;
	upload?: (url: string, bytes: Uint8Array) => Promise<string>;
	now?: () => number;
};

async function exists(candidate: string) {
	return fs
		.access(candidate)
		.then(() => true)
		.catch(() => false);
}

async function defaultUpload(url: string, bytes: Uint8Array): Promise<string> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/octet-stream" },
		body: bytes,
	});
	if (!response.ok) {
		throw new Error(`Cloud asset upload failed (${response.status})`);
	}
	const result = (await response.json()) as { storageId?: unknown };
	if (typeof result.storageId !== "string" || !result.storageId) {
		throw new Error("Cloud asset upload returned no storage ID");
	}
	return result.storageId;
}

function recoveryPathFor(inspection: GitFolderInspection, operationId: string) {
	const container = path.join(
		path.dirname(inspection.repoRoot),
		`.${path.basename(inspection.repoRoot)}.hubble-recovery`,
		operationId,
	);
	return path.join(container, path.basename(inspection.sourcePath));
}

function titleFromMarkdownPath(relativePath: string) {
	return path.posix
		.basename(relativePath)
		.replace(/\.(?:md|markdown|mdown)$/i, "");
}

function chunks(items: AuthorityStageItem[]): AuthorityStageItem[][] {
	const batches: AuthorityStageItem[][] = [];
	let batch: AuthorityStageItem[] = [];
	let markdownBytes = 0;
	for (const item of items) {
		const itemMarkdownBytes = item.kind === "markdown" ? item.size : 0;
		if (
			batch.length > 0 &&
			(batch.length >= STAGE_BATCH_SIZE ||
				markdownBytes + itemMarkdownBytes > STAGE_MARKDOWN_BYTES)
		) {
			batches.push(batch);
			batch = [];
			markdownBytes = 0;
		}
		batch.push(item);
		markdownBytes += itemMarkdownBytes;
	}
	if (batch.length > 0) batches.push(batch);
	return batches;
}

export class AuthorityMoveCoordinator {
	readonly #backend: SyncBackend;
	readonly #transferStore: AuthorityTransferStore;
	readonly #placementStore: FolderAuthorityStore;
	readonly #inspectFolder: (folderPath: string) => Promise<GitFolderInspection>;
	readonly #upload: (url: string, bytes: Uint8Array) => Promise<string>;
	readonly #now: () => number;

	constructor(options: CoordinatorOptions) {
		this.#backend = options.backend;
		this.#transferStore = options.transferStore;
		this.#placementStore = options.placementStore;
		this.#inspectFolder = options.inspectFolder;
		this.#upload = options.upload ?? defaultUpload;
		this.#now = options.now ?? Date.now;
	}

	async cancelGitToCloudMove(
		operationId: string,
	): Promise<AuthorityTransferOperation> {
		const operation = (await this.#transferStore.list()).find(
			(candidate) => candidate.id === operationId,
		);
		if (!operation) throw new Error("Authority transfer draft not found");
		if (operation.cloudTransferId) {
			for (let batch = 0; batch < 300; batch++) {
				const result = await this.#backend.cancelAuthorityTransferBatch(
					operation.cloudTransferId,
				);
				if (result.done) break;
				if (batch === 299) {
					throw new Error("Cloud staging cleanup did not finish");
				}
			}
		}
		return this.#transferStore.cancel(operationId, this.#now());
	}

	async moveGitFolderToCloud(
		input: GitToCloudAuthorityMoveInput,
	): Promise<GitToCloudAuthorityMoveResult> {
		const prior = (await this.#transferStore.list()).find(
			(operation) => operation.id === input.operationId,
		);
		if (prior?.direction === "cloud-to-git") {
			throw new Error("Operation direction does not match Git-to-cloud move");
		}
		const destinationFingerprint = await contentHash(
			JSON.stringify({
				workspaceId: input.workspaceId,
				parentFolderId: input.parentFolderId,
			}),
		);

		// A crash can occur after the source rename. Resume from the durable cloud
		// transfer and local recovery path without pretending the source still exists.
		if (prior?.cloudTransferId && prior.recoveryPath) {
			const resumed = await this.#resumeAfterPrepare(
				input,
				prior,
				destinationFingerprint,
			);
			if (resumed) return resumed;
		}

		const inspection = await this.#inspectFolder(input.folderPath);
		if (
			inspection.previewFingerprint !== input.expectedPreviewFingerprint ||
			inspection.confirmationBlocked
		) {
			return { status: "stale", inspection };
		}
		if (
			prior?.cloudTransferId &&
			prior.previewFingerprint !== inspection.previewFingerprint
		) {
			return { status: "stale", inspection };
		}
		const now = this.#now();
		const currentOperation: AuthorityTransferOperation = {
			id: input.operationId,
			direction: "git-to-cloud",
			intent: input.intent,
			phase: "draft",
			source: {
				kind: "git",
				repoRoot: inspection.repoRoot,
				relativePath: inspection.relativePath,
			},
			destination: {
				kind: "cloud",
				workspaceId: input.workspaceId,
				parentFolderId: input.parentFolderId,
			},
			manifestSummary: inspection.manifest.summary,
			manifestHash: inspection.manifest.manifestHash,
			previewFingerprint: inspection.previewFingerprint,
			requestedShares: input.requestedShares ?? [],
			audienceFingerprint: input.expectedAudienceFingerprint,
			lastError: null,
			createdAt: now,
			updatedAt: now,
		};
		let operation: AuthorityTransferOperation = prior
			? {
					...prior,
					...currentOperation,
					createdAt: prior.createdAt,
				}
			: currentOperation;
		operation = await this.#savePhase(operation, "validating", null);

		try {
			const prepared = await this.#backend.prepareGitFolderMove({
				operationKey: input.operationId,
				workspaceId: input.workspaceId,
				parentFolderId: input.parentFolderId ?? undefined,
				rootName: path.basename(inspection.sourcePath),
				manifestHash: inspection.manifest.manifestHash,
				manifestItemCount: inspection.manifest.items.length,
				manifestMarkdownCount: inspection.manifest.summary.markdownCount,
				manifestAssetCount: inspection.manifest.summary.assetCount,
				manifestTotalBytes: inspection.manifest.summary.totalBytes,
				sourceFingerprint: inspection.previewFingerprint,
				destinationFingerprint,
				expectedAudienceFingerprint: input.expectedAudienceFingerprint,
				requestedShares: input.requestedShares ?? [],
			});
			operation = {
				...operation,
				cloudTransferId: prepared.transferId,
				cloudRootFolderId: prepared.rootFolderId ?? null,
				recoveryPath: recoveryPathFor(inspection, input.operationId),
			};
			operation = await this.#savePhase(operation, "staging", null);
			await this.#stageMissingItems(
				inspection,
				prepared.transferId,
				input.workspaceId,
			);
			operation = await this.#savePhase(operation, "verifying", null);
			const verified = await this.#backend.verifyAuthorityStaging({
				transferId: prepared.transferId,
				manifestHash: inspection.manifest.manifestHash,
			});
			operation = {
				...operation,
				cutoverToken: verified.cutoverToken,
				cloudRootFolderId: prepared.rootFolderId ?? null,
			};
			await this.#transferStore.upsert(operation);
			return await this.#cutOver(
				input,
				operation,
				inspection,
				destinationFingerprint,
			);
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			await this.#savePhase(operation, "needs-attention", message);
			return {
				status: "needs-attention",
				message,
				recoveryPath: operation.recoveryPath ?? null,
			};
		}
	}

	async #stageMissingItems(
		inspection: GitFolderInspection,
		transferId: string,
		workspaceId: string,
	) {
		const status = await this.#backend.getAuthorityTransferStatus(transferId);
		const staged = new Map(
			status.items.map((item) => [item.relativePath, item] as const),
		);
		const items: AuthorityStageItem[] = [];
		for (const manifestItem of inspection.manifest.items) {
			const existing = staged.get(manifestItem.relativePath);
			if (
				existing?.verified &&
				existing.kind === manifestItem.kind &&
				existing.contentHash === manifestItem.hash &&
				existing.size === manifestItem.size
			) {
				continue;
			}
			const absolutePath = path.join(
				inspection.sourcePath,
				...manifestItem.relativePath.split("/"),
			);
			if (manifestItem.kind === "markdown") {
				items.push({
					kind: "markdown",
					relativePath: manifestItem.relativePath,
					contentHash: manifestItem.hash,
					size: manifestItem.size,
					markdown: await fs.readFile(absolutePath, "utf8"),
					title: titleFromMarkdownPath(manifestItem.relativePath),
				});
			} else {
				const bytes = await fs.readFile(absolutePath);
				const uploadUrl =
					await this.#backend.generateAssetUploadUrl(workspaceId);
				items.push({
					kind: "asset",
					relativePath: manifestItem.relativePath,
					contentHash: manifestItem.hash,
					size: manifestItem.size,
					storageId: await this.#upload(uploadUrl, bytes),
				});
			}
		}
		for (const batch of chunks(items)) {
			await this.#backend.stageAuthorityFolderBatch({
				transferId,
				items: batch,
			});
		}
	}

	async #resumeAfterPrepare(
		input: GitToCloudAuthorityMoveInput,
		operation: AuthorityTransferOperation,
		destinationFingerprint: string,
	): Promise<GitToCloudAuthorityMoveResult | null> {
		const transferId = operation.cloudTransferId;
		if (!transferId || !operation.recoveryPath) return null;
		const status = await this.#backend.getAuthorityTransferStatus(transferId);
		if (status.state === "active") {
			return this.#finishPlacement(
				input,
				operation,
				status.rootFolderId ?? operation.cloudRootFolderId ?? undefined,
			);
		}
		if (
			status.state === "verified" &&
			(status.cutoverToken ?? operation.cutoverToken)
		) {
			const sourcePath = path.join(
				operation.source.kind === "git" ? operation.source.repoRoot : "",
				operation.source.kind === "git" ? operation.source.relativePath : "",
			);
			const sourceExists = await exists(sourcePath);
			const recoveryExists = await exists(operation.recoveryPath);
			if (!sourceExists && recoveryExists) {
				const activated = await this.#backend.activateAuthorityFolder({
					transferId,
					cutoverToken: status.cutoverToken ?? operation.cutoverToken ?? "",
					sourceFingerprint: operation.previewFingerprint ?? "",
					destinationFingerprint,
				});
				return this.#finishPlacement(input, operation, activated.rootFolderId);
			}
			if (sourceExists && !recoveryExists) return null;
			const message =
				sourceExists && recoveryExists
					? "Both source and recovery paths exist; review both before retrying"
					: "Neither source nor recovery path exists; recovery needs attention";
			await this.#savePhase(operation, "needs-attention", message);
			return {
				status: "needs-attention",
				message,
				recoveryPath: operation.recoveryPath,
			};
		}
		return null;
	}

	async #cutOver(
		input: GitToCloudAuthorityMoveInput,
		operation: AuthorityTransferOperation,
		inspection: GitFolderInspection,
		destinationFingerprint: string,
	): Promise<GitToCloudAuthorityMoveResult> {
		const refreshed = await this.#inspectFolder(inspection.sourcePath);
		if (refreshed.previewFingerprint !== inspection.previewFingerprint) {
			await this.#savePhase(operation, "needs-attention", "Preview changed");
			return { status: "stale", inspection: refreshed };
		}
		const recoveryPath = operation.recoveryPath;
		if (
			!recoveryPath ||
			!operation.cloudTransferId ||
			!operation.cutoverToken
		) {
			throw new Error("Verified transfer is missing cutover recovery metadata");
		}
		await fs.mkdir(path.dirname(recoveryPath), { recursive: true });
		if (await exists(recoveryPath)) {
			throw new Error("Authority recovery destination already exists");
		}
		operation = await this.#savePhase(operation, "cutting-over", null);
		await fs.rename(inspection.sourcePath, recoveryPath);
		let activated: Awaited<ReturnType<SyncBackend["activateAuthorityFolder"]>>;
		try {
			activated = await this.#backend.activateAuthorityFolder({
				transferId: operation.cloudTransferId,
				cutoverToken: operation.cutoverToken,
				sourceFingerprint: inspection.previewFingerprint,
				destinationFingerprint,
			});
		} catch (cause) {
			if (!(await exists(inspection.sourcePath))) {
				await fs.rename(recoveryPath, inspection.sourcePath);
			}
			throw cause;
		}
		// Activation is the authority cutover. A later local placement-write
		// failure resumes forward from retained recovery; restoring Git here would
		// create two active homes.
		return this.#finishPlacement(input, operation, activated.rootFolderId);
	}

	async #finishPlacement(
		input: GitToCloudAuthorityMoveInput,
		operation: AuthorityTransferOperation,
		cloudFolderId?: string,
	): Promise<GitToCloudAuthorityMoveResult> {
		if (
			!cloudFolderId ||
			operation.source.kind !== "git" ||
			!operation.recoveryPath ||
			!operation.previewFingerprint
		) {
			throw new Error("Activated authority move lacks placement metadata");
		}
		const now = this.#now();
		await this.#placementStore.upsert({
			id: operation.id,
			repoRoot: operation.source.repoRoot,
			relativePath: operation.source.relativePath,
			workspaceId: input.workspaceId,
			cloudFolderId,
			formerGitFingerprint: operation.previewFingerprint,
			projection: null,
			createdAt: operation.createdAt,
			updatedAt: now,
		});
		await this.#savePhase(
			{ ...operation, cloudRootFolderId: cloudFolderId },
			"completed",
			null,
		);
		return {
			status: "completed",
			cloudFolderId,
			recoveryPath: operation.recoveryPath,
		};
	}

	async #savePhase(
		operation: AuthorityTransferOperation,
		phase: AuthorityTransferOperation["phase"],
		lastError: string | null,
	) {
		const next = {
			...operation,
			phase,
			lastError,
			updatedAt: this.#now(),
		};
		await this.#transferStore.upsert(next);
		return next;
	}
}
