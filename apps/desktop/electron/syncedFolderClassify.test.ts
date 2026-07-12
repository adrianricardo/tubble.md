/**
 * Pure-classifier + single-writer-lock unit tests (SYNCED-FOLDER §2, §6).
 *
 * No chokidar, Electron, or backend: every case feeds plain inputs to the
 * pure functions in syncedFolderClassify.ts.
 */

import type {
	SyncedFolderIndex,
	SyncedFolderIndexEntry,
} from "@hubble.md/sync";
import { describe, expect, it } from "vitest";
import {
	acquireSingleWriterLock,
	type ClassifyContext,
	classifySyncedFolderChange,
	classifySyncedFolderRoot,
	flushExpiredUnlinks,
	type HeldUnlink,
	heartbeatSingleWriterLock,
	OWNER_LOCK_STALE_MS,
	ownerLockPath,
	type RawWatcherEvent,
	SYNCED_FOLDER_INDEX_REL,
} from "./syncedFolderClassify";

const SYNC_ROOT = "/Hubble";

const DOC: SyncedFolderIndexEntry = {
	documentId: "d1",
	workspaceId: "ws",
	folderId: null,
	inode: 100,
	hash: "hash-doc",
	role: "editor",
};
const SPEC: SyncedFolderIndexEntry = {
	documentId: "d2",
	workspaceId: "ws",
	folderId: "f_specs",
	inode: 200,
	hash: "hash-spec",
	role: "editor",
};

const INDEX: SyncedFolderIndex = {
	[`${SYNC_ROOT}/WS/Doc.md`]: DOC,
	[`${SYNC_ROOT}/WS/Specs/Spec.md`]: SPEC,
};

describe("classifySyncedFolderRoot", () => {
	it("classifies an empty root as safe to connect", () => {
		expect(classifySyncedFolderRoot([])).toEqual({ state: "empty" });
	});

	it("classifies a root with .hubble/index/synced-folder.json as an existing Hubble root", () => {
		expect(
			classifySyncedFolderRoot([".hubble", SYNCED_FOLDER_INDEX_REL]),
		).toEqual({ state: "existing-hubble" });
	});

	it("classifies any non-empty root without the Hubble marker as foreign", () => {
		expect(classifySyncedFolderRoot(["Notes.md"])).toEqual({
			state: "non-empty-foreign",
		});
	});
});

function ctx(overrides: Partial<ClassifyContext> = {}): ClassifyContext {
	return {
		syncRoot: SYNC_ROOT,
		index: INDEX,
		heldUnlinks: [],
		recentlyWrittenByUs: new Map(),
		correlationWindowMs: 750,
		...overrides,
	};
}

function event(
	partial: Partial<RawWatcherEvent> & Pick<RawWatcherEvent, "type" | "absPath">,
): RawWatcherEvent {
	return { at: 1_000, ...partial };
}

