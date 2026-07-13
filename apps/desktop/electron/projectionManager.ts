import type { PendingProjectionOperation } from "@hubble.md/sync";
import type {
	ProjectionRootScope,
	SyncedFolderStatus,
} from "../src/desktopApi/types";
import type {
	ConnectFolderInput,
	SyncedFolderService,
} from "./syncedFolderService";

type ProjectionEngine = Pick<
	SyncedFolderService,
	| "approvePendingDeletion"
	| "approvePendingMove"
	| "cancelPendingDeletion"
	| "cancelPendingMove"
	| "connect"
	| "disconnect"
	| "dismissTrashUndo"
	| "getStatus"
	| "isLiveDocument"
	| "findDocumentPath"
	| "listPendingOperations"
	| "refresh"
	| "undoTrashedDocument"
>;

export type ProjectionStatus = {
	scope: ProjectionRootScope;
	status: SyncedFolderStatus;
};

export type ProjectionAgentStatus = ProjectionStatus & {
	operations: {
		total: number;
		pendingReview: number;
		recovery: number;
		undoAvailable: number;
		byKind: Partial<Record<PendingProjectionOperation["kind"], number>>;
	};
};

// These blockers need byte/path recovery, not just approval of a cloud action.
const recoveryOperationKinds = new Set<PendingProjectionOperation["kind"]>([
	"missing-document",
	"path-collision",
	"ambiguous-startup-move",
	"guard-conflict",
]);

export class ProjectionManager {
	#wholeWorkspace: ProjectionEngine;
	#createMount: (folderId: string) => ProjectionEngine;
	#mounts = new Map<
		string,
		{ workspaceId: string; engine: ProjectionEngine }
	>();

	constructor(options: {
		wholeWorkspace: ProjectionEngine;
		createMount: (folderId: string) => ProjectionEngine;
	}) {
		this.#wholeWorkspace = options.wholeWorkspace;
		this.#createMount = options.createMount;
	}

	get wholeWorkspaceConnected(): boolean {
		return this.#wholeWorkspace.getStatus().connected;
	}

	get mountCount(): number {
		return this.#mounts.size;
	}

	hasMount(folderId: string): boolean {
		return this.#mounts.has(folderId);
	}

	getMountStatus(folderId: string): SyncedFolderStatus | null {
		return this.#mounts.get(folderId)?.engine.getStatus() ?? null;
	}

	connectWholeWorkspace(input: ConnectFolderInput) {
		return this.#wholeWorkspace.connect(input);
	}

	disconnectWholeWorkspace() {
		return this.#wholeWorkspace.disconnect();
	}

	getWholeWorkspaceStatus(): SyncedFolderStatus {
		return this.#wholeWorkspace.getStatus();
	}

	refreshWholeWorkspace() {
		return this.#wholeWorkspace.refresh();
	}

	async connectMount(
		folderId: string,
		workspaceId: string,
		input: ConnectFolderInput,
	): Promise<SyncedFolderStatus> {
		await this.disconnectMount(folderId);
		const engine = this.#createMount(folderId);
		this.#mounts.set(folderId, { workspaceId, engine });
		try {
			return await engine.connect(input);
		} catch (error) {
			this.#mounts.delete(folderId);
			await engine.disconnect().catch(() => undefined);
			throw error;
		}
	}

	async disconnectMount(folderId: string): Promise<void> {
		const mount = this.#mounts.get(folderId);
		if (!mount) return;
		this.#mounts.delete(folderId);
		await mount.engine.disconnect();
	}

	refreshMount(folderId: string) {
		const mount = this.#mounts.get(folderId);
		if (!mount) throw new Error(`Local availability not found: ${folderId}`);
		return mount.engine.refresh();
	}

	findDocumentPath(documentId: string): string | null {
		for (const engine of this.#engines()) {
			const path = engine.findDocumentPath(documentId);
			if (path) return path;
		}
		return null;
	}

