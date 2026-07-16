import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Repo-link (RB3 / D11) helpers for the desktop main process.
 *
 * Linking a cloud folder to a local git repo mounts the folder's projection
 * inside the working tree. Hubble must never touch the user's committed files:
 * the only git-side write is an append to `.git/info/exclude` in the **common**
 * gitdir (resolving the `.git` gitfile indirection for worktrees/submodules).
 * Everything here is best-effort and read-only against tracked content — on any
 * failure the caller falls back to showing a manual `.gitignore` line.
 */

export type GitRepoInfo = {
	/** The working-tree root the user picked (repo dir). */
	repoDir: string;
	/**
	 * The **common** gitdir whose `info/exclude` applies to this working tree.
	 * For a plain clone this is `<repoDir>/.git`; for a worktree/submodule it is
	 * resolved through the `.git` gitfile + `commondir`.
	 */
	commonGitDir: string;
};

/** Read a file, returning null when it is absent. */
async function readFileOrNull(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8");
	} catch {
		return null;
	}
}

/**
 * Resolve the git repository anchoring `repoDir`, walking up from a selected
 * child directory and following `.git` gitfile indirection for worktrees and
 * submodules. Returns null when `repoDir` is not inside a git repo.
 */
export async function resolveGitRepo(
	repoDir: string,
): Promise<GitRepoInfo | null> {
	let candidate = path.resolve(repoDir);
	while (true) {
		const dotGit = path.join(candidate, ".git");
		const stat = await fs.stat(dotGit).catch(() => null);
		if (stat?.isDirectory()) {
			return { repoDir: candidate, commonGitDir: dotGit };
		}
		if (stat?.isFile()) {
			const raw = await readFileOrNull(dotGit);
			const match = raw?.match(/^gitdir:\s*(.+)\s*$/m);
			if (match) {
				const gitDir = path.resolve(candidate, match[1].trim());
				const commonDirPointer = await readFileOrNull(
					path.join(gitDir, "commondir"),
				);
				const commonGitDir = commonDirPointer
					? path.resolve(gitDir, commonDirPointer.trim())
					: gitDir;
				return { repoDir: candidate, commonGitDir };
			}
		}

		const parent = path.dirname(candidate);
		if (parent === candidate) return null;
		candidate = parent;
	}
}

/**
 * The `.gitignore`-style pattern that excludes `mountPath` (absolute) relative
 * to the working-tree root. Anchored + trailing slash so only the mount dir is
 * ignored.
 */
export function excludePatternFor(repoDir: string, mountPath: string): string {
	const rel = path.relative(repoDir, mountPath).split(path.sep).join("/");
	return `/${rel}/`;
}

export type ExcludeResult =
	| { ok: true; commonGitDir: string; pattern: string; alreadyPresent: boolean }
	| { ok: false; pattern: string };

/**
 * Append the mount's exclude pattern to `<commonGitDir>/info/exclude`,
 * idempotently. Never edits a tracked file (`.gitignore`) and never runs git. On
 * any failure returns `{ ok: false }` with the pattern the caller should tell the
 * user to add manually.
 */
export async function excludeMountFromGit(
	repo: GitRepoInfo,
	mountPath: string,
): Promise<ExcludeResult> {
	const pattern = excludePatternFor(repo.repoDir, mountPath);
	try {
		const infoDir = path.join(repo.commonGitDir, "info");
		await fs.mkdir(infoDir, { recursive: true });
		const excludePath = path.join(infoDir, "exclude");
		const existing = (await readFileOrNull(excludePath)) ?? "";
		const lines = existing.split("\n").map((line) => line.trim());
		if (lines.includes(pattern)) {
			return {
				ok: true,
				commonGitDir: repo.commonGitDir,
				pattern,
				alreadyPresent: true,
			};
		}
		const prefix = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
		await fs.appendFile(
			excludePath,
			`${prefix}# Hubble repo-link mount (safe to remove after unlinking)\n${pattern}\n`,
		);
		return {
			ok: true,
			commonGitDir: repo.commonGitDir,
			pattern,
			alreadyPresent: false,
		};
	} catch {
		return { ok: false, pattern };
	}
}

/**
 * Best-effort, read-only parse of the `remote "origin"` URL from the git config
 * (plain-file parse, no `git` invocation). Returns null when absent/unparseable.
 */
