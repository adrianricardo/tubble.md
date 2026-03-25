export { isInitialized, readConfig } from "./config.js";
export type { FileSystem, LocalFile } from "./fs.js";
export { contentHash } from "./fs.js";
export { init, status, sync } from "./sync.js";
export type {
	FileState,
	RemoteFile,
	SyncResult,
	SyncState,
	WorkspaceConfig,
} from "./types.js";
