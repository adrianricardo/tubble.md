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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncedFolderService } from "./syncedFolderService";

vi.mock("@hubble.md/convex-client", () => ({
	createConvexBackend: () => {
		throw new Error("createConvexBackend must not be called in tests");
	},
	createConvexSubscriber: () => {
		throw new Error("createConvexSubscriber must not be called in tests");
	},
}));

const SYNC_ROOT = "/Hubble";
const NOW = 1_700_000_000_000;
const AUTH_TOKEN = "test-auth-token";
const CONNECT_INPUT = {
	syncRoot: SYNC_ROOT,
	deploymentUrl: "https://fake.convex.cloud",
	authToken: AUTH_TOKEN,
} as const;

/** In-memory FileSystem whose backing map is exposed for assertions. */
type MemoryFs = FileSystem & { __files: Map<string, string> };

function memoryFs(initial: Record<string, string> = {}): MemoryFs {
	const files = new Map(Object.entries(initial));
	const unsupported = (): never => {
		throw new Error("not supported in memory fs");
	};
	return {
		__files: files,
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
	backend: Array<{ url: string; authToken?: string }>;
	subscriber: Array<{ url: string; authToken?: string }>;
	subscriberClosed: number;
	subscriberUnsubscribed: number;
	getLiveDocuments: number;
	rename: Array<{ documentId: string; title: string; path?: string }>;
	move: Array<{ documentId: string; folderId: string | null }>;
	import: Array<{
		workspaceId: string;
		path: string;
		title: string;
		markdown: string;
	}>;
	patch: Array<{ documentId: string }>;
	remove: Array<{ documentId: string }>;
};

/**
 * Mutable backend state the tests steer: `docs` is the live desired set (clear
 * it to simulate access-loss on the next materialize); `canWrite` is what
 * `getDocumentForAgent` reports (set false to force a read-only backstop).
 */
type BackendState = {
	docs: LiveDocumentProjection[];
	canWrite: boolean;
	patchError?: Error | null;
};

function doc1(
	overrides: Partial<LiveDocumentProjection> = {},
): LiveDocumentProjection {
	return {
		_id: "d1",
		path: "WS/Doc.md",
		folderId: null,
		title: "Doc",
		markdown: "hello",
		version: 3,
		role: "editor",
		canWrite: true,
		updatedAt: 0,
		...overrides,
	};
}

function fakeBackend(calls: Calls, state: BackendState): SyncBackend {
	const notImpl = (): never => {
		throw new Error("not implemented in fake backend");
	};
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
			calls.getLiveDocuments += 1;
			return state.docs;
		},
		async getSharedWithMe() {
			return [];
		},
		async renameDocument(documentId, args) {
			calls.rename.push({ documentId, title: args.title, path: args.path });
		},
		async moveDocument(documentId, folderId) {
			calls.move.push({ documentId, folderId });
		},
		async removeDocument(documentId) {
			calls.remove.push({ documentId });
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
				canWrite: state.canWrite,
			};
		},
		async applyDocumentPatch(args): Promise<DocumentPatchResult> {
			calls.patch.push({ documentId: args.documentId });
			if (state.patchError) throw state.patchError;
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

function makeService(
	calls: Calls,
	events: Array<{ kind: string }>,
	overrides: Partial<BackendState> = {},
	options: { isOffline?: () => boolean } = {},
) {
	const state: BackendState = {
		docs: overrides.docs ?? [doc1()],
		canWrite: overrides.canWrite ?? true,
		patchError: overrides.patchError ?? null,
	};
	const fs = memoryFs();
	const backend = fakeBackend(calls, state);
	const subscription: {
		callback: (() => void) | null;
		error: ((error: Error) => void) | null;
	} = {
		callback: null,
		error: null,
	};
	const service = new SyncedFolderService({
		createBackend: (url, authToken) => {
			calls.backend.push({ url, authToken });
			return backend;
		},
		createSubscriber: (url, authToken) => {
			calls.subscriber.push({ url, authToken });
			return {
				onFilesChanged() {
					throw new Error("legacy file subscription is not used in tests");
				},
				onAssetsChanged() {
					throw new Error("asset subscription is not used in tests");
				},
				onSyncedFolderChanged(callback, onError) {
					subscription.callback = callback;
					subscription.error = onError;
					return () => {
						calls.subscriberUnsubscribed += 1;
					};
				},
				async close() {
					calls.subscriberClosed += 1;
				},
			};
		},
		fs,
		now: () => NOW,
		deviceId: "device-test",
		statInode: () => 111,
		isOffline: options.isOffline,
		emit: (event) => events.push(event),
		// No createWatcher → no chokidar; events are driven directly.
	});
	return { service, fs, state, subscription };
}

/** Base-cache paths the reconciler reads, rooted at the sync root. */
const BASE_MD = `${SYNC_ROOT}/.hubble/state/live-documents/d1.base.md`;
const BASE_JSON = `${SYNC_ROOT}/.hubble/state/live-documents/d1.json`;
const QUEUE_MANIFEST = `${SYNC_ROOT}/.hubble/queue/events.json`;

/** Find a written path matching `re` in the memory fs. */
function findPath(fs: MemoryFs, re: RegExp): string | undefined {
	return [...fs.__files.keys()].find((k) => re.test(k));
}

describe("SyncedFolderService routing", () => {
	let calls: Calls;
	let events: Array<{ kind: string }>;

	beforeEach(() => {
		calls = {
			backend: [],
			subscriber: [],
			subscriberClosed: 0,
			subscriberUnsubscribed: 0,
			getLiveDocuments: 0,
			rename: [],
			move: [],
			import: [],
			patch: [],
			remove: [],
		};
		events = [];
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function waitForCloudMaterialize() {
		return new Promise((resolve) => setTimeout(resolve, 300));
	}

	it("reconcile: a change on an indexed path calls reconcileProjectionFile (applyDocumentPatch)", async () => {
		const { service, fs } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);

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
		expect(service.getStatus().telemetry).toMatchObject({
			reconciledCount: 1,
			backstopCount: 0,
			readOnlyRejectedCount: 0,
			errorCount: 0,
			queuedEventCount: 0,
		});
		expect(service.getStatus().telemetry.recentEvents[0]).toMatchObject({
			kind: "reconciled",
			at: NOW,
		});
	});

	it("connect forwards the renderer auth token to the backend factory", async () => {
		const { service } = makeService(calls, events);

		await service.connect(CONNECT_INPUT);

		expect(calls.backend).toEqual([
			{
				url: "https://fake.convex.cloud",
				authToken: AUTH_TOKEN,
			},
		]);
		expect(calls.subscriber).toEqual([
			{
				url: "https://fake.convex.cloud",
				authToken: AUTH_TOKEN,
			},
		]);
	});

	it("cloud subscription: materializes markdown updates and suppresses the watcher echo", async () => {
		const { service, fs, state, subscription } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);

		state.docs = [doc1({ markdown: "cloud update", version: 4 })];
		subscription.callback?.();
		await waitForCloudMaterialize();

		const path = `${SYNC_ROOT}/WS/Doc.md`;
		expect(await fs.readFile(path)).toBe("cloud update");
		expect(service.lookup(path)?.hash).toBe(await contentHash("cloud update"));

		await service.handleRawEvent({
			type: "change",
			absPath: path,
			hash: await contentHash("cloud update"),
			inode: 111,
			at: NOW,
		});

		expect(calls.patch).toEqual([]);
	});

	it("cloud subscription: rapid updates coalesce into one materialize pass", async () => {
		const { service, fs, state, subscription } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);
		const callsAfterConnect = calls.getLiveDocuments;

		state.docs = [doc1({ markdown: "first", version: 4 })];
		subscription.callback?.();
		state.docs = [doc1({ markdown: "second", version: 5 })];
		subscription.callback?.();
		state.docs = [doc1({ markdown: "third", version: 6 })];
		subscription.callback?.();

		await waitForCloudMaterialize();
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe("third");
		expect(calls.getLiveDocuments - callsAfterConnect).toBe(1);
	});

	it("disconnect closes cloud subscriptions and ignores later callbacks", async () => {
		const { service, fs, state, subscription } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);

		await service.disconnect();
		expect(calls.subscriberUnsubscribed).toBe(1);
		expect(calls.subscriberClosed).toBe(1);

		state.docs = [doc1({ markdown: "after disconnect", version: 4 })];
		subscription.callback?.();
		await waitForCloudMaterialize();

		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe("hello");
	});

	it("self-write: a change whose hash matches our own write is suppressed", async () => {
		const { service } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);

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
		await service.connect(CONNECT_INPUT);

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
		await service.connect(CONNECT_INPUT);

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

		await service.connect(CONNECT_INPUT);

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

	it("backstop (missing-base): preserves on-disk bytes, re-materializes, no clobber", async () => {
		const { service, fs } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);

		// Drop the base cache so reconcile cannot scope a patch → missing-base.
		await fs.deleteFile(BASE_MD);
		await fs.deleteFile(BASE_JSON);

		// User edited the doc on disk.
		await fs.writeFile(`${SYNC_ROOT}/WS/Doc.md`, "my local edit");
		await service.handleRawEvent({
			type: "change",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			hash: await contentHash("my local edit"),
			inode: 111,
			at: NOW,
		});

		// The user's bytes were preserved in a `*.local-edit-<ts>` sibling.
		const sibling = findPath(fs, /\/WS\/Doc\.local-edit-.*\.md$/);
		expect(sibling).toBeDefined();
		expect(sibling && (await fs.readFile(sibling))).toBe("my local edit");

		// The projection was re-materialized to the authoritative markdown…
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe("hello");
		// …and the base cache was refreshed.
		expect(await fs.readFileOrNull(BASE_MD)).toBe("hello");

		// Never a silent clobber: applyPatch was never called.
		expect(calls.patch).toEqual([]);
		expect(events).toContainEqual({ kind: "backstop", reason: "missing-base" });
		expect(service.getStatus().telemetry).toMatchObject({
			backstopCount: 1,
			readOnlyRejectedCount: 0,
		});
		expect(service.getStatus().telemetry.recentEvents[0]).toMatchObject({
			kind: "backstop",
			reason: "missing-base",
		});
	});

	it("offline queue: replays a changed projection before reconnect materialize", async () => {
		let offline = true;
		const { service, fs, state } = makeService(
			calls,
			events,
			{},
			{ isOffline: () => offline },
		);
		await service.connect(CONNECT_INPUT);

		await fs.writeFile(`${SYNC_ROOT}/WS/Doc.md`, "hello offline");
		await service.handleRawEvent({
			type: "change",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			hash: await contentHash("hello offline"),
			inode: 111,
			at: NOW,
		});

		expect(calls.patch).toEqual([]);
		expect(JSON.parse(await fs.readFile(QUEUE_MANIFEST)).events).toHaveLength(
			1,
		);
		expect(service.getStatus().telemetry.queuedEventCount).toBe(1);

		await service.disconnect();
		offline = false;
		state.docs = [doc1({ markdown: "hello world", version: 4 })];
		await service.connect(CONNECT_INPUT);

		expect(calls.patch).toEqual([{ documentId: "d1" }]);
		expect(JSON.parse(await fs.readFile(QUEUE_MANIFEST)).events).toHaveLength(
			0,
		);
		expect(service.getStatus().telemetry.queuedEventCount).toBe(0);
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe("hello world");
	});

	it("offline queue: keeps a failed replay on disk and skips materialize", async () => {
		let offline = true;
		const { service, fs, state } = makeService(
			calls,
			events,
			{},
			{ isOffline: () => offline },
		);
		await service.connect(CONNECT_INPUT);

		await fs.writeFile(`${SYNC_ROOT}/WS/Doc.md`, "hello offline");
		await service.handleRawEvent({
			type: "change",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			hash: await contentHash("hello offline"),
			inode: 111,
			at: NOW,
		});

		await service.disconnect();
		offline = false;
		state.patchError = new Error("network unavailable");
		state.docs = [doc1({ markdown: "cloud should not clobber", version: 4 })];
		const status = await service.connect(CONNECT_INPUT);

		const queued = JSON.parse(await fs.readFile(QUEUE_MANIFEST)).events;
		expect(queued).toHaveLength(1);
		expect(queued[0]).toMatchObject({
			attempts: 1,
			lastError: "network unavailable",
		});
		expect(status.state).toBe("error");
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe("hello offline");
		expect(events).toContainEqual({ kind: "error" });
		expect(status.telemetry).toMatchObject({
			errorCount: 1,
			queuedEventCount: 1,
		});
	});

	it("read-only: a change to a non-writable doc is rejected and backstopped", async () => {
		const { service, fs } = makeService(calls, events, { canWrite: false });
		await service.connect(CONNECT_INPUT);

		await fs.writeFile(`${SYNC_ROOT}/WS/Doc.md`, "edit to a read-only doc");
		await service.handleRawEvent({
			type: "change",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			hash: await contentHash("edit to a read-only doc"),
			inode: 111,
			at: NOW,
		});

		// On-disk edit preserved as a sibling; authoritative restored; no cloud write.
		const sibling = findPath(fs, /\/WS\/Doc\.local-edit-.*\.md$/);
		expect(sibling).toBeDefined();
		expect(sibling && (await fs.readFile(sibling))).toBe(
			"edit to a read-only doc",
		);
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe("hello");
		expect(calls.patch).toEqual([]);
		expect(events).toContainEqual({ kind: "read-only-rejected" });
		expect(service.getStatus().telemetry).toMatchObject({
			backstopCount: 0,
			readOnlyRejectedCount: 1,
		});
	});

	it("local-delete: an expired watcher unlink soft-deletes the cloud doc", async () => {
		const { service } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);

		// Watcher unlink with no correlated add → held, then window expires.
		await service.handleRawEvent({
			type: "unlink",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			at: NOW,
		});
		await service.flushHeldUnlinks(NOW + 5_000);

		// WATCHER-origin direction → removeDocument exactly once, entry gone.
		expect(calls.remove).toEqual([{ documentId: "d1" }]);
		expect(service.isLiveDocument(`${SYNC_ROOT}/WS/Doc.md`)).toBe(false);
		expect(events).toContainEqual({ kind: "removed-local" });
	});

	it("access-loss: a doc leaving the cloud set is trashed, never cloud-deleted", async () => {
		const { service, fs, state } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);
		expect(service.isLiveDocument(`${SYNC_ROOT}/WS/Doc.md`)).toBe(true);

		// The doc leaves the desired cloud set (revoked share) — still exists in
		// the cloud, just no longer visible to this user.
		state.docs = [];
		await service.refresh();

		// MATERIALIZE-origin direction → local bytes moved to `.hubble/trash/`,
		// the cloud doc is left untouched (removeDocument NOT called).
		const trashed = findPath(fs, /\/\.hubble\/trash\/d1__Doc\.md$/);
		expect(trashed).toBeDefined();
		expect(trashed && (await fs.readFile(trashed))).toBe("hello");
		expect(await fs.readFileOrNull(`${SYNC_ROOT}/WS/Doc.md`)).toBeNull();
		expect(calls.remove).toEqual([]);
		expect(service.isLiveDocument(`${SYNC_ROOT}/WS/Doc.md`)).toBe(false);
		expect(events).toContainEqual({ kind: "removed-access" });
	});

	it("cloud materialize: documentId path changes are not mistaken for access loss", async () => {
		const { service, fs, state, subscription } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);

		state.docs = [
			doc1({
				title: "Renamed",
				path: "WS/Renamed.md",
				markdown: "hello",
				version: 4,
			}),
		];
		subscription.callback?.();
		await waitForCloudMaterialize();

		expect(await fs.readFileOrNull(`${SYNC_ROOT}/WS/Doc.md`)).toBeNull();
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Renamed.md`)).toBe("hello");
		expect(findPath(fs, /\/\.hubble\/trash\/d1__Doc\.md$/)).toBeUndefined();
		expect(calls.remove).toEqual([]);
		expect(service.lookup(`${SYNC_ROOT}/WS/Renamed.md`)?.documentId).toBe("d1");
		expect(events).not.toContainEqual({ kind: "removed-access" });
	});

	it("subscription error updates status and emits an error event", async () => {
		const { service, subscription } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);

		subscription.error?.(new Error("subscription failed"));

		expect(service.getStatus()).toMatchObject({
			state: "error",
			lastError: "subscription failed",
		});
		expect(events).toContainEqual({ kind: "error" });
		expect(service.getStatus().telemetry.errorCount).toBe(1);
	});

	it("connect refuses when another fresh device holds the lock", async () => {
		const fs = memoryFs({
			[`${SYNC_ROOT}/.hubble/index/owner.json`]: JSON.stringify({
				deviceId: "other-device",
				pid: 1,
				heartbeatAt: NOW,
			}),
		});
		const backend = fakeBackend(calls, { docs: [doc1()], canWrite: true });
		const service = new SyncedFolderService({
			createBackend: () => backend,
			fs,
			now: () => NOW,
			deviceId: "device-test",
			statInode: () => 111,
		});

		await expect(service.connect(CONNECT_INPUT)).rejects.toThrow(
			/already syncing/i,
		);
	});

	it("heartbeat loss stops sync instead of overwriting a fresh foreign owner", async () => {
		vi.useFakeTimers();
		const { service, fs } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);
		await fs.writeFile(
			`${SYNC_ROOT}/.hubble/index/owner.json`,
			JSON.stringify({
				deviceId: "other-device",
				pid: 99,
				heartbeatAt: NOW,
			}),
		);

		await vi.advanceTimersByTimeAsync(10_000);

		expect(
			JSON.parse(await fs.readFile(`${SYNC_ROOT}/.hubble/index/owner.json`)),
		).toMatchObject({ deviceId: "other-device" });
		expect(service.getStatus()).toMatchObject({
			state: "error",
			lastError: "Already syncing this folder on device other-device",
		});
		expect(calls.subscriberUnsubscribed).toBe(1);
		expect(calls.subscriberClosed).toBe(1);
		expect(events).toContainEqual({ kind: "error" });
		await expect(service.refresh()).rejects.toThrow(/not connected/i);
	});
});
