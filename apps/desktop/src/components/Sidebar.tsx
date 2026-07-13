import {
	CloudContentTree,
	FoldersSection,
	LiveDocumentsSection,
} from "@hubble.md/cloud-ui";
import { api } from "@hubble.md/sync-backend";
import {
	Button,
	Sidebar as SharedSidebar,
	type SidebarFocusedItem,
	SidebarFrame,
} from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import {
	Authenticated,
	AuthLoading,
	Unauthenticated,
	useMutation,
	useQuery,
} from "convex/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteCloudLine from "~icons/mingcute/cloud-line";
import { desktopApi } from "../desktopApi";
import type { RepoMount } from "../desktopApi/types";
import { unifiedCloudTreeEnabled } from "../featureFlags";
import { revealFileLabel } from "../lib/revealFile";
import {
	createMarkdownFileInFolder,
	deleteFolder,
	deleteMarkdownFile,
	loadPath,
	moveSidebarItem,
	openWorkspace,
	renameMarkdownFile,
	setSidebarOpen,
	setSortMode,
	togglePinnedNote,
} from "../store/actions";
import {
	currentPathStore,
	sidebarOpenStore,
	workspaceStore,
} from "../store/state";
import { CloudDocumentCreateButton } from "./CloudDocumentCreateButton";
import {
	CloudContextSwitcher,
	SpaceSwitcher,
	useSelectedCloudContext,
	useSelectedSpace,
} from "./SpaceSwitcher";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function Sidebar({
	cloudEnabled,
	footer,
	activeLiveDocumentId,
	onOpenLiveDocument,
	onOpenSettings,
	onFocusedPathChange,
}: {
	cloudEnabled?: boolean;
	footer?: ReactNode;
	activeLiveDocumentId?: string | null;
	onOpenLiveDocument?: (documentId: string) => void;
	onOpenSettings?: () => void;
	onFocusedPathChange?: (path: string | null) => void;
}) {
	const workspace = useStoreValue(workspaceStore);
	const sidebarOpen = useStoreValue(sidebarOpenStore);
	const currentPath = useStoreValue(currentPathStore);
	const { workspacePath, files, folders, pinnedNotes, sortMode } = workspace;
	const pinnedSet = new Set(pinnedNotes);

	if (!sidebarOpen) return null;
	const collapseSidebar = () => setSidebarOpen(false);
	if (cloudEnabled && unifiedCloudTreeEnabled) {
		return (
			<SidebarFrame onCollapse={collapseSidebar}>
				<CloudSidebarSection
					activeLiveDocumentId={activeLiveDocumentId}
					onOpenLiveDocument={onOpenLiveDocument}
					onOpenSettings={onOpenSettings}
					className="flex min-h-0 flex-1 flex-col overflow-hidden"
				/>
				{footer ? (
					<div className="border-t border-sidebar-border [padding-block:0.5rem] [padding-inline:0.5rem]">
						{footer}
					</div>
				) : null}
			</SidebarFrame>
		);
	}
	if (!workspacePath) {
		return (
			<SidebarFrame onCollapse={collapseSidebar}>
				{cloudEnabled ? (
					<CloudSidebarSection
						activeLiveDocumentId={activeLiveDocumentId}
						onOpenLiveDocument={onOpenLiveDocument}
						onOpenSettings={onOpenSettings}
						className="[border-block-end:1px_solid_var(--sidebar-border)]"
					/>
				) : null}
				<div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3 [padding-inline:0.75rem] text-sm">
					<div className="flex flex-col gap-1">
						{cloudEnabled ? <OnThisComputerCaption /> : null}
						<p className="font-medium text-sidebar-foreground">
							No local folder selected
						</p>
						<p className="text-sidebar-foreground/70">
							Add a folder for local Markdown files, backup, grep, and agent
							access.
						</p>
					</div>
					<Button size="sm" onClick={() => void openWorkspace()}>
						Open local folder
					</Button>
				</div>
				{footer ? (
					<div className="border-t border-sidebar-border [padding-block:0.5rem] [padding-inline:0.5rem]">
						{footer}
					</div>
				) : null}
			</SidebarFrame>
		);
	}

	const relativePath = (absPath: string) => {
		const prefix = workspacePath.endsWith("/")
			? workspacePath
			: `${workspacePath}/`;
		return absPath.startsWith(prefix) ? absPath.slice(prefix.length) : absPath;
	};
	const absolutePath = (displayPath: string | null) => {
		if (!displayPath) return workspacePath;
		const normalized = displayPath.replace(/\/+$/, "");
		return workspacePath.endsWith("/")
			? `${workspacePath}${normalized}`
			: `${workspacePath}/${normalized}`;
	};
	const copyFilePath = async (path: string) => {
		try {
			await navigator.clipboard.writeText(path);
			toast.success("File path copied");
		} catch {
			toast.error("Failed to copy file path");
		}
	};

	return (
		<SharedSidebar
			files={files.map((file) => ({
				path: file.path,
				modifiedAt: file.modified_at,
				pinned: pinnedSet.has(file.path),
			}))}
			folders={folders.map((folder) => ({
				path: folder.path,
				modifiedAt: folder.modified_at,
			}))}
			currentPath={currentPath ?? null}
			sortMode={sortMode}
			storageScope={workspacePath}
			header={
				cloudEnabled ? (
					<div className="flex min-w-0 flex-col items-start">
						<OnThisComputerCaption />
						<WorkspaceSwitcher />
					</div>
				) : (
					<WorkspaceSwitcher />
				)
			}
			topSlot={
				cloudEnabled ? (
					<CloudSidebarSection
						activeLiveDocumentId={activeLiveDocumentId}
						onOpenLiveDocument={onOpenLiveDocument}
						onOpenSettings={onOpenSettings}
						className="[border-block-end:1px_solid_var(--sidebar-border)]"
					/>
				) : undefined
			}
			footer={footer}
			getDisplayPath={relativePath}
			onCollapse={collapseSidebar}
			onSortModeChange={setSortMode}
			onSelectFile={(path) => void loadPath(path)}
			onRevealFile={(path) => void desktopApi.revealFile(path)}
			onCopyFilePath={(path) => void copyFilePath(path)}
			onRevealFolder={(folderId) =>
				void desktopApi.revealFile(absolutePath(folderId))
			}
			onFocusedItemChange={(item: SidebarFocusedItem) => {
				if (!item) {
					onFocusedPathChange?.(null);
					return;
				}
				onFocusedPathChange?.(
					item.kind === "file" ? item.path : absolutePath(item.folderId),
				);
			}}
			revealLabel={revealFileLabel(desktopApi.platform)}
			onRenameFile={(path, nextName) => void renameMarkdownFile(path, nextName)}
			onDeleteFile={(path) => void deleteMarkdownFile(path)}
			onTogglePinnedFile={(path) => void togglePinnedNote(path)}
			onCreateFile={(folderId) =>
				createMarkdownFileInFolder(absolutePath(folderId))
			}
			onDeleteFolder={(folderId) => void deleteFolder(absolutePath(folderId))}
			onMoveItem={({ item, targetFolderId }) =>
				void moveSidebarItem(item, absolutePath(targetFolderId))
			}
		/>
	);
}

