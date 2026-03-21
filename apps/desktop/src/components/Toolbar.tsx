import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteLayoutLeftLine from "~icons/mingcute/layout-left-line";
import { loadPath } from "../store";
import { workspaceStore } from "../workspaceStore";
import { Button } from "./ui/button";

export function Toolbar({
	hasWorkspace,
	sidebarOpen,
}: {
	hasWorkspace: boolean;
	sidebarOpen: boolean;
}) {
	if (!hasWorkspace) return null;

	const toggleSidebar = () => {
		workspaceStore.set((s) => ({ ...s, sidebarOpen: !s.sidebarOpen }));
	};

	const addFile = async () => {
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
		await loadPath(finalPath);
	};

	return (
		<div
			className="flex items-center gap-1 border-b border-border px-2 py-1"
			data-tauri-drag-region
		>
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={toggleSidebar}
				aria-label="Toggle sidebar"
				className={sidebarOpen ? "text-brand" : ""}
			>
				<MingcuteLayoutLeftLine className="size-4" />
			</Button>
			<div className="flex-1" data-tauri-drag-region />
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={() => void addFile()}
				aria-label="New file"
			>
				<MingcuteAddLine className="size-4" />
			</Button>
		</div>
	);
}
