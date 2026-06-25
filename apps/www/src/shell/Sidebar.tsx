import { Select } from "@base-ui/react/select";
import { api } from "@hubble.md/sync-backend";
import type { Doc, Id } from "@hubble.md/sync-backend/types";
import { Modal, Sidebar as SharedSidebar } from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteCheckLine from "~icons/mingcute/check-line";
import MingcuteDeleteLine from "~icons/mingcute/delete-line";
import MingcuteEditLine from "~icons/mingcute/edit-line";
import MingcuteShareForwardLine from "~icons/mingcute/share-forward-line";
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

type ShareRole = "owner" | "editor" | "commenter" | "viewer";
type LinkAccess = "off" | "viewer" | "commenter" | "editor";

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
			/>
		</>
	);
}

function ShareDocumentDialog({
	document,
	open,
	onOpenChange,
}: {
	document: Doc<"documents">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
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
	const publicShare = shares?.find((share) => share.linkScope === "public");
	const linkAccess = (publicShare?.role ?? "off") as LinkAccess;
	const userShares = shares?.filter((share) => share.userId) ?? [];

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

				<div className="flex items-center justify-between gap-3 border-t border-border [padding-block-start:0.75rem]">
					<div className="min-w-0">
						<p className="m-0 text-xs font-medium text-foreground">
							Public link
						</p>
						<p className="m-0 mt-1 text-[11px] text-muted-foreground">
							Anyone with the document link gets this role.
						</p>
					</div>
					<LinkAccessSelect value={linkAccess} onChange={updateLinkAccess} />
				</div>

				<div className="border-t border-border [padding-block-start:0.75rem]">
					<p className="m-0 text-xs font-medium text-foreground">People</p>
					<div className="mt-2 flex max-h-44 flex-col gap-1 overflow-auto">
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
				<Select.Positioner align="end" side="bottom" sideOffset={4}>
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
				<Select.Positioner align="end" side="bottom" sideOffset={4}>
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
