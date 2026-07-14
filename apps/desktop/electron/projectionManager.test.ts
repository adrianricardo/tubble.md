import type { PendingProjectionOperation } from "@hubble.md/sync";
import { describe, expect, it, vi } from "vitest";
import type { SyncedFolderStatus } from "../src/desktopApi/types";
import { ProjectionManager } from "./projectionManager";
import type { ConnectFolderInput } from "./syncedFolderService";

function status(
	overrides: Partial<SyncedFolderStatus> = {},
): SyncedFolderStatus {
	return {
		state: "idle",
		connected: false,
		syncRoot: null,
		documentCount: 0,
		pendingOperationCount: 0,
		verificationReason: null,
		lastReconcileAt: null,
		lastEventAt: null,
		lastError: null,
		telemetry: {
			reconciledCount: 0,
			backstopCount: 0,
			readOnlyRejectedCount: 0,
			errorCount: 0,
			queuedEventCount: 0,
			recentEvents: [],
		},
		...overrides,
	};
}

function operation(id: string): PendingProjectionOperation {
	return {
		id,
		kind: "missing-document",
		state: "pending",
		createdAt: 1,
		updatedAt: 1,
		documentId: `document-${id}`,
		workspaceId: "workspace-a",
		folderId: null,
		path: `/root/${id}.md`,
		baseHash: "hash",
	};
}

function engine(
	options: {
		operations?: PendingProjectionOperation[];
		paths?: string[];
		connectError?: Error;
	} = {},
) {
	let currentStatus = status();
	const operations = options.operations ?? [];
	return {
		approvePendingDeletion: vi.fn(async () => ({ processed: 1, remaining: 0 })),
		approvePendingMove: vi.fn(async () => ({ status: "completed" as const })),
		cancelPendingDeletion: vi.fn(async () => ({ processed: 1, remaining: 0 })),
		cancelPendingMove: vi.fn(async () => ({ status: "cancelled" as const })),
		connect: vi.fn(async (input: ConnectFolderInput) => {
			if (options.connectError) throw options.connectError;
			currentStatus = status({ connected: true, syncRoot: input.syncRoot });
			return currentStatus;
		}),
		disconnect: vi.fn(async () => {
			currentStatus = status();
			return currentStatus;
		}),
		dismissTrashUndo: vi.fn(async () => ({ status: "dismissed" as const })),
		getStatus: vi.fn(() => currentStatus),
		isLiveDocument: vi.fn(
			(path: string) => options.paths?.includes(path) ?? false,
		),
		findDocumentPath: vi.fn(
			(documentId: string) =>
				options.paths?.find((path) => path.includes(documentId)) ?? null,
		),
		listPendingOperations: vi.fn(async () => operations),
		refresh: vi.fn(async () => currentStatus),
		undoTrashedDocument: vi.fn(async () => ({ status: "restored" as const })),
	};
}

const input: ConnectFolderInput = {
	syncRoot: "/root",
	deploymentUrl: "https://example.convex.cloud",
	authToken: "token",
};

describe("ProjectionManager", () => {
	it("aggregates statuses, pending operations, and managed paths across roots", async () => {
		const whole = engine({ operations: [operation("whole")] });
		const mount = engine({
			operations: [operation("mount")],
			paths: ["/repo/brain/doc.md"],
		});
		const manager = new ProjectionManager({
			wholeWorkspace: whole,
			createMount: () => mount,
		});
		await manager.connectMount(
			{ kind: "folder", folderId: "folder-a", workspaceId: "workspace-a" },
			{
				...input,
				syncRoot: "/repo/brain",
			},
		);

		expect(manager.listStatuses()).toHaveLength(2);
		expect(manager.listStatuses()[1]?.scope).toEqual({
			scopeKey: "folder:folder-a",
			kind: "folder",
			workspaceId: "workspace-a",
			folderId: "folder-a",
			localRoot: "/repo/brain",
		});
		expect((await manager.listPendingOperations()).map(({ id }) => id)).toEqual(
			["whole", "mount"],
		);
		expect(manager.isLiveDocument("/repo/brain/doc.md")).toBe(true);
		expect((await manager.getAgentStatus())[0]).toMatchObject({
			operations: {
				total: 1,
				pendingReview: 1,
				recovery: 1,
				undoAvailable: 0,
				byKind: { "missing-document": 1 },
			},
		});
	});

	it("refreshes the owning engine and resolves a materialized document path", async () => {
		const whole = engine();
		const mount = engine({ paths: ["/repo/brain/document-1.md"] });
		const manager = new ProjectionManager({
			wholeWorkspace: whole,
			createMount: () => mount,
		});
		await manager.connectMount(
			{ kind: "workspace", workspaceId: "workspace-a" },
			input,
		);

		await manager.refreshMount("workspace:workspace-a");
		expect(mount.refresh).toHaveBeenCalledOnce();
		expect(manager.findDocumentPath("document-1")).toBe(
			"/repo/brain/document-1.md",
		);
		expect(manager.listStatuses()[1]?.scope).toMatchObject({
			scopeKey: "workspace:workspace-a",
			kind: "workspace",
			workspaceId: "workspace-a",
			folderId: null,
		});
	});

	it("runs disjoint Workspace and folder scopes independently", async () => {
		const workspace = engine();
		const folder = engine();
		const manager = new ProjectionManager({
			wholeWorkspace: engine(),
			createMount: (scope) => (scope.kind === "workspace" ? workspace : folder),
		});
		await manager.connectMount(
			{ kind: "workspace", workspaceId: "workspace-a" },
			{ ...input, syncRoot: "/roots/workspace-a" },
		);
		await manager.connectMount(
			{ kind: "folder", workspaceId: "workspace-b", folderId: "folder-b" },
			{ ...input, syncRoot: "/roots/folder-b" },
		);

		expect(manager.listStatuses().map(({ scope }) => scope.scopeKey)).toEqual([
			"all-accessible",
			"workspace:workspace-a",
			"folder:folder-b",
		]);
		await manager.disconnectMount("workspace:workspace-a");
		expect(manager.hasMount("workspace:workspace-a")).toBe(false);
		expect(manager.hasMount("folder:folder-b")).toBe(true);
		expect(folder.disconnect).not.toHaveBeenCalled();
	});

	it("routes operation actions to the engine that owns the operation", async () => {
		const whole = engine();
		const mount = engine({ operations: [operation("mount")] });
		const manager = new ProjectionManager({
			wholeWorkspace: whole,
			createMount: () => mount,
		});
		await manager.connectMount(
			{ kind: "folder", folderId: "folder-a", workspaceId: "workspace-a" },
			input,
		);

		await manager.approvePendingMove("mount");
		expect(mount.approvePendingMove).toHaveBeenCalledWith("mount");
		expect(whole.approvePendingMove).not.toHaveBeenCalled();
		await expect(manager.cancelPendingMove("missing")).rejects.toThrow(
			"Pending projection operation not found",
		);
	});

	it("removes a failed mount engine so it cannot affect later routing", async () => {
		const failed = engine({ connectError: new Error("connect failed") });
		const manager = new ProjectionManager({
			wholeWorkspace: engine(),
			createMount: () => failed,
		});

		await expect(
			manager.connectMount(
				{ kind: "folder", folderId: "folder-a", workspaceId: "workspace-a" },
				input,
			),
		).rejects.toThrow("connect failed");
		expect(manager.hasMount("folder:folder-a")).toBe(false);
		expect(failed.disconnect).toHaveBeenCalledOnce();
	});
});
