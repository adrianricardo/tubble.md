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

async function setupDocument(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", {
			email: "owner@example.com",
			name: "Owner",
		});
		const viewerId = await ctx.db.insert("users", {
			email: "viewer@example.com",
			name: "Viewer",
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
		await ctx.db.insert("docShares", {
			documentId,
			userId: viewerId,
			role: "viewer",
			createdAt: 1,
			updatedAt: 1,
		});
		return { ownerId, viewerId, strangerId, workspaceId, documentId };
	});
}

describe("presence", () => {
	test("authenticated heartbeat derives stable identity instead of trusting args", async () => {
		const t = convexTest(schema, modules);
		const { ownerId, workspaceId, documentId } = await setupDocument(t);
		const docId = `document:${documentId}`;

		await asUser(t, ownerId).mutation(api.pocIdentity.heartbeat, {
			workspaceId,
			docId,
			userId: "spoofed",
			name: "Spoofed",
			anchor: 4,
			head: 8,
		});

		const users = await asUser(t, ownerId).query(api.pocIdentity.listActive, {
			docId,
		});
		expect(users).toHaveLength(1);
		expect(users[0]).toMatchObject({
			userId: ownerId,
			name: "Owner",
			anchor: 4,
			head: 8,
		});
		expect(users[0].color).toMatch(/^#[0-9a-f]{6}$/);
	});

	test("shared viewers can read document presence", async () => {
		const t = convexTest(schema, modules);
		const { ownerId, viewerId, workspaceId, documentId } =
			await setupDocument(t);
		const docId = `document:${documentId}`;

		await asUser(t, ownerId).mutation(api.pocIdentity.heartbeat, {
			workspaceId,
			docId,
		});

		const users = await asUser(t, viewerId).query(api.pocIdentity.listActive, {
			docId,
		});
		expect(users.map((user) => user.userId)).toEqual([ownerId]);
	});

	test("anonymous callers cannot spoof presence into an owned document", async () => {
		const t = convexTest(schema, modules);
		const { workspaceId, documentId } = await setupDocument(t);
		const docId = `document:${documentId}`;

		await expect(
			t.mutation(api.pocIdentity.heartbeat, {
				workspaceId,
				docId,
				userId: "anon",
				name: "Anon",
			}),
		).rejects.toThrow("Authentication required");

		await expect(
			t.query(api.pocIdentity.listActive, { docId }),
		).resolves.toEqual([]);
	});
});
