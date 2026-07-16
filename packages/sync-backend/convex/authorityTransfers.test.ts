/// <reference types="vite/client" />
import { register as registerProsemirrorSync } from "@convex-dev/prosemirror-sync/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function testInstance() {
	const instance = convexTest(schema, modules);
	registerProsemirrorSync(instance);
	return instance;
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
	return t.withIdentity({ subject: `${userId}|session` });
}

async function hash(content: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(content),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

async function setup(t: ReturnType<typeof convexTest>) {
	return t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", {
			email: "owner@example.com",
			name: "Owner",
		});
		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Private",
			ownerId,
			createdAt: 1,
		});
		await ctx.db.insert("members", {
			workspaceId,
			userId: ownerId,
			role: "owner",
			createdAt: 1,
		});
		return { ownerId, workspaceId };
	});
}

async function prepareOneMarkdown(
	t: ReturnType<typeof convexTest>,
	ownerId: Id<"users">,
	workspaceId: Id<"workspaces">,
	operationKey = "operation-1",
	requestedShares: Array<{
		email: string;
		role: "editor" | "commenter" | "viewer";
	}> = [],
) {
	const markdown = "# Hidden until cutover\n";
	const contentHash = await hash(markdown);
	const { fingerprint: expectedAudienceFingerprint } = await asUser(
		t,
		ownerId,
	).query(api.authorityTransfers.getGitFolderMoveAudience, {
		workspaceId,
		rootName: "Moved notes",
		requestedShares,
	});
	const prepared = await asUser(t, ownerId).mutation(
		api.authorityTransfers.prepareGitFolderMove,
		{
			operationKey,
			workspaceId,
			rootName: "Moved notes",
			manifestHash: "manifest-1",
			manifestItemCount: 1,
			manifestMarkdownCount: 1,
			manifestAssetCount: 0,
			manifestTotalBytes: new TextEncoder().encode(markdown).byteLength,
			sourceFingerprint: "source-1",
			destinationFingerprint: "destination-1",
			expectedAudienceFingerprint,
			requestedShares,
		},
	);
	return { ...prepared, markdown, contentHash };
}

