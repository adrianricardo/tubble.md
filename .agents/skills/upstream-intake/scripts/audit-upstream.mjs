#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const JSON_SCHEMA_VERSION = 1;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DISPOSITIONS = new Set([
	"adopt",
	"reimplement",
	"superseded",
	"defer-product",
	"skip",
	"blocked",
]);

class AuditError extends Error {}

function runGit(args, { cwd, allowExitCodes = [0], encoding = "utf8" } = {}) {
	const result = spawnSync("git", args, {
		cwd,
		encoding,
		stdio: ["ignore", "pipe", "pipe"],
	});

	if (result.error) {
		throw new AuditError(`Unable to run Git: ${result.error.message}`);
	}
	if (!allowExitCodes.includes(result.status)) {
		const detail = String(result.stderr || result.stdout).trim();
		throw new AuditError(
			`git ${args[0]} failed${detail ? `: ${detail}` : ` with exit ${result.status}`}`,
		);
	}
	return result;
}

function gitText(args, options) {
	return runGit(args, options).stdout.trim();
}

function splitNull(buffer) {
	return buffer
		.toString("utf8")
		.split("\0")
		.filter((value) => value.length > 0);
}

function readState(repoRoot) {
	const statePath = join(repoRoot, "specs", "upstream-intake", "state.json");
	let state;
	try {
		state = JSON.parse(readFileSync(statePath, "utf8"));
	} catch (error) {
		throw new AuditError(
			`Cannot read valid JSON from ${statePath}: ${error.message}`,
		);
	}

	if (state.schemaVersion !== 1 || state.strategy !== "selective-downstream") {
		throw new AuditError(
			"state.json must use schemaVersion 1 and selective-downstream strategy",
		);
	}
	for (const key of ["remote", "branch", "targetBranch", "screenedAt"]) {
		if (typeof state[key] !== "string" || state[key].length === 0) {
			throw new AuditError(`state.json ${key} must be a non-empty string`);
		}
	}
	if (!SHA_PATTERN.test(state.screenedThrough)) {
		throw new AuditError(
			"state.json screenedThrough must be a lowercase 40-character SHA",
		);
	}
	if (!Array.isArray(state.candidateQueue)) {
		throw new AuditError("state.json candidateQueue must be an array");
	}
	const candidateIds = new Set();
	for (const candidate of state.candidateQueue) {
		if (
			typeof candidate !== "object" ||
			candidate === null ||
			typeof candidate.id !== "string" ||
			candidate.id.length === 0 ||
			typeof candidate.title !== "string" ||
			candidate.title.length === 0 ||
			!Array.isArray(candidate.commits) ||
			candidate.commits.length === 0 ||
			!candidate.commits.every(
				(sha) => typeof sha === "string" && SHA_PATTERN.test(sha),
			) ||
			!["auto-evaluate", "report-only"].includes(candidate.reviewMode) ||
			!DISPOSITIONS.has(candidate.strategyDisposition)
		) {
			throw new AuditError(
				`state.json contains a malformed candidate: ${candidate.id ?? "unknown"}`,
			);
		}
		if (candidateIds.has(candidate.id)) {
			throw new AuditError(
				`state.json contains duplicate candidate id: ${candidate.id}`,
			);
		}
		candidateIds.add(candidate.id);
	}
	return state;
}

function assertCommit(repoRoot, revision, label) {
	const result = runGit(["cat-file", "-e", `${revision}^{commit}`], {
		cwd: repoRoot,
		allowExitCodes: [0, 1, 128],
	});
	if (result.status !== 0) {
		throw new AuditError(
			`${label} does not resolve to an accessible commit: ${revision}`,
		);
	}
}

function collectPaths(repoRoot, from, to) {
	return splitNull(
		runGit(["diff", "--name-only", "-z", `${from}..${to}`], {
			cwd: repoRoot,
			encoding: "buffer",
		}).stdout,
	).sort();
}

