import { createHash } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createConvexBackend } from "@hubble.md/convex-client";
import hubbleRuntime from "@hubble.md/runtime/global.js?raw";
import htmlAppTheme from "@hubble.md/runtime/html-app-theme.css?raw";
import {
	assertLiveDocumentMarkdownWithinCap,
	contentHash,
	type Folder,
	importLiveDocuments,
	projectionScopeKey,
	type SyncBackend,
} from "@hubble.md/sync";
import { createNodeFileSystem } from "@hubble.md/sync/node";
import tailwindRuntime from "@tailwindcss/browser?raw";
import alpineRuntime from "alpinejs/dist/cdn.min.js?raw";
import chokidar, { type FSWatcher } from "chokidar";
import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	Menu,
	Notification,
	net,
	protocol,
	screen,
	shell,
	type Tray,
} from "electron";
import electronUpdater from "electron-updater";
import ignore from "ignore";
import { z } from "zod/v4";
import type {
	CloudMarkdownImportInput,
	DesktopUpdateState,
	DirectoryListing,
	LiveSyncConnectInput,
	LiveSyncReconcileInput,
	LocalAvailabilityCreateInput,
	LocalAvailabilityReconnectInput,
	LocalAvailabilityRecord,
	LocalAvailabilityRelocateInput,
	LocalAvailabilityRelocateResult,
	LocalAvailabilityStopInput,
	LocalAvailabilityStopResult,
	RepoLinkInput,
	RepoLinkResult,
	RepoMount,
	RepoMountCleanliness,
	RepoMountReconnectInput,
	RepoMountRelocateInput,
	RepoMountRelocateResult,
	RepoMountStopResult,
	SyncedFolderConnectInput,
	SyncedFolderEvent,
	SyncedFolderImportInput,
	WorkspaceConfig,
} from "../src/desktopApi/types";
import {
	hasDocumentExtension,
	isHiddenSidebarFolderName,
	markdownAssetFolderPath,
	withMarkdownExtension,
} from "../src/lib/filePath";
import { type CliServer, startCliServer } from "./cliServer";
import { LiveSyncService } from "./liveSync";
import {
	LocalAvailabilityStore,
	type StoredLocalAvailability,
} from "./localAvailabilityStore";
import { ProjectionManager } from "./projectionManager";
import {
	assertCloudProjectionRootsDisjoint,
	assertLocalProjectionDestinationAvailable,
	assertLocalProjectionRootsDisjoint,
	isFolderWithinProjection,
	type ProjectionMount,
} from "./projectionMounts";
import {
	BRAIN_DOC_FILENAME,
	buildBrainMarkdown,
	excludeMountFromGit,
	hasBrainDocument,
	parseGitOriginUrl,
	repoNameFrom,
	resolveGitRepo,
	sanitizeMountSegment,
} from "./repoLink";
import {
	isMountClean,
	mountCleanliness,
	rewriteProjectionIndexRoot,
} from "./repoMountClean";
import {
	classifySyncedFolderRoot,
	SYNCED_FOLDER_INDEX_REL,
	shouldIgnoreForWatch,
} from "./syncedFolderClassify";
import { SyncedFolderService } from "./syncedFolderService";
import { buildTextContextMenuTemplate } from "./textContextMenu";
import { requireEncodedTextBytes } from "./textFileIpc";
import { createAppTray } from "./tray";
import {
	loadZoomFactor,
	resetWindowZoom,
	setTrafficLightInset,
	stepWindowZoom,
	trafficLightPositionForZoom,
	zoomStep,
} from "./zoom";

type HtmlAppFileEntry = {
	name: string;
	path: string;
	modified_at: number;
	size: number;
};

type MenuState = {
	hasWorkspace: boolean;
};

type IgnoreRule = {
	dir: string;
	matcher: ReturnType<typeof ignore>;
};

type HtmlAppAsset = {
	name: string;
	source: string;
};

type WindowState = {
	width: number;
	height: number;
	x?: number;
	y?: number;
	isMaximized?: boolean;
	isFullScreen?: boolean;
};

type WindowBounds = {
	x: number;
	y: number;
	width: number;
	height: number;
};

type DesktopAuthState = {
	deploymentUrl: string;
	email?: string;
	name?: string;
} | null;

const isDev = !app.isPackaged || process.env.HUBBLE_DESKTOP_FORCE_DEV === "1";
const { autoUpdater } = electronUpdater;
const devAppName = isDev ? process.env.HUBBLE_DESKTOP_DEV_APP_NAME : undefined;
const appName = devAppName ?? "Hubble";
const debugPort = process.env.HUBBLE_DESKTOP_DEBUG_PORT ?? "9222";
const updateFeedUrl = process.env.HUBBLE_DESKTOP_UPDATE_URL;
const supportsAutoUpdates = !isDev && process.platform === "darwin";
// Check every 4 hours after the initial packaged-app update check.
const updateCheckIntervalMs = 4 * 60 * 60 * 1000;

app.setName(appName);
app.setAsDefaultProtocolClient("hubble");
if (devAppName) {
	app.setPath("userData", path.join(app.getPath("appData"), devAppName));
}

if (isDev && process.env.HUBBLE_DESKTOP_ENABLE_CDP === "1") {
	app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
	app.commandLine.appendSwitch("remote-debugging-port", debugPort);
}

let mainWindow: BrowserWindow | null = null;
let saveWindowStateTimer: ReturnType<typeof setTimeout> | null = null;
let pendingOpenPath: string | null = firstExistingFileArg(
	process.argv.slice(1),
);
const launchWorkspacePath =
	isDev && process.env.HUBBLE_DESKTOP_DEV_WORKSPACE
		? resolvePath(process.env.HUBBLE_DESKTOP_DEV_WORKSPACE)
		: null;
let menuState: MenuState = { hasWorkspace: false };
let updateState: DesktopUpdateState = {
	isSupported: supportsAutoUpdates,
	status: "idle",
	currentVersion: app.getVersion(),
	availableVersion: null,
	progressPercent: null,
	message: supportsAutoUpdates
		? null
		: "Updates are available on packaged macOS builds only.",
	lastCheckedAt: null,
};
const watchers = new Map<string, FSWatcher>();
let cachedAuthState: DesktopAuthState = null;
let authHandoffRendererReady = false;
let pendingAuthHandoff: z.infer<typeof desktopAuthHandoffSchema> | null = null;
let cliServer: CliServer | null = null;
// Always-on lifecycle (Decision C): background mode + tray are only engaged
// while a cloud Live-Document workspace is connected.
let tray: Tray | null = null;
let isQuitting = false;
let backgroundActive = false;
// Main-process Live Document reconcile engine (Phase 2). Manual-trigger only:
// no workspace-wide watcher yet (Phase 3).
const liveSync = new LiveSyncService();
// Synced-folder watcher engine (Phase 3b): bounded chokidar watch over the sync
// root → classify → reconcile/rename/move/create back to the cloud. The watcher
// factory is injected here so the engine itself stays headless/unit-tested.
function createSyncedFolderWatcher({
	syncRoot,
	onEvent,
}: {
	syncRoot: string;
	onEvent: (event: {
		type: "add" | "change" | "unlink";
		absPath: string;
		inode: number | null;
		hash: string | null;
		at: number;
	}) => void;
}) {
	const watcher = chokidar.watch(syncRoot, {
		ignoreInitial: true,
		ignored: (candidate: string) =>
			shouldIgnoreForWatch(path.resolve(candidate), syncRoot),
	});
	const emit = async (
		type: "add" | "change" | "unlink",
		changedPath: string,
	) => {
		const absPath = path.resolve(changedPath);
		let inode: number | null = null;
		let hash: string | null = null;
		if (type !== "unlink") {
			try {
				inode = fsSync.statSync(absPath).ino;
				hash = await contentHash(fsSync.readFileSync(absPath, "utf-8"));
			} catch {
				// File vanished between event and stat; correlation falls back to
				// the held entry's stored inode/hash.
			}
		}
		onEvent({ type, absPath, inode, hash, at: Date.now() });
	};
	watcher.on("add", (p) => void emit("add", p));
	watcher.on("change", (p) => void emit("change", p));
	watcher.on("unlink", (p) => void emit("unlink", p));
	watcher.on("error", (error) =>
		console.error("Synced-folder watcher failed:", error),
	);
	return { close: () => watcher.close() };
}

const offlineSentinel = process.env.HUBBLE_DESKTOP_OFFLINE_SENTINEL;

function isDesktopOffline(): boolean {
	// The sentinel gives acceptance tests a process-local offline switch without
	// disconnecting the developer's whole machine from the network.
	if (offlineSentinel && fsSync.existsSync(offlineSentinel)) return true;
	return !net.isOnline();
}

function emitProjectionEvent(event: SyncedFolderEvent): void {
	sendToRenderer("desktop:live-sync:event", event);
	if (
		(event.kind === "move-review-required" || event.kind === "trashed-local") &&
		(!mainWindow?.isVisible() || !mainWindow.isFocused()) &&
		Notification.isSupported()
	) {
		const notification = new Notification({
			title:
				event.kind === "trashed-local"
					? "Document moved to Trash"
					: "Review a document move",
			body:
				event.kind === "trashed-local"
					? "Open Hubble to undo."
					: "This move changes access or linked repository exposure.",
		});
		notification.on("click", () => {
			mainWindow?.show();
			mainWindow?.focus();
			sendToRenderer("desktop:live-sync:event", event);
		});
		notification.show();
	}
}

const syncedFolder = new SyncedFolderService({
	scope: { kind: "all-accessible" },
	emit: (event) =>
		emitProjectionEvent({
			...event,
			scope: {
				scopeKey: "all-accessible",
				kind: "all-accessible",
				workspaceId: null,
				folderId: null,
				localRoot: syncedFolder.getStatus().syncRoot,
			},
		}),
	deviceId: os.hostname(),
	isOffline: isDesktopOffline,
	createWatcher: createSyncedFolderWatcher,
});

const projectionManager = new ProjectionManager({
	wholeWorkspace: syncedFolder,
	createMount: (projectionScope) =>
		new SyncedFolderService({
			scope: projectionScope,
			emit: (event) => {
				const scopeKey = projectionScopeKey(projectionScope);
				const scope = projectionManager
					.listStatuses()
					.find((entry) => entry.scope.scopeKey === scopeKey)?.scope;
				emitProjectionEvent({
					...event,
					scope: scope ?? {
						scopeKey,
						kind: projectionScope.kind,
						workspaceId: projectionScope.workspaceId,
						folderId:
							projectionScope.kind === "folder"
								? projectionScope.folderId
								: null,
						localRoot: null,
					},
				});
			},
			deviceId: os.hostname(),
			isOffline: isDesktopOffline,
			createWatcher: createSyncedFolderWatcher,
		}),
});
const grantedFiles = new Set<string>();
const grantedRoots = new Set<string>();
let grantsLoaded = false;

const ignoreConfigFiles = [".gitignore", ".ignore"];
const ignoredWorkspaceDirs = new Set([".git", "dist", "node_modules"]);
const workspaceConfigVersion = 1;
const workspaceConfigDir = ".hubble";
const workspaceConfigFile = "config.json";
const workspaceConfigSchema = z.object({
	version: z.literal(workspaceConfigVersion),
	pinnedNotes: z.array(
		z
			.string()
			.min(1)
			// Pin refs live inside the workspace config; reject absolute paths and
			// traversal so config edits cannot point pin state outside the workspace.
			.refine(
				(note) => !path.isAbsolute(note) && !note.split("/").includes(".."),
			),
	),
});
const convexDeploymentUrlSchema = z
	.string()
	.trim()
	.url()
	.refine((value) => {
		const url = new URL(value);
		return url.protocol === "https:" || (isDev && url.protocol === "http:");
	}, "Convex deployment URL must be https");
