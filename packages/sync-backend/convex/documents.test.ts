/// <reference types="vite/client" />
import { register as registerProsemirrorSync } from "@convex-dev/prosemirror-sync/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Register the prosemirror-sync component so markdown projection/patch paths
// run in-process instead of throwing "Component ... is not registered".
function testInstance() {
	const t = convexTest(schema, modules);
	registerProsemirrorSync(t);
	return t;
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
	return t.withIdentity({ subject: `${userId}|session` });
}

// A document whose workspace owner is `ownerId`, so requireDocumentOwner passes
// for that user (workspace ownership confers the document "owner" role).
async function setupOwnedDocument(t: ReturnType<typeof convexTest>) {
	const ownerId = await t.run((ctx) =>
		ctx.db.insert("users", { email: "owner@example.com", name: "Owner" }),
	);
	const documentId = await t.run(async (ctx) => {
		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Team",
			ownerId,
			createdAt: Date.now(),
		});
		return ctx.db.insert("documents", {
			workspaceId,
			title: "Doc",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
	});
	return { ownerId, documentId };
}

describe("setUserShareByEmail", () => {
	test("known email creates a docShares row", async () => {
		const t = testInstance();
		const { ownerId, documentId } = await setupOwnedDocument(t);
		const targetId = await t.run((ctx) =>
			ctx.db.insert("users", { email: "target@example.com" }),
		);

		const result = await asUser(t, ownerId).mutation(
			api.documents.setUserShareByEmail,
			{ documentId, email: "Target@example.com", role: "editor" },
		);
		expect(result).toEqual({ status: "shared", userId: targetId });

		const share = await t.run((ctx) =>
			ctx.db
				.query("docShares")
				.withIndex("by_document_user", (q) =>
					q.eq("documentId", documentId).eq("userId", targetId),
				)
				.unique(),
		);
		expect(share?.role).toBe("editor");
	});

	test("unknown email creates a document invite without throwing", async () => {
		const t = testInstance();
		const { ownerId, documentId } = await setupOwnedDocument(t);

		const result = await asUser(t, ownerId).mutation(
			api.documents.setUserShareByEmail,
			{ documentId, email: "ghost@example.com", role: "viewer" },
		);
		expect(result).toEqual({ status: "invited", userId: null });

		const invites = await t.run((ctx) => ctx.db.query("invites").collect());
		expect(invites).toHaveLength(1);
		expect(invites[0]).toMatchObject({
			email: "ghost@example.com",
			documentId,
			documentRole: "viewer",
		});
		const shares = await t.run((ctx) => ctx.db.query("docShares").collect());
		expect(shares).toHaveLength(0);
	});
});

describe("dashboard", () => {
	test("returns owned/team recents plus direct shares outside member workspaces", async () => {
		const t = testInstance();
		const { ownerId, memberId, sharedWorkspaceId, sharedDocumentId } =
			await t.run(async (ctx) => {
				const ownerId = await ctx.db.insert("users", {
					email: "owner@example.com",
					name: "Owner",
				});
				const memberId = await ctx.db.insert("users", {
					email: "member@example.com",
					name: "Member",
				});
				const personalWorkspaceId = await ctx.db.insert("workspaces", {
					name: "Owner's space",
					ownerId,
					personal: true,
					createdAt: 1,
				});
				const teamWorkspaceId = await ctx.db.insert("workspaces", {
					name: "Team",
					ownerId,
					createdAt: 2,
				});
				await ctx.db.insert("members", {
					workspaceId: teamWorkspaceId,
					userId: ownerId,
					role: "owner",
					createdAt: 2,
				});
				await ctx.db.insert("documents", {
					workspaceId: personalWorkspaceId,
					title: "Private Doc",
					createdAt: 10,
					updatedAt: 10,
				});
				await ctx.db.insert("documents", {
					workspaceId: teamWorkspaceId,
					title: "Team Doc",
					createdAt: 20,
					updatedAt: 20,
				});

				const sharedWorkspaceId = await ctx.db.insert("workspaces", {
					name: "Partner",
					ownerId: memberId,
					createdAt: 3,
				});
				const sharedDocumentId = await ctx.db.insert("documents", {
					workspaceId: sharedWorkspaceId,
					title: "Shared Doc",
					createdAt: 30,
					updatedAt: 30,
				});
				await ctx.db.insert("docShares", {
					documentId: sharedDocumentId,
					userId: ownerId,
					role: "viewer",
					createdAt: 30,
					updatedAt: 30,
				});

				return { ownerId, memberId, sharedWorkspaceId, sharedDocumentId };
			});

		const result = await asUser(t, ownerId).query(api.documents.dashboard, {
			recentLimit: 10,
			sharedLimit: 10,
		});

		expect(result.workspaces.map((workspace) => workspace.name)).toEqual([
			"Owner's space",
			"Team",
		]);
		expect(result.recents.map((document) => document.title)).toEqual([
			"Shared Doc",
			"Team Doc",
			"Private Doc",
		]);
		expect(result.sharedWithMe).toHaveLength(1);
		expect(result.sharedWithMe[0]).toMatchObject({
			_id: sharedDocumentId,
			workspaceId: sharedWorkspaceId,
			workspaceName: "Partner",
			role: "viewer",
		});

		const otherResult = await asUser(t, memberId).query(
			api.documents.dashboard,
			{},
		);
		expect(otherResult.sharedWithMe).toHaveLength(0);
		expect(otherResult.recents.map((document) => document.title)).toEqual([
			"Shared Doc",
		]);
	});
});

