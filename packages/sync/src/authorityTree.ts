export type AuthorityGitEntry = {
	kind: "folder" | "document";
	absolutePath: string;
};

export type AuthorityCloudNode =
	| {
			kind: "cloud-folder";
			id: string;
			cloudFolderId: string;
			children: AuthorityCloudNode[];
	  }
	| {
			kind: "cloud-document";
			id: string;
			cloudDocumentId: string;
	  };

export type AuthorityPlacementInput = {
	id: string;
	absolutePath: string;
	cloudFolderId: string;
	children?: AuthorityCloudNode[];
};

export type AuthorityTreeNode =
	| {
			kind: "git-folder";
			id: string;
			absolutePath: string;
			children: AuthorityTreeNode[];
	  }
	| { kind: "git-document"; id: string; absolutePath: string }
	| {
			kind: "cloud-boundary";
			id: string;
			placementId: string;
			cloudFolderId: string;
			absolutePath: string;
			children: AuthorityCloudNode[];
	  };

function normalizeAbsolutePath(value: string): string {
	const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
	return normalized || "/";
}

function pathWithin(candidate: string, parent: string): boolean {
	return candidate === parent || candidate.startsWith(`${parent}/`);
}

function parentPath(value: string): string {
	const index = value.lastIndexOf("/");
	if (index <= 0) return "/";
	return value.slice(0, index);
}

export function composeAuthorityTree(input: {
	repoRoot: string;
	entries: AuthorityGitEntry[];
	placements: AuthorityPlacementInput[];
}): AuthorityTreeNode {
	const repoRoot = normalizeAbsolutePath(input.repoRoot);
	const placements = input.placements
		.map((placement) => ({
			...placement,
			absolutePath: normalizeAbsolutePath(placement.absolutePath),
		}))
		.filter((placement) => pathWithin(placement.absolutePath, repoRoot));
	const placementByPath = new Map(
		placements.map((placement) => [placement.absolutePath, placement]),
	);
	const blockedRoots = placements.map((placement) => placement.absolutePath);
	const folderPaths = new Set<string>([repoRoot]);
	const documentPaths = new Set<string>();

	for (const entry of input.entries) {
		const absolutePath = normalizeAbsolutePath(entry.absolutePath);
		if (!pathWithin(absolutePath, repoRoot)) continue;
		if (
			blockedRoots.some(
				(boundary) =>
					absolutePath !== boundary && pathWithin(absolutePath, boundary),
			)
		) {
			continue;
		}
		if (entry.kind === "folder") folderPaths.add(absolutePath);
		else documentPaths.add(absolutePath);
		let parent = parentPath(absolutePath);
		while (pathWithin(parent, repoRoot)) {
			folderPaths.add(parent);
			if (parent === repoRoot) break;
			parent = parentPath(parent);
		}
	}
	for (const placement of placements) {
		let parent = parentPath(placement.absolutePath);
		while (pathWithin(parent, repoRoot)) {
			folderPaths.add(parent);
			if (parent === repoRoot) break;
			parent = parentPath(parent);
		}
	}

	const childrenByParent = new Map<string, string[]>();
	for (const candidate of [...folderPaths, ...documentPaths]) {
		if (candidate === repoRoot) continue;
		const parent = parentPath(candidate);
		const children = childrenByParent.get(parent) ?? [];
		children.push(candidate);
		childrenByParent.set(parent, children);
	}

	const build = (absolutePath: string): AuthorityTreeNode => {
		const placement = placementByPath.get(absolutePath);
		if (placement) {
			return {
				kind: "cloud-boundary",
				id: `placement:${placement.id}`,
				placementId: placement.id,
				cloudFolderId: placement.cloudFolderId,
				absolutePath,
				children: placement.children ?? [],
			};
		}
		if (documentPaths.has(absolutePath)) {
			return {
				kind: "git-document",
				id: `git:${absolutePath}`,
				absolutePath,
			};
		}
		return {
			kind: "git-folder",
			id: `git:${absolutePath}`,
			absolutePath,
			children: (childrenByParent.get(absolutePath) ?? [])
				.filter((child, index, siblings) => siblings.indexOf(child) === index)
				.sort((a, b) => a.localeCompare(b))
				.map(build),
		};
	};

	return build(repoRoot);
}
