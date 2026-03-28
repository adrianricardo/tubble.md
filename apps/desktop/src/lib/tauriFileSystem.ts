import type { FileSystem, LocalAsset, LocalFile } from "@hubble.md/sync";
import { contentHash } from "@hubble.md/sync";
import { invoke } from "@tauri-apps/api/core";

type FileEntry = { path: string; modified_at: number };

const MD_EXTENSIONS = new Set(["md", "markdown", "mdown"]);
const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"bmp",
	"svg",
	"webp",
]);
const MAX_ASSET_SIZE = 10 * 1024 * 1024; // 10 MB

function relativePath(root: string, abs: string): string {
	const prefix = root.endsWith("/") ? root : `${root}/`;
	return abs.startsWith(prefix) ? abs.slice(prefix.length) : abs;
}

function extension(path: string): string {
	const dot = path.lastIndexOf(".");
	return dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
}

export function createTauriFileSystem(): FileSystem {
	return {
		async readFile(path) {
			return invoke<string>("read_file_text", { path });
		},
		async writeFile(path, content) {
			await invoke("write_file_text", { path, content });
		},
		async deleteFile(path) {
			await invoke("delete_file", { path });
		},
		async readFileOrNull(path) {
			try {
				return await invoke<string>("read_file_text", { path });
			} catch {
				return null;
			}
		},
		async ensureDir(path) {
			await invoke("ensure_directory", { path });
		},
		async listMarkdownFiles(dir) {
			const entries = await invoke<FileEntry[]>("list_directory", {
				path: dir,
			});
			const results: LocalFile[] = [];
			for (const entry of entries) {
				if (!MD_EXTENSIONS.has(extension(entry.path))) continue;
				const content = await invoke<string>("read_file_text", {
					path: entry.path,
				});
				results.push({
					relativePath: relativePath(dir, entry.path),
					content,
					hash: await contentHash(content),
				});
			}
			return results;
		},
		async readBinaryFile(path) {
			const bytes = await invoke<number[]>("read_binary_file", { path });
			return new Uint8Array(bytes);
		},
		async writeBinaryFile(path, data) {
			await invoke("write_binary_file", {
				path,
				bytes: Array.from(data),
			});
		},
		async listAssetFiles(dir) {
			const entries = await invoke<FileEntry[]>("list_directory", {
				path: dir,
			});
			const results: LocalAsset[] = [];
			for (const entry of entries) {
				const ext = extension(entry.path);
				if (!IMAGE_EXTENSIONS.has(ext)) continue;
				try {
					const bytes = await invoke<number[]>("read_binary_file", {
						path: entry.path,
					});
					if (bytes.length > MAX_ASSET_SIZE) continue;
					results.push({
						relativePath: relativePath(dir, entry.path),
						hash: await contentHash(new Uint8Array(bytes)),
					});
				} catch {}
			}
			return results;
		},
	};
}
