import { init, isInitialized } from "@hubble.md/sync";
import { store } from "@simplestack/store";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { localStoragePersist } from "./lib/localStoragePersist";
import { createTauriFileSystem } from "./lib/tauriFileSystem";

const tauriFs = createTauriFileSystem();

type HubbleConfig = {
	workspaceId: string;
	workspaceName: string;
	deviceId: string;
	convexUrl: string;
};

export type SortMode = "alpha" | "recent";

export type FileEntry = {
	path: string;
	modified_at: number;
};

type WorkspaceState = {
	workspacePath: string | null;
	recentWorkspaces: string[];
	sidebarOpen: boolean;
	sortMode: SortMode;
	files: FileEntry[];
};

const STORAGE_KEY = "hubble-desktop-workspace";
const MAX_RECENT = 10;

function getInitialState(): WorkspaceState {
	const empty: WorkspaceState = {
		workspacePath: null,
		recentWorkspaces: [],
		sidebarOpen: true,
		sortMode: "alpha",
		files: [],
	};
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return empty;

	try {
		const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
		return {
			...empty,
			workspacePath: parsed.workspacePath ?? null,
			recentWorkspaces: Array.isArray(parsed.recentWorkspaces)
				? parsed.recentWorkspaces
				: [],
			sidebarOpen: parsed.sidebarOpen ?? true,
			sortMode: parsed.sortMode === "recent" ? "recent" : "alpha",
		};
	} catch {
		return empty;
	}
}

export const workspaceStore = store<WorkspaceState>(getInitialState(), {
	middleware: [
		localStoragePersist(STORAGE_KEY, ({ files: _, ...rest }) => rest),
	],
});

export async function refreshFiles() {
	const ws = workspaceStore.get().workspacePath;
	if (!ws) return;
	try {
		const files = await invoke<FileEntry[]>("list_directory", { path: ws });
		workspaceStore.set((s) => ({ ...s, files }));
	} catch {
		workspaceStore.set((s) => ({ ...s, files: [] }));
	}
}

export function touchFile(path: string) {
	workspaceStore.set((s) => ({
		...s,
		files: s.files.map((f) =>
			f.path === path
				? { ...f, modified_at: Math.floor(Date.now() / 1000) }
				: f,
		),
	}));
}

// Hydrate file list if a workspace was persisted from a previous session
if (workspaceStore.get().workspacePath) {
	void refreshFiles();
}

export async function openWorkspace(path: string) {
	// Validate / auto-init .hubble config
	const config = await invoke<HubbleConfig | null>("read_hubble_config", {
		workspacePath: path,
	});
	if (!config) {
		const ok = await ensureInitialized(path);
		if (!ok) return;
	}

	workspaceStore.set((current) => {
		const filtered = current.recentWorkspaces.filter((p) => p !== path);
		return {
			...current,
			workspacePath: path,
			recentWorkspaces: [path, ...filtered].slice(0, MAX_RECENT),
			files: [],
		};
	});
	void refreshFiles();
}

/** Ensure a workspace at `path` is initialized, creating .hubble/ if needed. */
export async function ensureInitialized(path: string): Promise<boolean> {
	if (await isInitialized(tauriFs, path)) return true;

	const convexUrl = (import.meta.env.VITE_CONVEX_URL as string) || null;
	if (!convexUrl) {
		toast.error("Cannot initialize workspace", {
			description: "VITE_CONVEX_URL is not configured.",
		});
		return false;
	}

	const workspaceName =
		path.split("/").pop() ?? path.split("\\").pop() ?? "default";
	try {
		await init(tauriFs, { workspacePath: path, workspaceName, convexUrl });
		return true;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		toast.error("Failed to initialize workspace", { description: message });
		return false;
	}
}

/** Pick a folder and open it as a workspace. If `initIfNeeded`, run init on new folders. */
export async function pickAndOpenWorkspace(initIfNeeded = false) {
	const selected = await open({
		multiple: false,
		directory: true,
		title: initIfNeeded
			? "Create or Open Workspace"
			: "Open Folder as Workspace",
	});
	if (typeof selected !== "string") return;
	await openWorkspace(selected);
}
