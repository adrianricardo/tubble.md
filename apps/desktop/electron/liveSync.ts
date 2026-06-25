import { createConvexBackend } from "@hubble.md/convex-client";
import {
	type FileSystem,
	type ReconcileOutcome,
	reconcileProjectionFile,
	type SyncBackend,
} from "@hubble.md/sync";
import { createNodeFileSystem } from "@hubble.md/sync/node";
import type {
	LiveSyncConnectInput,
	LiveSyncReconcileInput,
	LiveSyncStatus,
	LiveSyncStatusState,
} from "../src/desktopApi/types";

/**
 * Host for the Live Document reconcile engine inside the Electron main process.
 *
 * Phase 2: holds the cloud connection (Convex backend) and exposes a **manual**
 * reconcile trigger that reuses the shared `reconcileProjectionFile` core. There
 * is intentionally no workspace-wide watcher (Phase 3) and no conflict-routing
 * change (Phase 4) here — this is the engine seam, driven explicitly by IPC.
 *
 * The backend factory and filesystem are injectable so the routing/connection
 * logic can be unit-tested against a fake `SyncBackend` + in-memory FS.
 */
export type LiveSyncServiceOptions = {
	createBackend?: (url: string) => SyncBackend;
	fs?: FileSystem;
};

export class LiveSyncService {
	#createBackend: (url: string) => SyncBackend;
	#fs: FileSystem;
	#connection: LiveSyncConnectInput | null = null;
	#backend: SyncBackend | null = null;
	#state: LiveSyncStatusState = "idle";
	#pending = 0;
	#lastReconciledAt: number | null = null;
	#lastError: string | null = null;

	constructor(options: LiveSyncServiceOptions = {}) {
		this.#createBackend = options.createBackend ?? createConvexBackend;
		this.#fs = options.fs ?? createNodeFileSystem();
	}

	get connected(): boolean {
		return this.#connection !== null;
	}

	connect(connection: LiveSyncConnectInput): LiveSyncStatus {
		this.#connection = connection;
		this.#backend = this.#createBackend(connection.deploymentUrl);
		this.#state = "connected";
		this.#lastError = null;
		return this.getStatus();
	}

	disconnect(): LiveSyncStatus {
		this.#connection = null;
		this.#backend = null;
		this.#state = "idle";
		this.#pending = 0;
		return this.getStatus();
	}

	getStatus(): LiveSyncStatus {
		return {
			state: this.#state,
			connected: this.connected,
			workspacePath: this.#connection?.workspacePath ?? null,
			workspaceId: this.#connection?.workspaceId ?? null,
			pending: this.#pending,
			lastReconciledAt: this.#lastReconciledAt,
			lastError: this.#lastError,
		};
	}

	/**
	 * Reconcile a single Live Document projection file into the cloud CRDT via
	 * the shared reconciler. Callers (IPC) decide how to surface a `backstop`
	 * outcome; Phase 5 wires the `*.local-edit-<ts>` copy. The provided
	 * `projectionPath` must be absolute and already grant-checked by the caller.
	 */
	async reconcile(request: LiveSyncReconcileInput): Promise<ReconcileOutcome> {
		if (!this.#connection || !this.#backend) {
			throw new Error("Live sync is not connected; call connect() first.");
		}
		this.#pending += 1;
		this.#state = "syncing";
		try {
			const outcome = await reconcileProjectionFile(this.#backend, this.#fs, {
				documentId: request.documentId,
				projectionPath: request.projectionPath,
				workspacePath: this.#connection.workspacePath,
				actor: request.actor,
				path: request.path,
			});
			if (outcome.status === "reconciled") {
				this.#lastReconciledAt = Date.now();
			}
			this.#lastError = null;
			return outcome;
		} catch (error) {
			this.#lastError = error instanceof Error ? error.message : String(error);
			this.#state = "error";
			throw error;
		} finally {
			this.#pending = Math.max(0, this.#pending - 1);
			if (this.#state === "syncing") this.#state = "connected";
		}
	}
}
