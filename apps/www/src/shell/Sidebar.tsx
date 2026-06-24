import { api } from "@hubble.md/sync-backend";
import type { Doc, Id } from "@hubble.md/sync-backend/types";
import { Button, Input, Sidebar as SharedSidebar } from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteCheckLine from "~icons/mingcute/check-line";
import MingcuteCloseLine from "~icons/mingcute/close-line";
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
	onSelectFile,
	onSwitch,
	onDisconnect,
}: {
	url: string;
	workspaceId: string;
	workspaceName: string;
	onSelectFile: (path: string) => void;
	onSwitch: (id: string) => void;
	onDisconnect: () => void;
}) {
	const files = useStoreValue(filesStore);
	const filesLoaded = useStoreValue(filesLoadedStore);
	const currentPath = useStoreValue(currentPathStore);
	const pendingPath = useStoreValue(pendingPathStore);
	const [sortMode, setSortMode] = useState<"alpha" | "recent">("recent");
	const liveDocuments = useQuery(api.sync.listDocumentsByWorkspace, {
		workspaceId: workspaceId as Id<"workspaces">,
	});

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
				<LiveDocumentsPanel
					workspaceId={workspaceId as Id<"workspaces">}
					documents={liveDocuments ?? []}
					loading={liveDocuments === undefined}
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

function LiveDocumentsPanel({
	workspaceId,
	documents,
	loading,
}: {
	workspaceId: Id<"workspaces">;
	documents: Doc<"documents">[];
	loading: boolean;
}) {
	const createDocument = useMutation(api.sync.createDocument);
	const renameDocument = useMutation(api.sync.renameDocument);
	const deleteDocument = useMutation(api.sync.deleteDocument);
	const [newTitle, setNewTitle] = useState("");
	const [editingId, setEditingId] = useState<Id<"documents"> | null>(null);
	const [editingTitle, setEditingTitle] = useState("");
	const [pendingId, setPendingId] = useState<Id<"documents"> | "new" | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

	const sortedDocuments = [...documents].sort(
		(a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title),
	);

	const submitNewDocument = async (event: FormEvent) => {
		event.preventDefault();
		const title = newTitle.trim();
		if (!title) return;
		setPendingId("new");
		setError(null);
		try {
			await createDocument({ workspaceId, title, actor: "web-poc" });
			setNewTitle("");
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setPendingId(null);
		}
	};

	const beginRename = (document: Doc<"documents">) => {
		setEditingId(document._id);
		setEditingTitle(document.title);
		setError(null);
	};

	const submitRename = async (event: FormEvent) => {
		event.preventDefault();
		if (!editingId) return;
		const title = editingTitle.trim();
		if (!title) return;
		setPendingId(editingId);
		setError(null);
		try {
			await renameDocument({
				documentId: editingId,
				title,
				actor: "web-poc",
			});
			setEditingId(null);
			setEditingTitle("");
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setPendingId(null);
		}
	};

	const removeDocument = async (documentId: Id<"documents">) => {
		setPendingId(documentId);
		setError(null);
		try {
			await deleteDocument({ documentId, actor: "web-poc" });
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setPendingId(null);
		}
	};

	return (
		<section className="border-t border-border px-2.5 py-2">
			<div className="mb-2 flex items-center justify-between gap-2">
				<h2 className="m-0 text-[11px] font-medium text-muted-foreground">
					Live Documents
				</h2>
				<span className="text-[10px] text-muted-foreground">
					{loading ? "Loading" : sortedDocuments.length}
				</span>
			</div>
			<form onSubmit={submitNewDocument} className="mb-2 flex gap-1">
				<Input
					value={newTitle}
					onChange={(event) => setNewTitle(event.target.value)}
					placeholder="Document title"
					aria-label="New Live Document title"
					disabled={pendingId !== null}
				/>
				<Button
					type="submit"
					size="icon-sm"
					variant="secondary"
					aria-label="Create Live Document"
					disabled={pendingId !== null || !newTitle.trim()}
				>
					<MingcuteAddLine />
				</Button>
			</form>
			<div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
				{sortedDocuments.map((document) =>
					editingId === document._id ? (
						<form
							key={document._id}
							onSubmit={submitRename}
							className="flex items-center gap-1"
						>
							<Input
								value={editingTitle}
								onChange={(event) => setEditingTitle(event.target.value)}
								aria-label={`Rename ${document.title}`}
								disabled={pendingId !== null}
							/>
							<Button
								type="submit"
								size="icon-xs"
								variant="ghost"
								aria-label="Save Live Document title"
								disabled={pendingId !== null || !editingTitle.trim()}
							>
								<MingcuteCheckLine />
							</Button>
							<Button
								type="button"
								size="icon-xs"
								variant="ghost"
								aria-label="Cancel rename"
								disabled={pendingId !== null}
								onClick={() => {
									setEditingId(null);
									setEditingTitle("");
								}}
							>
								<MingcuteCloseLine />
							</Button>
						</form>
					) : (
						<div
							key={document._id}
							className="group/live-document flex min-h-7 items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] hover:bg-muted"
						>
							<div className="min-w-0 flex-1">
								<div className="truncate text-foreground">{document.title}</div>
								{document.path && (
									<div className="truncate text-[10px] text-muted-foreground">
										{document.path}
									</div>
								)}
							</div>
							<Button
								type="button"
								size="icon-xs"
								variant="ghost"
								aria-label={`Rename ${document.title}`}
								disabled={pendingId !== null}
								className="opacity-0 group-hover/live-document:opacity-100 focus-visible:opacity-100"
								onClick={() => beginRename(document)}
							>
								<MingcuteEditLine />
							</Button>
							<Button
								type="button"
								size="icon-xs"
								variant="ghost"
								aria-label={`Delete ${document.title}`}
								disabled={pendingId !== null}
								className="opacity-0 group-hover/live-document:opacity-100 focus-visible:opacity-100"
								onClick={() => void removeDocument(document._id)}
							>
								<MingcuteDeleteLine />
							</Button>
						</div>
					),
				)}
				{!loading && sortedDocuments.length === 0 && (
					<p className="m-0 px-1 py-1 text-[11px] text-muted-foreground">
						No Live Documents yet.
					</p>
				)}
			</div>
			{error && (
				<p className="m-0 mt-2 text-[11px] text-destructive">{error}</p>
			)}
		</section>
	);
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : "Live Document action failed";
}
