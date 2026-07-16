import { api } from "@hubble.md/sync-backend";
import type { Doc } from "@hubble.md/sync-backend/types";
import { Button, Input, Modal, WorkspaceSwitcherMenu } from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import { useMutation, useQuery } from "convex/react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteFolderLine from "~icons/mingcute/folder-line";
import { resolveCloudContext, type SharedFolderContext } from "../cloudContext";
import {
	openWorkspace,
	setCloudContext,
	setSelectedSpace,
	setWorkspaceSwitcherOpen,
} from "../store/actions";
import type { CloudContext } from "../store/persistence";
import {
	cloudContextStore,
	recentWorkspacesStore,
	selectedWorkspaceId,
	switcherOpenStore,
} from "../store/state";

function folderName(path: string): string {
	return path.split("/").pop() ?? path.split("\\").pop() ?? path;
}

// Resolves the cloud space the desktop app is scoped to: the persisted pick if
// it still exists, else the auto-provisioned personal space, else any member
// space. Must render inside <Authenticated> — listWorkspaces is member-gated.
export function useSelectedSpace(): {
	spaces: Doc<"workspaces">[] | undefined;
	space: Doc<"workspaces"> | undefined;
} {
	const spaces = useQuery(api.sync.listWorkspaces, {});
	const context = useStoreValue(cloudContextStore) ?? null;
	const selectedSpaceId = selectedWorkspaceId(context);
	const space =
		spaces?.find((candidate) => candidate._id === selectedSpaceId) ??
		spaces?.find((candidate) => candidate.personal) ??
		spaces?.[0];
	return { spaces, space };
}

export function useSelectedCloudContext(): {
	spaces: Doc<"workspaces">[] | undefined;
	sharedFolders: SharedFolderContext[] | undefined;
	context: CloudContext | null;
} {
	const spaces = useQuery(api.sync.listWorkspaces, {});
	const sharedWithMe = useQuery(api.documents.listSharedWithMe, {});
	const persisted = useStoreValue(cloudContextStore) ?? null;
	const sharedFolders = useMemo(
		() =>
			sharedWithMe?.folders.map((folder) => ({
				folderId: folder.folderId,
				name: folder.name,
				workspaceId: folder.workspaceId,
				workspaceName: folder.workspaceName,
				role: folder.role,
			})),
		[sharedWithMe?.folders],
	);
	const context = useMemo(
		() =>
			spaces && sharedFolders
				? resolveCloudContext(persisted, spaces, sharedFolders)
				: null,
		[persisted, sharedFolders, spaces],
	);
	return { spaces, sharedFolders, context };
}