// Desktop copy of the local-folder wayfinding rule: the sidebar's top row is
// always "which space am I in?"; this caption marks where the answer switches
// to "how does this space live on this machine?".
function OnThisComputerCaption() {
	return (
		<span className="text-[10px] font-medium uppercase text-muted-foreground [padding-inline-start:0.5rem]">
			On this computer
		</span>
	);
}

function CloudSidebarSection({
	activeLiveDocumentId,
	onOpenLiveDocument,
	onOpenSettings,
	className,
}: {
	activeLiveDocumentId?: string | null;
	onOpenLiveDocument?: (documentId: string) => void;
	onOpenSettings?: () => void;
	className?: string;
}) {
	return (
		<div
			className={`${unifiedCloudTreeEnabled ? "flex flex-col" : "grid"} gap-2 [padding-block:0.625rem] [padding-inline:0.625rem] ${className ?? ""}`}
		>
			<AuthLoading>
				<p className="text-[11px] text-sidebar-foreground/70">Loading space…</p>
			</AuthLoading>
			<Unauthenticated>
				<div className="grid gap-2">
					<div className="flex min-w-0 items-center gap-1.5">
						<MingcuteCloudLine className="size-3.5 shrink-0 text-muted-foreground" />
						<span className="truncate text-[11px] font-medium uppercase text-muted-foreground">
							Live Documents
						</span>
					</div>
					<p className="text-[11px] text-sidebar-foreground/70">
						Sign in to see your spaces and Live Documents.
					</p>
					{onOpenSettings ? (
						<Button size="sm" variant="outline" onClick={onOpenSettings}>
							Open settings
						</Button>
					) : null}
				</div>
			</Unauthenticated>
			<Authenticated>
				{unifiedCloudTreeEnabled ? (
					<UnifiedAuthenticatedCloudSidebar
						activeDocumentId={activeLiveDocumentId ?? null}
						onOpenDocument={onOpenLiveDocument}
					/>
				) : (
					<>
						<div className="flex items-center justify-between gap-2">
							<SpaceSwitcher />
							<CloudSidebarCreateButton
								onOpenLiveDocument={onOpenLiveDocument}
							/>
						</div>
						<AuthenticatedCloudSidebarSection
							activeLiveDocumentId={activeLiveDocumentId}
							onOpenLiveDocument={onOpenLiveDocument}
						/>
					</>
				)}
			</Authenticated>
		</div>
	);
}

