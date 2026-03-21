import { store } from "@simplestack/store";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { localStoragePersist } from "./lib/localStoragePersist";
import { touchFile } from "./workspaceStore";

type ViewerStatus = "idle" | "loading" | "ready" | "error";

type ViewerState = {
	currentPath: string | null;
	lastOpenedPath: string | null;
	content: string;
	status: ViewerStatus;
	error: string | null;
};

const STORAGE_KEY = "hubble-desktop-viewer";

function getInitialState(): ViewerState {
	const emptyState: ViewerState = {
		currentPath: null,
		lastOpenedPath: null,
		content: "",
		status: "idle",
		error: null,
	};

	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return emptyState;

	try {
		const parsed = JSON.parse(raw) as Partial<
			Pick<ViewerState, "lastOpenedPath">
		>;
		return {
			...emptyState,
			lastOpenedPath: parsed.lastOpenedPath ?? null,
		};
	} catch {
		return emptyState;
	}
}

export async function savePathContent(path: string, content: string) {
	const current = viewerStore.get();
	if (current.currentPath === path && current.content === content) return;

	viewerStore.set((s) => {
		if (s.currentPath !== path) return s;
		return { ...s, content, status: "ready", error: null };
	});

	try {
		await invoke("write_file_text", { path, content });
		touchFile(path);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		toast.error("Failed to save file", { description: message });
		viewerStore.set((current) => {
			if (current.currentPath !== path) return current;
			return {
				...current,
				status: "error",
				error: message,
			};
		});
	}
}

export const viewerStore = store<ViewerState>(getInitialState(), {
	middleware: [
		localStoragePersist(STORAGE_KEY, (s) => ({
			lastOpenedPath: s.lastOpenedPath,
		})),
	],
});

export async function loadPath(path: string) {
	viewerStore.set((current) => ({
		...current,
		status: "loading",
		error: null,
	}));

	try {
		const content = await invoke<string>("read_file_text", { path });
		viewerStore.set((current) => ({
			...current,
			currentPath: path,
			lastOpenedPath: path,
			content,
			status: "ready",
			error: null,
		}));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		toast.error("Failed to open file", { description: message });
		viewerStore.set((current) => ({
			...current,
			currentPath: null,
			content: "",
			status: "error",
			error: message,
		}));
	}
}
