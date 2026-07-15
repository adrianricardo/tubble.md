import { useAuthToken } from "@convex-dev/auth/react";
import {
	CloudContentTree,
	type CloudDocumentMoveRequest,
	type CloudFolderAvailability,
	type CloudTreeActionTarget,
	type CloudTreeCapabilities,
	cloudContextRootFolderId,
	FolderShareDialog,
} from "@hubble.md/cloud-ui";
import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import {
	Button,
	Input,
	Modal,
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
	useQueries,
	useQuery,
} from "convex/react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import MingcuteCloudLine from "~icons/mingcute/cloud-line";
import MingcuteFolderLine from "~icons/mingcute/folder-line";
import { desktopConvexUrl } from "../convex";
import { desktopApi } from "../desktopApi";
import type {
	AuthorityTransferOperation,
	FolderAuthorityPlacement,
	LocalAvailabilityRecord,
} from "../desktopApi/types";
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
	contentContextStore,
	currentPathStore,
	sidebarOpenStore,
	workspaceStore,
} from "../store/state";
import {
	AuthorityMovePreviewDialog,
	type AuthorityPreviewTarget,
} from "./AuthorityMovePreviewDialog";
import {
	displayFolderName,
	selectAuthorityRecoveryOperation,
} from "./authorityMovePreviewModel";
import { CloudDocumentCreateButton } from "./CloudDocumentCreateButton";
import { LocalAgentAvailabilityOnboarding } from "./LocalAgentAvailabilityOnboarding";
import {
	directScopeKey,
	findDirectAvailability,
	healthyAvailabilityPath,
} from "./localAgentAvailabilityModel";
import { CloudContextSwitcher, useSelectedCloudContext } from "./SpaceSwitcher";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

type RelocationImpact = {
	gainingUserCount: number;
	losingUserCount: number;
	publicAccessChanged: boolean;
	repoExposureChanged: boolean;
	userChanges: Array<{
		userId: string;
		name: string | null;
		email: string | null;
		fromRole: string | null;
		toRole: string | null;
	}>;
	userChangesTruncated: boolean;
	publicAccessChange: { fromRole: string | null; toRole: string | null };
	repositoryChanges: Array<{
		change: "added" | "removed";
		folderId: string;
		folderPath: string;
		repoName: string | null;
		repoRemoteUrl: string | null;
	}>;
};

const authorityPreviewMenuSettleMs = 50;

function currentMenuTrigger(): HTMLElement | null {
	const active = document.activeElement;
	if (
		active instanceof HTMLElement &&
		active.getAttribute("aria-label")?.startsWith("Actions for ")
	) {
		return active;
	}
	const menu = active?.closest<HTMLElement>("[role=menu]");
	const triggerId = menu?.getAttribute("aria-labelledby");
	return triggerId ? document.getElementById(triggerId) : null;
}

function useAuthorityPreview() {
	const [target, setTarget] = useState<AuthorityPreviewTarget | null>(null);
	const returnFocusRef = useRef<HTMLElement | null>(null);
	const open = (nextTarget: AuthorityPreviewTarget) => {
		returnFocusRef.current = currentMenuTrigger();
		window.setTimeout(
			() => setTarget(nextTarget),
			authorityPreviewMenuSettleMs,
		);
	};
	const close = () => {
		setTarget(null);
		window.setTimeout(() => returnFocusRef.current?.focus(), 0);
	};
	const replace = (nextTarget: AuthorityPreviewTarget) => setTarget(nextTarget);
	return { target, open, replace, close };
}

function authorityPreviewKey(target: AuthorityPreviewTarget) {
	return target.direction === "git-to-cloud"
		? `${target.direction}:${target.intent}:${target.folderPath}`
		: `${target.direction}:${target.intent}:${target.folderId}`;
}

