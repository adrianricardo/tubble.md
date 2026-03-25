import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { ConvexHttpClient } from "convex/browser";
import {
	isInitialized,
	readConfig,
	readSyncState,
	writeConfig,
	writeSyncState,
} from "./config.js";
import type { FileSystem } from "./fs.js";
import type {
	FileState,
	RemoteFile,
	SyncResult,
	WorkspaceConfig,
} from "./types.js";

/** Initialize a workspace for syncing. Creates .hubble/ config. */
export async function init(
	fs: FileSystem,
	opts: {
		workspacePath: string;
		workspaceName: string;
		convexUrl: string;
	},
): Promise<WorkspaceConfig> {
	if (await isInitialized(fs, opts.workspacePath)) {
		return readConfig(fs, opts.workspacePath);
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
		deviceId: crypto.randomUUID(),
		convexUrl: opts.convexUrl,
	};
	await writeConfig(fs, opts.workspacePath, config);
	await writeSyncState(fs, opts.workspacePath, { lastSyncedAt: 0, files: {} });
	return config;
}

/** Run a full sync: push local changes, pull remote changes, detect conflicts. */
export async function sync(
	fs: FileSystem,
	workspacePath: string,
): Promise<SyncResult> {
	const config = await readConfig(fs, workspacePath);
	const state = await readSyncState(fs, workspacePath);
	const client = new ConvexHttpClient(config.convexUrl);
	const workspaceId = config.workspaceId as Id<"workspaces">;

	const localFiles = await fs.listMarkdownFiles(workspacePath);
	const localByPath = new Map(localFiles.map((f) => [f.relativePath, f]));

	const remoteFiles = (await client.query(api.sync.getFilesByWorkspace, {
		workspaceId,
		since: undefined,
	})) as RemoteFile[];
	const remoteByPath = new Map(remoteFiles.map((f) => [f.path, f]));

	const result: SyncResult = {
		pushed: [],
		pulled: [],
		deleted: [],
		conflicts: [],
		unchanged: 0,
	};
	const nextFiles: Record<string, FileState> = { ...state.files };
	const now = Date.now();

	async function pushLocal(path: string, hash: string, content: string) {
		await client.mutation(api.sync.pushFile, {
			workspaceId,
			path,
			contentHash: hash,
			content,
			deviceId: config.deviceId,
		});
		nextFiles[path] = { hash, lastSyncedAt: now };
		result.pushed.push(path);
	}

	async function ensureParentDir(path: string) {
		const slash = path.lastIndexOf("/");
		if (slash > 0)
			await fs.ensureDir(`${workspacePath}/${path.slice(0, slash)}`);
	}

	// --- Process files that exist locally ---
	for (const local of localFiles) {
		const prev = state.files[local.relativePath];
		const remote = remoteByPath.get(local.relativePath);
		const localChanged = !prev || prev.hash !== local.hash;

		// Remote was soft-deleted
		if (remote?.deleted) {
			if (localChanged) {
				await pushLocal(local.relativePath, local.hash, local.content);
			} else {
				await fs.deleteFile(`${workspacePath}/${local.relativePath}`);
				delete nextFiles[local.relativePath];
				result.deleted.push(local.relativePath);
			}
			continue;
		}

		if (!remote) {
			await pushLocal(local.relativePath, local.hash, local.content);
			continue;
		}

		const remoteChanged = !prev || prev.hash !== remote.contentHash;
		const diverged = remoteChanged && remote.contentHash !== local.hash;

		if (diverged && localChanged) {
			const conflictName = toConflictName(local.relativePath);
			await fs.writeFile(`${workspacePath}/${conflictName}`, local.content);
			await fs.writeFile(
				`${workspacePath}/${local.relativePath}`,
				remote.content,
			);
			nextFiles[local.relativePath] = {
				hash: remote.contentHash,
				lastSyncedAt: now,
			};
			result.conflicts.push(local.relativePath);
		} else if (diverged) {
			await fs.writeFile(
				`${workspacePath}/${local.relativePath}`,
				remote.content,
			);
			nextFiles[local.relativePath] = {
				hash: remote.contentHash,
				lastSyncedAt: now,
			};
			result.pulled.push(local.relativePath);
		} else if (localChanged) {
			await pushLocal(local.relativePath, local.hash, local.content);
		} else {
			result.unchanged++;
		}
	}

	// --- Detect local deletions (in state but no longer on disk) ---
	for (const [path, prev] of Object.entries(state.files)) {
		if (localByPath.has(path)) continue; // still on disk, handled above

		const remote = remoteByPath.get(path);
		if (remote && !remote.deleted && remote.contentHash !== prev.hash) {
			// Remote edited since last sync — pull back to preserve others' edits
			await ensureParentDir(path);
			await fs.writeFile(`${workspacePath}/${path}`, remote.content);
			nextFiles[path] = { hash: remote.contentHash, lastSyncedAt: now };
			result.pulled.push(path);
		} else if (remote && !remote.deleted) {
			// Remote unchanged — push tombstone
			await client.mutation(api.sync.softDeleteFile, {
				workspaceId,
				path,
				deviceId: config.deviceId,
			});
			delete nextFiles[path];
			result.deleted.push(path);
		} else {
			// Remote already deleted or doesn't exist — clean state
			delete nextFiles[path];
		}
	}

	// --- Pull new remote files not present locally ---
	for (const remote of remoteFiles) {
		if (remote.deleted) continue;
		if (localByPath.has(remote.path)) continue;
		if (state.files[remote.path]) continue; // local delete, handled above

		await ensureParentDir(remote.path);
		await fs.writeFile(`${workspacePath}/${remote.path}`, remote.content);
		nextFiles[remote.path] = { hash: remote.contentHash, lastSyncedAt: now };
		result.pulled.push(remote.path);
	}

	await writeSyncState(fs, workspacePath, {
		lastSyncedAt: now,
		files: nextFiles,
	});
	return result;
}

/** Get current sync status without performing a sync. */
export async function status(fs: FileSystem, workspacePath: string) {
	if (!(await isInitialized(fs, workspacePath))) {
		return { initialized: false as const };
	}
	const config = await readConfig(fs, workspacePath);
	const state = await readSyncState(fs, workspacePath);
	const localFiles = await fs.listMarkdownFiles(workspacePath);

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
