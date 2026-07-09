import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { useTiptapSync } from "@convex-dev/prosemirror-sync/tiptap";
import { DashboardScreen } from "@hubble.md/cloud-ui";
import {
	markdownToTiptapDoc,
	parseMarkdownFrontMatter,
	wikiDisplayNameForTarget,
	withMarkdownExtension,
} from "@hubble.md/editor";
import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import {
	Button,
	EditorView,
	type RemotePresenceCursor,
	UserBadge,
	type WikiTarget,
} from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import {
	Authenticated,
	AuthLoading,
	ConvexReactClient,
	Unauthenticated,
	useMutation,
	useQuery,
} from "convex/react";
import { keymatch } from "keymatch";
import {
	Component,
	type ErrorInfo,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteFileNewLine from "~icons/mingcute/file-new-line";
import {
	CloudSyncSection,
	CloudSyncUnavailableSection,
} from "./components/CloudSyncSection";
import {
	HtmlAppsDialog,
	SidebarHtmlAppsCallout,
} from "./components/HtmlAppsCallout";
import { RepoLinkSection } from "./components/RepoLinkSection";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { useSelectedSpace } from "./components/SpaceSwitcher";
import { Toolbar } from "./components/Toolbar";
import {
	SidebarUpdateCallout,
	UpdatesSection,
} from "./components/UpdatesSection";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { desktopConvexUrl } from "./convex";
import { desktopApi } from "./desktopApi";
import type { DesktopUpdateState } from "./desktopApi/types";
import { createEmbedExtension } from "./editor/EmbedExtension";
import { handleImageDrop, handleImagePaste } from "./editor/handleImagePaste";
import { IframeView, toAssetUrl } from "./editor/IframeView";
import { createImageExtension } from "./editor/ImageExtension";
import { createMarkdownFile } from "./fileActions";
import { hasHtmlExtension, relativeWorkspacePath } from "./lib/filePath";
import { hasHubbleSkillsInstalled } from "./lib/hubbleSkills";
import { resolveWikiPath } from "./lib/wikiPath";
import { SIDEBAR_NAV_SELECTOR } from "./selectors";
import {
	createWorkspaceWithSidebar,
	forceKeepLocalEdits,
	getPendingRenameTarget,
	handleExternalFileChange,
	loadPath,
	openWorkspace,
	openWorkspaceWithSidebar,
	refreshFiles,
	refreshFilesDebounced,
	reloadFromDiskConflict,
	savePathContent,
	setSelectedSpace,
	setSidebarOpen,
	setWorkspaceSwitcherOpen,
	updateEditorContent,
} from "./store/actions";
import {
	emptyDoc,
	sidebarOpenStore,
	uiStore,
	viewerStore,
	workspacePathStore,
	workspaceStore,
} from "./store/state";

// Forces editor refresh when underlying TipTap extensions change
const HMR_REV = (() => {
	if (!import.meta.hot) return 0;
	const hotData = import.meta.hot.data as { __editorRev?: number };
	hotData.__editorRev = (hotData.__editorRev ?? 0) + 1;
	return hotData.__editorRev;
})();

const HTML_APPS_CALLOUT_DISMISSED_PREFIX =
	"hubble:html-apps-callout-dismissed:";

function isHtmlAppsCalloutDismissed(workspacePath: string) {
	return Boolean(
		localStorage.getItem(HTML_APPS_CALLOUT_DISMISSED_PREFIX + workspacePath),
	);
}

function focusSidebarNav() {
	document.querySelector<HTMLElement>(SIDEBAR_NAV_SELECTOR)?.focus();
}

function triggerCreateAction() {
	// The primary create target is auth-aware, so keyboard handling delegates to
	// the rendered button instead of duplicating cloud/local branching here.
	const button = document.querySelector<HTMLButtonElement>(
		'[data-desktop-create-action="primary"]',
	);
	if (button && !button.disabled) {
		button.click();
		return true;
	}
	return false;
}

async function copyFilePath(path: string | null) {
	if (!path) return;

	try {
		await navigator.clipboard.writeText(path);
		toast.success("File path copied");
	} catch {
		toast.error("Failed to copy file path");
	}
}

async function revealPath(path: string | null) {
	if (!path) return;

	try {
		await desktopApi.revealFile(path);
	} catch {
		toast.error("Failed to reveal file");
	}
}

function App() {
	const convexClient = useMemo(
		() => (desktopConvexUrl ? new ConvexReactClient(desktopConvexUrl) : null),
		[],
	);

	if (!convexClient) {
		return <AppContent />;
	}

	return (
		<ConvexAuthProvider client={convexClient}>
			<AppContent />
		</ConvexAuthProvider>
	);
}

function AppContent() {
	const state = useStoreValue(viewerStore);
	const workspacePath = useStoreValue(workspacePathStore);
	const sidebarOpen = useStoreValue(sidebarOpenStore);
	const hasWorkspace = workspacePath !== null;
	const [scrollContainerEl, setScrollContainerEl] =
		useState<HTMLDivElement | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(
		null,
	);
	const [focusedSidebarPath, setFocusedSidebarPath] = useState<string | null>(
		null,
	);
	const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
	const [htmlAppsDialogOpen, setHtmlAppsDialogOpen] = useState(false);
	const [htmlAppsCalloutVisible, setHtmlAppsCalloutVisible] = useState(false);
	const [activeLiveDocumentId, setActiveLiveDocumentId] = useState<
		string | null
	>(null);
	const cloudEnabled = Boolean(desktopConvexUrl);

	const dismissHtmlAppsCallout = useCallback(() => {
		if (workspacePath) {
			localStorage.setItem(
				HTML_APPS_CALLOUT_DISMISSED_PREFIX + workspacePath,
				"1",
			);
		}
		setHtmlAppsCalloutVisible(false);
	}, [workspacePath]);

	// Show the HTML Apps callout when a folder is open, the Hubble skills are
	// not installed there, and it has not been dismissed for that folder.
	useEffect(() => {
		if (!workspacePath || isHtmlAppsCalloutDismissed(workspacePath)) {
			setHtmlAppsCalloutVisible(false);
			return;
		}
		let active = true;
		void hasHubbleSkillsInstalled(workspacePath).then((installed) => {
			if (active) setHtmlAppsCalloutVisible(!installed);
		});
		return () => {
			active = false;
		};
	}, [workspacePath]);
	const readyVersion =
		updateState?.status === "ready"
			? (updateState.availableVersion ?? "__unknown__")
			: null;
	const showUpdateCallout = readyVersion !== dismissedVersion;

	const openSettings = useCallback(() => {
		setSettingsOpen(true);
	}, []);

	const openLocalPath = useCallback(async (path: string) => {
		setActiveLiveDocumentId(null);
		await loadPath(path);
	}, []);

	const openLiveDocument = useCallback((documentId: string) => {
		setActiveLiveDocumentId(documentId);
		setScrollContainerEl(null);
		viewerStore.set((state) => emptyDoc(state.lastOpenedPath));
	}, []);

	const installUpdate = useCallback(async () => {
		try {
			await desktopApi.installUpdate();
		} catch (error) {
			toast.error("Failed to install update", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}, []);

	const triggerPrimaryUpdateAction = useCallback(async () => {
		if (!updateState?.isSupported) return;
		if (updateState.status === "ready") {
			await installUpdate();
			return;
		}
		await desktopApi.checkForUpdates();
	}, [installUpdate, updateState]);

	useEffect(() => {
		const currentPath = state.currentPath;
		if (!currentPath) return;

		let disposed = false;
		let unwatch: null | (() => void) = null;

		const handleChange = async (paths: string[]) => {
			if (!paths.includes(currentPath)) return;
			if (getPendingRenameTarget(currentPath)) return;
			try {
				const nextContent = await desktopApi.readFileText(currentPath);
				if (viewerStore.get().currentPath !== currentPath) return;
				await handleExternalFileChange(currentPath, nextContent);
			} catch {
				if (viewerStore.get().currentPath !== currentPath) return;
				await loadPath(currentPath);
			}
		};

		const setup = async () => {
			unwatch = await desktopApi.watchPath(
				currentPath,
				{ recursive: false },
				(paths) => void handleChange(paths),
			);
			if (disposed && unwatch) {
				unwatch();
			}
		};

		void setup();
		return () => {
			disposed = true;
			if (unwatch) {
				unwatch();
			}
		};
	}, [state.currentPath]);

	const openFilePicker = useCallback(async () => {
		const defaultPath =
			viewerStore.get().currentPath ??
			workspaceStore.get().workspacePath ??
			undefined;
		const selected = await desktopApi.openFilePicker({ defaultPath });
		if (typeof selected === "string") {
			await openLocalPath(selected);
		}
	}, [openLocalPath]);

	useEffect(() => {
		void desktopApi.setMenuState({ hasWorkspace });
	}, [hasWorkspace]);

	useEffect(() => {
		if (!sidebarOpen) setFocusedSidebarPath(null);
	}, [sidebarOpen]);

	useEffect(() => {
		const onKeyDown = async (event: KeyboardEvent) => {
			if (keymatch(event, "CmdOrCtrl+N")) {
				event.preventDefault();
				if (!triggerCreateAction()) await createMarkdownFile();
			} else if (keymatch(event, "CmdOrCtrl+,")) {
				event.preventDefault();
				openSettings();
			} else if (keymatch(event, "CmdOrCtrl+Shift+O")) {
				if (!workspaceStore.get().workspacePath) return;
				event.preventDefault();
				setWorkspaceSwitcherOpen(true);
			} else if (keymatch(event, "CmdOrCtrl+Shift+N")) {
				event.preventDefault();
				await openWorkspaceWithSidebar();
			} else if (keymatch(event, "CmdOrCtrl+O")) {
				event.preventDefault();
				await openFilePicker();
			} else if (keymatch(event, "CmdOrCtrl+Shift+C")) {
				const path = focusedSidebarPath ?? viewerStore.get().currentPath;
				if (!path) return;
				event.preventDefault();
				await copyFilePath(path);
			} else if (keymatch(event, "CmdOrCtrl+Alt+R")) {
				const path = focusedSidebarPath ?? viewerStore.get().currentPath;
				if (!path) return;
				event.preventDefault();
				await revealPath(path);
			} else if (keymatch(event, "CmdOrCtrl+Shift+E")) {
				event.preventDefault();
				const opening = !uiStore.get().sidebarOpen;
				setSidebarOpen(opening);
				if (opening) {
					requestAnimationFrame(() => focusSidebarNav());
				}
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [focusedSidebarPath, openFilePicker, openSettings]);

	useEffect(() => {
		let active = true;
		void desktopApi.getUpdateState().then((nextState) => {
			if (active) setUpdateState(nextState);
		});
		const unsubscribe = desktopApi.onUpdateStateChange((nextState) => {
			setUpdateState(nextState);
		});
		return () => {
			active = false;
			unsubscribe();
		};
	}, []);

	useEffect(() => {
		const unlisten = desktopApi.onOpenFile((path) => {
			void openLocalPath(path);
		});
		return () => {
			unlisten();
		};
	}, [openLocalPath]);

	useEffect(() => {
		const disposers = [
			desktopApi.onMenuCreateMarkdownFile(() => void createMarkdownFile()),
			desktopApi.onMenuOpenFile(() => void openFilePicker()),
			desktopApi.onMenuOpenFolder(() => void openWorkspaceWithSidebar()),
			desktopApi.onMenuOpenSettings(() => openSettings()),
			desktopApi.onMenuShowWorkspaceSwitcher(() =>
				setWorkspaceSwitcherOpen(true),
			),
			desktopApi.onMenuSyncWorkspace(() => void refreshFiles()),
		];
		return () => {
			for (const dispose of disposers) dispose();
		};
	}, [openFilePicker, openSettings]);

	useEffect(() => {
		// Window focus can fire in bursts when switching apps, so debounce the
		// sidebar refresh and keep the editor interactive while it runs.
		const dispose = desktopApi.onWindowFocus(() => refreshFilesDebounced());
		return () => {
			dispose();
		};
	}, []);

	useEffect(() => {
		let active = true;
		const init = async () => {
			const launchPath = await desktopApi.getLaunchFilePath();
			if (!active) return;

			if (typeof launchPath === "string" && launchPath.length > 0) {
				await openLocalPath(launchPath);
				return;
			}
			const launchWorkspacePath = await desktopApi.getLaunchWorkspacePath();
			if (!active) return;

			if (
				typeof launchWorkspacePath === "string" &&
				launchWorkspacePath.length > 0
			) {
				await openWorkspace(launchWorkspacePath);
				setSidebarOpen(true);
				return;
			}
			const nextState = viewerStore.get();
			const workspace = workspaceStore.get();
			const lastPath =
				nextState.lastOpenedPath ??
				(workspace.workspacePath
					? workspace.lastOpenedPaths[workspace.workspacePath]
					: undefined);
			if (lastPath) {
				await openLocalPath(lastPath);
			}
		};
		void init();
		return () => {
			active = false;
		};
	}, [openLocalPath]);

	return (
		<main className="flex h-dvh flex-col bg-background text-foreground">
			<Toolbar
				scrollContainer={scrollContainerEl}
				showSidebarBadge={!sidebarOpen && showUpdateCallout}
				leftSlot={
					cloudEnabled ? (
						<CloudCreateButton onOpenLiveDocument={openLiveDocument} />
					) : (
						<LocalFileCreateButton
							onBeforeCreate={() => setActiveLiveDocumentId(null)}
						/>
					)
				}
				sessionSlot={cloudEnabled ? <DesktopUserBadge /> : undefined}
			/>
			<div className="flex min-h-0 flex-1 overflow-hidden">
				<Sidebar
					cloudEnabled={cloudEnabled}
					activeLiveDocumentId={activeLiveDocumentId}
					onOpenLiveDocument={openLiveDocument}
					onOpenSettings={openSettings}
					onFocusedPathChange={setFocusedSidebarPath}
					footer={
						updateState?.status === "ready" && showUpdateCallout ? (
							<SidebarUpdateCallout
								onInstall={installUpdate}
								onDismiss={() =>
									setDismissedVersion(readyVersion ?? "__unknown__")
								}
							/>
						) : htmlAppsCalloutVisible ? (
							<SidebarHtmlAppsCallout
								onShowMore={() => setHtmlAppsDialogOpen(true)}
								onDismiss={dismissHtmlAppsCallout}
							/>
						) : undefined
					}
				/>
				<section className="flex-1 overflow-hidden" aria-live="polite">
					{state.status === "loading" && <p>Loading…</p>}
					{state.status === "error" && (
						<p>{state.error ?? "Failed to open file."}</p>
					)}
					{state.status !== "loading" &&
						state.status !== "error" &&
						!state.currentPath &&
						!activeLiveDocumentId &&
						(hasWorkspace ? (
							<div className="flex h-full items-center justify-center [padding-block:1.5rem] [padding-inline:1.5rem]">
								<Button onClick={() => void openFilePicker()}>Open file</Button>
							</div>
						) : cloudEnabled ? (
							<CloudWorkspaceHome
								onOpenSettings={openSettings}
								onOpenLiveDocument={openLiveDocument}
								onCreateFolder={() => void createWorkspaceWithSidebar()}
								onOpenFolder={() => void openWorkspaceWithSidebar()}
							/>
						) : (
							<div className="flex h-full items-center justify-center [padding-block:1.5rem] [padding-inline:1.5rem]">
								<WelcomeScreen
									cloudEnabled={false}
									onCreateFolder={() => void createWorkspaceWithSidebar()}
									onOpenFolder={() => void openWorkspaceWithSidebar()}
								/>
							</div>
						))}
					{activeLiveDocumentId && (
						<LiveDocumentErrorBoundary key={activeLiveDocumentId}>
							<LiveDocumentView
								documentId={activeLiveDocumentId}
								onOpenLocalPath={openLocalPath}
								onScrollContainerChange={setScrollContainerEl}
							/>
						</LiveDocumentErrorBoundary>
					)}
					{state.status === "ready" && state.currentPath && (
						<div className="flex h-full min-h-0 flex-col">
							{state.externalChange.kind === "conflict" && (
								<ExternalChangeBanner
									onKeepMyEdits={() => void forceKeepLocalEdits()}
									onReloadFromDisk={reloadFromDiskConflict}
								/>
							)}
							<DocumentViewer
								path={state.currentPath}
								content={state.content}
								onScrollContainerChange={setScrollContainerEl}
							/>
						</div>
					)}
				</section>
			</div>
			<SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen}>
				{desktopConvexUrl ? (
					<>
						<CloudSyncSection deploymentUrl={desktopConvexUrl} />
						<RepoLinkSection deploymentUrl={desktopConvexUrl} />
					</>
				) : (
					<CloudSyncUnavailableSection />
				)}
				{updateState ? (
					<UpdatesSection
						state={updateState}
						onPrimaryAction={() => void triggerPrimaryUpdateAction()}
					/>
				) : null}
			</SettingsDialog>
			<HtmlAppsDialog
				open={htmlAppsDialogOpen}
				onOpenChange={setHtmlAppsDialogOpen}
				workspacePath={workspacePath ?? null}
			/>
		</main>
	);
}

function LocalFileCreateButton({
	onBeforeCreate,
}: {
	onBeforeCreate?: () => void;
}) {
	const createLocalFile = async () => {
		onBeforeCreate?.();
		await createMarkdownFile();
	};

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			data-desktop-create-action="primary"
			onClick={() => void createLocalFile()}
			aria-label="New Markdown File"
			title="New Markdown File (⌘N)"
		>
			<MingcuteFileNewLine className="size-4" />
		</Button>
	);
}

function CloudCreateButton({
	onOpenLiveDocument,
}: {
	onOpenLiveDocument: (documentId: string) => void;
}) {
	return (
		<>
			<AuthLoading>
				<LocalFileCreateButton />
			</AuthLoading>
			<Unauthenticated>
				<LocalFileCreateButton />
			</Unauthenticated>
			<Authenticated>
				<AuthenticatedCloudCreateButton
					onOpenLiveDocument={onOpenLiveDocument}
				/>
			</Authenticated>
		</>
	);
}

function DesktopUserBadge() {
	return (
		<>
			<AuthLoading>
				<div className="h-7 w-28 rounded-sm border border-border bg-muted/40" />
			</AuthLoading>
			<Authenticated>
				<AuthenticatedDesktopUserBadge />
			</Authenticated>
		</>
	);
}

function AuthenticatedDesktopUserBadge() {
	const viewer = useQuery(api.viewer.me, {});
	if (!viewer) return null;
	return <UserBadge user={viewer} />;
}

function AuthenticatedCloudCreateButton({
	onOpenLiveDocument,
}: {
	onOpenLiveDocument: (documentId: string) => void;
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
			onOpenLiveDocument(documentId);
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
			size="icon-sm"
			data-desktop-create-action="primary"
			onClick={() => void createLiveDocument()}
			disabled={!space || creating}
			aria-label="New Live Document"
			title="New Live Document (⌘N)"
		>
			<MingcuteAddLine className="size-4" />
		</Button>
	);
}

function CloudWorkspaceHome({
	onOpenSettings,
	onOpenLiveDocument,
	onCreateFolder,
	onOpenFolder,
}: {
	onOpenSettings: () => void;
	onOpenLiveDocument: (documentId: string) => void;
	onCreateFolder: () => void;
	onOpenFolder: () => void;
}) {
	return (
		<>
			<AuthLoading>
				<div className="flex h-full items-center justify-center [padding-block:1.5rem] [padding-inline:1.5rem]">
					<div className="flex max-w-md flex-col items-center gap-3 text-center">
						<p className="text-sm text-muted-foreground">
							Checking cloud space…
						</p>
					</div>
				</div>
			</AuthLoading>
			<Unauthenticated>
				<div className="flex h-full items-center justify-center [padding-block:1.5rem] [padding-inline:1.5rem]">
					<WelcomeScreen
						cloudEnabled
						onOpenSettings={onOpenSettings}
						onCreateFolder={onCreateFolder}
						onOpenFolder={onOpenFolder}
					/>
				</div>
			</Unauthenticated>
			<Authenticated>
				<div className="h-full overflow-y-auto">
					<AuthenticatedCloudWorkspaceHome
						onOpenSettings={onOpenSettings}
						onOpenLiveDocument={onOpenLiveDocument}
						onCreateFolder={onCreateFolder}
						onOpenFolder={onOpenFolder}
					/>
				</div>
			</Authenticated>
		</>
	);
}

function AuthenticatedCloudWorkspaceHome({
	onOpenSettings,
	onOpenLiveDocument,
	onCreateFolder,
	onOpenFolder,
}: {
	onOpenSettings: () => void;
	onOpenLiveDocument: (documentId: string) => void;
	onCreateFolder: () => void;
	onOpenFolder: () => void;
}) {
	const dashboard = useQuery(api.documents.dashboard, {
		recentLimit: 5,
		sharedLimit: 3,
	});
	// Guest-only accounts (RB6): the desktop dashboard query only surfaces
	// direct doc shares, not folder shares (D12), so a guest whose only access
	// is an inherited folder share would otherwise land on an empty "create a
	// Live Document" prompt. Check the same guest-safe query the web dashboard
	// uses to detect that case and steer to the synced-folder connect flow
	// instead of a workspace-creation detour.
	const sharedWithMe = useQuery(api.documents.listSharedWithMe, {});
	const createDocument = useMutation(api.documents.create);
	const [creating, setCreating] = useState(false);
	const { space: workspace } = useSelectedSpace();
	const hasOwnDocuments =
		dashboard !== undefined && dashboard.recents.length > 0;
	const sharedFolders = sharedWithMe?.folders ?? [];
	const isGuestOnly =
		dashboard !== undefined &&
		sharedWithMe !== undefined &&
		!hasOwnDocuments &&
		(sharedFolders.length > 0 || sharedWithMe.documents.length > 0);

	const createLiveDocument = async () => {
		if (!workspace || creating) return;
		setCreating(true);
		try {
			const documentId = await createDocument({
				workspaceId: workspace._id,
				title: "Untitled",
			});
			onOpenLiveDocument(documentId);
			toast.success("Live Document created");
		} catch (error) {
			toast.error("Failed to create Live Document", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setCreating(false);
		}
	};

	const openDashboardFolder = (folderId: string) => {
		const folder = sharedWithMe?.folders.find(
			(candidate) => candidate.folderId === folderId,
		);
		const document = [...(folder?.documents ?? [])].sort(
			(a, b) => b.updatedAt - a.updatedAt,
		)[0];
		if (document) {
			onOpenLiveDocument(document._id);
			return;
		}
		toast("Connect a synced folder to browse these files");
	};

	if (isGuestOnly) {
		// The scroll wrapper is top-aligned for the dashboard; the guest wedge
		// keeps its original centered presentation inside it.
		return (
			<div className="flex min-h-full items-center justify-center [padding-block:1.5rem] [padding-inline:1.5rem]">
				<div className="flex w-full max-w-2xl flex-col gap-5 [padding-inline:1rem]">
					<div className="flex flex-col items-center gap-2 text-center">
						<p className="text-xs font-medium uppercase text-muted-foreground">
							Shared with you
						</p>
						<h2 className="font-rounded text-3xl font-medium tracking-normal">
							Bring your agent in
						</h2>
						<p className="max-w-md text-sm text-muted-foreground">
							Connect a synced folder to get{" "}
							{sharedFolders.length === 1
								? `"${sharedFolders[0].name}"`
								: `your ${sharedFolders.length} shared folders`}{" "}
							as real files on this computer, then point Cowork or Claude Code
							at them — saves sync live to everyone, no clone, no git.
						</p>
					</div>
					<div className="flex flex-wrap justify-center gap-2">
						<Button onClick={onOpenSettings}>Connect synced folder</Button>
					</div>
					{sharedFolders.length > 0 && (
						<div className="grid gap-2 rounded-sm border border-border bg-card/40 [padding-block:0.75rem] [padding-inline:0.75rem]">
							<p className="text-sm font-medium">Shared with you</p>
							<ul className="grid gap-1">
								{sharedFolders.map((folder) => (
									<li
										key={folder.folderId}
										className="flex items-center justify-between gap-3 rounded-sm bg-background/70 [padding-block:0.5rem] [padding-inline:0.625rem]"
									>
										<span className="min-w-0 truncate text-sm">
											{folder.name}
										</span>
										<span className="shrink-0 text-xs capitalize text-muted-foreground">
											{folder.role}
										</span>
									</li>
								))}
							</ul>
						</div>
					)}
					<div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => void createLiveDocument()}
							disabled={!workspace || creating}
						>
							{creating ? "Creating…" : "New Live Document instead"}
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<DashboardScreen
			onOpenDocument={(workspaceId, documentId) => {
				void workspaceId;
				onOpenLiveDocument(documentId);
			}}
			onOpenWorkspace={(id) => {
				setSelectedSpace(id);
				setSidebarOpen(true);
			}}
			onOpenFolder={openDashboardFolder}
			footer={
				<div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
					<Button variant="ghost" size="sm" onClick={onCreateFolder}>
						Create local folder
					</Button>
					<Button variant="ghost" size="sm" onClick={onOpenFolder}>
						Open local folder
					</Button>
					<Button variant="outline" size="sm" onClick={onOpenSettings}>
						Connect synced folder
					</Button>
				</div>
			}
		/>
	);
}

type LiveDocumentErrorBoundaryProps = {
	children: ReactNode;
};

type LiveDocumentErrorBoundaryState = {
	error: Error | null;
};

class LiveDocumentErrorBoundary extends Component<
	LiveDocumentErrorBoundaryProps,
	LiveDocumentErrorBoundaryState
> {
	state: LiveDocumentErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error(
			"Desktop Live Document route failed:",
			error,
			info.componentStack,
		);
	}

	render() {
		if (this.state.error) {
			return <LiveDocumentAccessError error={this.state.error} />;
		}
		return this.props.children;
	}
}

function LiveDocumentAccessError({ error }: { error: Error }) {
	const message = error.message.toLowerCase();
	const isUnauthorized = message.includes("unauthorized");
	return (
		<div className="flex h-full items-center justify-center [padding-block:1.5rem] [padding-inline:1.5rem]">
			<div className="max-w-md rounded-sm border border-border bg-background [padding-block:1rem] [padding-inline:1rem]">
				<p className="m-0 text-sm font-medium text-foreground">
					{isUnauthorized
						? "You do not have access to this document."
						: "Document failed to load."}
				</p>
				<p className="m-0 text-sm text-muted-foreground [margin-block-start:0.5rem]">
					{isUnauthorized
						? "Ask the owner to share it with your account, or enable link access before sending the link."
						: error.message}
				</p>
			</div>
		</div>
	);
}

function LiveDocumentView({
	documentId,
	onOpenLocalPath,
	onScrollContainerChange,
}: {
	documentId: string;
	onOpenLocalPath: (path: string) => Promise<void>;
	onScrollContainerChange?: (el: HTMLDivElement | null) => void;
}) {
	const document = useQuery(api.documents.getWithMarkdown, {
		documentId: documentId as Id<"documents">,
	});
	const markEdited = useMutation(api.documents.markEdited);
	const lastEditMarkRef = useRef(0);
	const syncDocId = `document:${documentId}`;
	const markLiveDocumentEdited = useCallback(() => {
		const now = Date.now();
		if (now - lastEditMarkRef.current < 5_000) return;
		lastEditMarkRef.current = now;
		void markEdited({ documentId: documentId as Id<"documents"> });
	}, [documentId, markEdited]);

	useEffect(() => {
		onScrollContainerChange?.(null);
	}, [onScrollContainerChange]);

	if (document === undefined) {
		return (
			<div className="flex h-full items-center justify-center [padding-block:1.5rem] [padding-inline:1.5rem]">
				<p className="text-sm text-muted-foreground">Loading document…</p>
			</div>
		);
	}

	if (document === null) {
		return (
			<div className="flex h-full items-center justify-center [padding-block:1.5rem] [padding-inline:1.5rem]">
				<p className="text-sm text-muted-foreground">Document not found.</p>
			</div>
		);
	}

	const path = document.path ?? withMarkdownExtension(document.title);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="border-b border-border bg-muted/30">
				<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground [padding-block:0.5rem] [padding-inline:0.75rem]">
					<div className="flex min-w-0 flex-col gap-0.5">
						<span className="truncate font-medium text-foreground">
							{document.title}
						</span>
						<span className="truncate">{path}</span>
					</div>
					<div className="flex min-w-0 items-center gap-3">
						<LiveDocumentPresenceLabel
							workspaceId={document.workspaceId}
							docId={syncDocId}
						/>
						<span className="shrink-0">
							{formatEditedMeta(document.updatedAt, document.updatedBy)}
						</span>
					</div>
				</div>
			</div>
			<LiveDocumentEditor
				workspaceId={document.workspaceId}
				path={path}
				initialMarkdown={document.markdown}
				syncDocumentId={syncDocId}
				onLiveDocumentEdit={markLiveDocumentEdited}
				onOpenLocalPath={onOpenLocalPath}
				onScrollContainerChange={onScrollContainerChange}
			/>
		</div>
	);
}

function LiveDocumentPresenceLabel({
	workspaceId,
	docId,
}: {
	workspaceId: Id<"workspaces">;
	docId: string;
}) {
	const heartbeat = useMutation(api.pocIdentity.heartbeat);
	const activeUsers = useQuery(api.pocIdentity.listActive, { docId });
	const viewer = useQuery(api.viewer.me, {});
	const currentName = viewer?.name ?? viewer?.email ?? "You";

	useEffect(() => {
		let cancelled = false;
		const beat = () => {
			if (cancelled) return;
			void heartbeat({ workspaceId, docId }).catch((error) => {
				console.error("Presence heartbeat failed:", error);
			});
		};
		beat();
		const interval = window.setInterval(beat, 10_000);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [docId, heartbeat, workspaceId]);

	const collaborators = activeUsers?.map((user) =>
		viewer?._id && user.userId === viewer._id
			? `${user.name} (you)`
			: user.name,
	) ?? [`${currentName} (you)`];

	return (
		<span className="min-w-0 truncate" title={collaborators.join(", ")}>
			{collaborators.length === 1
				? collaborators[0]
				: `${collaborators.length} collaborators`}
		</span>
	);
}

function LiveDocumentEditor({
	workspaceId,
	path,
	initialMarkdown,
	syncDocumentId,
	onLiveDocumentEdit,
	onOpenLocalPath,
	onScrollContainerChange,
}: {
	workspaceId: Id<"workspaces">;
	path: string;
	initialMarkdown: string;
	syncDocumentId: string;
	onLiveDocumentEdit: () => void;
	onOpenLocalPath: (path: string) => Promise<void>;
	onScrollContainerChange?: (el: HTMLDivElement | null) => void;
}) {
	const workspace = useStoreValue(workspaceStore);
	const viewer = useQuery(api.viewer.me, {});
	const heartbeat = useMutation(api.pocIdentity.heartbeat);
	const activeUsers = useQuery(api.pocIdentity.listActive, {
		docId: syncDocumentId,
	});
	const createdDocRef = useRef<string | null>(null);
	const lastCursorHeartbeatRef = useRef(0);
	const initialBody = useMemo(
		() => parseMarkdownFrontMatter(initialMarkdown).body,
		[initialMarkdown],
	);
	const sync = useTiptapSync(api.prosemirror, syncDocumentId, {
		warnOnUnsyncedClose: false,
		onSyncError: (error: unknown) => {
			console.error("ProseMirror sync error:", error);
		},
	});
	const wikiTargets: WikiTarget[] = workspace.files.map((file) => {
		const target = relativeWorkspacePath(file.path, workspace.workspacePath);
		return {
			path: file.path,
			target,
			title: wikiDisplayNameForTarget(target),
		};
	});
	const remotePresence = useMemo<RemotePresenceCursor[]>(() => {
		if (!activeUsers) return [];
		return activeUsers.flatMap((user) => {
			if (viewer?._id && user.userId === viewer._id) return [];
			if (user.anchor === undefined || user.head === undefined) return [];
			return [
				{
					userId: user.userId,
					name: user.name,
					anchor: user.anchor,
					head: user.head,
					color: user.color ?? colorForUser(user.userId),
				},
			];
		});
	}, [activeUsers, viewer?._id]);
	const publishSelection = useCallback(
		(selection: { anchor: number; head: number }) => {
			const now = Date.now();
			if (now - lastCursorHeartbeatRef.current < 250) return;
			lastCursorHeartbeatRef.current = now;
			void heartbeat({
				workspaceId,
				docId: syncDocumentId,
				anchor: selection.anchor,
				head: selection.head,
			}).catch((error) => {
				console.error("Presence heartbeat failed:", error);
			});
		},
		[heartbeat, syncDocumentId, workspaceId],
	);
	const handleLiveDocumentChange = useCallback(() => {
		onLiveDocumentEdit();
	}, [onLiveDocumentEdit]);

	useEffect(() => {
		if (
			sync.isLoading ||
			sync.initialContent ||
			createdDocRef.current === syncDocumentId
		) {
			return;
		}
		const createLiveDocument = "create" in sync ? sync.create : undefined;
		if (!createLiveDocument) return;
		createdDocRef.current = syncDocumentId;
		void createLiveDocument(markdownToTiptapDoc(initialBody)).catch(
			(error: unknown) => {
				createdDocRef.current = null;
				console.error("Failed to create ProseMirror sync document:", error);
			},
		);
	}, [initialBody, sync, syncDocumentId]);

	if (sync.isLoading || !sync.initialContent || !sync.extension) {
		return (
			<div className="flex h-full items-center justify-center [padding-block:1.5rem] [padding-inline:1.5rem]">
				<p className="text-sm text-muted-foreground">Loading live document…</p>
			</div>
		);
	}

	return (
		<EditorView
			key={syncDocumentId}
			path={path}
			initialMarkdown={initialMarkdown}
			initialContent={sync.initialContent}
			wikiTargets={wikiTargets}
			remotePresence={remotePresence}
			extensions={[sync.extension, createImageExtension(path)]}
			onPaste={(editor, event) => handleImagePaste({ editor, event })}
			onDrop={(editor, event) => handleImageDrop({ editor, event })}
			onSelectionChange={publishSelection}
			persistChanges={false}
			syncInitialMarkdownChanges={false}
			onLocalChange={handleLiveDocumentChange}
			onSave={() => {}}
			onScrollContainerChange={onScrollContainerChange}
			onOpenExternalLink={desktopApi.openExternalUrl}
			onOpenWikiLink={(target) => {
				const resolved = resolveWikiPath({
					target,
					files: workspace.files,
					workspacePath: workspace.workspacePath,
				});
				void onOpenLocalPath(resolved);
			}}
			onMessage={(message, kind) =>
				kind === "success" ? toast.success(message) : toast.error(message)
			}
		/>
	);
}

function formatEditedMeta(updatedAt: number, updatedBy?: string) {
	const editedAt = new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(updatedAt));
	return updatedBy
		? `Last edited by ${updatedBy} at ${editedAt}`
		: `Last edited ${editedAt}`;
}

const REMOTE_CURSOR_COLORS = [
	"#2563eb",
	"#d97706",
	"#059669",
	"#dc2626",
	"#7c3aed",
	"#0891b2",
];

function colorForUser(userId: string): string {
	let hash = 0;
	for (let i = 0; i < userId.length; i += 1) {
		hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
	}
	return REMOTE_CURSOR_COLORS[hash % REMOTE_CURSOR_COLORS.length] ?? "#2563eb";
}

function DocumentViewer({
	path,
	content,
	onScrollContainerChange,
}: {
	path: string;
	content: string;
	onScrollContainerChange?: (el: HTMLDivElement | null) => void;
}) {
	if (hasHtmlExtension(path)) {
		return (
			<HtmlDocumentViewer
				key={`${path}:${content}`}
				path={path}
				onScrollContainerChange={onScrollContainerChange}
			/>
		);
	}

	return (
		<MarkdownEditor
			key={`${path}:${HMR_REV}`}
			path={path}
			initialMarkdown={content}
			onScrollContainerChange={onScrollContainerChange}
		/>
	);
}

function HtmlDocumentViewer({
	path,
	onScrollContainerChange,
}: {
	path: string;
	onScrollContainerChange?: (el: HTMLDivElement | null) => void;
}) {
	const workspace = useStoreValue(workspaceStore);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		onScrollContainerChange?.(null);
	}, [onScrollContainerChange]);

	return (
		<div className="flex h-full min-h-0 flex-1 overflow-hidden bg-background">
			{error ? (
				<p className="m-0 p-4 text-sm text-destructive">{error}</p>
			) : (
				<IframeView
					className="block min-h-0 flex-1 border-0 bg-card"
					onError={setError}
					src={toAssetUrl(path)}
					style={{ blockSize: "100%", inlineSize: "100%" }}
					title={relativeWorkspacePath(path, workspace.workspacePath)}
					workspacePath={workspace.workspacePath}
				/>
			)}
		</div>
	);
}

function ExternalChangeBanner({
	onReloadFromDisk,
	onKeepMyEdits,
}: {
	onReloadFromDisk: () => void;
	onKeepMyEdits: () => void;
}) {
	return (
		<div className="border-b border-border bg-muted/40">
			<div className="flex flex-wrap items-center justify-between gap-3 [padding-block:0.5rem] [padding-inline:0.75rem]">
				<p className="m-0 text-sm text-muted-foreground">
					File changed on disk. Reload it or keep your editor edits.
				</p>
				<div className="flex shrink-0 items-center gap-2">
					<Button size="sm" variant="outline" onClick={onReloadFromDisk}>
						Reload from disk
					</Button>
					<Button size="sm" onClick={onKeepMyEdits}>
						Keep my edits
					</Button>
				</div>
			</div>
		</div>
	);
}

function MarkdownEditor({
	path,
	initialMarkdown,
	onScrollContainerChange,
}: {
	path: string;
	initialMarkdown: string;
	onScrollContainerChange?: (el: HTMLDivElement | null) => void;
}) {
	const workspace = useStoreValue(workspaceStore);
	const wikiTargets: WikiTarget[] = workspace.files.map((file) => {
		const target = relativeWorkspacePath(file.path, workspace.workspacePath);
		return {
			path: file.path,
			target,
			title: wikiDisplayNameForTarget(target),
		};
	});
	return (
		<EditorView
			path={path}
			initialMarkdown={initialMarkdown}
			wikiTargets={wikiTargets}
			extensions={[
				createImageExtension(path),
				createEmbedExtension({
					workspacePath: workspace.workspacePath,
					filePath: path,
				}),
			]}
			onPaste={(editor, event) => handleImagePaste({ editor, event })}
			onDrop={(editor, event) => handleImageDrop({ editor, event })}
			onLocalChange={updateEditorContent}
			onSave={savePathContent}
			onScrollContainerChange={onScrollContainerChange}
			onOpenExternalLink={desktopApi.openExternalUrl}
			onOpenWikiLink={(target) =>
				void loadPath(
					resolveWikiPath({
						target,
						files: workspace.files,
						workspacePath: workspace.workspacePath,
					}),
				)
			}
			onMessage={(message, kind) =>
				kind === "success" ? toast.success(message) : toast.error(message)
			}
		/>
	);
}

export default App;