const authTokenSchema = z.string().trim().min(1, "Auth token is required");
const liveSyncConnectSchema = z.object({
	workspacePath: z.string().min(1),
	deploymentUrl: convexDeploymentUrlSchema,
	workspaceId: z.string().min(1),
	authToken: authTokenSchema,
});
const liveSyncReconcileSchema = z.object({
	documentId: z.string().min(1),
	projectionPath: z.string().min(1),
	actor: z.string().optional(),
	path: z.string().optional(),
});
const syncedFolderConnectSchema = z.object({
	syncRoot: z.string().min(1),
	deploymentUrl: convexDeploymentUrlSchema,
	authToken: authTokenSchema,
});
const syncedFolderImportSchema = z.object({
	syncRoot: z.string().min(1),
	deploymentUrl: convexDeploymentUrlSchema,
	workspaceId: z.string().min(1),
	authToken: authTokenSchema,
});
const repoLinkSchema = z.object({
	folderId: z.string().min(1),
	folderName: z.string().min(1),
	workspaceId: z.string().min(1),
	repoDir: z.string().min(1),
	mountPath: z.string().min(1).optional(),
	deploymentUrl: convexDeploymentUrlSchema,
	authToken: authTokenSchema,
});
const repoMountReconnectSchema = z.object({
	deploymentUrl: convexDeploymentUrlSchema,
	authToken: authTokenSchema,
});
const desktopAuthStateSchema = z
	.object({
		deploymentUrl: convexDeploymentUrlSchema,
		email: z.string().optional(),
		name: z.string().optional(),
	})
	.nullable();
const desktopAuthHandoffSchema = z.object({
	deploymentUrl: convexDeploymentUrlSchema,
	code: z.string().min(32),
});
const repoLinkUndoSchema = z.object({
	folderId: z.string().min(1),
});
const repoMountStopSchema = z.object({
	folderId: z.string().min(1),
	keepFiles: z.boolean(),
	deploymentUrl: convexDeploymentUrlSchema,
	authToken: authTokenSchema,
});
const repoMountRelocateSchema = z.object({
	folderId: z.string().min(1),
	mountPath: z.string().min(1),
	deploymentUrl: convexDeploymentUrlSchema,
	authToken: authTokenSchema,
});
const directProjectionScopeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("workspace"), workspaceId: z.string().min(1) }),
	z.object({
		kind: z.literal("folder"),
		workspaceId: z.string().min(1),
		folderId: z.string().min(1),
	}),
]);
const localAvailabilityCreateSchema = z.discriminatedUnion("association", [
	z.object({
		association: z.literal("standalone"),
		scope: directProjectionScopeSchema,
		displayName: z.string().min(1),
		localRoot: z.string().min(1),
		deploymentUrl: convexDeploymentUrlSchema,
		authToken: authTokenSchema,
	}),
	z.object({
		association: z.literal("repo"),
		scope: z.object({
			kind: z.literal("folder"),
			workspaceId: z.string().min(1),
			folderId: z.string().min(1),
		}),
		displayName: z.string().min(1),
		localRoot: z.string().min(1),
		repoRoot: z.string().min(1),
		deploymentUrl: convexDeploymentUrlSchema,
		authToken: authTokenSchema,
	}),
]);
const localAvailabilityRelocateSchema = z.object({
	scopeKey: z.string().min(1),
	localRoot: z.string().min(1),
	deploymentUrl: convexDeploymentUrlSchema,
	authToken: authTokenSchema,
});
const localAvailabilityStopSchema = z.object({
	scopeKey: z.string().min(1),
	keepFiles: z.boolean(),
	deploymentUrl: convexDeploymentUrlSchema,
	authToken: authTokenSchema,
});
const localAvailabilityReconnectSchema = z.object({
	deploymentUrl: convexDeploymentUrlSchema,
	authToken: authTokenSchema,
});
const defaultWindowState: WindowState = { width: 920, height: 720 };
const windowStateSchema = z.object({
	width: z.number().int().min(640).max(4096),
	height: z.number().int().min(480).max(4096),
	x: z.number().int().optional(),
	y: z.number().int().optional(),
	isMaximized: z.boolean().optional(),
	isFullScreen: z.boolean().optional(),
});
const htmlAppHeadStyles = [
	{ name: "hubble-theme", source: htmlAppTheme },
] as const;
const htmlAppHeadScripts = [
	{ name: "hubble-runtime", source: hubbleRuntime },
	{ name: "tailwind-browser", source: tailwindRuntime },
] as const;
// Alpine's CDN build auto-starts immediately; inline scripts cannot use defer.
const htmlAppBodyEndScripts = [
	{ name: "alpine", source: alpineRuntime },
] as const;

function grantsPath(): string {
	return path.join(app.getPath("userData"), "grants.json");
}

function windowStatePath(): string {
	return path.join(app.getPath("userData"), "window-size.json");
}

function workspaceConfigPath(workspacePath: string): string {
	const root = assertGrantedRoot(workspacePath);
	return path.join(root, workspaceConfigDir, workspaceConfigFile);
}

function emptyWorkspaceConfig(): WorkspaceConfig {
	return { version: workspaceConfigVersion, pinnedNotes: [] };
}

function parseWorkspaceConfig(raw: string): WorkspaceConfig {
	try {
		return workspaceConfigSchema.parse(JSON.parse(raw));
	} catch {
		return emptyWorkspaceConfig();
	}
}

function normalizeWorkspaceConfig(input: WorkspaceConfig): WorkspaceConfig {
	const config = workspaceConfigSchema.safeParse(input);
	if (!config.success) return emptyWorkspaceConfig();
	return {
		version: workspaceConfigVersion,
		pinnedNotes: [...new Set(config.data.pinnedNotes)],
	};
}

async function loadGrants() {
	try {
		const raw = await fs.readFile(grantsPath(), "utf8");
		const parsed = JSON.parse(raw) as { files?: unknown; roots?: unknown };
		if (Array.isArray(parsed.files)) {
			for (const filePath of parsed.files) {
				if (typeof filePath === "string")
					grantedFiles.add(resolvePath(filePath));
			}
		}
		if (Array.isArray(parsed.roots)) {
			for (const rootPath of parsed.roots) {
				if (typeof rootPath === "string")
					grantedRoots.add(resolvePath(rootPath));
			}
		}
	} catch {
		// Missing or malformed grants just means the user must pick paths again.
	} finally {
		grantsLoaded = true;
	}
}

async function saveGrants() {
	if (!grantsLoaded) return;
	await fs.mkdir(path.dirname(grantsPath()), { recursive: true });
	await fs.writeFile(
		grantsPath(),
		JSON.stringify(
			{
				files: [...grantedFiles],
				roots: [...grantedRoots],
			},
			null,
			2,
		),
	);
}

const cloudMarkdownImportSchema = z.object({
	sourcePath: z.string().min(1),
	deploymentUrl: z.string().min(1),
	authToken: z.string().min(1),
	workspaceId: z.string().min(1),
	folderId: z.string().min(1).optional(),
	idempotencyKey: z.string().min(1),
	mode: z.enum(["copy", "move"]),
});

function repoMountsPath(): string {
	return path.join(app.getPath("userData"), "repo-mounts.json");
}

function localAvailabilityPath(): string {
	return path.join(app.getPath("userData"), "local-availability.json");
}

const localAvailabilityStore = new LocalAvailabilityStore({
	filePath: localAvailabilityPath(),
	legacyRepoMountsPath: repoMountsPath(),
});

function toProjectionMount(mount: StoredLocalAvailability): ProjectionMount {
	return {
		scope: mount.scope,
		localRoot: mount.localRoot,
	};
}

async function accessibleFolderTopology(
	backend: SyncBackend,
	workspaceId: string,
): Promise<Folder[]> {
	try {
		return await backend.getFolders(workspaceId);
	} catch {
		// Folder editors may mount a shared subtree without Workspace membership.
		// Their Shared-with-me tree is the complete topology they can project.
		const shared = await backend.getSharedWithMe();
		return shared.folders
			.filter((root) => root.workspaceId === workspaceId)
			.flatMap((root) => [
				{
					_id: root.folderId,
					name: root.name,
					parentId: root.parentId,
					workspaceId: root.workspaceId,
				},
				...root.folders.map((folder) => ({
					_id: folder._id,
					name: folder.name,
					parentId: folder.parentId,
					workspaceId: root.workspaceId,
				})),
			]);
	}
}

async function projectionForImport(
	backend: SyncBackend,
	workspaceId: string,
	folderId?: string,
): Promise<
	| { kind: "all-accessible" }
	| { kind: "workspace"; scopeKey: string }
	| { kind: "folder"; folderId: string; scopeKey: string }
	| null
> {
	if (projectionManager.wholeWorkspaceConnected) {
		return { kind: "all-accessible" };
	}
	const mounts = (await localAvailabilityStore.list()).filter(
		(mount) =>
			mount.scope.workspaceId === workspaceId &&
			projectionManager.getMountStatus(mount.scopeKey)?.connected,
	);
	if (mounts.length === 0) return null;
	const workspace = mounts.find((mount) => mount.scope.kind === "workspace");
	if (workspace) return { kind: "workspace", scopeKey: workspace.scopeKey };
	if (!folderId) return null;
	const parentById = new Map(
		(await accessibleFolderTopology(backend, workspaceId)).map((folder) => [
			folder._id,
			folder.parentId,
		]),
	);
	const mount = mounts.find(
		(candidate) =>
			candidate.scope.kind === "folder" &&
			isFolderWithinProjection(candidate.scope.folderId, folderId, parentById),
	);
	return mount?.scope.kind === "folder"
		? {
				kind: "folder",
				folderId: mount.scope.folderId,
				scopeKey: mount.scopeKey,
			}
		: null;
}

async function performCloudMarkdownImport(input: CloudMarkdownImportInput) {
	const parsed = cloudMarkdownImportSchema.parse(input);
	const sourcePath = assertGranted(parsed.sourcePath);
	if (!/\.(md|markdown|mdown)$/i.test(sourcePath)) {
		throw new Error("Hubble can bring in Markdown files only");
	}
	const markdown = await fs.readFile(sourcePath, "utf8");
	assertLiveDocumentMarkdownWithinCap(markdown, "Markdown file");
	const backend = createConvexBackend(parsed.deploymentUrl, parsed.authToken);
	const projection = await projectionForImport(
		backend,
		parsed.workspaceId,
		parsed.folderId,
	);
	if (parsed.mode === "move" && !projection) {
		throw new Error(
			"Make this destination available on this computer before moving the source. Import a copy works without local availability.",
		);
	}
	const fileName = path.basename(sourcePath);
	const imported = await backend.importLiveDocument({
		workspaceId: parsed.workspaceId,
		folderId: parsed.folderId,
		path: fileName,
		title: path.basename(fileName, path.extname(fileName)),
		markdown,
		idempotencyKey: parsed.idempotencyKey,
		actor: "desktop-import",
	});
	if (projection?.kind === "all-accessible") {
		await projectionManager.refreshWholeWorkspace();
	} else if (projection) {
		await projectionManager.refreshMount(projection.scopeKey);
	}
	const connectedPath = projectionManager.findDocumentPath(imported.documentId);
	if (connectedPath) {
		const cloudDocument = await backend.getDocumentForAgent(
			imported.documentId,
		);
		const materialized = await fs.readFile(connectedPath, "utf8");
		if (!cloudDocument || materialized !== cloudDocument.markdown) {
			throw new Error(
				"Hubble created the cloud document but could not verify its connected local copy. The source was left untouched.",
			);
		}
	}
	if (parsed.mode === "move") {
		if (!connectedPath) {
			throw new Error(
				"Hubble created the cloud document but could not verify its connected local copy. The source was left untouched.",
			);
		}
		if (path.resolve(connectedPath) !== path.resolve(sourcePath)) {
			await fs.rm(sourcePath);
		}
	}
	return {
		documentId: imported.documentId,
		connectedPath,
	};
}

