import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { contentHash, type FileSystem, type LocalFile } from "./fs.js";

const MD_EXTENSIONS = new Set(["md", "markdown", "mdown"]);

export function createNodeFileSystem(): FileSystem {
	return {
		async readFile(path) {
			return readFileSync(path, "utf-8");
		},
		async writeFile(path, content) {
			writeFileSync(path, content);
		},
		async deleteFile(path) {
			unlinkSync(path);
		},
		async readFileOrNull(path) {
			return existsSync(path) ? readFileSync(path, "utf-8") : null;
		},
		async ensureDir(path) {
			mkdirSync(path, { recursive: true });
		},
		async listMarkdownFiles(dir) {
			const results: LocalFile[] = [];
			await walk(dir, dir, results);
			return results;
		},
	};
}

async function walk(
	root: string,
	dir: string,
	out: LocalFile[],
): Promise<void> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			await walk(root, full, out);
		} else {
			const ext = entry.name.split(".").pop()?.toLowerCase();
			if (ext && MD_EXTENSIONS.has(ext)) {
				const content = readFileSync(full, "utf-8");
				out.push({
					relativePath: relative(root, full),
					content,
					hash: await contentHash(content),
				});
			}
		}
	}
}
