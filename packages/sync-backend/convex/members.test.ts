/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	ensurePersonalWorkspace,
	resolveInvitesForUser,
	upsertDocumentInvite,
	upsertWorkspaceInvite,
} from "./members";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// getAuthUserId() parses the user id out of identity.subject ("<userId>|<session>").
function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
	return t.withIdentity({ subject: `${userId}|session` });
}

describe("ensurePersonalWorkspace", () => {
	test("provisions one personal workspace + owner membership, idempotently", async () => {
		const t = convexTest(schema, modules);
		const userId = await t.run((ctx) =>
			ctx.db.insert("users", { email: "a@example.com", name: "Aaa" }),
		);

		await t.run((ctx) => ensurePersonalWorkspace(ctx, userId));
		await t.run((ctx) => ensurePersonalWorkspace(ctx, userId)); // no-op

		const { workspaces, members } = await t.run(async (ctx) => ({
			workspaces: await ctx.db.query("workspaces").collect(),
			members: await ctx.db.query("members").collect(),
		}));
		const personal = workspaces.filter(
			(w) => w.personal && w.ownerId === userId,
		);
		expect(personal).toHaveLength(1);
		expect(personal[0].name).toBe("Aaa's space");
		const ownerMembers = members.filter(
			(m) => m.workspaceId === personal[0]._id && m.role === "owner",
		);
		expect(ownerMembers).toHaveLength(1);
	});

	test("suffixes the name on collision between two users", async () => {
		const t = convexTest(schema, modules);
		const [u1, u2] = await t.run(async (ctx) => [
			await ctx.db.insert("users", { email: "sam1@example.com", name: "Sam" }),
			await ctx.db.insert("users", { email: "sam2@example.com", name: "Sam" }),
		]);
		await t.run((ctx) => ensurePersonalWorkspace(ctx, u1));
		await t.run((ctx) => ensurePersonalWorkspace(ctx, u2));

		const names = await t.run(async (ctx) =>
			(await ctx.db.query("workspaces").collect()).map((w) => w.name).sort(),
		);
		expect(names).toEqual(["Sam's space", "Sam's space 2"]);
	});
});

