import type { FileSystem, LocalFile } from "./fs.js";
import type { SyncedFolderIndex } from "./syncedFolderIndex.js";

export type ProjectionDiskComparison = {
	untracked: Array<{ path: string; file: LocalFile }>;
	collisions: Array<{
		path: string;
		file: LocalFile;
	}>;
};

/**
 * Compare desired cloud paths with disk without changing either side. A file is
 * a collision only when it is not owned by the prior index and cloud now wants
 * the same path; other new Markdown remains visible as untracked local intent.
 */
export async function compareProjectionPlanWithDisk(
	fs: Pick<FileSystem, "listMarkdownFiles">,
	syncRoot: string,
	desired: SyncedFolderIndex,
	prior: SyncedFolderIndex,
): Promise<ProjectionDiskComparison> {
	const comparison: ProjectionDiskComparison = {
		untracked: [],
		collisions: [],
	};
	for (const file of await fs.listMarkdownFiles(syncRoot)) {
		const relativePath = file.relativePath.split("\\").join("/");
		const path = `${syncRoot}/${relativePath}`;
		if (prior[path]) continue;
		const desiredEntry = desired[path];
		if (desiredEntry) {
			comparison.collisions.push({ path, file });
		} else {
			comparison.untracked.push({ path, file });
		}
	}
	return comparison;
}
