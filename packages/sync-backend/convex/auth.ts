import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, query } from "./_generated/server";
import { ensurePersonalWorkspace, resolveInvitesForUser } from "./members";

export const DAILY_SIGNUP_CAP = 100;
export const SIGNUPS_PAUSED_MESSAGE =
	"New signups are temporarily paused. Existing accounts can still sign in.";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		Password({
			profile(params) {
				const email = String(params.email ?? "")
					.trim()
					.toLowerCase();
				if (!email) throw new Error("Email is required");
				const name = String(params.name ?? "").trim() || email;
				return { email, name };
			},
		}),
		ConvexCredentials({
			id: "desktop-handoff",
			authorize: async (params, ctx) => {
				const code = typeof params.code === "string" ? params.code : "";
				if (!code) throw new Error("Desktop sign-in handoff code is required");
				const claimed: { userId: Id<"users"> } = await ctx.runMutation(
					internal.deviceAuth.claimDesktopHandoff,
					{ code },
				);
				return claimed;
			},
		}),
	],
	callbacks: {
		// Apply any pending email-keyed invites and guarantee a private home
		// workspace once the account exists.
		async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
			const mutationCtx = ctx as unknown as MutationCtx;
			if (existingUserId === null) {
				await recordLaunchSignupOrThrow(mutationCtx);
			}
			await resolveInvitesForUser(mutationCtx, userId);
			await ensurePersonalWorkspace(mutationCtx, userId);
		},
	},
});

export async function recordLaunchSignupOrThrow(
	ctx: MutationCtx,
	now = Date.now(),
	signupsPaused = launchSignupsPaused(),
) {
	if (signupsPaused) throw new Error(SIGNUPS_PAUSED_MESSAGE);
	const day = new Date(now).toISOString().slice(0, 10);
	const existing = await ctx.db
		.query("launchSignupDays")
		.withIndex("by_day", (q) => q.eq("day", day))
		.unique();
	if (existing && existing.count >= DAILY_SIGNUP_CAP) {
		throw new Error("Daily signup limit reached. Signups reopen tomorrow.");
	}
	if (existing) {
		await ctx.db.patch(existing._id, {
			count: existing.count + 1,
			updatedAt: now,
		});
		return;
	}
	await ctx.db.insert("launchSignupDays", {
		day,
		count: 1,
		updatedAt: now,
	});
}

export const signupAvailability = query({
	args: {},
	returns: v.object({
		status: v.union(
			v.literal("available"),
			v.literal("paused"),
			v.literal("daily-cap-reached"),
		),
		message: v.optional(v.string()),
	}),
	handler: async (ctx) => {
		if (launchSignupsPaused()) {
			return { status: "paused" as const, message: SIGNUPS_PAUSED_MESSAGE };
		}
		const day = new Date().toISOString().slice(0, 10);
		const existing = await ctx.db
			.query("launchSignupDays")
			.withIndex("by_day", (q) => q.eq("day", day))
			.unique();
		if (existing && existing.count >= DAILY_SIGNUP_CAP) {
			return {
				status: "daily-cap-reached" as const,
				message: "Daily signup limit reached. Signups reopen tomorrow.",
			};
		}
		return { status: "available" as const };
	},
});

function launchSignupsPaused(): boolean {
	return ["1", "true", "yes"].includes(
		(process.env.LAUNCH_SIGNUPS_DISABLED ?? "").trim().toLowerCase(),
	);
}
