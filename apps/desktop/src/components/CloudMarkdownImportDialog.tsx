import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { Button, Modal } from "@hubble.md/ui";
import { useQuery } from "convex/react";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { desktopConvexUrl } from "../convex";
import { desktopApi } from "../desktopApi";
import { basename } from "../lib/filePath";
import {
	buildCloudCreateDestinations,
	type CloudCreateDestination,
} from "./CloudDocumentCreateButton";
import { useSelectedCloudContext } from "./SpaceSwitcher";

type ImportDestination = CloudCreateDestination & {
	workspaceId: string;
};

export function CloudMarkdownImportDialog({
	sourcePath,
	onClose,
	onOpenDocument,
}: {
	sourcePath: string;
	onClose: () => void;
	onOpenDocument: (documentId: string) => void;
}) {
	const authToken = useAuthToken();
	const { context } = useSelectedCloudContext();
	const sharedWithMe = useQuery(api.documents.listSharedWithMe, {});
	const workspaceId = context?.workspaceId as Id<"workspaces"> | undefined;
	const workspaceFolders = useQuery(
		api.folders.list,
		context?.kind === "workspace" && workspaceId ? { workspaceId } : "skip",
	);
	const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
		context?.kind === "shared-folder" ? context.folderId : null,
	);
	const [importing, setImporting] = useState(false);
	const [idempotencyKey] = useState(() => crypto.randomUUID());
	const destinationGroupId = useId();
	const firstDestinationRef = useRef<HTMLInputElement>(null);
	const destinations = useMemo<ImportDestination[]>(() => {
		if (!context) return [];
		if (context.kind === "workspace") {
			return buildCloudCreateDestinations(
				workspaceFolders?.map((folder) => ({
					id: folder._id,
					name: folder.name,
					parentId: folder.parentId ?? null,
				})) ?? [],
			).map((destination) => ({
				...destination,
				workspaceId: context.workspaceId,
			}));
		}
		const root = sharedWithMe?.folders.find(
			(folder) => folder.folderId === context.folderId,
		);
		if (!root) return [];
		return buildCloudCreateDestinations([
			{ id: root.folderId, name: root.name, parentId: null },
			...root.folders.map((folder) => ({
				id: folder._id,
				name: folder.name,
				parentId: folder.parentId ?? null,
			})),
		])
			.filter((destination) => destination.folderId !== null)
			.map((destination) => ({
				...destination,
				detail:
					destination.folderId === root.folderId
						? `Shared ${root.role ?? "access"} in ${root.workspaceName}`
						: destination.detail,
				workspaceId: root.workspaceId,
			}));
	}, [context, sharedWithMe?.folders, workspaceFolders]);
	const selected =
		destinations.find(
			(destination) => destination.folderId === selectedFolderId,
		) ?? destinations[0];

	const runImport = async (mode: "copy" | "move") => {
		if (!selected || !authToken || !desktopConvexUrl || importing) return;
		setImporting(true);
		try {
			const result = await desktopApi.importMarkdownFile({
				sourcePath,
				deploymentUrl: desktopConvexUrl,
				authToken,
				workspaceId: selected.workspaceId,
				folderId: selected.folderId ?? undefined,
				idempotencyKey,
				mode,
			});
			onClose();
			onOpenDocument(result.documentId);
			toast.success(mode === "move" ? "Moved into Hubble" : "Imported a copy", {
				description: result.connectedPath
					? `Connected file: ${result.connectedPath}`
					: "The original is unchanged and detached from Hubble.",
			});
		} catch (error) {
			toast.error(mode === "move" ? "Could not move file" : "Import failed", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setImporting(false);
		}
	};

	return (
		<Modal
			open
			onOpenChange={(open) => {
				if (!open && !importing) onClose();
			}}
			initialFocus={firstDestinationRef}
			title={`Bring “${basename(sourcePath)}” into Hubble`}
			description="Choose its destination and effective audience before importing."
		>
			<div className="flex flex-col gap-3">
				<fieldset className="m-0 flex max-h-64 flex-col gap-1 overflow-auto border-0 p-0">
					<legend className="sr-only">Import destination</legend>
					{destinations.map((destination, index) => {
						const value = destination.folderId ?? "workspace-root";
						return (
							<label
								key={`${destination.workspaceId}:${value}`}
								className="flex cursor-pointer items-start gap-2 rounded-sm border border-transparent transition-colors duration-150 hover:bg-muted has-[:checked]:border-border has-[:checked]:bg-muted [padding-block:0.5rem] [padding-inline:0.625rem] motion-reduce:transition-none"
							>
								<input
									ref={index === 0 ? firstDestinationRef : undefined}
									name={destinationGroupId}
									type="radio"
									value={value}
									checked={selected?.folderId === destination.folderId}
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
				<p className="text-[11px] text-muted-foreground">
					Import a copy keeps the original detached. Move into Hubble removes it
					only after a connected Hubble file is verified.
				</p>
				<div className="flex justify-end gap-2 [padding-block-start:0.25rem]">
					<Button variant="ghost" onClick={onClose} disabled={importing}>
						Cancel
					</Button>
					<Button
						variant="outline"
						onClick={() => void runImport("copy")}
						disabled={!selected || !authToken || importing}
					>
						{importing ? "Importing…" : "Import a copy"}
					</Button>
					<Button
						onClick={() => void runImport("move")}
						disabled={!selected || !authToken || importing}
					>
						Move into Hubble
					</Button>
				</div>
			</div>
		</Modal>
	);
}
