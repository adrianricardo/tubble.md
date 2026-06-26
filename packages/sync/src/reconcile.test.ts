import { describe, expect, it } from "vitest";
import type {
	AgentDocument,
	DocumentPatchResult,
	ReplaceRangeIntent,
	SyncBackend,
} from "./backend.js";
import type { FileSystem } from "./fs.js";
import {
	changedRange,
	liveDocumentBaseCacheRoot,
	readReconcileBase,
	reconcileProjectionFile,
	toLocalEditName,
	writeReconcileBase,
} from "./reconcile.js";

type MemoryFs = FileSystem & {
	writes: Array<{ path: string; content: string }>;
};

/** Minimal in-memory FileSystem for reconcile tests. */
function createMemoryFs(initial: Record<string, string> = {}): MemoryFs {
	const files = new Map<string, string>(Object.entries(initial));
	const writes: MemoryFs["writes"] = [];
	const unsupported = () => {
		throw new Error("not supported in memory fs");
	};
	return {
		writes,
		async readFile(path) {
			const content = files.get(path);
			if (content === undefined) throw new Error(`ENOENT: ${path}`);
			return content;
		},
		async writeFile(path, content) {
			writes.push({ path, content });
			files.set(path, content);
		},
		async deleteFile(path) {
			files.delete(path);
		},
		async readFileOrNull(path) {
			return files.get(path) ?? null;
		},
		async ensureDir() {},
		listMarkdownFiles: unsupported,
		readBinaryFile: unsupported,
		writeBinaryFile: unsupported,
		listAssetFiles: unsupported,
	};
}

type RecordedPatch = Parameters<SyncBackend["applyDocumentPatch"]>[0];

/** Backend fake capturing patch calls. */
function createBackend(opts: {
	document?: AgentDocument | null;
	result?: DocumentPatchResult;
}): {
	backend: Pick<SyncBackend, "getDocumentForAgent" | "applyDocumentPatch">;
	patches: RecordedPatch[];
} {
	const patches: RecordedPatch[] = [];
	const backend = {
		async getDocumentForAgent() {
			return opts.document ?? null;
		},
		async applyDocumentPatch(args: RecordedPatch) {
			patches.push(args);
			return (
				opts.result ?? {
					documentId: args.documentId,
					revision: args.baseRevision + 1,
					markdown: "",
				}
			);
		},
	};
	return { backend, patches };
}

const WORKSPACE = "/ws";
const DOC_ID = "doc1";

function baseCachePaths(documentId: string) {
	const root = liveDocumentBaseCacheRoot(WORKSPACE);
	return {
		base: `${root}/${documentId}.base.md`,
		meta: `${root}/${documentId}.json`,
	};
}

describe("changedRange", () => {
	it("returns null for identical text", () => {
		expect(changedRange("hello", "hello")).toBeNull();
	});

	it("detects an appended suffix", () => {
		expect(changedRange("hello", "hello world")).toEqual({
			from: 5,
			to: 5,
			markdown: " world",
		});
	});

	it("detects a replaced middle segment", () => {
		expect(changedRange("the quick fox", "the slow fox")).toEqual({
			from: 4,
			to: 9,
			markdown: "slow",
		});
	});

	it("detects a deletion as an empty insertion", () => {
		expect(changedRange("abcdef", "abef")).toEqual({
			from: 2,
			to: 4,
			markdown: "",
		});
	});
});

describe("toLocalEditName", () => {
	const now = new Date("2026-06-25T13:45:30.000Z");

	// The 15-char timestamp slice mirrors `toConflictName` exactly, which
	// includes a trailing "." from the milliseconds segment.
	it("inserts the marker before the extension", () => {
		expect(toLocalEditName("/ws/notes/todo.md", now)).toBe(
			"/ws/notes/todo.local-edit-20260625134530..md",
		);
	});

	it("appends when there is no extension", () => {
		expect(toLocalEditName("/ws/notes/README", now)).toBe(
			"/ws/notes/README.local-edit-20260625134530.",
		);
	});
});

describe("readReconcileBase / writeReconcileBase", () => {
	it("round-trips base markdown and metadata", async () => {
		const fs = createMemoryFs();
		await writeReconcileBase(fs, WORKSPACE, DOC_ID, {
			markdown: "# Title",
			revision: 7,
			path: "notes/todo.md",
		});
		const base = await readReconcileBase(fs, WORKSPACE, DOC_ID);
		expect(base?.baseMarkdown).toBe("# Title");
		expect(base?.metadata.revision).toBe(7);
		expect(base?.metadata.path).toBe("notes/todo.md");
		expect(base?.metadata.canWrite).toBe(true);
	});

	it("returns null when the cache is missing", async () => {
		const fs = createMemoryFs();
		expect(await readReconcileBase(fs, WORKSPACE, DOC_ID)).toBeNull();
	});
});