describe("resolveInvitesForUser", () => {
	test("applies workspace + document invites then consumes them, idempotently", async () => {
		const t = convexTest(schema, modules);
		const inviterId = await t.run((ctx) =>
			ctx.db.insert("users", { email: "owner@example.com", name: "Owner" }),
		);
		const workspaceId = await t.run((ctx) =>
			ctx.db.insert("workspaces", {
				name: "Team",
				ownerId: inviterId,
				createdAt: Date.now(),
			}),
		);
		const documentId = await t.run((ctx) =>
			ctx.db.insert("documents", {
				workspaceId,
				title: "Doc",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);
		await t.run(async (ctx) => {
			// mixed-case email exercises normalization on resolve
			await upsertWorkspaceInvite(ctx, {
				workspaceId,
				email: "Invitee@Example.com",
				role: "member",
				invitedBy: inviterId,
			});
			await upsertDocumentInvite(ctx, {
				documentId,
				email: "invitee@example.com",
				role: "editor",
				invitedBy: inviterId,
			});
		});

		const inviteeId = await t.run((ctx) =>
			ctx.db.insert("users", {
				email: "invitee@example.com",
				name: "Invitee",
			}),
		);
		await t.run((ctx) => resolveInvitesForUser(ctx, inviteeId));

		const state = await t.run(async (ctx) => ({
			members: await ctx.db
				.query("members")
				.withIndex("by_workspace_user", (q) =>
					q.eq("workspaceId", workspaceId).eq("userId", inviteeId),
				)
				.collect(),
			shares: await ctx.db
				.query("docShares")
				.withIndex("by_document_user", (q) =>
					q.eq("documentId", documentId).eq("userId", inviteeId),
				)
				.collect(),
			invites: await ctx.db.query("invites").collect(),
		}));
		expect(state.members).toHaveLength(1);
		expect(state.members[0].role).toBe("member");
		expect(state.shares).toHaveLength(1);
		expect(state.shares[0].role).toBe("editor");
		expect(state.invites).toHaveLength(0);

		// Re-running with no pending invites is a safe no-op (no dupes).
		await t.run((ctx) => resolveInvitesForUser(ctx, inviteeId));
		const after = await t.run(async (ctx) => ({
			members: await ctx.db.query("members").collect(),
			shares: await ctx.db.query("docShares").collect(),
		}));
		expect(after.members).toHaveLength(1);
		expect(after.shares).toHaveLength(1);
	});
});

describe("inviteWorkspaceMember", () => {
	async function setupOwnedWorkspace(t: ReturnType<typeof convexTest>) {
		const ownerId = await t.run((ctx) =>
			ctx.db.insert("users", { email: "owner@example.com", name: "Owner" }),
		);
		const workspaceId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("workspaces", {
				name: "Team",
				ownerId,
				createdAt: Date.now(),
			});
			await ctx.db.insert("members", {
				workspaceId: id,
				userId: ownerId,
				role: "owner",
				createdAt: Date.now(),
			});
			return id;
		});
		return { ownerId, workspaceId };
	}

	test("existing user → membership added", async () => {
		const t = convexTest(schema, modules);
		const { ownerId, workspaceId } = await setupOwnedWorkspace(t);
		const targetId = await t.run((ctx) =>
			ctx.db.insert("users", { email: "target@example.com", name: "Target" }),
		);

		const result = await asUser(t, ownerId).mutation(
			api.members.inviteWorkspaceMember,
			{ workspaceId, email: "target@example.com", role: "member" },
		);
		expect(result).toEqual({ status: "added", userId: targetId });

		const membership = await t.run((ctx) =>
			ctx.db
				.query("members")
				.withIndex("by_workspace_user", (q) =>
					q.eq("workspaceId", workspaceId).eq("userId", targetId),
				)
				.unique(),
		);
		expect(membership?.role).toBe("member");
	});

	test("unknown email → pending invite", async () => {
		const t = convexTest(schema, modules);
		const { ownerId, workspaceId } = await setupOwnedWorkspace(t);

		const result = await asUser(t, ownerId).mutation(
			api.members.inviteWorkspaceMember,
			{ workspaceId, email: "ghost@example.com", role: "member" },
		);
		expect(result).toEqual({ status: "invited", userId: null });

		const invites = await t.run((ctx) => ctx.db.query("invites").collect());
		expect(invites).toHaveLength(1);
		expect(invites[0]).toMatchObject({
			email: "ghost@example.com",
			workspaceId,
			workspaceRole: "member",
		});
	});

	test("non-owner/admin caller is unauthorized", async () => {
		const t = convexTest(schema, modules);
		const { workspaceId } = await setupOwnedWorkspace(t);
		const strangerId = await t.run((ctx) =>
			ctx.db.insert("users", { email: "stranger@example.com" }),
		);

		await expect(
			asUser(t, strangerId).mutation(api.members.inviteWorkspaceMember, {
				workspaceId,
				email: "x@example.com",
				role: "member",
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	test("only an owner can grant the owner role", async () => {
		const t = convexTest(schema, modules);
		const { workspaceId } = await setupOwnedWorkspace(t);
		const adminId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("users", { email: "admin@example.com" });
			await ctx.db.insert("members", {
				workspaceId,
				userId: id,
				role: "admin",
				createdAt: Date.now(),
			});
			return id;
		});

		await expect(
			asUser(t, adminId).mutation(api.members.inviteWorkspaceMember, {
				workspaceId,
				email: "newowner@example.com",
				role: "owner",
			}),
		).rejects.toThrow(/owner/i);
	});
});

describe("listWorkspaceInvites read access", () => {
	async function setup(t: ReturnType<typeof convexTest>) {
		const ownerId = await t.run((ctx) =>
			ctx.db.insert("users", { email: "owner@example.com", name: "Owner" }),
		);
		const workspaceId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("workspaces", {
				name: "Team",
				ownerId,
				createdAt: Date.now(),
			});
			await ctx.db.insert("members", {
				workspaceId: id,
				userId: ownerId,
				role: "owner",
				createdAt: Date.now(),
			});
			await ctx.db.insert("invites", {
				email: "ghost@example.com",
				workspaceId: id,
				workspaceRole: "member",
				invitedBy: ownerId,
				createdAt: Date.now(),
			});
			return id;
		});
		const memberId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("users", { email: "member@example.com" });
			await ctx.db.insert("members", {
				workspaceId,
				userId: id,
				role: "member",
				createdAt: Date.now(),
			});
			return id;
		});
		return { ownerId, memberId, workspaceId };
	}

	test("manager sees pending invites", async () => {
		const t = convexTest(schema, modules);
		const { ownerId, workspaceId } = await setup(t);
		const invites = await asUser(t, ownerId).query(
			api.members.listWorkspaceInvites,
			{ workspaceId },
		);
		expect(invites).toHaveLength(1);
		expect(invites[0].email).toBe("ghost@example.com");
	});

	test("non-manager gets an empty list instead of throwing", async () => {
		const t = convexTest(schema, modules);
		const { memberId, workspaceId } = await setup(t);
		const invites = await asUser(t, memberId).query(
			api.members.listWorkspaceInvites,
			{ workspaceId },
		);
		expect(invites).toEqual([]);
	});
});

