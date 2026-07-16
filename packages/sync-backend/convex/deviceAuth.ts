import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	action,
	internalMutation,
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";

declare const process: {
	env: {
		AUTH_SESSION_TOTAL_DURATION_MS?: string;
		SITE_URL?: string;
	};
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEVICE_AUTH_TTL_MS = 10 * 60 * 1000;
const DESKTOP_HANDOFF_TTL_MS = 2 * 60 * 1000;
const DESKTOP_HANDOFF_REQUEST_LIMIT = 5;
const DEVICE_AUTH_REQUEST_LIMIT = 10;
const DEFAULT_SESSION_TOTAL_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

type DeviceAuthStatus = "pending" | "approved" | "denied" | "expired";

export const request = mutation({
	args: { hostname: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const now = Date.now();
		const windowStart = now - DEVICE_AUTH_TTL_MS;
		const pending = await ctx.db
			.query("deviceAuthRequests")
			.withIndex("by_status_and_requestedAt", (q) =>
				q.eq("status", "pending").gte("requestedAt", windowStart),
			)
			.take(DEVICE_AUTH_REQUEST_LIMIT);
		if (pending.length >= DEVICE_AUTH_REQUEST_LIMIT) {
			throw new Error(
				"Too many pending device login requests. Try again later.",
			);
		}

		const code = await generateUniqueCode(ctx);
		await ctx.db.insert("deviceAuthRequests", {
			code,
			status: "pending",
			requestedAt: now,
			hostname: normalizeHostname(args.hostname),
		});

		const approveUrl = new URL("/device", siteUrl());
		approveUrl.searchParams.set("code", code);
		return { code, approveUrl: approveUrl.toString() };
	},
});

export const describe = query({
	args: { code: v.string() },
	handler: async (ctx, args) => {
		const requestDoc = await findRequest(ctx, normalizeCode(args.code));
		if (!requestDoc || requestDoc.status !== "pending") return null;
		if (isExpired(requestDoc.requestedAt)) return null;
		return {
			hostname: requestDoc.hostname,
			requestedAt: requestDoc.requestedAt,
		};
	},
});

// `approve` must be an action: the library's token mint inside `auth.store`
// reads the built-in CONVEX_SITE_URL env var, which is absent in a nested
// mutation→mutation call (verified live 2026-07-11) but present when the
// mutation is invoked top-level from an action — the same shape as the
// library's own signIn action.
export const approve = action({
	args: { code: v.string() },
	handler: async (ctx, args): Promise<{ status: "approved" }> => {
		const prepared: {
			requestId: Id<"deviceAuthRequests">;
			userId: Id<"users">;
			sessionId: Id<"authSessions">;
		} = await ctx.runMutation(internal.deviceAuth.approvePrepare, {
			code: args.code,
		});

		const signIn = (await ctx.runMutation(internal.auth.store, {
			args: {
				type: "signIn",
				userId: prepared.userId,
				sessionId: prepared.sessionId,
				generateTokens: true,
			},
		})) as unknown as {
			tokens: { refreshToken: string } | null;
		};
		if (!signIn.tokens) {
			throw new Error("Failed to create device login session");
		}

		await ctx.runMutation(internal.deviceAuth.approveFinalize, {
			requestId: prepared.requestId,
			approvedBy: prepared.userId,
			refreshToken: signIn.tokens.refreshToken,
		});
		return { status: "approved" as const };
	},
});

export const approvePrepare = internalMutation({
	args: { code: v.string() },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error("Not authenticated");

		const code = normalizeCode(args.code);
		const requestDoc = await findRequest(ctx, code);
		if (!requestDoc) throw new Error("Device code not found");
		if (requestDoc.status !== "pending") {
			throw new Error(`Device code is ${requestDoc.status}`);
		}
		if (isExpired(requestDoc.requestedAt)) {
			await ctx.db.patch(requestDoc._id, { status: "expired" });
			throw new Error("Device code expired");
		}

		// Convex Auth v0.0.94 deletes the current browser session when `store`
		// signs in without a sessionId, so create the CLI session first and let
		// `store` mint the official JWT + refresh token for that session.
		const sessionId = await createDeviceSession(ctx, userId);
		return { requestId: requestDoc._id, userId, sessionId };
	},
});

export const approveFinalize = internalMutation({
	args: {
		requestId: v.id("deviceAuthRequests"),
		approvedBy: v.id("users"),
		refreshToken: v.string(),
	},
	handler: async (ctx, args) => {
		const requestDoc = await ctx.db.get(args.requestId);
		if (!requestDoc || requestDoc.status !== "pending") {
			throw new Error("Device code is no longer pending");
		}
		await ctx.db.patch(args.requestId, {
			status: "approved",
			approvedBy: args.approvedBy,
			refreshToken: args.refreshToken,
		});
	},
});

export const deny = mutation({
	args: { code: v.string() },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error("Not authenticated");

		const requestDoc = await findRequest(ctx, normalizeCode(args.code));
		if (!requestDoc) throw new Error("Device code not found");
		if (requestDoc.status !== "pending") {
			throw new Error(`Device code is ${requestDoc.status}`);
		}
		if (isExpired(requestDoc.requestedAt)) {
			await ctx.db.patch(requestDoc._id, { status: "expired" });
			throw new Error("Device code expired");
		}

		await ctx.db.patch(requestDoc._id, { status: "denied" });
		return { status: "denied" as const };
	},
});

