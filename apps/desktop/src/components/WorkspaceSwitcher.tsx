import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteCheckLine from "~icons/mingcute/check-line";
import MingcuteUnfoldVerticalLine from "~icons/mingcute/unfold-vertical-line";
import { openWorkspace, pickAndOpenWorkspace } from "../workspaceStore";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

function folderName(path: string): string {
	return path.split("/").pop() ?? path.split("\\").pop() ?? path;
}

export function WorkspaceSwitcher({
	workspacePath,
	recentWorkspaces,
}: {
	workspacePath: string;
	recentWorkspaces: string[];
}) {
	const workspaceName = folderName(workspacePath);
	// Exclude current from recent list
	const others = recentWorkspaces.filter((p) => p !== workspacePath);

	return (
		<Popover>
			<PopoverTrigger
				className="flex min-w-0 cursor-pointer items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-sidebar-accent"
				title={workspacePath}
			>
				<span className="truncate text-xs font-semibold text-sidebar-foreground">
					{workspaceName}
				</span>
				<MingcuteUnfoldVerticalLine className="size-3 shrink-0 text-muted-foreground" />
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="start"
				sideOffset={4}
				className="w-56 p-1"
			>
				{/* Current workspace */}
				<div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[11px] font-medium text-sidebar-foreground">
					<MingcuteCheckLine className="size-3 shrink-0 text-brand" />
					<span className="truncate" title={workspacePath}>
						{workspaceName}
					</span>
				</div>

				{/* Recent workspaces */}
				{others.map((path) => (
					<button
						key={path}
						type="button"
						className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-[11px] text-sidebar-foreground hover:bg-sidebar-accent"
						title={path}
						onClick={() => void openWorkspace(path)}
					>
						<span className="size-3 shrink-0" />
						<span className="truncate">{folderName(path)}</span>
					</button>
				))}

				{/* New workspace */}
				<button
					type="button"
					className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-[11px] text-sidebar-foreground hover:bg-sidebar-accent"
					onClick={() => void pickAndOpenWorkspace(true)}
				>
					<MingcuteAddLine className="size-3 shrink-0" />
					New workspace…
				</button>
			</PopoverContent>
		</Popover>
	);
}