function UnifiedAuthenticatedCloudSidebar({
	activeDocumentId,
	onOpenDocument,
}: {
	activeDocumentId: string | null;
	onOpenDocument?: (documentId: string) => void;
}) {
	const { spaces, sharedFolders, context } = useSelectedCloudContext();
	const [mounts, setMounts] = useState<RepoMount[]>([]);
	useEffect(() => {
		let active = true;
		const refresh = () => {
			void desktopApi.listRepoMounts().then((next) => {
				if (active) setMounts(next);
			});
		};
		refresh();
		const unsubscribeLinked = desktopApi.onRepoLinkLinked(refresh);
		const unsubscribeSync = desktopApi.onSyncedFolderEvent(refresh);
		return () => {
			active = false;
			unsubscribeLinked();
			unsubscribeSync();
		};
	}, []);
	const localFolders = useMemo(
		() =>
			mounts.map((mount) => ({
				folderId: mount.folderId,
				localPath: mount.mountPath,
				status: mount.status,
			})),
		[mounts],
	);
	const selectedSharedFolder =
		context?.kind === "shared-folder"
			? sharedFolders?.find((folder) => folder.folderId === context.folderId)
			: undefined;
	const canCreate =
		context?.kind === "workspace" ||
		selectedSharedFolder?.role === "owner" ||
		selectedSharedFolder?.role === "editor";
	const openDocument = (documentId: string) => {
		if (onOpenDocument) onOpenDocument(documentId);
		else toast("Document opening is unavailable in this window");
	};

	if (!spaces || !sharedFolders) {
		return (
			<p className="text-[11px] text-sidebar-foreground/70">Loading content…</p>
		);
	}

	return (
		<div className="flex min-h-0 flex-col gap-1">
			<div className="flex items-center justify-between gap-2">
				<CloudContextSwitcher
					spaces={spaces}
					sharedFolders={sharedFolders}
					context={context}
				/>
				<CloudDocumentCreateButton
					context={context}
					canCreate={canCreate}
					onOpenDocument={openDocument}
				/>
			</div>
			{context ? (
				<>
					{selectedSharedFolder ? (
						<p className="m-0 truncate text-[10px] text-muted-foreground [padding-inline:0.5rem]">
							{selectedSharedFolder.workspaceName} · {selectedSharedFolder.role}
						</p>
					) : null}
					<CloudContentTree
						context={context}
						selectedDocumentId={activeDocumentId}
						onSelectDocument={openDocument}
						localFolders={localFolders}
					/>
				</>
			) : (
				<p className="m-0 text-[11px] text-muted-foreground [padding-block:0.5rem] [padding-inline:0.5rem]">
					Create a Workspace or ask someone to share a folder with you.
				</p>
			)}
		</div>
	);
}

function CloudSidebarCreateButton({
	onOpenLiveDocument,
}: {
	onOpenLiveDocument?: (documentId: string) => void;
}) {
	const { space } = useSelectedSpace();
	const createDocument = useMutation(api.documents.create);
	const [creating, setCreating] = useState(false);

	const createLiveDocument = async () => {
		if (!space || creating) return;
		setCreating(true);
		try {
			const documentId = await createDocument({
				workspaceId: space._id,
				title: "Untitled",
			});
			onOpenLiveDocument?.(documentId);
			toast.success("Live Document created");
		} catch (error) {
			toast.error("Failed to create Live Document", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setCreating(false);
		}
	};

	return (
		<Button
			variant="ghost"
			size="icon-xs"
			aria-label="New Live Document"
			title="New Live Document"
			disabled={!space || creating}
			onClick={() => void createLiveDocument()}
		>
			<MingcuteAddLine className="size-3.5" />
		</Button>
	);
}

function AuthenticatedCloudSidebarSection({
	activeLiveDocumentId,
	onOpenLiveDocument,
}: {
	activeLiveDocumentId?: string | null;
	onOpenLiveDocument?: (documentId: string) => void;
}) {
	const { spaces, space } = useSelectedSpace();
	// Guest-safe query (D12): direct shares and folder shares live outside the
	// member-gated space list.
	const sharedWithMe = useQuery(api.documents.listSharedWithMe, {});

	const openDocument = (documentId: string) => {
		if (onOpenLiveDocument) {
			onOpenLiveDocument(documentId);
			return;
		}
		toast("Live Document opening is unavailable in this window");
	};

	if (spaces === undefined) {
		return (
			<p className="text-[11px] text-sidebar-foreground/70">
				Loading documents…
			</p>
		);
	}

	const sharedDocuments = sharedWithMe?.documents ?? [];

	return (
		<div className="grid gap-2">
			{space ? (
				<>
					<FoldersSection
						workspaceId={space._id}
						selectedDocumentId={activeLiveDocumentId ?? null}
						onSelectDocument={openDocument}
					/>
					<LiveDocumentsSection
						workspaceId={space._id}
						selectedDocumentId={activeLiveDocumentId ?? null}
						onSelectDocument={openDocument}
					/>
				</>
			) : null}
			{sharedDocuments.length > 0 ? (
				<div className="grid gap-0.5">
					<span className="truncate text-[10px] font-medium uppercase text-muted-foreground">
						Shared with me
					</span>
					{sharedDocuments.map((document) => (
						<CloudDocumentRow
							key={document._id}
							title={document.title}
							onOpen={() => openDocument(document._id)}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

function CloudDocumentRow({
	title,
	onOpen,
}: {
	title: string;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			className="min-w-0 truncate rounded-sm text-start text-[11px] text-sidebar-foreground hover:bg-sidebar-accent [padding-block:0.25rem] [padding-inline:0.375rem]"
			title={title}
			onClick={onOpen}
		>
			{title}
		</button>
	);
}
