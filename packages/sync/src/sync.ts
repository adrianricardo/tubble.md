import type { SyncBackend } from "./backend.js";
import {
	isInitialized,
	readConfig,
	readConfigOrDefault,
	readSyncState,
	writeCloudSyncConfig,
	writeSyncState,
} from "./config.js";
import { contentHash, type FileSystem, type InitFileSystem } from "./fs.js";
import { writeReconcileBase } from "./reconcile.js";
import {
	type SyncedFolderIndex,
	saveSyncedFolderIndex,
} from "./syncedFolderIndex.js";
import type {
	CloudSyncConfig,
	FileState,
	LiveDocumentExportResult,
	LiveDocumentImportResult,
	LiveDocumentProjectionWriteResult,
	RemoteAsset,
	SyncResult,
	WorkspaceConfig,
} from "./types.js";

/** Initialize a workspace for syncing. Creates .hubble/ config. */
export async function init(
	backend: SyncBackend,
	fs: InitFileSystem,
	opts: {
		workspacePath: string;
		workspaceName: string;
		deploymentUrl: string;
		backgroundSync?: boolean;
	},
): Promise<WorkspaceConfig> {
	const existing = await readConfigOrDefault(fs, opts.workspacePath);
	if (existing.cloudSync) return existing;

	const workspaceId =
		(await backend.getWorkspace(opts.workspaceName)) ??
		(await backend.createWorkspace(opts.workspaceName));

	const cloudSync: CloudSyncConfig = {
		provider: "convex",
		deploymentUrl: opts.deploymentUrl,
		workspaceId,
		deviceId: crypto.randomUUID(),
		backgroundSync: opts.backgroundSync ?? false,
	};
	await writeSyncState(fs, opts.workspacePath, { lastSyncedAt: 0, files: {} });
	return writeCloudSyncConfig(fs, opts.workspacePath, cloudSync);
}

