import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"audit-upstream.mjs",
);
const temporaryDirectories = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

function command(cwd, args, { allowFailure = false } = {}) {
	const result = spawnSync(args[0], args.slice(1), {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (!allowFailure && result.status !== 0) {
		throw new Error(
			`${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
		);
	}
	return result;
}

function git(cwd, ...args) {
	return command(cwd, ["git", ...args]).stdout.trim();
}

function writeFile(root, path, contents) {
	const destination = join(root, path);
	mkdirSync(dirname(destination), { recursive: true });
	writeFileSync(destination, contents);
	return destination;
}

function commitFile(repo, path, contents, message) {
	writeFile(repo, path, contents);
	git(repo, "add", "--", path);
	git(repo, "commit", "-m", message);
	return git(repo, "rev-parse", "HEAD");
}

function writeState(repo, screenedThrough) {
	writeFile(
		repo,
		"specs/upstream-intake/state.json",
		`${JSON.stringify(
			{
				schemaVersion: 1,
				strategy: "selective-downstream",
				remote: "upstream",
				branch: "main",
				targetBranch: "v1-release",
				screenedThrough,
				screenedAt: "2026-07-14",
				candidateQueue: [],
			},
			null,
			2,
		)}\n`,
	);
}

function createFixture() {
	const root = mkdtempSync(join(tmpdir(), "hubble-upstream-audit-"));
	temporaryDirectories.push(root);
	const remote = join(root, "upstream.git");
	const source = join(root, "source");
	const repo = join(root, "fork");

	git(root, "init", "--bare", remote);
	mkdirSync(source);
	git(source, "init", "-b", "main");
	git(source, "config", "user.name", "Fixture Author");
	git(source, "config", "user.email", "fixture@example.com");
	const base = commitFile(source, "README.md", "base\n", "base");
	git(source, "remote", "add", "origin", remote);
	git(source, "push", "-u", "origin", "main");

	git(root, "clone", remote, repo);
	git(repo, "config", "user.name", "Fixture Author");
	git(repo, "config", "user.email", "fixture@example.com");
	git(repo, "remote", "rename", "origin", "upstream");
	git(repo, "switch", "-c", "v1-release");
	writeState(repo, base);
	git(repo, "add", "specs/upstream-intake/state.json");
	git(repo, "commit", "-m", "add intake state");

	return { base, remote, repo, root, source };
}

function runAudit(repo, ...args) {
	return command(repo, [process.execPath, scriptPath, ...args], {
		allowFailure: true,
	});
}

function jsonAudit(repo, ...args) {
	const result = runAudit(repo, "--json", ...args);
	assert.equal(result.status, 0, result.stdout || result.stderr);
	return JSON.parse(result.stdout);
}

test("reports no newly seen upstream commits without mutating the repository", () => {
	const { repo } = createFixture();
	const before = {
		head: git(repo, "rev-parse", "HEAD"),
		index: git(repo, "write-tree"),
		refs: git(repo, "for-each-ref", "--format=%(refname) %(objectname)"),
		status: git(repo, "status", "--porcelain=v1", "--untracked-files=all"),
	};
	const report = jsonAudit(join(repo, "specs"), "--no-fetch");

	assert.equal(report.schemaVersion, 1);
	assert.equal(report.history.commits.length, 0);
	assert.equal(report.target.clean, true);
	assert.deepEqual(
		{
			head: git(repo, "rev-parse", "HEAD"),
			index: git(repo, "write-tree"),
			refs: git(repo, "for-each-ref", "--format=%(refname) %(objectname)"),
			status: git(repo, "status", "--porcelain=v1", "--untracked-files=all"),
		},
		before,
	);
});

test("reports one clean upstream commit and matching Markdown totals", () => {
	const { repo, source } = createFixture();
	const upstreamSha = commitFile(
		source,
		"clean.txt",
		"clean\n",
		"clean upstream change",
	);
	git(source, "push");
	git(repo, "fetch", "upstream");

	const report = jsonAudit(repo, "--no-fetch");
	assert.equal(report.history.commits.length, 1);
	assert.equal(report.history.commits[0].sha, upstreamSha);
	assert.deepEqual(report.history.commits[0].paths, ["clean.txt"]);
	assert.equal(report.mergePreview.clean, true);

	const markdown = runAudit(repo, "--no-fetch");
	assert.equal(markdown.status, 0, markdown.stderr);
	assert.match(markdown.stdout, /Newly seen: 1 commits/);
	assert.match(markdown.stdout, /Synthetic merge: clean/);
});

test("default fetch updates only remote-tracking state", () => {
	const { repo, source } = createFixture();
	const upstreamBefore = git(repo, "rev-parse", "refs/remotes/upstream/main");
	const before = {
		head: git(repo, "rev-parse", "HEAD"),
		index: git(repo, "write-tree"),
		localRefs: git(
			repo,
			"for-each-ref",
			"refs/heads",
			"--format=%(refname) %(objectname)",
		),
		status: git(repo, "status", "--porcelain=v1", "--untracked-files=all"),
	};
	const fetchHeadPath = join(repo, ".git", "FETCH_HEAD");
	const fetchHeadBefore = existsSync(fetchHeadPath)
		? readFileSync(fetchHeadPath, "utf8")
		: null;
	const upstreamSha = commitFile(
		source,
		"fetched.txt",
		"new\n",
		"fetched upstream change",
	);
	git(source, "push");

	const report = jsonAudit(repo);
	assert.equal(report.upstream.fetched, true);
	assert.equal(report.upstream.head, upstreamSha);
	assert.notEqual(report.upstream.head, upstreamBefore);
	assert.deepEqual(
		{
			head: git(repo, "rev-parse", "HEAD"),
			index: git(repo, "write-tree"),
			localRefs: git(
				repo,
				"for-each-ref",
				"refs/heads",
				"--format=%(refname) %(objectname)",
			),
			status: git(repo, "status", "--porcelain=v1", "--untracked-files=all"),
		},
		before,
	);
	assert.equal(
		existsSync(fetchHeadPath) ? readFileSync(fetchHeadPath, "utf8") : null,
		fetchHeadBefore,
	);
});

test("reports divergent commits and overlapping paths", () => {
	const { repo, source } = createFixture();
	commitFile(repo, "shared.txt", "fork\n", "fork overlap");
	commitFile(source, "shared.txt", "upstream\n", "upstream overlap");
	git(source, "push");
	git(repo, "fetch", "upstream");

	const report = jsonAudit(repo, "--no-fetch");
	assert.ok(report.history.divergence.forkOnly >= 2);
	assert.equal(report.history.divergence.upstreamOnly, 1);
	assert.deepEqual(report.pathOverlap.sharedPaths, ["shared.txt"]);
});

test("treats merge-tree content conflicts as report data", () => {
	const { repo, source } = createFixture();
	commitFile(repo, "README.md", "fork\n", "fork conflict");
	commitFile(source, "README.md", "upstream\n", "upstream conflict");
	git(source, "push");
	git(repo, "fetch", "upstream");

	const report = jsonAudit(repo, "--no-fetch");
	assert.equal(report.mergePreview.clean, false);
	assert.deepEqual(report.mergePreview.conflictPaths, ["README.md"]);
	assert.ok(
		report.mergePreview.messages.some((line) =>
			line.includes("CONFLICT (content)"),
		),
	);
});

test("rejects a saved SHA that is missing or not reachable from upstream", async (t) => {
	await t.test("missing", () => {
		const { repo } = createFixture();
		writeState(repo, "1111111111111111111111111111111111111111");
		const result = runAudit(repo, "--no-fetch");
		assert.equal(result.status, 1);
		assert.match(result.stderr, /does not resolve to an accessible commit/);
	});

	await t.test("not reachable", () => {
		const { base, repo, source } = createFixture();
		git(source, "switch", "-c", "abandoned", base);
		const abandonedSha = commitFile(
			source,
			"abandoned.txt",
			"nope\n",
			"abandoned",
		);
		git(source, "push", "origin", "abandoned");
		git(source, "switch", "main");
		git(repo, "fetch", "upstream");
		writeState(repo, abandonedSha);
		const result = runAudit(repo, "--no-fetch");
		assert.equal(result.status, 1);
		assert.match(result.stderr, /is not reachable from upstream\/main/);
	});
});

test("reports a dirty target worktree without changing it", () => {
	const { repo } = createFixture();
	writeFile(repo, "dirty file.txt", "preserve me\n");
	const report = jsonAudit(repo, "--no-fetch");
	assert.equal(report.target.clean, false);
	assert.ok(
		report.target.statusEntries.some((entry) =>
			entry.includes("dirty file.txt"),
		),
	);
	assert.equal(
		readFileSync(join(repo, "dirty file.txt"), "utf8"),
		"preserve me\n",
	);
});

test("--no-fetch uses the existing remote-tracking ref", () => {
	const { repo, root } = createFixture();
	git(repo, "remote", "set-url", "upstream", join(root, "missing.git"));

	assert.equal(runAudit(repo, "--no-fetch").status, 0);
	const fetched = runAudit(repo);
	assert.equal(fetched.status, 1);
	assert.match(fetched.stderr, /git fetch failed/);
});

test("preserves paths containing spaces in commit and overlap data", () => {
	const { repo, source } = createFixture();
	commitFile(
		repo,
		"folder with spaces/file name.md",
		"fork\n",
		"fork spaced path",
	);
	commitFile(
		source,
		"folder with spaces/file name.md",
		"upstream\n",
		"upstream spaced path",
	);
	git(source, "push");
	git(repo, "fetch", "upstream");

	const report = jsonAudit(repo, "--no-fetch");
	assert.deepEqual(report.history.commits[0].paths, [
		"folder with spaces/file name.md",
	]);
	assert.deepEqual(report.pathOverlap.sharedPaths, [
		"folder with spaces/file name.md",
	]);
});

test("fixture adoption uses an isolated worktree and only fast-forwards an unchanged clean target", () => {
	const { repo, root } = createFixture();
	const capturedHead = git(repo, "rev-parse", "refs/heads/v1-release");
	const intakeBranch = "codex/upstream-intake-2026-07-14";
	const worktree = join(root, "intake-worktree");
	git(repo, "worktree", "add", "-b", intakeBranch, worktree, capturedHead);
	commitFile(worktree, "adopted.txt", "verified\n", "adopt fixture behavior");

	assert.equal(git(repo, "status", "--porcelain=v1"), "");
	assert.equal(git(repo, "rev-parse", "refs/heads/v1-release"), capturedHead);
	git(repo, "merge", "--ff-only", intakeBranch);
	assert.equal(git(repo, "show", "HEAD:adopted.txt"), "verified");

	writeFile(repo, "unrelated.txt", "dirty\n");
	const safeToLandAgain =
		git(repo, "status", "--porcelain=v1") === "" &&
		git(repo, "rev-parse", "refs/heads/v1-release") === capturedHead;
	assert.equal(safeToLandAgain, false);
});
