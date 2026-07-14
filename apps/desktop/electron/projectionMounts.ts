import path from "node:path";
import type { Folder, ProjectionScope } from "@hubble.md/sync";

export type ProjectionMount = {
	localRoot: string;
	scope: Exclude<ProjectionScope, { kind: "all-accessible" }>;
};

type CanonicalizeOptions = {
	realpath: (candidate: string) => Promise<string>;
	caseInsensitive?: boolean;
};

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error.code === "ENOENT" || error.code === "ENOTDIR")
	);
}

/** Resolve symlinks in the nearest existing ancestor of a prospective root. */
export async function canonicalizeProjectionRoot(
	candidate: string,
	options: CanonicalizeOptions,
): Promise<string> {
	let existingAncestor = path.resolve(candidate);
	const missingSegments: string[] = [];

	while (true) {
		try {
			const canonicalAncestor = await options.realpath(existingAncestor);
			const canonical = path.resolve(
				canonicalAncestor,
				...missingSegments.reverse(),
			);
			return options.caseInsensitive === true
				? canonical.toLowerCase()
				: canonical;
		} catch (error) {
			if (!isMissingPathError(error)) throw error;
			const parent = path.dirname(existingAncestor);
			if (parent === existingAncestor) throw error;
			missingSegments.push(path.basename(existingAncestor));
			existingAncestor = parent;
		}
	}
}

function pathsOverlap(first: string, second: string): boolean {
	const relative = path.relative(first, second);
	return (
		relative === "" ||
		(relative !== ".." &&
			!relative.startsWith(`..${path.sep}`) &&
			!path.isAbsolute(relative))
	);
}

export async function assertLocalProjectionRootsDisjoint(
	candidate: ProjectionMount,
	existing: ProjectionMount[],
	options: CanonicalizeOptions,
): Promise<void> {
	const candidateRoot = await canonicalizeProjectionRoot(
		candidate.localRoot,
		options,
	);
	for (const mount of existing) {
		const existingRoot = await canonicalizeProjectionRoot(
			mount.localRoot,
			options,
		);
		if (
			pathsOverlap(candidateRoot, existingRoot) ||
			pathsOverlap(existingRoot, candidateRoot)
		) {
			throw new Error(
				`Local projection roots overlap: ${candidate.localRoot} and ${mount.localRoot}. Choose disjoint folders.`,
			);
		}
	}
}

export function isFolderWithinProjection(
	ancestorId: string,
	descendantId: string,
	parentById: Map<string, string | null>,
): boolean {
	const visited = new Set<string>();
	let current: string | null | undefined = descendantId;
	while (current) {
		if (current === ancestorId) return true;
		if (visited.has(current)) return false;
		visited.add(current);
		current = parentById.get(current);
	}
	return false;
}

export function assertCloudProjectionRootsDisjoint(
	candidate: ProjectionMount,
	existing: ProjectionMount[],
	folders: Folder[],
): void {
	const candidateWorkspaceId = candidate.scope.workspaceId;
	const sameWorkspace = existing.filter(
		(mount) => mount.scope.workspaceId === candidateWorkspaceId,
	);
	if (sameWorkspace.length === 0) return;
	if (
		candidate.scope.kind === "workspace" ||
		sameWorkspace.some((mount) => mount.scope.kind === "workspace")
	) {
		throw new Error(
			"This cloud Space overlaps an existing projection on this computer. Stop or relocate the existing projection first.",
		);
	}

	const parentById = new Map(
		folders
			.filter((folder) => folder.workspaceId === candidateWorkspaceId)
			.map((folder) => [folder._id, folder.parentId]),
	);
	if (!parentById.has(candidate.scope.folderId)) {
		throw new Error(
			"Hubble could not verify the cloud folder hierarchy, so it left the existing projections unchanged.",
		);
	}

	for (const mount of sameWorkspace) {
		if (mount.scope.kind !== "folder") continue;
		if (!parentById.has(mount.scope.folderId)) {
			throw new Error(
				"Hubble could not verify the cloud folder hierarchy, so it left the existing projections unchanged.",
			);
		}
		if (
			isFolderWithinProjection(
				candidate.scope.folderId,
				mount.scope.folderId,
				parentById,
			) ||
			isFolderWithinProjection(
				mount.scope.folderId,
				candidate.scope.folderId,
				parentById,
			)
		) {
			throw new Error(
				"This cloud folder overlaps an existing projection on this computer. Choose a disjoint folder.",
			);
		}
	}
}
