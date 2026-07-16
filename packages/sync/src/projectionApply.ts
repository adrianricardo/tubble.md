import { contentHash, type FileSystem } from "./fs.js";
import type { SyncedFolderIndex } from "./syncedFolderIndex.js";

export type ProjectionSnapshot = Record<string, string | null>;

export class ProjectionGuardConflict extends Error {
	constructor(
		readonly path: string,
		readonly expectedHash: string | null,
		readonly actualHash: string | null,
	) {
		super(`Projection destination changed after planning: ${path}`);
		this.name = "ProjectionGuardConflict";
	}
}

/** Capture the exact destination bytes a projection plan was reviewed against. */
export async function captureProjectionSnapshot(
	fs: Pick<FileSystem, "readFileOrNull">,
	desired: SyncedFolderIndex,
): Promise<ProjectionSnapshot> {
	return Object.fromEntries(
		await Promise.all(
			Object.keys(desired).map(async (path) => {
				const content = await fs.readFileOrNull(path);
				return [
					path,
					content === null ? null : await contentHash(content),
				] as const;
			}),
		),
	);
}

/**
 * Wrap projection writes with compare-before-write guards. Metadata writes are
 * passed through; only cloud document destinations belong to the snapshot.
 */
export function guardProjectionFileSystem(
	fs: Pick<
		FileSystem,
		"ensureDir" | "writeFile" | "readFileOrNull" | "setReadOnly"
	>,
	snapshot: ProjectionSnapshot,
) {
	return {
		...fs,
		async writeFile(path: string, content: string) {
			if (snapshot[path] !== undefined) {
				const current = await fs.readFileOrNull(path);
				const actualHash = current === null ? null : await contentHash(current);
				const expectedHash = snapshot[path] ?? null;
				if (actualHash !== expectedHash) {
					throw new ProjectionGuardConflict(path, expectedHash, actualHash);
				}
				snapshot[path] = await contentHash(content);
			}
			await fs.writeFile(path, content);
		},
	};
}
