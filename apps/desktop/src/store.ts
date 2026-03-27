import { store } from "@simplestack/store";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { classifyFileChange, type FileAction } from "./externalFileChange";
import { latest } from "./lib/latest";
import { localStoragePersist } from "./lib/localStoragePersist";
import { touchFile } from "./workspaceStore";

type ViewerStatus = "idle" | "loading" | "ready" | "error";
type ExternalChangeState =
	| { kind: "none" }
	| { kind: "conflict"; diskContent: string };

type ViewerState = {
	currentPath: string | null;
	lastOpenedPath: string | null;
	content: string;
	diskContent: string;
	isDirty: boolean;
	externalChange: ExternalChangeState;
	status: ViewerStatus;
	error: string | null;
};

const STORAGE_KEY = "hubble-desktop-viewer";
const NO_CONFLICT: ExternalChangeState = { kind: "none" };

function getInitialState(): ViewerState {
	const emptyState: ViewerState = {
		currentPath: null,
		lastOpenedPath: null,
		content: "",
		diskContent: "",
		isDirty: false,
		externalChange: NO_CONFLICT,
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

function getBaseline(state: ViewerState) {
	return state.externalChange.kind === "conflict"
		? state.externalChange.diskContent
		: state.diskContent;
}

function getCleanFileState(content: string) {
	return {
		content,
		diskContent: content,
		isDirty: false,
		externalChange: NO_CONFLICT,
		status: "ready" as const,
		error: null,
	};
}

function applyFileAction(
	state: ViewerState,
	diskContent: string,
	action: FileAction,
): ViewerState {
	switch (action) {
		case "none":
			return state;
		case "match":
		case "reload":
			return {
				...state,
				...getCleanFileState(diskContent),
			};
		case "conflict":
			return {
				...state,
				isDirty: true,
				status: "ready",
				error: null,
				externalChange: {
					kind: "conflict",
					diskContent,
				},
			};
	}
}

export function updateEditorContent(path: string, content: string) {
	const current = viewerStore.get();
	if (current.currentPath === path && current.content === content) return;

	viewerStore.set((s) => {
		if (s.currentPath !== path) return s;
		if (
			s.externalChange.kind === "conflict" &&
			content === s.externalChange.diskContent
		) {
			return {
				...s,
				...getCleanFileState(content),
			};
		}
		return {
			...s,
			content,
			isDirty: content !== getBaseline(s),
			status: "ready",
			error: null,
		};
	});
}

export async function savePathContent(
	path: string,
	content: string,
	options?: { force?: boolean },
) {
	const current = viewerStore.get();
	if (current.currentPath !== path) return;
	if (!options?.force && current.externalChange.kind === "conflict") return;
	if (current.content === content && !current.isDirty && !options?.force)
		return;

	if (!options?.force) {
		try {
			const currentDiskContent = await invoke<string>("read_file_text", {
				path,
			});
			const current = viewerStore.get();
			if (current.currentPath !== path) return;
			const action = classifyFileChange({
				editorContent: content,
				baseline: getBaseline(current),
				diskContent: currentDiskContent,
			});
			if (action !== "none") {
				viewerStore.set((state) => {
					if (state.currentPath !== path) return state;
					return applyFileAction(state, currentDiskContent, action);
				});
				return;
			}
		} catch {
			// Fall through to the write path if the file cannot be read during preflight.
		}
	}

	try {
		await invoke("write_file_text", { path, content });
		touchFile(path);
		viewerStore.set((s) => {
			if (s.currentPath !== path) return s;
			return {
				...s,
				...getCleanFileState(content),
			};
		});
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

export function handleExternalFileChange(
	path: string,
	nextDiskContent: string,
) {
	viewerStore.set((current) => {
		if (current.currentPath !== path) return current;
		const action = classifyFileChange({
			editorContent: current.content,
			baseline: getBaseline(current),
			diskContent: nextDiskContent,
		});
		return applyFileAction(current, nextDiskContent, action);
	});
}

export function reloadFromDiskConflict() {
	viewerStore.set((current) => {
		if (current.externalChange.kind !== "conflict") return current;
		return {
			...current,
			...getCleanFileState(current.externalChange.diskContent),
		};
	});
}

export async function keepLocalEdits() {
	const current = viewerStore.get();
	if (current.currentPath === null) return;
	await savePathContent(current.currentPath, current.content, { force: true });
}

const LOADING_DELAY_MS = 150;

export const loadPath = latest(async ({ isStale }, path: string) => {
	const timer = window.setTimeout(() => {
		if (isStale()) return;
		viewerStore.set((s) => ({ ...s, status: "loading", error: null }));
	}, LOADING_DELAY_MS);

	try {
		const content = await invoke<string>("read_file_text", { path });
		if (isStale()) return;
		viewerStore.set((current) => ({
			...current,
			currentPath: path,
			lastOpenedPath: path,
			...getCleanFileState(content),
		}));
	} catch (err) {
		if (isStale()) return;
		const message = err instanceof Error ? err.message : String(err);
		toast.error("Failed to open file", { description: message });
		viewerStore.set((current) => ({
			...current,
			currentPath: null,
			...getCleanFileState(""),
			status: "error",
			error: message,
		}));
	} finally {
		window.clearTimeout(timer);
	}
});