describe("Git-to-cloud authority staging", () => {
	test("rejects ordinary mutations that target a staged folder ID", async () => {
		const t = testInstance();
		const { ownerId, workspaceId } = await setup(t);
		const user = asUser(t, ownerId);
		const activeFolderId = await user.mutation(api.folders.create, {
			workspaceId,
			name: "Active folder",
		});
		const activeDocumentId = await user.mutation(api.documents.create, {
			workspaceId,
			title: "Active document",
		});
		const prepared = await prepareOneMarkdown(t, ownerId, workspaceId);
		const stagedFolderId = prepared.rootFolderId as Id<"folders">;

		await expect(
			user.mutation(api.folders.create, {
				workspaceId,
				parentId: stagedFolderId,
				name: "Injected folder",
			}),
		).rejects.toThrow(/Unauthorized/);
		await expect(
			user.mutation(api.documents.create, {
				workspaceId,
				folderId: stagedFolderId,
				title: "Injected document",
			}),
		).rejects.toThrow(/Folder not found/);
		await expect(
			user.mutation(api.documents.importMarkdown, {
				workspaceId,
				folderId: stagedFolderId,
				path: "injected.md",
				title: "Injected import",
				markdown: "# Injected\n",
				idempotencyKey: "injected-import",
			}),
		).rejects.toThrow(/Folder not found/);
		await expect(
			user.mutation(api.folders.move, {
				folderId: activeFolderId,
				parentId: stagedFolderId,
			}),
		).rejects.toThrow(/Parent folder not found/);
		await expect(
			user.mutation(api.folders.moveDocument, {
				documentId: activeDocumentId,
				folderId: stagedFolderId,
			}),
		).rejects.toThrow(/Folder not found/);
		await expect(
			user.mutation(api.folders.prepareDocumentRelocation, {
				documentId: activeDocumentId,
				folderId: stagedFolderId,
				title: "Active document",
				path: "active-document.md",
			}),
		).rejects.toThrow(/Folder not found/);
	});

	test("keeps staged descendants invisible until verified activation", async () => {
		const t = testInstance();
		const { ownerId, workspaceId } = await setup(t);
		const prepared = await prepareOneMarkdown(t, ownerId, workspaceId);

		const staged = await asUser(t, ownerId).mutation(
			api.authorityTransfers.stageAuthorityFolderBatch,
			{
				transferId: prepared.transferId,
				items: [
					{
						kind: "markdown",
						relativePath: "guide/readme.md",
						contentHash: prepared.contentHash,
						size: new TextEncoder().encode(prepared.markdown).byteLength,
						markdown: prepared.markdown,
					},
				],
			},
		);
		expect(staged).toMatchObject({ created: 1, stagedItemCount: 1 });

		const snapshot = await t.run(async (ctx) => ({
			root: prepared.rootFolderId
				? await ctx.db.get(prepared.rootFolderId)
				: null,
			document: await ctx.db
				.query("documents")
				.withIndex("by_workspace", (query) =>
					query.eq("workspaceId", workspaceId),
				)
				.unique(),
		}));
		expect(snapshot.root?.authorityState).toBe("staging");
		expect(snapshot.document).not.toBeNull();

		await expect(
			asUser(t, ownerId).query(api.folders.list, { workspaceId }),
		).resolves.toEqual([]);
		await expect(
			asUser(t, ownerId).query(api.documents.listWithMarkdown, {
				workspaceId,
			}),
		).resolves.toEqual([]);
		await expect(
			asUser(t, ownerId).query(api.documents.search, {
				workspaceId,
				query: "Hidden",
			}),
		).resolves.toEqual([]);
		await expect(
			asUser(t, ownerId).query(api.documents.searchAll, {
				query: "Hidden",
			}),
		).resolves.toEqual([]);
		await expect(
			asUser(t, ownerId).query(api.documents.dashboard, {}),
		).resolves.toMatchObject({ recents: [] });
		await expect(
			asUser(t, ownerId).query(api.folders.listSubtree, {
				folderId: prepared.rootFolderId as Id<"folders">,
			}),
		).rejects.toThrow(/Unauthorized/);
		await expect(
			asUser(t, ownerId).query(api.documents.get, {
				documentId: snapshot.document?._id as Id<"documents">,
			}),
		).rejects.toThrow(/Unauthorized/);

		const verified = await asUser(t, ownerId).mutation(
			api.authorityTransfers.verifyAuthorityStaging,
			{
				transferId: prepared.transferId,
				manifestHash: "manifest-1",
			},
		);
		await asUser(t, ownerId).mutation(
			api.authorityTransfers.activateAuthorityFolder,
			{
				transferId: prepared.transferId,
				cutoverToken: verified.cutoverToken,
				sourceFingerprint: "source-1",
				destinationFingerprint: "destination-1",
			},
		);

		await expect(
			asUser(t, ownerId).query(api.folders.list, { workspaceId }),
		).resolves.toHaveLength(2);
		await expect(
			asUser(t, ownerId).query(api.documents.getWithMarkdown, {
				documentId: snapshot.document?._id as Id<"documents">,
			}),
		).resolves.toMatchObject({ markdown: prepared.markdown });
	});

	test("applies reviewed Share recipients atomically with activation", async () => {
		const t = testInstance();
		const { ownerId, workspaceId } = await setup(t);
		const recipientId = await t.run((ctx) =>
			ctx.db.insert("users", {
				email: "recipient@example.com",
				name: "Recipient",
			}),
		);
		const requestedShares = [
			{ email: "recipient@example.com", role: "editor" as const },
			{ email: "pending@example.com", role: "viewer" as const },
		];
		const prepared = await prepareOneMarkdown(
			t,
			ownerId,
			workspaceId,
			"share-operation",
			requestedShares,
		);
		expect(prepared.audience).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "folderShare",
					email: "recipient@example.com",
					role: "editor",
				}),
				expect.objectContaining({
					kind: "invite",
					email: "pending@example.com",
					role: "viewer",
				}),
			]),
		);
		await asUser(t, ownerId).mutation(
			api.authorityTransfers.stageAuthorityFolderBatch,
			{
				transferId: prepared.transferId,
				items: [
					{
						kind: "markdown",
						relativePath: "readme.md",
						contentHash: prepared.contentHash,
						size: new TextEncoder().encode(prepared.markdown).byteLength,
						markdown: prepared.markdown,
					},
				],
			},
		);
		const verified = await asUser(t, ownerId).mutation(
			api.authorityTransfers.verifyAuthorityStaging,
			{ transferId: prepared.transferId, manifestHash: "manifest-1" },
		);
		await asUser(t, ownerId).mutation(
			api.authorityTransfers.activateAuthorityFolder,
			{
				transferId: prepared.transferId,
				cutoverToken: verified.cutoverToken,
				sourceFingerprint: "source-1",
				destinationFingerprint: "destination-1",
			},
		);

		const access = await t.run(async (ctx) => ({
			share: await ctx.db
				.query("folderShares")
				.withIndex("by_folder_user", (query) =>
					query
						.eq("folderId", prepared.rootFolderId as Id<"folders">)
						.eq("userId", recipientId),
				)
				.unique(),
			invite: await ctx.db
				.query("invites")
				.withIndex("by_folder_email", (query) =>
					query
						.eq("folderId", prepared.rootFolderId as Id<"folders">)
						.eq("email", "pending@example.com"),
				)
				.unique(),
		}));
		expect(access.share?.role).toBe("editor");
		expect(access.invite?.folderRole).toBe("viewer");
	});

	test("verifies uploaded asset metadata and hides it with the staging root", async () => {
		const t = testInstance();
		const { ownerId, workspaceId } = await setup(t);
		const markdown = "![diagram](readme.assets/diagram.png)\n";
		const asset = new TextEncoder().encode("binary fixture");
		const markdownHash = await hash(markdown);
		const storageId = await t.run(async (ctx) =>
			(
				ctx.storage as unknown as {
					store(blob: Blob): Promise<Id<"_storage">>;
				}
			).store(new Blob([asset])),
		);
		// convex-test's synthetic storage hash is authoritative for its in-memory
		// blob, just as the Convex _storage system row is in production.
		const assetHash = await t.run(async (ctx) => {
			const metadata = await ctx.db.system.get("_storage", storageId);
			if (!metadata) throw new Error("Test storage metadata is missing");
			return metadata.sha256;
		});
		const prepared = await asUser(t, ownerId).mutation(
			api.authorityTransfers.prepareGitFolderMove,
			{
				operationKey: "operation-assets",
				workspaceId,
				rootName: "Assets",
				manifestHash: "manifest-assets",
				manifestItemCount: 2,
				manifestMarkdownCount: 1,
				manifestAssetCount: 1,
				manifestTotalBytes:
					new TextEncoder().encode(markdown).byteLength + asset.byteLength,
				sourceFingerprint: "source-assets",
				destinationFingerprint: "destination-assets",
				expectedAudienceFingerprint: (
					await asUser(t, ownerId).query(
						api.authorityTransfers.getGitFolderMoveAudience,
						{ workspaceId, rootName: "Assets" },
					)
				).fingerprint,
			},
		);
		await asUser(t, ownerId).mutation(
			api.authorityTransfers.stageAuthorityFolderBatch,
			{
				transferId: prepared.transferId,
				items: [
					{
						kind: "markdown",
						relativePath: "readme.md",
						contentHash: markdownHash,
						size: new TextEncoder().encode(markdown).byteLength,
						markdown,
					},
					{
						kind: "asset",
						relativePath: "readme.assets/diagram.png",
						contentHash: assetHash,
						size: asset.byteLength,
						storageId,
					},
				],
			},
		);
		await expect(
			asUser(t, ownerId).query(api.sync.getAssetsByWorkspace, {
				workspaceId,
			}),
		).resolves.toEqual([]);
		await expect(
			asUser(t, ownerId).query(api.sync.getAssetDownloadUrl, { storageId }),
		).resolves.toBeNull();
		const verified = await asUser(t, ownerId).mutation(
			api.authorityTransfers.verifyAuthorityStaging,
			{ transferId: prepared.transferId, manifestHash: "manifest-assets" },
		);
		await asUser(t, ownerId).mutation(
			api.authorityTransfers.activateAuthorityFolder,
			{
				transferId: prepared.transferId,
				cutoverToken: verified.cutoverToken,
				sourceFingerprint: "source-assets",
				destinationFingerprint: "destination-assets",
			},
		);
		await expect(
			asUser(t, ownerId).query(api.sync.getAssetsByWorkspace, {
				workspaceId,
			}),
		).resolves.toHaveLength(1);
		const cloudPreview = await asUser(t, ownerId).query(
			api.authorityTransfers.getCloudFolderMovePreview,
			{ folderId: prepared.rootFolderId as Id<"folders"> },
		);
		expect(cloudPreview.manifest).toMatchObject({
			itemCount: 2,
			markdownCount: 1,
			assetCount: 1,
		});
		expect(cloudPreview.manifest.items).toContainEqual(
			expect.objectContaining({
				kind: "asset",
				relativePath: "readme.assets/diagram.png",
				contentHash: assetHash,
				size: asset.byteLength,
			}),
		);
	});

	test("makes batch retries idempotent and rejects changed bytes", async () => {
		const t = testInstance();
		const { ownerId, workspaceId } = await setup(t);
		const prepared = await prepareOneMarkdown(t, ownerId, workspaceId);
		const item = {
			kind: "markdown" as const,
			relativePath: "readme.md",
			contentHash: prepared.contentHash,
			size: new TextEncoder().encode(prepared.markdown).byteLength,
			markdown: prepared.markdown,
		};
		await asUser(t, ownerId).mutation(
			api.authorityTransfers.stageAuthorityFolderBatch,
			{ transferId: prepared.transferId, items: [item] },
		);
		await expect(
			asUser(t, ownerId).mutation(
				api.authorityTransfers.stageAuthorityFolderBatch,
				{ transferId: prepared.transferId, items: [item] },
			),
		).resolves.toMatchObject({ created: 0, stagedItemCount: 1 });
		await expect(
			asUser(t, ownerId).mutation(
				api.authorityTransfers.stageAuthorityFolderBatch,
				{
					transferId: prepared.transferId,
					items: [{ ...item, contentHash: "changed" }],
				},
			),
		).rejects.toThrow(/Staged item changed/);
	});

	test("cancels only operation-owned hidden staging in bounded batches", async () => {
		const t = testInstance();
		const { ownerId, workspaceId } = await setup(t);
		const prepared = await prepareOneMarkdown(t, ownerId, workspaceId);
		await asUser(t, ownerId).mutation(
			api.authorityTransfers.stageAuthorityFolderBatch,
			{
				transferId: prepared.transferId,
				items: [
					{
						kind: "markdown",
						relativePath: "nested/readme.md",
						contentHash: prepared.contentHash,
						size: new TextEncoder().encode(prepared.markdown).byteLength,
						markdown: prepared.markdown,
					},
				],
			},
		);
		let done = false;
		for (let attempts = 0; attempts < 5 && !done; attempts++) {
			({ done } = await asUser(t, ownerId).mutation(
				api.authorityTransfers.cancelAuthorityTransferBatch,
				{ transferId: prepared.transferId },
			));
		}
		expect(done).toBe(true);
		const rows = await t.run(async (ctx) => ({
			transfer: await ctx.db.get(prepared.transferId),
			folders: await ctx.db
				.query("folders")
				.withIndex("by_workspace", (candidate) =>
					candidate.eq("workspaceId", workspaceId),
				)
				.collect(),
			documents: await ctx.db
				.query("documents")
				.withIndex("by_workspace", (candidate) =>
					candidate.eq("workspaceId", workspaceId),
				)
				.collect(),
		}));
		expect(rows.transfer?.state).toBe("cancelled");
		expect(rows.folders).toEqual([]);
		expect(rows.documents).toEqual([]);
	});

	test("reauthorizes audience and rejects stale cutover fingerprints", async () => {
		const t = testInstance();
		const { ownerId, workspaceId } = await setup(t);
		const prepared = await prepareOneMarkdown(t, ownerId, workspaceId);
		await asUser(t, ownerId).mutation(
			api.authorityTransfers.stageAuthorityFolderBatch,
			{
				transferId: prepared.transferId,
				items: [
					{
						kind: "markdown",
						relativePath: "readme.md",
						contentHash: prepared.contentHash,
						size: new TextEncoder().encode(prepared.markdown).byteLength,
						markdown: prepared.markdown,
					},
				],
			},
		);
		const verified = await asUser(t, ownerId).mutation(
			api.authorityTransfers.verifyAuthorityStaging,
			{ transferId: prepared.transferId, manifestHash: "manifest-1" },
		);
		await t.run(async (ctx) => {
			const guestId = await ctx.db.insert("users", {
				email: "guest@example.com",
				name: "Guest",
			});
			await ctx.db.insert("members", {
				workspaceId,
				userId: guestId,
				role: "member",
				createdAt: 2,
			});
		});
		await expect(
			asUser(t, ownerId).mutation(
				api.authorityTransfers.activateAuthorityFolder,
				{
					transferId: prepared.transferId,
					cutoverToken: verified.cutoverToken,
					sourceFingerprint: "source-1",
					destinationFingerprint: "destination-1",
				},
			),
		).rejects.toThrow(/preview is stale/);
	});

	test("denies direct reads beneath archived authority roots", async () => {
		const t = testInstance();
		const { ownerId, workspaceId } = await setup(t);
		const documentId = await t.run(async (ctx) => {
			const folderId = await ctx.db.insert("folders", {
				workspaceId,
				name: "Archived",
				createdAt: 1,
				updatedAt: 1,
				authorityState: "archivedToGit",
			});
			return ctx.db.insert("documents", {
				workspaceId,
				folderId,
				title: "Secret",
				createdAt: 1,
				updatedAt: 1,
			});
		});
		await expect(
			asUser(t, ownerId).query(api.documents.get, { documentId }),
		).rejects.toThrow(/Unauthorized/);
		await expect(
			asUser(t, ownerId).query(api.folders.list, { workspaceId }),
		).resolves.toEqual([]);
	});

	test("previews, exports, archives, and restores an exact cloud folder", async () => {
		const t = testInstance();
		const { ownerId, workspaceId } = await setup(t);
		const user = asUser(t, ownerId);
		const folderId = await user.mutation(api.folders.create, {
			workspaceId,
			name: "Cloud notes",
		});
		const nestedId = await user.mutation(api.folders.create, {
			workspaceId,
			parentId: folderId,
			name: "Guide",
		});
		const documentId = await user.mutation(api.documents.create, {
			workspaceId,
			folderId: nestedId,
			title: "Read me",
			path: "Cloud notes/Guide/readme.md",
			markdown: "# Exact cloud bytes\n",
		});
		const archivedChildId = await t.run(async (ctx) =>
			ctx.db.insert("folders", {
				workspaceId,
				parentId: folderId,
				name: "Independent Git project",
				createdAt: 2,
				updatedAt: 2,
				authorityState: "archivedToGit",
			}),
		);
		await t.run(async (ctx) => {
			await ctx.db.insert("folderShares", {
				folderId,
				linkScope: "public",
				role: "viewer",
				createdAt: 2,
				updatedAt: 2,
			});
			await ctx.db.insert("revisions", {
				documentId,
				createdAt: 2,
				pmDoc: null,
				markdown: "# Earlier bytes\n",
				revision: 1,
			});
		});

		const preview = await user.query(
			api.authorityTransfers.getCloudFolderMovePreview,
			{ folderId },
		);
		expect(preview).toMatchObject({
			manifest: {
				itemCount: 1,
				markdownCount: 1,
				assetCount: 0,
				excludedAuthorityRoots: [
					{
						folderId: archivedChildId,
						relativePath: "Independent Git project",
						authority: "git",
					},
				],
			},
			audience: { publicLinkRole: "viewer" },
			history: { documentCount: 1, revisionCount: 1 },
			recovery: { kind: "cloudArchive", expiresAt: null },
		});
		expect(preview.manifest.items[0]?.relativePath).toBe("Guide/readme.md");

		const prepared = await user.mutation(
			api.authorityTransfers.prepareCloudFolderMove,
			{
				operationKey: "cloud-to-git-1",
				folderId,
				expectedPreviewFingerprint: preview.previewFingerprint,
				destinationFingerprint: "git-destination-1",
			},
		);
		const exported = await user.query(
			api.authorityTransfers.getCloudFolderExportBatch,
			{ transferId: prepared.transferId },
		);
		expect(exported).toMatchObject({
			items: [
				{
					kind: "markdown",
					relativePath: "Guide/readme.md",
					markdown: "# Exact cloud bytes\n",
				},
			],
			nextPath: null,
		});

		const archived = await user.mutation(
			api.authorityTransfers.archiveAuthorityFolder,
			{
				transferId: prepared.transferId,
				expectedPreviewFingerprint: preview.previewFingerprint,
				destinationFingerprint: "git-destination-1",
			},
		);
		await expect(user.query(api.documents.get, { documentId })).rejects.toThrow(
			/Unauthorized/,
		);
		await expect(
			user.query(api.folders.list, { workspaceId }),
		).resolves.toEqual([]);

		await user.mutation(api.authorityTransfers.restoreArchivedAuthorityFolder, {
			transferId: prepared.transferId,
			archiveFingerprint: archived.archiveFingerprint,
		});
		await expect(
			user.query(api.documents.getWithMarkdown, { documentId }),
		).resolves.toMatchObject({ markdown: "# Exact cloud bytes\n" });
	});

	test("rejects archive when cloud content changes after prepare", async () => {
		const t = testInstance();
		const { ownerId, workspaceId } = await setup(t);
		const user = asUser(t, ownerId);
		const folderId = await user.mutation(api.folders.create, {
			workspaceId,
			name: "Changing cloud folder",
		});
		await user.mutation(api.documents.create, {
			workspaceId,
			folderId,
			title: "First",
			markdown: "First\n",
		});
		const preview = await user.query(
			api.authorityTransfers.getCloudFolderMovePreview,
			{ folderId },
		);
		const prepared = await user.mutation(
			api.authorityTransfers.prepareCloudFolderMove,
			{
				operationKey: "cloud-to-git-stale",
				folderId,
				expectedPreviewFingerprint: preview.previewFingerprint,
				destinationFingerprint: "git-destination-stale",
			},
		);
		await user.mutation(api.documents.create, {
			workspaceId,
			folderId,
			title: "Concurrent",
			markdown: "Concurrent edit\n",
		});
		await expect(
			user.mutation(api.authorityTransfers.archiveAuthorityFolder, {
				transferId: prepared.transferId,
				expectedPreviewFingerprint: preview.previewFingerprint,
				destinationFingerprint: "git-destination-stale",
			}),
		).rejects.toThrow(/stale/);
		await expect(
			user.query(api.folders.list, { workspaceId }),
		).resolves.toHaveLength(1);
	});

	test("requires folder-manage permission rather than ordinary edit access", async () => {
		const t = testInstance();
		const { ownerId, workspaceId } = await setup(t);
		const folderId = await asUser(t, ownerId).mutation(api.folders.create, {
			workspaceId,
			name: "Managed cloud folder",
		});
		await asUser(t, ownerId).mutation(api.documents.create, {
			workspaceId,
			folderId,
			title: "Readable",
			markdown: "Readable\n",
		});
		const memberId = await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				email: "member@example.com",
				name: "Member",
			});
			await ctx.db.insert("members", {
				workspaceId,
				userId,
				role: "member",
				createdAt: 2,
			});
			return userId;
		});
		await expect(
			asUser(t, memberId).query(
				api.authorityTransfers.getCloudFolderMovePreview,
				{ folderId },
			),
		).rejects.toThrow(/Unauthorized/);
		const copyPreview = await asUser(t, memberId).query(
			api.authorityTransfers.getCloudFolderExportCopyPreview,
			{ folderId },
		);
		expect(copyPreview.manifest.markdownCount).toBe(1);
		const copyBatch = await asUser(t, memberId).query(
			api.authorityTransfers.getCloudFolderExportCopyBatch,
			{
				folderId,
				expectedPreviewFingerprint: copyPreview.previewFingerprint,
			},
		);
		expect(copyBatch.items).toHaveLength(1);
	});
});
