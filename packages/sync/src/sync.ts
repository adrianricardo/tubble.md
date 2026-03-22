import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import {
	generateDeviceId,
	isInitialized,
	readConfig,
	readSyncState,
	writeConfig,
	writeSyncState,
} from "./config";
import { scanWorkspace } from "./scan";
import type { Id } from "../convex/_generated/dataModel";
import type {
	FileState,
	RemoteFile,
	SyncResult,
	WorkspaceConfig,
} from "./types";

/** Initialize a workspace for syncing. Creates .hubble/ config. */
export async function init(opts: {
	workspacePath: string;
	workspaceName: string;
	convexUrl: string;
}): Promise<WorkspaceConfig> {
	if (isInitialized(opts.workspacePath)) {
		return readConfig(opts.workspacePath);
	}

	const client = new ConvexHttpClient(opts.convexUrl);
	const existing = await client.query(api.sync.getWorkspace, {
		name: opts.workspaceName,
	});
	const workspaceId = existing
		? existing._id
		: await client.mutation(api.sync.createWorkspace, {
				name: opts.workspaceName,
			});

	const config: WorkspaceConfig = {
		workspaceId: workspaceId as string,
		workspaceName: opts.workspaceName,
		deviceId: generateDeviceId(),
		convexUrl: opts.convexUrl,
	};
	writeConfig(opts.workspacePath, config);
	writeSyncState(opts.workspacePath, { lastSyncedAt: 0, files: {} });
	return config;
}

/** Run a full sync: push local changes, pull remote changes, detect conflicts. */
export async function sync(workspacePath: string): Promise<SyncResult> {
	const config = readConfig(workspacePath);
	const state = readSyncState(workspacePath);
	const client = new ConvexHttpClient(config.convexUrl);

	const localFiles = scanWorkspace(workspacePath);
	const localByPath = new Map(localFiles.map((f) => [f.relativePath, f]));

	const workspaceId = config.workspaceId as Id<"workspaces">;
	const remoteFiles = (await client.query(api.sync.getFilesByWorkspace, {
		workspaceId,
		since: state.lastSyncedAt > 0 ? state.lastSyncedAt : undefined,
	})) as RemoteFile[];
	const remoteByPath = new Map(remoteFiles.map((f) => [f.path, f]));

	const result: SyncResult = {
		pushed: [],
		pulled: [],
		conflicts: [],
		unchanged: 0,
	};
	const nextFiles: Record<string, FileState> = { ...state.files };
	const now = Date.now();

	// Push: local files that changed since last sync
	for (const local of localFiles) {
		const prev = state.files[local.relativePath];
		const remote = remoteByPath.get(local.relativePath);
        // Local differs from what has been synced, as recorded in the state file
		const localChanged = !prev || prev.hash !== local.hash;

		if (!localChanged && !remote) {
			result.unchanged++;
			continue;
		}

		if (localChanged && remote && remote.contentHash !== local.hash) {
			// Both changed with different content → conflict
			const conflictName = toConflictName(local.relativePath);
			writeFileSync(join(workspacePath, conflictName), local.content);
			// Pull remote as primary
			writeFileSync(join(workspacePath, local.relativePath), remote.content);
			nextFiles[local.relativePath] = {
				hash: remote.contentHash,
				lastSyncedAt: now,
			};
			result.conflicts.push(local.relativePath);
			continue;
		}

		if (localChanged) {
			// TODO: batch into a single pushFiles mutation to avoid sequential round trips
			await client.mutation(api.sync.pushFile, {
				workspaceId,
				path: local.relativePath,
				contentHash: local.hash,
				content: local.content,
				deviceId: config.deviceId,
			});
			nextFiles[local.relativePath] = {
				hash: local.hash,
				lastSyncedAt: now,
			};
			result.pushed.push(local.relativePath);
			continue;
		}

		result.unchanged++;
	}

	// Pull: remote files not handled above
	for (const remote of remoteFiles) {
		if (remote.deleted) continue;
		if (localByPath.has(remote.path)) continue; // already handled

		// New file from remote — pull it
		const absPath = join(workspacePath, remote.path);
		mkdirSync(dirname(absPath), { recursive: true });
		writeFileSync(absPath, remote.content);
		nextFiles[remote.path] = {
			hash: remote.contentHash,
			lastSyncedAt: now,
		};
		result.pulled.push(remote.path);
	}

	writeSyncState(workspacePath, { lastSyncedAt: now, files: nextFiles });
	return result;
}

/** Get current sync status without performing a sync. */
export function status(workspacePath: string) {
	if (!isInitialized(workspacePath)) {
		return { initialized: false as const };
	}
	const config = readConfig(workspacePath);
	const state = readSyncState(workspacePath);
	const localFiles = scanWorkspace(workspacePath);

	let pendingChanges = 0;
	for (const f of localFiles) {
		const prev = state.files[f.relativePath];
		if (!prev || prev.hash !== f.hash) pendingChanges++;
	}

	return {
		initialized: true as const,
		workspaceName: config.workspaceName,
		deviceId: config.deviceId,
		lastSyncedAt: state.lastSyncedAt,
		localFiles: localFiles.length,
		trackedFiles: Object.keys(state.files).length,
		pendingChanges,
	};
}

function toConflictName(filePath: string): string {
	const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
	const dot = filePath.lastIndexOf(".");
	if (dot === -1) return `${filePath}.conflict-${ts}`;
	return `${filePath.slice(0, dot)}.conflict-${ts}${filePath.slice(dot)}`;
}
