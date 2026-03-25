import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import MingcuteAzSortAscendingLettersLine from "~icons/mingcute/az-sort-ascending-letters-line";
import MingcuteSortDescendingLine from "~icons/mingcute/sort-descending-line";
import { SIDEBAR_NAV_ATTR } from "../selectors";
import { loadPath } from "../store";
import {
	type FileEntry,
	type SortMode,
	workspaceStore,
} from "../workspaceStore";
import { Button } from "./ui/button";
import { useSidebarKeyboardNav } from "./useSidebarKeyboardNav";

export function Sidebar({
	workspacePath,
	files,
	sortMode,
	currentFilePath,
}: {
	workspacePath: string;
	files: FileEntry[];
	sortMode: SortMode;
	currentFilePath: string | null;
}) {
	const workspaceName = workspacePath.split("/").pop() ?? workspacePath;
	const navRef = useRef<HTMLDivElement>(null);

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

	const { focusedIndex, setFocusedIndex, onKeyDown } = useSidebarKeyboardNav({
		items: sorted,
		onSelect: selectFile,
		navRef,
	});

	const relativePath = (absPath: string) => {
		const prefix = workspacePath.endsWith("/")
			? workspacePath
			: `${workspacePath}/`;
		return absPath.startsWith(prefix) ? absPath.slice(prefix.length) : absPath;
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
			<div
				ref={navRef}
				role="listbox"
				className="flex-1 overflow-y-auto py-1 outline-none"
				tabIndex={0}
				onKeyDown={onKeyDown}
				{...{ [SIDEBAR_NAV_ATTR]: true }}
			>
				{sorted.map((f, index) => {
					const rel = relativePath(f.path);
					const isActive = f.path === currentFilePath;
					const isFocused = focusedIndex === index;
					return (
						<button
							key={f.path}
							type="button"
							role="option"
							data-sidebar-index={index}
							aria-selected={isFocused}
							className={cn(
								"block w-full truncate border-none bg-transparent px-2.5 py-1 text-start text-[13px] text-sidebar-foreground hover:bg-sidebar-accent",
								isActive &&
									"bg-sidebar-accent text-sidebar-accent-foreground font-medium",
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
			</div>
		</aside>
	);
}