describe("setWorkspaceMemberRole / removeWorkspaceMember guards", () => {
	// Workspace whose owner is tracked via a members row (ownerId left undefined)
	// so workspaceOwnerCount() governs the last-owner guards.
	async function setupWithOwners(t: ReturnType<typeof convexTest>, count: number) {
		const owners: Id<"users">[] = [];
		const workspaceId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("workspaces", {
				name: "Team",
				createdAt: Date.now(),
			});
			for (let i = 0; i < count; i++) {
				const userId = await ctx.db.insert("users", {
					email: `owner${i}@example.com`,
				});
				owners.push(userId);
				await ctx.db.insert("members", {
					workspaceId: id,
					userId,
					role: "owner",
					createdAt: Date.now(),
				});
			}
			return id;
		});
		return { workspaceId, owners };
	}

	test("cannot demote the last owner", async () => {
		const t = convexTest(schema, modules);
		const { workspaceId, owners } = await setupWithOwners(t, 1);
		await expect(
			asUser(t, owners[0]).mutation(api.members.setWorkspaceMemberRole, {
				workspaceId,
				userId: owners[0],
				role: "member",
			}),
		).rejects.toThrow(/last owner/i);
	});

	test("can demote an owner when another owner remains", async () => {
		const t = convexTest(schema, modules);
		const { workspaceId, owners } = await setupWithOwners(t, 2);
		await asUser(t, owners[0]).mutation(api.members.setWorkspaceMemberRole, {
			workspaceId,
			userId: owners[1],
			role: "member",
		});
		const role = await t.run(async (ctx) => {
			const m = await ctx.db
				.query("members")
				.withIndex("by_workspace_user", (q) =>
					q.eq("workspaceId", workspaceId).eq("userId", owners[1]),
				)
				.unique();
			return m?.role;
		});
		expect(role).toBe("member");
	});

	test("admin cannot remove an owner", async () => {
		const t = convexTest(schema, modules);
		const { workspaceId, owners } = await setupWithOwners(t, 1);
		const adminId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("users", { email: "admin@example.com" });
			await ctx.db.insert("members", {
				workspaceId,
				userId: id,
				role: "admin",
				createdAt: Date.now(),
			});
			return id;
		});
		await expect(
			asUser(t, adminId).mutation(api.members.removeWorkspaceMember, {
				workspaceId,
				userId: owners[0],
			}),
		).rejects.toThrow(/owner/i);
	});

	test("cannot remove the last owner", async () => {
		const t = convexTest(schema, modules);
		const { workspaceId, owners } = await setupWithOwners(t, 1);
		await expect(
			asUser(t, owners[0]).mutation(api.members.removeWorkspaceMember, {
				workspaceId,
				userId: owners[0],
			}),
		).rejects.toThrow(/last owner/i);
	});
});