function AuthorityTransferRecoveryNotice() {
	const authToken = useAuthToken();
	const [online, setOnline] = useState(() => navigator.onLine);
	const [operations, setOperations] = useState<AuthorityTransferOperation[]>(
		[],
	);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const refresh = useCallback(() => {
		void desktopApi.listAuthorityTransferOperations().then(setOperations);
	}, []);
	useEffect(refresh, [refresh]);
	useEffect(() => {
		const update = () => setOnline(navigator.onLine);
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, []);
	const operation = selectAuthorityRecoveryOperation(operations);
	if (!operation) return null;
	const resume = async () => {
		if (!authToken || !desktopConvexUrl || busyId) return;
		setBusyId(operation.id);
		setError(null);
		try {
			if (
				operation.direction === "git-to-cloud" &&
				operation.source.kind === "git" &&
				operation.destination?.kind === "cloud" &&
				operation.previewFingerprint &&
				operation.audienceFingerprint &&
				operation.intent !== "export-copy"
			) {
				const folderPath = joinAuthorityPath(
					operation.source.repoRoot,
					operation.source.relativePath,
				);
				const result = await desktopApi.moveGitFolderToCloud({
					operationId: operation.id,
					folderPath,
					workspaceId: operation.destination.workspaceId,
					parentFolderId: operation.destination.parentFolderId,
					deploymentUrl: desktopConvexUrl,
					authToken,
					expectedPreviewFingerprint: operation.previewFingerprint,
					expectedAudienceFingerprint: operation.audienceFingerprint,
					intent: operation.intent,
					requestedShares: operation.requestedShares ?? [],
				});
				if (result.status !== "completed") {
					throw new Error(
						result.status === "stale"
							? "The move changed. Open the folder action and review it again."
							: result.message,
					);
				}
			} else if (
				operation.direction === "cloud-to-git" &&
				operation.source.kind === "cloud" &&
				operation.destination?.kind === "git" &&
				operation.previewFingerprint &&
				operation.destinationPreviewFingerprint
			) {
				const result = await desktopApi.moveCloudFolderToGit({
					operationId: operation.id,
					cloudFolderId: operation.source.folderId,
					repositoryPath: operation.destination.repoRoot,
					relativePath: operation.destination.relativePath,
					placementId: operation.sourcePlacement?.id ?? null,
					deploymentUrl: desktopConvexUrl,
					authToken,
					expectedCloudPreviewFingerprint: operation.previewFingerprint,
					expectedDestinationFingerprint:
						operation.destinationPreviewFingerprint,
					intent: operation.intent === "export-copy" ? "export-copy" : "move",
				});
				if (result.status !== "completed") {
					throw new Error(
						result.status === "stale"
							? "The move changed. Open the folder action and review it again."
							: result.message,
					);
				}
			} else {
				throw new Error("This older move needs a fresh folder preview");
			}
			toast.success(
				operation.intent === "export-copy"
					? "Git copy exported"
					: "Folder move completed",
			);
			refresh();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			refresh();
			setBusyId(null);
		}
	};
	const undoCompletedMove = async () => {
		if (
			operation.direction !== "cloud-to-git" ||
			operation.phase !== "completed" ||
			!authToken ||
			!desktopConvexUrl ||
			busyId
		) {
			return;
		}
		setBusyId(operation.id);
		setError(null);
		try {
			const eligible = await desktopApi.getCloudToGitUndoEligibility(
				operation.id,
			);
			if (!eligible) {
				setError(
					"Git bytes changed. Use Move to Hubble Cloud from the Git folder menu to review the reverse move.",
				);
				return;
			}
			const result = await desktopApi.undoCloudToGitAuthorityMove({
				operationId: operation.id,
				deploymentUrl: desktopConvexUrl,
				authToken,
			});
			if (result.status !== "restored") {
				throw new Error(
					result.status === "changed"
						? "Git bytes changed. Start the reverse move from the folder menu."
						: result.message,
				);
			}
			toast.success("Cloud folder restored");
			refresh();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusyId(null);
		}
	};
	const completed = operation.phase === "completed";
	const recoveryPath =
		completed && operation.direction === "git-to-cloud"
			? operation.recoveryPath
			: null;
	const operationPath =
		operation.source.kind === "git"
			? joinAuthorityPath(
					operation.source.repoRoot,
					operation.source.relativePath,
				)
			: operation.destination?.kind === "git"
				? joinAuthorityPath(
						operation.destination.repoRoot,
						operation.destination.relativePath,
					)
				: operation.source.folderId;
	return (
		<output
			aria-live="polite"
			className="flex flex-col gap-1.5 border-b border-sidebar-border bg-sidebar-accent/35 text-[11px] [padding-block:0.5rem] [padding-inline:0.625rem]"
		>
			<span className="font-medium text-sidebar-foreground">
				{completed
					? operation.direction === "git-to-cloud"
						? "Hubble Cloud home · Git recovery retained"
						: "Git home · cloud recovery retained"
					: `${operation.intent === "export-copy" ? "Git export" : "Folder move"}: ${operation.phase.replace("-", " ")}`}
			</span>
			<span className="break-all text-sidebar-foreground/70">
				{operationPath}
			</span>
			{error ? <span role="alert">{error}</span> : null}
			{completed ? (
				<>
					<span>
						No automatic recovery expiry is scheduled; permanent retention is
						not promised.
					</span>
					<div className="flex flex-wrap gap-1.5">
						{recoveryPath ? (
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => void navigator.clipboard.writeText(recoveryPath)}
							>
								Copy recovery path
							</Button>
						) : null}
						{operation.direction === "cloud-to-git" ? (
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={
									!online || !authToken || !desktopConvexUrl || busyId !== null
								}
								onClick={() => void undoCompletedMove()}
							>
								{busyId ? "Restoring…" : "Undo unchanged move"}
							</Button>
						) : null}
					</div>
				</>
			) : (
				<>
					{!online ? (
						<span>Reconnect to resume this cloud operation.</span>
					) : null}
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={
							!online || !authToken || !desktopConvexUrl || busyId !== null
						}
						onClick={() => void resume()}
					>
						{busyId
							? "Resuming…"
							: operation.intent === "export-copy"
								? "Resume export"
								: "Resume move"}
					</Button>
				</>
			)}
		</output>
	);
}

type MixedAuthorityEntries = {
	files: Array<{ path: string; modifiedAt?: number; pinned?: boolean }>;
	folders: Array<{ path: string; modifiedAt?: number }>;
	cloudFolderIds: Set<string>;
	cloudBoundaryFolderIds: Set<string>;
	cloudFilePaths: Set<string>;
	cloudDocumentByPath: Map<string, string>;
};

function joinAuthorityPath(root: string, relativePath: string) {
	return `${root.replace(/\/+$/, "")}/${relativePath.replace(/^\/+/, "")}`;
}