describe("markEdited auto-snapshot", () => {
	test("throttles autosave when a recent revision already exists", async () => {
		const t = testInstance();
		const { ownerId, documentId } = await setupOwnedDocument(t);
		await t.run((ctx) =>
			ctx.db.insert("revisions", {
				documentId,
				createdAt: Date.now(),
				actor: "Owner",
				label: "Autosaved",
				pmDoc: null,
				markdown: "",
				revision: 0,
			}),
		);

		await asUser(t, ownerId).mutation(api.documents.markEdited, {
			documentId,
		});

		const revisions = await t.run((ctx) => ctx.db.query("revisions").collect());
		expect(revisions).toHaveLength(1);
	});
});

describe("Live Document cap UX", () => {
	test("importMarkdown rejects oversized documents with product copy", async () => {
		const t = testInstance();
		const { ownerId, workspaceId } = await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", {
				email: "owner@example.com",
				name: "Owner",
			});
			const workspaceId = await ctx.db.insert("workspaces", {
				name: "Team",
				ownerId,
				createdAt: 1,
			});
			return { ownerId, workspaceId };
		});

		await expect(
			asUser(t, ownerId).mutation(api.documents.importMarkdown, {
				workspaceId,
				path: "large.md",
				title: "Large",
				markdown: "a".repeat(256 * 1024 + 1),
				idempotencyKey: "large-import",
			}),
		).rejects.toThrow(
			"Live Documents currently support up to 256 KiB of markdown",
		);
	});
});

describe("importMarkdown", () => {
	async function setupFolderImport() {
		const t = testInstance();
		const setup = await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", {
				email: "import-owner@example.com",
				name: "Owner",
			});
			const guestId = await ctx.db.insert("users", {
				email: "import-guest@example.com",
				name: "Guest",
			});
			const workspaceId = await ctx.db.insert("workspaces", {
				name: "Team",
				ownerId,
				createdAt: 1,
			});
			const folderId = await ctx.db.insert("folders", {
				workspaceId,
				name: "Shared",
				createdAt: 1,
				updatedAt: 1,
			});
			await ctx.db.insert("folderShares", {
				folderId,
				userId: guestId,
				role: "editor",
				createdAt: 1,
				updatedAt: 1,
			});
			return { ownerId, guestId, workspaceId, folderId };
		});
		return { t, ...setup };
	}

	test("folder editors can retry an import without replacing its content", async () => {
		const { t, guestId, workspaceId, folderId } = await setupFolderImport();
		const first = await asUser(t, guestId).mutation(
			api.documents.importMarkdown,
			{
				workspaceId,
				folderId,
				path: "note.md",
				title: "Note",
				markdown: "# Original",
				idempotencyKey: "operation-1",
			},
		);
		const retry = await asUser(t, guestId).mutation(
			api.documents.importMarkdown,
			{
				workspaceId,
				folderId,
				path: "note.md",
				title: "Changed title",
				markdown: "# Replacement",
				idempotencyKey: "operation-1",
			},
		);

		expect(first.created).toBe(true);
		expect(retry).toMatchObject({
			documentId: first.documentId,
			created: false,
		});
		const imported = await asUser(t, guestId).query(api.documents.getForAgent, {
			documentId: first.documentId,
		});
		expect(imported?.markdown).toContain("Original");
		expect(imported?.markdown).not.toContain("Replacement");
	});

	test("a different import key preserves an existing destination collision", async () => {
		const { t, ownerId, workspaceId, folderId } = await setupFolderImport();
		const input = {
			workspaceId,
			folderId,
			path: "note.md",
			title: "Note",
			markdown: "# Original",
			idempotencyKey: "operation-1",
		};
		await asUser(t, ownerId).mutation(api.documents.importMarkdown, input);

		await expect(
			asUser(t, ownerId).mutation(api.documents.importMarkdown, {
				...input,
				markdown: "# Other",
				idempotencyKey: "operation-2",
			}),
		).rejects.toThrow("already exists in that destination");
	});
});