function collectCommits(repoRoot, range) {
	const shas = gitText(["rev-list", "--reverse", "--topo-order", range], {
		cwd: repoRoot,
	})
		.split("\n")
		.filter(Boolean);

	return shas.map((sha) => {
		const metadata = gitText(
			["show", "-s", "--format=%H%x00%P%x00%aI%x00%s", sha],
			{
				cwd: repoRoot,
			},
		).split("\0");
		const paths = splitNull(
			runGit(
				[
					"diff-tree",
					"--root",
					"--no-commit-id",
					"--name-only",
					"-r",
					"-z",
					sha,
				],
				{
					cwd: repoRoot,
					encoding: "buffer",
				},
			).stdout,
		).sort();
		return {
			sha: metadata[0],
			parents: metadata[1] ? metadata[1].split(" ") : [],
			date: metadata[2],
			subject: metadata[3],
			paths,
		};
	});
}

function collectMergePreview(repoRoot, targetHead, upstreamHead) {
	const result = runGit(
		[
			"merge-tree",
			"--write-tree",
			"--name-only",
			"--messages",
			targetHead,
			upstreamHead,
		],
		{ cwd: repoRoot, allowExitCodes: [0, 1] },
	);
	const [pathSection = "", ...messageSections] =
		result.stdout.split(/\r?\n\r?\n/);
	const lines = pathSection.split(/\r?\n/).filter(Boolean);
	// Git prefixes the conflict-path section with the synthetic tree object ID.
	return {
		clean: result.status === 0,
		conflictPaths: lines.slice(1).sort(),
		messages: messageSections
			.join("\n\n")
			.trim()
			.split(/\r?\n/)
			.filter(Boolean),
	};
}

function resolveRepoRoot(cwd) {
	return gitText(["rev-parse", "--show-toplevel"], { cwd });
}

export function audit({ cwd = process.cwd(), fetch = true } = {}) {
	const repoRoot = resolveRepoRoot(cwd);
	const state = readState(repoRoot);
	const upstreamRef = `refs/remotes/${state.remote}/${state.branch}`;

	gitText(["remote", "get-url", state.remote], { cwd: repoRoot });
	if (fetch) {
		runGit(
			["fetch", "--prune", "--no-tags", "--no-write-fetch-head", state.remote],
			{
				cwd: repoRoot,
			},
		);
	}

	assertCommit(repoRoot, upstreamRef, "Configured upstream ref");
	assertCommit(repoRoot, state.screenedThrough, "Saved screened SHA");
	const screenedReachability =
		runGit(
			["merge-base", "--is-ancestor", state.screenedThrough, upstreamRef],
			{ cwd: repoRoot, allowExitCodes: [0, 1] },
		).status === 0;
	if (!screenedReachability) {
		throw new AuditError(
			`Saved screened SHA ${state.screenedThrough} is not reachable from ${state.remote}/${state.branch}`,
		);
	}

	const targetRef = `refs/heads/${state.targetBranch}`;
	assertCommit(repoRoot, targetRef, "Configured target branch");
	const targetHead = gitText(["rev-parse", targetRef], { cwd: repoRoot });
	const checkedOutBranch = gitText(["branch", "--show-current"], {
		cwd: repoRoot,
	});
	const checkedOutHead = gitText(["rev-parse", "HEAD"], { cwd: repoRoot });
	const statusEntries = splitNull(
		runGit(["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
			cwd: repoRoot,
			encoding: "buffer",
		}).stdout,
	);
	const upstreamHead = gitText(["rev-parse", upstreamRef], { cwd: repoRoot });
	const mergeBase = gitText(["merge-base", targetHead, upstreamHead], {
		cwd: repoRoot,
	});
	const [forkOnly, upstreamOnly] = gitText(
		["rev-list", "--left-right", "--count", `${targetHead}...${upstreamHead}`],
		{ cwd: repoRoot },
	)
		.split(/\s+/)
		.map(Number);
	const forkPaths = collectPaths(repoRoot, mergeBase, targetHead);
	const upstreamPaths = collectPaths(repoRoot, mergeBase, upstreamHead);
	const upstreamPathSet = new Set(upstreamPaths);
	const sharedPaths = forkPaths.filter((path) => upstreamPathSet.has(path));

	return {
		schemaVersion: JSON_SCHEMA_VERSION,
		strategy: state.strategy,
		repository: { root: repoRoot },
		target: {
			branch: state.targetBranch,
			head: targetHead,
			checkedOutBranch: checkedOutBranch || null,
			checkedOutHead,
			checkedOut:
				checkedOutBranch === state.targetBranch &&
				checkedOutHead === targetHead,
			clean: statusEntries.length === 0,
			statusEntries,
		},
		upstream: {
			remote: state.remote,
			branch: state.branch,
			ref: upstreamRef,
			head: upstreamHead,
			screenedThrough: state.screenedThrough,
			screenedAt: state.screenedAt,
			screenedThroughReachable: screenedReachability,
			fetched: fetch,
		},
		history: {
			mergeBase,
			divergence: { forkOnly, upstreamOnly },
			commits: collectCommits(
				repoRoot,
				`${state.screenedThrough}..${upstreamRef}`,
			),
		},
		pathOverlap: { forkPaths, upstreamPaths, sharedPaths },
		mergePreview: collectMergePreview(repoRoot, targetHead, upstreamHead),
		candidateQueue: state.candidateQueue,
	};
}

