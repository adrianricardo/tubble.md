import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type DocumentRole = "owner" | "editor" | "commenter" | "viewer";
export type WorkspaceRole = "owner" | "admin" | "member";

type PermissionCtx = MutationCtx | QueryCtx;

const roleRank: Record<DocumentRole, number> = {
	viewer: 1,
	commenter: 2,
	editor: 3,
	owner: 4,
};

export function documentIdFromSyncId(syncId: string): Id<"documents"> | null {
	if (!syncId.startsWith("document:")) return null;
	return syncId.slice("document:".length) as Id<"documents">;
}

export function canCommentRole(role: DocumentRole | null): boolean {
	return role === "owner" || role === "editor" || role === "commenter";
}

export function canWriteRole(role: DocumentRole | null): boolean {
	return role === "owner" || role === "editor";
}

export async function workspaceRole(
	ctx: PermissionCtx,
	workspaceId: Id<"workspaces">,
): Promise<WorkspaceRole | null> {
	const workspace = await ctx.db.get(workspaceId);
	if (!workspace) return null;
	const userId = await getAuthUserId(ctx);
	if (!userId) {
		return workspace.ownerId === undefined ? "owner" : null;
	}
	if (workspace.ownerId === userId) return "owner";
	const membership = await ctx.db
		.query("members")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", workspaceId).eq("userId", userId),
		)
		.unique();
	return membership?.role ?? null;
}

export async function requireWorkspaceMember(
	ctx: PermissionCtx,
	workspaceId: Id<"workspaces">,
) {
	const role = await workspaceRole(ctx, workspaceId);
	if (!role) throw new Error("Unauthorized");
	return role;
}

export async function documentRole(
	ctx: PermissionCtx,
	documentId: Id<"documents">,
	options: { includeDeleted?: boolean } = {},
): Promise<DocumentRole | null> {
	const document = await ctx.db.get(documentId);
	if (
		!document ||
		(document.deletedAt !== undefined && !options.includeDeleted)
	) {
		return null;
	}

	const workspace = await ctx.db.get(document.workspaceId);
	const userId = await getAuthUserId(ctx);
	const publicShare = await ctx.db
		.query("docShares")
		.withIndex("by_document_link", (q) =>
			q.eq("documentId", documentId).eq("linkScope", "public"),
		)
		.unique();

	if (!userId) {
		// Anonymous access is preserved for legacy/test workspaces created before
		// production auth. Real shared docs require an explicit public link share.
		if (workspace?.ownerId === undefined) return "editor";
		return publicShare?.role ?? null;
	}

	let role: DocumentRole | null = null;
	const setRole = (candidate: DocumentRole | undefined) => {
		if (!candidate) return;
		if (role === null || roleRank[candidate] > roleRank[role]) {
			role = candidate;
		}
	};

	if (workspace?.ownerId === userId) setRole("owner");

	const [userShare, membership, workspaceShare] = await Promise.all([
		ctx.db
			.query("docShares")
			.withIndex("by_document_user", (q) =>
				q.eq("documentId", documentId).eq("userId", userId),
			)
			.unique(),
		ctx.db
			.query("members")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", document.workspaceId).eq("userId", userId),
			)
			.unique(),
		ctx.db
			.query("docShares")
			.withIndex("by_document_link", (q) =>
				q.eq("documentId", documentId).eq("linkScope", "workspace"),
			)
			.unique(),
	]);

	setRole(userShare?.role);
	if (membership?.role === "owner" || membership?.role === "admin") {
		setRole("owner");
	}
	if (membership && workspaceShare) {
		setRole(workspaceShare.role);
	}
	setRole(publicShare?.role);

	return role;
}

export async function requireDocumentRole(
	ctx: PermissionCtx,
	documentId: Id<"documents">,
	allowed: DocumentRole[],
): Promise<DocumentRole> {
	const role = await documentRole(ctx, documentId);
	if (!role || !allowed.includes(role)) {
		throw new Error("Unauthorized");
	}
	return role;
}

export async function requireDocumentRead(
	ctx: PermissionCtx,
	documentId: Id<"documents">,
	options?: { includeDeleted?: boolean },
) {
	const role = await documentRole(ctx, documentId, options);
	if (!role) throw new Error("Unauthorized");
}

export async function requireDocumentComment(
	ctx: PermissionCtx,
	documentId: Id<"documents">,
) {
	const role = await documentRole(ctx, documentId);
	if (!canCommentRole(role)) throw new Error("Unauthorized");
}

export async function requireDocumentWrite(
	ctx: PermissionCtx,
	documentId: Id<"documents">,
	options?: { includeDeleted?: boolean },
) {
	const role = await documentRole(ctx, documentId, options);
	if (!canWriteRole(role)) throw new Error("Unauthorized");
}

export async function requireDocumentOwner(
	ctx: PermissionCtx,
	documentId: Id<"documents">,
) {
	await requireDocumentRole(ctx, documentId, ["owner"]);
}
