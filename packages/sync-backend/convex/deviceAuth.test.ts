/// <reference types="vite/client" />
import { generateKeyPairSync } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeAll(() => {
	const { privateKey } = generateKeyPairSync("rsa", {
		modulusLength: 2048,
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
		publicKeyEncoding: { type: "spki", format: "pem" },
	});
	process.env.JWT_PRIVATE_KEY = privateKey;
	process.env.CONVEX_SITE_URL = "https://convex.example.test";
	process.env.SITE_URL = "https://app.example.test";
});

afterEach(() => {
	vi.useRealTimers();
});

describe("device auth", () => {
	test("request -> approve -> poll returns a valid refresh token once", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await createUser(t);

		const requested = await t.mutation(api.deviceAuth.request, {
			hostname: "dev-machine.local",
		});

		expect(requested.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
		expect(requested.approveUrl).toBe(
			`https://app.example.test/device?code=${requested.code}`,
		);

		const described = await t.query(api.deviceAuth.describe, {
			code: requested.code,
		});
		expect(described).toMatchObject({
			hostname: "dev-machine.local",
		});

		await asUser(t, userId).action(api.deviceAuth.approve, {
			code: requested.code,
		});

		const polled = await t.mutation(api.deviceAuth.poll, {
			code: requested.code,
		});
		expect(polled.status).toBe("approved");
		if (polled.status !== "approved") throw new Error("Expected approval");

		const [refreshTokenId, sessionId] = polled.refreshToken.split("|");
		expect(refreshTokenId).toContain("authRefreshTokens");
		expect(sessionId).toContain("authSessions");

		const persisted = await t.run(async (ctx) => {
			const session = await ctx.db.get(sessionId as Id<"authSessions">);
			const refreshToken = await ctx.db.get(
				refreshTokenId as Id<"authRefreshTokens">,
			);
			return { session, refreshToken };
		});
		expect(persisted.session).toMatchObject({ userId });
		expect(persisted.refreshToken).toMatchObject({
			sessionId,
		});

		const refreshed = await t.action(api.auth.signIn, {
			refreshToken: polled.refreshToken,
		});
		expect(refreshed.tokens?.token).toMatch(/^ey/);
		expect(refreshed.tokens?.refreshToken).toContain("|");

		await expect(
			t.mutation(api.deviceAuth.poll, { code: requested.code }),
		).rejects.toThrow("Device code not found");
	});

	test("expired code cannot be approved", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-11T12:00:00Z"));
		const t = convexTest(schema, modules);
		const { userId } = await createUser(t);
		const requested = await t.mutation(api.deviceAuth.request, {});

		vi.setSystemTime(new Date("2026-07-11T12:10:01Z"));
		await expect(
			asUser(t, userId).action(api.deviceAuth.approve, {
				code: requested.code,
			}),
		).rejects.toThrow("Device code expired");

		const polled = await t.mutation(api.deviceAuth.poll, {
			code: requested.code,
		});
		expect(polled).toEqual({ status: "expired" });
	});

	test("deny marks the request denied", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await createUser(t);
		const requested = await t.mutation(api.deviceAuth.request, {});

		await asUser(t, userId).mutation(api.deviceAuth.deny, {
			code: requested.code,
		});

		const polled = await t.mutation(api.deviceAuth.poll, {
			code: requested.code,
		});
		expect(polled).toEqual({ status: "denied" });
	});

	test("unauthed approve is rejected", async () => {
		const t = convexTest(schema, modules);
		const requested = await t.mutation(api.deviceAuth.request, {});

		await expect(
			t.action(api.deviceAuth.approve, { code: requested.code }),
		).rejects.toThrow("Not authenticated");
	});

	test("desktop handoff signs the app in once", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await createUser(t);
		const handoff = await asUser(t, userId).mutation(
			api.deviceAuth.createDesktopHandoff,
			{},
		);

		const signedIn = await t.action(api.auth.signIn, {
			provider: "desktop-handoff",
			params: { code: handoff.code },
		});
		expect(signedIn.tokens?.token).toMatch(/^ey/);

		await expect(
			t.action(api.auth.signIn, {
				provider: "desktop-handoff",
				params: { code: handoff.code },
			}),
		).rejects.toThrow("invalid or expired");
	});

	test("expired desktop handoff cannot sign in", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-11T12:00:00Z"));
		const t = convexTest(schema, modules);
		const { userId } = await createUser(t);
		const handoff = await asUser(t, userId).mutation(
			api.deviceAuth.createDesktopHandoff,
			{},
		);

		vi.setSystemTime(new Date("2026-07-11T12:02:01Z"));
		await expect(
			t.action(api.auth.signIn, {
				provider: "desktop-handoff",
				params: { code: handoff.code },
			}),
		).rejects.toThrow("invalid or expired");
	});

	test("desktop handoff creation requires authentication", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(api.deviceAuth.createDesktopHandoff, {}),
		).rejects.toThrow("Not authenticated");
	});
});

async function createUser(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			email: "user@example.com",
			name: "Device User",
		});
		return { userId };
	});
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
	return t.withIdentity({ subject: `${userId}|session` });
}
