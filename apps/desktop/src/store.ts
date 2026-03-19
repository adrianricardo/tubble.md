import {
	type ApplyTrackedMarkdownEditRequest,
	applyTrackedMarkdownEdit,
	buildTrackedMarkdownSnapshot,
	type TrackedMarkdownDocument,
	updateTrackedMarkdownDocument,
} from "@hubble.md/editor";
import { type StoreMiddleware, store } from "@simplestack/store";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

type ViewerStatus = "idle" | "loading" | "ready" | "error";
export type AgentPresenceState = {
	status: string;
	agentId?: string;
	summary?: string;
	details?: string;
	name?: string;
	color?: string;
	avatar?: string;
	updatedAt: string;
};

type ViewerState = {
	currentPath: string | null;
	lastOpenedPath: string | null;
	content: string;
	revision: number | null;
	contentHash: string | null;
	updatedAt: string | null;
	agentPresence: AgentPresenceState | null;
	status: ViewerStatus;
	error: string | null;
};

const STORAGE_KEY = "hubble-desktop-viewer";
type PersistedViewerState = Pick<ViewerState, "lastOpenedPath">;

const persistentStateMiddleware: StoreMiddleware<ViewerState> = () => ({
	set: (next) => (setter) => {
		next((currentState) => {
			const nextState =
				typeof setter === "function" ? setter(currentState) : setter;
			const lastOpenedPath = nextState.currentPath ?? nextState.lastOpenedPath;
			const persistedState: PersistedViewerState = {
				lastOpenedPath,
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
			return {
				...nextState,
				lastOpenedPath,
			};
		});
	},
});

function getInitialState(): ViewerState {
	const emptyState: ViewerState = {
		currentPath: null,
		lastOpenedPath: null,
		content: "",
		revision: null,
		contentHash: null,
		updatedAt: null,
		agentPresence: null,
		status: "idle",
		error: null,
	};

	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return emptyState;

	try {
		const parsed = JSON.parse(raw) as Partial<PersistedViewerState>;
		return {
			...emptyState,
			lastOpenedPath: parsed.lastOpenedPath ?? null,
		};
	} catch {
		return emptyState;
	}
}

function toTrackedMarkdownDocument(
	state: Pick<
		ViewerState,
		"currentPath" | "content" | "revision" | "contentHash" | "updatedAt"
	>,
): TrackedMarkdownDocument | null {
	if (
		!state.currentPath ||
		state.revision === null ||
		state.contentHash === null ||
		state.updatedAt === null
	) {
		return null;
	}

	return {
		path: state.currentPath,
		markdown: state.content,
		revision: state.revision,
		contentHash: state.contentHash,
		updatedAt: state.updatedAt,
	};
}

function applyTrackedMarkdownDocument(
	state: ViewerState,
	document: TrackedMarkdownDocument,
): ViewerState {
	return {
		...state,
		currentPath: document.path,
		content: document.markdown,
		revision: document.revision,
		contentHash: document.contentHash,
		updatedAt: document.updatedAt,
		status: "ready",
		error: null,
	};
}

function resolveTrackedMarkdownDocument(
	state: ViewerState,
	path: string,
	markdown: string,
): TrackedMarkdownDocument {
	return updateTrackedMarkdownDocument(toTrackedMarkdownDocument(state), {
		path,
		markdown,
	});
}

export async function savePathContent(
	path: string,
	content: string,
	/** Pre-computed revision from an agent edit; omit for local edits. */
	revisedDocument?: TrackedMarkdownDocument,
) {
	viewerStore.set((current) => {
		if (current.currentPath !== path) return current;
		const trackedDocument =
			revisedDocument ?? resolveTrackedMarkdownDocument(current, path, content);
		return applyTrackedMarkdownDocument(current, trackedDocument);
	});

	try {
		await invoke("write_file_text", { path, content });
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
	middleware: [persistentStateMiddleware],
});

export async function loadPath(path: string) {
	viewerStore.set((current) => ({
		...current,
		status: "loading",
		error: null,
	}));

	try {
		const content = await invoke<string>("read_file_text", { path });
		const trackedDocument = resolveTrackedMarkdownDocument(
			viewerStore.get(),
			path,
			content,
		);
		viewerStore.set((current) => ({
			...applyTrackedMarkdownDocument(current, trackedDocument),
			agentPresence: null,
		}));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		toast.error("Failed to open file", { description: message });
		viewerStore.set((current) => ({
			...current,
			currentPath: null,
			content: "",
			revision: null,
			contentHash: null,
			updatedAt: null,
			agentPresence: null,
			status: "error",
			error: message,
		}));
	}
}

export function getCurrentTrackedMarkdownDocument(): TrackedMarkdownDocument | null {
	return toTrackedMarkdownDocument(viewerStore.get());
}

export function getCurrentTrackedMarkdownSnapshot() {
	const document = getCurrentTrackedMarkdownDocument();
	return document ? buildTrackedMarkdownSnapshot(document) : null;
}

export async function applyCurrentTrackedMarkdownEdit(
	request: ApplyTrackedMarkdownEditRequest,
) {
	const current = getCurrentTrackedMarkdownDocument();
	if (!current) {
		return {
			success: false as const,
			code: "NOT_READY",
			error: "No markdown document is currently open.",
			snapshot: null,
		};
	}

	const result = applyTrackedMarkdownEdit(current, request);
	if (!result.success) {
		return result;
	}

	await savePathContent(
		current.path,
		result.nextState.markdown,
		result.nextState,
	);
	return result;
}

export function setAgentPresence(
	presence: Omit<AgentPresenceState, "updatedAt">,
): AgentPresenceState {
	const nextPresence: AgentPresenceState = {
		...presence,
		updatedAt: new Date().toISOString(),
	};
	viewerStore.set((current) => ({
		...current,
		agentPresence: nextPresence,
	}));
	return nextPresence;
}

export function clearAgentPresence() {
	viewerStore.set((current) => ({
		...current,
		agentPresence: null,
	}));
}