export const poll = mutation({
	args: { code: v.string() },
	handler: async (ctx, args) => {
		const requestDoc = await findRequest(ctx, normalizeCode(args.code));
		if (!requestDoc) throw new Error("Device code not found");

		if (requestDoc.status === "pending" && isExpired(requestDoc.requestedAt)) {
			await ctx.db.patch(requestDoc._id, { status: "expired" });
			return { status: "expired" as const };
		}

		if (requestDoc.status === "approved") {
			if (!requestDoc.refreshToken) {
				throw new Error("Approved device code is missing a refresh token");
			}
			const refreshToken = requestDoc.refreshToken;
			await ctx.db.delete(requestDoc._id);
			return { status: "approved" as const, refreshToken };
		}

		return { status: requestDoc.status as DeviceAuthStatus };
	},
});

export const createDesktopHandoff = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error("Not authenticated");

		// Let the desktop mint its own session without copying the CLI's durable
		// refresh token across the local socket.
		const createdAt = Date.now();
		const recent = await ctx.db
			.query("desktopAuthHandoffs")
			.withIndex("by_userId_and_createdAt", (q) =>
				q
					.eq("userId", userId)
					.gte("createdAt", createdAt - DESKTOP_HANDOFF_TTL_MS),
			)
			.take(DESKTOP_HANDOFF_REQUEST_LIMIT);
		if (recent.length >= DESKTOP_HANDOFF_REQUEST_LIMIT) {
			throw new Error("Too many pending desktop sign-in handoffs");
		}
		const code = generateHandoffCode();
		const handoffId = await ctx.db.insert("desktopAuthHandoffs", {
			code,
			userId,
			createdAt,
			expiresAt: createdAt + DESKTOP_HANDOFF_TTL_MS,
		});
		await ctx.scheduler.runAfter(
			DESKTOP_HANDOFF_TTL_MS,
			internal.deviceAuth.expireDesktopHandoff,
			{ handoffId },
		);
		return { code, expiresAt: createdAt + DESKTOP_HANDOFF_TTL_MS };
	},
});

export const claimDesktopHandoff = internalMutation({
	args: { code: v.string() },
	handler: async (ctx, args) => {
		const handoff = await ctx.db
			.query("desktopAuthHandoffs")
			.withIndex("by_code", (q) => q.eq("code", args.code))
			.unique();
		if (!handoff || handoff.expiresAt <= Date.now()) {
			if (handoff) await ctx.db.delete(handoff._id);
			throw new Error("Desktop sign-in handoff is invalid or expired");
		}
		await ctx.db.delete(handoff._id);
		return { userId: handoff.userId };
	},
});

export const expireDesktopHandoff = internalMutation({
	args: { handoffId: v.id("desktopAuthHandoffs") },
	handler: async (ctx, args) => {
		const handoff = await ctx.db.get(args.handoffId);
		if (handoff && handoff.expiresAt <= Date.now()) {
			await ctx.db.delete(handoff._id);
		}
	},
});

export const cleanupExpired = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - DEVICE_AUTH_TTL_MS;
		const expired = await ctx.db
			.query("deviceAuthRequests")
			.withIndex("by_requestedAt", (q) => q.lt("requestedAt", cutoff))
			.take(100);
		for (const requestDoc of expired) {
			await ctx.db.delete(requestDoc._id);
		}
		if (expired.length === 100) {
			await ctx.scheduler.runAfter(0, internal.deviceAuth.cleanupExpired, {});
		}
	},
});

async function generateUniqueCode(ctx: MutationCtx): Promise<string> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const code = generateCode();
		const existing = await findRequest(ctx, code);
		if (!existing) return code;
	}
	throw new Error("Failed to generate device code");
}

function generateCode(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	const chars = Array.from(
		bytes,
		(byte) => CODE_ALPHABET[byte & 31] ?? CODE_ALPHABET[0],
	);
	return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

function generateHandoffCode(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

async function findRequest(
	ctx: Pick<MutationCtx | QueryCtx, "db">,
	code: string,
) {
	return await ctx.db
		.query("deviceAuthRequests")
		.withIndex("by_code", (q) => q.eq("code", code))
		.unique();
}

function normalizeCode(code: string): string {
	const compact = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
	if (compact.length !== 8) return code.trim().toUpperCase();
	return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function normalizeHostname(hostname: string | undefined): string | undefined {
	const normalized = hostname?.trim();
	if (!normalized) return undefined;
	return normalized.slice(0, 120);
}

function isExpired(requestedAt: number): boolean {
	return Date.now() - requestedAt >= DEVICE_AUTH_TTL_MS;
}

function siteUrl(): string {
	const value = process.env.SITE_URL;
	if (!value) throw new Error("SITE_URL is not configured");
	return value.replace(/\/$/, "");
}

async function createDeviceSession(
	ctx: MutationCtx,
	userId: Id<"users">,
): Promise<Id<"authSessions">> {
	return await ctx.db.insert("authSessions", {
		userId,
		expirationTime: Date.now() + sessionTotalDurationMs(),
	});
}

function sessionTotalDurationMs(): number {
	const configured = Number.parseInt(
		process.env.AUTH_SESSION_TOTAL_DURATION_MS ?? "",
		10,
	);
	if (Number.isFinite(configured) && configured > 0) return configured;
	return DEFAULT_SESSION_TOTAL_DURATION_MS;
}