function MixedAuthorityEntriesProvider({
	workspacePath,
	localFiles,
	localFolders,
	children,
}: {
	workspacePath: string;
	localFiles: MixedAuthorityEntries["files"];
	localFolders: MixedAuthorityEntries["folders"];
	children: (entries: MixedAuthorityEntries) => ReactNode;
}) {
	const [placements, setPlacements] = useState<FolderAuthorityPlacement[]>([]);
	const refresh = useCallback(() => {
		void desktopApi.listFolderAuthorityPlacements().then(setPlacements);
	}, []);
	useEffect(() => {
		refresh();
		return desktopApi.onFolderAuthorityChanged(refresh);
	}, [refresh]);
	const workspacePlacements = useMemo(
		() =>
			placements.filter(
				(placement) =>
					placement.repoRoot.replace(/\/+$/, "") ===
					workspacePath.replace(/\/+$/, ""),
			),
		[placements, workspacePath],
	);
	const requests = useMemo(
		() =>
			Object.fromEntries(
				workspacePlacements.map((placement) => [
					placement.id,
					{
						query: api.folders.listSubtree,
						args: { folderId: placement.cloudFolderId as Id<"folders"> },
					},
				]),
			),
		[workspacePlacements],
	);
	const subtrees = useQueries(requests);
	const entries = useMemo<MixedAuthorityEntries>(() => {
		const files = [...localFiles];
		const folders = [...localFolders];
		const cloudFolderIds = new Set<string>();
		const cloudBoundaryFolderIds = new Set<string>();
		const cloudFilePaths = new Set<string>();
		const cloudDocumentByPath = new Map<string, string>();
		for (const placement of workspacePlacements) {
			const boundaryPath = joinAuthorityPath(
				workspacePath,
				placement.relativePath,
			);
			folders.push({ path: boundaryPath });
			cloudFolderIds.add(placement.relativePath);
			cloudBoundaryFolderIds.add(placement.relativePath);
			const subtree = subtrees[placement.id];
			if (!subtree || subtree instanceof Error) continue;
			for (const folder of subtree.folders as Array<{
				relativePath: string;
			}>) {
				const absolutePath = joinAuthorityPath(
					boundaryPath,
					folder.relativePath,
				);
				folders.push({ path: absolutePath });
				cloudFolderIds.add(`${placement.relativePath}/${folder.relativePath}`);
			}
			for (const document of subtree.documents as Array<{
				_id: string;
				relativePath: string;
				path: string | null;
				title: string;
				updatedAt: number;
			}>) {
				const relativeDocumentPath = [
					document.relativePath,
					(document.path ? document.path.split("/").slice(-1)[0] : null) ??
						`${document.title}.md`,
				]
					.filter(Boolean)
					.join("/");
				const absolutePath = joinAuthorityPath(
					boundaryPath,
					relativeDocumentPath,
				);
				files.push({ path: absolutePath, modifiedAt: document.updatedAt });
				cloudFilePaths.add(absolutePath);
				cloudDocumentByPath.set(absolutePath, document._id);
			}
		}
		return {
			files,
			folders,
			cloudFolderIds,
			cloudBoundaryFolderIds,
			cloudFilePaths,
			cloudDocumentByPath,
		};
	}, [localFiles, localFolders, subtrees, workspacePath, workspacePlacements]);
	return children(entries);
}

