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
	type DocumentRelocationResult,
	type FileSystem,
	type LiveDocumentProjection,
	type ProjectionScope,
	type SharedSubtreeDocument,
	type SharedWithMe,
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
		async listMarkdownFiles(dir) {
			const prefix = `${dir}/`;
			return Promise.all(
				Array.from(files.entries())
					.filter(([path]) => {
						if (!path.startsWith(prefix) || !path.endsWith(".md")) return false;
						return !path
							.slice(prefix.length)
							.split("/")
							.some((segment) => segment.startsWith("."));
					})
					.map(async ([path, content]) => ({
						relativePath: path.slice(prefix.length),
						content,
						hash: await contentHash(content),
					})),
			);
		},
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
	prepareRelocation: Array<{
		documentId: string;
		folderId: string | null;
		title: string;
		path: string;
	}>;
	confirmRelocation: Array<{
		documentId: string;
		folderId: string | null;
		title: string;
		path: string;
		fingerprint: string;
	}>;
	import: Array<{
		workspaceId: string;
		path: string;
		title: string;
		markdown: string;
	}>;
	patch: Array<{ documentId: string }>;
	remove: Array<{ documentId: string }>;
	restore: Array<{ documentId: string }>;
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
	relocationResult?: DocumentRelocationResult;
	trashState?: "active" | "trashed" | "inaccessible";
	/** RB4: subtree "Shared with me" payload (steerable to simulate revoke). */
	shared: SharedWithMe;
	/** RB3: per-folder subtree docs served to a mount engine instance. */
	subtreeDocs: Record<string, SharedSubtreeDocument[]>;
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

