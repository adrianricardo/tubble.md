import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	documentIdFromSyncId,
	documentRole,
	requireDocumentRole,
	requireWorkspaceMember,
} from "./permissions";

const ACTIVE_WINDOW_MS = 30_000;
const PRESENCE_COLORS = [
	"#2563eb",
	"#d97706",
	"#059669",
	"#dc2626",
	"#7c3aed",
	"#0891b2",
];

export const heartbeat = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		docId: v.string(),
		userId: v.optional(v.string()),
		name: v.optional(v.string()),
		anchor: v.optional(v.number()),
		head: v.optional(v.number()),
	},
	handler: async (ctx, { workspaceId, docId, userId, name, anchor, head }) => {
		const identity = await presenceIdentity(ctx, {
			workspaceId,
			docId,
			anonymousUserId: userId,
			anonymousName: name,
		});
		const now = Date.now();
		const cursor =
			anchor !== undefined && head !== undefined ? { anchor, head } : {};
		const existing = await ctx.db
			.query("livePocUsers")
			.withIndex("by_doc_user", (q) =>
				q.eq("docId", docId).eq("userId", identity.userId),
			)
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				name: identity.name,
				updatedAt: now,
				...cursor,
			});
			return existing._id;
		}

		return ctx.db.insert("livePocUsers", {
			workspaceId,
			docId,
			userId: identity.userId,
			name: identity.name,
			...cursor,
			updatedAt: now,
		});
	},
});

export const listActive = query({
	args: { docId: v.string() },
	handler: async (ctx, { docId }) => {
		const allowed = await canReadPresence(ctx, docId);
		if (!allowed) return [];

		const cutoff = Date.now() - ACTIVE_WINDOW_MS;
		const users = await ctx.db
			.query("livePocUsers")
			.withIndex("by_doc", (q) => q.eq("docId", docId).gte("updatedAt", cutoff))
			.collect();

		return users
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.map(({ userId, name, anchor, head, updatedAt }) => ({
				userId,
				name,
				anchor,
				head,
				color: colorForUser(userId),
				updatedAt,
			}));
	},
});

async function presenceIdentity(
	ctx: MutationCtx,
	args: {
		workspaceId: Id<"workspaces">;
		docId: string;
		anonymousUserId?: string;
		anonymousName?: string;
	},
): Promise<{ userId: string; name: string }> {
	const authUserId = await getAuthUserId(ctx);
	if (authUserId) {
		await requirePresenceRead(ctx, args.docId, args.workspaceId);
		const user = await ctx.db.get(authUserId);
		return {
			userId: authUserId,
			name: displayName(user, "Collaborator"),
		};
	}

	await requireAnonymousPresenceRead(ctx, args.docId, args.workspaceId);
	const anonymousUserId = args.anonymousUserId?.trim();
	const anonymousName = args.anonymousName?.trim();
	if (!anonymousUserId || !anonymousName) {
		throw new Error("Authentication required");
	}
	return { userId: anonymousUserId, name: anonymousName };
}

async function requirePresenceRead(
	ctx: MutationCtx,
	docId: string,
	workspaceId: Id<"workspaces">,
) {
	const documentId = documentIdFromSyncId(docId);
	if (documentId) {
		await requireDocumentRole(ctx, documentId, [
			"owner",
			"editor",
			"commenter",
			"viewer",
		]);
		return;
	}
	const parsedWorkspaceId = workspaceIdFromPocDocId(docId) ?? workspaceId;
	await requireWorkspaceMember(ctx, parsedWorkspaceId);
}

async function requireAnonymousPresenceRead(
	ctx: MutationCtx,
	docId: string,
	workspaceId: Id<"workspaces">,
) {
	const documentId = documentIdFromSyncId(docId);
	if (documentId) {
		const role = await documentRole(ctx, documentId);
		if (role) return;
	}

	const workspace = await ctx.db.get(
		workspaceIdFromPocDocId(docId) ?? workspaceId,
	);
	if (workspace?.ownerId === undefined) return;
	throw new Error("Authentication required");
}

async function canReadPresence(ctx: QueryCtx, docId: string): Promise<boolean> {
	const documentId = documentIdFromSyncId(docId);
	if (documentId) {
		return (await documentRole(ctx, documentId)) !== null;
	}

	const workspaceId = workspaceIdFromPocDocId(docId);
	if (!workspaceId) return false;
	const workspace = await ctx.db.get(workspaceId);
	if (workspace?.ownerId === undefined) return true;
	return (await requireWorkspaceMemberOrNull(ctx, workspaceId)) !== null;
}

async function requireWorkspaceMemberOrNull(
	ctx: QueryCtx,
	workspaceId: Id<"workspaces">,
) {
	try {
		return await requireWorkspaceMember(ctx, workspaceId);
	} catch {
		return null;
	}
}

function workspaceIdFromPocDocId(docId: string): Id<"workspaces"> | null {
	if (!docId.startsWith("poc:")) return null;
	const workspaceId = docId.slice("poc:".length).split(":")[0];
	return workspaceId ? (workspaceId as Id<"workspaces">) : null;
}

function displayName(user: Doc<"users"> | null, fallback: string): string {
	return user?.name?.trim() || user?.email?.trim() || fallback;
}

function colorForUser(userId: string): string {
	let hash = 0;
	for (let i = 0; i < userId.length; i += 1) {
		hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
	}
	return PRESENCE_COLORS[hash % PRESENCE_COLORS.length] ?? "#2563eb";
}