export function Sidebar({
	cloudEnabled,
	footer,
	activeLiveDocumentId,
	onOpenLiveDocument,
	onOpenSettings,
	onFocusedPathChange,
	onLocalAvailabilityPathChange,
}: {
	cloudEnabled?: boolean;
	footer?: ReactNode;
	activeLiveDocumentId?: string | null;
	onOpenLiveDocument?: (documentId: string) => void;
	onOpenSettings?: () => void;
	onFocusedPathChange?: (path: string | null) => void;
	onLocalAvailabilityPathChange?: (
		availability: { scopeKey: string; path: string } | null,
	) => void;
}) {
	const workspace = useStoreValue(workspaceStore);
	const contentContext = useStoreValue(contentContextStore);
	const sidebarOpen = useStoreValue(sidebarOpenStore);
	const currentPath = useStoreValue(currentPathStore);
	const { workspacePath, files, folders, pinnedNotes, sortMode } = workspace;
	const pinnedSet = new Set(pinnedNotes);
	const authorityPreview = useAuthorityPreview();
	const [completedShareTarget, setCompletedShareTarget] = useState<{
		folderId: string;
		name: string;
	} | null>(null);

	if (!sidebarOpen) return null;
	const collapseSidebar = () => setSidebarOpen(false);
	if (cloudEnabled && contentContext.kind === "cloud") {
		return (
			<SidebarFrame onCollapse={collapseSidebar}>
				<AuthorityTransferRecoveryNotice />
				<CloudSidebarSection
					activeLiveDocumentId={activeLiveDocumentId}
					onOpenLiveDocument={onOpenLiveDocument}
					onOpenSettings={onOpenSettings}
					onLocalAvailabilityPathChange={onLocalAvailabilityPathChange}
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
				{cloudEnabled ? <AuthorityTransferRecoveryNotice /> : null}
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

	const localFiles = files.map((file) => ({
		path: file.path,
		modifiedAt: file.modified_at,
		pinned: pinnedSet.has(file.path),
	}));
	const localFolders = folders.map((folder) => ({
		path: folder.path,
		modifiedAt: folder.modified_at,
	}));
	const renderTree = (entries: MixedAuthorityEntries) => {
		const activeCloudPath = activeLiveDocumentId
			? [...entries.cloudDocumentByPath.entries()].find(
					([, documentId]) => documentId === activeLiveDocumentId,
				)?.[0]
			: null;
		return (
			<SharedSidebar
				files={entries.files}
				folders={entries.folders}
				cloudFolderIds={entries.cloudFolderIds}
				cloudBoundaryFolderIds={entries.cloudBoundaryFolderIds}
				cloudFilePaths={entries.cloudFilePaths}
				currentPath={activeCloudPath ?? currentPath ?? null}
				sortMode={sortMode}
				storageScope={workspacePath}
				header={
					<div className="flex min-w-0 flex-col">
						<div className="flex min-w-0 items-center gap-2">
							<WorkspaceSwitcher cloudAvailable={Boolean(cloudEnabled)} />
							<span
								className="shrink-0 rounded-sm border border-sidebar-border [padding-block:0.0625rem] [padding-inline:0.3rem] text-[9px] font-semibold uppercase tracking-wide text-sidebar-foreground/60"
								title="Stored directly in Git"
							>
								Git
							</span>
						</div>
						{cloudEnabled ? <AuthorityTransferRecoveryNotice /> : null}
					</div>
				}
				footer={footer}
				getDisplayPath={relativePath}
				onCollapse={collapseSidebar}
				onSortModeChange={setSortMode}
				onSelectFile={(path) => {
					const cloudDocumentId = entries.cloudDocumentByPath.get(path);
					if (cloudDocumentId) onOpenLiveDocument?.(cloudDocumentId);
					else void loadPath(path);
				}}
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
				onRenameFile={(path, nextName) =>
					void renameMarkdownFile(path, nextName)
				}
				onDeleteFile={(path) => void deleteMarkdownFile(path)}
				onTogglePinnedFile={(path) => void togglePinnedNote(path)}
				onCreateFile={(folderId) =>
					createMarkdownFileInFolder(absolutePath(folderId))
				}
				onDeleteFolder={(folderId) => void deleteFolder(absolutePath(folderId))}
				onMoveFolderToCloud={
					cloudEnabled
						? (folderId) =>
								authorityPreview.open({
									direction: "git-to-cloud",
									intent: "move",
									folderPath: absolutePath(folderId),
									name: displayFolderName(folderId),
								})
						: undefined
				}
				onShareFolder={
					cloudEnabled
						? (folderId) =>
								authorityPreview.open({
									direction: "git-to-cloud",
									intent: "share",
									folderPath: absolutePath(folderId),
									name: displayFolderName(folderId),
								})
						: undefined
				}
				onMoveItem={({ item, targetFolderId }) =>
					void moveSidebarItem(item, absolutePath(targetFolderId))
				}
			/>
		);
	};
	const localOnlyEntries: MixedAuthorityEntries = {
		files: localFiles,
		folders: localFolders,
		cloudFolderIds: new Set(),
		cloudBoundaryFolderIds: new Set(),
		cloudFilePaths: new Set(),
		cloudDocumentByPath: new Map(),
	};

	return (
		<>
			{cloudEnabled ? (
				<MixedAuthorityEntriesProvider
					workspacePath={workspacePath}
					localFiles={localFiles}
					localFolders={localFolders}
				>
					{renderTree}
				</MixedAuthorityEntriesProvider>
			) : (
				renderTree(localOnlyEntries)
			)}
			{authorityPreview.target ? (
				<AuthorityMovePreviewDialog
					key={authorityPreviewKey(authorityPreview.target)}
					target={authorityPreview.target}
					onClose={authorityPreview.close}
					onReverse={authorityPreview.replace}
					onManageShare={(folderId, name) => {
						authorityPreview.close();
						setCompletedShareTarget({ folderId, name });
					}}
				/>
			) : null}
			{completedShareTarget ? (
				<FolderShareDialog
					folderId={completedShareTarget.folderId as Id<"folders">}
					folderName={completedShareTarget.name}
					open
					onOpenChange={(open) => {
						if (!open) setCompletedShareTarget(null);
					}}
				/>
			) : null}
		</>
	);
}

function CloudSidebarSection({
	activeLiveDocumentId,
	onOpenLiveDocument,
	onOpenSettings,
	onLocalAvailabilityPathChange,
	className,
}: {
	activeLiveDocumentId?: string | null;
	onOpenLiveDocument?: (documentId: string) => void;
	onOpenSettings?: () => void;
	onLocalAvailabilityPathChange?: (
		availability: { scopeKey: string; path: string } | null,
	) => void;
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
					onLocalAvailabilityPathChange={onLocalAvailabilityPathChange}
				/>
			</Authenticated>
		</div>
	);
}

function AuthenticatedCloudSidebar({
	activeDocumentId,
	onOpenDocument,
	onOpenSettings,
	onLocalAvailabilityPathChange,
}: {
	activeDocumentId: string | null;
	onOpenDocument?: (documentId: string) => void;
	onOpenSettings?: () => void;
	onLocalAvailabilityPathChange?: (
		availability: { scopeKey: string; path: string } | null,
	) => void;
}) {
	const { spaces, sharedFolders, context } = useSelectedCloudContext();
	const authToken = useAuthToken();
	const createDocument = useMutation(api.documents.create);
	const createFolder = useMutation(api.folders.create);
	const renameDocument = useMutation(api.documents.rename);
	const renameFolder = useMutation(api.folders.rename);
	const removeDocument = useMutation(api.documents.remove);
	const removeFolder = useMutation(api.folders.remove);
	const restoreDocument = useMutation(api.documents.restoreRemoved);
	const restoreFolder = useMutation(api.folders.restoreRemoved);
	const prepareDocumentRelocation = useMutation(
		api.folders.prepareDocumentRelocation,
	);
	const confirmDocumentRelocation = useMutation(
		api.folders.confirmDocumentRelocation,
	);
	const contextCapabilities = useQuery(
		api.folders.getContextCapabilities,
		context
			? {
					workspaceId: context.workspaceId as Id<"workspaces">,
					folderId:
						context.kind === "shared-folder"
							? (context.folderId as Id<"folders">)
							: undefined,
				}
			: "skip",
	);
	const folderNameInputId = useId();
	const renameInputId = useId();
	const [folderCreateTarget, setFolderCreateTarget] = useState<{
		workspaceId: string;
		parentId: string | null;
	} | null>(null);
	const [folderName, setFolderName] = useState("");
	const [creatingFolder, setCreatingFolder] = useState(false);
	const [focusTreeNodeId, setFocusTreeNodeId] = useState<string | null>(null);
	const [renameTarget, setRenameTarget] =
		useState<CloudTreeActionTarget | null>(null);
	const [renameName, setRenameName] = useState("");
	const [trashTarget, setTrashTarget] = useState<CloudTreeActionTarget | null>(
		null,
	);
	const [shareTarget, setShareTarget] = useState<CloudTreeActionTarget | null>(
		null,
	);
	const authorityPreview = useAuthorityPreview();
	const [moveRequest, setMoveRequest] =
		useState<CloudDocumentMoveRequest | null>(null);
	const [moveDestinationId, setMoveDestinationId] = useState<string | null>(
		null,
	);
	const [moveReview, setMoveReview] = useState<{
		fingerprint: string;
		impact: RelocationImpact;
	} | null>(null);
	const [cloudActionBusy, setCloudActionBusy] = useState<
		"rename" | "trash" | "move" | null
	>(null);
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
	const selectedSpace =
		context?.kind === "workspace"
			? spaces?.find((space) => space._id === context.workspaceId)
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
	const healthyAvailability = healthyAvailabilityPath(matchingAvailability);
	const healthyScopeKey = healthyAvailability?.scopeKey ?? null;
	const healthyPath = healthyAvailability?.path ?? null;
	useEffect(() => {
		onLocalAvailabilityPathChange?.(
			healthyScopeKey && healthyPath
				? { scopeKey: healthyScopeKey, path: healthyPath }
				: null,
		);
		return () => onLocalAvailabilityPathChange?.(null);
	}, [healthyPath, healthyScopeKey, onLocalAvailabilityPathChange]);
	const canCreate = contextCapabilities?.canWrite ?? false;
	const treeCapabilities = useMemo<CloudTreeCapabilities>(() => {
		if (!contextCapabilities) {
			return {
				canCreate: false,
				canWriteFolder: () => false,
				canWriteDocument: () => false,
				canShareFolder: () => false,
				canMoveFolderToGit: () => false,
				canExportFolderCopy: () => false,
			};
		}
		if (contextCapabilities.mode === "uniform") {
			return {
				canCreate: contextCapabilities.canWrite,
				canWriteFolder: () => contextCapabilities.canWrite,
				canWriteDocument: () => contextCapabilities.canWrite,
				canShareFolder: () => contextCapabilities.canShare,
				canMoveFolderToGit: () => contextCapabilities.canShare,
				canExportFolderCopy: () => true,
			};
		}
		const writableFolders = new Set<string>(
			contextCapabilities.writableFolderIds,
		);
		const writableDocuments = new Set<string>(
			contextCapabilities.writableDocumentIds,
		);
		const shareableFolders = new Set<string>(
			contextCapabilities.shareableFolderIds,
		);
		const readableFolders = new Set<string>(
			contextCapabilities.readableFolderIds,
		);
		return {
			canCreate: contextCapabilities.canWrite,
			canWriteFolder: (folderId) => writableFolders.has(folderId),
			canWriteDocument: (documentId) => writableDocuments.has(documentId),
			canShareFolder: (folderId) => shareableFolders.has(folderId),
			canMoveFolderToGit: (folderId) => shareableFolders.has(folderId),
			canExportFolderCopy: (folderId) => readableFolders.has(folderId),
		};
	}, [contextCapabilities]);
	const openDocument = (documentId: string) => {
		if (onOpenDocument) onOpenDocument(documentId);
		else toast("Document opening is unavailable in this window");
	};
	const createDocumentInFolder = async (folderId: string) => {
		if (!context || !canCreate) return;
		try {
			const documentId = await createDocument({
				workspaceId: context.workspaceId as Id<"workspaces">,
				folderId: folderId as Id<"folders">,
				title: "Untitled",
			});
			openDocument(documentId);
			setFocusTreeNodeId(documentId);
			toast.success("Document created");
		} catch (error) {
			toast.error("Failed to create document", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	};
	const requestCreateFolder = (parentId: string | null) => {
		if (!context || !canCreate) return;
		setFolderName("");
		setFolderCreateTarget({ workspaceId: context.workspaceId, parentId });
	};
	const submitFolder = async (event: React.FormEvent) => {
		event.preventDefault();
		const name = folderName.trim();
		if (!folderCreateTarget || !name || creatingFolder) return;
		setCreatingFolder(true);
		try {
			const folderId = await createFolder({
				workspaceId: folderCreateTarget.workspaceId as Id<"workspaces">,
				parentId: folderCreateTarget.parentId
					? (folderCreateTarget.parentId as Id<"folders">)
					: undefined,
				name,
			});
			setFolderCreateTarget(null);
			setFocusTreeNodeId(folderId);
			toast.success(`Folder “${name}” created`);
		} catch (error) {
			toast.error("Failed to create folder", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setCreatingFolder(false);
		}
	};
	const requestRename = (target: CloudTreeActionTarget) => {
		setRenameTarget(target);
		setRenameName(target.name);
	};
	const submitRename = async (event: React.FormEvent) => {
		event.preventDefault();
		const target = renameTarget;
		const name = renameName.trim();
		if (!target || !name || cloudActionBusy) return;
		if (name === target.name) {
			setRenameTarget(null);
			setFocusTreeNodeId(target.id);
			return;
		}
		setCloudActionBusy("rename");
		try {
			if (target.kind === "document") {
				await renameDocument({
					documentId: target.id as Id<"documents">,
					title: name,
					path: target.path ?? undefined,
				});
			} else {
				await renameFolder({
					folderId: target.id as Id<"folders">,
					name,
				});
			}
			setRenameTarget(null);
			setFocusTreeNodeId(target.id);
			toast.success(
				`${target.kind === "document" ? "Document" : "Folder"} renamed`,
			);
		} catch (error) {
			toast.error(`Could not rename the ${target.kind}`, {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setCloudActionBusy(null);
		}
	};
	const requestMove = (request: CloudDocumentMoveRequest) => {
		setMoveRequest(request);
		setMoveDestinationId(request.document.parentId);
		setMoveReview(null);
	};
	const completeMove = (documentId: string) => {
		setMoveRequest(null);
		setMoveReview(null);
		setFocusTreeNodeId(documentId);
		toast.success("Document moved");
	};
	const prepareMove = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!moveRequest || cloudActionBusy) return;
		const document = moveRequest.document;
		if (moveDestinationId === document.parentId) return;
		setCloudActionBusy("move");
		try {
			const result = await prepareDocumentRelocation({
				documentId: document.id as Id<"documents">,
				folderId: moveDestinationId
					? (moveDestinationId as Id<"folders">)
					: undefined,
				title: document.name,
				path: document.path ?? "",
			});
			if (result.status === "completed") {
				completeMove(document.id);
			} else {
				setMoveReview({
					fingerprint: result.fingerprint,
					impact: result.impact,
				});
			}
		} catch (error) {
			toast.error("Could not move the document", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setCloudActionBusy(null);
		}
	};
	const confirmMove = async () => {
		if (!moveRequest || !moveReview || cloudActionBusy) return;
		const document = moveRequest.document;
		setCloudActionBusy("move");
		try {
			const result = await confirmDocumentRelocation({
				documentId: document.id as Id<"documents">,
				folderId: moveDestinationId
					? (moveDestinationId as Id<"folders">)
					: undefined,
				title: document.name,
				path: document.path ?? "",
				fingerprint: moveReview.fingerprint,
			});
			if (result.status === "completed") {
				completeMove(document.id);
			} else {
				setMoveReview({
					fingerprint: result.fingerprint,
					impact: result.impact,
				});
				toast.info("The move’s impact changed", {
					description:
						"Review the updated access changes before approving again.",
				});
			}
		} catch (error) {
			toast.error("Could not approve the move", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setCloudActionBusy(null);
		}
	};
	const confirmTrash = async () => {
		const target = trashTarget;
		if (!target || cloudActionBusy) return;
		setCloudActionBusy("trash");
		try {
			if (target.kind === "document") {
				await removeDocument({ documentId: target.id as Id<"documents"> });
			} else {
				await removeFolder({ folderId: target.id as Id<"folders"> });
			}
			setTrashTarget(null);
			const toastId = toast(`${target.name} moved to Trash`, {
				action: {
					label: "Undo",
					onClick: () => {
						const restore =
							target.kind === "document"
								? restoreDocument({
										documentId: target.id as Id<"documents">,
									})
								: restoreFolder({ folderId: target.id as Id<"folders"> });
						void restore
							.then(() => {
								toast.dismiss(toastId);
								setFocusTreeNodeId(target.id);
								toast.success(`${target.name} restored`);
							})
							.catch((error) => {
								toast.error(`Could not restore ${target.name}`, {
									description:
										error instanceof Error ? error.message : String(error),
								});
							});
					},
				},
			});
		} catch (error) {
			toast.error(`Could not move ${target.name} to Trash`, {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setCloudActionBusy(null);
		}
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
				<div className="flex shrink-0 items-center">
					<CloudDocumentCreateButton
						context={context}
						canCreate={canCreate}
						onOpenDocument={openDocument}
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						disabled={!context || !canCreate}
						aria-label="New folder"
						title={
							canCreate ? "New folder" : "You can’t create in this context"
						}
						onClick={() => {
							if (context)
								requestCreateFolder(cloudContextRootFolderId(context));
						}}
					>
						<MingcuteFolderLine className="size-3.5" />
					</Button>
				</div>
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
						capabilities={treeCapabilities}
						focusNodeId={focusTreeNodeId}
						onFocusNodeHandled={(nodeId) => {
							if (nodeId === focusTreeNodeId) setFocusTreeNodeId(null);
						}}
						onCreateDocumentInFolder={createDocumentInFolder}
						onRequestCreateFolder={(parentId) => requestCreateFolder(parentId)}
						onRequestRename={requestRename}
						onRequestMoveDocument={requestMove}
						onRequestTrash={setTrashTarget}
						onRequestShareFolder={setShareTarget}
						onRequestMoveFolderToGit={
							context
								? (target) => {
										if (target.kind !== "folder") return;
										authorityPreview.open({
											direction: "cloud-to-git",
											intent: "move",
											workspaceId: context.workspaceId,
											folderId: target.id,
											name: target.name,
										});
									}
								: undefined
						}
						onRequestExportFolderCopy={
							context
								? (target) => {
										if (target.kind !== "folder") return;
										authorityPreview.open({
											direction: "cloud-to-git",
											intent: "export-copy",
											workspaceId: context.workspaceId,
											folderId: target.id,
											name: target.name,
										});
									}
								: undefined
						}
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
					{authorityPreview.target ? (
						<AuthorityMovePreviewDialog
							key={authorityPreviewKey(authorityPreview.target)}
							target={authorityPreview.target}
							onClose={authorityPreview.close}
							onReverse={authorityPreview.replace}
							onManageShare={(folderId, name) => {
								authorityPreview.close();
								setShareTarget({
									kind: "folder",
									id: folderId,
									name,
									parentId: null,
									path: null,
								});
							}}
						/>
					) : null}
				</>
			) : (
				<p className="m-0 text-[11px] text-muted-foreground [padding-block:0.5rem] [padding-inline:0.5rem]">
					Create a Workspace or ask someone to share a folder with you.
				</p>
			)}
			<Modal
				open={folderCreateTarget !== null}
				onOpenChange={(open) => {
					if (!open && !creatingFolder) setFolderCreateTarget(null);
				}}
				title="New folder"
				description="The folder inherits access from its destination."
			>
				<form onSubmit={submitFolder} className="flex flex-col gap-3">
					<label
						htmlFor={folderNameInputId}
						className="flex flex-col gap-1.5 text-xs font-medium text-foreground"
					>
						<span>Folder name</span>
						<Input
							id={folderNameInputId}
							value={folderName}
							onChange={(event) => setFolderName(event.currentTarget.value)}
							autoFocus
						/>
					</label>
					<div className="flex justify-end gap-2 [padding-block-start:0.25rem]">
						<Button
							type="button"
							variant="ghost"
							disabled={creatingFolder}
							onClick={() => setFolderCreateTarget(null)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={!folderName.trim() || creatingFolder}
						>
							{creatingFolder ? "Creating…" : "Create folder"}
						</Button>
					</div>
				</form>
			</Modal>
			<Modal
				open={renameTarget !== null}
				onOpenChange={(open) => {
					if (!open && !cloudActionBusy) setRenameTarget(null);
				}}
				title={`Rename ${renameTarget?.kind ?? "item"}`}
				description={
					renameTarget?.kind === "document"
						? "The document keeps its cloud identity and any explicit projected filename."
						: "The folder keeps its cloud identity and contents."
				}
			>
				<form onSubmit={submitRename} className="flex flex-col gap-3">
					<label
						htmlFor={renameInputId}
						className="flex flex-col gap-1.5 text-xs font-medium text-foreground"
					>
						<span>Name</span>
						<Input
							id={renameInputId}
							value={renameName}
							onChange={(event) => setRenameName(event.currentTarget.value)}
							onFocus={(event) => event.currentTarget.select()}
							autoFocus
						/>
					</label>
					<div className="flex justify-end gap-2 [padding-block-start:0.25rem]">
						<Button
							type="button"
							variant="ghost"
							disabled={cloudActionBusy !== null}
							onClick={() => setRenameTarget(null)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={!renameName.trim() || cloudActionBusy !== null}
						>
							{cloudActionBusy === "rename" ? "Renaming…" : "Rename"}
						</Button>
					</div>
				</form>
			</Modal>
			<Modal
				open={moveRequest !== null}
				onOpenChange={(open) => {
					if (!open && !cloudActionBusy) {
						setMoveRequest(null);
						setMoveReview(null);
					}
				}}
				title={
					moveReview
						? `Review move: ${moveRequest?.document.name ?? "document"}`
						: `Move “${moveRequest?.document.name ?? "document"}”`
				}
				description={
					moveReview
						? "This changes who or what can access the document. Nothing moves until you approve."
						: "Choose a destination in the current cloud context."
				}
			>
				{moveReview ? (
					<div className="flex flex-col gap-4">
						<RelocationImpactSummary impact={moveReview.impact} />
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								disabled={cloudActionBusy !== null}
								onClick={() => {
									setMoveRequest(null);
									setMoveReview(null);
								}}
							>
								Cancel move
							</Button>
							<Button
								disabled={cloudActionBusy !== null}
								onClick={() => void confirmMove()}
							>
								{cloudActionBusy === "move"
									? "Checking impact…"
									: "Approve move"}
							</Button>
						</div>
					</div>
				) : (
					<form onSubmit={prepareMove} className="flex flex-col gap-3">
						<label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
							<span>Destination</span>
							<select
								value={moveDestinationId ?? ""}
								onChange={(event) =>
									setMoveDestinationId(event.currentTarget.value || null)
								}
								className="w-full rounded-sm border border-border bg-background text-xs text-foreground outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
							>
								{moveRequest?.destinations.map((destination) => (
									<option
										key={destination.folderId ?? "root"}
										value={destination.folderId ?? ""}
									>
										{"\u00a0".repeat(destination.depth * 2)}
										{destination.name}
									</option>
								))}
							</select>
						</label>
						<div className="flex justify-end gap-2 [padding-block-start:0.25rem]">
							<Button
								type="button"
								variant="ghost"
								disabled={cloudActionBusy !== null}
								onClick={() => setMoveRequest(null)}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									cloudActionBusy !== null ||
									moveDestinationId === moveRequest?.document.parentId
								}
							>
								{cloudActionBusy === "move" ? "Checking…" : "Move"}
							</Button>
						</div>
					</form>
				)}
			</Modal>
			<Modal
				open={trashTarget !== null}
				onOpenChange={(open) => {
					if (!open && !cloudActionBusy) setTrashTarget(null);
				}}
				title={`Move “${trashTarget?.name ?? "item"}” to Trash?`}
				description={
					trashTarget?.kind === "folder"
						? "The folder and its visible contents leave this view. They remain recoverable from Trash."
						: "The document leaves this view and remains recoverable from Trash."
				}
			>
				<div className="flex justify-end gap-2">
					<Button
						variant="ghost"
						disabled={cloudActionBusy !== null}
						onClick={() => setTrashTarget(null)}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						disabled={cloudActionBusy !== null}
						onClick={() => void confirmTrash()}
					>
						{cloudActionBusy === "trash" ? "Moving…" : "Move to Trash"}
					</Button>
				</div>
			</Modal>
			{shareTarget?.kind === "folder" ? (
				<FolderShareDialog
					folderId={shareTarget.id as Id<"folders">}
					folderName={shareTarget.name}
					open
					onOpenChange={(open) => {
						if (!open) setShareTarget(null);
					}}
				/>
			) : null}
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

function relocationRoleLabel(role: string | null) {
	return role ? role[0]?.toLocaleUpperCase() + role.slice(1) : "No access";
}

function RelocationImpactSummary({ impact }: { impact: RelocationImpact }) {
	return (
		<div className="flex flex-col gap-3 text-xs" aria-live="polite">
			{impact.userChanges.length > 0 ? (
				<section aria-labelledby="cloud-move-people-heading">
					<h3 id="cloud-move-people-heading" className="m-0 font-medium">
						People
					</h3>
					<ul className="m-0 flex list-disc flex-col gap-1 [padding-block-start:0.375rem] [padding-inline-start:1.25rem]">
						{impact.userChanges.map((change) => (
							<li key={change.userId}>
								{change.name ?? change.email ?? "Unknown collaborator"}:{" "}
								{relocationRoleLabel(change.fromRole)} →{" "}
								{relocationRoleLabel(change.toRole)}
							</li>
						))}
						{impact.userChangesTruncated ? (
							<li>Additional people are affected</li>
						) : null}
					</ul>
				</section>
			) : impact.gainingUserCount > 0 || impact.losingUserCount > 0 ? (
				<p className="m-0">
					{impact.gainingUserCount} gain access; {impact.losingUserCount} lose
					access.
				</p>
			) : null}
			{impact.publicAccessChanged ? (
				<p className="m-0">
					Public link: {relocationRoleLabel(impact.publicAccessChange.fromRole)}{" "}
					→ {relocationRoleLabel(impact.publicAccessChange.toRole)}
				</p>
			) : null}
			{impact.repositoryChanges.length > 0 ? (
				<section aria-labelledby="cloud-move-repositories-heading">
					<h3 id="cloud-move-repositories-heading" className="m-0 font-medium">
						Linked repositories
					</h3>
					<ul className="m-0 flex list-disc flex-col gap-1 [padding-block-start:0.375rem] [padding-inline-start:1.25rem]">
						{impact.repositoryChanges.map((repository) => (
							<li key={`${repository.change}:${repository.folderId}`}>
								{repository.change === "added" ? "Added to" : "Removed from"}{" "}
								{repository.repoName ??
									repository.repoRemoteUrl ??
									"repository"}{" "}
								<span className="text-muted-foreground">
									({repository.folderPath})
								</span>
							</li>
						))}
					</ul>
				</section>
			) : impact.repoExposureChanged ? (
				<p className="m-0">Linked repository exposure changes.</p>
			) : null}
		</div>
	);
}
