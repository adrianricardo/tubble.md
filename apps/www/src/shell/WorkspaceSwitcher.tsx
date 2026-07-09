import { api } from "@hubble.md/sync-backend";
import type { Doc } from "@hubble.md/sync-backend/types";
import { Modal, WorkspaceSwitcherMenu } from "@hubble.md/ui";
import { ConvexHttpClient } from "convex/browser";
import { useEffect, useMemo, useState } from "react";
import { categorizeError, describeError } from "../connection/convex-error";
import { CreateWorkspaceForm } from "./CreateWorkspaceForm";

type Props = {
	url: string;
	authToken?: string;
	currentWorkspaceId: string;
	currentWorkspaceName: string;
	onSelect: (id: string) => void;
	onDisconnect: () => void;
};

export function WorkspaceSwitcher({
	url,
	authToken,
	currentWorkspaceId,
	currentWorkspaceName,
	onSelect,
	onDisconnect,
}: Props) {
	const [open, setOpen] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const client = useMemo(() => {
		const nextClient = new ConvexHttpClient(url);
		if (authToken) nextClient.setAuth(authToken);
		return nextClient;
	}, [url, authToken]);
	const [workspaces, setWorkspaces] = useState<Doc<"workspaces">[]>([]);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const result = await client.query(api.sync.listWorkspaces, {});
				if (cancelled) return;
				setWorkspaces(result);
			} catch (err) {
				if (!cancelled) setError(describeError(categorizeError(err)));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [client]);

	return (
		<>
			<WorkspaceSwitcherMenu
				label={currentWorkspaceName}
				title={currentWorkspaceName}
				open={open}
				onOpenChange={setOpen}
			>
				{error && (
					<div className="px-2 py-1 text-[11px] text-destructive">{error}</div>
				)}
				{workspaces.map((workspace) => (
					<WorkspaceSwitcherMenu.Item
						key={workspace._id}
						selected={workspace._id === currentWorkspaceId}
						onClick={() => {
							setOpen(false);
							if (workspace._id !== currentWorkspaceId) {
								onSelect(workspace._id);
							}
						}}
					>
						<span className="truncate">{workspace.name}</span>
					</WorkspaceSwitcherMenu.Item>
				))}
				<WorkspaceSwitcherMenu.Separator />
				<WorkspaceSwitcherMenu.Item
					onClick={() => {
						setOpen(false);
						setCreateOpen(true);
					}}
				>
					Create space
				</WorkspaceSwitcherMenu.Item>
				<WorkspaceSwitcherMenu.Item
					onClick={() => {
						setOpen(false);
						onDisconnect();
					}}
				>
					Disconnect
				</WorkspaceSwitcherMenu.Item>
			</WorkspaceSwitcherMenu>
			<Modal
				open={createOpen}
				onOpenChange={setCreateOpen}
				title="Create space"
			>
				<CreateWorkspaceForm
					client={client}
					onCreated={(id) => {
						setCreateOpen(false);
						onSelect(id);
					}}
				/>
			</Modal>
		</>
	);
}
