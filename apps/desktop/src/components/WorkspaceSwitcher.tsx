import { Menu } from "@base-ui/react/menu";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteCheckLine from "~icons/mingcute/check-line";
import MingcuteSelectorVerticalLine from "~icons/mingcute/selector-vertical-line";
import { openWorkspace, pickAndOpenWorkspace } from "../workspaceStore";

function folderName(path: string): string {
	return path.split("/").pop() ?? path.split("\\").pop() ?? path;
}

function MenuItem(props: Menu.Item.Props) {
	return (
		<Menu.Item
			{...props}
			className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-start text-[11px] text-sidebar-foreground outline-hidden select-none data-highlighted:bg-sidebar-accent"
		/>
	);
}

export function WorkspaceSwitcher({
	workspacePath,
	recentWorkspaces,
}: {
	workspacePath: string;
	recentWorkspaces: string[];
}) {
	const workspaceName = folderName(workspacePath);
	const others = recentWorkspaces.filter((p) => p !== workspacePath);

	return (
		<Menu.Root>
			<Menu.Trigger
				className="flex min-w-0 cursor-pointer items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-sidebar-accent"
				title={workspacePath}
			>
				<span className="truncate text-xs font-semibold text-sidebar-foreground">
					{workspaceName}
				</span>
				<MingcuteSelectorVerticalLine className="size-5 shrink-0 text-muted-foreground" />
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner align="start" side="bottom" sideOffset={4}>
					<Menu.Popup className="z-50 w-56 origin-(--transform-origin) rounded-sm border border-border bg-popover p-1 text-[11px] text-popover-foreground shadow-panel inset-shadow-chrome outline-hidden transition-[transform,opacity] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
						{/* Current workspace */}
						<MenuItem title={workspacePath}>
							<MingcuteCheckLine className="size-3 shrink-0 text-brand" />
							<span className="truncate">{workspaceName}</span>
						</MenuItem>

						{/* Recent workspaces */}
						{others.map((path) => (
							<MenuItem
								key={path}
								title={path}
								onClick={() => void openWorkspace(path)}
							>
								<span className="size-3 shrink-0" />
								<span className="truncate">{folderName(path)}</span>
							</MenuItem>
						))}

						{/* New workspace */}
						<MenuItem onClick={() => void pickAndOpenWorkspace(true)}>
							<MingcuteAddLine className="size-3 shrink-0" />
							New workspace…
						</MenuItem>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	);
}
