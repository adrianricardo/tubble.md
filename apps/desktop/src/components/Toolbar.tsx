import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteLayoutLeftLine from "~icons/mingcute/layout-left-line";
import { loadPath } from "../store";
import { workspaceStore } from "../workspaceStore";
import { Button } from "./ui/button";

export function Toolbar({
	hasWorkspace,
	sidebarOpen,
	scrollContainer,
}: {
	hasWorkspace: boolean;
	sidebarOpen: boolean;
	scrollContainer: HTMLDivElement | null;
}) {
	const [showBorder, setShowBorder] = useState(false);

	useEffect(() => {
		if (!scrollContainer) {
			setShowBorder(false);
			return;
		}
		const update = () => setShowBorder(scrollContainer.scrollTop > 0);
		update();
		scrollContainer.addEventListener("scroll", update, { passive: true });
		return () => scrollContainer.removeEventListener("scroll", update);
	}, [scrollContainer]);

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
			className={`flex items-center gap-1 px-2 py-1 ${sidebarOpen ? "border-b border-border" : showBorder ? "[border-block-end:1px_dashed_var(--border)]" : "border-transparent"}`}
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
