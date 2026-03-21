import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import MingcuteAzSortAscendingLettersLine from "~icons/mingcute/az-sort-ascending-letters-line";
import MingcuteSortDescendingLine from "~icons/mingcute/sort-descending-line";
import { cn } from "@/lib/utils";
import { loadPath } from "../store";
import { type SortMode, workspaceStore } from "../workspaceStore";
import { Button } from "./ui/button";
import { useSidebarKeyboardNav } from "./useSidebarKeyboardNav";

type FileEntry = {
	path: string;
	modified_at: number;
};

export function Sidebar({
	workspacePath,
	sortMode,
	currentFilePath,
}: {
	workspacePath: string;
	sortMode: SortMode;
	currentFilePath: string | null;
}) {
	const [files, setFiles] = useState<FileEntry[]>([]);
	const workspaceName = workspacePath.split("/").pop() ?? workspacePath;
	const navRef = useRef<HTMLElement>(null);

	const refresh = useCallback(async () => {
		try {
			const entries = await invoke<FileEntry[]>("list_directory", {
				path: workspacePath,
			});
			setFiles(entries);
		} catch {
			setFiles([]);
		}
	}, [workspacePath]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const toggleSort = () => {
		workspaceStore.set((s) => ({
			...s,
			sortMode: s.sortMode === "alpha" ? "recent" : "alpha",
		}));
	};

	const sorted = [...files].sort((a, b) => {
		if (sortMode === "recent") return b.modified_at - a.modified_at;
		return a.path.localeCompare(b.path);
	});

	const selectFile = useCallback((f: FileEntry) => void loadPath(f.path), []);

	const { focusedIndex, setFocusedIndex, onKeyDown } =
		useSidebarKeyboardNav({
			items: sorted,
			onSelect: selectFile,
			navRef,
		});

	const relativePath = (absPath: string) => {
		const prefix = workspacePath.endsWith("/")
			? workspacePath
			: `${workspacePath}/`;
		return absPath.startsWith(prefix)
			? absPath.slice(prefix.length)
			: absPath;
	};

	return (
		<aside className="flex w-[220px] shrink-0 flex-col overflow-hidden border-e border-sidebar-border bg-sidebar">
			<div className="flex items-center justify-between border-b border-sidebar-border px-2.5 py-1.5">
				<span
					className="truncate text-xs font-semibold text-sidebar-foreground"
					title={workspacePath}
				>
					{workspaceName}
				</span>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={toggleSort}
					aria-label={`Sort by ${sortMode === "alpha" ? "recent" : "name"}`}
					title={sortMode === "alpha" ? "Sort by recent" : "Sort by name"}
				>
					{sortMode === "alpha" ? (
						<MingcuteAzSortAscendingLettersLine className="size-3.5" />
					) : (
						<MingcuteSortDescendingLine className="size-3.5" />
					)}
				</Button>
			</div>
			<nav
				ref={navRef}
				className="flex-1 overflow-y-auto py-1 outline-none"
				tabIndex={0}
				onKeyDown={onKeyDown}
				data-sidebar-nav
			>
				{sorted.map((f, index) => {
					const rel = relativePath(f.path);
					const isActive = f.path === currentFilePath;
					const isFocused = focusedIndex === index;
					return (
						<button
							key={f.path}
							type="button"
							data-sidebar-index={index}
							aria-selected={isFocused}
							className={cn(
								"block w-full truncate border-none bg-transparent px-2.5 py-1 text-start text-[13px] text-sidebar-foreground hover:bg-sidebar-accent",
								isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
								isFocused && "bg-sidebar-accent",
							)}
						onClick={() => {
							void loadPath(f.path);
							// Keep focus on nav so arrow keys continue working
							requestAnimationFrame(() => navRef.current?.focus());
						}}
							onPointerEnter={() => setFocusedIndex(index)}
							onPointerLeave={() => setFocusedIndex(null)}
							title={rel}
						>
							{rel}
						</button>
					);
				})}
			</nav>
		</aside>
	);
}
