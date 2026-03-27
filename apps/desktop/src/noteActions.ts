import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { loadPath } from "./store";
import { refreshFiles, workspaceStore } from "./workspaceStore";

export async function createNote() {
	const ws = workspaceStore.get().workspacePath;
	if (!ws) return;
	const filePath = await save({
		defaultPath: ws,
		title: "New Markdown file",
		filters: [{ name: "Markdown", extensions: ["md"] }],
	});
	if (typeof filePath !== "string") return;
	const finalPath = filePath.endsWith(".md") ? filePath : `${filePath}.md`;
	await invoke("write_file_text", { path: finalPath, content: "" });
	await refreshFiles();
	await loadPath(finalPath);
}
