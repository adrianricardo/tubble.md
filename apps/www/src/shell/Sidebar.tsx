import { FoldersSection, LiveDocumentsSection } from "@hubble.md/cloud-ui";
import { Sidebar as SharedSidebar } from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import { useState } from "react";
import {
	currentPathStore,
	filesLoadedStore,
	filesStore,
	pendingPathStore,
} from "../store/state";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function Sidebar({
	url,
	authToken,
	workspaceId,
	workspaceName,
	selectedDocumentId,
	onSelectFile,
	onSelectDocument,
	onSwitch,
	onDisconnect,
}: {
	url: string;
	authToken?: string;
	workspaceId: string;
	workspaceName: string;
	selectedDocumentId: string | null;
	onSelectFile: (path: string) => void;
	onSelectDocument: (documentId: string) => void;
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
			storageScope={workspaceId}
			header={
				<WorkspaceSwitcher
					url={url}
					authToken={authToken}
					currentWorkspaceId={workspaceId}
					currentWorkspaceName={workspaceName}
					onSelect={onSwitch}
					onDisconnect={onDisconnect}
				/>
			}
			footer={
				<>
					<FoldersSection
						workspaceId={workspaceId}
						selectedDocumentId={selectedDocumentId}
						onSelectDocument={onSelectDocument}
						shareLinkOrigin={window.location.origin}
					/>
					<LiveDocumentsSection
						workspaceId={workspaceId}
						selectedDocumentId={selectedDocumentId}
						onSelectDocument={onSelectDocument}
						shareLinkOrigin={window.location.origin}
					/>
				</>
			}
			onSortModeChange={setSortMode}
			onSelectFile={onSelectFile}
			emptyState={
				filesLoaded ? (
					<p className="text-xs text-muted-foreground [padding-block:0.5rem] [padding-inline:0.625rem]">
						No files yet. Use the + button to create one.
					</p>
				) : null
			}
		/>
	);
}