describe("classifySyncedFolderChange", () => {
	it("reconcile: change on an indexed path", () => {
		const decision = classifySyncedFolderChange(
			event({ type: "change", absPath: `${SYNC_ROOT}/WS/Doc.md` }),
			ctx(),
		);
		expect(decision).toMatchObject({ kind: "reconcile", documentId: "d1" });
	});

	it("hold then rename: unlink+add correlated by inode in the same dir", () => {
		const held: HeldUnlink = {
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			entry: DOC,
			at: 1_000,
		};
		const decision = classifySyncedFolderChange(
			event({
				type: "add",
				absPath: `${SYNC_ROOT}/WS/Renamed.md`,
				inode: 100,
				at: 1_200,
			}),
			ctx({ heldUnlinks: [held] }),
		);
		expect(decision).toMatchObject({
			kind: "rename",
			documentId: "d1",
			fromPath: `${SYNC_ROOT}/WS/Doc.md`,
			toPath: `${SYNC_ROOT}/WS/Renamed.md`,
		});
	});

	it("move: correlated add lands in a different directory", () => {
		const held: HeldUnlink = {
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			entry: DOC,
			at: 1_000,
		};
		const decision = classifySyncedFolderChange(
			event({
				type: "add",
				absPath: `${SYNC_ROOT}/WS/Specs/Doc.md`,
				// inode null → correlate by hash instead.
				hash: "hash-doc",
				at: 1_300,
			}),
			ctx({ heldUnlinks: [held] }),
		);
		expect(decision).toMatchObject({
			kind: "move",
			documentId: "d1",
			toPath: `${SYNC_ROOT}/WS/Specs/Doc.md`,
		});
	});

	it("create: add with no index hit inside a workspace folder (folderId from sibling)", () => {
		const root = classifySyncedFolderChange(
			event({ type: "add", absPath: `${SYNC_ROOT}/WS/New.md` }),
			ctx(),
		);
		expect(root).toMatchObject({
			kind: "create",
			workspaceId: "ws",
			folderId: null,
			relPath: "WS/New.md",
		});

		const inSpecs = classifySyncedFolderChange(
			event({ type: "add", absPath: `${SYNC_ROOT}/WS/Specs/New.md` }),
			ctx(),
		);
		expect(inSpecs).toMatchObject({
			kind: "create",
			workspaceId: "ws",
			folderId: "f_specs",
		});
	});

	it("create: resolves an empty folder from explicit topology", () => {
		const decision = classifySyncedFolderChange(
			event({ type: "add", absPath: `${SYNC_ROOT}/WS/Empty/New.md` }),
			ctx({
				topology: [
					{
						folderId: "f_empty",
						workspaceId: "ws",
						relativePath: "WS/Empty",
					},
				],
			}),
		);
		expect(decision).toMatchObject({
			kind: "create",
			folderId: "f_empty",
		});
	});

	it("delete: a held unlink past the correlation window flushes to delete", () => {
		const held: HeldUnlink = {
			absPath: `${SYNC_ROOT}/WS/Doc.md`,
			entry: DOC,
			at: 1_000,
		};
		const { expired, remaining } = flushExpiredUnlinks([held], 2_000, 750);
		expect(remaining).toHaveLength(0);
		expect(expired).toEqual([
			{
				kind: "delete",
				documentId: "d1",
				absPath: `${SYNC_ROOT}/WS/Doc.md`,
				entry: DOC,
			},
		]);
	});

	describe("ignore", () => {
		it("ignores the .hubble/** state tree", () => {
			expect(
				classifySyncedFolderChange(
					event({
						type: "change",
						absPath: `${SYNC_ROOT}/.hubble/index/synced-folder.json`,
					}),
					ctx(),
				),
			).toMatchObject({ kind: "ignore" });
		});

		it("ignores dotfiles and non-.md files", () => {
			expect(
				classifySyncedFolderChange(
					event({ type: "add", absPath: `${SYNC_ROOT}/WS/.secret.md` }),
					ctx(),
				),
			).toMatchObject({ kind: "ignore" });
			expect(
				classifySyncedFolderChange(
					event({ type: "add", absPath: `${SYNC_ROOT}/WS/notes.txt` }),
					ctx(),
				),
			).toMatchObject({ kind: "ignore" });
		});

		it("ignores a self-write whose hash matches recentlyWrittenByUs", () => {
			const recent = new Map([
				[`${SYNC_ROOT}/WS/Doc.md`, { hash: "hash-doc" }],
			]);
			expect(
				classifySyncedFolderChange(
					event({
						type: "change",
						absPath: `${SYNC_ROOT}/WS/Doc.md`,
						hash: "hash-doc",
					}),
					ctx({ recentlyWrittenByUs: recent }),
				),
			).toMatchObject({ kind: "ignore", reason: "self-write" });
		});

		it("still reconciles a real edit to a recently-written path (different hash)", () => {
			const recent = new Map([
				[`${SYNC_ROOT}/WS/Doc.md`, { hash: "hash-doc" }],
			]);
			expect(
				classifySyncedFolderChange(
					event({
						type: "change",
						absPath: `${SYNC_ROOT}/WS/Doc.md`,
						hash: "hash-user-edit",
					}),
					ctx({ recentlyWrittenByUs: recent }),
				),
			).toMatchObject({ kind: "reconcile", documentId: "d1" });
		});
	});
});

