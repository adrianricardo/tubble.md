import { emptyDoc, type SortMode } from "./state";

type WorkspaceState = {
	workspacePath: string | null;
	recentWorkspaces: string[];
	lastOpenedPaths: Record<string, string>;
	sortMode: SortMode;
	files: { path: string; modified_at: number }[];
	folders: { path: string; modified_at: number }[];
	pinnedNotes: string[];
};

type DocumentState = ReturnType<typeof emptyDoc>;

type UiState = {
	sidebarOpen: boolean;
	isSwitcherOpen: boolean;
};

export type CloudContext =
	| { kind: "workspace"; workspaceId: string }
	| { kind: "shared-folder"; folderId: string; workspaceId: string };

type CloudState = {
	context: CloudContext | null;
};

export type DesktopContentContext = { kind: "git" } | { kind: "cloud" };

type ContentState = {
	context: DesktopContentContext;
};

export type DesktopState = {
	workspace: WorkspaceState;
	document: DocumentState;
	ui: UiState;
	cloud: CloudState;
	content: ContentState;
};

type Persisted = {
	workspace?: {
		workspacePath?: string | null;
		recentWorkspaces?: string[];
		lastOpenedPaths?: Record<string, string>;
		sortMode?: SortMode;
	};
	document?: { lastOpenedPath?: string | null };
	ui?: { sidebarOpen?: boolean };
	cloud?: {
		context?: CloudContext | null;
		selectedSpaceId?: string | null;
	};
	content?: {
		context?: DesktopContentContext;
	};
};

export const STORAGE_KEY = "hubble-desktop-app";

function hydrateCloudContext(cloud: Persisted["cloud"]): CloudContext | null {
	const context = cloud?.context;
	if (
		context?.kind === "workspace" &&
		typeof context.workspaceId === "string"
	) {
		return context;
	}
	if (
		context?.kind === "shared-folder" &&
		typeof context.folderId === "string" &&
		typeof context.workspaceId === "string"
	) {
		return context;
	}
	return typeof cloud?.selectedSpaceId === "string"
		? { kind: "workspace", workspaceId: cloud.selectedSpaceId }
		: null;
}

function readStorage<T>(key: string): T | null {
	if (typeof localStorage === "undefined") return null;

	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function hydrateWorkspace(ws: Persisted["workspace"]): WorkspaceState {
	return {
		workspacePath: ws?.workspacePath ?? null,
		recentWorkspaces: Array.isArray(ws?.recentWorkspaces)
			? ws.recentWorkspaces
			: [],
		lastOpenedPaths:
			ws?.lastOpenedPaths &&
			typeof ws.lastOpenedPaths === "object" &&
			!Array.isArray(ws.lastOpenedPaths)
				? ws.lastOpenedPaths
				: {},
		sortMode: ws?.sortMode === "alpha" ? "alpha" : "recent",
		files: [],
		folders: [],
		pinnedNotes: [],
	};
}

function hydrateContentContext(
	content: Persisted["content"],
	workspacePath: string | null,
): DesktopContentContext {
	if (content?.context?.kind === "git") return { kind: "git" };
	if (content?.context?.kind === "cloud") return { kind: "cloud" };
	// Before content authority was explicit, configured desktop builds always
	// showed Cloud even when a local workspace had been restored. Prefer that
	// existing folder as the safe, direct Git root during migration.
	return workspacePath ? { kind: "git" } : { kind: "cloud" };
}

export function getInitialState(): DesktopState {
	const p = readStorage<Persisted>(STORAGE_KEY);
	const workspace = hydrateWorkspace(p?.workspace);
	return {
		workspace,
		document: emptyDoc(p?.document?.lastOpenedPath ?? null),
		ui: { sidebarOpen: p?.ui?.sidebarOpen ?? false, isSwitcherOpen: false },
		cloud: { context: hydrateCloudContext(p?.cloud) },
		content: {
			context: hydrateContentContext(p?.content, workspace.workspacePath),
		},
	};
}

export function serialize(state: DesktopState): Persisted {
	return {
		workspace: {
			workspacePath: state.workspace.workspacePath,
			recentWorkspaces: state.workspace.recentWorkspaces,
			lastOpenedPaths: state.workspace.lastOpenedPaths,
			sortMode: state.workspace.sortMode,
		},
		document: {
			lastOpenedPath: state.document.lastOpenedPath,
		},
		ui: {
			sidebarOpen: state.ui.sidebarOpen,
		},
		cloud: {
			context: state.cloud.context,
		},
		content: {
			context: state.content.context,
		},
	};
}
