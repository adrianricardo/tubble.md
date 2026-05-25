import { Sidebar as SharedSidebar } from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import { useState } from "react";
import { loadPath } from "../store/actions";
import {
	currentPathStore,
	filesLoadedStore,
	filesStore,
	pendingPathStore,
} from "../store/state";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function Sidebar({
	url,
	workspaceId,
	workspaceName,
	onSwitch,
	onDisconnect,
}: {
	url: string;
	workspaceId: string;
	workspaceName: string;
	onSwitch: (id: string) => void;
	onDisconnect: () => void;
}) {
	const files = useStoreValue(filesStore);
	const filesLoaded = useStoreValue(filesLoadedStore);
	const currentPath = useStoreValue(currentPathStore);
	const pendingPath = useStoreValue(pendingPathStore);
	const [sortMode, setSortMode] = useState<"alpha" | "recent">("recent");

	return (
		<SharedSidebar
			files={files.map((file) => ({
				path: file.path,
				modifiedAt: file.updatedAt,
			}))}
			currentPath={currentPath ?? null}
			pendingPath={pendingPath}
			sortMode={sortMode}
			header={
				<WorkspaceSwitcher
					url={url}
					currentWorkspaceId={workspaceId}
					currentWorkspaceName={workspaceName}
					onSelect={onSwitch}
					onDisconnect={onDisconnect}
				/>
			}
			onSortModeChange={setSortMode}
			onSelectFile={(path) => void loadPath(path)}
			emptyState={
				filesLoaded ? (
					<p className="px-2.5 py-2 text-xs text-muted-foreground">
						No files yet. Use the + button to create one.
					</p>
				) : null
			}
		/>
	);
}
