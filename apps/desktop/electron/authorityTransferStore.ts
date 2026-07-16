import path from "node:path";
import { z } from "zod/v4";
import type {
	AuthorityTransferOperation,
	AuthorityTransferPhase,
} from "../src/desktopApi/types";
import { readJsonIfExists, writeJsonAtomically } from "./atomicJsonFile";

export const AUTHORITY_TRANSFER_VERSION = 1;

export type {
	AuthorityTransferOperation,
	AuthorityTransferPhase,
} from "../src/desktopApi/types";

const gitLocationSchema = z.object({
	kind: z.literal("git"),
	repoRoot: z.string().min(1).refine(path.isAbsolute),
	relativePath: z.string(),
});

const cloudSourceSchema = z.object({
	kind: z.literal("cloud"),
	workspaceId: z.string().min(1),
	folderId: z.string().min(1),
});

const cloudDestinationSchema = z.object({
	kind: z.literal("cloud"),
	workspaceId: z.string().min(1),
	parentFolderId: z.string().min(1).nullable(),
});

const summarySchema = z.object({
	folderCount: z.number().int().nonnegative(),
	markdownCount: z.number().int().nonnegative(),
	assetCount: z.number().int().nonnegative(),
	totalBytes: z.number().int().nonnegative(),
	excludedCount: z.number().int().nonnegative(),
	blockingExclusionCount: z.number().int().nonnegative(),
});

const placementSchema = z.object({
	id: z.string().min(1),
	repoRoot: z.string().min(1).refine(path.isAbsolute),
	relativePath: z.string().min(1),
	workspaceId: z.string().min(1),
	cloudFolderId: z.string().min(1),
	formerGitFingerprint: z.string().min(1),
	projection: z
		.object({ scopeKey: z.string().min(1), localPath: z.string().min(1) })
		.nullable(),
	createdAt: z.number().finite(),
	updatedAt: z.number().finite(),
});

const operationSchema = z
	.object({
		id: z.string().min(1),
		direction: z.enum(["git-to-cloud", "cloud-to-git"]),
		intent: z.enum(["move", "share", "export-copy"]),
		phase: z.enum([
			"draft",
			"validating",
			"staging",
			"verifying",
			"cutting-over",
			"needs-attention",
			"completed",
			"cancelled",
		]),
		source: z.union([gitLocationSchema, cloudSourceSchema]),
		destination: z
			.union([gitLocationSchema, cloudDestinationSchema])
			.nullable(),
		manifestSummary: summarySchema.nullable(),
		manifestHash: z.string().min(1).nullable(),
		previewFingerprint: z.string().min(1).nullable(),
		destinationPreviewFingerprint: z.string().min(1).nullable().optional(),
		cloudTransferId: z.string().min(1).nullable().optional(),
		cloudRootFolderId: z.string().min(1).nullable().optional(),
		cutoverToken: z.string().min(1).nullable().optional(),
		recoveryPath: z.string().min(1).nullable().optional(),
		temporaryPath: z.string().min(1).nullable().optional(),
		archiveFingerprint: z.string().min(1).nullable().optional(),
		destinationWasEmpty: z.boolean().optional(),
		completionFingerprint: z.string().min(1).nullable().optional(),
		sourcePlacement: placementSchema.nullable().optional(),
		requestedShares: z
			.array(
				z.object({
					email: z.string().email(),
					role: z.enum(["editor", "commenter", "viewer"]),
				}),
			)
			.optional(),
		audienceFingerprint: z.string().min(1).nullable().optional(),
		lastError: z.string().nullable(),
		createdAt: z.number().finite(),
		updatedAt: z.number().finite(),
	})
	.refine(
		(operation) =>
			operation.direction === "git-to-cloud"
				? operation.source.kind === "git" &&
					(operation.destination === null ||
						operation.destination.kind === "cloud")
				: operation.source.kind === "cloud" &&
					(operation.destination === null ||
						operation.destination.kind === "git"),
		"Transfer direction does not match its endpoints",
	);

const envelopeSchema = z.object({
	version: z.literal(AUTHORITY_TRANSFER_VERSION),
	operations: z.array(operationSchema),
});

const cancellablePhases = new Set<AuthorityTransferPhase>([
	"draft",
	"validating",
	"staging",
	"verifying",
	"needs-attention",
]);

export class AuthorityTransferStore {
	readonly #filePath: string;

	constructor(filePath: string) {
		this.#filePath = filePath;
	}

	async list(): Promise<AuthorityTransferOperation[]> {
		const raw = await readJsonIfExists(this.#filePath);
		if (raw === null) return [];
		return envelopeSchema.parse(raw).operations as AuthorityTransferOperation[];
	}

	async upsert(operation: AuthorityTransferOperation): Promise<void> {
		const parsed = operationSchema.parse(
			operation,
		) as AuthorityTransferOperation;
		const operations = (await this.list()).filter(
			(candidate) => candidate.id !== parsed.id,
		);
		operations.push(parsed);
		await this.#save(operations);
	}

	async cancel(
		id: string,
		at = Date.now(),
	): Promise<AuthorityTransferOperation> {
		const operations = await this.list();
		const current = operations.find((operation) => operation.id === id);
		if (!current) throw new Error("Authority transfer draft not found");
		if (!cancellablePhases.has(current.phase)) {
			throw new Error(`Authority transfer cannot cancel from ${current.phase}`);
		}
		const cancelled = {
			...current,
			phase: "cancelled" as const,
			updatedAt: at,
		};
		await this.#save(
			operations.map((operation) =>
				operation.id === id ? cancelled : operation,
			),
		);
		return cancelled;
	}

	async #save(operations: AuthorityTransferOperation[]): Promise<void> {
		const envelope = envelopeSchema.parse({
			version: AUTHORITY_TRANSFER_VERSION,
			operations: operations.sort((a, b) => a.id.localeCompare(b.id)),
		});
		await writeJsonAtomically(this.#filePath, envelope);
	}
}
