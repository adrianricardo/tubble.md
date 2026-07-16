import fs from "node:fs/promises";
import path from "node:path";
import {
	type CloudFolderMovePreview,
	contentHash,
	type SyncBackend,
} from "@hubble.md/sync";
import type {
	AuthorityTransferOperation,
	CloudToGitAuthorityMoveInput,
	CloudToGitAuthorityMoveResult,
	FolderAuthorityPlacement,
	GitDestinationInspection,
} from "../src/desktopApi/types";
import type { AuthorityTransferStore } from "./authorityTransferStore";
import type { FolderAuthorityStore } from "./folderAuthorityStore";

type CoordinatorOptions = {
	backend: SyncBackend;
	transferStore: AuthorityTransferStore;
	placementStore: FolderAuthorityStore;
	inspectDestination: (input: {
		repositoryPath: string;
		relativePath: string;
	}) => Promise<GitDestinationInspection>;
	fetchBytes?: (url: string) => Promise<Uint8Array>;
	stopProjection?: (placement: FolderAuthorityPlacement) => Promise<void>;
	now?: () => number;
};

async function defaultFetchBytes(url: string): Promise<Uint8Array> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Cloud asset download failed (${response.status})`);
	}
	return new Uint8Array(await response.arrayBuffer());
}

function transferRoot(
	repoRoot: string,
	operationId: string,
	folderName: string,
) {
	return path.join(
		path.dirname(repoRoot),
		`.${path.basename(repoRoot)}.hubble-transfer`,
		operationId,
		folderName,
	);
}

function safeItemPath(root: string, relativePath: string) {
	const candidate = path.resolve(root, relativePath);
	if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) {
		throw new Error(
			`Cloud export path escapes its destination: ${relativePath}`,
		);
	}
	return candidate;
}

async function existingFilePaths(root: string): Promise<string[]> {
	const paths: string[] = [];
	async function visit(directory: string) {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			const absolute = path.join(directory, entry.name);
			if (entry.isSymbolicLink()) {
				throw new Error(`Export destination contains a symlink: ${absolute}`);
			}
			if (entry.isDirectory()) await visit(absolute);
			else if (entry.isFile())
				paths.push(path.relative(root, absolute).replace(/\\/g, "/"));
			else
				throw new Error(
					`Export destination contains an unsupported item: ${absolute}`,
				);
		}
	}
	await visit(root);
	return paths.sort();
}

async function verifyExport(
	root: string,
	preview: Pick<CloudFolderMovePreview, "manifest">,
) {
	const expectedPaths = preview.manifest.items
		.map((item) => item.relativePath)
		.sort();
	const actualPaths = await existingFilePaths(root);
	if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
		throw new Error("Git export contains missing or unexpected paths");
	}
	for (const item of preview.manifest.items) {
		const bytes = new Uint8Array(
			await fs.readFile(safeItemPath(root, item.relativePath)),
		);
		if (
			bytes.byteLength !== item.size ||
			(await contentHash(bytes)) !== item.contentHash
		) {
			throw new Error(`Git export verification failed: ${item.relativePath}`);
		}
	}
}

async function directoryFingerprint(root: string): Promise<string> {
	const entries = [];
	for (const relativePath of await existingFilePaths(root)) {
		const bytes = new Uint8Array(
			await fs.readFile(safeItemPath(root, relativePath)),
		);
		entries.push(
			`${relativePath}:${bytes.byteLength}:${await contentHash(bytes)}`,
		);
	}
	return contentHash(entries.join("\n"));
}

export async function isCloudToGitUndoEligible(
	transferStore: AuthorityTransferStore,
	operationId: string,
): Promise<boolean> {
	const operation = (await transferStore.list()).find(
		(candidate) => candidate.id === operationId,
	);
	if (
		!operation ||
		operation.direction !== "cloud-to-git" ||
		operation.phase !== "completed" ||
		!operation.completionFingerprint ||
		operation.destination?.kind !== "git"
	) {
		return false;
	}
	const destinationPath = path.join(
		operation.destination.repoRoot,
		operation.destination.relativePath,
	);
	return directoryFingerprint(destinationPath)
		.then((fingerprint) => fingerprint === operation.completionFingerprint)
		.catch(() => false);
}

/**
 * Moves one cloud authority root through a verified temporary export. The Git
 * rename happens before the cloud archive, and only a failed archive rolls it
 * back; failures after archival must resume forward to preserve one authority.
 */
export class CloudToGitAuthorityMoveCoordinator {
	readonly #backend: SyncBackend;
	readonly #transferStore: AuthorityTransferStore;
	readonly #placementStore: FolderAuthorityStore;
	readonly #inspectDestination: CoordinatorOptions["inspectDestination"];
	readonly #fetchBytes: (url: string) => Promise<Uint8Array>;
	readonly #stopProjection?: CoordinatorOptions["stopProjection"];
	readonly #now: () => number;

	constructor(options: CoordinatorOptions) {
		this.#backend = options.backend;
		this.#transferStore = options.transferStore;
		this.#placementStore = options.placementStore;
		this.#inspectDestination = options.inspectDestination;
		this.#fetchBytes = options.fetchBytes ?? defaultFetchBytes;
		this.#stopProjection = options.stopProjection;
		this.#now = options.now ?? Date.now;
	}

	async cancel(operationId: string): Promise<AuthorityTransferOperation> {
		const operation = (await this.#transferStore.list()).find(
			(candidate) => candidate.id === operationId,
		);
		if (!operation || operation.direction !== "cloud-to-git") {
			throw new Error("Cloud-to-Git transfer draft not found");
		}
		if (operation.cloudTransferId) {
			await this.#backend.cancelAuthorityTransferBatch(
				operation.cloudTransferId,
			);
		}
		if (operation.temporaryPath) {
			await fs.rm(path.dirname(operation.temporaryPath), {
				recursive: true,
				force: true,
			});
		}
		return this.#transferStore.cancel(operationId, this.#now());
	}

	async canUndo(operationId: string): Promise<boolean> {
		return isCloudToGitUndoEligible(this.#transferStore, operationId);
	}

	async undo(operationId: string) {
		const operation = (await this.#transferStore.list()).find(
			(candidate) => candidate.id === operationId,
		);
		if (
			!operation ||
			operation.direction !== "cloud-to-git" ||
			operation.phase !== "completed" ||
			!operation.cloudTransferId ||
			!operation.archiveFingerprint ||
			operation.destination?.kind !== "git" ||
			operation.source.kind !== "cloud"
		) {
			return { status: "unavailable" as const, message: "Undo is unavailable" };
		}
		if (!(await this.canUndo(operationId)))
			return { status: "changed" as const };
		const destinationPath = path.join(
			operation.destination.repoRoot,
			operation.destination.relativePath,
		);
		const recoveryPath = path.join(
			path.dirname(operation.destination.repoRoot),
			`.${path.basename(operation.destination.repoRoot)}.hubble-recovery`,
			`undo-${operation.id}`,
			path.basename(destinationPath),
		);
		if (await fs.lstat(recoveryPath).catch(() => null)) {
			return {
				status: "unavailable" as const,
				message: "Undo recovery path is occupied",
			};
		}
		await fs.mkdir(path.dirname(recoveryPath), { recursive: true });
		await fs.rename(destinationPath, recoveryPath);
		try {
			await this.#backend.restoreArchivedAuthorityFolder({
				transferId: operation.cloudTransferId,
				archiveFingerprint: operation.archiveFingerprint,
			});
		} catch (cause) {
			await fs.rename(recoveryPath, destinationPath);
			return {
				status: "unavailable" as const,
				message: cause instanceof Error ? cause.message : String(cause),
			};
		}
		try {
			if (operation.sourcePlacement) {
				await this.#placementStore.upsert({
					...operation.sourcePlacement,
					updatedAt: this.#now(),
				});
			}
			await this.#transferStore.upsert({
				...operation,
				recoveryPath,
				completionFingerprint: null,
				updatedAt: this.#now(),
			});
			return {
				status: "restored" as const,
				cloudFolderId: operation.source.folderId,
				recoveryPath,
			};
		} catch (cause) {
			// Cloud authority is already live again. Keep Git outside the repository
			// even if local placement bookkeeping needs manual repair.
			return {
				status: "unavailable" as const,
				message: `Cloud restored; placement repair is required: ${
					cause instanceof Error ? cause.message : String(cause)
				}`,
			};
		}
	}

	async move(
		input: CloudToGitAuthorityMoveInput,
	): Promise<CloudToGitAuthorityMoveResult> {
		const prior = (await this.#transferStore.list()).find(
			(operation) => operation.id === input.operationId,
		);
		if (prior?.direction === "git-to-cloud") {
			throw new Error("Operation direction does not match cloud-to-Git move");
		}
		if (
			input.intent === "export-copy" &&
			prior?.intent === "export-copy" &&
			(prior.phase === "cutting-over" ||
				prior.phase === "needs-attention" ||
				prior.phase === "completed")
		) {
			try {
				const resumed = await this.#resumeExportCopy(prior);
				if (resumed) return resumed;
			} catch (cause) {
				const message = cause instanceof Error ? cause.message : String(cause);
				await this.#transferStore.upsert({
					...prior,
					phase: "needs-attention",
					lastError: message,
					updatedAt: this.#now(),
				});
				return {
					status: "needs-attention",
					message,
					temporaryPath: prior.temporaryPath ?? null,
				};
			}
		}
		if (
			input.intent === "move" &&
			prior?.cloudTransferId &&
			prior.destination?.kind === "git" &&
			prior.previewFingerprint &&
			prior.destinationPreviewFingerprint
		) {
			try {
				const resumed = await this.#resumeCutover(prior, input.placementId);
				if (resumed) return resumed;
			} catch (cause) {
				const message = cause instanceof Error ? cause.message : String(cause);
				await this.#transferStore.upsert({
					...prior,
					phase: "needs-attention",
					lastError: message,
					updatedAt: this.#now(),
				});
				return {
					status: "needs-attention",
					message,
					temporaryPath: prior.temporaryPath ?? null,
				};
			}
		}

		const [preview, destination] = await Promise.all([
			input.intent === "export-copy"
				? this.#backend.getCloudFolderExportCopyPreview(input.cloudFolderId)
				: this.#backend.getCloudFolderMovePreview(input.cloudFolderId),
			this.#inspectDestination({
				repositoryPath: input.repositoryPath,
				relativePath: input.relativePath,
			}),
		]);
		if (
			preview.previewFingerprint !== input.expectedCloudPreviewFingerprint ||
			destination.previewFingerprint !== input.expectedDestinationFingerprint ||
			destination.collision !== "empty"
		) {
			return {
				status: "stale",
				cloudPreviewFingerprint: preview.previewFingerprint,
				destination,
			};
		}

		const now = this.#now();
		const sourcePlacement = input.placementId
			? ((await this.#placementStore.list()).find(
					(placement) => placement.id === input.placementId,
				) ?? null)
			: null;
		let operation: AuthorityTransferOperation = {
			id: input.operationId,
			direction: "cloud-to-git",
			intent: input.intent,
			phase: "validating",
			source: {
				kind: "cloud",
				workspaceId: preview.root.workspaceId,
				folderId: preview.root.folderId,
			},
			destination: {
				kind: "git",
				repoRoot: destination.repoRoot,
				relativePath: destination.relativePath,
			},
			manifestSummary: {
				folderCount: 0,
				markdownCount: preview.manifest.markdownCount,
				assetCount: preview.manifest.assetCount,
				totalBytes: preview.manifest.totalBytes,
				excludedCount: 0,
				blockingExclusionCount: 0,
			},
			manifestHash: preview.manifest.manifestHash,
			previewFingerprint: preview.previewFingerprint,
			destinationPreviewFingerprint: destination.previewFingerprint,
			temporaryPath: transferRoot(
				destination.repoRoot,
				input.operationId,
				preview.root.name,
			),
			destinationWasEmpty: destination.destinationExists,
			sourcePlacement,
			lastError: null,
			createdAt: prior?.createdAt ?? now,
			updatedAt: now,
		};
		await this.#transferStore.upsert(operation);

		try {
			if (input.intent === "export-copy") {
				operation = {
					...operation,
					phase: "staging",
					updatedAt: this.#now(),
				};
				await this.#transferStore.upsert(operation);
				await this.#exportCopy(
					input.cloudFolderId,
					preview.previewFingerprint,
					operation.temporaryPath as string,
				);
				operation = {
					...operation,
					phase: "verifying",
					updatedAt: this.#now(),
				};
				await this.#transferStore.upsert(operation);
				await verifyExport(operation.temporaryPath as string, preview);
				const currentPreview =
					await this.#backend.getCloudFolderExportCopyPreview(
						input.cloudFolderId,
					);
				const currentDestination = await this.#inspectDestination({
					repositoryPath: destination.repoRoot,
					relativePath: destination.relativePath,
				});
				if (
					currentPreview.previewFingerprint !== preview.previewFingerprint ||
					currentDestination.previewFingerprint !==
						destination.previewFingerprint ||
					currentDestination.collision !== "empty"
				) {
					return {
						status: "stale",
						cloudPreviewFingerprint: currentPreview.previewFingerprint,
						destination: currentDestination,
					};
				}
				return this.#placeExportCopy(operation, destination);
			}
			const prepared = await this.#backend.prepareCloudFolderMove({
				operationKey: input.operationId,
				folderId: input.cloudFolderId,
				expectedPreviewFingerprint: preview.previewFingerprint,
				destinationFingerprint: destination.previewFingerprint,
			});
			operation = {
				...operation,
				phase: "staging",
				cloudTransferId: prepared.transferId,
				updatedAt: this.#now(),
			};
			await this.#transferStore.upsert(operation);
			await this.#export(
				prepared.transferId,
				operation.temporaryPath as string,
			);
			operation = { ...operation, phase: "verifying", updatedAt: this.#now() };
			await this.#transferStore.upsert(operation);
			await verifyExport(operation.temporaryPath as string, preview);

			const currentDestination = await this.#inspectDestination({
				repositoryPath: destination.repoRoot,
				relativePath: destination.relativePath,
			});
			const currentPreview = await this.#backend.getCloudFolderMovePreview(
				input.cloudFolderId,
			);
			if (
				currentDestination.previewFingerprint !==
					destination.previewFingerprint ||
				currentDestination.collision !== "empty" ||
				currentPreview.previewFingerprint !== preview.previewFingerprint
			) {
				return {
					status: "stale",
					cloudPreviewFingerprint: currentPreview.previewFingerprint,
					destination: currentDestination,
				};
			}
			return await this.#cutOver(operation, destination, input.placementId);
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			await this.#transferStore.upsert({
				...operation,
				phase: "needs-attention",
				lastError: message,
				updatedAt: this.#now(),
			});
			return {
				status: "needs-attention",
				message,
				temporaryPath: operation.temporaryPath ?? null,
			};
		}
	}

	async #exportCopy(
		folderId: string,
		expectedPreviewFingerprint: string,
		temporaryPath: string,
	) {
		const existing = await fs.lstat(temporaryPath).catch(() => null);
		if (existing && !existing.isDirectory()) {
			throw new Error("Authority transfer temporary path is occupied");
		}
		await fs.mkdir(temporaryPath, { recursive: true });
		let afterPath: string | undefined;
		for (let page = 0; page < 129; page++) {
			const batch = await this.#backend.getCloudFolderExportCopyBatch({
				folderId,
				expectedPreviewFingerprint,
				afterPath,
			});
			await this.#writeExportBatch(batch.items, temporaryPath);
			if (!batch.nextPath) return;
			afterPath = batch.nextPath;
		}
		throw new Error("Cloud export exceeded its bounded page count");
	}

	async #export(transferId: string, temporaryPath: string) {
		const existing = await fs.lstat(temporaryPath).catch(() => null);
		if (existing && !existing.isDirectory()) {
			throw new Error("Authority transfer temporary path is occupied");
		}
		await fs.mkdir(temporaryPath, { recursive: true });
		let afterPath: string | undefined;
		for (let page = 0; page < 129; page++) {
			const batch = await this.#backend.getCloudFolderExportBatch({
				transferId,
				afterPath,
			});
			await this.#writeExportBatch(batch.items, temporaryPath);
			if (!batch.nextPath) return;
			afterPath = batch.nextPath;
		}
		throw new Error("Cloud export exceeded its bounded page count");
	}

	async #writeExportBatch(
		items: Awaited<
			ReturnType<SyncBackend["getCloudFolderExportBatch"]>
		>["items"],
		temporaryPath: string,
	) {
		for (const item of items) {
			const destination = safeItemPath(temporaryPath, item.relativePath);
			await fs.mkdir(path.dirname(destination), { recursive: true });
			let bytes: Uint8Array;
			if (item.kind === "markdown") {
				bytes = new TextEncoder().encode(item.markdown);
			} else {
				if (!item.downloadUrl) {
					throw new Error(`Cloud asset is unavailable: ${item.relativePath}`);
				}
				bytes = await this.#fetchBytes(item.downloadUrl);
			}
			await fs.writeFile(destination, bytes);
		}
	}

	async #placeExportCopy(
		operation: AuthorityTransferOperation,
		destination: GitDestinationInspection,
	): Promise<CloudToGitAuthorityMoveResult> {
		if (!operation.temporaryPath) {
			throw new Error(
				"Cloud export copy is missing its verified temporary tree",
			);
		}
		operation = { ...operation, phase: "cutting-over", updatedAt: this.#now() };
		await this.#transferStore.upsert(operation);
		if (destination.destinationExists)
			await fs.rmdir(destination.destinationPath);
		await fs.mkdir(path.dirname(destination.destinationPath), {
			recursive: true,
		});
		await fs.rename(operation.temporaryPath, destination.destinationPath);
		const completionFingerprint = await directoryFingerprint(
			destination.destinationPath,
		);
		await fs.rm(path.dirname(operation.temporaryPath), {
			recursive: true,
			force: true,
		});
		await this.#transferStore.upsert({
			...operation,
			phase: "completed",
			completionFingerprint,
			lastError: null,
			updatedAt: this.#now(),
		});
		const completionInspection = await this.#inspectDestination({
			repositoryPath: destination.repoRoot,
			relativePath: destination.relativePath,
		}).catch(() => null);
		return {
			status: "completed",
			repoRoot: destination.repoRoot,
			destinationPath: destination.destinationPath,
			archiveFingerprint: null,
			undoEligible: false,
			cloudArchived: false,
			workingTreeChanges: completionInspection?.workingTreeChanges ?? [],
		};
	}

	async #cutOver(
		operation: AuthorityTransferOperation,
		destination: GitDestinationInspection,
		placementId: string | null,
	): Promise<CloudToGitAuthorityMoveResult> {
		if (
			!operation.cloudTransferId ||
			!operation.temporaryPath ||
			!operation.previewFingerprint
		) {
			throw new Error("Cloud-to-Git transfer is not prepared");
		}
		const placement = placementId
			? (await this.#placementStore.list()).find(
					(item) => item.id === placementId,
				)
			: undefined;
		if (placement && this.#stopProjection)
			await this.#stopProjection(placement);
		operation = { ...operation, phase: "cutting-over", updatedAt: this.#now() };
		await this.#transferStore.upsert(operation);
		if (destination.destinationExists)
			await fs.rmdir(destination.destinationPath);
		await fs.mkdir(path.dirname(destination.destinationPath), {
			recursive: true,
		});
		await fs.rename(operation.temporaryPath, destination.destinationPath);
		let archived: Awaited<ReturnType<SyncBackend["archiveAuthorityFolder"]>>;
		try {
			archived = await this.#backend.archiveAuthorityFolder({
				transferId: operation.cloudTransferId,
				expectedPreviewFingerprint: operation.previewFingerprint,
				destinationFingerprint:
					operation.destinationPreviewFingerprint as string,
			});
		} catch (cause) {
			// This is the last failure point where returning the bytes to staging is
			// safe: the cloud folder is still authoritative.
			await fs.rename(destination.destinationPath, operation.temporaryPath);
			if (operation.destinationWasEmpty) {
				await fs.mkdir(destination.destinationPath, { recursive: true });
			}
			throw cause;
		}
		const completionFingerprint = await directoryFingerprint(
			destination.destinationPath,
		);
		if (placementId) await this.#placementStore.remove(placementId);
		await fs.rm(path.dirname(operation.temporaryPath), {
			recursive: true,
			force: true,
		});
		await this.#transferStore.upsert({
			...operation,
			phase: "completed",
			archiveFingerprint: archived.archiveFingerprint,
			completionFingerprint,
			lastError: null,
			updatedAt: this.#now(),
		});
		const completionInspection = await this.#inspectDestination({
			repositoryPath: destination.repoRoot,
			relativePath: destination.relativePath,
		}).catch(() => null);
		return {
			status: "completed",
			repoRoot: destination.repoRoot,
			destinationPath: destination.destinationPath,
			archiveFingerprint: archived.archiveFingerprint,
			undoEligible: true,
			cloudArchived: true,
			workingTreeChanges: completionInspection?.workingTreeChanges ?? [],
		};
	}

	async #resumeCutover(
		operation: AuthorityTransferOperation,
		placementId: string | null,
	): Promise<CloudToGitAuthorityMoveResult | null> {
		if (
			!operation.cloudTransferId ||
			operation.destination?.kind !== "git" ||
			!operation.previewFingerprint ||
			!operation.destinationPreviewFingerprint
		) {
			return null;
		}
		const destinationPath = path.join(
			operation.destination.repoRoot,
			operation.destination.relativePath,
		);
		const destinationExists = await fs
			.lstat(destinationPath)
			.then((stat) => stat.isDirectory())
			.catch(() => false);
		if (!destinationExists) return null;
		const transferStatus = await this.#backend.getAuthorityTransferStatus(
			operation.cloudTransferId,
		);
		if (transferStatus.state !== "active") {
			const preview = await this.#backend.getCloudFolderMovePreview(
				operation.source.kind === "cloud" ? operation.source.folderId : "",
			);
			if (preview.previewFingerprint !== operation.previewFingerprint)
				return null;
			await verifyExport(destinationPath, preview);
		}
		// An active transfer means archival already committed. From that point Git
		// is authoritative, so resume records its current bytes instead of trying
		// to compare them with the now-inactive cloud projection.
		const archived = await this.#backend.archiveAuthorityFolder({
			transferId: operation.cloudTransferId,
			expectedPreviewFingerprint: operation.previewFingerprint,
			destinationFingerprint: operation.destinationPreviewFingerprint,
		});
		const completionFingerprint = await directoryFingerprint(destinationPath);
		if (placementId) await this.#placementStore.remove(placementId);
		await this.#transferStore.upsert({
			...operation,
			phase: "completed",
			archiveFingerprint: archived.archiveFingerprint,
			completionFingerprint,
			lastError: null,
			updatedAt: this.#now(),
		});
		const completionInspection = await this.#inspectDestination({
			repositoryPath: operation.destination.repoRoot,
			relativePath: operation.destination.relativePath,
		}).catch(() => null);
		return {
			status: "completed",
			repoRoot: operation.destination.repoRoot,
			destinationPath,
			archiveFingerprint: archived.archiveFingerprint,
			undoEligible: true,
			cloudArchived: true,
			workingTreeChanges: completionInspection?.workingTreeChanges ?? [],
		};
	}

	async #resumeExportCopy(
		operation: AuthorityTransferOperation,
	): Promise<CloudToGitAuthorityMoveResult | null> {
		if (
			operation.intent !== "export-copy" ||
			operation.source.kind !== "cloud" ||
			operation.destination?.kind !== "git" ||
			!operation.previewFingerprint
		) {
			return null;
		}
		const destinationPath = path.join(
			operation.destination.repoRoot,
			operation.destination.relativePath,
		);
		const destinationExists = await fs
			.lstat(destinationPath)
			.then((stat) => stat.isDirectory())
			.catch(() => false);
		if (!destinationExists) return null;
		const preview = await this.#backend.getCloudFolderExportCopyPreview(
			operation.source.folderId,
		);
		if (preview.previewFingerprint !== operation.previewFingerprint)
			return null;
		await verifyExport(destinationPath, preview);
		const completionFingerprint = await directoryFingerprint(destinationPath);
		await this.#transferStore.upsert({
			...operation,
			phase: "completed",
			completionFingerprint,
			lastError: null,
			updatedAt: this.#now(),
		});
		const completionInspection = await this.#inspectDestination({
			repositoryPath: operation.destination.repoRoot,
			relativePath: operation.destination.relativePath,
		}).catch(() => null);
		return {
			status: "completed",
			repoRoot: operation.destination.repoRoot,
			destinationPath,
			archiveFingerprint: null,
			undoEligible: false,
			cloudArchived: false,
			workingTreeChanges: completionInspection?.workingTreeChanges ?? [],
		};
	}
}
