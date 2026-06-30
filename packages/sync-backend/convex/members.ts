import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	type QueryCtx,
	mutation,
	query,
} from "./_generated/server";
import {
	type DocumentRole,
	type WorkspaceRole,
	workspaceRole,
} from "./permissions";

const workspaceRoleValidator = v.union(
	v.literal("owner"),
	v.literal("admin"),
	v.literal("member"),
);

const documentRoleValidator = v.union(
	v.literal("owner"),
	v.literal("editor"),
	v.literal("commenter"),
	v.literal("viewer"),
);

type AnyCtx = MutationCtx | QueryCtx;

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

// Full-scan email lookup. Matches the existing pattern in documents.ts; an
// email index on the auth `users` table is a deferred follow-up (see plan B2b).
export async function findUserIdByEmail(
	ctx: AnyCtx,
	email: string,
): Promise<Id<"users"> | null> {
	const normalized = normalizeEmail(email);
	if (!normalized) return null;
	const users = await ctx.db.query("users").collect();
	const match = users.find(
		(candidate) => candidate.email?.toLowerCase() === normalized,
	);
	return match?._id ?? null;
}

async function requireWorkspaceManage(
	ctx: AnyCtx,
	workspaceId: Id<"workspaces">,
): Promise<WorkspaceRole> {
	const role = await workspaceRole(ctx, workspaceId);
	if (role !== "owner" && role !== "admin") throw new Error("Unauthorized");
	return role;
}

async function workspaceOwnerCount(
	ctx: AnyCtx,
	workspaceId: Id<"workspaces">,
): Promise<number> {
	const members = await ctx.db
		.query("members")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	return members.filter((member) => member.role === "owner").length;
}

export async function applyWorkspaceMembership(
	ctx: MutationCtx,
	args: {
		workspaceId: Id<"workspaces">;
		userId: Id<"users">;
		role: WorkspaceRole;
	},
): Promise<Id<"members">> {
	const existing = await ctx.db
		.query("members")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
		)
		.unique();
	if (existing) {
		if (existing.role !== args.role) {
			await ctx.db.patch(existing._id, { role: args.role });
		}
		return existing._id;
	}
	return ctx.db.insert("members", {
		workspaceId: args.workspaceId,
		userId: args.userId,
		role: args.role,
		createdAt: Date.now(),
	});
}

async function applyDocumentShareRole(
	ctx: MutationCtx,
	args: {
		documentId: Id<"documents">;
		userId: Id<"users">;
		role: DocumentRole;
	},
): Promise<void> {
	const existing = await ctx.db
		.query("docShares")
		.withIndex("by_document_user", (q) =>
			q.eq("documentId", args.documentId).eq("userId", args.userId),
		)
		.unique();
	const now = Date.now();
	if (existing) {
		await ctx.db.patch(existing._id, { role: args.role, updatedAt: now });
		return;
	}
	await ctx.db.insert("docShares", {
		documentId: args.documentId,
		userId: args.userId,
		role: args.role,
		createdAt: now,
		updatedAt: now,
	});
}

export async function upsertWorkspaceInvite(
	ctx: MutationCtx,
	args: {
		workspaceId: Id<"workspaces">;
		email: string;
		role: WorkspaceRole;
		invitedBy?: Id<"users">;
	},
): Promise<Id<"invites">> {
	const email = normalizeEmail(args.email);
	const existing = await ctx.db
		.query("invites")
		.withIndex("by_workspace_email", (q) =>
			q.eq("workspaceId", args.workspaceId).eq("email", email),
		)
		.unique();
	if (existing) {
		await ctx.db.patch(existing._id, {
			workspaceRole: args.role,
			invitedBy: args.invitedBy,
		});
		return existing._id;
	}
	return ctx.db.insert("invites", {
		email,
		workspaceId: args.workspaceId,
		workspaceRole: args.role,
		invitedBy: args.invitedBy,
		createdAt: Date.now(),
	});
}

export async function upsertDocumentInvite(
	ctx: MutationCtx,
	args: {
		documentId: Id<"documents">;
		email: string;
		role: DocumentRole;
		invitedBy?: Id<"users">;
	},
): Promise<Id<"invites">> {
	const email = normalizeEmail(args.email);
	const existing = await ctx.db
		.query("invites")
		.withIndex("by_document_email", (q) =>
			q.eq("documentId", args.documentId).eq("email", email),
		)
		.unique();
	if (existing) {
		await ctx.db.patch(existing._id, {
			documentRole: args.role,
			invitedBy: args.invitedBy,
		});
		return existing._id;
	}
	return ctx.db.insert("invites", {
		email,
		documentId: args.documentId,
		documentRole: args.role,
		invitedBy: args.invitedBy,
		createdAt: Date.now(),
	});
}

// Called from the Convex Auth `afterUserCreatedOrUpdated` callback. Applies any
// pending workspace/document invites addressed to the new user's email, then
// consumes them. Idempotent: safe to run on every sign-in.
export async function resolveInvitesForUser(
	ctx: MutationCtx,
	userId: Id<"users">,
): Promise<void> {
	const user = await ctx.db.get(userId);
	const email = user?.email ? normalizeEmail(user.email) : null;
	if (!email) return;
	const invites = await ctx.db
		.query("invites")
		.withIndex("by_email", (q) => q.eq("email", email))
		.collect();
	for (const invite of invites) {
		if (invite.workspaceId && invite.workspaceRole) {
			const workspace = await ctx.db.get(invite.workspaceId);
			if (workspace) {
				await applyWorkspaceMembership(ctx, {
					workspaceId: invite.workspaceId,
					userId,
					role: invite.workspaceRole,
				});
			}
		} else if (invite.documentId && invite.documentRole) {
			const document = await ctx.db.get(invite.documentId);
			if (document) {
				await applyDocumentShareRole(ctx, {
					documentId: invite.documentId,
					userId,
					role: invite.documentRole,
				});
			}
		}
		await ctx.db.delete(invite._id);
	}
}