async function assertLocalAvailabilityAvailable(
	candidate: ProjectionMount,
	backend: SyncBackend,
	ignoreScopeKey?: string,
): Promise<void> {
	if (projectionManager.wholeWorkspaceConnected) {
		throw new Error(
			"The legacy all-accessible mirror is incompatible with direct local availability. Stop it in Settings before making this Space or folder available.",
		);
	}
	const records = await localAvailabilityStore.list();
	const candidateScopeKey = projectionScopeKey(candidate.scope);
	if (
		candidateScopeKey !== ignoreScopeKey &&
		records.some((record) => record.scopeKey === candidateScopeKey)
	) {
		throw new Error(
			"This cloud scope is already available on this computer. Reconnect or relocate the existing projection.",
		);
	}
	const existing = records
		.filter((record) => record.scopeKey !== ignoreScopeKey)
		.map(toProjectionMount);
	await assertLocalProjectionRootsDisjoint(candidate, existing, {
		realpath: fs.realpath,
		caseInsensitive:
			process.platform === "darwin" || process.platform === "win32",
	});
	// Only an empty root or the same indexed projection is safe before setup writes.
	let rootEntries: string[] = [];
	try {
		rootEntries = await fs.readdir(candidate.localRoot);
	} catch (error) {
		if (
			typeof error !== "object" ||
			error === null ||
			!("code" in error) ||
			error.code !== "ENOENT"
		) {
			throw error;
		}
	}
	const indexPath = path.join(
		candidate.localRoot,
		...SYNCED_FOLDER_INDEX_REL.split("/"),
	);
	const hasIndex = await pathExistsAsFile(indexPath);
	let indexedMount = null;
	if (hasIndex) {
		try {
			const parsed = JSON.parse(await fs.readFile(indexPath, "utf8")) as {
				version?: unknown;
				mount?: unknown;
			};
			if (parsed.version === 2 && typeof parsed.mount === "object") {
				indexedMount = parsed.mount as
					| { kind: "workspace-mirror" }
					| { kind: "workspace"; workspaceId: string }
					| { kind: "folder"; folderId: string };
			}
		} catch {
			indexedMount = null;
		}
	}
	assertLocalProjectionDestinationAvailable(
		classifySyncedFolderRoot(
			hasIndex ? [...rootEntries, SYNCED_FOLDER_INDEX_REL] : rootEntries,
		).state,
		indexedMount,
		candidate.scope,
	);
	if (
		existing.some(
			(mount) => mount.scope.workspaceId === candidate.scope.workspaceId,
		)
	) {
		assertCloudProjectionRootsDisjoint(
			candidate,
			existing,
			await accessibleFolderTopology(backend, candidate.scope.workspaceId),
		);
	}
}

function localAvailabilityStatus(
	stored: StoredLocalAvailability,
	recoveryCount: number,
): LocalAvailabilityRecord {
	const status = projectionManager.getMountStatus(stored.scopeKey);
	return {
		...stored,
		incompatible: false,
		state: status?.state ?? "disconnected",
		lastSyncAt: status?.lastReconcileAt ?? null,
		pendingOperationCount: status?.pendingOperationCount ?? 0,
		recoveryCount,
	};
}

async function currentLocalAvailabilityStatus(
	stored: StoredLocalAvailability,
): Promise<LocalAvailabilityRecord> {
	const agentStatus = (await projectionManager.getAgentStatus()).find(
		(entry) => entry.scope.scopeKey === stored.scopeKey,
	);
	return localAvailabilityStatus(stored, agentStatus?.operations.recovery ?? 0);
}

async function listLocalAvailability(): Promise<LocalAvailabilityRecord[]> {
	const agentStatuses = await projectionManager.getAgentStatus();
	const records = (await localAvailabilityStore.list()).map((stored) =>
		localAvailabilityStatus(
			stored,
			agentStatuses.find((entry) => entry.scope.scopeKey === stored.scopeKey)
				?.operations.recovery ?? 0,
		),
	);
	const legacyStatus = projectionManager.getWholeWorkspaceStatus();
	if (legacyStatus.syncRoot || legacyStatus.state !== "idle") {
		const agentStatus = agentStatuses.find(
			(entry) => entry.scope.scopeKey === "all-accessible",
		);
		records.push({
			scopeKey: "all-accessible",
			scope: { kind: "all-accessible" },
			displayName: "Legacy all-accessible mirror",
			localRoot: legacyStatus.syncRoot ?? "",
			association: "legacy",
			incompatible: true,
			repoRoot: null,
			repoName: null,
			repoRemoteUrl: null,
			gitExclusion: { status: "not-applicable" },
			state: legacyStatus.state,
			lastSyncAt: legacyStatus.lastReconcileAt,
			pendingOperationCount: legacyStatus.pendingOperationCount,
			recoveryCount: agentStatus?.operations.recovery ?? 0,
			createdAt: null,
			updatedAt: null,
			lastConnectedAt: null,
		});
	}
	return records;
}

async function repoMountStatus(
	stored: StoredLocalAvailability,
): Promise<RepoMount> {
	if (stored.scope.kind !== "folder" || stored.association !== "repo") {
		throw new Error(`Repo mount not found: ${stored.scopeKey}`);
	}
	const status = projectionManager.getMountStatus(stored.scopeKey);
	return {
		folderId: stored.scope.folderId,
		folderName: stored.displayName,
		workspaceId: stored.scope.workspaceId,
		mountPath: stored.localRoot,
		repoDir: stored.repoRoot ?? "",
		repoName: stored.repoName,
		repoRemoteUrl: stored.repoRemoteUrl,
		status: status ? status.state : "disconnected",
		lastReconcileAt: status?.lastReconcileAt ?? null,
	};
}

async function performRepoLink(input: unknown): Promise<RepoLinkResult> {
	const parsed = repoLinkSchema.parse(input);
	if (
		cachedAuthState &&
		cachedAuthState.deploymentUrl !== parsed.deploymentUrl
	) {
		throw new Error(
			`Desktop app is signed in to ${cachedAuthState.deploymentUrl}; refusing mount for ${parsed.deploymentUrl}.`,
		);
	}

	const selectedRepoDir = resolvePath(parsed.repoDir);
	const repo = await resolveGitRepo(selectedRepoDir);
	const repoDir = repo?.repoDir ?? selectedRepoDir;
	const mountPath = parsed.mountPath
		? resolvePath(parsed.mountPath)
		: path.join(repoDir, sanitizeMountSegment(parsed.folderName));
	const backend = createConvexBackend(parsed.deploymentUrl, parsed.authToken);
	const scope = {
		kind: "folder" as const,
		folderId: parsed.folderId,
		workspaceId: parsed.workspaceId,
	};
	await assertLocalAvailabilityAvailable(
		{ scope, localRoot: mountPath },
		backend,
	);
	grantRoot(repoDir);
	grantRoot(mountPath);
	await fs.mkdir(mountPath, { recursive: true });
	await fs.rm(path.join(mountPath, ".hubble-export.json"), { force: true });

	// Read-only best-effort origin parse → cloud display metadata (D11).
	const repoRemoteUrl = repo
		? await parseGitOriginUrl(repo.commonGitDir)
		: null;
	const repoName = repoNameFrom(repoDir, repoRemoteUrl);
	await backend.setFolderRepoLink({
		folderId: parsed.folderId,
		repoName,
		repoRemoteUrl: repoRemoteUrl ?? undefined,
	});

	// RB5: seed BRAIN.md once (idempotent, any-case).
	let brainSeeded = false;
	const subtreeDocs = await backend.getFolderSubtreeDocuments(parsed.folderId);
	const hasBrain = hasBrainDocument(subtreeDocs);
	if (!hasBrain) {
		const markdown = buildBrainMarkdown({
			folderName: parsed.folderName,
			repoName,
			repoRemoteUrl,
			documentIndex: subtreeDocs.map((doc) => ({
				title: doc.title,
				relativePath: doc.relativePath,
			})),
		});
		await backend.createDocument({
			workspaceId: parsed.workspaceId,
			folderId: parsed.folderId,
			title: "BRAIN",
			path: BRAIN_DOC_FILENAME,
			markdown,
			actor: "repo-link-seed",
		});
		brainSeeded = true;
	}

	// Materialize the subtree at the mount + start the per-mount engine.
	await projectionManager.connectMount(scope, {
		syncRoot: mountPath,
		deploymentUrl: parsed.deploymentUrl,
		authToken: parsed.authToken,
	});
	setBackgroundActive(true);

	// Keep the mount invisible to git (never edits tracked files).
	let excluded = false;
	let manualGitignoreLine: string | null = null;
	let gitExclusion: StoredLocalAvailability["gitExclusion"] = {
		status: "not-applicable",
	};
	if (repo) {
		const result = await excludeMountFromGit(repo, mountPath);
		excluded = result.ok;
		manualGitignoreLine = result.ok ? null : result.pattern;
		gitExclusion = result.ok
			? { status: "excluded", pattern: result.pattern }
			: { status: "manual", pattern: result.pattern };
	}

	const now = Date.now();
	await localAvailabilityStore.upsert({
		scopeKey: projectionScopeKey(scope),
		scope,
		displayName: parsed.folderName,
		localRoot: mountPath,
		association: "repo",
		repoRoot: repoDir,
		repoName,
		repoRemoteUrl,
		gitExclusion,
		createdAt: now,
		updatedAt: now,
		lastConnectedAt: now,
	});

	return {
		folderId: parsed.folderId,
		repoDir,
		mountPath,
		isGitRepo: repo !== null,
		excluded,
		manualGitignoreLine,
		repoName,
		repoRemoteUrl,
		brainSeeded,
		documentCount:
			projectionManager.getMountStatus(projectionScopeKey(scope))
				?.documentCount ?? 0,
	};
}

async function unlinkRepoMount(folderId: string): Promise<void> {
	const scopeKey = `folder:${folderId}`;
	await projectionManager.disconnectMount(scopeKey);
	await localAvailabilityStore.remove(scopeKey);
	if (
		projectionManager.mountCount === 0 &&
		!projectionManager.wholeWorkspaceConnected
	) {
		setBackgroundActive(false);
	}
}

async function undoRepoMount(folderId: string): Promise<{
	folderId: string;
	mountPath: string;
	removedFiles: boolean;
}> {
	const scopeKey = `folder:${folderId}`;
	const mount = (await localAvailabilityStore.list()).find(
		(entry) => entry.scopeKey === scopeKey && entry.association === "repo",
	);
	if (!mount) throw new Error(`Repo mount not found: ${folderId}`);

	await unlinkRepoMount(folderId);
	const clean = await isMountClean(mount.localRoot);
	if (clean) {
		await fs.rm(mount.localRoot, { recursive: true, force: true });
	}
	return {
		folderId,
		mountPath: mount.localRoot,
		removedFiles: clean,
	};
}

