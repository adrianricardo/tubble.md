/// <reference types="vite/client" />
import { register as registerProsemirrorSync } from "@convex-dev/prosemirror-sync/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Register the prosemirror-sync component so markdown projection/patch paths
// (used by listSharedWithMe / searchFolder / create-with-markdown) run
// in-process instead of throwing "Component ... is not registered".
function testInstance() {
	const t = convexTest(schema, modules);
	registerProsemirrorSync(t);
	return t;
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
	return t.withIdentity({ subject: `${userId}|session` });
}

// A workspace owned by `ownerId` with a nested folder tree:
//   root/  (folder)
//     child/  (folder)
//   plus one document in each folder. `guestId` is a user with NO membership.
async function setupFolderTree(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", {
			email: "owner@example.com",
			name: "Owner",
		});
		const guestId = await ctx.db.insert("users", {
			email: "guest@example.com",
			name: "Guest",
		});
		const strangerId = await ctx.db.insert("users", {
			email: "stranger@example.com",
			name: "Stranger",
		});
		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Team",
			ownerId,
			createdAt: 1,
		});
		const rootFolderId = await ctx.db.insert("folders", {
			workspaceId,
			name: "Root",
			createdAt: 1,
			updatedAt: 1,
		});
		const childFolderId = await ctx.db.insert("folders", {
			workspaceId,
			parentId: rootFolderId,
			name: "Child",
			createdAt: 1,
			updatedAt: 1,
		});
		const rootDocId = await ctx.db.insert("documents", {
			workspaceId,
			folderId: rootFolderId,
			title: "Root Doc",
			createdAt: 1,
			updatedAt: 1,
		});
		const childDocId = await ctx.db.insert("documents", {
			workspaceId,
			folderId: childFolderId,
			title: "Child Doc",
			createdAt: 2,
			updatedAt: 2,
		});
		const outsideDocId = await ctx.db.insert("documents", {
			workspaceId,
			title: "Outside Doc",
			createdAt: 3,
			updatedAt: 3,
		});
		return {
			ownerId,
			guestId,
			strangerId,
			workspaceId,
			rootFolderId,
			childFolderId,
			rootDocId,
			childDocId,
			outsideDocId,
		};
	});
}

async function shareFolder(
	t: ReturnType<typeof convexTest>,
	folderId: Id<"folders">,
	userId: Id<"users">,
	role: "owner" | "editor" | "commenter" | "viewer",
) {
	await t.run((ctx) =>
		ctx.db.insert("folderShares", {
			folderId,
			userId,
			role,
			createdAt: 1,
			updatedAt: 1,
		}),
	);
}