describe("listMentionCandidates", () => {
	test("returns workspace members and direct document shares", async () => {
		const t = testInstance();
		const { ownerId, documentId } = await setupOwnedDocument(t);
		const { memberId, sharedId } = await t.run(async (ctx) => {
			const document = await ctx.db.get(documentId);
			if (!document) throw new Error("missing document");
			const memberId = await ctx.db.insert("users", {
				email: "member@example.com",
				name: "Member Person",
			});
			const sharedId = await ctx.db.insert("users", {
				email: "shared@example.com",
				name: "Shared Person",
			});
			await ctx.db.insert("members", {
				workspaceId: document.workspaceId,
				userId: memberId,
				role: "member",
				createdAt: 1,
			});
			await ctx.db.insert("docShares", {
				documentId,
				userId: sharedId,
				role: "commenter",
				createdAt: 1,
				updatedAt: 1,
			});
			return { memberId, sharedId };
		});

		const result = await asUser(t, ownerId).query(
			api.documents.listMentionCandidates,
			{ documentId },
		);

		expect(result.map((candidate) => candidate.userId).sort()).toEqual(
			[ownerId, memberId, sharedId].sort(),
		);
		expect(result.map((candidate) => candidate.token).sort()).toEqual([
			"MemberPerson",
			"Owner",
			"SharedPerson",
		]);
	});
});

