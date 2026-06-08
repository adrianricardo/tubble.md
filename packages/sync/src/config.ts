import type { InitFileSystem } from "./fs.js";
import {
	type CloudSyncConfig,
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
	fs: Pick<InitFileSystem, "readFileOrNull">,
	workspacePath: string,
): Promise<boolean> {
	return (await fs.readFileOrNull(configPath(workspacePath))) !== null;
}

export async function readConfigOrDefault(
	fs: InitFileSystem,
	workspacePath: string,
): Promise<WorkspaceConfig> {
	const raw = await fs.readFileOrNull(configPath(workspacePath));
	if (!raw) return {};
	return WorkspaceConfigSchema.parse(JSON.parse(raw));
}

export async function readConfig(
	fs: InitFileSystem,
	workspacePath: string,
): Promise<WorkspaceConfig> {
	const raw = await fs.readFile(configPath(workspacePath));
	return WorkspaceConfigSchema.parse(JSON.parse(raw));
}

export async function writeConfig(
	fs: InitFileSystem,
	workspacePath: string,
	config: WorkspaceConfig,
): Promise<void> {
	await fs.ensureDir(`${workspacePath}/${HUBBLE_DIR}`);
	await fs.writeFile(
		configPath(workspacePath),
		JSON.stringify(config, null, "\t"),
	);
}

export async function writeCloudSyncConfig(
	fs: InitFileSystem,
	workspacePath: string,
	cloudSync: CloudSyncConfig,
): Promise<WorkspaceConfig> {
	const config = await readConfigOrDefault(fs, workspacePath);
	const next = { ...config, cloudSync };
	await writeConfig(fs, workspacePath, next);
	return next;
}

export async function removeCloudSyncConfig(
	fs: InitFileSystem,
	workspacePath: string,
): Promise<WorkspaceConfig> {
	const raw = await fs.readFileOrNull(configPath(workspacePath));
	if (!raw) return {};
	const config = WorkspaceConfigSchema.parse(JSON.parse(raw));
	if (!config.cloudSync) return config;
	const next = { ...config };
	delete next.cloudSync;
	await writeConfig(fs, workspacePath, next);
	return next;
}

const EMPTY_STATE: SyncState = { lastSyncedAt: 0, files: {} };

export async function readSyncState(
	fs: InitFileSystem,
	workspacePath: string,
): Promise<SyncState> {
	const raw = await fs.readFileOrNull(statePath(workspacePath));
	if (!raw) return EMPTY_STATE;
	return SyncStateSchema.parse(JSON.parse(raw));
}

export async function writeSyncState(
	fs: InitFileSystem,
	workspacePath: string,
	state: SyncState,
): Promise<void> {
	await fs.ensureDir(`${workspacePath}/${HUBBLE_DIR}`);
	await fs.writeFile(
		statePath(workspacePath),
		JSON.stringify(state, null, "\t"),
	);
}
