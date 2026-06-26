/**
 * LiveSyncService unit tests — headless round-trip proof (Phase 2).
 *
 * Both the SyncBackend and FileSystem are injected as fakes, so this suite
 * runs without a real Convex deployment or real disk I/O.  The fake patterns
 * follow reconcile.test.ts from the shared @hubble.md/sync package.
 */

import type {
	AgentDocument,
	DocumentPatchResult,
	FileSystem,
	SyncBackend,
} from "@hubble.md/sync";
import { writeReconcileBase } from "@hubble.md/sync";
import { describe, expect, it, vi } from "vitest";
import { LiveSyncService } from "./liveSync";

// Mock the production-only modules that cannot load cleanly in the Vitest
// Node.js environment.  Tests inject fake backends and filesystems via the
// `createBackend` / `fs` constructor options, so the real implementations are
// never invoked.
vi.mock("@hubble.md/convex-client", () => ({
	createConvexBackend: (_url: string) => {
		throw new Error("createConvexBackend must not be called in tests");
	},
}));

// ─── Test doubles ────────────────────────────────────────────────────────────

/**
 * Minimal in-memory FileSystem (same pattern as packages/sync/src/reconcile.test.ts).
 * All methods that the reconciler does not touch throw so an accidental call is
 * immediately visible.
 */