/** Run a full sync: push local changes, pull remote changes, detect conflicts. */
export async function sync(
	backend: SyncBackend,
	fs: FileSystem,
	workspacePath: string,
): Promise<SyncResult> {
	const config = await readConfig(fs, workspacePath);
	if (!config.cloudSync) {
		throw new Error(
			`No Cloud Sync config in ${workspacePath}. Run \`hubble cloud connect\` first.`,
		);
	}
	const state = await readSyncState(fs, workspacePath);
	const { workspaceId, deviceId } = config.cloudSync;

	const localFiles = await fs.listMarkdownFiles(workspacePath);
	const localByPath = new Map(localFiles.map((f) => [f.relativePath, f]));

	const remoteFiles = await backend.getFiles(workspaceId, {
		includeDeleted: true,
	});
	const remoteByPath = new Map(remoteFiles.map((f) => [f.path, f]));

	const result: SyncResult = {
		pushed: [],
		pulled: [],
		deleted: [],
		conflicts: [],
		unchanged: 0,
		assetsPushed: 0,
		assetsPulled: 0,
		assetsDeleted: 0,
	};
	const nextFiles: Record<string, FileState> = { ...state.files };
	const now = Date.now();

	async function pushLocal(path: string, hash: string, content: string) {
		await backend.pushFile({
			workspaceId,
			path,
			contentHash: hash,
			content,
			deviceId,
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
			// Only re-push if genuinely modified since last sync.
			// When prev is missing (untracked), honor the tombstone.
			if (prev && prev.hash !== local.hash) {
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
			await backend.softDeleteFile({
				workspaceId,
				path,
				deviceId,
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

	// --- Asset sync ---
	const prevAssets = state.assets ?? {};
	const nextAssets: Record<string, FileState> = { ...prevAssets };

	const localAssets = await fs.listAssetFiles(workspacePath);
	const localAssetByPath = new Map(localAssets.map((a) => [a.relativePath, a]));

	const remoteAssets = await backend.getAssets(workspaceId);
	const remoteAssetByPath = new Map(remoteAssets.map((a) => [a.path, a]));

	async function pushAsset(path: string, hash: string) {
		const uploadUrl = await backend.generateAssetUploadUrl(workspaceId);
		const data = await fs.readBinaryFile(`${workspacePath}/${path}`);
		const res = await fetch(uploadUrl, {
			method: "POST",
			headers: { "Content-Type": "application/octet-stream" },
			body: data,
		});
		const { storageId } = (await res.json()) as { storageId: string };
		await backend.pushAsset({
			workspaceId,
			path,
			storageId,
			contentHash: hash,
			deviceId,
		});
		nextAssets[path] = { hash, lastSyncedAt: now };
		result.assetsPushed++;
	}

	async function pullAsset(remote: RemoteAsset) {
		const url = await backend.getAssetDownloadUrl(remote.storageId);
		if (!url) return;
		const res = await fetch(url);
		const buf = new Uint8Array(await res.arrayBuffer());
		await ensureParentDir(remote.path);
		await fs.writeBinaryFile(`${workspacePath}/${remote.path}`, buf);
		nextAssets[remote.path] = {
			hash: remote.contentHash,
			lastSyncedAt: now,
		};
		result.assetsPulled++;
	}

	// Process locally present assets
	for (const local of localAssets) {
		const prev = prevAssets[local.relativePath];
		const remote = remoteAssetByPath.get(local.relativePath);
		const localChanged = !prev || prev.hash !== local.hash;

		if (remote?.deleted) {
			if (prev && prev.hash !== local.hash) {
				await pushAsset(local.relativePath, local.hash);
			} else {
				await fs.deleteFile(`${workspacePath}/${local.relativePath}`);
				delete nextAssets[local.relativePath];
				result.assetsDeleted++;
			}
			continue;
		}

		if (!remote) {
			await pushAsset(local.relativePath, local.hash);
			continue;
		}

		const remoteChanged = !prev || prev.hash !== remote.contentHash;
		const diverged = remoteChanged && remote.contentHash !== local.hash;

		if (diverged) {
			// Last-write-wins for binary assets — pull remote
			await pullAsset(remote);
		} else if (localChanged) {
			await pushAsset(local.relativePath, local.hash);
		}
	}

	// Detect local asset deletions
	for (const path of Object.keys(prevAssets)) {
		if (localAssetByPath.has(path)) continue;
		const remote = remoteAssetByPath.get(path);
		if (remote && !remote.deleted) {
			await backend.softDeleteAsset({
				workspaceId,
				path,
				deviceId,
			});
			delete nextAssets[path];
			result.assetsDeleted++;
		} else {
			delete nextAssets[path];
		}
	}

	// Pull new remote assets not present locally
	for (const remote of remoteAssets) {
		if (remote.deleted) continue;
		if (localAssetByPath.has(remote.path)) continue;
		if (prevAssets[remote.path]) continue;
		await pullAsset(remote);
	}

	await writeSyncState(fs, workspacePath, {
		lastSyncedAt: now,
		files: nextFiles,
		assets: nextAssets,
	});
	return result;
}

/** Export cloud-authoritative Live Documents to local markdown projections. */
export async function exportLiveDocuments(
	backend: SyncBackend,
	fs: Pick<FileSystem, "ensureDir" | "writeFile">,
	opts: { workspaceId: string; workspacePath: string },
): Promise<LiveDocumentExportResult> {
	const documents = await backend.getLiveDocuments(opts.workspaceId);
	const result: LiveDocumentExportResult = { exported: [], skipped: [] };

	for (const document of documents) {
		if (!document.path) {
			result.skipped.push(document.title);
			continue;
		}
		await ensureParentDir(fs, opts.workspacePath, document.path);
		await fs.writeFile(
			`${opts.workspacePath}/${document.path}`,
			document.markdown,
		);
		result.exported.push(document.path);
	}

	return result;
}

/** Write cloud Live Documents to a separate read-only projection tree for agents. */
export async function writeLiveDocumentProjections(
	backend: SyncBackend,
	fs: Pick<FileSystem, "ensureDir" | "writeFile" | "setReadOnly">,
	opts: {
		workspaceId: string;
		workspacePath: string;
		projectionRoot?: string;
	},
): Promise<LiveDocumentProjectionWriteResult> {
	const documents = await backend.getLiveDocuments(opts.workspaceId);
	const root =
		opts.projectionRoot ??
		`${opts.workspacePath}/.hubble/projections/live-documents`;
	const baseCacheRoot = `${opts.workspacePath}/.hubble/state/live-documents`;
	const result: LiveDocumentProjectionWriteResult = {
		root,
		baseCacheRoot,
		written: [],
		skipped: [],
	};

	for (const document of documents) {
		const projectionPath = document.path ?? `${document._id}.md`;
		const normalizedPath = normalizeRelativePath(projectionPath);
		if (!normalizedPath || normalizedPath.startsWith("../")) {
			result.skipped.push(document.title);
			continue;
		}
		await ensureParentDir(fs, root, normalizedPath);
		const path = `${root}/${normalizedPath}`;
		if (fs.setReadOnly) await fs.setReadOnly(path, false).catch(() => {});
		await fs.writeFile(path, document.markdown);
		if (fs.setReadOnly) await fs.setReadOnly(path, document.canWrite === false);
		await fs.ensureDir(baseCacheRoot);
		await fs.writeFile(
			`${baseCacheRoot}/${document._id}.base.md`,
			document.markdown,
		);
		await fs.writeFile(
			`${baseCacheRoot}/${document._id}.json`,
			JSON.stringify(
				{
					documentId: document._id,
					revision: document.version ?? 0,
					path: normalizedPath,
					role: document.role ?? null,
					canWrite: document.canWrite ?? true,
					projectedAt: Date.now(),
				},
				null,
				2,
			),
		);
		result.written.push(normalizedPath);
	}

	return result;
}

export type MaterializeSyncedFolderResult = {
	syncRoot: string;
	/** Absolute paths of every materialized `.md` file. */
	written: string[];
	/** The reverse index written to `.hubble/index/synced-folder.json`. */
	index: SyncedFolderIndex;
};

/**
 * Materialize the user's cloud Live-Document membership into the on-disk synced
 * folder: one top folder per workspace, the workspace's folder tree nested via
 * `parentId`, and each Live Document at `<title>.md` placed by `folderId`.
 *
 * Sibling of {@link writeLiveDocumentProjections} (the legacy flat agent tree),
 * kept separate so the user-facing mirror and the agent projection stay
 * independent (SYNCED-FOLDER §3). It:
 *  - computes the nested on-disk path from `(workspace, folder tree, title)` —
 *    **not** `document.path`, which stays mutable metadata;
 *  - writes the markdown file and applies the read-only chmod by role;
 *  - refreshes the reconcile **base cache** via {@link writeReconcileBase} with
 *    `syncRoot` as the workspace path, so it lands exactly where
 *    `reconcileProjectionFile` (`liveDocumentBaseCacheRoot(syncRoot)`) expects;
 *  - writes the **reverse index** (`absPath → documentId`) used by the watcher.
 *
 * `Shared with me/` materialization is deferred (SYNCED-FOLDER §1 gap 3).
 */
export async function materializeSyncedFolder(
	backend: Pick<
		SyncBackend,
		"listWorkspaces" | "getFolders" | "getLiveDocuments"
	>,
	fs: Pick<FileSystem, "ensureDir" | "writeFile" | "setReadOnly">,
	opts: { syncRoot: string },
): Promise<MaterializeSyncedFolderResult> {
	const { syncRoot } = opts;
	const written: string[] = [];
	const index: SyncedFolderIndex = {};

	const workspaces = await backend.listWorkspaces();
	const usedWorkspaceNames = new Set<string>();

	for (const workspace of workspaces) {
		const workspaceName = uniqueName(
			usedWorkspaceNames,
			sanitizeSegment(workspace.name),
		);

		const folders = await backend.getFolders(workspace._id);
		const folderRelPaths = buildFolderRelPaths(folders);

		const documents = await backend.getLiveDocuments(workspace._id);
		// Track sibling-title collisions per directory → ` (2)` suffix.
		const usedNamesByDir = new Map<string, Set<string>>();

		for (const document of documents) {
			const folderRel =
				document.folderId !== null
					? (folderRelPaths.get(document.folderId) ?? "")
					: "";
			const dirRel = joinRel(workspaceName, folderRel);
			const dirAbs = `${syncRoot}/${dirRel}`;

			const used = usedNamesByDir.get(dirRel) ?? new Set<string>();
			usedNamesByDir.set(dirRel, used);
			const fileName = uniqueName(
				used,
				`${sanitizeSegment(document.title)}.md`,
			);

			const relPath = `${dirRel}/${fileName}`;
			const absPath = `${syncRoot}/${relPath}`;

			await fs.ensureDir(dirAbs);
			// Clear any prior read-only flag so the write succeeds, then re-apply.
			if (fs.setReadOnly) await fs.setReadOnly(absPath, false).catch(() => {});
			await fs.writeFile(absPath, document.markdown);
			if (fs.setReadOnly)
				await fs.setReadOnly(absPath, document.canWrite === false);

			// Reconcile base cache, rooted at the sync root so it sits exactly where
			// reconcileProjectionFile(workspacePath: syncRoot) reads it.
			await writeReconcileBase(fs, syncRoot, document._id, {
				markdown: document.markdown,
				revision: document.version ?? 0,
				path: relPath,
			});

			index[absPath] = {
				documentId: document._id,
				workspaceId: workspace._id,
				folderId: document.folderId,
				inode: null,
				hash: await contentHash(document.markdown),
				role: document.role ?? null,
			};
			written.push(absPath);
		}
	}

	await saveSyncedFolderIndex(fs, syncRoot, index);

	return { syncRoot, written, index };
}

/** Import local markdown files into cloud-authoritative Live Documents. */
export async function importLiveDocuments(
	backend: SyncBackend,
	fs: Pick<FileSystem, "listMarkdownFiles">,
	opts: { workspaceId: string; workspacePath: string; actor?: string },
): Promise<LiveDocumentImportResult> {
	const localFiles = await fs.listMarkdownFiles(opts.workspacePath);
	const result: LiveDocumentImportResult = {
		imported: [],
		created: [],
		updated: [],
	};

	for (const local of localFiles) {
		const imported = await backend.importLiveDocument({
			workspaceId: opts.workspaceId,
			path: normalizeRelativePath(local.relativePath),
			title: titleFromPath(local.relativePath),
			markdown: local.content,
			actor: opts.actor,
		});
		result.imported.push(imported.path);
		if (imported.created) {
			result.created.push(imported.path);
		} else {
			result.updated.push(imported.path);
		}
	}

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
		cloudSync: config.cloudSync,
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

async function ensureParentDir(
	fs: Pick<FileSystem, "ensureDir">,
	workspacePath: string,
	path: string,
) {
	const slash = path.lastIndexOf("/");
	if (slash > 0) await fs.ensureDir(`${workspacePath}/${path.slice(0, slash)}`);
}

function titleFromPath(path: string): string {
	const normalized = normalizeRelativePath(path);
	const fileName = normalized.split("/").pop() ?? normalized;
	return fileName.replace(/\.(md|markdown|mdown)$/i, "") || "Untitled";
}

function normalizeRelativePath(path: string): string {
	return path.split("\\").join("/");
}

/**
 * Make a workspace/folder/title safe to use as a single filesystem path
 * segment: strip path separators and reserved characters, collapse whitespace,
 * and fall back to "Untitled" when nothing is left.
 */
function sanitizeSegment(name: string): string {
	const cleaned = name
		.replace(/[/\\:*?"<>|]/g, " ")
		// biome-ignore lint/suspicious/noControlCharactersInRegex: strip control chars
		.replace(/[\u0000-\u001f]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[. ]+$/, "");
	return cleaned || "Untitled";
}

/** Build `folderId → relative directory path` by walking `parentId`. */
function buildFolderRelPaths(
	folders: { _id: string; name: string; parentId: string | null }[],
): Map<string, string> {
	const byId = new Map(folders.map((folder) => [folder._id, folder]));
	const cache = new Map<string, string>();

	function resolve(id: string, seen: Set<string>): string {
		const cached = cache.get(id);
		if (cached !== undefined) return cached;
		const folder = byId.get(id);
		if (!folder || seen.has(id)) return "";
		seen.add(id);
		const segment = sanitizeSegment(folder.name);
		const parentPath =
			folder.parentId !== null && folder.parentId !== undefined
				? resolve(folder.parentId, seen)
				: "";
		const path = parentPath ? `${parentPath}/${segment}` : segment;
		cache.set(id, path);
		return path;
	}

	for (const folder of folders) resolve(folder._id, new Set());
	return cache;
}

/** Join two relative path fragments, dropping an empty tail. */
function joinRel(head: string, tail: string): string {
	return tail ? `${head}/${tail}` : head;
}

/**
 * Reserve `name` within `used`, disambiguating sibling collisions with a
 * ` (2)`, ` (3)`, … suffix inserted before the extension.
 */
function uniqueName(used: Set<string>, name: string): string {
	if (!used.has(name)) {
		used.add(name);
		return name;
	}
	const dot = name.lastIndexOf(".");
	const stem = dot === -1 ? name : name.slice(0, dot);
	const ext = dot === -1 ? "" : name.slice(dot);
	let n = 2;
	let candidate = `${stem} (${n})${ext}`;
	while (used.has(candidate)) {
		n += 1;
		candidate = `${stem} (${n})${ext}`;
	}
	used.add(candidate);
	return candidate;
}
