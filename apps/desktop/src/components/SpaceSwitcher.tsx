import { api } from "@hubble.md/sync-backend";
import type { Doc } from "@hubble.md/sync-backend/types";
import { Button, Input, Modal, WorkspaceSwitcherMenu } from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import { useMutation, useQuery } from "convex/react";
import { useId, useState } from "react";
import { toast } from "sonner";
import MingcuteAddLine from "~icons/mingcute/add-line";
import { setSelectedSpace } from "../store/actions";
import { selectedSpaceIdStore } from "../store/state";

// Resolves the cloud space the desktop app is scoped to: the persisted pick if
// it still exists, else the auto-provisioned personal space, else any member
// space. Must render inside <Authenticated> — listWorkspaces is member-gated.
export function useSelectedSpace(): {
	spaces: Doc<"workspaces">[] | undefined;
	space: Doc<"workspaces"> | undefined;
} {
	const spaces = useQuery(api.sync.listWorkspaces, {});
	const selectedSpaceId = useStoreValue(selectedSpaceIdStore);
	const space =
		spaces?.find((candidate) => candidate._id === selectedSpaceId) ??
		spaces?.find((candidate) => candidate.personal) ??
		spaces?.[0];
	return { spaces, space };
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
