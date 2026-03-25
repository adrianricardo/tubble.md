import type { FileSystem } from "./fs.js";
import {
	type SyncState,
	SyncStateSchema,
	type WorkspaceConfig,
	WorkspaceConfigSchema,
} from "./types.js";

const HUBBLE_DIR = ".hubble";

function configPath(ws: string): string {
	return `${ws}/${HUBBLE_DIR}/config.json`;
}

function statePath(ws: string): string {
	return `${ws}/${HUBBLE_DIR}/state.json`;
}

export async function isInitialized(
	fs: FileSystem,
	workspacePath: string,
): Promise<boolean> {
	return (await fs.readFileOrNull(configPath(workspacePath))) !== null;
}

export async function readConfig(
	fs: FileSystem,
	workspacePath: string,
): Promise<WorkspaceConfig> {
	const raw = await fs.readFile(configPath(workspacePath));
	return WorkspaceConfigSchema.parse(JSON.parse(raw));
}

export async function writeConfig(
	fs: FileSystem,
	workspacePath: string,
	config: WorkspaceConfig,
): Promise<void> {
	await fs.ensureDir(`${workspacePath}/${HUBBLE_DIR}`);
	await fs.writeFile(
		configPath(workspacePath),
		JSON.stringify(config, null, "\t"),
	);
}

const EMPTY_STATE: SyncState = { lastSyncedAt: 0, files: {} };

export async function readSyncState(
	fs: FileSystem,
	workspacePath: string,
): Promise<SyncState> {
	const raw = await fs.readFileOrNull(statePath(workspacePath));
	if (!raw) return EMPTY_STATE;
	return SyncStateSchema.parse(JSON.parse(raw));
}

export async function writeSyncState(
	fs: FileSystem,
	workspacePath: string,
	state: SyncState,
): Promise<void> {
	await fs.writeFile(
		statePath(workspacePath),
		JSON.stringify(state, null, "\t"),
	);
}
