/**
 * SyncedFolderService routing tests (SYNCED-FOLDER Phase 3b).
 *
 * The backend, filesystem, clock, and `statInode` are injected; no chokidar
 * watcher is wired (`createWatcher` omitted), so `handleRawEvent` is driven
 * directly. Proves that a classified change reaches the right backend call and
 * that a self-write is suppressed.
 */

import {
	type AgentDocument,
	contentHash,
	type DocumentPatchResult,
	type FileSystem,
	type LiveDocumentProjection,
	type SyncBackend,
} from "@hubble.md/sync";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncedFolderService } from "./syncedFolderService";

vi.mock("@hubble.md/convex-client", () => ({
	createConvexBackend: () => {
		throw new Error("createConvexBackend must not be called in tests");
	},
}));

const SYNC_ROOT = "/Hubble";
const NOW = 1_700_000_000_000;

function memoryFs(initial: Record<string, string> = {}): FileSystem {
	const files = new Map(Object.entries(initial));
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
		async setReadOnly() {},
		listMarkdownFiles: unsupported,
		readBinaryFile: unsupported,
		writeBinaryFile: unsupported,
		listAssetFiles: unsupported,
	};
}

type Calls = {
	rename: Array<{ documentId: string; title: string; path?: string }>;
	move: Array<{ documentId: string; folderId: string | null }>;
	import: Array<{ workspaceId: string; path: string; title: string; markdown: string }>;
	patch: Array<{ documentId: string }>;
};

function fakeBackend(calls: Calls): SyncBackend {
	const notImpl = (): never => {
		throw new Error("not implemented in fake backend");
	};
	const docs: LiveDocumentProjection[] = [
		{
			_id: "d1",
			path: "WS/Doc.md",
			folderId: null,
			title: "Doc",
			markdown: "hello",
			version: 3,
			role: "editor",
			canWrite: true,
			updatedAt: 0,
		},
	];
	return {
		async listWorkspaces() {
			return [{ _id: "ws", name: "WS" }];
		},
		async getFolders() {
			return [
				{ _id: "f_specs", name: "Specs", parentId: null, workspaceId: "ws" },
			];
		},
		async getLiveDocuments() {
			return docs;
		},
		async renameDocument(documentId, args) {
			calls.rename.push({ documentId, title: args.title, path: args.path });
		},
		async moveDocument(documentId, folderId) {
			calls.move.push({ documentId, folderId });
		},
		async importLiveDocument(args) {
			calls.import.push({
				workspaceId: args.workspaceId,
				path: args.path,
				title: args.title,
				markdown: args.markdown,
			});
			return {
				documentId: "d_new",
				path: args.path,
				title: args.title,
				created: true,
			};
		},
		async getDocumentForAgent(documentId): Promise<AgentDocument> {
			return {
				documentId,
				revision: 3,
				markdown: "hello",
				canWrite: true,
			};
		},
		async applyDocumentPatch(args): Promise<DocumentPatchResult> {
			calls.patch.push({ documentId: args.documentId });
			return {
				documentId: args.documentId,
				revision: args.baseRevision + 1,
				markdown: "hello world",
			};
		},
		getWorkspace: notImpl,
		createWorkspace: notImpl,
		getFiles: notImpl,
		pushFile: notImpl,
		softDeleteFile: notImpl,
		getAssets: notImpl,
		pushAsset: notImpl,
		softDeleteAsset: notImpl,
		generateAssetUploadUrl: notImpl,
		getAssetDownloadUrl: notImpl,
	};
}

function makeService(calls: Calls, events: Array<{ kind: string }>) {
	const fs = memoryFs();
	const backend = fakeBackend(calls);
	const service = new SyncedFolderService({
		createBackend: () => backend,
		fs,
		now: () => NOW,
		deviceId: "device-test",
		statInode: () => 111,
		emit: (event) => events.push(event),
		// No createWatcher → no chokidar; events are driven directly.
	});
	return { service, fs };
}