function fakeBackend(
	calls: Calls,
	state: BackendState,
	onGetLiveDocuments?: (call: number) => void,
): SyncBackend {
	const notImpl = (): never => {
		throw new Error("not implemented in fake backend");
	};
	return {
		getCloudFolderMovePreview: notImpl,
		getCloudFolderExportCopyPreview: notImpl,
		getCloudFolderExportCopyBatch: notImpl,
		prepareCloudFolderMove: notImpl,
		getCloudFolderExportBatch: notImpl,
		archiveAuthorityFolder: notImpl,
		restoreArchivedAuthorityFolder: notImpl,
		prepareGitFolderMove: notImpl,
		stageAuthorityFolderBatch: notImpl,
		verifyAuthorityStaging: notImpl,
		activateAuthorityFolder: notImpl,
		getAuthorityTransferStatus: notImpl,
		cancelAuthorityTransferBatch: notImpl,
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
			onGetLiveDocuments?.(calls.getLiveDocuments);
			return state.docs.filter((document) => document.deletedAt === undefined);
		},
		async getSharedWithMe() {
			return state.shared;
		},
		async getFolderSubtreeDocuments(folderId) {
			return state.subtreeDocs[folderId] ?? [];
		},
		async setFolderRepoLink() {},
		async createDocument() {
			return "d_created";
		},
		async renameDocument(documentId, args) {
			calls.rename.push({ documentId, title: args.title, path: args.path });
		},
		async moveDocument(documentId, folderId) {
			calls.move.push({ documentId, folderId });
		},
		async prepareDocumentRelocation(args) {
			calls.prepareRelocation.push(args);
			return state.relocationResult ?? { status: "completed" };
		},
		async confirmDocumentRelocation(args) {
			calls.confirmRelocation.push({
				documentId: args.documentId,
				folderId: args.folderId,
				title: args.title,
				path: args.path,
				fingerprint: args.fingerprint,
			});
			return state.relocationResult ?? { status: "completed" };
		},
		async removeDocument(documentId) {
			calls.remove.push({ documentId });
			state.trashState = "trashed";
			state.docs = state.docs.map((document) =>
				document._id === documentId
					? { ...document, deletedAt: NOW }
					: document,
			);
		},
		async restoreDocument(documentId) {
			calls.restore.push({ documentId });
			state.docs = state.docs.map((document) => ({
				...document,
				deletedAt: undefined,
			}));
			state.trashState = "active";
		},
		async getDocumentTrashState() {
			return state.trashState ?? "inaccessible";
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
			const result = {
				documentId: args.documentId,
				revision: args.baseRevision + 1,
				markdown: "hello world",
			};
			state.docs = state.docs.map((document) =>
				document._id === args.documentId
					? {
							...document,
							markdown: result.markdown,
							version: result.revision,
						}
					: document,
			);
			return result;
		},
		getWorkspace: notImpl,
		createWorkspace: notImpl,
		createFolder: notImpl,
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
	options: {
		isOffline?: () => boolean;
		isPathAvailable?: (path: string) => boolean;
		scope?: ProjectionScope;
		statInode?: (path: string) => number | null;
		onGetLiveDocuments?: (call: number, fs: MemoryFs) => void;
	} = {},
) {
	const state: BackendState = {
		docs: overrides.docs ?? [doc1()],
		canWrite: overrides.canWrite ?? true,
		patchError: overrides.patchError ?? null,
		relocationResult: overrides.relocationResult,
		shared: overrides.shared ?? { folders: [], documents: [] },
		subtreeDocs: overrides.subtreeDocs ?? {},
	};
	const fs = memoryFs();
	const backend = fakeBackend(calls, state, (call) =>
		options.onGetLiveDocuments?.(call, fs),
	);
	const subscription: {
		scope: { kind: string; workspaceId?: string; folderId?: string } | null;
		callback: (() => void) | null;
		error: ((error: Error) => void) | null;
	} = {
		scope: null,
		callback: null,
		error: null,
	};
	const service = new SyncedFolderService({
		scope: options.scope ?? { kind: "all-accessible" },
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
				onSyncedFolderChanged(scope, callback, onError) {
					subscription.scope = scope;
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
		statInode: options.statInode ?? (() => 111),
		isOffline: options.isOffline,
		isPathAvailable: options.isPathAvailable,
		emit: (event) => events.push(event),
		// No createWatcher → no chokidar; events are driven directly.
	});
	return { service, fs, state, subscription };
}

/** Base-cache paths the reconciler reads, rooted at the sync root. */
const BASE_MD = `${SYNC_ROOT}/.hubble/state/live-documents/d1.base.md`;
const BASE_JSON = `${SYNC_ROOT}/.hubble/state/live-documents/d1.json`;
const QUEUE_MANIFEST = `${SYNC_ROOT}/.hubble/queue/events.json`;
const OPERATIONS_MANIFEST = `${SYNC_ROOT}/.hubble/pending/projection-operations.json`;

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
			prepareRelocation: [],
			confirmRelocation: [],
			import: [],
			patch: [],
			remove: [],
			restore: [],
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
		const { service, subscription } = makeService(calls, events);

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
		expect(subscription.scope).toEqual({ kind: "all-accessible" });
	});

	it("folder mounts subscribe only to their cloud subtree", async () => {
		const mountedDocument: SharedSubtreeDocument = {
			_id: "d1",
			workspaceId: "ws_x",
			workspaceName: "Acme",
			folderId: "f_link",
			title: "Doc",
			path: "Doc.md",
			markdown: "hello",
			version: 1,
			role: "owner",
			canWrite: true,
			updatedAt: 0,
			relativePath: "",
		};
		const { service, subscription } = makeService(
			calls,
			events,
			{ subtreeDocs: { f_link: [mountedDocument] } },
			{
				scope: {
					kind: "folder",
					workspaceId: "ws_x",
					folderId: "f_link",
				},
			},
		);

		await service.connect(CONNECT_INPUT);

		expect(subscription.scope).toEqual({
			kind: "folder",
			workspaceId: "ws_x",
			folderId: "f_link",
		});
	});

	it("Workspace roots materialize and subscribe only to the selected Workspace", async () => {
		const { service, fs, state, subscription } = makeService(
			calls,
			events,
			{ docs: [doc1({ path: "Doc.md" })] },
			{ scope: { kind: "workspace", workspaceId: "ws" } },
		);

		await service.connect(CONNECT_INPUT);

		expect(subscription.scope).toEqual({
			kind: "workspace",
			workspaceId: "ws",
		});
		expect(await fs.readFile(`${SYNC_ROOT}/Doc.md`)).toBe("hello");
		expect(await fs.readFileOrNull(`${SYNC_ROOT}/WS/Doc.md`)).toBeNull();

		state.docs = [doc1({ path: "Doc.md", markdown: "workspace update" })];
		subscription.callback?.();
		await waitForCloudMaterialize();
		expect(await fs.readFile(`${SYNC_ROOT}/Doc.md`)).toBe("workspace update");
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

	it("waits for materialize indexing before classifying an add from its own write", async () => {
		const { service, fs, state, subscription } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);

		const projectionPath = `${SYNC_ROOT}/WS/activity-log.md`;
		let releaseWrite!: () => void;
		const writePaused = new Promise<void>((resolve) => {
			releaseWrite = resolve;
		});
		let projectionWritten!: () => void;
		const sawProjectionWrite = new Promise<void>((resolve) => {
			projectionWritten = resolve;
		});
		const originalWriteFile = fs.writeFile.bind(fs);
		fs.writeFile = async (path, content) => {
			await originalWriteFile(path, content);
			if (path === projectionPath) {
				projectionWritten();
				await writePaused;
			}
		};

		state.docs = [
			doc1(),
			doc1({
				_id: "d_activity",
				title: "Brain Activity Log",
				path: "WS/activity-log.md",
				markdown: "activity",
			}),
		];
		subscription.callback?.();
		await sawProjectionWrite;

		let eventHandled = false;
		const event = service
			.handleRawEvent({
				type: "add",
				absPath: projectionPath,
				hash: await contentHash("activity"),
				inode: 111,
				at: NOW,
			})
			.then(() => {
				eventHandled = true;
			});
		await Promise.resolve();
		expect(eventHandled).toBe(false);

		releaseWrite();
		await event;

		expect(service.lookup(projectionPath)?.documentId).toBe("d_activity");
		expect(calls.import).toEqual([]);
	});

	it("create: imports new files with workspace-relative cloud paths", async () => {
		const { service, fs } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);

		const path = `${SYNC_ROOT}/WS/New.md`;
		await fs.writeFile(path, "new document");
		await service.handleRawEvent({
			type: "add",
			absPath: path,
			hash: await contentHash("new document"),
			inode: 222,
			at: NOW,
		});

		expect(calls.import).toEqual([
			{
				workspaceId: "ws",
				path: "New.md",
				title: "New",
				markdown: "new document",
			},
		]);
		expect(service.lookup(path)?.documentId).toBe("d_new");
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
		const { service, fs } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);
		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);

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

	it("rename: unlink + correlated add prepares one atomic relocation", async () => {
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

		expect(calls.prepareRelocation).toEqual([
			{
				documentId: "d1",
				folderId: null,
				title: "Renamed",
				path: "Renamed.md",
			},
		]);
		expect(calls.rename).toEqual([]);
		expect(events).toContainEqual({ kind: "renamed" });
	});

	it("move stores a workspace-relative document path", async () => {
		const { service } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);

		await service.handleRawEvent({
			type: "unlink",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			at: NOW,
		});
		await service.handleRawEvent({
			type: "add",
			absPath: `${SYNC_ROOT}/WS/Specs/Doc.md`,
			inode: 111,
			at: NOW + 100,
		});

		expect(calls.prepareRelocation).toEqual([
			{
				documentId: "d1",
				folderId: "f_specs",
				title: "Doc",
				path: "Specs/Doc.md",
			},
		]);
		expect(events).toContainEqual({ kind: "moved" });
	});

	it("consequential rename is journaled before review without a cloud move", async () => {
		const { service, fs, state, subscription } = makeService(calls, events, {
			relocationResult: {
				status: "confirmation-required",
				fingerprint: "impact-v1",
				impact: {
					gainingUserCount: 1,
					losingUserCount: 0,
					publicAccessChanged: false,
					repoExposureChanged: true,
				},
			},
		});
		await service.connect(CONNECT_INPUT);
		await fs.writeFile(`${SYNC_ROOT}/WS/Renamed.md`, "hello");
		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);

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

		const manifest = JSON.parse(await fs.readFile(OPERATIONS_MANIFEST));
		expect(manifest.operations[0]).toMatchObject({
			kind: "consequential-move",
			documentId: "d1",
			path: `${SYNC_ROOT}/WS/Doc.md`,
			toPath: `${SYNC_ROOT}/WS/Renamed.md`,
			fingerprint: "impact-v1",
		});
		expect(service.getStatus()).toMatchObject({
			state: "pending-review",
			pendingOperationCount: 1,
		});
		expect(events).toContainEqual({
			kind: "move-review-required",
			operationId: manifest.operations[0].id,
		});
		expect(calls.rename).toEqual([]);
		expect(calls.move).toEqual([]);

		state.docs = [doc1({ markdown: "cloud update", version: 4 })];
		subscription.callback?.();
		await waitForCloudMaterialize();
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Renamed.md`)).toBe("hello");
		expect(await fs.readFileOrNull(`${SYNC_ROOT}/WS/Doc.md`)).toBeNull();

		await fs.writeFile(`${SYNC_ROOT}/WS/Renamed.md`, "edited while pending");
		await service.handleRawEvent({
			type: "change",
			absPath: `${SYNC_ROOT}/WS/Renamed.md`,
			hash: await contentHash("edited while pending"),
			inode: 111,
			at: NOW + 200,
		});
		const refreshed = JSON.parse(await fs.readFile(OPERATIONS_MANIFEST));
		expect(refreshed.operations[0].latestHash).toBe(
			await contentHash("hello world"),
		);
	});

	it("cancelling a consequential move restores edits made during review", async () => {
		const { service, fs } = makeService(calls, events, {
			relocationResult: {
				status: "confirmation-required",
				fingerprint: "impact-v1",
				impact: {
					gainingUserCount: 1,
					losingUserCount: 0,
					publicAccessChanged: false,
					repoExposureChanged: true,
				},
			},
		});
		await service.connect(CONNECT_INPUT);
		await fs.writeFile(`${SYNC_ROOT}/WS/Renamed.md`, "edited during review");
		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);
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

		const [operation] = await service.listPendingOperations();
		expect(operation?.kind).toBe("consequential-move");
		const result = await service.cancelPendingMove(operation?.id ?? "missing");

		expect(result).toEqual({ status: "cancelled" });
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe(
			"edited during review",
		);
		expect(await fs.readFileOrNull(`${SYNC_ROOT}/WS/Renamed.md`)).toBeNull();
		expect(await service.listPendingOperations()).toEqual([]);
	});

	it("cancelling into an occupied source preserves both files for recovery", async () => {
		const { service, fs } = makeService(calls, events, {
			relocationResult: {
				status: "confirmation-required",
				fingerprint: "impact-v1",
				impact: {
					gainingUserCount: 1,
					losingUserCount: 0,
					publicAccessChanged: false,
					repoExposureChanged: true,
				},
			},
		});
		await service.connect(CONNECT_INPUT);
		await fs.writeFile(`${SYNC_ROOT}/WS/Renamed.md`, "pending bytes");
		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);
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
		const [operation] = await service.listPendingOperations();
		await fs.writeFile(`${SYNC_ROOT}/WS/Doc.md`, "occupying bytes");

		expect(await service.cancelPendingMove(operation?.id ?? "missing")).toEqual(
			{ status: "collision" },
		);
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe("occupying bytes");
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Renamed.md`)).toBe(
			"pending bytes",
		);
		expect(await service.listPendingOperations()).toContainEqual(
			expect.objectContaining({ kind: "path-collision" }),
		);
	});

	it("approval refreshes stale impact and keeps the move pending", async () => {
		const { service, fs, state } = makeService(calls, events, {
			relocationResult: {
				status: "confirmation-required",
				fingerprint: "impact-v1",
				impact: {
					gainingUserCount: 1,
					losingUserCount: 0,
					publicAccessChanged: false,
					repoExposureChanged: false,
				},
			},
		});
		await service.connect(CONNECT_INPUT);
		await fs.writeFile(`${SYNC_ROOT}/WS/Renamed.md`, "hello");
		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);
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
		const [operation] = await service.listPendingOperations();
		state.relocationResult = {
			status: "confirmation-required",
			fingerprint: "impact-v2",
			impact: {
				gainingUserCount: 2,
				losingUserCount: 1,
				publicAccessChanged: true,
				repoExposureChanged: true,
			},
		};

		const result = await service.approvePendingMove(operation?.id ?? "missing");
		expect(result).toMatchObject({ status: "refreshed" });
		expect(calls.confirmRelocation).toEqual([
			{
				documentId: "d1",
				folderId: null,
				title: "Renamed",
				path: "Renamed.md",
				fingerprint: "impact-v1",
			},
		]);
		expect(await service.listPendingOperations()).toContainEqual(
			expect.objectContaining({ fingerprint: "impact-v2" }),
		);
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
				path: "New.md",
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
		let offline = false;
		const { service, fs, state } = makeService(
			calls,
			events,
			{},
			{ isOffline: () => offline },
		);
		await service.connect(CONNECT_INPUT);
		offline = true;

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

	it("startup drift: reconciles an edit made while the app was quit before materialize", async () => {
		const { service, fs, state } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);
		await service.disconnect();

		await fs.writeFile(`${SYNC_ROOT}/WS/Doc.md`, "hello while quit");
		state.docs = [doc1({ markdown: "cloud concurrently changed", version: 4 })];
		const status = await service.connect(CONNECT_INPUT);

		expect(calls.patch).toEqual([{ documentId: "d1" }]);
		expect(status.state).toBe("connected");
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe("hello world");
		expect(events).toContainEqual({ kind: "reconciled" });
	});

	it("startup drift: a missing managed file pauses materialize without recreating it", async () => {
		const { service, fs, state } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);
		await service.disconnect();

		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);
		state.docs = [
			doc1({ markdown: "cloud must not recreate this", version: 4 }),
		];
		const status = await service.connect(CONNECT_INPUT);

		expect(status.state).toBe("pending-review");
		expect(status.lastError).toContain("pending filesystem operation");
		expect(status.pendingOperationCount).toBe(1);
		expect(await fs.readFileOrNull(`${SYNC_ROOT}/WS/Doc.md`)).toBeNull();
		expect(JSON.parse(await fs.readFile(OPERATIONS_MANIFEST))).toMatchObject({
			version: 1,
			operations: [{ kind: "missing-document", documentId: "d1" }],
		});
		expect(calls.patch).toEqual([]);
	});

	it("startup drift: journals an unambiguous quit-time rename without applying it", async () => {
		const inodeByPath = new Map<string, number>();
		const { service, fs } = makeService(
			calls,
			events,
			{},
			{ statInode: (path) => inodeByPath.get(path) ?? null },
		);
		inodeByPath.set(`${SYNC_ROOT}/WS/Doc.md`, 111);
		await service.connect(CONNECT_INPUT);
		await service.disconnect();

		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);
		await fs.writeFile(`${SYNC_ROOT}/WS/Renamed.md`, "hello world");
		inodeByPath.set(`${SYNC_ROOT}/WS/Renamed.md`, 111);
		const status = await service.connect(CONNECT_INPUT);

		expect(status.state).toBe("pending-review");
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Renamed.md`)).toBe("hello world");
		expect(await fs.readFileOrNull(`${SYNC_ROOT}/WS/Doc.md`)).toBeNull();
		expect(JSON.parse(await fs.readFile(OPERATIONS_MANIFEST))).toMatchObject({
			operations: [
				{
					kind: "startup-move",
					documentId: "d1",
					path: `${SYNC_ROOT}/WS/Doc.md`,
					toPath: `${SYNC_ROOT}/WS/Renamed.md`,
					matchedBy: "inode",
				},
			],
		});
		expect(calls.rename).toEqual([]);
	});

	it("startup projection plan: an untracked cloud-path collision pauses before materialize", async () => {
		const { service, fs } = makeService(calls, events);
		await fs.writeFile(`${SYNC_ROOT}/WS/Doc.md`, "local untracked bytes");

		const status = await service.connect(CONNECT_INPUT);

		expect(status.state).toBe("pending-review");
		expect(status.lastError).toContain("untracked Markdown path collision");
		expect(status.pendingOperationCount).toBe(1);
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe(
			"local untracked bytes",
		);
		expect(JSON.parse(await fs.readFile(OPERATIONS_MANIFEST))).toMatchObject({
			version: 1,
			operations: [{ kind: "path-collision", documentId: "d1" }],
		});
		expect(
			await fs.readFileOrNull(`${SYNC_ROOT}/.hubble/index/synced-folder.json`),
		).toBeNull();

		await service.disconnect();
		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);
		const recovered = await service.connect(CONNECT_INPUT);
		expect(recovered.state).toBe("connected");
		expect(recovered.pendingOperationCount).toBe(0);
		expect(JSON.parse(await fs.readFile(OPERATIONS_MANIFEST))).toMatchObject({
			version: 1,
			operations: [],
		});
	});

	it("guarded materialize: journals a destination changed after planning without overwriting it", async () => {
		const { service, fs } = makeService(
			calls,
			events,
			{},
			{
				onGetLiveDocuments(call, memory) {
					if (call === 2) {
						memory.__files.set(`${SYNC_ROOT}/WS/Doc.md`, "late local edit");
					}
				},
			},
		);

		const status = await service.connect(CONNECT_INPUT);

		expect(status.state).toBe("pending-review");
		expect(status.lastError).toContain("changed after startup verification");
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe("late local edit");
		expect(JSON.parse(await fs.readFile(OPERATIONS_MANIFEST))).toMatchObject({
			operations: [{ kind: "guard-conflict", documentId: "d1" }],
		});
	});

	it("offline queue: keeps a failed replay on disk and skips materialize", async () => {
		let offline = false;
		const { service, fs, state } = makeService(
			calls,
			events,
			{},
			{ isOffline: () => offline },
		);
		await service.connect(CONNECT_INPUT);
		offline = true;

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

	it("offline launch: persists pending verification and never reads cloud state", async () => {
		const { service, fs } = makeService(
			calls,
			events,
			{},
			{ isOffline: () => true },
		);
		await fs.writeFile(`${SYNC_ROOT}/WS/Doc.md`, "local bytes");
		await fs.writeFile(
			OPERATIONS_MANIFEST,
			JSON.stringify({
				version: 1,
				operations: [
					{
						kind: "deletion-review",
						documentId: "d1",
						workspaceId: "ws",
						folderId: null,
						path: `${SYNC_ROOT}/WS/Doc.md`,
						reason: "offline",
						items: [
							{
								documentId: "d1",
								workspaceId: "ws",
								folderId: null,
								path: `${SYNC_ROOT}/WS/Doc.md`,
								role: "editor",
							},
						],
						id: "op_offline-review",
						state: "pending",
						createdAt: NOW,
						updatedAt: NOW,
					},
				],
			}),
		);

		const status = await service.connect(CONNECT_INPUT);

		expect(status).toMatchObject({
			state: "offline",
			verificationReason: "offline",
			pendingOperationCount: 1,
		});
		expect(await service.listPendingOperations()).toHaveLength(1);
		expect(calls.getLiveDocuments).toBe(0);
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe("local bytes");
		expect(
			JSON.parse(
				await fs.readFile(`${SYNC_ROOT}/.hubble/index/synced-folder.json`),
			),
		).toMatchObject({
			version: 2,
			mount: { kind: "workspace-mirror" },
			verification: { state: "pending", reason: "offline" },
		});
	});

	it("access verification failure: preserves local bytes and reports review state", async () => {
		const { service, fs } = makeService(
			calls,
			events,
			{},
			{
				onGetLiveDocuments() {
					throw new Error("permission denied");
				},
			},
		);
		await fs.writeFile(`${SYNC_ROOT}/WS/Doc.md`, "local bytes");

		const status = await service.connect(CONNECT_INPUT);

		expect(status).toMatchObject({
			state: "pending-review",
			verificationReason: "access",
		});
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe("local bytes");
		expect(
			JSON.parse(
				await fs.readFile(`${SYNC_ROOT}/.hubble/index/synced-folder.json`),
			),
		).toMatchObject({
			verification: { state: "pending", reason: "access" },
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
		const { service, fs } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);
		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);

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
		expect(events).toContainEqual({
			kind: "trashed-local",
			operationId: expect.any(String),
		});
		const undo = (await service.listPendingOperations()).find(
			(operation) => operation.kind === "trash-undo",
		);
		expect(undo).toMatchObject({
			phase: "undo-available",
			path: `${SYNC_ROOT}/WS/Doc.md`,
		});
		if (!undo) throw new Error("Expected durable Trash undo");
		expect(await service.undoTrashedDocument(undo.id)).toEqual({
			status: "restored",
		});
		expect(calls.restore).toEqual([{ documentId: "d1" }]);
		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe("hello");
	});

	it("rapid deletion burst creates one durable review without cloud Trash", async () => {
		const { service, fs } = makeService(calls, events, {
			docs: [doc1(), doc1({ _id: "d2", path: "WS/Other.md", title: "Other" })],
		});
		await service.connect(CONNECT_INPUT);
		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);
		await fs.deleteFile(`${SYNC_ROOT}/WS/Other.md`);
		await service.handleRawEvent({
			type: "unlink",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			at: NOW,
		});
		await service.handleRawEvent({
			type: "unlink",
			absPath: `${SYNC_ROOT}/WS/Other.md`,
			at: NOW + 10,
		});
		await service.flushHeldUnlinks(NOW + 5_000);

		expect(calls.remove).toEqual([]);
		expect(await service.listPendingOperations()).toContainEqual(
			expect.objectContaining({
				kind: "deletion-review",
				reason: "bulk",
				items: expect.arrayContaining([
					expect.objectContaining({ documentId: "d1" }),
					expect.objectContaining({ documentId: "d2" }),
				]),
			}),
		);
		expect(service.getStatus()).toMatchObject({
			state: "pending-review",
			pendingOperationCount: 1,
		});
	});

	it("approved deletion batches are bounded to 25 documents", async () => {
		const docs = Array.from({ length: 26 }, (_, index) =>
			doc1({
				_id: `d${index + 1}`,
				path: `WS/Doc ${index + 1}.md`,
				title: `Doc ${index + 1}`,
			}),
		);
		const { service, fs } = makeService(calls, events, { docs });
		await service.connect(CONNECT_INPUT);
		for (let index = 0; index < docs.length; index += 1) {
			const path = `${SYNC_ROOT}/WS/Doc ${index + 1}.md`;
			await fs.deleteFile(path);
			await service.handleRawEvent({ type: "unlink", absPath: path, at: NOW });
		}
		await service.flushHeldUnlinks(NOW + 5_000);
		const review = (await service.listPendingOperations()).find(
			(operation) => operation.kind === "deletion-review",
		);
		if (!review) throw new Error("Expected bulk deletion review");

		expect(await service.approvePendingDeletion(review.id)).toEqual({
			processed: 25,
			remaining: 1,
		});
		expect(calls.remove).toHaveLength(25);
		expect(await service.listPendingOperations()).toContainEqual(
			expect.objectContaining({
				kind: "deletion-review",
				items: [expect.objectContaining({ documentId: "d26" })],
			}),
		);
	});

	it("read-only deletion remains pending and never reaches cloud Trash", async () => {
		const { service, fs } = makeService(calls, events, {
			docs: [doc1({ role: "viewer", canWrite: false })],
		});
		await service.connect(CONNECT_INPUT);
		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);
		await service.handleRawEvent({
			type: "unlink",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			at: NOW,
		});
		await service.flushHeldUnlinks(NOW + 5_000);

		expect(calls.remove).toEqual([]);
		expect(await service.listPendingOperations()).toContainEqual(
			expect.objectContaining({ kind: "deletion-review", reason: "read-only" }),
		);
	});

	it("offline deletion is journaled instead of replayed as cloud Trash", async () => {
		let offline = false;
		const { service, fs } = makeService(
			calls,
			events,
			{
				docs: [
					doc1(),
					doc1({ _id: "d2", path: "WS/Other.md", title: "Other" }),
				],
			},
			{ isOffline: () => offline },
		);
		await service.connect(CONNECT_INPUT);
		offline = true;
		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);
		await fs.deleteFile(`${SYNC_ROOT}/WS/Other.md`);
		await Promise.all([
			service.handleRawEvent({
				type: "unlink",
				absPath: `${SYNC_ROOT}/WS/Doc.md`,
				at: NOW,
			}),
			service.handleRawEvent({
				type: "unlink",
				absPath: `${SYNC_ROOT}/WS/Other.md`,
				at: NOW + 10,
			}),
		]);

		expect(calls.remove).toEqual([]);
		const operations = await service.listPendingOperations();
		expect(operations).toHaveLength(1);
		expect(operations).toContainEqual(
			expect.objectContaining({
				kind: "deletion-review",
				reason: "offline",
				items: expect.arrayContaining([
					expect.objectContaining({ documentId: "d1" }),
					expect.objectContaining({ documentId: "d2" }),
				]),
			}),
		);
		expect(service.getStatus()).toMatchObject({ state: "pending-review" });

		offline = false;
		await service.connect(CONNECT_INPUT);
		const persisted = (await service.listPendingOperations()).find(
			(operation) => operation.kind === "deletion-review",
		);
		if (!persisted) throw new Error("Expected persisted offline review");
		await service.approvePendingDeletion(persisted.id);
		expect(calls.remove).toEqual([{ documentId: "d1" }, { documentId: "d2" }]);
		expect(service.getStatus()).toMatchObject({
			state: "connected",
			lastError: null,
		});
		expect(await service.listPendingOperations()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "trash-undo",
					phase: "undo-available",
				}),
			]),
		);
	});

	it("a missing projection root never becomes cloud Trash", async () => {
		const { service, fs } = makeService(
			calls,
			events,
			{},
			{
				isPathAvailable: () => false,
			},
		);
		await service.connect(CONNECT_INPUT);
		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);
		await service.handleRawEvent({
			type: "unlink",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			at: NOW,
		});
		await service.flushHeldUnlinks(NOW + 5_000);

		expect(calls.remove).toEqual([]);
		expect(await service.listPendingOperations()).toContainEqual(
			expect.objectContaining({ kind: "deletion-review", reason: "root" }),
		);
	});

	it("an inaccessible document parent never becomes cloud Trash", async () => {
		const { service, fs } = makeService(
			calls,
			events,
			{},
			{
				isPathAvailable: (path) => path === SYNC_ROOT,
			},
		);
		await service.connect(CONNECT_INPUT);
		await fs.deleteFile(`${SYNC_ROOT}/WS/Doc.md`);
		await service.handleRawEvent({
			type: "unlink",
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			at: NOW,
		});
		await service.flushHeldUnlinks(NOW + 5_000);

		expect(calls.remove).toEqual([]);
		expect(await service.listPendingOperations()).toContainEqual(
			expect.objectContaining({ kind: "deletion-review", reason: "storage" }),
		);
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

	it("remote Trash removes a clean copy and remote restore preserves a path collision", async () => {
		const { service, fs, state } = makeService(calls, events);
		await service.connect(CONNECT_INPUT);

		state.trashState = "trashed";
		state.docs = state.docs.map((document) => ({
			...document,
			deletedAt: NOW,
		}));
		await service.refresh();

		expect(await fs.readFileOrNull(`${SYNC_ROOT}/WS/Doc.md`)).toBeNull();
		expect(findPath(fs, /\/\.hubble\/trash\/d1__Doc\.md$/)).toBeUndefined();
		expect(events).toContainEqual({ kind: "removed-remote-trash" });

		await fs.writeFile(`${SYNC_ROOT}/WS/Doc.md`, "untracked local version");
		state.trashState = "active";
		state.docs = state.docs.map((document) => ({
			...document,
			deletedAt: undefined,
		}));
		await service.refresh();

		expect(await fs.readFile(`${SYNC_ROOT}/WS/Doc.md`)).toBe(
			"untracked local version",
		);
		expect(await service.listPendingOperations()).toContainEqual(
			expect.objectContaining({
				kind: "path-collision",
				documentId: "d1",
			}),
		);
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
		const backend = fakeBackend(calls, {
			docs: [doc1()],
			canWrite: true,
			shared: { folders: [], documents: [] },
			subtreeDocs: {},
		});
		const service = new SyncedFolderService({
			scope: { kind: "all-accessible" },
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

	// ── RB4: shared-subtree materialization + revocation cleanup ──────────────

	function sharedSubtreeFixture(): SharedWithMe {
		const docs: SharedSubtreeDocument[] = [
			{
				_id: "sd_root",
				workspaceId: "ws_x",
				workspaceName: "Acme",
				folderId: "f_root",
				title: "Overview",
				path: null,
				markdown: "# Overview\n",
				version: 1,
				role: "editor",
				canWrite: true,
				updatedAt: 0,
				relativePath: "",
			},
			{
				_id: "sd_nested",
				workspaceId: "ws_x",
				workspaceName: "Acme",
				folderId: "f_child",
				title: "Deep Doc",
				path: null,
				markdown: "# Deep\n",
				version: 1,
				role: "viewer",
				canWrite: false,
				updatedAt: 0,
				relativePath: "Child",
			},
		];
		return {
			folders: [
				{
					folderId: "f_root",
					name: "Strategy",
					workspaceId: "ws_x",
					workspaceName: "Acme",
					parentId: null,
					role: "editor",
					repoName: null,
					repoRemoteUrl: null,
					folders: [
						{
							_id: "f_child",
							name: "Child",
							parentId: "f_root",
							relativePath: "Child",
						},
					],
					documents: docs,
				},
			],
			documents: [],
		};
	}

	it("RB4: materializes a shared folder subtree with real nesting and role chmod", async () => {
		const roCalls: Array<{ path: string; ro: boolean }> = [];
		const { service, fs } = makeService(calls, events, {
			shared: sharedSubtreeFixture(),
		});
		const origSetReadOnly = fs.setReadOnly?.bind(fs);
		fs.setReadOnly = async (path, ro) => {
			roCalls.push({ path, ro });
			await origSetReadOnly?.(path, ro);
		};
		await service.connect(CONNECT_INPUT);

		const rootDoc = `${SYNC_ROOT}/Shared with me/Acme - Strategy/Overview.md`;
		const nestedDoc = `${SYNC_ROOT}/Shared with me/Acme - Strategy/Child/Deep Doc.md`;
		expect(await fs.readFile(rootDoc)).toBe("# Overview\n");
		expect(await fs.readFile(nestedDoc)).toBe("# Deep\n");
		// Indexed by documentId with folderId retained.
		expect(service.lookup(rootDoc)?.documentId).toBe("sd_root");
		expect(service.lookup(nestedDoc)).toMatchObject({
			documentId: "sd_nested",
			folderId: "f_child",
			role: "viewer",
		});
		// Role chmod: viewer → read-only, editor → writable.
		expect(roCalls).toContainEqual({ path: nestedDoc, ro: true });
		expect(roCalls).toContainEqual({ path: rootDoc, ro: false });
		// Base cache exists for reconcile.
		expect(
			await fs.readFileOrNull(
				`${SYNC_ROOT}/.hubble/state/live-documents/sd_root.base.md`,
			),
		).toBe("# Overview\n");
	});

	it("RB4: a cloud rename inside the subtree re-points the path without trashing", async () => {
		const { service, fs, state, subscription } = makeService(calls, events, {
			shared: sharedSubtreeFixture(),
		});
		await service.connect(CONNECT_INPUT);

		// Rename "Deep Doc" → "Deeper Doc" in the cloud (same documentId).
		const next = sharedSubtreeFixture();
		const nested = next.folders[0].documents[1];
		nested.title = "Deeper Doc";
		state.shared = next;
		subscription.callback?.();
		await waitForCloudMaterialize();

		const oldPath = `${SYNC_ROOT}/Shared with me/Acme - Strategy/Child/Deep Doc.md`;
		const newPath = `${SYNC_ROOT}/Shared with me/Acme - Strategy/Child/Deeper Doc.md`;
		expect(await fs.readFileOrNull(oldPath)).toBeNull();
		expect(await fs.readFile(newPath)).toBe("# Deep\n");
		expect(service.lookup(newPath)?.documentId).toBe("sd_nested");
		// Not access loss: no trash copy, no cloud delete, no removed-access.
		expect(findPath(fs, /\/\.hubble\/trash\/sd_nested__/)).toBeUndefined();
		expect(calls.remove).toEqual([]);
		expect(events).not.toContainEqual({ kind: "removed-access" });
	});

	it("RB4: revoking a shared folder trashes the whole subtree but keeps backstop files", async () => {
		const { service, fs, state } = makeService(calls, events, {
			shared: sharedSubtreeFixture(),
		});
		await service.connect(CONNECT_INPUT);

		// A conflict backstop sibling (user data) sits inside the subtree.
		const backstop = `${SYNC_ROOT}/Shared with me/Acme - Strategy/Overview.local-edit-20260703.md`;
		await fs.writeFile(backstop, "my unsaved bytes");

		// Owner revokes the folder share → subtree leaves the desired set.
		state.shared = { folders: [], documents: [] };
		await service.refresh();

		// Whole subtree projection removed → trash, never cloud-deleted.
		expect(
			await fs.readFileOrNull(
				`${SYNC_ROOT}/Shared with me/Acme - Strategy/Overview.md`,
			),
		).toBeNull();
		expect(
			await fs.readFileOrNull(
				`${SYNC_ROOT}/Shared with me/Acme - Strategy/Child/Deep Doc.md`,
			),
		).toBeNull();
		expect(
			findPath(fs, /\/\.hubble\/trash\/sd_root__Overview\.md$/),
		).toBeDefined();
		expect(
			findPath(fs, /\/\.hubble\/trash\/sd_nested__Deep Doc\.md$/),
		).toBeDefined();
		expect(calls.remove).toEqual([]);
		expect(events).toContainEqual({ kind: "removed-access" });
		// Backstop files are user data — never touched by revocation cleanup.
		expect(await fs.readFile(backstop)).toBe("my unsaved bytes");
	});

	// ── RB3: repo-link mount (engine-instance-per-mount) ──────────────────────

	it("RB3: a mount engine materializes exactly the linked folder subtree at its root", async () => {
		const subtree: SharedSubtreeDocument[] = [
			{
				_id: "md_brain",
				workspaceId: "ws_x",
				workspaceName: "Acme",
				folderId: "f_link",
				title: "BRAIN",
				path: "BRAIN.md",
				markdown: "# BRAIN.md\n",
				version: 1,
				role: "owner",
				canWrite: true,
				updatedAt: 0,
				relativePath: "",
			},
			{
				_id: "md_nested",
				workspaceId: "ws_x",
				workspaceName: "Acme",
				folderId: "f_link_sub",
				title: "Notes",
				path: null,
				markdown: "# Notes\n",
				version: 1,
				role: "owner",
				canWrite: true,
				updatedAt: 0,
				relativePath: "Research",
			},
		];
		const { service, fs } = makeService(
			calls,
			events,
			{ subtreeDocs: { f_link: subtree } },
			{
				scope: {
					kind: "folder",
					workspaceId: "ws_x",
					folderId: "f_link",
				},
			},
		);
		await service.connect(CONNECT_INPUT);

		// Docs land at their subtree-relative paths directly under the mount root
		// (no workspace/"Shared with me" wrapper).
		expect(await fs.readFile(`${SYNC_ROOT}/BRAIN.md`)).toBe("# BRAIN.md\n");
		expect(await fs.readFile(`${SYNC_ROOT}/Research/Notes.md`)).toBe(
			"# Notes\n",
		);
		expect(service.lookup(`${SYNC_ROOT}/BRAIN.md`)?.documentId).toBe(
			"md_brain",
		);
		// The whole-workspace query path is not used by a mount engine.
		expect(calls.getLiveDocuments).toBe(0);
	});

	it("RB3: a mount relocation keeps its full subtree-relative path", async () => {
		const subtree: SharedSubtreeDocument[] = [
			{
				_id: "md_brain",
				workspaceId: "ws_x",
				workspaceName: "Acme",
				folderId: "f_link",
				title: "BRAIN",
				path: "BRAIN.md",
				markdown: "# BRAIN.md\n",
				version: 1,
				role: "owner",
				canWrite: true,
				updatedAt: 0,
				relativePath: "",
			},
			{
				_id: "md_nested",
				workspaceId: "ws_x",
				workspaceName: "Acme",
				folderId: "f_link_sub",
				title: "Notes",
				path: "Research/Notes.md",
				markdown: "# Notes\n",
				version: 1,
				role: "owner",
				canWrite: true,
				updatedAt: 0,
				relativePath: "Research",
			},
		];
		const { service } = makeService(
			calls,
			events,
			{ subtreeDocs: { f_link: subtree } },
			{
				scope: {
					kind: "folder",
					workspaceId: "ws_x",
					folderId: "f_link",
				},
			},
		);
		await service.connect(CONNECT_INPUT);

		await service.handleRawEvent({
			type: "unlink",
			absPath: `${SYNC_ROOT}/BRAIN.md`,
			at: NOW,
		});
		await service.handleRawEvent({
			type: "add",
			absPath: `${SYNC_ROOT}/Research/BRAIN.md`,
			inode: 111,
			at: NOW + 100,
		});

		expect(calls.prepareRelocation).toEqual([
			{
				documentId: "md_brain",
				folderId: "f_link_sub",
				title: "BRAIN",
				path: "Research/BRAIN.md",
			},
		]);
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