async function inspectRepoMountCleanliness(
	folderId: string,
): Promise<RepoMountCleanliness> {
	return inspectLocalAvailabilityCleanliness(`folder:${folderId}`);
}

async function inspectLocalAvailabilityCleanliness(
	scopeKey: string,
): Promise<RepoMountCleanliness> {
	const mount = (await localAvailabilityStore.list()).find(
		(entry) => entry.scopeKey === scopeKey,
	);
	if (!mount) throw new Error(`Local availability not found: ${scopeKey}`);
	const status =
		projectionManager.getMountStatus(scopeKey)?.state ?? "disconnected";
	const filesClean =
		status === "connected" && (await isMountClean(mount.localRoot));
	return mountCleanliness(status, filesClean);
}

async function stopRepoMount(input: unknown): Promise<RepoMountStopResult> {
	const parsed = repoMountStopSchema.parse(input);
	const result = await stopLocalAvailability({
		scopeKey: `folder:${parsed.folderId}`,
		keepFiles: parsed.keepFiles,
		deploymentUrl: parsed.deploymentUrl,
		authToken: parsed.authToken,
	});
	return result.status === "stopped"
		? {
				status: "stopped",
				mountPath: result.localRoot,
				keptFiles: result.keptFiles,
			}
		: result;
}

async function connectLocalAvailabilityEngine(
	record: StoredLocalAvailability,
	deploymentUrl: string,
	authToken: string,
): Promise<void> {
	await projectionManager.connectMount(record.scope, {
		syncRoot: record.localRoot,
		deploymentUrl,
		authToken,
	});
}

async function stopLocalAvailability(
	input: LocalAvailabilityStopInput,
): Promise<LocalAvailabilityStopResult> {
	const parsed = localAvailabilityStopSchema.parse(input);
	const mount = (await localAvailabilityStore.list()).find(
		(entry) => entry.scopeKey === parsed.scopeKey,
	);
	if (!mount)
		throw new Error(`Local availability not found: ${parsed.scopeKey}`);
	const cleanliness = await inspectLocalAvailabilityCleanliness(
		parsed.scopeKey,
	);
	if (cleanliness.state === "blocked") {
		return { status: "blocked", cleanliness };
	}
	// The dialog inspection is advisory. Stop the watcher and verify the bytes
	// once more so an intervening edit is preserved instead of detached/removed.
	await projectionManager.disconnectMount(parsed.scopeKey);
	const stoppedCleanliness = mountCleanliness(
		"connected",
		await isMountClean(mount.localRoot),
	);
	if (stoppedCleanliness.state === "blocked") {
		await connectLocalAvailabilityEngine(
			mount,
			parsed.deploymentUrl,
			parsed.authToken,
		);
		return { status: "blocked", cleanliness: stoppedCleanliness };
	}
	await localAvailabilityStore.remove(parsed.scopeKey);
	if (parsed.keepFiles) {
		await fs.rm(path.join(mount.localRoot, ".hubble"), {
			recursive: true,
			force: true,
		});
	} else {
		await fs.rm(mount.localRoot, { recursive: true, force: true });
	}
	if (
		projectionManager.mountCount === 0 &&
		!projectionManager.wholeWorkspaceConnected
	) {
		setBackgroundActive(false);
	}
	return {
		status: "stopped",
		localRoot: mount.localRoot,
		keptFiles: parsed.keepFiles,
	};
}

async function moveProjectionRoot(
	fromPath: string,
	toPath: string,
): Promise<void> {
	// The picker creates the destination. rmdir fails safely if anything arrived
	// after validation; recursive removal here could destroy an unrelated file.
	await fs.rmdir(toPath);
	try {
		await fs.rename(fromPath, toPath);
	} catch (error) {
		if (
			!(error instanceof Error) ||
			!("code" in error) ||
			error.code !== "EXDEV"
		) {
			throw error;
		}
		try {
			await fs.cp(fromPath, toPath, {
				recursive: true,
				errorOnExist: true,
				force: false,
			});
			await fs.rm(fromPath, { recursive: true, force: true });
		} catch (copyError) {
			await fs.rm(toPath, { recursive: true, force: true });
			throw copyError;
		}
	}
}

async function relocateRepoMount(
	input: RepoMountRelocateInput,
): Promise<RepoMountRelocateResult> {
	const parsed = repoMountRelocateSchema.parse(input);
	const result = await relocateLocalAvailability({
		scopeKey: `folder:${parsed.folderId}`,
		localRoot: parsed.mountPath,
		deploymentUrl: parsed.deploymentUrl,
		authToken: parsed.authToken,
	});
	if (result.status === "blocked") return result;
	const record = (await localAvailabilityStore.list()).find(
		(entry) => entry.scopeKey === `folder:${parsed.folderId}`,
	);
	if (!record) throw new Error(`Repo mount not found: ${parsed.folderId}`);
	return { status: "relocated", mount: await repoMountStatus(record) };
}

async function relocateLocalAvailability(
	input: LocalAvailabilityRelocateInput,
): Promise<LocalAvailabilityRelocateResult> {
	const parsed = localAvailabilityRelocateSchema.parse(input);
	const mounts = await localAvailabilityStore.list();
	const mount = mounts.find((entry) => entry.scopeKey === parsed.scopeKey);
	if (!mount)
		throw new Error(`Local availability not found: ${parsed.scopeKey}`);
	const cleanliness = await inspectLocalAvailabilityCleanliness(
		parsed.scopeKey,
	);
	if (cleanliness.state === "blocked") {
		return { status: "blocked", cleanliness };
	}
	const nextPath = assertGrantedRoot(parsed.localRoot);
	if (resolvePath(mount.localRoot) === resolvePath(nextPath)) {
		throw new Error("Choose a different folder for local availability.");
	}
	const entries = await fs.readdir(nextPath);
	if (entries.length > 0) {
		throw new Error("Choose a new empty folder for local availability.");
	}
	await assertLocalAvailabilityAvailable(
		{ scope: mount.scope, localRoot: nextPath },
		createConvexBackend(parsed.deploymentUrl, parsed.authToken),
		parsed.scopeKey,
	);
	await projectionManager.disconnectMount(parsed.scopeKey);
	// Close the watcher, then compare indexed bytes again before changing either
	// path. This catches edits made after the renderer's initial inspection.
	const stoppedCleanliness = mountCleanliness(
		"connected",
		await isMountClean(mount.localRoot),
	);
	if (stoppedCleanliness.state === "blocked") {
		await connectLocalAvailabilityEngine(
			mount,
			parsed.deploymentUrl,
			parsed.authToken,
		);
		return { status: "blocked", cleanliness: stoppedCleanliness };
	}
	try {
		await rewriteProjectionIndexRoot(
			mount.localRoot,
			mount.localRoot,
			nextPath,
		);
	} catch (error) {
		await connectLocalAvailabilityEngine(
			mount,
			parsed.deploymentUrl,
			parsed.authToken,
		);
		throw error;
	}
	try {
		await moveProjectionRoot(mount.localRoot, nextPath);
	} catch (error) {
		await rewriteProjectionIndexRoot(
			mount.localRoot,
			nextPath,
			mount.localRoot,
		);
		await connectLocalAvailabilityEngine(
			mount,
			parsed.deploymentUrl,
			parsed.authToken,
		);
		throw error;
	}
	const relocated = {
		...mount,
		localRoot: nextPath,
		updatedAt: Date.now(),
		lastConnectedAt: Date.now(),
	};
	await localAvailabilityStore.upsert(relocated);
	grantRoot(nextPath);
	await connectLocalAvailabilityEngine(
		relocated,
		parsed.deploymentUrl,
		parsed.authToken,
	);
	return {
		status: "relocated",
		availability: await currentLocalAvailabilityStatus(relocated),
	};
}

async function createLocalAvailability(
	input: LocalAvailabilityCreateInput,
): Promise<LocalAvailabilityRecord> {
	const parsed = localAvailabilityCreateSchema.parse(input);
	if (
		cachedAuthState &&
		cachedAuthState.deploymentUrl !== parsed.deploymentUrl
	) {
		throw new Error(
			`Desktop app is signed in to ${cachedAuthState.deploymentUrl}; refusing local availability for ${parsed.deploymentUrl}.`,
		);
	}
	if (parsed.association === "repo") {
		await performRepoLink({
			folderId: parsed.scope.folderId,
			folderName: parsed.displayName,
			workspaceId: parsed.scope.workspaceId,
			repoDir: parsed.repoRoot,
			mountPath: parsed.localRoot,
			deploymentUrl: parsed.deploymentUrl,
			authToken: parsed.authToken,
		});
		const record = (await localAvailabilityStore.list()).find(
			(entry) => entry.scopeKey === projectionScopeKey(parsed.scope),
		);
		if (!record)
			throw new Error("Hubble could not persist local availability.");
		return currentLocalAvailabilityStatus(record);
	}

	const localRoot = assertGrantedRoot(parsed.localRoot);
	const backend = createConvexBackend(parsed.deploymentUrl, parsed.authToken);
	const scopeKey = projectionScopeKey(parsed.scope);
	sendToRenderer("desktop:local-availability:progress", {
		scopeKey,
		phase: "verifying",
	});
	await assertLocalAvailabilityAvailable(
		{ scope: parsed.scope, localRoot },
		backend,
	);
	sendToRenderer("desktop:local-availability:progress", {
		scopeKey,
		phase: "materializing",
	});
	await fs.mkdir(localRoot, { recursive: true });
	const now = Date.now();
	const record: StoredLocalAvailability = {
		scopeKey,
		scope: parsed.scope,
		displayName: parsed.displayName,
		localRoot,
		association: "standalone",
		repoRoot: null,
		repoName: null,
		repoRemoteUrl: null,
		gitExclusion: { status: "not-applicable" },
		createdAt: now,
		updatedAt: now,
		lastConnectedAt: now,
	};
	await connectLocalAvailabilityEngine(
		record,
		parsed.deploymentUrl,
		parsed.authToken,
	);
	try {
		await localAvailabilityStore.upsert(record);
	} catch (error) {
		await projectionManager.disconnectMount(record.scopeKey);
		throw error;
	}
	setBackgroundActive(true);
	return currentLocalAvailabilityStatus(record);
}

async function reconnectLocalAvailability(
	input: LocalAvailabilityReconnectInput,
): Promise<LocalAvailabilityRecord[]> {
	const parsed = localAvailabilityReconnectSchema.parse(input);
	const records = await localAvailabilityStore.list();
	const backend = createConvexBackend(parsed.deploymentUrl, parsed.authToken);
	for (const record of records) {
		if (projectionManager.hasMount(record.scopeKey)) continue;
		try {
			grantRoot(record.localRoot);
			await assertLocalAvailabilityAvailable(
				toProjectionMount(record),
				backend,
				record.scopeKey,
			);
			await connectLocalAvailabilityEngine(
				record,
				parsed.deploymentUrl,
				parsed.authToken,
			);
			await localAvailabilityStore.upsert({
				...record,
				updatedAt: Date.now(),
				lastConnectedAt: Date.now(),
			});
		} catch (error) {
			console.error(
				`Failed to reconnect local availability ${record.scopeKey}:`,
				error,
			);
		}
	}
	if (projectionManager.mountCount > 0) setBackgroundActive(true);
	return listLocalAvailability();
}

