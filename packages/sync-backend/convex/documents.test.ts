/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

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
		const t = convexTest(schema, modules);
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
		const t = convexTest(schema, modules);
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
		const t = convexTest(schema, modules);
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
