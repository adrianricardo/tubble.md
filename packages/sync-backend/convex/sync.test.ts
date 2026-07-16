/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("listWorkspaces", () => {
	test("anonymous caller never sees an owned workspace, only legacy ones", async () => {
		const t = convexTest(schema, modules);
		const { legacyId } = await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", {
				email: "owner@example.com",
			});
			await ctx.db.insert("workspaces", {
				name: "Owned",
				ownerId,
				createdAt: Date.now(),
			});
			const legacyId = await ctx.db.insert("workspaces", {
				name: "Legacy",
				createdAt: Date.now(),
			});
			return { legacyId };
		});

		// No identity → anonymous.
		const result = await t.query(api.sync.listWorkspaces, {});
		expect(result.map((w) => w._id)).toEqual([legacyId]);
	});
});