describe("permission regressions", () => {
	async function setupSharedDocument(t: ReturnType<typeof convexTest>) {
		return await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", {
				email: "owner@example.com",
				name: "Owner",
			});
			const commenterId = await ctx.db.insert("users", {
				email: "commenter@example.com",
				name: "Commenter",
			});
			const viewerId = await ctx.db.insert("users", {
				email: "viewer@example.com",
				name: "Viewer",
			});
			const workspaceMemberId = await ctx.db.insert("users", {
				email: "member@example.com",
				name: "Member",
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
			const documentId = await ctx.db.insert("documents", {
				workspaceId,
				title: "Doc",
				createdAt: 1,
				updatedAt: 1,
			});
			await ctx.db.insert("members", {
				workspaceId,
				userId: workspaceMemberId,
				role: "member",
				createdAt: 1,
			});
			for (const [userId, role] of [
				[commenterId, "commenter"],
				[viewerId, "viewer"],
			] as const) {
				await ctx.db.insert("docShares", {
					documentId,
					userId,
					role,
					createdAt: 1,
					updatedAt: 1,
				});
			}
			return {
				ownerId,
				commenterId,
				viewerId,
				workspaceMemberId,
				strangerId,
				workspaceId,
				documentId,
			};
		});
	}

	test("workspace members can open documents in that workspace", async () => {
		const t = testInstance();
		const { workspaceMemberId, documentId } = await setupSharedDocument(t);

		await expect(
			asUser(t, workspaceMemberId).query(api.documents.get, { documentId }),
		).resolves.toMatchObject({ _id: documentId, title: "Doc" });
	});

	test("viewer and commenter roles cannot apply editable document patches", async () => {
		const t = testInstance();
		const { commenterId, viewerId, documentId } = await setupSharedDocument(t);
		const patchArgs = {
			documentId,
			baseRevision: 0,
			intent: { kind: "append-markdown" as const, markdown: "\nDenied" },
		};

		await expect(
			asUser(t, viewerId).mutation(api.documents.applyPatch, patchArgs),
		).rejects.toThrow(/Unauthorized/);
		await expect(
			asUser(t, commenterId).mutation(api.documents.applyPatch, patchArgs),
		).rejects.toThrow(/Unauthorized/);
	});

	test("commenters can comment, viewers cannot create comments or suggestions", async () => {
		const t = testInstance();
		const { commenterId, viewerId, documentId } = await setupSharedDocument(t);

		await asUser(t, commenterId).mutation(api.documents.createCommentThread, {
			documentId,
			anchor: null,
			body: "Please review this.",
		});

		await expect(
			asUser(t, viewerId).mutation(api.documents.createCommentThread, {
				documentId,
				anchor: null,
				body: "I should not be able to comment.",
			}),
		).rejects.toThrow(/Unauthorized/);
		await expect(
			asUser(t, viewerId).mutation(api.documents.proposeSuggestion, {
				documentId,
				baseRevision: 0,
				intent: { kind: "append-markdown", markdown: "\nSuggestion" },
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	test("public viewer links do not grant write access", async () => {
		const t = testInstance();
		const { ownerId, strangerId, documentId } = await setupSharedDocument(t);
		await asUser(t, ownerId).mutation(api.documents.setLinkShare, {
			documentId,
			linkScope: "public",
			role: "viewer",
		});

		await expect(
			asUser(t, strangerId).query(api.documents.listCommentThreads, {
				documentId,
			}),
		).resolves.toEqual([]);
		await expect(
			asUser(t, strangerId).mutation(api.documents.applyPatch, {
				documentId,
				baseRevision: 0,
				intent: { kind: "append-markdown", markdown: "\nDenied" },
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	test("trash listing uses deleted-document roles, not broad workspace membership", async () => {
		const t = testInstance();
		const { ownerId, viewerId, documentId, workspaceId } =
			await setupSharedDocument(t);
		const workspaceMemberId = await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				email: "member@example.com",
				name: "Member",
			});
			await ctx.db.insert("members", {
				workspaceId,
				userId,
				role: "member",
				createdAt: 1,
			});
			return userId;
		});

		await asUser(t, ownerId).mutation(api.documents.remove, { documentId });

		const ownerTrash = await asUser(t, ownerId).query(api.documents.listTrash, {
			workspaceId,
		});
		const viewerTrash = await asUser(t, viewerId).query(
			api.documents.listTrash,
			{ workspaceId },
		);
		const memberTrash = await asUser(t, workspaceMemberId).query(
			api.documents.listTrash,
			{ workspaceId },
		);

		expect(ownerTrash.map((document) => document._id)).toEqual([documentId]);
		expect(viewerTrash.map((document) => document._id)).toEqual([documentId]);
		expect(memberTrash.map((document) => document._id)).toEqual([documentId]);
	});

	test("projection clients can distinguish cloud Trash from access loss", async () => {
		const t = testInstance();
		const { ownerId, documentId } = await setupSharedDocument(t);

		await expect(
			asUser(t, ownerId).query(api.documents.getTrashState, { documentId }),
		).resolves.toBe("active");
		await asUser(t, ownerId).mutation(api.documents.remove, { documentId });
		await expect(
			asUser(t, ownerId).query(api.documents.getTrashState, { documentId }),
		).resolves.toBe("trashed");
	});
});

describe("inherited folder roles across surfaces", () => {
	// Guest (no membership) with a single folderShares row on `rootFolderId`,
	// and a document nested one level deeper. Exercises the shared permission
	// seam through prosemirror sync, comments, and trash.
	async function setupInherited(
		t: ReturnType<typeof convexTest>,
		role: "editor" | "commenter" | "viewer",
	) {
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
			const documentId = await ctx.db.insert("documents", {
				workspaceId,
				folderId: childFolderId,
				title: "Nested Doc",
				createdAt: 1,
				updatedAt: 1,
			});
			await ctx.db.insert("folderShares", {
				folderId: rootFolderId,
				userId: guestId,
				role,
				createdAt: 1,
				updatedAt: 1,
			});
			return { ownerId, guestId, strangerId, workspaceId, documentId };
		});
	}

	test("prosemirror read honors inherited role; stranger is denied", async () => {
		const t = testInstance();
		const { guestId, strangerId, documentId } = await setupInherited(
			t,
			"viewer",
		);
		const id = `document:${documentId}`;
		await expect(
			asUser(t, guestId).query(api.prosemirror.getSnapshot, { id }),
		).resolves.toBeDefined();
		await expect(
			asUser(t, strangerId).query(api.prosemirror.getSnapshot, { id }),
		).rejects.toThrow(/Unauthorized/);
	});

	test("inherited editor can write; inherited viewer cannot", async () => {
		const t = testInstance();
		const editor = await setupInherited(t, "editor");
		// rename is write-gated (requireDocumentWrite) without needing a snapshot.
		await expect(
			asUser(t, editor.guestId).mutation(api.documents.rename, {
				documentId: editor.documentId,
				title: "Renamed",
			}),
		).resolves.toBeNull();

		const viewer = await setupInherited(t, "viewer");
		await expect(
			asUser(t, viewer.guestId).mutation(api.documents.rename, {
				documentId: viewer.documentId,
				title: "Nope",
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	test("inherited commenter can comment; inherited viewer cannot", async () => {
		const t = testInstance();
		const commenter = await setupInherited(t, "commenter");
		await expect(
			asUser(t, commenter.guestId).mutation(api.documents.createCommentThread, {
				documentId: commenter.documentId,
				anchor: null,
				body: "hi",
			}),
		).resolves.toBeDefined();

		const viewer = await setupInherited(t, "viewer");
		await expect(
			asUser(t, viewer.guestId).mutation(api.documents.createCommentThread, {
				documentId: viewer.documentId,
				anchor: null,
				body: "no",
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	test("trash honors inherited role", async () => {
		const t = testInstance();
		const { ownerId, guestId, workspaceId, documentId } = await setupInherited(
			t,
			"editor",
		);
		await asUser(t, ownerId).mutation(api.documents.remove, { documentId });
		const guestTrash = await asUser(t, guestId).query(api.documents.listTrash, {
			workspaceId,
		});
		expect(guestTrash.map((d) => d._id)).toEqual([documentId]);
	});

	test("history: inherited viewer can list revisions but cannot restore; inherited editor can restore", async () => {
		const t = testInstance();
		const viewer = await setupInherited(t, "viewer");
		const revisionId = await t.run((ctx) =>
			ctx.db.insert("revisions", {
				documentId: viewer.documentId,
				createdAt: 1,
				actor: "Owner",
				label: "Snapshot",
				pmDoc: null,
				markdown: "# Nested Doc\n\noriginal body",
				revision: 0,
			}),
		);
		// Read is inherited: a viewer sees the document history.
		await expect(
			asUser(t, viewer.guestId).query(api.documents.listRevisions, {
				documentId: viewer.documentId,
			}),
		).resolves.toHaveLength(1);
		// Restore is write-gated: an inherited viewer is denied.
		await expect(
			asUser(t, viewer.guestId).mutation(api.documents.restoreRevision, {
				revisionId,
			}),
		).rejects.toThrow(/Unauthorized/);

		// An inherited editor can restore a revision. Build the document through
		// the real create seam so it has a prosemirror snapshot to restore into,
		// then snapshot a revision via the write-gated materialize path.
		const editor = await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", {
				email: "owner2@example.com",
				name: "Owner",
			});
			const guestId = await ctx.db.insert("users", {
				email: "guest2@example.com",
				name: "Guest",
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
			await ctx.db.insert("folderShares", {
				folderId: rootFolderId,
				userId: guestId,
				role: "editor",
				createdAt: 1,
				updatedAt: 1,
			});
			return { ownerId, guestId, workspaceId, rootFolderId };
		});
		const editorDocId = await asUser(t, editor.ownerId).mutation(
			api.documents.create,
			{
				workspaceId: editor.workspaceId,
				folderId: editor.rootFolderId,
				title: "Nested Doc",
				markdown: "# Nested Doc\n\noriginal body",
			},
		);
		const editorRevisionId = await asUser(t, editor.ownerId).mutation(
			api.documents.materializeRevision,
			{ documentId: editorDocId, label: "Snapshot" },
		);
		await expect(
			asUser(t, editor.guestId).mutation(api.documents.restoreRevision, {
				revisionId: editorRevisionId,
			}),
		).resolves.toMatchObject({ documentId: editorDocId });
	});

	test("mentions: inherited commenter can list candidates; inherited viewer cannot", async () => {
		const t = testInstance();
		const commenter = await setupInherited(t, "commenter");
		// listMentionCandidates is comment-gated; the inherited commenter passes.
		await expect(
			asUser(t, commenter.guestId).query(api.documents.listMentionCandidates, {
				documentId: commenter.documentId,
			}),
		).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ userId: commenter.ownerId }),
			]),
		);

		const viewer = await setupInherited(t, "viewer");
		await expect(
			asUser(t, viewer.guestId).query(api.documents.listMentionCandidates, {
				documentId: viewer.documentId,
			}),
		).rejects.toThrow(/Unauthorized/);
	});
});