function shortSha(sha) {
	return sha.slice(0, 12);
}

function markdownList(values, emptyText) {
	if (values.length === 0) return `- ${emptyText}`;
	return values.map((value) => `- \`${value}\``).join("\n");
}

export function formatMarkdown(report) {
	const dirtySuffix = report.target.clean
		? "clean"
		: `dirty (${report.target.statusEntries.length} status entries; automatic landing forbidden)`;
	const checkoutSuffix = report.target.checkedOut
		? ""
		: "; configured target is not checked out here";
	const commits = report.history.commits.length
		? report.history.commits
				.map(
					(commit) =>
						`- \`${shortSha(commit.sha)}\` ${commit.date.slice(0, 10)} — ${commit.subject} (${commit.paths.length} paths)`,
				)
				.join("\n")
		: "- No newly seen upstream commits.";
	const candidates = report.candidateQueue.length
		? report.candidateQueue
				.map((candidate) => `- \`${candidate.id}\` — ${candidate.title}`)
				.join("\n")
		: "- No queued candidates.";

	return `# Upstream intake audit

- Target: \`${report.target.branch}\` at \`${shortSha(report.target.head)}\` (${dirtySuffix})
- Checked out: \`${report.target.checkedOutBranch ?? "detached HEAD"}\` at \`${shortSha(report.target.checkedOutHead)}\`${checkoutSuffix}
- Upstream: \`${report.upstream.remote}/${report.upstream.branch}\` at \`${shortSha(report.upstream.head)}\`${report.upstream.fetched ? " (fetched)" : " (no fetch)"}
- Screened through: \`${shortSha(report.upstream.screenedThrough)}\` (${report.upstream.screenedAt}, reachable)
- Merge base: \`${shortSha(report.history.mergeBase)}\`
- Divergence: ${report.history.divergence.forkOnly} fork-only / ${report.history.divergence.upstreamOnly} upstream-only commits
- Newly seen: ${report.history.commits.length} commits
- Changed-path overlap: ${report.pathOverlap.sharedPaths.length} paths
- Synthetic merge: ${report.mergePreview.clean ? "clean" : `${report.mergePreview.conflictPaths.length} conflict paths`}

## Newly seen commits

${commits}

## Conflict paths

${markdownList(report.mergePreview.conflictPaths, "No synthetic merge conflicts.")}

## Queued candidates

${candidates}`;
}

function parseArgs(argv) {
	const options = { fetch: true, json: false };
	for (const argument of argv) {
		if (argument === "--") continue;
		if (argument === "--json") options.json = true;
		else if (argument === "--no-fetch") options.fetch = false;
		else throw new AuditError(`Unknown argument: ${argument}`);
	}
	return options;
}

function main() {
	let options = { json: process.argv.includes("--json") };
	try {
		options = parseArgs(process.argv.slice(2));
		const report = audit({ fetch: options.fetch });
		process.stdout.write(
			options.json
				? `${JSON.stringify(report, null, 2)}\n`
				: `${formatMarkdown(report)}\n`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (options.json) {
			process.stdout.write(
				`${JSON.stringify({ schemaVersion: 1, error: message }, null, 2)}\n`,
			);
		} else {
			process.stderr.write(`upstream audit: ${message}\n`);
		}
		process.exitCode = 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main();
}
