import { api } from "@hubble.md/sync-backend";
import type { Doc, Id } from "@hubble.md/sync-backend/types";
import { Sidebar as SharedSidebar } from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteDeleteLine from "~icons/mingcute/delete-line";
import MingcuteEditLine from "~icons/mingcute/edit-line";
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
	selectedDocumentId,
	onSelectFile,
	onSelectDocument,
	onSwitch,
	onDisconnect,
}: {
	url: string;
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
					currentWorkspaceId={workspaceId}
					currentWorkspaceName={workspaceName}
					onSelect={onSwitch}
					onDisconnect={onDisconnect}
				/>
			}
			footer={
				<LiveDocumentsSection
					workspaceId={workspaceId}
					selectedDocumentId={selectedDocumentId}
					onSelectDocument={onSelectDocument}
				/>
			}
			onSortModeChange={setSortMode}
			onSelectFile={onSelectFile}
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

function LiveDocumentsSection({
	workspaceId,
	selectedDocumentId,
	onSelectDocument,
}: {
	workspaceId: string;
	selectedDocumentId: string | null;
	onSelectDocument: (documentId: string) => void;
}) {
	const convexWorkspaceId = workspaceId as Id<"workspaces">;
	const documents = useQuery(api.documents.list, {
		workspaceId: convexWorkspaceId,
	});
	const createDocument = useMutation(api.documents.create);
	const renameDocument = useMutation(api.documents.rename);
	const removeDocument = useMutation(api.documents.remove);

	const handleCreateDocument = async () => {
		const documentId = await createDocument({
			workspaceId: convexWorkspaceId,
			title: "Untitled",
		});
		onSelectDocument(documentId);
	};

	const handleRenameDocument = async (document: Doc<"documents">) => {
		const title = window.prompt("Rename document", document.title)?.trim();
		if (!title || title === document.title) return;
		await renameDocument({ documentId: document._id, title });
	};

	const handleRemoveDocument = async (document: Doc<"documents">) => {
		if (!window.confirm(`Delete "${document.title}"?`)) return;
		await removeDocument({ documentId: document._id });
	};

	return (
		<section className="border-t border-sidebar-border [padding-block:0.5rem] [padding-inline:0.5rem]">
			<div className="flex items-center justify-between gap-2 [padding-block-end:0.25rem] [padding-inline:0.25rem]">
				<h2 className="m-0 text-[10px] font-medium uppercase text-muted-foreground">
					Live Documents
				</h2>
				<button
					type="button"
					className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
					aria-label="New live document"
					title="New live document"
					onClick={() => void handleCreateDocument()}
				>
					<MingcuteAddLine className="size-3.5" />
				</button>
			</div>
			<div className="flex max-h-36 flex-col overflow-auto">
				{documents === undefined && (
					<p className="m-0 text-xs text-muted-foreground [padding-block:0.375rem] [padding-inline:0.25rem]">
						Loading…
					</p>
				)}
				{documents?.length === 0 && (
					<p className="m-0 text-xs text-muted-foreground [padding-block:0.375rem] [padding-inline:0.25rem]">
						No live documents yet.
					</p>
				)}
				{documents?.map((document) => (
					<LiveDocumentRow
						key={document._id}
						document={document}
						selected={document._id === selectedDocumentId}
						onSelect={() => onSelectDocument(document._id)}
						onRename={() => void handleRenameDocument(document)}
						onRemove={() => void handleRemoveDocument(document)}
					/>
				))}
			</div>
		</section>
	);
}

function LiveDocumentRow({
	document,
	selected,
	onSelect,
	onRename,
	onRemove,
}: {
	document: Doc<"documents">;
	selected: boolean;
	onSelect: () => void;
	onRename: () => void;
	onRemove: () => void;
}) {
	return (
		<div
			className={`group flex items-center rounded-sm text-sidebar-foreground ${
				selected ? "bg-sidebar-accent font-medium" : "hover:bg-accent"
			}`}
		>
			<button
				type="button"
				className="min-w-0 flex-1 truncate bg-transparent text-start text-[length:var(--font-size-sidebar)] [padding-block:0.375rem] [padding-inline:0.5rem]"
				onClick={onSelect}
				title={document.title}
			>
				{document.title}
			</button>
			<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [padding-inline-end:0.25rem]">
				<button
					type="button"
					className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
					aria-label={`Rename ${document.title}`}
					title="Rename"
					onClick={onRename}
				>
					<MingcuteEditLine className="size-3.5" />
				</button>
				<button
					type="button"
					className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-destructive"
					aria-label={`Delete ${document.title}`}
					title="Delete"
					onClick={onRemove}
				>
					<MingcuteDeleteLine className="size-3.5" />
				</button>
			</div>
		</div>
	);
}