function createMemoryFs(initial: Record<string, string> = {}): FileSystem {
	const files = new Map<string, string>(Object.entries(initial));
	const unsupported = (): never => {
		throw new Error("not supported in memory fs");
	};
	return {
		async readFile(path) {
			const content = files.get(path);
			if (content === undefined) throw new Error(`ENOENT: ${path}`);
			return content;
		},
		async writeFile(path, content) {
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

/**
 * Fake SyncBackend factory.  Only `getDocumentForAgent` and
 * `applyDocumentPatch` are used by `reconcileProjectionFile`; the rest throw
 * "not implemented" so any unexpected call is loud.
 *
 * Pass `throwWith` to simulate a backend network/server error.
 */
function createFakeBackend(opts: {
	document?: AgentDocument | null;
	patchResult?: DocumentPatchResult;
	throwWith?: Error;
}): (url: string) => SyncBackend {
	const notImpl = (): never => {
		throw new Error("not implemented in fake SyncBackend");
	};
	// Cast via unknown — we intentionally implement only the subset that the
	// reconciler exercises (getDocumentForAgent + applyDocumentPatch).
	const backend = {
		async getDocumentForAgent(_id: string): Promise<AgentDocument | null> {
			if (opts.throwWith) throw opts.throwWith;
			return opts.document ?? null;
		},
		async applyDocumentPatch(args: {
			documentId: string;
			baseRevision: number;
			intent: unknown;
			actor?: string;
		}): Promise<DocumentPatchResult> {
			if (opts.throwWith) throw opts.throwWith;
			return (
				opts.patchResult ?? {
					documentId: args.documentId,
					revision: args.baseRevision + 1,
					markdown: "",
				}
			);
		},
		getWorkspace: notImpl,
		createWorkspace: notImpl,
		getFiles: notImpl,
		pushFile: notImpl,
		softDeleteFile: notImpl,
		getLiveDocuments: notImpl,
		importLiveDocument: notImpl,
		getAssets: notImpl,
		pushAsset: notImpl,
		softDeleteAsset: notImpl,
		generateAssetUploadUrl: notImpl,
		getAssetDownloadUrl: notImpl,
	} as unknown as SyncBackend;

	return (_url: string) => backend;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const WORKSPACE = "/ws";
const DOC_ID = "doc-1";
const PROJECTION_PATH = "/ws/notes/todo.md";

const CONNECTION = {
	workspacePath: WORKSPACE,
	deploymentUrl: "https://fake.convex.cloud",
	workspaceId: "ws-1",
	authToken: "test-auth-token",
} as const;

const RECONCILE_INPUT = {
	documentId: DOC_ID,
	projectionPath: PROJECTION_PATH,
	actor: "test-actor",
};

/**
 * In-memory FS pre-seeded with a base cache + a projection file whose on-disk
 * content differs from the base, so the reconciler reaches the backend phase.
 */
async function seededFs(
	baseMarkdown: string,
	diskMarkdown: string,
): Promise<FileSystem> {
	const fs = createMemoryFs({ [PROJECTION_PATH]: diskMarkdown });
	await writeReconcileBase(fs, WORKSPACE, DOC_ID, {
		markdown: baseMarkdown,
		revision: 3,
		path: "notes/todo.md",
	});
	return fs;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("LiveSyncService", () => {
	describe("connect / initial state", () => {
		it("starts idle with no connection", () => {
			const svc = new LiveSyncService({
				createBackend: createFakeBackend({}),
				fs: createMemoryFs(),
			});

			const status = svc.getStatus();
			expect(status.state).toBe("idle");
			expect(status.connected).toBe(false);
			expect(status.workspacePath).toBeNull();
			expect(status.workspaceId).toBeNull();
			expect(status.pending).toBe(0);
			expect(status.lastReconciledAt).toBeNull();
			expect(status.lastError).toBeNull();
		});

		it("connect() transitions to connected and exposes the connection fields", () => {
			const svc = new LiveSyncService({
				createBackend: createFakeBackend({}),
				fs: createMemoryFs(),
			});

			const status = svc.connect(CONNECTION);

			expect(status.state).toBe("connected");
			expect(status.connected).toBe(true);
			expect(status.workspacePath).toBe(WORKSPACE);
			expect(status.workspaceId).toBe("ws-1");
			expect(status.pending).toBe(0);
			expect(status.lastError).toBeNull();
		});

		it("connect() forwards the renderer auth token to the backend factory", () => {
			const calls: Array<{ url: string; authToken?: string }> = [];
			const backendFactory = createFakeBackend({});
			const svc = new LiveSyncService({
				createBackend: (url, authToken) => {
					calls.push({ url, authToken });
					return backendFactory(url);
				},
				fs: createMemoryFs(),
			});

			svc.connect(CONNECTION);

			expect(calls).toEqual([
				{
					url: "https://fake.convex.cloud",
					authToken: "test-auth-token",
				},
			]);
		});

		it("reconcile() before connect throws", async () => {
			const svc = new LiveSyncService({
				createBackend: createFakeBackend({}),
				fs: createMemoryFs(),
			});

			await expect(svc.reconcile(RECONCILE_INPUT)).rejects.toThrow(
				"Live sync is not connected",
			);
		});
	});

	describe("reconcile — reconciled outcome", () => {
		it("updates lastReconciledAt, clears lastError, decrements pending, stays connected", async () => {
			const before = Date.now();
			const fs = await seededFs("hello", "hello world");

			const svc = new LiveSyncService({
				createBackend: createFakeBackend({
					document: {
						documentId: DOC_ID,
						revision: 3,
						markdown: "hello",
						canWrite: true,
					},
					patchResult: {
						documentId: DOC_ID,
						revision: 4,
						markdown: "hello world",
					},
				}),
				fs,
			});
			svc.connect(CONNECTION);

			const outcome = await svc.reconcile(RECONCILE_INPUT);

			expect(outcome.status).toBe("reconciled");

			const status = svc.getStatus();
			expect(status.state).toBe("connected");
			expect(status.pending).toBe(0);
			expect(status.lastError).toBeNull();
			expect(status.lastReconciledAt).toBeGreaterThanOrEqual(before);
		});
	});

	describe("reconcile — backstop outcome", () => {
		it("returns backstop to the caller (not swallowed), leaves state connected", async () => {
			// Empty FS → base cache is missing → backstop("missing-base") without
			// touching the backend at all.
			const svc = new LiveSyncService({
				createBackend: createFakeBackend({}),
				fs: createMemoryFs({ [PROJECTION_PATH]: "some content" }),
			});
			svc.connect(CONNECTION);

			const outcome = await svc.reconcile(RECONCILE_INPUT);

			expect(outcome.status).toBe("backstop");
			if (outcome.status === "backstop") {
				expect(outcome.reason).toBe("missing-base");
				expect(outcome.documentId).toBe(DOC_ID);
			}

			// State must remain connected — a backstop is not an engine error.
			const status = svc.getStatus();
			expect(status.state).toBe("connected");
			expect(status.pending).toBe(0);
		});
	});

	describe("reconcile — backend error", () => {
		it("sets state to error, records lastError, decrements pending, and re-throws", async () => {
			const boom = new Error("network timeout");
			// seededFs gives us a diff so the reconciler reaches the backend call.
			const fs = await seededFs("hello", "hello world");

			const svc = new LiveSyncService({
				createBackend: createFakeBackend({ throwWith: boom }),
				fs,
			});
			svc.connect(CONNECTION);

			await expect(svc.reconcile(RECONCILE_INPUT)).rejects.toThrow(
				"network timeout",
			);

			const status = svc.getStatus();
			expect(status.state).toBe("error");
			expect(status.lastError).toBe("network timeout");
			expect(status.pending).toBe(0);
		});
	});

	describe("disconnect", () => {
		it("resets state to idle and clears connection fields and pending", () => {
			const svc = new LiveSyncService({
				createBackend: createFakeBackend({}),
				fs: createMemoryFs(),
			});
			svc.connect(CONNECTION);
			expect(svc.getStatus().state).toBe("connected");

			const status = svc.disconnect();

			expect(status.state).toBe("idle");
			expect(status.connected).toBe(false);
			expect(status.workspacePath).toBeNull();
			expect(status.workspaceId).toBeNull();
			expect(status.pending).toBe(0);
		});
	});
});
