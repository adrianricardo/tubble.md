import { useAuthToken } from "@convex-dev/auth/react";
import {
	CloudContentTree,
	type CloudFolderAvailability,
} from "@hubble.md/cloud-ui";
import {
	Button,
	Modal,
	Sidebar as SharedSidebar,
	type SidebarFocusedItem,
	SidebarFrame,
} from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import MingcuteCloudLine from "~icons/mingcute/cloud-line";
import { desktopConvexUrl } from "../convex";
import { desktopApi } from "../desktopApi";
import type { LocalAvailabilityRecord } from "../desktopApi/types";
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
import { LocalAgentAvailabilityOnboarding } from "./LocalAgentAvailabilityOnboarding";
import {
	directScopeKey,
	findDirectAvailability,
} from "./localAgentAvailabilityModel";
import { CloudContextSwitcher, useSelectedCloudContext } from "./SpaceSwitcher";
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
	if (cloudEnabled) {
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
				<div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3 [padding-inline:0.75rem] text-sm">
					<div className="flex flex-col gap-1">
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
			header={<WorkspaceSwitcher />}
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
			className={`flex flex-col gap-2 [padding-block:0.625rem] [padding-inline:0.625rem] ${className ?? ""}`}
		>
			<AuthLoading>
				<p className="text-[11px] text-sidebar-foreground/70">Loading space…</p>
			</AuthLoading>
			<Unauthenticated>
				<div className="grid gap-2">
					<div className="flex min-w-0 items-center gap-1.5">
						<MingcuteCloudLine className="size-3.5 shrink-0 text-muted-foreground" />
						<span className="truncate text-[11px] font-medium uppercase text-muted-foreground">
							Hubble Cloud
						</span>
					</div>
					<p className="text-[11px] text-sidebar-foreground/70">
						Sign in to open your Workspaces and shared folders.
					</p>
					{onOpenSettings ? (
						<Button size="sm" variant="outline" onClick={onOpenSettings}>
							Open settings
						</Button>
					) : null}
				</div>
			</Unauthenticated>
			<Authenticated>
				<AuthenticatedCloudSidebar
					activeDocumentId={activeLiveDocumentId ?? null}
					onOpenDocument={onOpenLiveDocument}
					onOpenSettings={onOpenSettings}
				/>
			</Authenticated>
		</div>
	);
}

