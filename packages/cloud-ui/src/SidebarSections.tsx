import { Select } from "@base-ui/react/select";
import { api } from "@hubble.md/sync-backend";
import type { Doc, Id } from "@hubble.md/sync-backend/types";
import { Button, Input, Modal } from "@hubble.md/ui";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useId, useRef, useState } from "react";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteCheckLine from "~icons/mingcute/check-line";
import MingcuteDeleteLine from "~icons/mingcute/delete-line";
import MingcuteEditLine from "~icons/mingcute/edit-line";
import MingcuteFolderLine from "~icons/mingcute/folder-line";
import MingcuteRightLine from "~icons/mingcute/right-line";
import MingcuteShareForwardLine from "~icons/mingcute/share-forward-line";

type ShareRole = "owner" | "editor" | "commenter" | "viewer";
type LinkAccess = "off" | "viewer" | "commenter" | "editor";

// Select portals need their own root stacking layer above Modal's z-50 popup.
const MODAL_SELECT_POSITIONER_STYLE = { zIndex: 60 };

type NameDialogState =
	| { kind: "create-folder"; parentId?: Id<"folders"> }
	| { kind: "rename-folder"; folder: Doc<"folders"> }
	| null;

// ── Folders (RB2): folder tree, folder-scoped doc create, folder share dialog ──

