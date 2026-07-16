import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
	type AuthorityManifestExclusion,
	type AuthorityManifestItem,
	buildAuthorityManifest,
	contentHash,
	extractLocalMarkdownReferences,
	normalizeAuthorityPath,
} from "@hubble.md/sync";
import type {
	GitDestinationInspection,
	GitDestinationInspectionInput,
	GitFolderInspection,
	GitWorkingTreeChange,
} from "../src/desktopApi/types";
import type { FolderAuthorityPlacement } from "./folderAuthorityStore";
import { parseGitOriginUrl, repoNameFrom, resolveGitRepo } from "./repoLink";

const READ_ONLY_GIT_COMMANDS = new Set([
	"rev-parse",
	"status",
	"ls-files",
	"check-ignore",
]);
const GENERATED_DIRECTORIES = new Set([
	".git",
	".hubble",
	"node_modules",
	"dist",
	"build",
	"coverage",
	"generated",
	".next",
	"out",
]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_LIVE_MARKDOWN_BYTES = 256 * 1024;
const MAX_MANIFEST_FILES = 5000;
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_WORKING_TREE_CHANGES = 100;

export type ReadOnlyGitRunner = (
	cwd: string,
	args: string[],
	allowedExitCodes?: number[],
	stdin?: string,
) => Promise<string>;

export function assertReadOnlyGitArgs(args: string[]): void {
	if (!args[0] || !READ_ONLY_GIT_COMMANDS.has(args[0])) {
		throw new Error(`Git command is not read-only: ${args[0] ?? "missing"}`);
	}
}

export const runReadOnlyGit: ReadOnlyGitRunner = (
	cwd,
	args,
	allowedExitCodes = [0],
	stdin,
) => {
	assertReadOnlyGitArgs(args);
	return new Promise((resolve, reject) => {
		const child = execFile(
			"git",
			["-C", cwd, ...args],
			{ encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT_BYTES },
			(error, stdout, stderr) => {
				const code =
					error && typeof error === "object" && "code" in error
						? Number(error.code)
						: 0;
				if (!error || allowedExitCodes.includes(code)) {
					resolve(stdout);
					return;
				}
				reject(new Error(stderr.trim() || error.message));
			},
		);
		if (stdin !== undefined) child.stdin?.end(stdin);
	});
};

function normalizeAbsolute(value: string): string {
	return path.resolve(value);
}

function isWithin(candidate: string, parent: string): boolean {
	const relative = path.relative(parent, candidate);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

function toGitPath(value: string): string {
	return value.split(path.sep).join("/");
}

function nulRecords(value: string): string[] {
	return value.split("\0").filter(Boolean);
}

function statusPath(record: string): string | null {
	if (record.startsWith("? ") || record.startsWith("! "))
		return record.slice(2);
	const fieldsToSkip = record.startsWith("1 ")
		? 8
		: record.startsWith("2 ")
			? 9
			: record.startsWith("u ")
				? 10
				: null;
	if (fieldsToSkip === null) return null;
	return record.split(" ").slice(fieldsToSkip).join(" ") || null;
}

function parseStatus(value: string): GitWorkingTreeChange[] {
	const records = nulRecords(value);
	const changes: GitWorkingTreeChange[] = [];
	for (let index = 0; index < records.length; index++) {
		const record = records[index] ?? "";
		if (record.startsWith("2 ")) index += 1;
		const changedPath = statusPath(record);
		if (!changedPath) continue;
		changes.push({ path: changedPath, status: record.slice(0, 2).trim() });
	}
	return changes.sort((a, b) => a.path.localeCompare(b.path));
}

type ScannedFile = {
	absolutePath: string;
	relativePath: string;
	repoRelativePath: string;
	size: number;
	mode: number;
};

type ScanResult = {
	files: ScannedFile[];
	exclusions: AuthorityManifestExclusion[];
};

function exclusion(
	relativePath: string,
	reason: AuthorityManifestExclusion["reason"],
	blocking = false,
): AuthorityManifestExclusion {
	return {
		relativePath: normalizeAuthorityPath(relativePath),
		reason,
		blocking,
	};
}

async function scanFolder(input: {
	sourcePath: string;
	repoRoot: string;
	nestedAuthorityRoots: string[];
}): Promise<ScanResult> {
	const files: ScannedFile[] = [];
	const nestedRoots = input.nestedAuthorityRoots.map(normalizeAbsolute);
	const exclusions: AuthorityManifestExclusion[] = nestedRoots.map((root) =>
		exclusion(
			toGitPath(path.relative(input.sourcePath, root)),
			"nested-authority",
		),
	);

	const visit = async (directory: string): Promise<void> => {
		const entries = await fs.readdir(directory, { withFileTypes: true });
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			const absolutePath = path.join(directory, entry.name);
			const relativePath = toGitPath(
				path.relative(input.sourcePath, absolutePath),
			);
			if (nestedRoots.some((root) => absolutePath === root)) {
				continue;
			}
			const stat = await fs.lstat(absolutePath);
			if (stat.isSymbolicLink()) {
				exclusions.push(exclusion(relativePath, "symlink", true));
				continue;
			}
			if (entry.isDirectory()) {
				if (GENERATED_DIRECTORIES.has(entry.name)) {
					exclusions.push(exclusion(relativePath, "generated"));
					continue;
				}
				await visit(absolutePath);
				continue;
			}
			if (!entry.isFile()) {
				exclusions.push(exclusion(relativePath, "unsupported"));
				continue;
			}
			if (files.length >= MAX_MANIFEST_FILES) {
				exclusions.push(exclusion(relativePath, "oversized", true));
				continue;
			}
			files.push({
				absolutePath,
				relativePath,
				repoRelativePath: toGitPath(
					path.relative(input.repoRoot, absolutePath),
				),
				size: stat.size,
				mode: stat.mode,
			});
		}
	};

	await visit(input.sourcePath);
	return { files, exclusions };
}

function correspondingMarkdownPath(relativePath: string): string[] {
	const segments = normalizeAuthorityPath(relativePath).split("/");
	const assetIndex = segments.findIndex((segment) =>
		segment.endsWith(".assets"),
	);
	if (assetIndex < 0) return [];
	const stem = segments[assetIndex]?.slice(0, -".assets".length) ?? "";
	const prefix = segments.slice(0, assetIndex);
	return [...MARKDOWN_EXTENSIONS].map((extension) =>
		[...prefix, `${stem}${extension}`].join("/"),
	);
}

async function repositoryIdentity(repoRoot: string) {
	const repo = await resolveGitRepo(repoRoot);
	const repoRemoteUrl = repo
		? await parseGitOriginUrl(repo.commonGitDir)
		: null;
	return {
		repoName: repoNameFrom(repoRoot, repoRemoteUrl),
		repoRemoteUrl,
	};
}

function uniqueExclusions(
	exclusions: AuthorityManifestExclusion[],
): AuthorityManifestExclusion[] {
	const byKey = new Map<string, AuthorityManifestExclusion>();
	for (const candidate of exclusions) {
		const key = `${candidate.relativePath}:${candidate.reason}`;
		const current = byKey.get(key);
		byKey.set(key, {
			...candidate,
			blocking: candidate.blocking || current?.blocking === true,
		});
	}
	return [...byKey.values()];
}

export async function inspectGitFolder(
	folderPath: string,
	placements: FolderAuthorityPlacement[],
	runGit: ReadOnlyGitRunner = runReadOnlyGit,
): Promise<GitFolderInspection> {
	const requestedPath = normalizeAbsolute(folderPath);
	const selectedStat = await fs.lstat(requestedPath);
	if (!selectedStat.isDirectory() || selectedStat.isSymbolicLink()) {
		throw new Error("Authority moves require a real local folder");
	}
	const selectedPath = await fs.realpath(requestedPath);
	const reportedRoot = (
		await runGit(selectedPath, ["rev-parse", "--show-toplevel"])
	).trim();
	const repoRoot = await fs.realpath(normalizeAbsolute(reportedRoot));
	if (!isWithin(selectedPath, repoRoot)) {
		throw new Error("Selected folder is outside the resolved Git repository");
	}
	const relativePath = toGitPath(path.relative(repoRoot, selectedPath));
	const pathspec = relativePath || ".";
	const nestedAuthorityRoots = placements
		.filter((placement) => normalizeAbsolute(placement.repoRoot) === repoRoot)
		.map((placement) => path.join(repoRoot, placement.relativePath))
		.filter(
			(placementPath) =>
				placementPath !== selectedPath && isWithin(placementPath, selectedPath),
		);
	const scanned = await scanFolder({
		sourcePath: selectedPath,
		repoRoot,
		nestedAuthorityRoots,
	});
	const tracked = new Set(
		nulRecords(
			await runGit(repoRoot, ["ls-files", "-z", "--cached", "--", pathspec]),
		).map(normalizeAuthorityPath),
	);
	const ignored = new Set<string>();
	if (scanned.files.length > 0) {
		for (let offset = 0; offset < scanned.files.length; offset += 500) {
			const chunk = scanned.files
				.slice(offset, offset + 500)
				.map((file) => file.repoRelativePath);
			for (const ignoredPath of nulRecords(
				await runGit(
					repoRoot,
					["check-ignore", "-z", "--stdin", "--no-index"],
					[0, 1],
					`${chunk.join("\0")}\0`,
				),
			)) {
				ignored.add(normalizeAuthorityPath(ignoredPath));
			}
		}
	}
	const markdownPaths = new Set(
		scanned.files
			.filter((file) =>
				MARKDOWN_EXTENSIONS.has(path.extname(file.relativePath)),
			)
			.map((file) => normalizeAuthorityPath(file.relativePath)),
	);
	const items: AuthorityManifestItem[] = [];
	const markdownContents = new Map<string, string>();
	const exclusions = [...scanned.exclusions];
	for (const file of scanned.files) {
		const normalizedRelative = normalizeAuthorityPath(file.relativePath);
		if (ignored.has(normalizeAuthorityPath(file.repoRelativePath))) {
			exclusions.push(exclusion(normalizedRelative, "ignored"));
			continue;
		}
		if (file.size > MAX_FILE_BYTES) {
			exclusions.push(exclusion(normalizedRelative, "oversized", true));
			continue;
		}
		const extension = path.extname(normalizedRelative).toLocaleLowerCase();
		const kind = MARKDOWN_EXTENSIONS.has(extension)
			? "markdown"
			: correspondingMarkdownPath(normalizedRelative).some((candidate) =>
						markdownPaths.has(candidate),
					)
				? "asset"
				: null;
		if (!kind) {
			exclusions.push(exclusion(normalizedRelative, "unsupported"));
			continue;
		}
		if (kind === "markdown" && file.size > MAX_LIVE_MARKDOWN_BYTES) {
			exclusions.push(exclusion(normalizedRelative, "oversized", true));
			continue;
		}
		const bytes = await fs.readFile(file.absolutePath);
		if (kind === "markdown") {
			markdownContents.set(normalizedRelative, bytes.toString("utf8"));
		}
		items.push({
			relativePath: normalizedRelative,
			kind,
			size: file.size,
			hash: await contentHash(bytes),
			gitState: tracked.has(normalizeAuthorityPath(file.repoRelativePath))
				? "tracked"
				: "untracked",
			readOnly: (file.mode & 0o200) === 0,
			executable: (file.mode & 0o111) !== 0,
		});
	}
	const includedPaths = new Set(items.map((item) => item.relativePath));
	const scannedPaths = new Set(
		scanned.files.map((file) => normalizeAuthorityPath(file.relativePath)),
	);
	for (const [markdownPath, markdown] of markdownContents) {
		const markdownDirectory = path.posix.dirname(markdownPath);
		for (const reference of extractLocalMarkdownReferences(markdown)) {
			const resolved = normalizeAuthorityPath(
				path.posix.normalize(path.posix.join(markdownDirectory, reference)),
			);
			if (includedPaths.has(resolved)) continue;
			exclusions.push(
				exclusion(
					resolved || reference,
					scannedPaths.has(resolved)
						? "unsupported-reference"
						: "missing-reference",
					true,
				),
			);
		}
	}
	const manifest = await buildAuthorityManifest({
		items,
		exclusions: uniqueExclusions(exclusions),
	});
	const workingTree = parseStatus(
		await runGit(repoRoot, [
			"status",
			"--porcelain=v2",
			"-z",
			"--untracked-files=all",
			"--",
			pathspec,
		]),
	);
	const identity = await repositoryIdentity(repoRoot);
	const previewFingerprint = await contentHash(
		JSON.stringify({
			repoRoot,
			relativePath,
			manifestHash: manifest.manifestHash,
			workingTree,
			nestedAuthorityRoots: nestedAuthorityRoots.map((root) =>
				toGitPath(path.relative(repoRoot, root)),
			),
		}),
	);
	return {
		sourcePath: selectedPath,
		repoRoot,
		...identity,
		relativePath,
		manifest,
		trackedFileCount: items.filter((item) => item.gitState === "tracked")
			.length,
		workingTreeChanges: workingTree.slice(0, MAX_WORKING_TREE_CHANGES),
		workingTreeChangesTruncated: workingTree.length > MAX_WORKING_TREE_CHANGES,
		previewFingerprint,
		confirmationBlocked:
			manifest.summary.markdownCount === 0 ||
			manifest.summary.blockingExclusionCount > 0,
	};
}

export async function inspectGitDestination(
	input: GitDestinationInspectionInput,
	runGit: ReadOnlyGitRunner = runReadOnlyGit,
): Promise<GitDestinationInspection> {
	const selectedPath = normalizeAbsolute(input.repositoryPath);
	const reportedRoot = (
		await runGit(selectedPath, ["rev-parse", "--show-toplevel"])
	).trim();
	const repoRoot = await fs.realpath(normalizeAbsolute(reportedRoot));
	const relativePath = normalizeAuthorityPath(input.relativePath);
	if (
		!relativePath ||
		relativePath.split("/").some((segment) => segment === "..")
	) {
		throw new Error("Choose a destination folder inside the repository");
	}
	const destinationPath = path.resolve(repoRoot, relativePath);
	if (!isWithin(destinationPath, repoRoot) || destinationPath === repoRoot) {
		throw new Error("Choose a destination folder inside the repository");
	}
	let collision: GitDestinationInspection["collision"] = "empty";
	const destinationStat = await fs.lstat(destinationPath).catch(() => null);
	if (destinationStat) {
		collision =
			destinationStat.isDirectory() &&
			(await fs.readdir(destinationPath)).length === 0
				? "empty"
				: "occupied";
	}
	const workingTree = parseStatus(
		await runGit(repoRoot, [
			"status",
			"--porcelain=v2",
			"-z",
			"--untracked-files=all",
		]),
	);
	const identity = await repositoryIdentity(repoRoot);
	const previewFingerprint = await contentHash(
		JSON.stringify({ repoRoot, relativePath, collision, workingTree }),
	);
	return {
		repoRoot,
		...identity,
		destinationPath,
		relativePath,
		collision,
		destinationExists: destinationStat !== null,
		workingTreeChanges: workingTree.slice(0, MAX_WORKING_TREE_CHANGES),
		workingTreeChangesTruncated: workingTree.length > MAX_WORKING_TREE_CHANGES,
		previewFingerprint,
	};
}