describe("reconcileProjectionFile", () => {
	const projectionPath = "/ws/notes/todo.md";

	function seededFs(base: string, disk: string, canWrite = true): MemoryFs {
		const { base: basePath, meta } = baseCachePaths(DOC_ID);
		return createMemoryFs({
			[basePath]: base,
			[meta]: JSON.stringify({
				documentId: DOC_ID,
				revision: 3,
				path: "notes/todo.md",
				canWrite,
			}),
			[projectionPath]: disk,
		});
	}

	it("backstops when the base cache is missing", async () => {
		const fs = createMemoryFs({ [projectionPath]: "edited" });
		const { backend, patches } = createBackend({});
		const outcome = await reconcileProjectionFile(backend, fs, {
			documentId: DOC_ID,
			projectionPath,
			workspacePath: WORKSPACE,
		});
		expect(outcome).toEqual({
			status: "backstop",
			reason: "missing-base",
			documentId: DOC_ID,
		});
		expect(patches).toHaveLength(0);
	});

	it("backstops when the cached doc is read-only", async () => {
		const fs = seededFs("hello", "hello world", false);
		const { backend, patches } = createBackend({});
		const outcome = await reconcileProjectionFile(backend, fs, {
			documentId: DOC_ID,
			projectionPath,
			workspacePath: WORKSPACE,
		});
		expect(outcome).toEqual({
			status: "backstop",
			reason: "read-only",
			documentId: DOC_ID,
		});
		expect(patches).toHaveLength(0);
	});

	it("is a no-op when disk matches the base", async () => {
		const fs = seededFs("hello", "hello");
		const { backend, patches } = createBackend({});
		const outcome = await reconcileProjectionFile(backend, fs, {
			documentId: DOC_ID,
			projectionPath,
			workspacePath: WORKSPACE,
		});
		expect(outcome).toEqual({ status: "no-op" });
		expect(patches).toHaveLength(0);
	});

	it("backstops when the server reports read-only on re-check", async () => {
		const fs = seededFs("hello", "hello world");
		const { backend, patches } = createBackend({
			document: {
				documentId: DOC_ID,
				revision: 3,
				markdown: "hello",
				canWrite: false,
			},
		});
		const outcome = await reconcileProjectionFile(backend, fs, {
			documentId: DOC_ID,
			projectionPath,
			workspacePath: WORKSPACE,
		});
		expect(outcome).toEqual({
			status: "backstop",
			reason: "read-only",
			documentId: DOC_ID,
		});
		expect(patches).toHaveLength(0);
	});

	it("applies a scoped patch and refreshes the base cache", async () => {
		const fs = seededFs("hello", "hello world");
		const { backend, patches } = createBackend({
			document: {
				documentId: DOC_ID,
				revision: 3,
				markdown: "hello",
				canWrite: true,
			},
			result: { documentId: DOC_ID, revision: 4, markdown: "hello world!" },
		});
		const outcome = await reconcileProjectionFile(backend, fs, {
			documentId: DOC_ID,
			projectionPath,
			workspacePath: WORKSPACE,
			actor: "test-actor",
		});

		expect(outcome).toEqual({
			status: "reconciled",
			documentId: DOC_ID,
			revision: 4,
			markdown: "hello world!",
			baseChars: 0,
			newChars: 6,
			projectionPath,
		});

		// Scoped replace-range patch sent against the cached revision.
		expect(patches).toHaveLength(1);
		const intent = patches[0]?.intent as ReplaceRangeIntent;
		expect(patches[0]?.baseRevision).toBe(3);
		expect(patches[0]?.actor).toBe("test-actor");
		expect(intent).toEqual({
			kind: "replace-range",
			baseMarkdown: "hello",
			from: 5,
			to: 5,
			markdown: " world",
		});

		// Projection file re-materialized + base cache advanced to new revision.
		expect(await fs.readFile(projectionPath)).toBe("hello world!");
		const refreshed = await readReconcileBase(fs, WORKSPACE, DOC_ID);
		expect(refreshed?.baseMarkdown).toBe("hello world!");
		expect(refreshed?.metadata.revision).toBe(4);
		expect(refreshed?.metadata.path).toBe("notes/todo.md");
	});

	it("does not rewrite the projection when the server markdown matches the saved file", async () => {
		const fs = seededFs("hello", "hello world");
		const { backend } = createBackend({
			document: {
				documentId: DOC_ID,
				revision: 3,
				markdown: "hello",
				canWrite: true,
			},
			result: { documentId: DOC_ID, revision: 4, markdown: "hello world" },
		});

		await reconcileProjectionFile(backend, fs, {
			documentId: DOC_ID,
			projectionPath,
			workspacePath: WORKSPACE,
		});

		expect(fs.writes.some((write) => write.path === projectionPath)).toBe(false);
		const refreshed = await readReconcileBase(fs, WORKSPACE, DOC_ID);
		expect(refreshed?.baseMarkdown).toBe("hello world");
		expect(refreshed?.metadata.revision).toBe(4);
	});

	it("defaults the actor to file-reconcile", async () => {
		const fs = seededFs("hello", "hello world");
		const { backend, patches } = createBackend({
			document: {
				documentId: DOC_ID,
				revision: 3,
				markdown: "hello",
				canWrite: true,
			},
			result: { documentId: DOC_ID, revision: 4, markdown: "hello world" },
		});
		await reconcileProjectionFile(backend, fs, {
			documentId: DOC_ID,
			projectionPath,
			workspacePath: WORKSPACE,
		});
		expect(patches[0]?.actor).toBe("file-reconcile");
	});
});