async function startCliCommandServer(): Promise<void> {
	cliServer = await startCliServer({
		socketPath: path.join(app.getPath("userData"), "cli.sock"),
		handlers: {
			async status() {
				const mounts = (await localAvailabilityStore.list()).filter(
					(record) => record.association === "repo",
				);
				return {
					appVersion: app.getVersion(),
					auth: cachedAuthState,
					mounts: await Promise.all(mounts.map(repoMountStatus)),
					projections: await projectionManager.getAgentStatus(),
				};
			},
			async "link-repo"(args) {
				const parsed = repoLinkSchema.parse(args);
				const result = await performRepoLink(parsed);
				sendToRenderer("desktop:repo-link:linked", {
					folderId: parsed.folderId,
					folderName: parsed.folderName,
					mountPath: result.mountPath,
					repoDir: result.repoDir,
				});
				return result;
			},
			async "login-with-handoff"(args) {
				const handoff = desktopAuthHandoffSchema.parse(args);
				pendingAuthHandoff = handoff;
				if (authHandoffRendererReady) {
					sendToRenderer("desktop:auth-handoff", handoff);
					pendingAuthHandoff = null;
				}
				mainWindow?.show();
				return { accepted: true };
			},
		},
	});
}

async function loadWindowState(): Promise<WindowState> {
	try {
		const raw = await fs.readFile(windowStatePath(), "utf8");
		const parsed = windowStateSchema.safeParse(JSON.parse(raw));
		if (parsed.success) return resolveWindowState(parsed.data);
	} catch {
		// Missing or malformed window state should not block launch.
	}
	return defaultWindowState;
}

function resolveWindowState(state: WindowState): WindowState {
	if (
		state.x === undefined ||
		state.y === undefined ||
		!isVisibleWindowBounds({
			x: state.x,
			y: state.y,
			width: state.width,
			height: state.height,
		})
	) {
		return {
			...clampWindowSize(state, screen.getPrimaryDisplay().workArea),
			isMaximized: state.isMaximized,
			isFullScreen: state.isFullScreen,
		};
	}
	const bounds = {
		x: state.x,
		y: state.y,
		width: state.width,
		height: state.height,
	};
	return {
		...state,
		...clampWindowBounds(bounds, screen.getDisplayMatching(bounds).workArea),
	};
}

function clampWindowSize(
	{ width, height }: Pick<WindowState, "width" | "height">,
	workArea: { width: number; height: number },
) {
	return {
		width: Math.min(width, workArea.width),
		height: Math.min(height, workArea.height),
	};
}

function clampWindowBounds(bounds: WindowBounds, workArea: WindowBounds) {
	const size = clampWindowSize(bounds, workArea);
	return {
		...size,
		x: Math.min(
			Math.max(bounds.x, workArea.x),
			workArea.x + workArea.width - size.width,
		),
		y: Math.min(
			Math.max(bounds.y, workArea.y),
			workArea.y + workArea.height - size.height,
		),
	};
}

function isVisibleWindowBounds(bounds: WindowBounds) {
	return screen.getAllDisplays().some(({ workArea }) => {
		const visibleWidth =
			Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
			Math.max(bounds.x, workArea.x);
		const visibleHeight =
			Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
			Math.max(bounds.y, workArea.y);
		return (
			visibleWidth >= Math.min(160, bounds.width) &&
			visibleHeight >= Math.min(120, bounds.height)
		);
	});
}

function saveWindowState(window: BrowserWindow) {
	if (window.isDestroyed() || window.isMinimized()) return;
	const bounds = window.getNormalBounds();
	const parsed = windowStateSchema.safeParse({
		...bounds,
		isMaximized: window.isMaximized(),
		isFullScreen: window.isFullScreen(),
	});
	if (!parsed.success) return;
	try {
		fsSync.mkdirSync(path.dirname(windowStatePath()), { recursive: true });
		fsSync.writeFileSync(
			windowStatePath(),
			JSON.stringify(parsed.data, null, 2),
		);
	} catch {
		// Best-effort window state should not interrupt resize or app shutdown.
	}
}

function queueSaveWindowState(window: BrowserWindow) {
	if (saveWindowStateTimer) clearTimeout(saveWindowStateTimer);
	saveWindowStateTimer = setTimeout(() => {
		saveWindowStateTimer = null;
		saveWindowState(window);
	}, 300);
}

function resolvePath(input: string): string {
	if (typeof input !== "string" || input.trim().length === 0) {
		throw new Error("Path is required");
	}
	if (input === "~") return app.getPath("home");
	if (input.startsWith("~/") || input.startsWith("~\\")) {
		return path.resolve(app.getPath("home"), input.slice(2));
	}
	return path.resolve(input);
}

function grantFile(filePath: string) {
	grantedFiles.add(resolvePath(filePath));
	void saveGrants();
}

function grantRoot(rootPath: string) {
	grantedRoots.add(resolvePath(rootPath));
	void saveGrants();
}

function grantFileWithParent(filePath: string) {
	const resolved = resolvePath(filePath);
	grantFile(resolved);
	grantRoot(path.dirname(resolved));
	return resolved;
}

function isWithin(rootPath: string, candidatePath: string): boolean {
	const relative = path.relative(rootPath, candidatePath);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

/** Covers always-ignored workspace dirs in case Git ignores do not catch them. */
function isIgnoredWorkspacePath(candidatePath: string): boolean {
	return candidatePath
		.split(/[\\/]+/)
		.some((segment) => ignoredWorkspaceDirs.has(segment));
}

function toIgnorePath(input: string): string {
	return input.split(path.sep).join("/");
}

function isIgnoredByRules(candidatePath: string, rules: IgnoreRule[]) {
	if (isIgnoredWorkspacePath(candidatePath)) return true;

	let ignored = false;
	for (const { dir, matcher } of rules) {
		const relative = path.relative(dir, candidatePath);
		if (
			relative === "" ||
			relative.startsWith("..") ||
			path.isAbsolute(relative)
		)
			continue;
		const ignorePath = toIgnorePath(relative);
		const result = matcher.test(ignorePath);
		const directoryResult = matcher.test(`${ignorePath}/`);
		if (result.ignored || directoryResult.ignored) ignored = true;
		if (result.unignored || directoryResult.unignored) ignored = false;
	}
	return ignored;
}

function isDocumentPath(candidatePath: string): boolean {
	return hasDocumentExtension(candidatePath);
}

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

async function rulesForDir(dir: string, inherited: IgnoreRule[]) {
	const matcher = ignore();
	let hasRules = false;

	for (const fileName of ignoreConfigFiles) {
		try {
			matcher.add(await fs.readFile(path.join(dir, fileName), "utf8"));
			hasRules = true;
		} catch (error) {
			if (isMissingPathError(error)) continue;
			throw error;
		}
	}

	return hasRules ? [...inherited, { dir, matcher }] : inherited;
}

function assertGranted(input: string): string {
	const resolved = resolvePath(input);
	if (grantedFiles.has(resolved)) return resolved;
	for (const root of grantedRoots) {
		if (isWithin(root, resolved)) return resolved;
	}
	throw new Error(`Path is outside granted scope: ${input}`);
}

function assertGrantedRoot(input: string): string {
	const resolved = assertGranted(input);
	grantRoot(resolved);
	return resolved;
}

async function pathExistsAsFile(input: string): Promise<boolean> {
	try {
		return (await fs.stat(input)).isFile();
	} catch {
		return false;
	}
}

async function pathExists(input: string): Promise<boolean> {
	try {
		await fs.stat(input);
		return true;
	} catch {
		return false;
	}
}

function firstExistingFileArg(args: string[]): string | null {
	for (const arg of args) {
		if (arg.startsWith("-")) continue;
		const resolved = path.resolve(arg);
		try {
			if (fsSync.statSync(resolved).isFile()) {
				grantFileWithParent(resolved);
				return resolved;
			}
		} catch {
			// Keep scanning.
		}
	}
	return null;
}

function firstProtocolUrlArg(args: string[]): string | null {
	return args.find((arg) => arg.startsWith("hubble://")) ?? null;
}

function sendToRenderer(channel: string, ...args: unknown[]) {
	mainWindow?.webContents.send(channel, ...args);
}

function assetPathFromUrl(url: URL): string {
	const queryPath = url.searchParams.get("path");
	if (queryPath) return queryPath;
	const encodedPath = url.pathname.startsWith("/")
		? url.pathname.slice(1)
		: url.pathname;
	return decodeURIComponent(encodedPath);
}

function assetContentType(filePath: string): string {
	switch (path.extname(filePath).toLowerCase()) {
		case ".css":
			return "text/css; charset=utf-8";
		case ".html":
			return "text/html; charset=utf-8";
		case ".js":
		case ".mjs":
			return "text/javascript; charset=utf-8";
		case ".json":
			return "application/json; charset=utf-8";
		case ".svg":
			return "image/svg+xml";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".png":
			return "image/png";
		case ".webp":
			return "image/webp";
		default:
			return "application/octet-stream";
	}
}

function scriptTag({ name, source }: HtmlAppAsset) {
	return `<script data-hubble-injected="${name}">\n${source}\n</script>`;
}

function styleTag({ name, source }: HtmlAppAsset) {
	return `<style data-hubble-injected="${name}" type="text/tailwindcss">\n${source}\n</style>`;
}

function insertBeforeCloseTag(html: string, tagName: string, content: string) {
	const closeIndex = html.search(new RegExp(`</${tagName}\\s*>`, "i"));
	if (closeIndex === -1) return `${html}${content}`;
	return `${html.slice(0, closeIndex)}${content}${html.slice(closeIndex)}`;
}

function injectHtmlAppRuntime(html: string): string {
	const headStyles = htmlAppHeadStyles.map(styleTag).join("\n");
	const headScripts = htmlAppHeadScripts.map(scriptTag).join("\n");
	const bodyEndScripts = htmlAppBodyEndScripts.map(scriptTag).join("\n");
	const headInjection = `\n${headStyles}\n${headScripts}\n`;
	const bodyEndInjection = `\n${bodyEndScripts}\n`;
	const withHead =
		html.search(/<\/head\s*>/i) === -1
			? `${headInjection}${html}`
			: insertBeforeCloseTag(html, "head", headInjection);
	return insertBeforeCloseTag(withHead, "body", bodyEndInjection);
}

function responseForAsset(filePath: string) {
	const contentType = assetContentType(filePath);
	const body = contentType.startsWith("text/html")
		? injectHtmlAppRuntime(fsSync.readFileSync(filePath, "utf8"))
		: fsSync.readFileSync(filePath);

	return new Response(body, {
		headers: {
			"cache-control": "no-store",
			"content-type": contentType,
		},
	});
}

function buildMenu() {
	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: "File",
			submenu: [
				{
					id: "new-markdown-file",
					label: "New File",
					accelerator: "CmdOrCtrl+N",
					click: () => sendToRenderer("desktop:menu-create-markdown-file"),
				},
				{
					id: "new-workspace",
					label: "Add Folder...",
					accelerator: "CmdOrCtrl+Shift+N",
					click: () => sendToRenderer("desktop:menu-open-folder"),
				},
				{ type: "separator" },
				{
					id: "open",
					label: "Open...",
					accelerator: "CmdOrCtrl+O",
					click: () => sendToRenderer("desktop:menu-open-file"),
				},
				{
					id: "open-workspace",
					label: "Open Folder...",
					accelerator: "CmdOrCtrl+Shift+O",
					enabled: menuState.hasWorkspace,
					click: () => sendToRenderer("desktop:menu-show-workspace-switcher"),
				},
				{ type: "separator" },
				{
					id: "sync-workspace",
					label: "Sync Folder",
					enabled: menuState.hasWorkspace,
					click: () => sendToRenderer("desktop:menu-sync-workspace"),
				},
				{ type: "separator" },
				{ role: "close" },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},
		{
			label: "View",
			submenu: [
				{
					id: "zoom-in",
					label: "Zoom In",
					accelerator: "CmdOrCtrl+=",
					click: () => stepWindowZoom(mainWindow, zoomStep),
				},
				{
					id: "zoom-out",
					label: "Zoom Out",
					accelerator: "CmdOrCtrl+-",
					click: () => stepWindowZoom(mainWindow, -zoomStep),
				},
				{
					id: "reset-zoom",
					label: "Reset Zoom",
					accelerator: "CmdOrCtrl+0",
					click: () => resetWindowZoom(mainWindow),
				},
				...(isDev
					? ([
							{ type: "separator" },
							{ role: "reload" },
							{ role: "forceReload" },
							{ type: "separator" },
							{ role: "toggleDevTools" },
						] satisfies Electron.MenuItemConstructorOptions[])
					: []),
			],
		},
	];

	if (process.platform === "darwin") {
		template.unshift({
			label: app.name,
			submenu: [
				{
					id: "settings",
					label: "Settings...",
					accelerator: "CmdOrCtrl+,",
					click: () => sendToRenderer("desktop:menu-open-settings"),
				},
				{ type: "separator" },
				{
					id: "check-for-updates",
					label: "Check for Updates...",
					click: () => sendToRenderer("desktop:menu-open-settings"),
				},
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
			],
		});
	}

	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function syncUpdateState(nextState: DesktopUpdateState) {
	updateState = nextState;
	buildMenu();
	sendToRenderer("desktop:update-state", updateState);
}

function patchUpdateState(patch: Partial<DesktopUpdateState>) {
	syncUpdateState({
		...updateState,
		...patch,
	});
}

async function checkForUpdates() {
	if (!supportsAutoUpdates) {
		patchUpdateState({
			status: "idle",
			message: "Updates are available on packaged macOS builds only.",
		});
		return;
	}
	if (
		updateState.status === "checking" ||
		updateState.status === "downloading" ||
		updateState.status === "ready"
	) {
		return;
	}
	patchUpdateState({
		status: "checking",
		progressPercent: null,
		message: null,
	});
	try {
		await autoUpdater.checkForUpdates();
	} catch (error) {
		patchUpdateState({
			status: "error",
			message: error instanceof Error ? error.message : String(error),
			lastCheckedAt: Date.now(),
		});
	}
}

function configureAutoUpdates() {
	if (!supportsAutoUpdates) return;
	if (updateFeedUrl) {
		autoUpdater.setFeedURL({
			provider: "generic",
			url: updateFeedUrl,
		});
	}
	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.on("update-available", (info) => {
		patchUpdateState({
			status: "downloading",
			availableVersion: info.version ?? null,
			progressPercent: 0,
			message: "Downloading update...",
			lastCheckedAt: Date.now(),
		});
	});
	autoUpdater.on("update-not-available", () => {
		patchUpdateState({
			status: "up-to-date",
			availableVersion: null,
			progressPercent: null,
			message: "Hubble is up to date.",
			lastCheckedAt: Date.now(),
		});
	});
	autoUpdater.on("download-progress", (progress) => {
		patchUpdateState({
			status: "downloading",
			progressPercent: progress.percent,
			message: "Downloading update...",
		});
	});
	autoUpdater.on("update-downloaded", (info) => {
		patchUpdateState({
			status: "ready",
			availableVersion: info.version ?? updateState.availableVersion,
			progressPercent: 100,
			message: "Restart Hubble to install the update.",
			lastCheckedAt: Date.now(),
		});
	});
	autoUpdater.on("error", (error) => {
		console.error("Auto-update error", error);
		patchUpdateState({
			status: "error",
			message: error.message,
			lastCheckedAt: Date.now(),
		});
	});

	void checkForUpdates();
	setInterval(() => {
		void checkForUpdates();
	}, updateCheckIntervalMs);
}

function extensionFromImage(
	bytes: Uint8Array,
	mimeType: string | null,
): string {
	const mime = mimeType?.trim().toLowerCase() ?? "";
	if (mime.includes("png")) return "png";
	if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
	if (mime.includes("webp")) return "webp";
	if (mime.includes("gif")) return "gif";
	if (mime.includes("bmp")) return "bmp";
	if (mime.includes("svg")) return "svg";

	if (
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47
	) {
		return "png";
	}
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "jpg";
	}
	if (Buffer.from(bytes.subarray(0, 6)).toString() === "GIF87a") return "gif";
	if (Buffer.from(bytes.subarray(0, 6)).toString() === "GIF89a") return "gif";
	if (
		bytes.length >= 12 &&
		Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
		Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP"
	) {
		return "webp";
	}
	if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "bmp";
	return "png";
}

