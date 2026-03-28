import type { InitFileSystem } from "@hubble.md/sync";
import { invoke } from "@tauri-apps/api/core";

export function createTauriFileSystem(): InitFileSystem {
	return {
		async readFile(path) {
			return invoke<string>("read_file_text", { path });
		},
		async writeFile(path, content) {
			await invoke("write_file_text", { path, content });
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
	};
}
