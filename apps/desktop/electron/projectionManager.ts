import {
	type PendingProjectionOperation,
	type ProjectionScope,
	projectionScopeKey,
} from "@hubble.md/sync";
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
	#createMount: (
		scope: Exclude<ProjectionScope, { kind: "all-accessible" }>,
	) => ProjectionEngine;
	#mounts = new Map<
		string,
		{
			scope: Exclude<ProjectionScope, { kind: "all-accessible" }>;
			engine: ProjectionEngine;
		}
	>();

	constructor(options: {
		wholeWorkspace: ProjectionEngine;
		createMount: (
			scope: Exclude<ProjectionScope, { kind: "all-accessible" }>,
		) => ProjectionEngine;
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

	hasMount(scopeKey: string): boolean {
		return this.#mounts.has(scopeKey);
	}

	getMountStatus(scopeKey: string): SyncedFolderStatus | null {
		return this.#mounts.get(scopeKey)?.engine.getStatus() ?? null;
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
		scope: Exclude<ProjectionScope, { kind: "all-accessible" }>,
		input: ConnectFolderInput,
	): Promise<SyncedFolderStatus> {
		const scopeKey = projectionScopeKey(scope);
		await this.disconnectMount(scopeKey);
		const engine = this.#createMount(scope);
		this.#mounts.set(scopeKey, { scope, engine });
		try {
			return await engine.connect(input);
		} catch (error) {
			this.#mounts.delete(scopeKey);
			await engine.disconnect().catch(() => undefined);
			throw error;
		}
	}

	async disconnectMount(scopeKey: string): Promise<void> {
		const mount = this.#mounts.get(scopeKey);
		if (!mount) return;
		this.#mounts.delete(scopeKey);
		await mount.engine.disconnect();
	}

	refreshMount(scopeKey: string) {
		const mount = this.#mounts.get(scopeKey);
		if (!mount) throw new Error(`Local availability not found: ${scopeKey}`);
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
			...[...this.#mounts].map(([scopeKey, mount]) => ({
				scope: this.#mountScope(scopeKey, mount),
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
			...[...this.#mounts].map(([scopeKey, mount]) => ({
				scope: this.#mountScope(scopeKey, mount),
				engine: mount.engine,
			})),
		];
	}

	#wholeWorkspaceScope(): ProjectionRootScope {
		return {
			scopeKey: projectionScopeKey({ kind: "all-accessible" }),
			kind: "all-accessible",
			workspaceId: null,
			folderId: null,
			localRoot: this.#wholeWorkspace.getStatus().syncRoot,
		};
	}

	#mountScope(
		scopeKey: string,
		mount: {
			scope: Exclude<ProjectionScope, { kind: "all-accessible" }>;
			engine: ProjectionEngine;
		},
	): ProjectionRootScope {
		return {
			scopeKey,
			kind: mount.scope.kind,
			workspaceId: mount.scope.workspaceId,
			folderId: mount.scope.kind === "folder" ? mount.scope.folderId : null,
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
