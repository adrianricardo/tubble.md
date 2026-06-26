/**
 * Routing isolation for synced-folder Live Documents (SYNCED-FOLDER §4).
 *
 * A document that lives under the bounded synced-folder watch root is owned by
 * the main-process reconcile engine: the host already diffed it against the
 * base cache and pushed a scoped CRDT patch (or wrote a `*.local-edit-<ts>`
 * backstop). The renderer must therefore NEVER run the legacy whole-file
 * conflict classifier (`classifyFileChange`) on such a path, or it could write a
 * spurious `*.conflict-<ts>` for a doc the engine already reconciled.
 *
 * This module isolates that decision into pure / easily-mocked helpers so the
 * "is-live-document → skip classify" branch is unit-tested without the store,
 * the DOM, or Electron, and without touching `externalFileChange.ts` itself.
 */

import { classifyFileChange, type FileAction } from "./externalFileChange";

/** The minimal slice of the desktop bridge this guard needs. */
type SyncedFolderProbe = {
	isSyncedFolderDocument?(absPath: string): Promise<boolean>;
};

/**
 * Ask the main process whether `path` is a synced Live Document. Defaults to
 * `false` (legacy classification still runs) whenever the bridge is missing
 * (web build), the method is unavailable, or the IPC call fails — the legacy
 * path is the safe fallback, never the synced one.
 */
export async function isSyncedLiveDocument(
	path: string,
	api: SyncedFolderProbe | undefined,
): Promise<boolean> {
	if (!api || typeof api.isSyncedFolderDocument !== "function") return false;
	try {
		return (await api.isSyncedFolderDocument(path)) === true;
	} catch {
		return false;
	}
}

/**
 * Either update only the saved baseline for a dirty synced doc, or apply a
 * normal file action.
 */
export type ExternalChangeDecision = "sync-baseline" | FileAction;

type ResolveArgs = {
	/** True when the main-process synced-folder engine owns this path. */
	isSyncedLiveDocument: boolean;
	editorContent: string;
	baseline: string;
	diskContent: string;
};

/**
 * Decide what the renderer should do with an external/on-disk change. For a
 * synced Live Document, the legacy classifier is NOT invoked: a clean editor can
 * reload the reconciled disk text, while a dirty editor keeps local content and
 * only advances its saved baseline. Otherwise delegate to the unchanged legacy
 * `classifyFileChange`. `classify` is injectable so a test can assert the
 * classifier is never called on the synced branch.
 */
export function resolveExternalFileChange(
	args: ResolveArgs,
	classify: (input: {
		editorContent: string;
		baseline: string;
		diskContent: string;
	}) => FileAction = classifyFileChange,
): ExternalChangeDecision {
	if (args.isSyncedLiveDocument) {
		return args.editorContent === args.baseline ? "reload" : "sync-baseline";
	}
	return classify({
		editorContent: args.editorContent,
		baseline: args.baseline,
		diskContent: args.diskContent,
	});
}