// Signed-in sidebar header: switch between cloud spaces, mirroring the web
// app's WorkspaceSwitcher so both platforms answer "which space am I in?" the
// same way. Local folders have their own switcher in the "On this computer"
// section.
export function SpaceSwitcher() {
	const { spaces, space } = useSelectedSpace();
	const [open, setOpen] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [spaceName, setSpaceName] = useState("");
	const [creating, setCreating] = useState(false);
	const createSpaceInputId = useId();
	const createWorkspace = useMutation(api.sync.createWorkspace);

	if (spaces === undefined) {
		return (
			<span className="truncate text-xs font-semibold text-sidebar-foreground [padding-inline-start:0.5rem]">
				Loading space…
			</span>
		);
	}

	// Guest-only accounts can have zero memberships; keep the switcher usable
	// so "Create space" stays reachable.
	const label = space?.name ?? "No space yet";

	const createSpace = async (event: React.FormEvent) => {
		event.preventDefault();
		const name = spaceName.trim();
		if (!name) return;
		setCreating(true);
		try {
			const id = await createWorkspace({ name });
			setSelectedSpace(id);
			setCreateOpen(false);
			setSpaceName("");
			toast.success(`Space "${name}" created`);
		} catch (error) {
			toast.error("Failed to create space", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setCreating(false);
		}
	};

	return (
		<>
			<WorkspaceSwitcherMenu
				label={label}
				title={label}
				open={open}
				onOpenChange={setOpen}
			>
				{spaces.map((candidate) => (
					<WorkspaceSwitcherMenu.Item
						key={candidate._id}
						selected={candidate._id === space?._id}
						onClick={() => {
							setOpen(false);
							if (candidate._id !== space?._id) setSelectedSpace(candidate._id);
						}}
					>
						<span className="truncate">{candidate.name}</span>
					</WorkspaceSwitcherMenu.Item>
				))}
				<WorkspaceSwitcherMenu.Separator />
				<WorkspaceSwitcherMenu.Item
					icon={<MingcuteAddLine className="size-3 shrink-0" />}
					onClick={() => {
						setOpen(false);
						setSpaceName("");
						setCreateOpen(true);
					}}
				>
					Create space
				</WorkspaceSwitcherMenu.Item>
			</WorkspaceSwitcherMenu>
			<Modal
				open={createOpen}
				onOpenChange={setCreateOpen}
				title="Create space"
			>
				<form onSubmit={createSpace} className="flex flex-col gap-3">
					<label
						htmlFor={createSpaceInputId}
						className="flex flex-col gap-1.5 text-xs font-medium text-foreground"
					>
						<span>Space name</span>
						<Input
							id={createSpaceInputId}
							value={spaceName}
							onChange={(event) => setSpaceName(event.currentTarget.value)}
							onFocus={(event) => event.currentTarget.select()}
							autoFocus
						/>
					</label>
					<div className="flex justify-end gap-2 [padding-block-start:0.25rem]">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setCreateOpen(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!spaceName.trim() || creating}>
							{creating ? "Creating..." : "Create"}
						</Button>
					</div>
				</form>
			</Modal>
		</>
	);
}

export function CloudContextSwitcher({
	spaces,
	sharedFolders,
	context,
}: {
	spaces: Doc<"workspaces">[];
	sharedFolders: SharedFolderContext[];
	context: CloudContext | null;
}) {
	const open = useStoreValue(switcherOpenStore);
	const recentWorkspaces = useStoreValue(recentWorkspacesStore);
	const selectedSpace =
		context?.kind === "workspace"
			? spaces.find((space) => space._id === context.workspaceId)
			: undefined;
	const selectedFolder =
		context?.kind === "shared-folder"
			? sharedFolders.find((folder) => folder.folderId === context.folderId)
			: undefined;
	const label = selectedSpace?.name ?? selectedFolder?.name ?? "Choose context";

	return (
		<WorkspaceSwitcherMenu
			label={label}
			title={label}
			open={open}
			onOpenChange={setWorkspaceSwitcherOpen}
		>
			{spaces.map((space) => (
				<WorkspaceSwitcherMenu.Item
					key={space._id}
					selected={
						context?.kind === "workspace" && context.workspaceId === space._id
					}
					onClick={() => {
						setWorkspaceSwitcherOpen(false);
						setCloudContext({ kind: "workspace", workspaceId: space._id });
					}}
				>
					<span className="truncate">{space.name}</span>
				</WorkspaceSwitcherMenu.Item>
			))}
			{spaces.length > 0 && sharedFolders.length > 0 ? (
				<WorkspaceSwitcherMenu.Separator />
			) : null}
			{sharedFolders.length > 0 ? (
				<span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground [padding-block:0.25rem] [padding-inline:0.5rem]">
					Shared with me
				</span>
			) : null}
			{sharedFolders.map((folder) => (
				<WorkspaceSwitcherMenu.Item
					key={folder.folderId}
					icon={<MingcuteFolderLine className="size-3 shrink-0" />}
					selected={
						context?.kind === "shared-folder" &&
						context.folderId === folder.folderId
					}
					onClick={() => {
						setWorkspaceSwitcherOpen(false);
						setCloudContext({
							kind: "shared-folder",
							folderId: folder.folderId,
							workspaceId: folder.workspaceId,
						});
					}}
				>
					<span className="min-w-0">
						<span className="block truncate">{folder.name}</span>
						<span className="block truncate text-[10px] text-muted-foreground">
							{folder.workspaceName} · {folder.role}
						</span>
					</span>
				</WorkspaceSwitcherMenu.Item>
			))}
			<WorkspaceSwitcherMenu.Separator />
			<span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground [padding-block:0.25rem] [padding-inline:0.5rem]">
				Git folders
			</span>
			{recentWorkspaces.map((path) => (
				<WorkspaceSwitcherMenu.Item
					key={path}
					icon={<MingcuteFolderLine className="size-3 shrink-0" />}
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
				Open Git folder…
			</WorkspaceSwitcherMenu.Item>
		</WorkspaceSwitcherMenu>
	);
}
