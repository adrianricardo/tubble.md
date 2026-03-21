import { store } from "@simplestack/store";
import { localStoragePersist } from "./lib/localStoragePersist";

type WorkspaceState = {
	workspacePath: string | null;
	recentWorkspaces: string[];
};

const STORAGE_KEY = "hubble-desktop-workspace";
const MAX_RECENT = 10;

function getInitialState(): WorkspaceState {
	const empty: WorkspaceState = { workspacePath: null, recentWorkspaces: [] };
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return empty;

	try {
		const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
		return {
			workspacePath: parsed.workspacePath ?? null,
			recentWorkspaces: Array.isArray(parsed.recentWorkspaces)
				? parsed.recentWorkspaces
				: [],
		};
	} catch {
		return empty;
	}
}

export const workspaceStore = store<WorkspaceState>(getInitialState(), {
	middleware: [localStoragePersist<WorkspaceState>(STORAGE_KEY)],
});

export function openWorkspace(path: string) {
	workspaceStore.set((current) => {
		const filtered = current.recentWorkspaces.filter((p) => p !== path);
		return {
			workspacePath: path,
			recentWorkspaces: [path, ...filtered].slice(0, MAX_RECENT),
		};
	});
}