describe("folder context capabilities", () => {
	test("matches member and inherited folder authorization", async () => {
		const t = testInstance();
		const {
			ownerId,
			guestId,
			strangerId,
			workspaceId,
			rootFolderId,
			childFolderId,
			rootDocId,
			childDocId,
		} = await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "editor");

		await expect(
			asUser(t, ownerId).query(api.folders.getContextCapabilities, {
				workspaceId,
			}),
		).resolves.toEqual({ mode: "uniform", canWrite: true, canShare: true });
		await expect(
			asUser(t, guestId).query(api.folders.getContextCapabilities, {
				workspaceId,
				folderId: rootFolderId,
			}),
		).resolves.toEqual({
			mode: "per-node",
			canWrite: true,
			canShare: false,
			readableFolderIds: [rootFolderId, childFolderId],
			writableFolderIds: [rootFolderId, childFolderId],
			shareableFolderIds: [],
			writableDocumentIds: [rootDocId, childDocId],
		});
		await expect(
			asUser(t, strangerId).query(api.folders.getContextCapabilities, {
				workspaceId,
				folderId: rootFolderId,
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	test("lets an inherited folder owner manage sharing without membership", async () => {
		const t = testInstance();
		const {
			guestId,
			workspaceId,
			rootFolderId,
			childFolderId,
			rootDocId,
			childDocId,
		} = await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "owner");

		await expect(
			asUser(t, guestId).query(api.folders.getContextCapabilities, {
				workspaceId,
				folderId: rootFolderId,
			}),
		).resolves.toEqual({
			mode: "per-node",
			canWrite: true,
			canShare: true,
			readableFolderIds: [rootFolderId, childFolderId],
			writableFolderIds: [rootFolderId, childFolderId],
			shareableFolderIds: [rootFolderId, childFolderId],
			writableDocumentIds: [rootDocId, childDocId],
		});
	});

	test("preserves stronger capabilities on a descendant of a read-only root", async () => {
		const t = testInstance();
		const { guestId, workspaceId, rootFolderId, childFolderId, childDocId } =
			await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "viewer");
		await shareFolder(t, childFolderId, guestId, "owner");

		await expect(
			asUser(t, guestId).query(api.folders.getContextCapabilities, {
				workspaceId,
				folderId: rootFolderId,
			}),
		).resolves.toMatchObject({
			mode: "per-node",
			canWrite: false,
			canShare: false,
			writableFolderIds: [childFolderId],
			shareableFolderIds: [childFolderId],
			writableDocumentIds: [childDocId],
		});
	});
});

describe("folder inheritance", () => {
	test("inherited role flows down the subtree to nested documents", async () => {
		const t = testInstance();
		const { guestId, rootFolderId, rootDocId, childDocId, outsideDocId } =
			await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "editor");

		// Guest can read both the root and nested document...
		await expect(
			asUser(t, guestId).query(api.documents.get, { documentId: rootDocId }),
		).resolves.toMatchObject({ _id: rootDocId });
		await expect(
			asUser(t, guestId).query(api.documents.get, { documentId: childDocId }),
		).resolves.toMatchObject({ _id: childDocId });
		// ...but nothing outside the shared subtree.
		await expect(
			asUser(t, guestId).query(api.documents.get, { documentId: outsideDocId }),
		).rejects.toThrow(/Unauthorized/);
	});

	test("depth: a deep descendant inherits from the shared root", async () => {
		const t = testInstance();
		const { guestId, workspaceId, rootFolderId } = await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "viewer");
		const deepDocId = await t.run(async (ctx) => {
			let parentId = rootFolderId;
			for (let i = 0; i < 10; i++) {
				parentId = await ctx.db.insert("folders", {
					workspaceId,
					parentId,
					name: `L${i}`,
					createdAt: 1,
					updatedAt: 1,
				});
			}
			return ctx.db.insert("documents", {
				workspaceId,
				folderId: parentId,
				title: "Deep Doc",
				createdAt: 1,
				updatedAt: 1,
			});
		});
		await expect(
			asUser(t, guestId).query(api.documents.get, { documentId: deepDocId }),
		).resolves.toMatchObject({ _id: deepDocId });
	});

	test("additive: direct viewer + inherited editor resolves to editor", async () => {
		const t = testInstance();
		const { guestId, rootFolderId, childDocId } = await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "editor");
		await t.run((ctx) =>
			ctx.db.insert("docShares", {
				documentId: childDocId,
				userId: guestId,
				role: "viewer",
				createdAt: 1,
				updatedAt: 1,
			}),
		);
		// Editor can write (rename is write-gated); if it were subtractive the
		// viewer share would block it.
		await expect(
			asUser(t, guestId).mutation(api.documents.rename, {
				documentId: childDocId,
				title: "Renamed by editor",
			}),
		).resolves.toBeNull();
	});

	test("revocation removes subtree access", async () => {
		const t = testInstance();
		const { ownerId, guestId, rootFolderId, childDocId } =
			await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "editor");
		// Owner (workspace owner can manage) revokes the share.
		await asUser(t, ownerId).mutation(api.folders.removeFolderUserShare, {
			folderId: rootFolderId,
			userId: guestId,
		});
		await expect(
			asUser(t, guestId).query(api.documents.get, { documentId: childDocId }),
		).rejects.toThrow(/Unauthorized/);
	});

	test("public folder link grants inherited read", async () => {
		const t = testInstance();
		const { ownerId, strangerId, rootFolderId, childDocId } =
			await setupFolderTree(t);
		await asUser(t, ownerId).mutation(api.folders.setFolderLinkShare, {
			folderId: rootFolderId,
			role: "viewer",
		});
		await expect(
			asUser(t, strangerId).query(api.documents.get, {
				documentId: childDocId,
			}),
		).resolves.toMatchObject({ _id: childDocId });
		// Viewer link must not grant write.
		await expect(
			asUser(t, strangerId).mutation(api.documents.applyPatch, {
				documentId: childDocId,
				baseRevision: 0,
				intent: { kind: "append-markdown", markdown: "\ndenied" },
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	test("cycle guard: a parentId cycle does not hang authorization", async () => {
		const t = testInstance();
		const { guestId, workspaceId } = await setupFolderTree(t);
		const { aId, docId } = await t.run(async (ctx) => {
			const aId = await ctx.db.insert("folders", {
				workspaceId,
				name: "A",
				createdAt: 1,
				updatedAt: 1,
			});
			const bId = await ctx.db.insert("folders", {
				workspaceId,
				parentId: aId,
				name: "B",
				createdAt: 1,
				updatedAt: 1,
			});
			// Introduce a cycle: A's parent becomes B.
			await ctx.db.patch(aId, { parentId: bId });
			const docId = await ctx.db.insert("documents", {
				workspaceId,
				folderId: aId,
				title: "Cyclic Doc",
				createdAt: 1,
				updatedAt: 1,
			});
			await ctx.db.insert("folderShares", {
				folderId: aId,
				userId: guestId,
				role: "viewer",
				createdAt: 1,
				updatedAt: 1,
			});
			return { aId, docId };
		});
		expect(aId).toBeDefined();
		await expect(
			asUser(t, guestId).query(api.documents.get, { documentId: docId }),
		).resolves.toMatchObject({ _id: docId });
	});

	test("non-member sees nothing un-shared", async () => {
		const t = testInstance();
		const { guestId, rootDocId } = await setupFolderTree(t);
		await expect(
			asUser(t, guestId).query(api.documents.get, { documentId: rootDocId }),
		).rejects.toThrow(/Unauthorized/);
	});
});

describe("guest create + move", () => {
	test("editor guest can create a document inside the shared subtree", async () => {
		const t = testInstance();
		const { guestId, workspaceId, childFolderId } = await setupFolderTree(t);
		await shareFolder(t, childFolderId, guestId, "editor");
		const documentId = await asUser(t, guestId).mutation(api.documents.create, {
			workspaceId,
			folderId: childFolderId,
			title: "Guest Doc",
			markdown: "# Hello\n\nfrom the guest",
		});
		expect(documentId).toBeDefined();
		// No extra share row: the doc inherits (D12).
		const shares = await t.run((ctx) =>
			ctx.db
				.query("docShares")
				.withIndex("by_document", (q) => q.eq("documentId", documentId))
				.collect(),
		);
		expect(shares).toHaveLength(0);
		const projection = await asUser(t, guestId).query(
			api.documents.getWithMarkdown,
			{ documentId },
		);
		expect(projection?.markdown).toContain("from the guest");
	});

	test("viewer guest cannot create inside the subtree", async () => {
		const t = testInstance();
		const { guestId, workspaceId, childFolderId } = await setupFolderTree(t);
		await shareFolder(t, childFolderId, guestId, "viewer");
		await expect(
			asUser(t, guestId).mutation(api.documents.create, {
				workspaceId,
				folderId: childFolderId,
				title: "Nope",
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	test("guest cannot create outside any shared folder", async () => {
		const t = testInstance();
		const { guestId, workspaceId, rootFolderId } = await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "editor");
		await expect(
			asUser(t, guestId).mutation(api.documents.create, {
				workspaceId,
				title: "Root-level",
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	test("guest move that escapes the shared subtree is denied", async () => {
		const t = testInstance();
		const { guestId, rootFolderId, childDocId } = await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "editor");
		// Moving to workspace root (no folder) escapes the guest's subtree.
		await expect(
			asUser(t, guestId).mutation(api.folders.moveDocument, {
				documentId: childDocId,
				folderId: undefined,
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	test("guest can move a document within the shared subtree", async () => {
		const t = testInstance();
		const { guestId, rootFolderId, childFolderId, rootDocId } =
			await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "editor");
		await asUser(t, guestId).mutation(api.folders.moveDocument, {
			documentId: rootDocId,
			folderId: childFolderId,
		});
		const doc = await t.run((ctx) => ctx.db.get(rootDocId));
		expect(doc?.folderId).toBe(childFolderId);
	});

	test("prepare relocation atomically completes when inherited exposure is unchanged", async () => {
		const t = testInstance();
		const { ownerId, rootFolderId, childFolderId, rootDocId } =
			await setupFolderTree(t);
		const result = await asUser(t, ownerId).mutation(
			api.folders.prepareDocumentRelocation,
			{
				documentId: rootDocId,
				folderId: childFolderId,
				title: "Moved",
				path: "Child/Moved.md",
			},
		);
		expect(result).toEqual({ status: "completed" });
		const doc = await t.run((ctx) => ctx.db.get(rootDocId));
		expect(doc).toMatchObject({
			folderId: childFolderId,
			title: "Moved",
			path: "Child/Moved.md",
		});
		expect(rootFolderId).toBeDefined();
	});

	test("prepare relocation returns review impact without moving across exposure boundaries", async () => {
		const t = testInstance();
		const { ownerId, strangerId, workspaceId, rootDocId, rootFolderId } =
			await setupFolderTree(t);
		const destinationId = await t.run((ctx) =>
			ctx.db.insert("folders", {
				workspaceId,
				name: "External",
				repoName: "external-repo",
				createdAt: 1,
				updatedAt: 1,
			}),
		);
		await shareFolder(t, destinationId, strangerId, "viewer");
		const result = await asUser(t, ownerId).mutation(
			api.folders.prepareDocumentRelocation,
			{
				documentId: rootDocId,
				folderId: destinationId,
				title: "Root Doc",
				path: "External/Root Doc.md",
			},
		);
		expect(result).toMatchObject({
			status: "confirmation-required",
			impact: {
				gainingUserCount: 1,
				repoExposureChanged: true,
				userChanges: [
					{
						name: "Stranger",
						email: "stranger@example.com",
						fromRole: null,
						toRole: "viewer",
					},
				],
				repositoryChanges: [
					{
						change: "added",
						folderPath: "External",
						repoName: "external-repo",
					},
				],
			},
		});
		const doc = await t.run((ctx) => ctx.db.get(rootDocId));
		expect(doc?.folderId).toBe(rootFolderId);
	});

	test("confirm relocation applies a reviewed consequential move", async () => {
		const t = testInstance();
		const { ownerId, strangerId, workspaceId, rootDocId } =
			await setupFolderTree(t);
		const destinationId = await t.run((ctx) =>
			ctx.db.insert("folders", {
				workspaceId,
				name: "External",
				createdAt: 1,
				updatedAt: 1,
			}),
		);
		await shareFolder(t, destinationId, strangerId, "viewer");
		const prepared = await asUser(t, ownerId).mutation(
			api.folders.prepareDocumentRelocation,
			{
				documentId: rootDocId,
				folderId: destinationId,
				title: "Moved",
				path: "External/Moved.md",
			},
		);
		if (prepared.status !== "confirmation-required") {
			throw new Error("Expected confirmation-required relocation");
		}
		const confirmed = await asUser(t, ownerId).mutation(
			api.folders.confirmDocumentRelocation,
			{
				documentId: rootDocId,
				folderId: destinationId,
				title: "Moved",
				path: "External/Moved.md",
				fingerprint: prepared.fingerprint,
			},
		);
		expect(confirmed).toEqual({ status: "completed" });
		const doc = await t.run((ctx) => ctx.db.get(rootDocId));
		expect(doc).toMatchObject({
			folderId: destinationId,
			title: "Moved",
			path: "External/Moved.md",
		});
	});

	test("confirm relocation refreshes stale impact without moving", async () => {
		const t = testInstance();
		const { ownerId, strangerId, workspaceId, rootDocId, rootFolderId } =
			await setupFolderTree(t);
		const destinationId = await t.run((ctx) =>
			ctx.db.insert("folders", {
				workspaceId,
				name: "External",
				createdAt: 1,
				updatedAt: 1,
			}),
		);
		await shareFolder(t, destinationId, strangerId, "viewer");
		const prepared = await asUser(t, ownerId).mutation(
			api.folders.prepareDocumentRelocation,
			{
				documentId: rootDocId,
				folderId: destinationId,
				title: "Moved",
				path: "External/Moved.md",
			},
		);
		if (prepared.status !== "confirmation-required") {
			throw new Error("Expected confirmation-required relocation");
		}
		await shareFolder(t, destinationId, ownerId, "viewer");
		const refreshed = await asUser(t, ownerId).mutation(
			api.folders.confirmDocumentRelocation,
			{
				documentId: rootDocId,
				folderId: destinationId,
				title: "Moved",
				path: "External/Moved.md",
				fingerprint: prepared.fingerprint,
			},
		);
		expect(refreshed.status).toBe("confirmation-required");
		if (refreshed.status !== "confirmation-required") {
			throw new Error("Expected refreshed confirmation-required relocation");
		}
		expect(refreshed.fingerprint).not.toBe(prepared.fingerprint);
		const doc = await t.run((ctx) => ctx.db.get(rootDocId));
		expect(doc?.folderId).toBe(rootFolderId);
	});

	test("prepare relocation reviews inherited role changes for named people", async () => {
		const t = testInstance();
		const { ownerId, strangerId, workspaceId, rootDocId, rootFolderId } =
			await setupFolderTree(t);
		const destinationId = await t.run((ctx) =>
			ctx.db.insert("folders", {
				workspaceId,
				name: "Editors",
				createdAt: 1,
				updatedAt: 1,
			}),
		);
		await shareFolder(t, rootFolderId, strangerId, "viewer");
		await shareFolder(t, destinationId, strangerId, "editor");

		const result = await asUser(t, ownerId).mutation(
			api.folders.prepareDocumentRelocation,
			{
				documentId: rootDocId,
				folderId: destinationId,
				title: "Root Doc",
				path: "Editors/Root Doc.md",
			},
		);

		expect(result).toMatchObject({
			status: "confirmation-required",
			impact: {
				gainingUserCount: 0,
				losingUserCount: 0,
				userChanges: [
					{
						name: "Stranger",
						fromRole: "viewer",
						toRole: "editor",
					},
				],
			},
		});
		const document = await t.run((ctx) => ctx.db.get(rootDocId));
		expect(document?.folderId).toBe(rootFolderId);
	});
});

describe("folder share management + repo link", () => {
	test("setFolderUserShareByEmail: unknown email creates a folder invite", async () => {
		const t = testInstance();
		const { ownerId, rootFolderId } = await setupFolderTree(t);
		const result = await asUser(t, ownerId).mutation(
			api.folders.setFolderUserShareByEmail,
			{ folderId: rootFolderId, email: "New@Example.com", role: "editor" },
		);
		expect(result).toEqual({ status: "invited", userId: null });
		const invites = await t.run((ctx) => ctx.db.query("invites").collect());
		expect(invites).toHaveLength(1);
		expect(invites[0]).toMatchObject({
			email: "new@example.com",
			folderId: rootFolderId,
			folderRole: "editor",
		});
	});

	test("folder invite resolves to a folderShares row on signup", async () => {
		const t = testInstance();
		const { ownerId, rootFolderId } = await setupFolderTree(t);
		await asUser(t, ownerId).mutation(api.folders.setFolderUserShareByEmail, {
			folderId: rootFolderId,
			email: "invitee@example.com",
			role: "commenter",
		});
		const inviteeId = await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				email: "invitee@example.com",
				name: "Invitee",
			});
			return userId;
		});
		await t.run(async (ctx) => {
			const { resolveInvitesForUser } = await import("./members");
			await resolveInvitesForUser(ctx, inviteeId);
		});
		const shares = await t.run((ctx) =>
			ctx.db
				.query("folderShares")
				.withIndex("by_folder_user", (q) =>
					q.eq("folderId", rootFolderId).eq("userId", inviteeId),
				)
				.unique(),
		);
		expect(shares?.role).toBe("commenter");
		const invites = await t.run((ctx) => ctx.db.query("invites").collect());
		expect(invites).toHaveLength(0);
	});

	test("link share cannot be set to owner (type-capped) but editor works", async () => {
		const t = testInstance();
		const { ownerId, rootFolderId } = await setupFolderTree(t);
		await asUser(t, ownerId).mutation(api.folders.setFolderLinkShare, {
			folderId: rootFolderId,
			role: "editor",
		});
		const share = await t.run((ctx) =>
			ctx.db
				.query("folderShares")
				.withIndex("by_folder_link", (q) =>
					q.eq("folderId", rootFolderId).eq("linkScope", "public"),
				)
				.unique(),
		);
		expect(share?.role).toBe("editor");
	});

	test("inherited folder owner may manage shares; a viewer may not", async () => {
		const t = testInstance();
		const { guestId, strangerId, rootFolderId } = await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "owner");
		// Inherited owner can add a share.
		await expect(
			asUser(t, guestId).mutation(api.folders.setFolderUserShare, {
				folderId: rootFolderId,
				userId: strangerId,
				role: "viewer",
			}),
		).resolves.toBeNull();
		// A viewer cannot manage shares.
		await expect(
			asUser(t, strangerId).mutation(api.folders.setFolderUserShare, {
				folderId: rootFolderId,
				userId: guestId,
				role: "viewer",
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	test("setFolderRepoLink stores display metadata for any folder editor", async () => {
		const t = testInstance();
		const { guestId, rootFolderId } = await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "editor");
		await asUser(t, guestId).mutation(api.folders.setFolderRepoLink, {
			folderId: rootFolderId,
			repoName: "hubble.md",
			repoRemoteUrl: "git@github.com:acme/hubble.md.git",
		});
		const folder = await t.run((ctx) => ctx.db.get(rootFolderId));
		expect(folder?.repoName).toBe("hubble.md");
		expect(folder?.repoRemoteUrl).toBe("git@github.com:acme/hubble.md.git");
	});
});

describe("guest read paths", () => {
	test("listSubtree returns the shared subtree, denies non-members", async () => {
		const t = testInstance();
		const { guestId, strangerId, rootFolderId } = await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "viewer");
		const subtree = await asUser(t, guestId).query(api.folders.listSubtree, {
			folderId: rootFolderId,
		});
		expect(subtree?.role).toBe("viewer");
		expect(subtree?.folders.map((f) => f.name)).toContain("Child");
		expect(subtree?.documents.map((d) => d.title).sort()).toEqual([
			"Child Doc",
			"Root Doc",
		]);
		await expect(
			asUser(t, strangerId).query(api.folders.listSubtree, {
				folderId: rootFolderId,
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	test("listSharedWithMe returns top-most shared folder node with subtree", async () => {
		const t = testInstance();
		const { guestId, rootFolderId, childFolderId } = await setupFolderTree(t);
		// Share both root and child; only the top-most (root) should surface.
		await shareFolder(t, rootFolderId, guestId, "editor");
		await shareFolder(t, childFolderId, guestId, "editor");
		const result = await asUser(t, guestId).query(
			api.documents.listSharedWithMe,
			{},
		);
		expect(result.folders).toHaveLength(1);
		expect(result.folders[0]?.folderId).toBe(rootFolderId);
		expect(result.folders[0]?.role).toBe("editor");
		expect(result.folders[0]?.documents.map((d) => d.title).sort()).toEqual([
			"Child Doc",
			"Root Doc",
		]);
		// Relative path is set for the nested document.
		const childDoc = result.folders[0]?.documents.find(
			(d) => d.title === "Child Doc",
		);
		expect(childDoc?.relativePath).toBe("Child");
	});

	test("searchFolder covers exactly the shared subtree", async () => {
		const t = testInstance();
		const { ownerId, guestId, workspaceId, rootFolderId, childFolderId } =
			await setupFolderTree(t);
		await shareFolder(t, rootFolderId, guestId, "viewer");
		// Owner seeds a document with searchable markdown inside the subtree.
		const seededId = await asUser(t, ownerId).mutation(api.documents.create, {
			workspaceId,
			folderId: childFolderId,
			title: "Seeded",
			markdown: "# Seeded\n\nneedle-token lives here",
		});
		const results = await asUser(t, guestId).query(api.documents.searchFolder, {
			folderId: rootFolderId,
			query: "needle-token",
		});
		expect(results.map((r) => r.documentId)).toContain(seededId);
	});
});

describe("BRAIN.md seed seam (RB5, D13/D14)", () => {
	test("create-with-markdown seeds BRAIN.md at the folder root as a normal Live Document", async () => {
		const t = testInstance();
		const { ownerId, workspaceId, rootFolderId } = await setupFolderTree(t);

		// The desktop link flow calls the RB1 create seam — no dedicated mutation.
		const brainId = await asUser(t, ownerId).mutation(api.documents.create, {
			workspaceId,
			folderId: rootFolderId,
			title: "BRAIN",
			path: "BRAIN.md",
			markdown: "# BRAIN.md\n\nThese files are live shared context.\n",
			actor: "repo-link-seed",
		});

		// It projects like any other doc in the subtree, with its markdown.
		const docs = await asUser(t, ownerId).query(
			api.documents.listFolderWithMarkdown,
			{ folderId: rootFolderId },
		);
		const brain = docs.find((doc) => doc._id === brainId);
		expect(brain).toBeDefined();
		expect(brain?.path).toBe("BRAIN.md");
		expect(brain?.relativePath).toBe("");
		expect(brain?.markdown).toContain("live shared context");

		// Folder-scoped create adds NO extra share row — access is inherited (D12),
		// so a folder guest sees BRAIN.md through the folder share alone.
		const shareRows = await t.run(async (ctx) =>
			ctx.db
				.query("docShares")
				.withIndex("by_document", (q) => q.eq("documentId", brainId))
				.collect(),
		);
		expect(shareRows).toHaveLength(0);

		// Seed-once is the caller's guard: the second-link path detects the
		// existing BRAIN.md (any case) from this listing and skips creating —
		// nothing here overwrites the first document.
		expect(
			docs.filter((doc) => doc.title.toLowerCase() === "brain"),
		).toHaveLength(1);
	});
});