	listStatuses(): ProjectionStatus[] {
		return [
			{
				scope: this.#wholeWorkspaceScope(),
				status: this.#wholeWorkspace.getStatus(),
			},
			...[...this.#mounts].map(([folderId, mount]) => ({
				scope: this.#mountScope(folderId, mount),
				status: mount.engine.getStatus(),
			})),
		];
	}

	async getAgentStatus(): Promise<ProjectionAgentStatus[]> {
		return Promise.all(
			this.#entries()
				.filter(({ engine }) => {
					const status = engine.getStatus();
					return status.syncRoot !== null || status.state !== "idle";
				})
				.map(async ({ scope, engine }) => {
					const operations = await engine.listPendingOperations();
					const byKind: ProjectionAgentStatus["operations"]["byKind"] = {};
					let recovery = 0;
					let undoAvailable = 0;
					for (const operation of operations) {
						byKind[operation.kind] = (byKind[operation.kind] ?? 0) + 1;
						if (recoveryOperationKinds.has(operation.kind)) recovery += 1;
						if (
							operation.kind === "trash-undo" &&
							operation.phase === "undo-available"
						) {
							undoAvailable += 1;
						}
					}
					return {
						scope,
						status: engine.getStatus(),
						operations: {
							total: operations.length,
							pendingReview: operations.length - undoAvailable,
							recovery,
							undoAvailable,
							byKind,
						},
					};
				}),
		);
	}

	isLiveDocument(absPath: string): boolean {
		return this.#engines().some((engine) => engine.isLiveDocument(absPath));
	}

	async listPendingOperations(): Promise<PendingProjectionOperation[]> {
		return (
			await Promise.all(
				this.#engines().map((engine) => engine.listPendingOperations()),
			)
		).flat();
	}

	approvePendingMove(operationId: string) {
		return this.#routeOperation(operationId, (engine) =>
			engine.approvePendingMove(operationId),
		);
	}

	cancelPendingMove(operationId: string) {
		return this.#routeOperation(operationId, (engine) =>
			engine.cancelPendingMove(operationId),
		);
	}

	approvePendingDeletion(operationId: string) {
		return this.#routeOperation(operationId, (engine) =>
			engine.approvePendingDeletion(operationId),
		);
	}

	cancelPendingDeletion(operationId: string) {
		return this.#routeOperation(operationId, (engine) =>
			engine.cancelPendingDeletion(operationId),
		);
	}

	undoTrashedDocument(operationId: string) {
		return this.#routeOperation(operationId, (engine) =>
			engine.undoTrashedDocument(operationId),
		);
	}

	dismissTrashUndo(operationId: string) {
		return this.#routeOperation(operationId, (engine) =>
			engine.dismissTrashUndo(operationId),
		);
	}

	#engines(): ProjectionEngine[] {
		return [
			this.#wholeWorkspace,
			...[...this.#mounts.values()].map(({ engine }) => engine),
		];
	}

	#entries(): Array<{ scope: ProjectionRootScope; engine: ProjectionEngine }> {
		return [
			{
				scope: this.#wholeWorkspaceScope(),
				engine: this.#wholeWorkspace,
			},
			...[...this.#mounts].map(([folderId, mount]) => ({
				scope: this.#mountScope(folderId, mount),
				engine: mount.engine,
			})),
		];
	}

	#wholeWorkspaceScope(): ProjectionRootScope {
		return {
			kind: "workspace-mirror",
			workspaceId: null,
			folderId: null,
			localRoot: this.#wholeWorkspace.getStatus().syncRoot,
		};
	}

	#mountScope(
		folderId: string,
		mount: { workspaceId: string; engine: ProjectionEngine },
	): ProjectionRootScope {
		return {
			kind: "folder",
			workspaceId: mount.workspaceId,
			folderId,
			localRoot: mount.engine.getStatus().syncRoot,
		};
	}

	async #routeOperation<T>(
		operationId: string,
		action: (engine: ProjectionEngine) => Promise<T>,
	): Promise<T> {
		// Renderer actions carry the stable operation ID, not a device-local root.
		// The journal that contains the ID is therefore the routing authority.
		for (const engine of this.#engines()) {
			const operations = await engine.listPendingOperations();
			if (operations.some(({ id }) => id === operationId))
				return action(engine);
		}
		throw new Error(`Pending projection operation not found: ${operationId}`);
	}
}