function AuthenticatedCloudSidebar({
	activeDocumentId,
	onOpenDocument,
	onOpenSettings,
}: {
	activeDocumentId: string | null;
	onOpenDocument?: (documentId: string) => void;
	onOpenSettings?: () => void;
}) {
	const { spaces, sharedFolders, context } = useSelectedCloudContext();
	const authToken = useAuthToken();
	const [availabilityRecords, setAvailabilityRecords] = useState<
		LocalAvailabilityRecord[]
	>([]);
	const [stopTarget, setStopTarget] = useState<LocalAvailabilityRecord | null>(
		null,
	);
	const [stopping, setStopping] = useState(false);
	const reconnectedForToken = useRef<string | null>(null);
	const refreshAvailability = useCallback(() => {
		void desktopApi.listLocalAvailability().then(setAvailabilityRecords);
	}, []);
	useEffect(() => {
		refreshAvailability();
		const unsubscribeLinked = desktopApi.onRepoLinkLinked(refreshAvailability);
		const unsubscribeSync = desktopApi.onSyncedFolderEvent(refreshAvailability);
		return () => {
			unsubscribeLinked();
			unsubscribeSync();
		};
	}, [refreshAvailability]);
	useEffect(() => {
		if (
			!authToken ||
			!desktopConvexUrl ||
			reconnectedForToken.current === authToken
		)
			return;
		reconnectedForToken.current = authToken;
		void desktopApi
			.reconnectLocalAvailability({
				deploymentUrl: desktopConvexUrl,
				authToken,
			})
			.then(setAvailabilityRecords)
			.catch(() => {
				reconnectedForToken.current = null;
			});
	}, [authToken]);
	const localFolders = useMemo(
		() =>
			availabilityRecords.flatMap((record) =>
				record.scope.kind === "folder"
					? [
							{
								folderId: record.scope.folderId,
								localPath: record.localRoot,
								status: record.state,
							},
						]
					: [],
			),
		[availabilityRecords],
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
	const recordForFolder = (folderId: string) =>
		availabilityRecords.find(
			(record) =>
				record.scope.kind === "folder" && record.scope.folderId === folderId,
		) ?? null;
	const updateAvailability = (next: LocalAvailabilityRecord) => {
		setAvailabilityRecords((current) => [
			...current.filter((record) => record.scopeKey !== next.scopeKey),
			next,
		]);
	};
	const copyLocalPath = async (availability: CloudFolderAvailability) => {
		try {
			await navigator.clipboard.writeText(availability.localPath);
			toast.success("Local path copied");
		} catch {
			toast.error("Failed to copy local path");
		}
	};
	const relocateLocalFolder = async (availability: CloudFolderAvailability) => {
		if (!authToken || !desktopConvexUrl) {
			toast.error("Sign in before relocating local availability");
			return;
		}
		const record = recordForFolder(availability.folderId);
		if (!record) return;
		const mountPath = await desktopApi.createFolderPicker({
			defaultPath: record.localRoot,
			title: `Relocate “${record.displayName}”`,
		});
		if (!mountPath) return;
		try {
			const result = await desktopApi.relocateLocalAvailability({
				scopeKey: record.scopeKey,
				localRoot: mountPath,
				deploymentUrl: desktopConvexUrl,
				authToken,
			});
			if (result.status === "blocked") {
				toast.error("Local availability can’t be relocated yet", {
					description: result.cleanliness.message,
				});
				return;
			}
			updateAvailability(result.availability);
			toast.success("Local availability relocated", {
				description: result.availability.localRoot,
			});
		} catch (error) {
			refreshAvailability();
			toast.error("Failed to relocate local availability", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	};
	const requestStop = async (availability: CloudFolderAvailability) => {
		const record = recordForFolder(availability.folderId);
		if (!record) return;
		try {
			const cleanliness = await desktopApi.inspectLocalAvailability(
				record.scopeKey,
			);
			if (cleanliness.state === "blocked") {
				toast.error("Local availability can’t stop yet", {
					description: cleanliness.message,
				});
				return;
			}
			setStopTarget(record);
		} catch (error) {
			toast.error("Could not inspect local availability", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	};
	const confirmStop = async (keepFiles: boolean) => {
		if (!stopTarget || stopping) return;
		if (!authToken || !desktopConvexUrl) {
			toast.error("Sign in before stopping local availability");
			return;
		}
		setStopping(true);
		try {
			const result = await desktopApi.stopLocalAvailability({
				scopeKey: stopTarget.scopeKey,
				keepFiles,
				deploymentUrl: desktopConvexUrl,
				authToken,
			});
			if (result.status === "blocked") {
				toast.error("Local availability can’t stop yet", {
					description: result.cleanliness.message,
				});
				return;
			}
			setStopTarget(null);
			setAvailabilityRecords((current) =>
				current.filter((record) => record.scopeKey !== stopTarget.scopeKey),
			);
			toast.success("Local availability stopped", {
				description: keepFiles
					? `The files at ${result.localRoot} are now a detached copy.`
					: "The clean managed files were removed from this computer.",
			});
		} catch (error) {
			toast.error("Failed to stop local availability", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setStopping(false);
		}
	};

	if (!spaces || !sharedFolders) {
		return (
			<p className="text-[11px] text-sidebar-foreground/70">Loading content…</p>
		);
	}
	const selectedSpace =
		context?.kind === "workspace"
			? spaces.find((space) => space._id === context.workspaceId)
			: undefined;
	const directScope = context
		? context.kind === "workspace"
			? ({ kind: "workspace", workspaceId: context.workspaceId } as const)
			: ({
					kind: "folder",
					workspaceId: context.workspaceId,
					folderId: context.folderId,
				} as const)
		: null;
	const matchingAvailability = directScope
		? findDirectAvailability(availabilityRecords, directScope)
		: null;
	const legacyMirror =
		availabilityRecords.find((record) => record.incompatible) ?? null;
	const displayName = selectedSpace?.name ?? selectedSharedFolder?.name ?? "";
	const readOnly =
		selectedSharedFolder?.role === "viewer" ||
		selectedSharedFolder?.role === "commenter";

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
					{directScope && displayName ? (
						<LocalAgentAvailabilityOnboarding
							key={directScopeKey(directScope)}
							scope={directScope}
							displayName={displayName}
							contextDetail={
								selectedSharedFolder
									? `Shared from ${selectedSharedFolder.workspaceName} · ${selectedSharedFolder.role}`
									: "Member Space"
							}
							capability={readOnly ? "read-only" : "read-write"}
							availability={matchingAvailability}
							legacyMirror={legacyMirror}
							authToken={authToken}
							onAvailabilityChanged={updateAvailability}
							onOpenSettings={onOpenSettings ?? (() => undefined)}
						/>
					) : null}
					<CloudContentTree
						context={context}
						selectedDocumentId={activeDocumentId}
						onSelectDocument={openDocument}
						localFolders={localFolders}
						onRevealLocalFolder={(availability) =>
							void desktopApi.revealFile(availability.localPath)
						}
						onCopyLocalPath={(availability) => void copyLocalPath(availability)}
						onRelocateLocalFolder={(availability) =>
							void relocateLocalFolder(availability)
						}
						onStopLocalFolder={(availability) => void requestStop(availability)}
					/>
				</>
			) : (
				<p className="m-0 text-[11px] text-muted-foreground [padding-block:0.5rem] [padding-inline:0.5rem]">
					Create a Workspace or ask someone to share a folder with you.
				</p>
			)}
			<Modal
				open={stopTarget !== null}
				onOpenChange={(open) => {
					if (!open && !stopping) setStopTarget(null);
				}}
				title="Stop making this folder available?"
				description="This changes only this computer. Cloud documents and sharing stay unchanged."
			>
				<div className="flex flex-col gap-3">
					<p className="m-0 break-all rounded-sm bg-muted text-[11px] text-muted-foreground [padding-block:0.5rem] [padding-inline:0.625rem]">
						{stopTarget?.localRoot}
					</p>
					<p className="m-0 text-xs text-foreground">
						Hubble verified that the managed files match the synchronized cloud
						content. You can keep them as a detached Markdown copy or remove
						them from this computer.
					</p>
					<div className="flex flex-wrap justify-end gap-2 [padding-block-start:0.25rem]">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setStopTarget(null)}
							disabled={stopping}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => void confirmStop(false)}
							disabled={stopping}
						>
							Remove local files
						</Button>
						<Button
							type="button"
							onClick={() => void confirmStop(true)}
							disabled={stopping}
							autoFocus
						>
							{stopping ? "Stopping…" : "Keep detached copy"}
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
