import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { Button, Modal } from "@hubble.md/ui";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import MingcuteAddLine from "~icons/mingcute/add-line";
import type { CloudContext } from "../store/persistence";

type FolderDestinationInput = {
	id: string;
	name: string;
	parentId: string | null;
};

export type CloudCreateDestination = {
	folderId: string | null;
	label: string;
	detail: string;
};

export function buildCloudCreateDestinations(
	folders: readonly FolderDestinationInput[],
): CloudCreateDestination[] {
	const byId = new Map(folders.map((folder) => [folder.id, folder]));
	const pathFor = (folder: FolderDestinationInput) => {
		const names = [folder.name];
		const seen = new Set([folder.id]);
		let parentId = folder.parentId;
		while (parentId) {
			if (seen.has(parentId)) break;
			seen.add(parentId);
			const parent = byId.get(parentId);
			if (!parent) break;
			names.unshift(parent.name);
			parentId = parent.parentId;
		}
		return names.join(" / ");
	};
	return [
		{
			folderId: null,
			label: "Workspace root",
			detail: "Available to Workspace members",
		},
		...folders
			.map((folder) => ({
				folderId: folder.id,
				label: pathFor(folder),
				detail: "Inherits this folder’s access",
			}))
			.sort((a, b) => a.label.localeCompare(b.label)),
	];
}

export function CloudDocumentCreateButton({
	context,
	canCreate,
	onOpenDocument,
	size = "icon-xs",
	primary = false,
}: {
	context: CloudContext | null;
	canCreate: boolean;
	onOpenDocument: (documentId: string) => void;
	size?: "icon-xs" | "icon-sm";
	primary?: boolean;
}) {
	const createDocument = useMutation(api.documents.create);
	const [creating, setCreating] = useState(false);
	const [destinationOpen, setDestinationOpen] = useState(false);
	const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
	const destinationGroupId = useId();
	const rootDestinationRef = useRef<HTMLInputElement>(null);
	const workspaceId =
		context?.kind === "workspace"
			? (context.workspaceId as Id<"workspaces">)
			: null;
	const members = useQuery(
		api.sync.listWorkspaceMembers,
		workspaceId ? { workspaceId } : "skip",
	);
	const folders = useQuery(
		api.folders.list,
		workspaceId ? { workspaceId } : "skip",
	);
	const destinations = useMemo(
		() =>
			buildCloudCreateDestinations(
				folders?.map((folder) => ({
					id: folder._id,
					name: folder.name,
					parentId: folder.parentId ?? null,
				})) ?? [],
			),
		[folders],
	);
	const destinationLoading =
		context?.kind === "workspace" && (!members || !folders);
	useEffect(() => {
		if (destinationOpen) rootDestinationRef.current?.focus();
	}, [destinationOpen]);

	const create = async (folderId?: string | null) => {
		if (!context || !canCreate || creating) return;
		setCreating(true);
		try {
			const documentId = await createDocument({
				workspaceId: context.workspaceId as Id<"workspaces">,
				folderId:
					context.kind === "shared-folder"
						? (context.folderId as Id<"folders">)
						: folderId
							? (folderId as Id<"folders">)
							: undefined,
				title: "Untitled",
			});
			setDestinationOpen(false);
			onOpenDocument(documentId);
			toast.success("Document created");
		} catch (error) {
			toast.error("Failed to create document", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setCreating(false);
		}
	};
	const beginCreate = () => {
		if (context?.kind === "workspace" && (members?.length ?? 0) > 1) {
			setSelectedFolderId(null);
			setDestinationOpen(true);
			return;
		}
		void create();
	};

	return (
		<>
			<Button
				variant="ghost"
				size={size}
				data-desktop-create-action={primary ? "primary" : undefined}
				onClick={beginCreate}
				disabled={!context || !canCreate || creating || destinationLoading}
				aria-label="New document"
				title={
					canCreate ? "New document (⌘N)" : "You can’t create in this context"
				}
			>
				<MingcuteAddLine
					className={size === "icon-sm" ? "size-4" : "size-3.5"}
				/>
			</Button>
			<Modal
				open={destinationOpen}
				onOpenChange={setDestinationOpen}
				title="Where should this document live?"
				description="Choose its access boundary before creating it."
			>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void create(selectedFolderId);
					}}
					className="flex flex-col gap-3"
				>
					<fieldset className="m-0 flex max-h-64 flex-col gap-1 overflow-auto border-0 p-0">
						<legend className="sr-only">Document destination</legend>
						{destinations.map((destination) => {
							const value = destination.folderId ?? "workspace-root";
							return (
								<label
									key={value}
									className="flex cursor-pointer items-start gap-2 rounded-sm border border-transparent transition-colors duration-150 hover:bg-muted has-[:checked]:border-border has-[:checked]:bg-muted [padding-block:0.5rem] [padding-inline:0.625rem] motion-reduce:transition-none"
								>
									<input
										name={destinationGroupId}
										type="radio"
										value={value}
										checked={selectedFolderId === destination.folderId}
										ref={
											destination.folderId === null
												? rootDestinationRef
												: undefined
										}
										onChange={() => setSelectedFolderId(destination.folderId)}
										className="mt-0.5 accent-current"
									/>
									<span className="min-w-0">
										<span className="block truncate text-xs font-medium text-foreground">
											{destination.label}
										</span>
										<span className="block text-[11px] text-muted-foreground">
											{destination.detail}
										</span>
									</span>
								</label>
							);
						})}
					</fieldset>
					<div className="flex justify-end gap-2 [padding-block-start:0.25rem]">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setDestinationOpen(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={creating}>
							{creating ? "Creating…" : "Create document"}
						</Button>
					</div>
				</form>
			</Modal>
		</>
	);
}
