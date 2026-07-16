import { contentHash } from "./fs.js";

export type AuthorityManifestItemKind = "markdown" | "asset";
export type AuthorityManifestGitState = "tracked" | "untracked";

export type AuthorityManifestItem = {
	relativePath: string;
	kind: AuthorityManifestItemKind;
	size: number;
	hash: string;
	gitState: AuthorityManifestGitState;
	readOnly: boolean;
	executable: boolean;
};

export type AuthorityManifestExclusionReason =
	| "ignored"
	| "generated"
	| "symlink"
	| "unsupported"
	| "oversized"
	| "nested-authority"
	| "missing-reference"
	| "unsupported-reference";

export type AuthorityManifestExclusion = {
	relativePath: string;
	reason: AuthorityManifestExclusionReason;
	blocking: boolean;
};

export type AuthorityManifestSummary = {
	folderCount: number;
	markdownCount: number;
	assetCount: number;
	totalBytes: number;
	excludedCount: number;
	blockingExclusionCount: number;
};

export type AuthorityManifest = {
	items: AuthorityManifestItem[];
	exclusions: AuthorityManifestExclusion[];
	summary: AuthorityManifestSummary;
	manifestHash: string;
};

export function normalizeAuthorityPath(value: string): string {
	return value
		.replace(/\\/g, "/")
		.split("/")
		.filter((segment) => segment.length > 0 && segment !== ".")
		.join("/");
}

function parentFolders(relativePath: string): string[] {
	const segments = normalizeAuthorityPath(relativePath).split("/");
	segments.pop();
	return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function canonicalItems(items: AuthorityManifestItem[]) {
	return items
		.map((item) => ({
			...item,
			relativePath: normalizeAuthorityPath(item.relativePath),
		}))
		.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function canonicalExclusions(exclusions: AuthorityManifestExclusion[]) {
	return exclusions
		.map((exclusion) => ({
			...exclusion,
			relativePath: normalizeAuthorityPath(exclusion.relativePath),
		}))
		.sort((a, b) =>
			a.relativePath === b.relativePath
				? a.reason.localeCompare(b.reason)
				: a.relativePath.localeCompare(b.relativePath),
		);
}

export async function buildAuthorityManifest(input: {
	items: AuthorityManifestItem[];
	exclusions: AuthorityManifestExclusion[];
}): Promise<AuthorityManifest> {
	const items = canonicalItems(input.items);
	const exclusions = canonicalExclusions(input.exclusions);
	const folders = new Set(
		items.flatMap((item) => parentFolders(item.relativePath)),
	);
	const summary: AuthorityManifestSummary = {
		folderCount: folders.size,
		markdownCount: items.filter((item) => item.kind === "markdown").length,
		assetCount: items.filter((item) => item.kind === "asset").length,
		totalBytes: items.reduce((total, item) => total + item.size, 0),
		excludedCount: exclusions.length,
		blockingExclusionCount: exclusions.filter((exclusion) => exclusion.blocking)
			.length,
	};
	const manifestHash = await contentHash(JSON.stringify({ items, exclusions }));
	return { items, exclusions, summary, manifestHash };
}

function localDestination(raw: string): string | null {
	const destination = raw.trim().replace(/^<|>$/g, "");
	const withoutTitle =
		destination.match(/^(\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))$/)?.[1] ??
		destination;
	const pathOnly = withoutTitle.split(/[?#]/, 1)[0] ?? "";
	if (!pathOnly || pathOnly.startsWith("#")) return null;
	if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(pathOnly)) return null;
	if (pathOnly.startsWith("/") || pathOnly.startsWith("\\")) return null;
	try {
		return decodeURIComponent(pathOnly);
	} catch {
		return pathOnly;
	}
}

/** Returns local filesystem destinations whose bytes must survive a move. */
export function extractLocalMarkdownReferences(markdown: string): string[] {
	const references = new Set<string>();
	for (const match of markdown.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
		const destination = localDestination(match[1] ?? "");
		if (destination) references.add(normalizeAuthorityPath(destination));
	}
	for (const match of markdown.matchAll(
		/\b(?:src|href)=(?:"([^"]+)"|'([^']+)')/gi,
	)) {
		const destination = localDestination(match[1] ?? match[2] ?? "");
		if (destination) references.add(normalizeAuthorityPath(destination));
	}
	return [...references].sort((a, b) => a.localeCompare(b));
}