// ─── Single-writer lock ──────────────────────────────────────────────────────

function lockFs(initial: Record<string, string> = {}) {
	const files = new Map(Object.entries(initial));
	return {
		files,
		async readFileOrNull(path: string) {
			return files.get(path) ?? null;
		},
		async ensureDir() {},
		async writeFile(path: string, content: string) {
			files.set(path, content);
		},
		async deleteFile(path: string) {
			files.delete(path);
		},
	};
}

describe("acquireSingleWriterLock", () => {
	it("acquires when the lock is free", async () => {
		const fs = lockFs();
		const result = await acquireSingleWriterLock(fs, SYNC_ROOT, {
			deviceId: "device-a",
			pid: 1,
			now: 10_000,
		});
		expect(result.acquired).toBe(true);
		expect(
			JSON.parse(fs.files.get(ownerLockPath(SYNC_ROOT)) ?? "{}"),
		).toMatchObject({ deviceId: "device-a" });
	});

	it("refuses when a fresh foreign heartbeat is present", async () => {
		const fs = lockFs({
			[ownerLockPath(SYNC_ROOT)]: JSON.stringify({
				deviceId: "device-b",
				pid: 99,
				heartbeatAt: 10_000,
			}),
		});
		const result = await acquireSingleWriterLock(fs, SYNC_ROOT, {
			deviceId: "device-a",
			pid: 1,
			now: 10_000 + OWNER_LOCK_STALE_MS - 1,
		});
		expect(result.acquired).toBe(false);
		if (!result.acquired) {
			expect(result.reason).toBe("held-by-other");
			expect(result.current.deviceId).toBe("device-b");
		}
	});

	it("reclaims a stale foreign lock", async () => {
		const fs = lockFs({
			[ownerLockPath(SYNC_ROOT)]: JSON.stringify({
				deviceId: "device-b",
				pid: 99,
				heartbeatAt: 10_000,
			}),
		});
		const result = await acquireSingleWriterLock(fs, SYNC_ROOT, {
			deviceId: "device-a",
			pid: 1,
			now: 10_000 + OWNER_LOCK_STALE_MS + 1,
		});
		expect(result.acquired).toBe(true);
		expect(
			JSON.parse(fs.files.get(ownerLockPath(SYNC_ROOT)) ?? "{}"),
		).toMatchObject({ deviceId: "device-a" });
	});
});

describe("heartbeatSingleWriterLock", () => {
	it("refuses to overwrite a fresh foreign heartbeat", async () => {
		const fs = lockFs({
			[ownerLockPath(SYNC_ROOT)]: JSON.stringify({
				deviceId: "device-b",
				pid: 99,
				heartbeatAt: 10_000,
			}),
		});
		const result = await heartbeatSingleWriterLock(fs, SYNC_ROOT, {
			deviceId: "device-a",
			pid: 1,
			now: 10_000 + OWNER_LOCK_STALE_MS - 1,
		});

		expect(result.acquired).toBe(false);
		expect(JSON.parse(fs.files.get(ownerLockPath(SYNC_ROOT)) ?? "{}")).toEqual({
			deviceId: "device-b",
			pid: 99,
			heartbeatAt: 10_000,
		});
	});

	it("reclaims a stale foreign heartbeat", async () => {
		const fs = lockFs({
			[ownerLockPath(SYNC_ROOT)]: JSON.stringify({
				deviceId: "device-b",
				pid: 99,
				heartbeatAt: 10_000,
			}),
		});
		const result = await heartbeatSingleWriterLock(fs, SYNC_ROOT, {
			deviceId: "device-a",
			pid: 1,
			now: 10_000 + OWNER_LOCK_STALE_MS + 1,
		});

		expect(result.acquired).toBe(true);
		expect(
			JSON.parse(fs.files.get(ownerLockPath(SYNC_ROOT)) ?? "{}"),
		).toMatchObject({ deviceId: "device-a" });
	});
});
