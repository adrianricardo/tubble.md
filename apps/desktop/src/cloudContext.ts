import type { CloudContext } from "./store/persistence";

export type SharedFolderContext = {
	folderId: string;
	name: string;
	workspaceId: string;
	workspaceName: string;
	role: "owner" | "editor" | "commenter" | "viewer";
};

export function resolveCloudContext(
	persisted: CloudContext | null,
	workspaces: readonly { _id: string; personal?: boolean }[],
	sharedFolders: readonly Pick<
		SharedFolderContext,
		"folderId" | "workspaceId"
	>[],
): CloudContext | null {
	if (persisted?.kind === "workspace") {
		if (
			workspaces.some((workspace) => workspace._id === persisted.workspaceId)
		) {
			return persisted;
		}
	}
	if (persisted?.kind === "shared-folder") {
		const folder = sharedFolders.find(
			(candidate) => candidate.folderId === persisted.folderId,
		);
		if (folder) {
			return {
				kind: "shared-folder",
				folderId: folder.folderId,
				workspaceId: folder.workspaceId,
			};
		}
	}
	const workspace =
		workspaces.find((candidate) => candidate.personal) ?? workspaces[0];
	if (workspace) return { kind: "workspace", workspaceId: workspace._id };
	const sharedFolder = sharedFolders[0];
	return sharedFolder
		? {
				kind: "shared-folder",
				folderId: sharedFolder.folderId,
				workspaceId: sharedFolder.workspaceId,
			}
		: null;
}
