import type { SyncBackend } from "./backend.js";
import type { FileSystem } from "./fs.js";

/**
 * Reusable Live Document file reconciler.
 *
 * Lifts the reconcile core out of the CLI (`hubble cloud document reconcile`)
 * so it can be hosted both there and in long-lived processes (e.g. the Electron
 * main process). Framework-agnostic: it depends only on a {@link SyncBackend}
 * for document reads/patches and a {@link FileSystem} for projection + base
 * cache I/O. No CLI-, Electron-, or network-specific code is baked in.
 */

/** Subset of the filesystem the reconciler touches. */
type ReconcileFileSystem = Pick<
	FileSystem,
	"readFile" | "readFileOrNull" | "writeFile" | "ensureDir"
>;

export type ReconcileBaseMetadata = {
	documentId: string;
	revision: number;
	path?: string;
	role?: "owner" | "editor" | "commenter" | "viewer" | null;
	canWrite?: boolean;
	projectedAt?: number;
};

export type ChangedRange = {
	from: number;
	to: number;
	markdown: string;
};

/** Why the reconciler could not safely apply a scoped patch. */
export type BackstopReason = "missing-base" | "read-only";

/** Outcome of reconciling a single projection file. */
export type ReconcileOutcome =
	| { status: "no-op" }
	| {
			status: "reconciled";
			documentId: string;
			revision: number;
			markdown: string;
			baseChars: number;
			newChars: number;
			projectionPath: string;
	  }
	| { status: "backstop"; reason: BackstopReason; documentId: string };

export type ReconcileProjectionFileArgs = {
	documentId: string;
	/** Absolute path to the editable projection file on disk. */
	projectionPath: string;
	workspacePath: string;
	actor?: string;
	/** Relative path stored in the base-cache metadata (fallback only). */
	path?: string;
};

/** Where per-document base caches live within a workspace. */
export function liveDocumentBaseCacheRoot(workspacePath: string): string {
	return `${workspacePath}/.hubble/state/live-documents`;
}

/**
 * Minimal prefix/suffix diff between the base text and the next text. Returns
 * `null` when the texts are identical (no-op).
 */
export function changedRange(
	baseText: string,
	nextText: string,
): ChangedRange | null {
	let prefix = 0;
	while (
		prefix < baseText.length &&
		prefix < nextText.length &&
		baseText[prefix] === nextText[prefix]
	) {
		prefix += 1;
	}

	let baseSuffix = baseText.length;
	let nextSuffix = nextText.length;
	while (
		baseSuffix > prefix &&
		nextSuffix > prefix &&
		baseText[baseSuffix - 1] === nextText[nextSuffix - 1]
	) {
		baseSuffix -= 1;
		nextSuffix -= 1;
	}

	if (prefix === baseText.length && prefix === nextText.length) return null;
	return {
		from: prefix,
		to: baseSuffix,
		markdown: nextText.slice(prefix, nextSuffix),
	};
}

/**
 * Backstop conflict-copy name (sibling of `toConflictName` in sync.ts). Used
 * when reconcile cannot be safely scoped, to preserve the on-disk edit instead
 * of clobbering it. The timestamp is injectable for deterministic tests.
 */
export function toLocalEditName(
	filePath: string,
	now: Date = new Date(),
): string {
	const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 15);
	const dot = filePath.lastIndexOf(".");
	if (dot === -1) return `${filePath}.local-edit-${ts}`;
	return `${filePath.slice(0, dot)}.local-edit-${ts}${filePath.slice(dot)}`;
}

/** Read the per-document base cache (markdown + metadata), or `null`. */
export async function readReconcileBase(
	fs: Pick<ReconcileFileSystem, "readFileOrNull">,
	workspacePath: string,
	documentId: string,
): Promise<{ baseMarkdown: string; metadata: ReconcileBaseMetadata } | null> {
	const root = liveDocumentBaseCacheRoot(workspacePath);
	const baseMarkdown = await fs.readFileOrNull(`${root}/${documentId}.base.md`);
	const rawMetadata = await fs.readFileOrNull(`${root}/${documentId}.json`);
	if (baseMarkdown === null || rawMetadata === null) return null;
	const metadata = JSON.parse(rawMetadata) as ReconcileBaseMetadata;
	return { baseMarkdown, metadata };
}

/** Write the per-document base cache after a successful reconcile/projection. */
export async function writeReconcileBase(
	fs: Pick<ReconcileFileSystem, "ensureDir" | "writeFile">,
	workspacePath: string,
	documentId: string,
	args: { markdown: string; revision: number; path?: string },
): Promise<void> {
	const root = liveDocumentBaseCacheRoot(workspacePath);
	await fs.ensureDir(root);
	await fs.writeFile(`${root}/${documentId}.base.md`, args.markdown);
	await fs.writeFile(
		`${root}/${documentId}.json`,
		JSON.stringify(
			{
				documentId,
				revision: args.revision,
				path: args.path,
				canWrite: true,
				projectedAt: Date.now(),
			},
			null,
			2,
		),
	);
}

/**
 * Reconcile a single Live Document projection file into the cloud CRDT.
 *
 * Steps (mirroring the proven CLI flow):
 *  1. Load the per-doc base cache; missing → `backstop("missing-base")`.
 *  2. Refuse read-only docs → `backstop("read-only")`.
 *  3. Diff base vs. on-disk; no change → `no-op`.
 *  4. Re-check `canWrite` against the backend; read-only → `backstop`.
 *  5. Apply a scoped `replace-range` patch, refresh the projection only if the
 *     server materialization differs from the saved file, and refresh the base
 *     cache → `reconciled`.
 *
 * Callers decide how to surface a `backstop` outcome (the CLI throws; a
 * long-lived host can write a `*.local-edit-<ts>` copy — Phase 5).
 */
export async function reconcileProjectionFile(
	backend: Pick<SyncBackend, "getDocumentForAgent" | "applyDocumentPatch">,
	fs: ReconcileFileSystem,
	args: ReconcileProjectionFileArgs,
): Promise<ReconcileOutcome> {
	const { documentId, projectionPath, workspacePath } = args;

	const base = await readReconcileBase(fs, workspacePath, documentId);
	if (!base) {
		return { status: "backstop", reason: "missing-base", documentId };
	}
	if (base.metadata.canWrite === false) {
		return { status: "backstop", reason: "read-only", documentId };
	}

	const nextMarkdown = await fs.readFile(projectionPath);
	const range = changedRange(base.baseMarkdown, nextMarkdown);
	if (!range) {
		return { status: "no-op" };
	}

	const document = await backend.getDocumentForAgent(documentId);
	if (!document?.canWrite) {
		return { status: "backstop", reason: "read-only", documentId };
	}

	const result = await backend.applyDocumentPatch({
		documentId,
		baseRevision: base.metadata.revision,
		intent: {
			kind: "replace-range",
			baseMarkdown: base.baseMarkdown,
			from: range.from,
			to: range.to,
			markdown: range.markdown,
		},
		actor: args.actor ?? "file-reconcile",
	});

	if (result.markdown !== nextMarkdown) {
		await fs.writeFile(projectionPath, result.markdown);
	}
	await writeReconcileBase(fs, workspacePath, documentId, {
		markdown: result.markdown,
		revision: result.revision,
		path: base.metadata.path ?? args.path,
	});

	return {
		status: "reconciled",
		documentId,
		revision: result.revision,
		markdown: result.markdown,
		baseChars: range.to - range.from,
		newChars: range.markdown.length,
		projectionPath,
	};
}