function fileAssetsDir(filePath: string): string {
	const assetsDir = markdownAssetFolderPath(filePath);
	if (!assetsDir) throw new Error(`Unable to resolve file name: ${filePath}`);
	return assetsDir;
}

async function collectDocumentFiles(
	dir: string,
	out: DirectoryListing,
	inheritedRules: IgnoreRule[] = [],
) {
	const rules = await rulesForDir(dir, inheritedRules);
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = path.join(dir, entry.name);
		if (isIgnoredByRules(entryPath, rules)) continue;
		if (entry.isDirectory()) {
			if (isHiddenSidebarFolderName(entry.name)) continue;
			const stat = await fs.stat(entryPath);
			out.folders.push({
				path: entryPath,
				modified_at: Math.floor(stat.mtimeMs / 1000),
			});
			await collectDocumentFiles(entryPath, out, rules);
		} else if (isDocumentPath(entry.name)) {
			const stat = await fs.stat(entryPath);
			out.files.push({
				path: entryPath,
				modified_at: Math.floor(stat.mtimeMs / 1000),
			});
		}
	}
}

async function collectWorkspaceFiles(
	root: string,
	dir: string,
	glob: string,
	out: HtmlAppFileEntry[],
	inheritedRules: IgnoreRule[] = [],
) {
	const rules = await rulesForDir(dir, inheritedRules);
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = path.join(dir, entry.name);
		if (isIgnoredByRules(entryPath, rules)) continue;
		const relativePath = path
			.relative(root, entryPath)
			.split(path.sep)
			.join("/");
		if (relativePath === ".hubble" || relativePath.startsWith(".hubble/"))
			continue;
		if (entry.isDirectory()) {
			await collectWorkspaceFiles(root, entryPath, glob, out, rules);
			continue;
		}
		if (!matchesGlob(relativePath, glob)) continue;
		const stat = await fs.stat(entryPath);
		out.push({
			name: entry.name,
			path: relativePath,
			modified_at: Math.floor(stat.mtimeMs / 1000),
			size: stat.size,
		});
	}
}

function matchesGlob(relativePath: string, glob: string): boolean {
	if (glob === "" || glob === "**" || glob === "**/*") return true;
	let source = "";
	for (let index = 0; index < glob.length; index += 1) {
		const char = glob[index];
		const next = glob[index + 1];
		const afterNext = glob[index + 2];
		if (char === "*" && next === "*" && afterNext === "/") {
			source += "(?:.*/)?";
			index += 2;
		} else if (char === "*" && next === "*") {
			source += ".*";
			index += 1;
		} else if (char === "*") {
			source += "[^/]*";
		} else {
			source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
		}
	}
	return new RegExp(`^${source}$`).test(relativePath);
}

function trayIconPath(): string {
	return path.join(app.getAppPath(), "assets", "icon.png");
}

/** Reopen or focus the main window, recreating it if it was destroyed. */
function showMainWindow() {
	if (mainWindow && !mainWindow.isDestroyed()) {
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.show();
		mainWindow.focus();
		return;
	}
	void createWindow();
}

function handleProtocolUrl(rawUrl: string) {
	const focus = () => showMainWindow();
	if (app.isReady()) {
		focus();
	} else {
		app.once("ready", focus);
	}

	let route = "";
	try {
		const url = new URL(rawUrl);
		if (url.protocol !== "hubble:") {
			console.warn(`Ignoring non-hubble protocol URL: ${rawUrl}`);
			return;
		}
		route = url.hostname ? `/${url.hostname}${url.pathname}` : url.pathname;
	} catch (error) {
		console.warn("Ignoring malformed hubble protocol URL:", error);
		return;
	}

	switch (route) {
		default:
			console.warn(`Unrecognized hubble:// route: ${route || "/"}`);
	}
}

function ensureTray() {
	if (tray) return;
	tray = createAppTray(trayIconPath(), appName, {
		onOpen: () => showMainWindow(),
		onQuit: () => {
			isQuitting = true;
			app.quit();
		},
	});
}

function destroyTray() {
	if (!tray) return;
	tray.destroy();
	tray = null;
}

/**
 * Toggle always-on background mode. When active, closing the last window keeps
 * the main process alive behind the tray; when inactive we fall back to today's
 * quit-on-close behavior so purely-local users get no surprise background
 * process (Decision C).
 */
function setBackgroundActive(active: boolean) {
	if (backgroundActive === active) return;
	backgroundActive = active;
	if (active) {
		ensureTray();
	} else {
		destroyTray();
	}
}

async function createWindow() {
	const windowState = await loadWindowState();
	const zoomFactor = loadZoomFactor();
	const window = new BrowserWindow({
		title: appName,
		...(windowState.x !== undefined && windowState.y !== undefined
			? { x: windowState.x, y: windowState.y }
			: {}),
		width: windowState.width,
		height: windowState.height,
		show: false,
		titleBarStyle: "hidden",
		trafficLightPosition: trafficLightPositionForZoom(zoomFactor),
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: path.join(__dirname, "../preload/preload.mjs"),
			sandbox: false,
		},
	});
	mainWindow = window;
	registerTextContextMenu(window);
	window.webContents.on("did-start-loading", () => {
		authHandoffRendererReady = false;
	});
	if (windowState.isFullScreen) {
		window.setFullScreen(true);
	} else if (windowState.isMaximized) {
		window.maximize();
	}
	// Apply persisted zoom while hidden so the first visible paint is already scaled.
	window.webContents.once("did-finish-load", async () => {
		window.webContents.setZoomFactor(zoomFactor);
		await setTrafficLightInset(window, zoomFactor);
		if (window.isDestroyed()) return;
		window.show();
	});

	window.on("focus", () => sendToRenderer("desktop:window-focus"));
	window.on("enter-full-screen", () =>
		sendToRenderer("desktop:fullscreen-change", true),
	);
	window.on("leave-full-screen", () =>
		sendToRenderer("desktop:fullscreen-change", false),
	);
	window.on("resize", () => queueSaveWindowState(window));
	window.on("move", () => queueSaveWindowState(window));
	window.on("close", (event) => {
		if (saveWindowStateTimer) {
			clearTimeout(saveWindowStateTimer);
			saveWindowStateTimer = null;
		}
		saveWindowState(window);
		// In always-on mode, closing the window hides it (keeping the main
		// process + tray alive) unless the user is actually quitting.
		if (backgroundActive && !isQuitting) {
			event.preventDefault();
			window.hide();
		}
	});
	window.on("closed", () => {
		if (mainWindow === window) mainWindow = null;
	});

	if (isDev && process.env.ELECTRON_RENDERER_URL) {
		await window.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		await window.loadFile(path.join(__dirname, "../renderer/index.html"));
	}
}

