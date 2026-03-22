import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { contentHash } from "./config";

export type LocalFile = {
	relativePath: string;
	absolutePath: string;
	content: string;
	hash: string;
};

const MD_EXTENSIONS = new Set(["md", "markdown", "mdown"]);

/** Recursively collect markdown files in a workspace, skipping hidden dirs */
export function scanWorkspace(workspacePath: string): LocalFile[] {
	const results: LocalFile[] = [];
	walk(workspacePath, workspacePath, results);
	return results;
}

function walk(root: string, dir: string, out: LocalFile[]): void {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(root, full, out);
		} else {
			const ext = entry.name.split(".").pop()?.toLowerCase();
			if (ext && MD_EXTENSIONS.has(ext)) {
				const content = readFileSync(full, "utf-8");
				out.push({
					relativePath: relative(root, full),
					absolutePath: full,
					content,
					hash: contentHash(content),
				});
			}
		}
	}
}