async function uniqueWorkspaceName(
	ctx: MutationCtx,
	base: string,
): Promise<string> {
	const trimmed = base.trim() || "My space";
	for (let attempt = 0; attempt < 50; attempt++) {
		const candidate = attempt === 0 ? trimmed : `${trimmed} ${attempt + 1}`;
		const existing = await ctx.db
			.query("workspaces")
			.withIndex("by_name", (q) => q.eq("name", candidate))
			.unique();
		if (!existing) return candidate;
	}
	// Extremely unlikely fallback: disambiguate with a timestamp suffix.
	return `${trimmed} ${Date.now()}`;
}

// A1d: guarantee every account has a private home workspace. Idempotent — runs
// from the signup callback on every sign-in but only provisions once.
export async function ensurePersonalWorkspace(
	ctx: MutationCtx,
	userId: Id<"users">,
): Promise<void> {
	const owned = await ctx.db
		.query("workspaces")
		.withIndex("by_owner", (q) => q.eq("ownerId", userId))
		.collect();
	if (owned.some((workspace) => workspace.personal)) return;
	const user = await ctx.db.get(userId);
	const base = (user?.name || user?.email || "My").trim();
	const name = await uniqueWorkspaceName(ctx, `${base}'s space`);
	const workspaceId = await ctx.db.insert("workspaces", {
		name,
		ownerId: userId,
		personal: true,
		createdAt: Date.now(),
	});
	await ctx.db.insert("members", {
		workspaceId,
		userId,
		role: "owner",
		createdAt: Date.now(),
	});
}

export const inviteWorkspaceMember = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		email: v.string(),
		role: workspaceRoleValidator,
	},
	handler: async (ctx, { workspaceId, email, role }) => {
		const callerRole = await requireWorkspaceManage(ctx, workspaceId);
		if (role === "owner" && callerRole !== "owner") {
			throw new Error("Only an owner can grant the owner role");
		}
		const normalized = normalizeEmail(email);
		if (!normalized) throw new Error("Email is required");
		const invitedBy = (await getAuthUserId(ctx)) ?? undefined;
		const existingUserId = await findUserIdByEmail(ctx, normalized);
		if (existingUserId) {
			await applyWorkspaceMembership(ctx, {
				workspaceId,
				userId: existingUserId,
				role,
			});
			return { status: "added" as const, userId: existingUserId };
		}
		await upsertWorkspaceInvite(ctx, {
			workspaceId,
			email: normalized,
			role,
			invitedBy,
		});
		return { status: "invited" as const, userId: null };
	},
});

export const setWorkspaceMemberRole = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		role: workspaceRoleValidator,
	},
	handler: async (ctx, { workspaceId, userId, role }) => {
		const callerRole = await requireWorkspaceManage(ctx, workspaceId);
		if (role === "owner" && callerRole !== "owner") {
			throw new Error("Only an owner can grant the owner role");
		}
		const membership = await ctx.db
			.query("members")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", workspaceId).eq("userId", userId),
			)
			.unique();
		if (!membership) throw new Error("Not a workspace member");
		if (
			membership.role === "owner" &&
			role !== "owner" &&
			(await workspaceOwnerCount(ctx, workspaceId)) <= 1
		) {
			throw new Error("Cannot demote the last owner");
		}
		if (membership.role !== role) {
			await ctx.db.patch(membership._id, { role });
		}
	},
});

export const removeWorkspaceMember = mutation({
	args: { workspaceId: v.id("workspaces"), userId: v.id("users") },
	handler: async (ctx, { workspaceId, userId }) => {
		const callerRole = await requireWorkspaceManage(ctx, workspaceId);
		const membership = await ctx.db
			.query("members")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", workspaceId).eq("userId", userId),
			)
			.unique();
		if (!membership) return;
		if (membership.role === "owner") {
			if (callerRole !== "owner") {
				throw new Error("Only an owner can remove an owner");
			}
			if ((await workspaceOwnerCount(ctx, workspaceId)) <= 1) {
				throw new Error("Cannot remove the last owner");
			}
		}
		await ctx.db.delete(membership._id);
	},
});

export const listWorkspaceInvites = query({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, { workspaceId }) => {
		await requireWorkspaceManage(ctx, workspaceId);
		return ctx.db
			.query("invites")
			.withIndex("by_workspace_email", (q) =>
				q.eq("workspaceId", workspaceId),
			)
			.collect();
	},
});

export const revokeWorkspaceInvite = mutation({
	args: { workspaceId: v.id("workspaces"), inviteId: v.id("invites") },
	handler: async (ctx, { workspaceId, inviteId }) => {
		await requireWorkspaceManage(ctx, workspaceId);
		const invite = await ctx.db.get(inviteId);
		if (!invite || invite.workspaceId !== workspaceId) return;
		await ctx.db.delete(inviteId);
	},
});
