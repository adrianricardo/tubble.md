import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { wikiDisplayNameForTarget } from "@hubble.md/editor";
import { api } from "@hubble.md/sync-backend";
import { Button, EditorView, UserBadge, type WikiTarget } from "@hubble.md/ui";
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
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
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
	setSidebarOpen,
	setWorkspaceSwitcherOpen,
	updateEditorContent,
} from "./store/actions";
import {
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
			await loadPath(selected);
		}
	}, []);

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
			void loadPath(path);
		});
		return () => {
			unlisten();
		};
	}, []);

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
				await loadPath(launchPath);
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
				await loadPath(lastPath);
			}
		};
		void init();
		return () => {
			active = false;
		};
	}, []);

	return (
		<main className="flex h-dvh flex-col bg-background text-foreground">
			<Toolbar
				scrollContainer={scrollContainerEl}
				showSidebarBadge={!sidebarOpen && showUpdateCallout}
				leftSlot={
					cloudEnabled ? <CloudCreateButton /> : <LocalFileCreateButton />
				}
				sessionSlot={cloudEnabled ? <DesktopUserBadge /> : undefined}
			/>
			<div className="flex min-h-0 flex-1 overflow-hidden">
				<Sidebar
					cloudEnabled={cloudEnabled}
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
						!state.currentPath && (
							<div className="flex h-full items-center justify-center p-6">
								{hasWorkspace ? (
									<Button onClick={() => void openFilePicker()}>
										Open file
									</Button>
								) : cloudEnabled ? (
									<CloudWorkspaceHome
										onOpenSettings={openSettings}
										onCreateFolder={() => void createWorkspaceWithSidebar()}
										onOpenFolder={() => void openWorkspaceWithSidebar()}
									/>
								) : (
									<WelcomeScreen
										cloudEnabled={false}
										onCreateFolder={() => void createWorkspaceWithSidebar()}
										onOpenFolder={() => void openWorkspaceWithSidebar()}
									/>
								)}
							</div>
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
					<CloudSyncSection deploymentUrl={desktopConvexUrl} />
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

function LocalFileCreateButton() {
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			data-desktop-create-action="primary"
			onClick={() => void createMarkdownFile()}
			aria-label="New Markdown File"
			title="New Markdown File (⌘N)"
		>
			<MingcuteFileNewLine className="size-4" />
		</Button>
	);
}

function CloudCreateButton() {
	return (
		<>
			<AuthLoading>
				<LocalFileCreateButton />
			</AuthLoading>
			<Unauthenticated>
				<LocalFileCreateButton />
			</Unauthenticated>
			<Authenticated>
				<AuthenticatedCloudCreateButton />
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

function AuthenticatedCloudCreateButton() {
	const dashboard = useQuery(api.documents.dashboard, {
		recentLimit: 1,
		sharedLimit: 0,
	});
	const createDocument = useMutation(api.documents.create);
	const [creating, setCreating] = useState(false);
	const workspace =
		dashboard?.workspaces.find((item) => item.personal) ??
		dashboard?.workspaces[0];

	const createLiveDocument = async () => {
		if (!workspace || creating) return;
		setCreating(true);
		try {
			await createDocument({
				workspaceId: workspace._id,
				title: "Untitled",
			});
			toast.success("Live Document created", {
				description:
					"Connect a synced folder in Settings to edit it from local Markdown.",
			});
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
			disabled={!workspace || creating}
			aria-label="New Live Document"
			title="New Live Document (⌘N)"
		>
			<MingcuteAddLine className="size-4" />
		</Button>
	);
}

function CloudWorkspaceHome({
	onOpenSettings,
	onCreateFolder,
	onOpenFolder,
}: {
	onOpenSettings: () => void;
	onCreateFolder: () => void;
	onOpenFolder: () => void;
}) {
	return (
		<>
			<AuthLoading>
				<div className="flex max-w-md flex-col items-center gap-3 text-center">
					<p className="text-sm text-muted-foreground">
						Checking cloud workspace…
					</p>
				</div>
			</AuthLoading>
			<Unauthenticated>
				<WelcomeScreen
					cloudEnabled
					onOpenSettings={onOpenSettings}
					onCreateFolder={onCreateFolder}
					onOpenFolder={onOpenFolder}
				/>
			</Unauthenticated>
			<Authenticated>
				<AuthenticatedCloudWorkspaceHome
					onOpenSettings={onOpenSettings}
					onCreateFolder={onCreateFolder}
					onOpenFolder={onOpenFolder}
				/>
			</Authenticated>
		</>
	);
}

function AuthenticatedCloudWorkspaceHome({
	onOpenSettings,
	onCreateFolder,
	onOpenFolder,
}: {
	onOpenSettings: () => void;
	onCreateFolder: () => void;
	onOpenFolder: () => void;
}) {
	const dashboard = useQuery(api.documents.dashboard, {
		recentLimit: 5,
		sharedLimit: 3,
	});
	const createDocument = useMutation(api.documents.create);
	const [creating, setCreating] = useState(false);
	const workspace =
		dashboard?.workspaces.find((item) => item.personal) ??
		dashboard?.workspaces[0];
	const documents = dashboard
		? [...dashboard.recents, ...dashboard.sharedWithMe].slice(0, 5)
		: [];

	const createLiveDocument = async () => {
		if (!workspace || creating) return;
		setCreating(true);
		try {
			await createDocument({
				workspaceId: workspace._id,
				title: "Untitled",
			});
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
		<div className="flex w-full max-w-2xl flex-col gap-5 [padding-inline:1rem]">
			<div className="flex flex-col items-center gap-2 text-center">
				<p className="text-xs font-medium uppercase text-muted-foreground">
					Hubble workspace
				</p>
				<h2 className="font-rounded text-3xl font-medium tracking-normal">
					Live Documents
				</h2>
				<p className="max-w-md text-sm text-muted-foreground">
					Local folders are optional support for external editors, backup, grep,
					and agents.
				</p>
			</div>
			<div className="flex flex-wrap justify-center gap-2">
				<Button
					onClick={() => void createLiveDocument()}
					disabled={!workspace || creating}
				>
					{creating ? "Creating…" : "New Live Document"}
				</Button>
				<Button variant="outline" onClick={onOpenSettings}>
					Connect synced folder
				</Button>
			</div>
			<div className="grid gap-2 rounded-sm border border-border bg-card/40 [padding-block:0.75rem] [padding-inline:0.75rem]">
				<div className="flex items-center justify-between gap-3">
					<p className="text-sm font-medium">Recent Live Documents</p>
					<p className="text-xs text-muted-foreground">
						{workspace?.name ?? "Workspace loading"}
					</p>
				</div>
				{dashboard === undefined ? (
					<p className="text-sm text-muted-foreground">Loading documents…</p>
				) : documents.length > 0 ? (
					<ul className="grid gap-1">
						{documents.map((document) => (
							<li
								key={document._id}
								className="flex items-center justify-between gap-3 rounded-sm bg-background/70 [padding-block:0.5rem] [padding-inline:0.625rem]"
							>
								<span className="min-w-0 truncate text-sm">
									{document.title}
								</span>
								<span className="shrink-0 text-xs text-muted-foreground">
									{formatEditedDate(document.updatedAt)}
								</span>
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">
						Create a Live Document to start the workspace.
					</p>
				)}
			</div>
			<div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
				<Button variant="ghost" size="sm" onClick={onCreateFolder}>
					Create local folder
				</Button>
				<Button variant="ghost" size="sm" onClick={onOpenFolder}>
					Open local folder
				</Button>
			</div>
		</div>
	);
}

function formatEditedDate(timestamp: number) {
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
	}).format(timestamp);
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
			<div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
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