function registerTextContextMenu(window: BrowserWindow) {
	window.webContents.on("context-menu", (_event, params) => {
		if (!params.isEditable) return;
		const menu = Menu.buildFromTemplate(
			buildTextContextMenuTemplate(window.webContents, params),
		);
		menu.popup({
			window,
			// The originating frame lets macOS attach Writing Tools and text services.
			...(process.platform === "darwin"
				? { frame: params.frame ?? undefined }
				: {}),
		});
	});
}

function registerIpc() {
	ipcMain.handle(
		"desktop:list-directory",
		async (_event, { path: dirPath }) => {
			const root = assertGrantedRoot(dirPath);
			const stat = await fs.stat(root);
			if (!stat.isDirectory()) throw new Error(`Not a directory: ${dirPath}`);
			const listing: DirectoryListing = { files: [], folders: [] };
			await collectDocumentFiles(root, listing);
			return listing;
		},
	);

	ipcMain.handle(
		"desktop:html-app-list-files",
		async (_event, { workspacePath, glob }) => {
			const root = assertGrantedRoot(workspacePath);
			const stat = await fs.stat(root);
			if (!stat.isDirectory())
				throw new Error(`Not a directory: ${workspacePath}`);
			const files: HtmlAppFileEntry[] = [];
			await collectWorkspaceFiles(root, root, String(glob ?? "**/*"), files);
			return files.sort((a, b) => a.path.localeCompare(b.path));
		},
	);

	ipcMain.handle(
		"desktop:read-workspace-config",
		async (_event, { workspacePath }) => {
			try {
				return parseWorkspaceConfig(
					await fs.readFile(workspaceConfigPath(workspacePath), "utf8"),
				);
			} catch (err) {
				if (
					err &&
					typeof err === "object" &&
					"code" in err &&
					err.code === "ENOENT"
				) {
					return emptyWorkspaceConfig();
				}
				throw err;
			}
		},
	);

	ipcMain.handle(
		"desktop:write-workspace-config",
		async (_event, { workspacePath, config }) => {
			const configPath = workspaceConfigPath(workspacePath);
			await fs.mkdir(path.dirname(configPath), { recursive: true });
			await fs.writeFile(
				configPath,
				`${JSON.stringify(normalizeWorkspaceConfig(config), null, 2)}\n`,
			);
			grantFile(configPath);
		},
	);

	ipcMain.handle(
		"desktop:read-file-text",
		async (_event, { path: filePath }) => {
			const resolved = assertGranted(filePath);
			return await fs.readFile(resolved, "utf8");
		},
	);
	ipcMain.handle(
		"desktop:path-for-dropped-file",
		(_event, filePath: unknown) => {
			if (typeof filePath !== "string" || !filePath) {
				throw new Error("Dropped file path is required");
			}
			return grantFileWithParent(filePath);
		},
	);

	ipcMain.handle(
		"desktop:write-file-text",
		async (_event, { path: filePath, bytes }) => {
			const resolved = assertGranted(filePath);
			await fs.mkdir(path.dirname(resolved), { recursive: true });
			await fs.writeFile(resolved, requireEncodedTextBytes(bytes));
		},
	);

	ipcMain.handle(
		"desktop:rename-file",
		async (_event, { fromPath, toPath }) => {
			const from = assertGranted(fromPath);
			const to = resolvePath(toPath);
			assertGranted(path.dirname(to));
			await fs.mkdir(path.dirname(to), { recursive: true });
			await fs.rename(from, to);
			grantFileWithParent(to);
		},
	);

	ipcMain.handle("desktop:path-exists", async (_event, { path: filePath }) =>
		pathExists(assertGranted(filePath)),
	);

	ipcMain.handle(
		"desktop:persist-pasted-image",
		async (_event, { filePath, bytes, mimeType }) => {
			const resolvedFilePath = assertGranted(filePath);
			if (!Array.isArray(bytes) || bytes.length === 0) {
				throw new Error("Clipboard image bytes are empty");
			}
			const imageBytes = Uint8Array.from(bytes);
			const assetsDir = fileAssetsDir(resolvedFilePath);
			await fs.mkdir(assetsDir, { recursive: true });
			grantRoot(assetsDir);

			const hash = createHash("sha256").update(imageBytes).digest("hex");
			const shortHash = hash.slice(0, 12);
			const ext = extensionFromImage(imageBytes, mimeType);
			let imagePath = path.join(assetsDir, `${shortHash}.${ext}`);
			let deduped = false;

			if (await pathExistsAsFile(imagePath)) {
				const existing = await fs.readFile(imagePath);
				if (Buffer.compare(existing, imageBytes) === 0) {
					deduped = true;
				} else {
					imagePath = path.join(assetsDir, `${hash}.${ext}`);
					if (await pathExistsAsFile(imagePath)) {
						const existingFull = await fs.readFile(imagePath);
						if (Buffer.compare(existingFull, imageBytes) === 0) {
							deduped = true;
						} else {
							throw new Error(
								`Hash collision while saving image at ${imagePath}`,
							);
						}
					}
				}
			}

			if (!deduped && !(await pathExistsAsFile(imagePath))) {
				await fs.writeFile(imagePath, imageBytes);
			}

			grantFile(imagePath);
			return {
				relativeMarkdownPath: path
					.relative(path.dirname(resolvedFilePath), imagePath)
					.split(path.sep)
					.join("/"),
				deduped,
			};
		},
	);

	ipcMain.handle(
		"desktop:delete-file",
		async (_event, { path: filePath, options }) => {
			await fs.rm(assertGranted(filePath), {
				recursive: options?.recursive === true,
			});
		},
	);

	ipcMain.handle(
		"desktop:read-binary-file",
		async (_event, { path: filePath }) =>
			Array.from(await fs.readFile(assertGranted(filePath))),
	);

	ipcMain.handle(
		"desktop:write-binary-file",
		async (_event, { path: filePath, bytes }) => {
			if (!Array.isArray(bytes)) throw new Error("Bytes must be an array");
			await fs.writeFile(assertGranted(filePath), Uint8Array.from(bytes));
		},
	);

	ipcMain.handle("desktop:open-file-picker", async (_event, options = {}) => {
		const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
			properties: ["openFile"],
			defaultPath:
				typeof options.defaultPath === "string"
					? options.defaultPath
					: undefined,
			title: "Open Markdown file",
			filters: [
				{ name: "Documents", extensions: ["md", "markdown", "mdown", "html"] },
				{ name: "Text", extensions: ["txt", "text"] },
			],
		});
		const selected = result.filePaths[0] ?? null;
		if (selected) grantFileWithParent(selected);
		return selected;
	});

	ipcMain.handle("desktop:open-folder-picker", async () => {
		const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
			properties: ["openDirectory"],
			title: "Open Folder",
		});
		const selected = result.filePaths[0] ?? null;
		if (selected) grantRoot(selected);
		return selected;
	});

	ipcMain.handle(
		"desktop:create-folder-picker",
		async (_event, options = {}) => {
			const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
				title: typeof options.title === "string" ? options.title : "New Folder",
				defaultPath:
					typeof options.defaultPath === "string"
						? options.defaultPath
						: undefined,
				nameFieldLabel: "Folder name:",
				buttonLabel: "Create",
				properties: ["createDirectory"],
			});
			if (result.canceled || !result.filePath) return null;
			const folderPath = result.filePath;
			if (options.create !== false) {
				await fs.mkdir(folderPath, { recursive: true });
			}
			grantRoot(folderPath);
			return folderPath;
		},
	);

	ipcMain.handle(
		"desktop:save-markdown-file-picker",
		async (_event, options = {}) => {
			const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
				defaultPath:
					typeof options.defaultPath === "string"
						? options.defaultPath
						: undefined,
				title: "New Markdown file",
				filters: [{ name: "Markdown", extensions: ["md"] }],
			});
			if (result.canceled || !result.filePath) return null;
			const selected = withMarkdownExtension(result.filePath);
			grantFileWithParent(selected);
			return selected;
		},
	);

	ipcMain.handle(
		"desktop:watch-path",
		async (_event, { watchId, path: watchPath }) => {
			const id = String(watchId);
			const resolved = assertGranted(watchPath);
			const emit = (changedPath: string) => {
				sendToRenderer(`desktop:watch-path:${watchId}`, [
					path.resolve(changedPath),
				]);
			};

			const createWatcher = async () => {
				const watcher = chokidar.watch(resolved, {
					ignoreInitial: true,
					// Only the active file uses this watcher. The sidebar refreshes from
					// snapshots so large workspaces do not create one watcher per folder.
					depth: 0,
				});
				const emitFile = (changedPath: string) => {
					if (isDocumentPath(changedPath)) {
						emit(changedPath);
					}
				};
				watcher.on("add", emitFile);
				watcher.on("change", emitFile);
				watcher.on("unlink", emitFile);
				watcher.on("addDir", emit);
				watcher.on("unlinkDir", emit);
				watcher.on("error", (error) => {
					console.error("File watcher failed:", error);
				});
				return watcher;
			};

			watchers.set(id, await createWatcher());
		},
	);

	ipcMain.handle("desktop:unwatch-path", async (_event, { watchId }) => {
		const watcher = watchers.get(String(watchId));
		if (watcher) {
			watchers.delete(String(watchId));
			await watcher.close();
		}
	});

	ipcMain.handle("desktop:open-external-url", async (_event, { url }) => {
		if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
			throw new Error("Only http(s) external URLs are allowed");
		}
		await shell.openExternal(url);
	});

	ipcMain.handle("desktop:reveal-file", (_event, { path: filePath }) => {
		shell.showItemInFolder(assertGranted(filePath));
	});

	ipcMain.handle("desktop:resolve-path", (_event, { path }) =>
		resolvePath(path),
	);

	ipcMain.handle("desktop:real-path", async (_event, { path: filePath }) =>
		fs.realpath(assertGranted(filePath)),
	);

	ipcMain.handle("desktop:get-launch-file-path", () => {
		const pathToOpen = pendingOpenPath;
		pendingOpenPath = null;
		return pathToOpen;
	});

	ipcMain.handle(
		"desktop:get-launch-workspace-path",
		() => launchWorkspacePath,
	);

	ipcMain.handle("desktop:get-update-state", () => updateState);

	ipcMain.handle(
		"desktop:get-fullscreen",
		() => mainWindow?.isFullScreen() ?? false,
	);

	ipcMain.handle("desktop:check-for-updates", async () => {
		await checkForUpdates();
	});

	ipcMain.handle("desktop:install-update", () => {
		if (updateState.status !== "ready") {
			throw new Error("No downloaded update is ready to install.");
		}
		autoUpdater.quitAndInstall(false, true);
	});

	ipcMain.handle("desktop:set-menu-state", (_event, state: MenuState) => {
		menuState = { hasWorkspace: state.hasWorkspace === true };
		buildMenu();
	});

	ipcMain.handle("desktop:auth-state", (_event, state: unknown) => {
		cachedAuthState = desktopAuthStateSchema.parse(state);
	});

	ipcMain.handle("desktop:auth-handoff-ready", () => {
		authHandoffRendererReady = true;
		if (pendingAuthHandoff) {
			sendToRenderer("desktop:auth-handoff", pendingAuthHandoff);
			pendingAuthHandoff = null;
		}
	});

	ipcMain.handle("desktop:set-background-active", (_event, active: boolean) => {
		setBackgroundActive(active === true);
	});

	ipcMain.handle(
		"desktop:live-sync:connect",
		(_event, input: LiveSyncConnectInput) => {
			const parsed = liveSyncConnectSchema.parse(input);
			const workspacePath = assertGrantedRoot(parsed.workspacePath);
			const status = liveSync.connect({
				workspacePath,
				deploymentUrl: parsed.deploymentUrl,
				workspaceId: parsed.workspaceId,
				authToken: parsed.authToken,
			});
			// Connecting a cloud workspace engages always-on mode (Decision C).
			setBackgroundActive(true);
			return status;
		},
	);

	ipcMain.handle("desktop:live-sync:disconnect", () => {
		const status = liveSync.disconnect();
		setBackgroundActive(false);
		return status;
	});

	ipcMain.handle("desktop:live-sync:status", () => liveSync.getStatus());

	ipcMain.handle(
		"desktop:live-sync:reconcile",
		async (_event, input: LiveSyncReconcileInput) => {
			const parsed = liveSyncReconcileSchema.parse(input);
			const projectionPath = assertGranted(parsed.projectionPath);
			return liveSync.reconcile({
				documentId: parsed.documentId,
				projectionPath,
				actor: parsed.actor,
				path: parsed.path,
			});
		},
	);

	ipcMain.handle(
		"desktop:live-sync:connect-folder",
		async (_event, input: SyncedFolderConnectInput) => {
			const parsed = syncedFolderConnectSchema.parse(input);
			const syncRoot = assertGrantedRoot(parsed.syncRoot);
			const configuredMounts = await localAvailabilityStore.list();
			if (configuredMounts.length > 0) {
				throw new Error(
					"Disconnect folder projections before connecting the whole-workspace projection. Hubble manages one local copy per document on this computer.",
				);
			}
			const status = await projectionManager.connectWholeWorkspace({
				syncRoot,
				deploymentUrl: parsed.deploymentUrl,
				authToken: parsed.authToken,
			});
			// Connecting the synced folder engages always-on mode (Decision C).
			setBackgroundActive(true);
			return status;
		},
	);

	ipcMain.handle(
		"desktop:live-sync:inspect-root",
		async (_event, { syncRoot: input }: { syncRoot: string }) => {
			const syncRoot = assertGrantedRoot(input);
			const stat = await fs.stat(syncRoot);
			if (!stat.isDirectory()) throw new Error(`Not a directory: ${input}`);
			const entries = await fs.readdir(syncRoot);
			const hasSyncedFolderIndex = await pathExistsAsFile(
				path.join(syncRoot, ...SYNCED_FOLDER_INDEX_REL.split("/")),
			);
			return classifySyncedFolderRoot(
				hasSyncedFolderIndex ? [...entries, SYNCED_FOLDER_INDEX_REL] : entries,
			);
		},
	);

	ipcMain.handle(
		"desktop:live-sync:import-folder-markdown",
		async (_event, input: SyncedFolderImportInput) => {
			const parsed = syncedFolderImportSchema.parse(input);
			const syncRoot = assertGrantedRoot(parsed.syncRoot);
			const backend = createConvexBackend(
				parsed.deploymentUrl,
				parsed.authToken,
			);
			return importLiveDocuments(backend, createNodeFileSystem(), {
				workspaceId: parsed.workspaceId,
				workspacePath: syncRoot,
				idempotencyKey: `desktop-folder:${parsed.workspaceId}:${syncRoot}`,
				actor: "synced-folder-first-run-import",
			});
		},
	);

	ipcMain.handle(
		"desktop:cloud:import-markdown",
		(_event, input: CloudMarkdownImportInput) =>
			performCloudMarkdownImport(input),
	);

	ipcMain.handle("desktop:live-sync:disconnect-folder", async () => {
		const status = await projectionManager.disconnectWholeWorkspace();
		setBackgroundActive(false);
		return status;
	});

	ipcMain.handle("desktop:live-sync:status-folder", () =>
		projectionManager.getWholeWorkspaceStatus(),
	);
	ipcMain.handle("desktop:live-sync:list-pending-operations", () =>
		projectionManager.listPendingOperations(),
	);
	ipcMain.handle(
		"desktop:live-sync:approve-pending-move",
		(_event, input: unknown) => {
			const { operationId } = z
				.object({ operationId: z.string().min(1) })
				.parse(input);
			return projectionManager.approvePendingMove(operationId);
		},
	);
	ipcMain.handle(
		"desktop:live-sync:cancel-pending-move",
		(_event, input: unknown) => {
			const { operationId } = z
				.object({ operationId: z.string().min(1) })
				.parse(input);
			return projectionManager.cancelPendingMove(operationId);
		},
	);
	for (const [channel, handler] of [
		[
			"desktop:live-sync:approve-pending-deletion",
			(operationId: string) =>
				projectionManager.approvePendingDeletion(operationId),
		],
		[
			"desktop:live-sync:cancel-pending-deletion",
			(operationId: string) =>
				projectionManager.cancelPendingDeletion(operationId),
		],
		[
			"desktop:live-sync:undo-trash",
			(operationId: string) =>
				projectionManager.undoTrashedDocument(operationId),
		],
		[
			"desktop:live-sync:dismiss-trash-undo",
			(operationId: string) => projectionManager.dismissTrashUndo(operationId),
		],
	] as const) {
		ipcMain.handle(channel, (_event, input: unknown) => {
			const { operationId } = z
				.object({ operationId: z.string().min(1) })
				.parse(input);
			return handler(operationId);
		});
	}

	ipcMain.handle(
		"desktop:repo-link:link",
		async (_event, input: RepoLinkInput): Promise<RepoLinkResult> => {
			return performRepoLink(input);
		},
	);

	ipcMain.handle(
		"desktop:repo-link:resolve-root",
		async (_event, selectedDir: string): Promise<string | null> => {
			const repo = await resolveGitRepo(resolvePath(selectedDir));
			return repo?.repoDir ?? null;
		},
	);

	ipcMain.handle(
		"desktop:repo-link:unlink",
		async (_event, folderId: string) => {
			await unlinkRepoMount(folderId);
		},
	);

	ipcMain.handle("desktop:repo-link:inspect", (_event, folderId: string) =>
		inspectRepoMountCleanliness(z.string().min(1).parse(folderId)),
	);
	ipcMain.handle("desktop:repo-link:stop", (_event, input: unknown) =>
		stopRepoMount(input),
	);
	ipcMain.handle(
		"desktop:repo-link:relocate",
		(_event, input: RepoMountRelocateInput) => relocateRepoMount(input),
	);

	ipcMain.handle("desktop:repo-link:undo", async (_event, input: unknown) => {
		const parsed = repoLinkUndoSchema.parse(input);
		return undoRepoMount(parsed.folderId);
	});

	ipcMain.handle("desktop:repo-link:list", async (): Promise<RepoMount[]> => {
		const mounts = (await localAvailabilityStore.list()).filter(
			(record) => record.association === "repo",
		);
		return Promise.all(mounts.map(repoMountStatus));
	});

	ipcMain.handle(
		"desktop:repo-link:reconnect",
		async (_event, input: RepoMountReconnectInput): Promise<RepoMount[]> => {
			const parsed = repoMountReconnectSchema.parse(input);
			await reconnectLocalAvailability(parsed);
			const mounts = (await localAvailabilityStore.list()).filter(
				(record) => record.association === "repo",
			);
			return Promise.all(mounts.map(repoMountStatus));
		},
	);

	ipcMain.handle("desktop:local-availability:list", () =>
		listLocalAvailability(),
	);
	ipcMain.handle(
		"desktop:local-availability:create",
		(_event, input: LocalAvailabilityCreateInput) =>
			createLocalAvailability(input),
	);
	ipcMain.handle(
		"desktop:local-availability:inspect",
		(_event, scopeKey: string) =>
			inspectLocalAvailabilityCleanliness(z.string().min(1).parse(scopeKey)),
	);
	ipcMain.handle(
		"desktop:local-availability:relocate",
		(_event, input: LocalAvailabilityRelocateInput) =>
			relocateLocalAvailability(input),
	);
	ipcMain.handle(
		"desktop:local-availability:stop",
		(_event, input: LocalAvailabilityStopInput) => stopLocalAvailability(input),
	);
	ipcMain.handle(
		"desktop:local-availability:reconnect",
		(_event, input: LocalAvailabilityReconnectInput) =>
			reconnectLocalAvailability(input),
	);

	ipcMain.handle(
		"desktop:live-sync:is-live-document",
		(_event, absPath: string) => {
			let resolved: string;
			try {
				resolved = assertGranted(absPath);
			} catch {
				// An ungranted path is, by definition, not a synced Live Document.
				return false;
			}
			return projectionManager.isLiveDocument(resolved);
		},
	);
}