describe("SyncedFolderService routing", () => {
	let calls: Calls;
	let events: Array<{ kind: string }>;

	beforeEach(() => {
		calls = { rename: [], move: [], import: [], patch: [] };
		events = [];
	});

	it("reconcile: a change on an indexed path calls reconcileProjectionFile (applyDocumentPatch)", async () => {
		const { service, fs } = makeService(calls, events);
		await service.connect({ syncRoot: SYNC_ROOT, deploymentUrl: "x" });

		// Materialize wrote "hello"; simulate an external edit on disk.
		await fs.writeFile(`${SYNC_ROOT}/WS/Doc.md`, "hello world");
		await service.handleRawEvent({
			type: "change",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			hash: await contentHash("hello world"),
			inode: 111,
			at: NOW,
		});

		expect(calls.patch).toEqual([{ documentId: "d1" }]);
		expect(events).toContainEqual({ kind: "reconciled" });
	});

	it("self-write: a change whose hash matches our own write is suppressed", async () => {
		const { service } = makeService(calls, events);
		await service.connect({ syncRoot: SYNC_ROOT, deploymentUrl: "x" });

		await service.handleRawEvent({
			type: "change",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			hash: await contentHash("hello"), // exactly what materialize wrote
			inode: 111,
			at: NOW,
		});

		expect(calls.patch).toEqual([]);
		expect(events).not.toContainEqual({ kind: "reconciled" });
	});

	it("rename: unlink + correlated add calls renameDocument and re-keys", async () => {
		const { service } = makeService(calls, events);
		await service.connect({ syncRoot: SYNC_ROOT, deploymentUrl: "x" });

		await service.handleRawEvent({
			type: "unlink",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			at: NOW,
		});
		await service.handleRawEvent({
			type: "add",
			absPath: `${SYNC_ROOT}/WS/Renamed.md`,
			inode: 111,
			at: NOW + 100,
		});

		expect(calls.rename).toEqual([
			{ documentId: "d1", title: "Renamed", path: "WS/Renamed.md" },
		]);
		expect(events).toContainEqual({ kind: "renamed" });
	});

	it("create: a new .md inside a workspace folder calls importLiveDocument", async () => {
		const { service, fs } = makeService(calls, events);
		await service.connect({ syncRoot: SYNC_ROOT, deploymentUrl: "x" });

		await fs.writeFile(`${SYNC_ROOT}/WS/New.md`, "fresh note");
		await service.handleRawEvent({
			type: "add",
			absPath: `${SYNC_ROOT}/WS/New.md`,
			inode: 222,
			at: NOW,
		});

		expect(calls.import).toEqual([
			{
				workspaceId: "ws",
				path: "WS/New.md",
				title: "New",
				markdown: "fresh note",
			},
		]);
		expect(events).toContainEqual({ kind: "created" });
	});

	it("isLiveDocument: index hit is true, miss is false", async () => {
		const { service } = makeService(calls, events);
		// Disconnected: nothing is a live document yet.
		expect(service.isLiveDocument(`${SYNC_ROOT}/WS/Doc.md`)).toBe(false);

		await service.connect({ syncRoot: SYNC_ROOT, deploymentUrl: "x" });

		// Materialized doc is in the reverse index → owned by the engine.
		expect(service.isLiveDocument(`${SYNC_ROOT}/WS/Doc.md`)).toBe(true);
		expect(service.lookup(`${SYNC_ROOT}/WS/Doc.md`)?.documentId).toBe("d1");
		// A path outside the index (legacy / unknown) is not a live document.
		expect(service.isLiveDocument(`${SYNC_ROOT}/WS/Other.md`)).toBe(false);
		expect(service.lookup(`${SYNC_ROOT}/WS/Other.md`)).toBeNull();

		// After disconnect the index is cleared again.
		await service.disconnect();
		expect(service.isLiveDocument(`${SYNC_ROOT}/WS/Doc.md`)).toBe(false);
	});

	it("connect refuses when another fresh device holds the lock", async () => {
		const fs = memoryFs({
			[`${SYNC_ROOT}/.hubble/index/owner.json`]: JSON.stringify({
				deviceId: "other-device",
				pid: 1,
				heartbeatAt: NOW,
			}),
		});
		const backend = fakeBackend(calls);
		const service = new SyncedFolderService({
			createBackend: () => backend,
			fs,
			now: () => NOW,
			deviceId: "device-test",
			statInode: () => 111,
		});

		await expect(
			service.connect({ syncRoot: SYNC_ROOT, deploymentUrl: "x" }),
		).rejects.toThrow(/already syncing/i);
	});
});