export function FoldersSection({
	workspaceId,
	selectedDocumentId,
	onSelectDocument,
	shareLinkOrigin,
}: {
	workspaceId: string;
	selectedDocumentId: string | null;
	onSelectDocument: (documentId: string) => void;
	shareLinkOrigin?: string;
}) {
	const convexWorkspaceId = workspaceId as Id<"workspaces">;
	const folders = useQuery(api.folders.list, {
		workspaceId: convexWorkspaceId,
	});
	const documents = useQuery(api.documents.list, {
		workspaceId: convexWorkspaceId,
	});
	const createFolder = useMutation(api.folders.create);
	const renameFolder = useMutation(api.folders.rename);
	const removeFolder = useMutation(api.folders.remove);
	const createDocument = useMutation(api.documents.create);

	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [shareFolderId, setShareFolderId] = useState<Id<"folders"> | null>(
		null,
	);
	const [nameDialog, setNameDialog] = useState<NameDialogState>(null);

	const rootFolders = folders?.filter((folder) => !folder.parentId) ?? [];

	const toggle = (id: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const handleSubmitName = async (name: string) => {
		if (!nameDialog) return;
		if (nameDialog.kind === "create-folder") {
			const parentId = nameDialog.parentId;
			await createFolder({ workspaceId: convexWorkspaceId, parentId, name });
			setNameDialog(null);
			if (parentId) {
				setExpanded((prev) => {
					const next = new Set(prev);
					next.add(parentId);
					return next;
				});
			}
			return;
		}
		if (name === nameDialog.folder.name) {
			setNameDialog(null);
			return;
		}
		await renameFolder({ folderId: nameDialog.folder._id, name });
		setNameDialog(null);
	};

	const openCreateFolderDialog = (parentId?: Id<"folders">) => {
		setNameDialog({ kind: "create-folder", parentId });
		if (parentId) {
			setExpanded((prev) => {
				const next = new Set(prev);
				next.add(parentId);
				return next;
			});
		}
	};

	const handleRenameFolder = async (folder: Doc<"folders">) => {
		setNameDialog({ kind: "rename-folder", folder });
	};

	const handleRemoveFolder = async (folder: Doc<"folders">) => {
		if (
			!window.confirm(
				`Delete folder "${folder.name}"? Its contents move to trash too.`,
			)
		) {
			return;
		}
		await removeFolder({ folderId: folder._id });
	};

	const handleCreateDocumentInFolder = async (folderId: Id<"folders">) => {
		const documentId = await createDocument({
			workspaceId: convexWorkspaceId,
			folderId,
			title: "Untitled",
		});
		onSelectDocument(documentId);
	};

	const shareFolder = folders?.find((folder) => folder._id === shareFolderId);

	return (
		<section className="border-t border-sidebar-border [padding-block:0.5rem] [padding-inline:0.5rem]">
			<div className="flex items-center justify-between gap-2 [padding-block-end:0.25rem] [padding-inline:0.25rem]">
				<h2 className="m-0 text-[10px] font-medium uppercase text-muted-foreground">
					Folders
				</h2>
				<button
					type="button"
					className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
					aria-label="New folder"
					title="New folder"
					onClick={() => openCreateFolderDialog()}
				>
					<MingcuteAddLine className="size-3.5" />
				</button>
			</div>
			{folders !== undefined && rootFolders.length === 0 ? (
				<p className="m-0 text-xs text-muted-foreground [padding-block:0.375rem] [padding-inline:0.25rem]">
					No folders yet.
				</p>
			) : (
				<div className="flex max-h-56 flex-col overflow-auto">
					{rootFolders.map((folder) => (
						<FolderRow
							key={folder._id}
							folder={folder}
							depth={0}
							folders={folders ?? []}
							documents={documents ?? []}
							expanded={expanded}
							selectedDocumentId={selectedDocumentId}
							onToggle={toggle}
							onSelectDocument={onSelectDocument}
							onCreateSubfolder={openCreateFolderDialog}
							onCreateDocument={handleCreateDocumentInFolder}
							onRename={handleRenameFolder}
							onRemove={handleRemoveFolder}
							onShare={setShareFolderId}
						/>
					))}
				</div>
			)}
			{shareFolder && (
				<FolderShareDialog
					folderId={shareFolder._id}
					folderName={shareFolder.name}
					open={shareFolderId !== null}
					onOpenChange={(open) => {
						if (!open) setShareFolderId(null);
					}}
					shareLinkOrigin={shareLinkOrigin}
				/>
			)}
			<NameDialog
				open={nameDialog !== null}
				title={
					nameDialog?.kind === "rename-folder" ? "Rename folder" : "New folder"
				}
				label="Folder name"
				initialValue={
					nameDialog?.kind === "rename-folder" ? nameDialog.folder.name : ""
				}
				submitLabel={nameDialog?.kind === "rename-folder" ? "Save" : "Create"}
				onOpenChange={(open) => {
					if (!open) setNameDialog(null);
				}}
				onSubmit={handleSubmitName}
			/>
		</section>
	);
}

function FolderRow({
	folder,
	depth,
	folders,
	documents,
	expanded,
	selectedDocumentId,
	onToggle,
	onSelectDocument,
	onCreateSubfolder,
	onCreateDocument,
	onRename,
	onRemove,
	onShare,
}: {
	folder: Doc<"folders">;
	depth: number;
	folders: Doc<"folders">[];
	documents: Doc<"documents">[];
	expanded: Set<string>;
	selectedDocumentId: string | null;
	onToggle: (id: string) => void;
	onSelectDocument: (documentId: string) => void;
	onCreateSubfolder: (parentId: Id<"folders">) => void | Promise<void>;
	onCreateDocument: (folderId: Id<"folders">) => void | Promise<void>;
	onRename: (folder: Doc<"folders">) => void | Promise<void>;
	onRemove: (folder: Doc<"folders">) => void | Promise<void>;
	onShare: (folderId: Id<"folders">) => void;
}) {
	const isOpen = expanded.has(folder._id);
	const childFolders = folders.filter((f) => f.parentId === folder._id);
	const childDocuments = documents.filter((d) => d.folderId === folder._id);
	const indent = `${0.5 + depth * 0.75}rem`;
	const docIndent = `${1.25 + depth * 0.75}rem`;

	return (
		<div>
			<div className="group flex items-center rounded-sm text-sidebar-foreground hover:bg-accent">
				<button
					type="button"
					className="flex min-w-0 flex-1 items-center gap-1 bg-transparent text-start [padding-block:0.375rem]"
					style={{ paddingInlineStart: indent }}
					onClick={() => onToggle(folder._id)}
				>
					<MingcuteRightLine
						className={`size-3 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
					/>
					<MingcuteFolderLine className="size-3.5 shrink-0 text-muted-foreground" />
					<span className="truncate text-[length:var(--font-size-sidebar)]">
						{folder.name}
					</span>
				</button>
				<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [padding-inline-end:0.25rem]">
					<button
						type="button"
						className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
						aria-label={`New document in ${folder.name}`}
						title="New document"
						onClick={() => void onCreateDocument(folder._id)}
					>
						<MingcuteAddLine className="size-3.5" />
					</button>
					<button
						type="button"
						className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
						aria-label={`New subfolder in ${folder.name}`}
						title="New subfolder"
						onClick={() => void onCreateSubfolder(folder._id)}
					>
						<MingcuteFolderLine className="size-3.5" />
					</button>
					<button
						type="button"
						className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
						aria-label={`Share ${folder.name}`}
						title="Share"
						onClick={() => onShare(folder._id)}
					>
						<MingcuteShareForwardLine className="size-3.5" />
					</button>
					<button
						type="button"
						className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
						aria-label={`Rename ${folder.name}`}
						title="Rename"
						onClick={() => void onRename(folder)}
					>
						<MingcuteEditLine className="size-3.5" />
					</button>
					<button
						type="button"
						className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-destructive"
						aria-label={`Delete ${folder.name}`}
						title="Delete"
						onClick={() => void onRemove(folder)}
					>
						<MingcuteDeleteLine className="size-3.5" />
					</button>
				</div>
			</div>
			{isOpen && (
				<div>
					{childFolders.map((child) => (
						<FolderRow
							key={child._id}
							folder={child}
							depth={depth + 1}
							folders={folders}
							documents={documents}
							expanded={expanded}
							selectedDocumentId={selectedDocumentId}
							onToggle={onToggle}
							onSelectDocument={onSelectDocument}
							onCreateSubfolder={onCreateSubfolder}
							onCreateDocument={onCreateDocument}
							onRename={onRename}
							onRemove={onRemove}
							onShare={onShare}
						/>
					))}
					{childDocuments.map((document) => (
						<button
							key={document._id}
							type="button"
							className={`block w-full truncate rounded-sm text-start text-[length:var(--font-size-sidebar)] text-sidebar-foreground [padding-block:0.25rem] ${
								document._id === selectedDocumentId
									? "bg-sidebar-accent font-medium"
									: "hover:bg-accent"
							}`}
							style={{ paddingInlineStart: docIndent }}
							onClick={() => onSelectDocument(document._id)}
						>
							{document.title}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export function FolderShareDialog({
	folderId,
	folderName,
	open,
	onOpenChange,
	shareLinkOrigin,
}: {
	folderId: Id<"folders">;
	folderName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	shareLinkOrigin?: string;
}) {
	const shares = useQuery(
		api.folders.listFolderShares,
		open ? { folderId } : "skip",
	);
	const setUserShareByEmail = useMutation(
		api.folders.setFolderUserShareByEmail,
	);
	const removeUserShare = useMutation(api.folders.removeFolderUserShare);
	const setLinkShare = useMutation(api.folders.setFolderLinkShare);
	const clearLinkShare = useMutation(api.folders.clearFolderLinkShare);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<ShareRole>("editor");
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const publicShare = shares?.find((share) => share.linkScope === "public");
	const linkAccess = (publicShare?.role ?? "off") as LinkAccess;
	const userShares = shares?.filter((share) => share.userId) ?? [];
	const folderLink = shareLinkOrigin
		? `${shareLinkOrigin}/folder/${folderId}`
		: null;

	const inviteUser = async (event: React.FormEvent) => {
		event.preventDefault();
		const trimmed = email.trim();
		if (!trimmed) return;
		setPending(true);
		setMessage(null);
		try {
			const result = await setUserShareByEmail({
				folderId,
				email: trimmed,
				role,
			});
			setEmail("");
			setMessage(
				result.status === "invited"
					? "No account yet — they'll get access as soon as they sign up with this email."
					: "Access updated.",
			);
		} catch (err) {
			setMessage(
				err instanceof Error ? err.message : "Could not update access.",
			);
		} finally {
			setPending(false);
		}
	};

	const updateLinkAccess = async (next: LinkAccess) => {
		setMessage(null);
		if (next === "off") {
			await clearLinkShare({ folderId });
			return;
		}
		await setLinkShare({ folderId, role: next });
	};

	const copyLink = async () => {
		if (!folderLink) return;
		await navigator.clipboard.writeText(folderLink);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={`Share "${folderName}"`}
			description="People and link access apply to every document and subfolder inside this folder."
		>
			<div className="flex flex-col gap-4">
				<form onSubmit={inviteUser} className="flex flex-col gap-2">
					<label
						htmlFor={`folder-share-email-${folderId}`}
						className="text-xs font-medium text-foreground"
					>
						Invite by email
					</label>
					<div className="flex gap-2">
						<input
							id={`folder-share-email-${folderId}`}
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							placeholder="teammate@example.com"
							className="min-w-0 flex-1 rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
						/>
						<RoleSelect value={role} onChange={setRole} includeOwner />
					</div>
					<button
						type="submit"
						disabled={pending || !email.trim()}
						className="self-start rounded-sm bg-primary text-xs font-medium text-primary-foreground disabled:opacity-50 [padding-block:0.375rem] [padding-inline:0.75rem]"
					>
						{pending ? "Sharing..." : "Share"}
					</button>
				</form>

				{folderLink ? (
					<div className="flex flex-col gap-2 border-t border-border [padding-block-start:0.75rem]">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<p className="m-0 text-xs font-medium text-foreground">
									{linkAccess === "off"
										? "Link sharing off"
										: `Anyone with the link can ${linkAccess}`}
								</p>
								<p className="m-0 text-[11px] text-muted-foreground [margin-block-start:0.25rem]">
									Anyone with this folder's link gets this role (never owner).
								</p>
							</div>
							<LinkAccessSelect
								value={linkAccess}
								onChange={updateLinkAccess}
							/>
						</div>
						{linkAccess !== "off" && (
							<div className="flex items-center gap-2 rounded-sm bg-muted/40 [padding-block:0.375rem] [padding-inline:0.5rem]">
								<input
									type="text"
									readOnly
									value={folderLink}
									onFocus={(event) => event.currentTarget.select()}
									className="min-w-0 flex-1 truncate bg-transparent text-[11px] text-muted-foreground outline-none"
								/>
								<button
									type="button"
									onClick={() => void copyLink()}
									className="shrink-0 rounded-sm border border-border bg-background text-[11px] font-medium text-foreground hover:bg-accent [padding-block:0.25rem] [padding-inline:0.5rem]"
								>
									{copied ? "Copied!" : "Copy link"}
								</button>
							</div>
						)}
					</div>
				) : null}

				<div className="border-t border-border [padding-block-start:0.75rem]">
					<p className="m-0 text-xs font-medium text-foreground">People</p>
					<div className="flex max-h-44 flex-col gap-1 overflow-auto [margin-block-start:0.5rem]">
						{shares === undefined && (
							<p className="m-0 text-xs text-muted-foreground">Loading...</p>
						)}
						{shares !== undefined && userShares.length === 0 && (
							<p className="m-0 text-xs text-muted-foreground">
								No direct shares yet.
							</p>
						)}
						{userShares.map((share) => (
							<div
								key={share._id}
								className="flex items-center justify-between gap-2 rounded-sm bg-muted/40 [padding-block:0.375rem] [padding-inline:0.5rem]"
							>
								<div className="min-w-0">
									<p className="m-0 truncate text-xs text-foreground">
										{share.user?.name ?? share.user?.email ?? "Unknown user"}
									</p>
									<p className="m-0 truncate text-[11px] text-muted-foreground">
										{share.user?.email ?? share.role}
									</p>
								</div>
								<div className="flex items-center gap-1">
									<span className="text-[11px] capitalize text-muted-foreground">
										{share.role}
									</span>
									{share.userId && (
										<button
											type="button"
											className="rounded-sm text-[11px] text-muted-foreground hover:bg-accent hover:text-destructive [padding-block:0.25rem] [padding-inline:0.375rem]"
											onClick={() =>
												void removeUserShare({
													folderId,
													userId: share.userId as Id<"users">,
												})
											}
										>
											Remove
										</button>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
				{message && (
					<p className="m-0 text-xs text-muted-foreground">{message}</p>
				)}
			</div>
		</Modal>
	);
}

export function LiveDocumentsSection({
	workspaceId,
	selectedDocumentId,
	onSelectDocument,
	shareLinkOrigin,
}: {
	workspaceId: string;
	selectedDocumentId: string | null;
	onSelectDocument: (documentId: string) => void;
	shareLinkOrigin?: string;
}) {
	const convexWorkspaceId = workspaceId as Id<"workspaces">;
	const documents = useQuery(api.documents.list, {
		workspaceId: convexWorkspaceId,
	});
	const createDocument = useMutation(api.documents.create);
	const renameDocument = useMutation(api.documents.rename);
	const removeDocument = useMutation(api.documents.remove);

	const [searchInput, setSearchInput] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [renameDocumentTarget, setRenameDocumentTarget] =
		useState<Doc<"documents"> | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const searchResults = useQuery(
		api.documents.search,
		debouncedQuery.trim()
			? { workspaceId: convexWorkspaceId, query: debouncedQuery }
			: "skip",
	);

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			setDebouncedQuery(searchInput);
		}, 200);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [searchInput]);

	const handleCreateDocument = async () => {
		const documentId = await createDocument({
			workspaceId: convexWorkspaceId,
			title: "Untitled",
		});
		onSelectDocument(documentId);
	};

	const handleRenameDocument = (document: Doc<"documents">) => {
		setRenameDocumentTarget(document);
	};

	const submitDocumentName = async (title: string) => {
		if (!renameDocumentTarget) return;
		if (title !== renameDocumentTarget.title) {
			await renameDocument({ documentId: renameDocumentTarget._id, title });
		}
		setRenameDocumentTarget(null);
	};

	const handleRemoveDocument = async (document: Doc<"documents">) => {
		if (!window.confirm(`Delete "${document.title}"?`)) return;
		await removeDocument({ documentId: document._id });
	};

	const isSearching = debouncedQuery.trim().length > 0;
	// Folder-scoped docs render under FoldersSection above; this list stays
	// workspace-root-only so a doc never appears twice in the sidebar.
	const rootDocuments = documents?.filter((document) => !document.folderId);

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
			<input
				type="search"
				value={searchInput}
				onChange={(e) => setSearchInput(e.target.value)}
				placeholder="Search documents…"
				className="w-full rounded-sm border border-border bg-background text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring [margin-block-end:0.25rem] [padding-block:0.25rem] [padding-inline:0.5rem]"
			/>
			{isSearching ? (
				<div className="flex max-h-48 flex-col overflow-auto">
					{searchResults === undefined && (
						<p className="m-0 text-xs text-muted-foreground [padding-block:0.375rem] [padding-inline:0.25rem]">
							Searching…
						</p>
					)}
					{searchResults?.length === 0 && (
						<p className="m-0 text-xs text-muted-foreground [padding-block:0.375rem] [padding-inline:0.25rem]">
							No results for "{debouncedQuery}".
						</p>
					)}
					{searchResults?.map((result) => (
						<button
							key={result.documentId}
							type="button"
							className="group flex flex-col rounded-sm text-start hover:bg-sidebar-accent [padding-block:0.375rem] [padding-inline:0.5rem]"
							onClick={() => {
								onSelectDocument(result.documentId);
								setSearchInput("");
							}}
						>
							<span className="block truncate text-[length:var(--font-size-sidebar)] font-medium text-sidebar-foreground">
								{result.title}
							</span>
							{result.path && (
								<span className="block truncate text-[10px] text-muted-foreground">
									{result.path}
								</span>
							)}
							{result.snippet && (
								<span className="block truncate text-[10px] text-muted-foreground [margin-block-start:0.125rem]">
									{result.snippet}
								</span>
							)}
						</button>
					))}
				</div>
			) : (
				<div className="flex max-h-36 flex-col overflow-auto">
					{documents === undefined && (
						<p className="m-0 text-xs text-muted-foreground [padding-block:0.375rem] [padding-inline:0.25rem]">
							Loading…
						</p>
					)}
					{rootDocuments?.length === 0 && (
						<p className="m-0 text-xs text-muted-foreground [padding-block:0.375rem] [padding-inline:0.25rem]">
							No live documents yet.
						</p>
					)}
					{rootDocuments?.map((document) => (
						<LiveDocumentRow
							key={document._id}
							document={document}
							selected={document._id === selectedDocumentId}
							onSelect={() => onSelectDocument(document._id)}
							onRename={() => void handleRenameDocument(document)}
							onRemove={() => void handleRemoveDocument(document)}
							shareLinkOrigin={shareLinkOrigin}
						/>
					))}
				</div>
			)}
			<NameDialog
				open={renameDocumentTarget !== null}
				title="Rename document"
				label="Document name"
				initialValue={renameDocumentTarget?.title ?? ""}
				submitLabel="Save"
				onOpenChange={(open) => {
					if (!open) setRenameDocumentTarget(null);
				}}
				onSubmit={submitDocumentName}
			/>
		</section>
	);
}

function LiveDocumentRow({
	document,
	selected,
	onSelect,
	onRename,
	onRemove,
	shareLinkOrigin,
}: {
	document: Doc<"documents">;
	selected: boolean;
	onSelect: () => void;
	onRename: () => void;
	onRemove: () => void;
	shareLinkOrigin?: string;
}) {
	const [shareOpen, setShareOpen] = useState(false);

	return (
		<>
			<div
				className={`group flex items-center rounded-sm text-sidebar-foreground ${
					selected ? "bg-sidebar-accent font-medium" : "hover:bg-accent"
				}`}
			>
				<button
					type="button"
					className="min-w-0 flex-1 bg-transparent text-start [padding-block:0.375rem] [padding-inline:0.5rem]"
					onClick={onSelect}
					title={`${document.title}\n${formatEditedMeta(document.updatedAt, document.updatedBy)}`}
				>
					<span className="block truncate text-[length:var(--font-size-sidebar)]">
						{document.title}
					</span>
					<span className="block truncate text-[10px] font-normal text-muted-foreground">
						{formatEditedMeta(document.updatedAt, document.updatedBy)}
					</span>
				</button>
				<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [padding-inline-end:0.25rem]">
					<button
						type="button"
						className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
						aria-label={`Share ${document.title}`}
						title="Share"
						onClick={() => setShareOpen(true)}
					>
						<MingcuteShareForwardLine className="size-3.5" />
					</button>
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
			<ShareDocumentDialog
				document={document}
				open={shareOpen}
				onOpenChange={setShareOpen}
				shareLinkOrigin={shareLinkOrigin}
			/>
		</>
	);
}

function ShareDocumentDialog({
	document,
	open,
	onOpenChange,
	shareLinkOrigin,
}: {
	document: Doc<"documents">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	shareLinkOrigin?: string;
}) {
	const shares = useQuery(
		api.documents.listShares,
		open ? { documentId: document._id } : "skip",
	);
	const setUserShareByEmail = useMutation(api.documents.setUserShareByEmail);
	const removeUserShare = useMutation(api.documents.removeUserShare);
	const setLinkShare = useMutation(api.documents.setLinkShare);
	const clearLinkShare = useMutation(api.documents.clearLinkShare);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<ShareRole>("editor");
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const publicShare = shares?.find((share) => share.linkScope === "public");
	const linkAccess = (publicShare?.role ?? "off") as LinkAccess;
	const userShares = shares?.filter((share) => share.userId) ?? [];
	const documentLink = shareLinkOrigin
		? `${shareLinkOrigin}/w/${document.workspaceId}/d/${document._id}`
		: null;

	const inviteUser = async (event: React.FormEvent) => {
		event.preventDefault();
		const trimmed = email.trim();
		if (!trimmed) return;
		setPending(true);
		setMessage(null);
		try {
			await setUserShareByEmail({
				documentId: document._id,
				email: trimmed,
				role,
			});
			setEmail("");
			setMessage("Access updated.");
		} catch (err) {
			setMessage(
				err instanceof Error ? err.message : "Could not update access.",
			);
		} finally {
			setPending(false);
		}
	};

	const updateLinkAccess = async (next: LinkAccess) => {
		setMessage(null);
		if (next === "off") {
			await clearLinkShare({ documentId: document._id, linkScope: "public" });
			return;
		}
		await setLinkShare({
			documentId: document._id,
			linkScope: "public",
			role: next,
		});
	};

	const copyLink = async () => {
		if (!documentLink) return;
		await navigator.clipboard.writeText(documentLink);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={`Share ${document.title}`}
			description="Manage people and link access for this live document."
		>
			<div className="flex flex-col gap-4">
				<form onSubmit={inviteUser} className="flex flex-col gap-2">
					<label
						htmlFor={`share-email-${document._id}`}
						className="text-xs font-medium text-foreground"
					>
						Invite by email
					</label>
					<div className="flex gap-2">
						<input
							id={`share-email-${document._id}`}
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							placeholder="teammate@example.com"
							className="min-w-0 flex-1 rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
						/>
						<RoleSelect value={role} onChange={setRole} includeOwner />
					</div>
					<button
						type="submit"
						disabled={pending || !email.trim()}
						className="self-start rounded-sm bg-primary text-xs font-medium text-primary-foreground disabled:opacity-50 [padding-block:0.375rem] [padding-inline:0.75rem]"
					>
						{pending ? "Sharing..." : "Share"}
					</button>
				</form>

				{documentLink ? (
					<div className="flex flex-col gap-2 border-t border-border [padding-block-start:0.75rem]">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<p className="m-0 text-xs font-medium text-foreground">
									{linkAccess === "off"
										? "Link sharing off"
										: `Anyone with the link can ${linkAccess}`}
								</p>
								<p className="m-0 text-[11px] text-muted-foreground [margin-block-start:0.25rem]">
									Anyone with the document link gets this role.
								</p>
							</div>
							<LinkAccessSelect
								value={linkAccess}
								onChange={updateLinkAccess}
							/>
						</div>
						{linkAccess !== "off" && (
							<div className="flex items-center gap-2 rounded-sm bg-muted/40 [padding-block:0.375rem] [padding-inline:0.5rem]">
								<input
									type="text"
									readOnly
									value={documentLink}
									onFocus={(event) => event.currentTarget.select()}
									className="min-w-0 flex-1 truncate bg-transparent text-[11px] text-muted-foreground outline-none"
								/>
								<button
									type="button"
									onClick={() => void copyLink()}
									className="shrink-0 rounded-sm border border-border bg-background text-[11px] font-medium text-foreground hover:bg-accent [padding-block:0.25rem] [padding-inline:0.5rem]"
								>
									{copied ? "Copied!" : "Copy link"}
								</button>
							</div>
						)}
					</div>
				) : null}

				<div className="border-t border-border [padding-block-start:0.75rem]">
					<p className="m-0 text-xs font-medium text-foreground">People</p>
					<div className="flex max-h-44 flex-col gap-1 overflow-auto [margin-block-start:0.5rem]">
						{shares === undefined && (
							<p className="m-0 text-xs text-muted-foreground">Loading...</p>
						)}
						{shares !== undefined && userShares.length === 0 && (
							<p className="m-0 text-xs text-muted-foreground">
								No direct shares yet.
							</p>
						)}
						{userShares.map((share) => (
							<div
								key={share._id}
								className="flex items-center justify-between gap-2 rounded-sm bg-muted/40 [padding-block:0.375rem] [padding-inline:0.5rem]"
							>
								<div className="min-w-0">
									<p className="m-0 truncate text-xs text-foreground">
										{share.user?.name ?? share.user?.email ?? "Unknown user"}
									</p>
									<p className="m-0 truncate text-[11px] text-muted-foreground">
										{share.user?.email ?? share.role}
									</p>
								</div>
								<div className="flex items-center gap-1">
									<span className="text-[11px] capitalize text-muted-foreground">
										{share.role}
									</span>
									{share.role !== "owner" && share.userId && (
										<button
											type="button"
											className="rounded-sm text-[11px] text-muted-foreground hover:bg-accent hover:text-destructive [padding-block:0.25rem] [padding-inline:0.375rem]"
											onClick={() =>
												void removeUserShare({
													documentId: document._id,
													userId: share.userId as Id<"users">,
												})
											}
										>
											Remove
										</button>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
				{message && (
					<p className="m-0 text-xs text-muted-foreground">{message}</p>
				)}
			</div>
		</Modal>
	);
}

function RoleSelect({
	value,
	onChange,
	includeOwner = false,
}: {
	value: ShareRole;
	onChange: (role: ShareRole) => void;
	includeOwner?: boolean;
}) {
	const roles: ShareRole[] = includeOwner
		? ["editor", "commenter", "viewer", "owner"]
		: ["editor", "commenter", "viewer"];
	return (
		<Select.Root
			value={value}
			onValueChange={(next) => next && onChange(next as ShareRole)}
		>
			<Select.Trigger className="rounded-sm border border-border bg-background text-xs capitalize outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]">
				<Select.Value />
			</Select.Trigger>
			<Select.Portal>
				<Select.Positioner
					align="end"
					side="bottom"
					sideOffset={4}
					style={MODAL_SELECT_POSITIONER_STYLE}
				>
					<Select.Popup className="z-50 w-32 origin-(--transform-origin) rounded-sm border border-border bg-popover p-1 text-xs text-popover-foreground shadow-overlay outline-hidden">
						{roles.map((role) => (
							<Select.Item
								key={role}
								value={role}
								className="flex cursor-pointer items-center gap-2 rounded-sm outline-hidden data-highlighted:bg-accent [padding-block:0.375rem] [padding-inline:0.5rem]"
							>
								<Select.ItemIndicator className="inline-flex" keepMounted>
									<MingcuteCheckLine className="size-3 opacity-0 [[data-selected]_&]:opacity-100" />
								</Select.ItemIndicator>
								<Select.ItemText>
									<span className="capitalize">{role}</span>
								</Select.ItemText>
							</Select.Item>
						))}
					</Select.Popup>
				</Select.Positioner>
			</Select.Portal>
		</Select.Root>
	);
}

function LinkAccessSelect({
	value,
	onChange,
}: {
	value: LinkAccess;
	onChange: (value: LinkAccess) => void | Promise<void>;
}) {
	const options: { value: LinkAccess; label: string }[] = [
		{ value: "off", label: "Off" },
		{ value: "viewer", label: "Viewer" },
		{ value: "commenter", label: "Commenter" },
		{ value: "editor", label: "Editor" },
	];
	return (
		<Select.Root
			value={value}
			onValueChange={(next) => {
				if (next) void onChange(next as LinkAccess);
			}}
		>
			<Select.Trigger className="rounded-sm border border-border bg-background text-xs outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]">
				<Select.Value />
			</Select.Trigger>
			<Select.Portal>
				<Select.Positioner
					align="end"
					side="bottom"
					sideOffset={4}
					style={MODAL_SELECT_POSITIONER_STYLE}
				>
					<Select.Popup className="z-50 w-32 origin-(--transform-origin) rounded-sm border border-border bg-popover p-1 text-xs text-popover-foreground shadow-overlay outline-hidden">
						{options.map((option) => (
							<Select.Item
								key={option.value}
								value={option.value}
								className="flex cursor-pointer items-center gap-2 rounded-sm outline-hidden data-highlighted:bg-accent [padding-block:0.375rem] [padding-inline:0.5rem]"
							>
								<Select.ItemIndicator className="inline-flex" keepMounted>
									<MingcuteCheckLine className="size-3 opacity-0 [[data-selected]_&]:opacity-100" />
								</Select.ItemIndicator>
								<Select.ItemText>{option.label}</Select.ItemText>
							</Select.Item>
						))}
					</Select.Popup>
				</Select.Positioner>
			</Select.Portal>
		</Select.Root>
	);
}

function formatEditedMeta(updatedAt: number, updatedBy?: string) {
	const editedAt = new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(updatedAt));
	return updatedBy
		? `Edited by ${updatedBy} at ${editedAt}`
		: `Edited ${editedAt}`;
}

function NameDialog({
	open,
	title,
	label,
	initialValue,
	submitLabel,
	onOpenChange,
	onSubmit,
}: {
	open: boolean;
	title: string;
	label: string;
	initialValue: string;
	submitLabel: string;
	onOpenChange: (open: boolean) => void;
	onSubmit: (name: string) => void | Promise<void>;
}) {
	const [name, setName] = useState(initialValue);
	const [pending, setPending] = useState(false);
	const inputId = useId();

	useEffect(() => {
		if (open) setName(initialValue);
	}, [initialValue, open]);

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed || pending) return;
		setPending(true);
		try {
			await onSubmit(trimmed);
		} finally {
			setPending(false);
		}
	};

	return (
		<Modal open={open} onOpenChange={onOpenChange} title={title}>
			<form onSubmit={submit} className="flex flex-col gap-3">
				<label
					htmlFor={inputId}
					className="flex flex-col gap-1.5 text-xs font-medium text-foreground"
				>
					<span>{label}</span>
					<Input
						id={inputId}
						value={name}
						onChange={(event) => setName(event.currentTarget.value)}
						onFocus={(event) => event.currentTarget.select()}
						autoFocus
					/>
				</label>
				<div className="flex justify-end gap-2 [padding-block-start:0.25rem]">
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button type="submit" disabled={!name.trim() || pending}>
						{pending ? "Saving..." : submitLabel}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
