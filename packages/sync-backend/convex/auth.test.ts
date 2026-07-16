/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
	DAILY_SIGNUP_CAP,
	recordLaunchSignupOrThrow,
	SIGNUPS_PAUSED_MESSAGE,
} from "./auth";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("launch signup cap", () => {
	test("records new signups by UTC day", async () => {
		const t = convexTest(schema, modules);
		const now = Date.UTC(2026, 5, 30, 12);

		await t.run((ctx) => recordLaunchSignupOrThrow(ctx, now));
		await t.run((ctx) => recordLaunchSignupOrThrow(ctx, now));

		const days = await t.run((ctx) =>
			ctx.db.query("launchSignupDays").collect(),
		);
		expect(days).toHaveLength(1);
		expect(days[0]).toMatchObject({
			day: "2026-06-30",
			count: 2,
			updatedAt: now,
		});
	});

	test("rejects signups after the daily cap", async () => {
		const t = convexTest(schema, modules);
		const now = Date.UTC(2026, 5, 30, 12);
		await t.run((ctx) =>
			ctx.db.insert("launchSignupDays", {
				day: "2026-06-30",
				count: DAILY_SIGNUP_CAP,
				updatedAt: now,
			}),
		);

		await expect(
			t.run((ctx) => recordLaunchSignupOrThrow(ctx, now + 1)),
		).rejects.toThrow("Daily signup limit reached");

		const day = await t.run((ctx) =>
			ctx.db
				.query("launchSignupDays")
				.withIndex("by_day", (q) => q.eq("day", "2026-06-30"))
				.unique(),
		);
		expect(day?.count).toBe(DAILY_SIGNUP_CAP);
	});

	test("rejects new signups without consuming capacity when paused", async () => {
		const t = convexTest(schema, modules);

		await expect(
			t.run((ctx) => recordLaunchSignupOrThrow(ctx, Date.now(), true)),
		).rejects.toThrow(SIGNUPS_PAUSED_MESSAGE);

		const days = await t.run((ctx) =>
			ctx.db.query("launchSignupDays").collect(),
		);
		expect(days).toHaveLength(0);
	});

	test("reports the daily cap to signed-out clients before submission", async () => {
		const t = convexTest(schema, modules);
		const day = new Date().toISOString().slice(0, 10);
		await t.run((ctx) =>
			ctx.db.insert("launchSignupDays", {
				day,
				count: DAILY_SIGNUP_CAP,
				updatedAt: Date.now(),
			}),
		);

		await expect(t.query(api.auth.signupAvailability, {})).resolves.toEqual({
			status: "daily-cap-reached",
			message: "Daily signup limit reached. Signups reopen tomorrow.",
		});
	});

	test("reports an operator pause to signed-out clients", async () => {
		const t = convexTest(schema, modules);
		const previous = process.env.LAUNCH_SIGNUPS_DISABLED;
		process.env.LAUNCH_SIGNUPS_DISABLED = "true";
		try {
			await expect(t.query(api.auth.signupAvailability, {})).resolves.toEqual({
				status: "paused",
				message: SIGNUPS_PAUSED_MESSAGE,
			});
		} finally {
			if (previous === undefined) {
				delete process.env.LAUNCH_SIGNUPS_DISABLED;
			} else {
				process.env.LAUNCH_SIGNUPS_DISABLED = previous;
			}
		}
	});
});
