import { store } from "@simplestack/store";
import { invoke } from "@tauri-apps/api/core";
import { localStoragePersist } from "./lib/localStoragePersist";

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
			workspacePath: parsed.workspacePath ?? null,
			recentWorkspaces: Array.isArray(parsed.recentWorkspaces)
				? parsed.recentWorkspaces
				: [],
			sidebarOpen: parsed.sidebarOpen ?? true,
			sortMode: parsed.sortMode === "recent" ? "recent" : "alpha",
			files: [],
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

export function openWorkspace(path: string) {
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
