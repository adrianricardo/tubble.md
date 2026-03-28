import { Select } from "@base-ui/react/select";
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import MingcuteAzSortAscendingLettersLine from "~icons/mingcute/az-sort-ascending-letters-line";
import MingcuteCheckLine from "~icons/mingcute/check-line";
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
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function Sidebar({
	workspacePath,
	files,
	sortMode,
	currentFilePath,
	recentWorkspaces,
}: {
	workspacePath: string;
	files: FileEntry[];
	sortMode: SortMode;
	currentFilePath: string | null;
	recentWorkspaces: string[];
}) {
	const navRef = useRef<HTMLDivElement>(null);

	const setSortMode = (mode: SortMode) => {
		workspaceStore.set((s) => ({ ...s, sortMode: mode }));
	};

	const sorted = [...files].sort((a, b) => {
		if (sortMode === "recent") return b.modified_at - a.modified_at;
		return a.path.localeCompare(b.path);
	});

	const selectFile = useCallback((f: FileEntry) => void loadPath(f.path), []);

	const activeIndex = sorted.findIndex((f) => f.path === currentFilePath);
	const { focusedIndex, setFocusedIndex, onKeyDown } = useSidebarKeyboardNav({
		items: sorted,
		onSelect: selectFile,
		navRef,
		activeIndex,
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
				<WorkspaceSwitcher
					workspacePath={workspacePath}
					recentWorkspaces={recentWorkspaces}
				/>
				<Select.Root
					value={sortMode}
					onValueChange={(val) => setSortMode(val as SortMode)}
				>
					<Select.Trigger
						render={
							<Button
								variant="ghost"
								size="icon-xs"
								aria-label="Sort by…"
								title="Sort by…"
							/>
						}
					>
						{sortMode === "alpha" ? (
							<MingcuteAzSortAscendingLettersLine className="size-3.5" />
						) : (
							<MingcuteSortDescendingLine className="size-3.5" />
						)}
					</Select.Trigger>
					<Select.Portal>
						<Select.Positioner align="end" side="bottom" sideOffset={4}>
							<Select.Popup className="z-50 w-36 origin-(--transform-origin) rounded-sm border border-border bg-popover p-1 text-[11px] text-popover-foreground shadow-panel inset-shadow-chrome outline-hidden transition-[transform,opacity] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
								<p className="px-2 py-1 text-[10px] font-medium text-muted-foreground">
									Sort by
								</p>
								<SortOption value="alpha" label="Name" />
								<SortOption value="recent" label="Recent" />
							</Select.Popup>
						</Select.Positioner>
					</Select.Portal>
				</Select.Root>
			</div>
			<div
				ref={navRef}
				role="listbox"
				className="flex-1 overflow-y-auto overscroll-contain py-1 outline-none"
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

function SortOption({ value, label }: { value: string; label: string }) {
	return (
		<Select.Item
			value={value}
			className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-start text-[11px] text-foreground outline-hidden select-none data-highlighted:bg-accent"
		>
			<Select.ItemIndicator className="inline-flex" keepMounted>
				<MingcuteCheckLine className="size-3 [[data-selected]_&]:opacity-100 opacity-0" />
			</Select.ItemIndicator>
			<Select.ItemText>{label}</Select.ItemText>
		</Select.Item>
	);
}
