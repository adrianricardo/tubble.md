/**
 * Repo-link (RB3 / D11) mechanics + BRAIN.md seed helpers (RB5 / D13-D14).
 *
 * Git detection/exclude tests run against real on-disk layouts built by hand
 * (plain `.git` dir, worktree gitfile + commondir, submodule-style gitfile) —
 * no `git` binary is invoked, matching the production constraint ("never run
 * git").
 */

import { promises as fs, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildBrainMarkdown,
	excludeMountFromGit,
	hasBrainDocument,
	parseGitOriginUrl,
	repoNameFrom,
	resolveGitRepo,
	sanitizeMountSegment,
} from "./repoLink";

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
	const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

/** Minimal plain clone layout: `<repo>/.git/` directory. */
async function makePlainRepo(): Promise<string> {
	const repo = tempDir("hubble-repo-");
	await fs.mkdir(path.join(repo, ".git", "info"), { recursive: true });
	await fs.writeFile(
		path.join(repo, ".git", "config"),
		`[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = git@github.com:acme/app.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
	);
	return repo;
}

/** Worktree layout: `.git` FILE → gitdir with a `commondir` pointer. */
async function makeWorktreeRepo(): Promise<{
	main: string;
	worktree: string;
}> {
	const main = await makePlainRepo();
	const worktree = tempDir("hubble-worktree-");
	const worktreeGitDir = path.join(main, ".git", "worktrees", "wt1");
	await fs.mkdir(worktreeGitDir, { recursive: true });
	await fs.writeFile(
		path.join(worktree, ".git"),
		`gitdir: ${worktreeGitDir}\n`,
	);
	// Relative commondir, as git writes it.
	await fs.writeFile(path.join(worktreeGitDir, "commondir"), "../..\n");
	return { main, worktree };
}

describe("resolveGitRepo", () => {
	it("detects a plain clone (.git directory)", async () => {
		const repo = await makePlainRepo();
		const info = await resolveGitRepo(repo);
		expect(info).not.toBeNull();
		expect(info?.commonGitDir).toBe(path.join(repo, ".git"));
	});

	it("walks from a selected child directory to the repo root", async () => {
		const repo = await makePlainRepo();
		const child = path.join(repo, "packages", "app", "src");
		await fs.mkdir(child, { recursive: true });

		const info = await resolveGitRepo(child);
		expect(info).toEqual({
			repoDir: repo,
			commonGitDir: path.join(repo, ".git"),
		});
	});

	it("resolves a worktree gitfile to the COMMON gitdir", async () => {
		const { main, worktree } = await makeWorktreeRepo();
		const info = await resolveGitRepo(worktree);
		expect(info).not.toBeNull();
		expect(info?.commonGitDir).toBe(path.join(main, ".git"));
	});

	it("walks from a worktree child to the worktree root", async () => {
		const { main, worktree } = await makeWorktreeRepo();
		const child = path.join(worktree, "nested", "child");
		await fs.mkdir(child, { recursive: true });

		const info = await resolveGitRepo(child);
		expect(info).toEqual({
			repoDir: worktree,
			commonGitDir: path.join(main, ".git"),
		});
	});

	it("returns null for a non-repo directory", async () => {
		const dir = tempDir("hubble-plain-");
		expect(await resolveGitRepo(dir)).toBeNull();
	});
});

describe("excludeMountFromGit", () => {
	it("appends an anchored pattern to .git/info/exclude, idempotently", async () => {
		const repo = await makePlainRepo();
		const mount = path.join(repo, "Acme Brain");
		const info = await resolveGitRepo(repo);
		if (!info) throw new Error("repo not detected");

		const first = await excludeMountFromGit(info, mount);
		expect(first).toMatchObject({
			ok: true,
			alreadyPresent: false,
			pattern: "/Acme Brain/",
		});
		const second = await excludeMountFromGit(info, mount);
		expect(second).toMatchObject({ ok: true, alreadyPresent: true });

		const exclude = await fs.readFile(
			path.join(repo, ".git", "info", "exclude"),
			"utf-8",
		);
		// Present exactly once, never duplicated.
		expect(
			exclude.split("\n").filter((l) => l === "/Acme Brain/"),
		).toHaveLength(1);
	});

	it("writes the exclude into the COMMON gitdir for a worktree", async () => {
		const { main, worktree } = await makeWorktreeRepo();
		const mount = path.join(worktree, "brain");
		const info = await resolveGitRepo(worktree);
		if (!info) throw new Error("worktree not detected");

		const result = await excludeMountFromGit(info, mount);
		expect(result.ok).toBe(true);
		const exclude = await fs.readFile(
			path.join(main, ".git", "info", "exclude"),
			"utf-8",
		);
		expect(exclude).toContain("/brain/");
	});

	it("fails soft with the manual pattern when the gitdir is unwritable", async () => {
		const repo = tempDir("hubble-broken-");
		const result = await excludeMountFromGit(
			// Deliberately bogus common gitdir path (a file, not a dir).
			{ repoDir: repo, commonGitDir: path.join(repo, "nonexistent", "\0bad") },
			path.join(repo, "brain"),
		);
		expect(result.ok).toBe(false);
		expect(result.pattern).toBe("/brain/");
	});
});

describe("parseGitOriginUrl / repoNameFrom", () => {
	it("parses remote origin from a plain-file git config", async () => {
		const repo = await makePlainRepo();
		const url = await parseGitOriginUrl(path.join(repo, ".git"));
		expect(url).toBe("git@github.com:acme/app.git");
		expect(repoNameFrom(repo, url)).toBe("app");
	});

	it("returns null when no origin remote exists", async () => {
		const repo = await makePlainRepo();
		await fs.writeFile(path.join(repo, ".git", "config"), "[core]\n");
		expect(await parseGitOriginUrl(path.join(repo, ".git"))).toBeNull();
		// Falls back to the directory name.
		expect(repoNameFrom("/x/y/my-repo", null)).toBe("my-repo");
	});
});

describe("sanitizeMountSegment", () => {
	it("makes folder names safe as a single path segment", () => {
		expect(sanitizeMountSegment("Acme / Strategy: v2?")).toBe(
			"Acme Strategy v2",
		);
		expect(sanitizeMountSegment("..")).toBe("hubble-folder");
		expect(sanitizeMountSegment("")).toBe("hubble-folder");
	});
});

describe("BRAIN.md seed (RB5, D13/D14)", () => {
	it("template carries purpose, snapshot index labeled at-creation, and agent instructions", () => {
		const markdown = buildBrainMarkdown({
			folderName: "Strategy",
			repoName: "acme-app",
			repoRemoteUrl: "git@github.com:acme/app.git",
			documentIndex: [
				{ title: "Overview", relativePath: "" },
				{ title: "Deep Doc", relativePath: "Research" },
			],
		});
		expect(markdown).toContain("**Strategy**");
		expect(markdown).toContain("`acme-app`");
		expect(markdown).toContain("Documents at creation");
		expect(markdown).toContain("- Overview");
		expect(markdown).toContain("- Research/Deep Doc");
		expect(markdown).toContain("live, shared context");
		expect(markdown).toContain("syncs to the whole");
		expect(markdown).toContain("Do not commit this folder to git");
	});

	it("hasBrainDocument is any-case and matches path tail or title", () => {
		expect(hasBrainDocument([{ title: "brain", path: null }])).toBe(true);
		expect(hasBrainDocument([{ title: "Doc", path: "sub/Brain.MD" }])).toBe(
			true,
		);
		expect(hasBrainDocument([{ title: "BRAIN", path: null }])).toBe(true);
		expect(hasBrainDocument([{ title: "Brainstorm", path: null }])).toBe(false);
		expect(hasBrainDocument([])).toBe(false);
	});
});
