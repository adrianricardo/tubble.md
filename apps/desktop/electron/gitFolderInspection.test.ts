import {
	mkdir,
	mkdtemp,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	assertReadOnlyGitArgs,
	inspectGitDestination,
	inspectGitFolder,
	type ReadOnlyGitRunner,
} from "./gitFolderInspection";

const roots: string[] = [];

async function fixture() {
	const root = await realpath(
		await mkdtemp(path.join(os.tmpdir(), "hubble-git-inspection-")),
	);
	roots.push(root);
	await mkdir(path.join(root, ".git", "info"), { recursive: true });
	await writeFile(path.join(root, ".git", "config"), "[core]\n");
	return root;
}

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true })),
	);
});

describe("git folder inspection", () => {
	it("builds a bounded manifest and names every excluded class", async () => {
		const root = await fixture();
		const selected = path.join(root, "notes");
		await mkdir(path.join(selected, "plan.assets"), { recursive: true });
		await mkdir(path.join(selected, "generated"), { recursive: true });
		await mkdir(path.join(selected, "cloud"), { recursive: true });
		await writeFile(
			path.join(selected, "plan.md"),
			"![Hero](plan.assets/hero.png)\n[Missing](missing.png)",
		);
		await writeFile(path.join(selected, "plan.assets", "hero.png"), "image");
		await writeFile(path.join(selected, "ignored.md"), "ignored");
		await writeFile(path.join(selected, "unsupported.txt"), "text");
		await writeFile(path.join(selected, "generated", "bundle.js"), "code");
		await writeFile(path.join(selected, "cloud", "projected.md"), "cloud");
		await symlink("plan.md", path.join(selected, "linked.md"));
		const calls: string[][] = [];
		const runGit: ReadOnlyGitRunner = vi.fn(async (_cwd, args) => {
			calls.push(args);
			switch (args[0]) {
				case "rev-parse":
					return `${root}\n`;
				case "ls-files":
					return "notes/plan.md\0notes/plan.assets/hero.png\0";
				case "check-ignore":
					return "notes/ignored.md\0";
				case "status":
					return "1 .M N... 100644 100644 100644 a b notes/plan.md\0";
				default:
					throw new Error("Unexpected Git command");
			}
		});

		const result = await inspectGitFolder(
			selected,
			[
				{
					id: "placement-1",
					repoRoot: root,
					relativePath: "notes/cloud",
					workspaceId: "workspace-1",
					cloudFolderId: "folder-1",
					formerGitFingerprint: "old",
					projection: null,
					createdAt: 1,
					updatedAt: 1,
				},
			],
			runGit,
		);

		expect(result.manifest.summary).toMatchObject({
			markdownCount: 1,
			assetCount: 1,
			blockingExclusionCount: 2,
		});
		expect(result.manifest.exclusions.map((item) => item.reason)).toEqual(
			expect.arrayContaining([
				"generated",
				"ignored",
				"missing-reference",
				"nested-authority",
				"symlink",
				"unsupported",
			]),
		);
		expect(result.trackedFileCount).toBe(2);
		expect(result.confirmationBlocked).toBe(true);
		expect(result.workingTreeChanges).toEqual([
			{ path: "notes/plan.md", status: "1" },
		]);
		expect(
			calls.every((args) =>
				["rev-parse", "ls-files", "check-ignore", "status"].includes(
					args[0] ?? "",
				),
			),
		).toBe(true);
	});

	it("rejects any Git command outside the fixed read-only allowlist", () => {
		expect(() => assertReadOnlyGitArgs(["commit", "-m", "no"])).toThrow(
			"Git command is not read-only",
		);
	});

	it("names a cloud boundary even when no projected directory exists", async () => {
		const root = await fixture();
		const selected = path.join(root, "notes");
		await mkdir(selected);
		await writeFile(path.join(selected, "plan.md"), "Plan\n");
		const runGit: ReadOnlyGitRunner = vi.fn(async (_cwd, args) => {
			if (args[0] === "rev-parse") return `${root}\n`;
			if (args[0] === "ls-files") return "notes/plan.md\0";
			if (args[0] === "check-ignore" || args[0] === "status") return "";
			throw new Error("Unexpected Git command");
		});

		const result = await inspectGitFolder(
			selected,
			[
				{
					id: "nested-cloud",
					repoRoot: root,
					relativePath: "notes/cloud-project",
					workspaceId: "workspace-1",
					cloudFolderId: "folder-1",
					formerGitFingerprint: "old",
					projection: null,
					createdAt: 1,
					updatedAt: 1,
				},
			],
			runGit,
		);

		expect(result.manifest.exclusions).toContainEqual({
			relativePath: "cloud-project",
			reason: "nested-authority",
			blocking: false,
		});
	});

	it("reports occupied destinations without writing them", async () => {
		const root = await fixture();
		await mkdir(path.join(root, "existing"));
		await writeFile(path.join(root, "existing", "keep.md"), "keep");
		const runGit: ReadOnlyGitRunner = vi.fn(async (_cwd, args) => {
			if (args[0] === "rev-parse") return `${root}\n`;
			if (args[0] === "status") return "";
			throw new Error("Unexpected Git command");
		});

		const result = await inspectGitDestination(
			{ repositoryPath: root, relativePath: "existing" },
			runGit,
		);

		expect(result).toMatchObject({
			repoRoot: root,
			destinationPath: path.join(root, "existing"),
			collision: "occupied",
		});
		expect(await fsPathExists(path.join(root, "existing", "keep.md"))).toBe(
			true,
		);
	});
});

async function fsPathExists(filePath: string): Promise<boolean> {
	try {
		await import("node:fs/promises").then((fs) => fs.access(filePath));
		return true;
	} catch {
		return false;
	}
}
