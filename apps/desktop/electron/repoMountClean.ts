import fs from "node:fs/promises";
import path from "node:path";
import {
	contentHash,
	loadSyncedFolderIndex,
	SYNCED_FOLDER_INDEX_REL,
} from "@hubble.md/sync";
import { createNodeFileSystem } from "@hubble.md/sync/node";
import type {
	LiveSyncStatusState,
	RepoMountCleanliness,
} from "../src/desktopApi/types";

export function mountCleanliness(
	status: LiveSyncStatusState | "disconnected",
	filesClean: boolean,
): RepoMountCleanliness {
	if (status !== "connected") {
		const label =
			status === "pending-review"
				? "needs review"
				: status === "disconnected"
					? "is not connected"
					: `is ${status}`;
		return {
			state: "blocked",
			reason: status,
			message: `Hubble can’t prove this folder is clean while it ${label}. Resolve its status before stopping or relocating local availability.`,
		};
	}
	if (!filesClean) {
		return {
			state: "blocked",
			reason: "dirty",
			message:
				"This folder has pending or unrecognized local changes. Let Hubble synchronize them or preserve them through recovery before continuing.",
		};
	}
	return { state: "clean" };
}

export async function isMountClean(mountPath: string): Promise<boolean> {
	const syncRoot = path.resolve(mountPath);
	const nodeFs = createNodeFileSystem();
	const index = await loadSyncedFolderIndex(nodeFs, syncRoot);
	const indexedPaths = new Set(
		Object.keys(index).map((entryPath) => path.resolve(entryPath)),
	);

	for (const [entryPath, entry] of Object.entries(index)) {
		const absPath = path.resolve(entryPath);
		try {
			const content = await fs.readFile(absPath, "utf8");
			if ((await contentHash(content)) !== entry.hash) return false;
		} catch {
			return false;
		}
	}

	for (const filePath of await listMountFiles(syncRoot)) {
		if (isHubbleStatePath(syncRoot, filePath)) continue;
		if (!indexedPaths.has(path.resolve(filePath))) return false;
	}

	return true;
}

/** Re-key device state so a clean root move is not mistaken for mass deletion. */
export async function rewriteProjectionIndexRoot(
	stateRoot: string,
	fromRoot: string,
	toRoot: string,
): Promise<void> {
	const indexPath = path.join(stateRoot, ...SYNCED_FOLDER_INDEX_REL.split("/"));
	const parsed = JSON.parse(await fs.readFile(indexPath, "utf8")) as unknown;
	const rewritePath = (entryPath: string) => {
		const relative = path.relative(fromRoot, entryPath);
		return relative === "" ||
			(!relative.startsWith("..") && !path.isAbsolute(relative))
			? path.join(toRoot, relative)
			: entryPath;
	};
	const rewriteEntries = (entries: Record<string, unknown>) =>
		Object.fromEntries(
			Object.entries(entries).map(([entryPath, entry]) => [
				rewritePath(entryPath),
				entry,
			]),
		);
	let rewritten: unknown;
	if (
		typeof parsed === "object" &&
		parsed !== null &&
		"version" in parsed &&
		(parsed as { version: unknown }).version === 2
	) {
		if (
			!("entries" in parsed) ||
			typeof parsed.entries !== "object" ||
			parsed.entries === null
		) {
			throw new Error("Invalid synced-folder index manifest");
		}
		const manifest = parsed as unknown as {
			syncRoot: string;
			entries: Record<string, unknown>;
			[key: string]: unknown;
		};
		rewritten = {
			...manifest,
			syncRoot: toRoot,
			entries: rewriteEntries(manifest.entries),
		};
	} else {
		rewritten = rewriteEntries(parsed as Record<string, unknown>);
	}
	const tempPath = `${indexPath}.relocating`;
	await fs.writeFile(tempPath, JSON.stringify(rewritten, null, 2));
	await fs.rename(tempPath, indexPath);
}

async function listMountFiles(root: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(root, { withFileTypes: true });
		const files: string[] = [];
		for (const entry of entries) {
			const absPath = path.join(root, entry.name);
			if (entry.isDirectory()) {
				files.push(...(await listMountFiles(absPath)));
			} else if (entry.isFile()) {
				files.push(absPath);
			}
		}
		return files;
	} catch {
		return [];
	}
}

function isHubbleStatePath(syncRoot: string, filePath: string): boolean {
	const rel = path.relative(syncRoot, filePath).split(path.sep).join("/");
	return rel === ".hubble" || rel.startsWith(".hubble/");
}