export async function parseGitOriginUrl(
	commonGitDir: string,
): Promise<string | null> {
	const raw = await readFileOrNull(path.join(commonGitDir, "config"));
	if (!raw) return null;
	const lines = raw.split("\n");
	let inOrigin = false;
	for (const line of lines) {
		const trimmed = line.trim();
		const section = trimmed.match(/^\[(.+?)\]$/);
		if (section) {
			inOrigin = /^remote\s+"origin"$/.test(section[1].trim());
			continue;
		}
		if (inOrigin) {
			const url = trimmed.match(/^url\s*=\s*(.+)$/);
			if (url) return url[1].trim();
		}
	}
	return null;
}

/** Derive a short repo display name from an origin URL or the repo dir path. */
export function repoNameFrom(
	repoDir: string,
	originUrl: string | null,
): string {
	if (originUrl) {
		const cleaned = originUrl.replace(/\.git$/, "").replace(/\/+$/, "");
		const tail = cleaned.split(/[/:]/).filter(Boolean).pop();
		if (tail) return tail;
	}
	return path.basename(repoDir) || repoDir;
}

/**
 * Sanitize a cloud folder name into a single, safe path segment for the default
 * mount directory `<repo>/<sanitized-folder-name>/`.
 */
export function sanitizeMountSegment(name: string): string {
	const cleaned = name
		.replace(/[/\\:*?"<>|]/g, " ")
		// biome-ignore lint/suspicious/noControlCharactersInRegex: strip control chars
		.replace(/[\u0000-\u001f]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^[. ]+|[. ]+$/g, "");
	return cleaned || "hubble-folder";
}

export type BrainSeedInput = {
	folderName: string;
	repoName: string | null;
	repoRemoteUrl: string | null;
	/** Doc paths/titles present in the folder at link time (snapshot). */
	documentIndex: Array<{ title: string; relativePath: string }>;
};

/** File name of the seeded agent-context doc (case-insensitive for idempotency). */
export const BRAIN_DOC_FILENAME = "BRAIN.md";

/**
 * True when the folder already contains a `BRAIN.md` (any case, by path tail or
 * title) — the seed-once guard (D14): linking again or from a second machine
 * must never duplicate or overwrite it.
 */
export function hasBrainDocument(
	documents: Array<{ title: string; path?: string | null }>,
): boolean {
	return documents.some((doc) => {
		const tail = (doc.path ?? `${doc.title}.md`).split("/").pop() ?? "";
		return (
			tail.toLowerCase() === BRAIN_DOC_FILENAME.toLowerCase() ||
			doc.title.toLowerCase() === "brain"
		);
	});
}

/**
 * Build the seed `BRAIN.md` (D13/D14). Seeded once at link time as a normal Live
 * Document; Hubble never regenerates it.
 */
export function buildBrainMarkdown(input: BrainSeedInput): string {
	const repoLine = input.repoName
		? `This is the shared context ("brain") for **${input.folderName}**, anchored to the \`${input.repoName}\` repository${
				input.repoRemoteUrl ? ` (\`${input.repoRemoteUrl}\`)` : ""
			}.`
		: `This is the shared context ("brain") for **${input.folderName}**.`;

	const indexLines =
		input.documentIndex.length > 0
			? input.documentIndex
					.map((entry) => {
						const p = entry.relativePath
							? `${entry.relativePath}/${entry.title}`
							: entry.title;
						return `- ${p}`;
					})
					.join("\n")
			: "- _(no documents yet — add markdown files to this folder)_";

	return `# BRAIN.md

${repoLine}

## Documents at creation

_The snapshot below lists the documents in this folder when it was linked. It is
not kept in sync — browse the folder for the current set._

${indexLines}

## How to work here (for agents & teammates)

- These files are **live, shared context**. Read them for the team's real,
  current understanding of this project.
- Edit and save them like any normal file. **Every save syncs to the whole
  team** in real time — there are no branches, PRs, or merge conflicts.
- **Do not commit this folder to git.** It is a Hubble mount; the canonical copy
  lives in the cloud and is intentionally excluded from the repository.
- Access is revocable: a teammate's access can be removed at any time, and their
  local projection disappears on the next sync.
`;
}
