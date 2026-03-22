import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	SyncStateSchema,
	type SyncState,
	WorkspaceConfigSchema,
	type WorkspaceConfig,
} from "./types";

const HUBBLE_DIR = ".hubble";
const CONFIG_FILE = "config.json";
const STATE_FILE = "state.json";

export function hubbleDir(workspacePath: string): string {
	return join(workspacePath, HUBBLE_DIR);
}

export function isInitialized(workspacePath: string): boolean {
	return existsSync(join(hubbleDir(workspacePath), CONFIG_FILE));
}

export function readConfig(workspacePath: string): WorkspaceConfig {
	const raw = readFileSync(
		join(hubbleDir(workspacePath), CONFIG_FILE),
		"utf-8",
	);
	return WorkspaceConfigSchema.parse(JSON.parse(raw));
}

export function writeConfig(
	workspacePath: string,
	config: WorkspaceConfig,
): void {
	const dir = hubbleDir(workspacePath);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, CONFIG_FILE), JSON.stringify(config, null, "\t"));
}

export function readSyncState(workspacePath: string): SyncState {
	const path = join(hubbleDir(workspacePath), STATE_FILE);
	if (!existsSync(path)) return { lastSyncedAt: 0, files: {} };
	const raw = readFileSync(path, "utf-8");
	return SyncStateSchema.parse(JSON.parse(raw));
}

export function writeSyncState(
	workspacePath: string,
	state: SyncState,
): void {
	writeFileSync(
		join(hubbleDir(workspacePath), STATE_FILE),
		JSON.stringify(state, null, "\t"),
	);
}

export function generateDeviceId(): string {
	return randomUUID();
}

export function contentHash(content: string): string {
	return createHash("sha256").update(content, "utf-8").digest("hex");
}
