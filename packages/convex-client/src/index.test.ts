import { api } from "@hubble.md/sync-backend";
import { beforeEach, describe, expect, it, vi } from "vitest";

const onUpdate = vi.fn();
const close = vi.fn(async () => {});
const mutation = vi.fn();
const query = vi.fn();

vi.mock("convex/browser", () => ({
	ConvexClient: class {
		onUpdate = onUpdate;
		close = close;
		setAuth() {}
	},
	ConvexHttpClient: class {
		mutation = mutation;
		query = query;
		setAuth() {}
	},
}));

import { createConvexBackend, createConvexSubscriber } from "./index.js";

describe("createConvexSubscriber Workspace scope", () => {
	beforeEach(() => {
		onUpdate.mockReset();
		close.mockClear();
		onUpdate.mockImplementation(() => vi.fn());
	});

	it("subscribes only to folders and documents in the selected Workspace", () => {
		const subscriber = createConvexSubscriber("https://fake.convex.cloud");
		const callback = vi.fn();

		subscriber.onSyncedFolderChanged(
			{ kind: "workspace", workspaceId: "ws_selected" },
			callback,
			vi.fn(),
		);

		expect(onUpdate).toHaveBeenCalledTimes(2);
		expect(
			onUpdate.mock.calls.map(([query, args]) => ({ query, args })),
		).toEqual([
			{
				query: api.folders.list,
				args: { workspaceId: "ws_selected" },
			},
			{
				query: api.documents.listWithMarkdown,
				args: { workspaceId: "ws_selected" },
			},
		]);
		expect(
			onUpdate.mock.calls.some(([, args]) => args.workspaceId === "ws_other"),
		).toBe(false);
	});
});

describe("authority transfer adapters", () => {
	beforeEach(() => {
		mutation.mockReset();
		query.mockReset();
		mutation.mockResolvedValue({});
		query.mockResolvedValue({
			state: "staging",
			items: [],
		});
	});

	it("maps the staged transfer contract to Convex function references", async () => {
		const backend = createConvexBackend("https://fake.convex.cloud", "token");
		await backend.prepareGitFolderMove({
			operationKey: "operation-1",
			workspaceId: "workspace-1",
			rootName: "Notes",
			manifestHash: "manifest",
			manifestItemCount: 1,
			manifestMarkdownCount: 1,
			manifestAssetCount: 0,
			manifestTotalBytes: 5,
			sourceFingerprint: "source",
			destinationFingerprint: "destination",
			expectedAudienceFingerprint: "audience",
		});
		await backend.stageAuthorityFolderBatch({
			transferId: "transfer-1",
			items: [
				{
					kind: "asset",
					relativePath: "note.assets/image.png",
					contentHash: "hash",
					size: 5,
					storageId: "storage-1",
				},
			],
		});
		await backend.getAuthorityTransferStatus("transfer-1");

		expect(mutation.mock.calls[0]).toEqual([
			api.authorityTransfers.prepareGitFolderMove,
			expect.objectContaining({
				workspaceId: "workspace-1",
				parentFolderId: undefined,
			}),
		]);
		expect(mutation.mock.calls[1]).toEqual([
			api.authorityTransfers.stageAuthorityFolderBatch,
			{
				transferId: "transfer-1",
				items: [
					{
						kind: "asset",
						relativePath: "note.assets/image.png",
						contentHash: "hash",
						size: 5,
						storageId: "storage-1",
					},
				],
			},
		]);
		expect(query).toHaveBeenCalledWith(
			api.authorityTransfers.getAuthorityTransferStatus,
			{ transferId: "transfer-1" },
		);
	});

	it("maps cloud export and archive recovery to Convex function references", async () => {
		const backend = createConvexBackend("https://fake.convex.cloud", "token");
		await backend.getCloudFolderMovePreview("folder-1");
		await backend.prepareCloudFolderMove({
			operationKey: "operation-cloud-1",
			folderId: "folder-1",
			expectedPreviewFingerprint: "preview-1",
			destinationFingerprint: "destination-1",
		});
		await backend.getCloudFolderExportBatch({
			transferId: "transfer-cloud-1",
			afterPath: "guide.md",
		});
		await backend.archiveAuthorityFolder({
			transferId: "transfer-cloud-1",
			expectedPreviewFingerprint: "preview-1",
			destinationFingerprint: "destination-1",
		});
		await backend.restoreArchivedAuthorityFolder({
			transferId: "transfer-cloud-1",
			archiveFingerprint: "archive-1",
		});

		expect(query).toHaveBeenNthCalledWith(
			1,
			api.authorityTransfers.getCloudFolderMovePreview,
			{ folderId: "folder-1" },
		);
		expect(mutation).toHaveBeenNthCalledWith(
			1,
			api.authorityTransfers.prepareCloudFolderMove,
			expect.objectContaining({ folderId: "folder-1" }),
		);
		expect(query).toHaveBeenNthCalledWith(
			2,
			api.authorityTransfers.getCloudFolderExportBatch,
			{ transferId: "transfer-cloud-1", afterPath: "guide.md" },
		);
		expect(mutation).toHaveBeenNthCalledWith(
			2,
			api.authorityTransfers.archiveAuthorityFolder,
			expect.any(Object),
		);
		expect(mutation).toHaveBeenNthCalledWith(
			3,
			api.authorityTransfers.restoreArchivedAuthorityFolder,
			expect.any(Object),
		);
	});
});
