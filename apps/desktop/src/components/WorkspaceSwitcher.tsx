import { WorkspaceSwitcherMenu } from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteCloudLine from "~icons/mingcute/cloud-line";
import {
	activateCloudContent,
	openWorkspace,
	setWorkspaceSwitcherOpen,
} from "../store/actions";
import {
	recentWorkspacesStore,
	switcherOpenStore,
	workspacePathStore,
} from "../store/state";

function folderName(path: string): string {
	return path.split("/").pop() ?? path.split("\\").pop() ?? path;
}

export function WorkspaceSwitcher({
	cloudAvailable,
}: {
	cloudAvailable: boolean;
}) {
	const workspacePath = useStoreValue(workspacePathStore);
	const recentWorkspaces = useStoreValue(recentWorkspacesStore);
	const open = useStoreValue(switcherOpenStore);
	if (!workspacePath) return null;
	const workspaceName = folderName(workspacePath);
	const others = recentWorkspaces.filter((p) => p !== workspacePath);

	return (
		<WorkspaceSwitcherMenu
			label={workspaceName}
			title={workspacePath}
			open={open}
			onOpenChange={setWorkspaceSwitcherOpen}
		>
			<WorkspaceSwitcherMenu.Item selected title={workspacePath}>
				<span className="truncate">{workspaceName}</span>
			</WorkspaceSwitcherMenu.Item>
			{others.map((path) => (
				<WorkspaceSwitcherMenu.Item
					key={path}
					title={path}
					onClick={() => void openWorkspace(path)}
				>
					<span className="truncate">{folderName(path)}</span>
				</WorkspaceSwitcherMenu.Item>
			))}
			<WorkspaceSwitcherMenu.Item
				icon={<MingcuteAddLine className="size-3 shrink-0" />}
				onClick={() => void openWorkspace()}
			>
				Add folder...
			</WorkspaceSwitcherMenu.Item>
			{cloudAvailable ? (
				<>
					<WorkspaceSwitcherMenu.Separator />
					<WorkspaceSwitcherMenu.Item
						icon={<MingcuteCloudLine className="size-3 shrink-0" />}
						onClick={activateCloudContent}
					>
						Hubble Cloud
					</WorkspaceSwitcherMenu.Item>
				</>
			) : null}
		</WorkspaceSwitcherMenu>
	);
}