protocol.registerSchemesAsPrivileged([
	{
		scheme: "hubble-asset",
		privileges: {
			secure: true,
			supportFetchAPI: true,
			corsEnabled: true,
			standard: true,
		},
	},
]);

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
	app.quit();
} else {
	app.on("second-instance", (_event, argv) => {
		const protocolUrl = firstProtocolUrlArg(argv.slice(1));
		if (protocolUrl) {
			handleProtocolUrl(protocolUrl);
			return;
		}
		const openPath = firstExistingFileArg(argv.slice(1));
		// Reuse the reopen path so a re-launch surfaces the window even when it
		// was hidden to the tray in background mode.
		showMainWindow();
		if (!openPath) return;
		pendingOpenPath = openPath;
		if (mainWindow && !mainWindow.isDestroyed()) {
			sendToRenderer("desktop:open-file", openPath);
		}
	});

	app.on("open-file", (event, filePath) => {
		event.preventDefault();
		const resolved = resolvePath(filePath);
		grantFileWithParent(resolved);
		pendingOpenPath = resolved;
		sendToRenderer("desktop:open-file", resolved);
	});

	app.on("open-url", (event, url) => {
		event.preventDefault();
		handleProtocolUrl(url);
	});

	app.whenReady().then(async () => {
		await loadGrants();
		if (launchWorkspacePath) grantRoot(launchWorkspacePath);
		await saveGrants();
		protocol.handle("hubble-asset", (request) => {
			const url = new URL(request.url);
			const filePath = assertGranted(assetPathFromUrl(url));
			// HTML apps use this protocol as their base URL, so relative
			// scripts, stylesheets, images, and fetches resolve to granted files.
			// Disable caching because these files are edited directly in workspaces.
			return responseForAsset(filePath);
		});
		registerIpc();
		buildMenu();
		configureAutoUpdates();
		await startCliCommandServer();
		await createWindow();
	});

	app.on("before-quit", () => {
		isQuitting = true;
		if (cliServer) {
			void cliServer.close().catch((error) => {
				console.error("Failed to close CLI socket:", error);
			});
			cliServer = null;
		}
	});

	app.on("window-all-closed", () => {
		// Keep the main process alive for background sync while a cloud
		// workspace is connected; otherwise preserve today's quit-on-close.
		if (backgroundActive) return;
		if (process.platform !== "darwin") app.quit();
	});

	app.on("activate", () => {
		showMainWindow();
	});
}
