import path from "node:path";
import { z } from "zod/v4";
import type { FolderAuthorityPlacement } from "../src/desktopApi/types";
import { readJsonIfExists, writeJsonAtomically } from "./atomicJsonFile";

export const FOLDER_AUTHORITY_VERSION = 1;

export type { FolderAuthorityPlacement } from "../src/desktopApi/types";

const relativePathSchema = z
	.string()
	.min(1)
	.transform((value) => value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
	.refine(
		(value) =>
			value.length > 0 &&
			!value.split("/").some((segment) => segment === ".." || segment === "."),
		"Placement path must stay within its repository",
	);

const placementSchema = z.object({
	id: z.string().min(1),
	repoRoot: z
		.string()
		.min(1)
		.refine(path.isAbsolute, "Repository root is absolute"),
	relativePath: relativePathSchema,
	workspaceId: z.string().min(1),
	cloudFolderId: z.string().min(1),
	formerGitFingerprint: z.string().min(1),
	projection: z
		.object({
			scopeKey: z.string().min(1),
			localPath: z.string().min(1).refine(path.isAbsolute),
		})
		.nullable(),
	createdAt: z.number().finite(),
	updatedAt: z.number().finite(),
});

const envelopeSchema = z.object({
	version: z.literal(FOLDER_AUTHORITY_VERSION),
	placements: z.array(placementSchema),
});

function normalizedPlacement(
	placement: FolderAuthorityPlacement,
): FolderAuthorityPlacement {
	const parsed = placementSchema.parse(placement) as FolderAuthorityPlacement;
	return {
		...parsed,
		repoRoot: path.resolve(parsed.repoRoot),
		projection: parsed.projection
			? {
					...parsed.projection,
					localPath: path.resolve(parsed.projection.localPath),
				}
			: null,
	};
}

function pathContains(parent: string, candidate: string): boolean {
	return candidate === parent || candidate.startsWith(`${parent}/`);
}

function assertDisjoint(placements: FolderAuthorityPlacement[]): void {
	for (const [index, placement] of placements.entries()) {
		for (const candidate of placements.slice(index + 1)) {
			if (placement.repoRoot !== candidate.repoRoot) continue;
			if (
				pathContains(placement.relativePath, candidate.relativePath) ||
				pathContains(candidate.relativePath, placement.relativePath)
			) {
				throw new Error(
					`Authority placements overlap: ${placement.relativePath} and ${candidate.relativePath}`,
				);
			}
		}
	}
}

export class FolderAuthorityStore {
	readonly #filePath: string;

	constructor(filePath: string) {
		this.#filePath = filePath;
	}

	async list(): Promise<FolderAuthorityPlacement[]> {
		const raw = await readJsonIfExists(this.#filePath);
		if (raw === null) return [];
		return envelopeSchema.parse(raw).placements as FolderAuthorityPlacement[];
	}

	async upsert(placement: FolderAuthorityPlacement): Promise<void> {
		const normalized = normalizedPlacement(placement);
		const placements = (await this.list()).filter(
			(candidate) => candidate.id !== normalized.id,
		);
		placements.push(normalized);
		assertDisjoint(placements);
		await this.#save(placements);
	}

	async remove(id: string): Promise<void> {
		await this.#save(
			(await this.list()).filter((placement) => placement.id !== id),
		);
	}

	async #save(placements: FolderAuthorityPlacement[]): Promise<void> {
		const envelope = envelopeSchema.parse({
			version: FOLDER_AUTHORITY_VERSION,
			placements: placements.sort((a, b) => a.id.localeCompare(b.id)),
		});
		await writeJsonAtomically(this.#filePath, envelope);
	}
}
