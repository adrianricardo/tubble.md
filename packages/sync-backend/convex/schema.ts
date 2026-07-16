import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	...authTables,

	workspaces: defineTable({
		name: v.string(),
		ownerId: v.optional(v.id("users")),
		// True for the auto-provisioned per-account "private" workspace (A1d). The
		// dashboard surfaces this as the user's Private space, distinct from Teams.
		personal: v.optional(v.boolean()),
		createdAt: v.number(),
	})
		.index("by_name", ["name"])
		.index("by_owner", ["ownerId"]),

	members: defineTable({
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
		createdAt: v.number(),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_user", ["userId"])
		.index("by_workspace_user", ["workspaceId", "userId"]),

	// Pending invites keyed by email, resolved into members/docShares when the
	// invitee signs up (Convex Auth afterUserCreatedOrUpdated). Shared by both
	// team-workspace invites and per-document email shares.
	invites: defineTable({
		email: v.string(),
		workspaceId: v.optional(v.id("workspaces")),
		documentId: v.optional(v.id("documents")),
		folderId: v.optional(v.id("folders")),
		workspaceRole: v.optional(
			v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
		),
		documentRole: v.optional(
			v.union(
				v.literal("owner"),
				v.literal("editor"),
				v.literal("commenter"),
				v.literal("viewer"),
			),
		),
		folderRole: v.optional(
			v.union(
				v.literal("owner"),
				v.literal("editor"),
				v.literal("commenter"),
				v.literal("viewer"),
			),
		),
		invitedBy: v.optional(v.id("users")),
		createdAt: v.number(),
	})
		.index("by_email", ["email"])
		.index("by_workspace_email", ["workspaceId", "email"])
		.index("by_document_email", ["documentId", "email"])
		.index("by_folder_email", ["folderId", "email"]),

	launchSignupDays: defineTable({
		day: v.string(),
		count: v.number(),
		updatedAt: v.number(),
	}).index("by_day", ["day"]),

	deviceAuthRequests: defineTable({
		code: v.string(),
		status: v.union(
			v.literal("pending"),
			v.literal("approved"),
			v.literal("denied"),
			v.literal("expired"),
		),
		requestedAt: v.number(),
		hostname: v.optional(v.string()),
		approvedBy: v.optional(v.id("users")),
		refreshToken: v.optional(v.string()),
	})
		.index("by_code", ["code"])
		.index("by_requestedAt", ["requestedAt"])
		.index("by_status_and_requestedAt", ["status", "requestedAt"]),

	desktopAuthHandoffs: defineTable({
		code: v.string(),
		userId: v.id("users"),
		createdAt: v.number(),
		expiresAt: v.number(),
	})
		.index("by_code", ["code"])
		.index("by_userId_and_createdAt", ["userId", "createdAt"]),

	files: defineTable({
		workspaceId: v.id("workspaces"),
		path: v.string(),
		contentHash: v.string(),
		content: v.string(),
		updatedAt: v.number(),
		deviceId: v.string(),
		deleted: v.boolean(),
	})
		.index("by_workspace", ["workspaceId", "updatedAt"])
		.index("by_workspace_path", ["workspaceId", "path"]),

	documents: defineTable({
		workspaceId: v.id("workspaces"),
		folderId: v.optional(v.id("folders")),
		title: v.string(),
		path: v.optional(v.string()),
		createdBy: v.optional(v.string()),
		createdAt: v.number(),
		updatedBy: v.optional(v.string()),
		updatedAt: v.number(),
		importKey: v.optional(v.string()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_workspace", ["workspaceId", "updatedAt"])
		.index("by_workspace_folder", ["workspaceId", "folderId"])
		.index("by_workspace_path", ["workspaceId", "path"])
		.index("by_workspace_folder_path", ["workspaceId", "folderId", "path"])
		.index("by_workspace_import_key", ["workspaceId", "importKey"]),

	folders: defineTable({
		workspaceId: v.id("workspaces"),
		parentId: v.optional(v.id("folders")),
		name: v.string(),
		// Repo-link display metadata (D11). The cloud stores only what the folder
		// is anchored to for display; the local mount path is per-machine desktop
		// config and is never stored in Convex.
		repoName: v.optional(v.string()),
		repoRemoteUrl: v.optional(v.string()),
		createdBy: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
		deletedAt: v.optional(v.number()),
		// Missing means active for every legacy folder. Authority moves create a
		// hidden staging root, then activate it with one root-row patch.
		authorityState: v.optional(
			v.union(
				v.literal("staging"),
				v.literal("active"),
				v.literal("archivedToGit"),
			),
		),
		authorityTransferId: v.optional(v.id("authorityTransfers")),
		authorityStagingPath: v.optional(v.string()),
	})
		.index("by_workspace", ["workspaceId", "updatedAt"])
		.index("by_workspace_parent", ["workspaceId", "parentId"])
		.index("by_authority_transfer_and_staging_path", [
			"authorityTransferId",
			"authorityStagingPath",
		]),

	authorityTransfers: defineTable({
		operationKey: v.string(),
		ownerId: v.id("users"),
		direction: v.union(v.literal("gitToCloud"), v.literal("cloudToGit")),
		workspaceId: v.id("workspaces"),
		parentFolderId: v.optional(v.id("folders")),
		rootFolderId: v.optional(v.id("folders")),
		state: v.union(
			v.literal("prepared"),
			v.literal("staging"),
			v.literal("verified"),
			v.literal("active"),
			v.literal("cancelled"),
			v.literal("needsAttention"),
		),
		manifestHash: v.string(),
		manifestItemCount: v.number(),
		manifestMarkdownCount: v.number(),
		manifestAssetCount: v.number(),
		manifestTotalBytes: v.number(),
		stagedItemCount: v.number(),
		sourceFingerprint: v.string(),
		destinationFingerprint: v.string(),
		audienceFingerprint: v.string(),
		requestedShares: v.optional(
			v.array(
				v.object({
					email: v.string(),
					role: v.union(
						v.literal("editor"),
						v.literal("commenter"),
						v.literal("viewer"),
					),
				}),
			),
		),
		operationFingerprint: v.string(),
		cutoverToken: v.optional(v.string()),
		recoveryState: v.union(
			v.literal("source"),
			v.literal("recovery"),
			v.literal("restored"),
			v.literal("retained"),
		),
		// Cloud-to-Git transfers retain the archived cloud bytes and the exact
		// cutover fingerprint. Optional fields keep legacy/Git-to-cloud records valid.
		archiveFingerprint: v.optional(v.string()),
		archivedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_owner_and_operation_key", ["ownerId", "operationKey"])
		.index("by_workspace_and_state", ["workspaceId", "state"]),

	authorityTransferItems: defineTable({
		transferId: v.id("authorityTransfers"),
		relativePath: v.string(),
		kind: v.union(v.literal("markdown"), v.literal("asset")),
		contentHash: v.string(),
		size: v.number(),
		stagedDocumentId: v.optional(v.id("documents")),
		stagedAssetId: v.optional(v.id("assets")),
		verified: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_transfer", ["transferId"])
		.index("by_transfer_and_relative_path", ["transferId", "relativePath"]),

	// Folder-level ACL entries (D12, Google Drive semantics). A folder share is
	// NOT a workspace membership; a role on a folder inherits down its subtree,
	// resolved at authorization time in permissions.ts. `userId` XOR `linkScope`
	// ("public" only — a workspace-scoped folder link adds nothing a member
	// doesn't already have). Link shares are capped below owner in the mutations.
	folderShares: defineTable({
		folderId: v.id("folders"),
		userId: v.optional(v.id("users")),
		linkScope: v.optional(v.literal("public")),
		role: v.union(
			v.literal("owner"),
			v.literal("editor"),
			v.literal("commenter"),
			v.literal("viewer"),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_folder", ["folderId"])
		.index("by_folder_user", ["folderId", "userId"])
		.index("by_folder_link", ["folderId", "linkScope"])
		.index("by_user", ["userId"]),

	docShares: defineTable({
		documentId: v.id("documents"),
		userId: v.optional(v.id("users")),
		linkScope: v.optional(v.union(v.literal("workspace"), v.literal("public"))),
		role: v.union(
			v.literal("owner"),
			v.literal("editor"),
			v.literal("commenter"),
			v.literal("viewer"),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_document", ["documentId"])
		.index("by_document_user", ["documentId", "userId"])
		.index("by_document_link", ["documentId", "linkScope"])
		.index("by_user", ["userId"]),

	documentSuggestions: defineTable({
		documentId: v.id("documents"),
		baseRevision: v.number(),
		intent: v.any(),
		actor: v.optional(v.string()),
		status: v.union(
			v.literal("pending"),
			v.literal("accepted"),
			v.literal("rejected"),
		),
		createdAt: v.number(),
		resolvedAt: v.optional(v.number()),
	})
		.index("by_document", ["documentId", "createdAt"])
		.index("by_document_status", ["documentId", "status", "createdAt"]),

	revisions: defineTable({
		documentId: v.id("documents"),
		createdAt: v.number(),
		actor: v.optional(v.string()),
		label: v.optional(v.string()),
		pmDoc: v.any(),
		markdown: v.string(),
		revision: v.number(),
		crdtMeta: v.optional(v.any()),
	}).index("by_document", ["documentId", "createdAt"]),

	commentThreads: defineTable({
		documentId: v.id("documents"),
		anchor: v.any(),
		createdBy: v.optional(v.string()),
		createdAt: v.number(),
		resolvedAt: v.optional(v.number()),
		resolvedBy: v.optional(v.string()),
	})
		.index("by_document", ["documentId", "createdAt"])
		.index("by_document_resolved", ["documentId", "resolvedAt"]),

	comments: defineTable({
		documentId: v.id("documents"),
		threadId: v.id("commentThreads"),
		author: v.optional(v.string()),
		body: v.string(),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
	}).index("by_thread", ["threadId", "createdAt"]),

	activityEvents: defineTable({
		workspaceId: v.id("workspaces"),
		documentId: v.optional(v.id("documents")),
		type: v.string(),
		actor: v.optional(v.string()),
		message: v.string(),
		createdAt: v.number(),
		metadata: v.optional(v.any()),
	})
		.index("by_workspace", ["workspaceId", "createdAt"])
		.index("by_document", ["documentId", "createdAt"]),

	notifications: defineTable({
		userId: v.id("users"),
		documentId: v.optional(v.id("documents")),
		type: v.string(),
		message: v.string(),
		createdAt: v.number(),
		readAt: v.optional(v.number()),
		metadata: v.optional(v.any()),
	})
		.index("by_user", ["userId", "createdAt"])
		.index("by_user_read", ["userId", "readAt", "createdAt"]),

	assets: defineTable({
		workspaceId: v.id("workspaces"),
		path: v.string(),
		storageId: v.id("_storage"),
		contentHash: v.string(),
		updatedAt: v.number(),
		orphanedAt: v.optional(v.number()),
		deviceId: v.string(),
		deleted: v.boolean(),
		// A staged asset inherits visibility from this authority root. Legacy
		// assets omit it and remain active.
		authorityRootId: v.optional(v.id("folders")),
	})
		.index("by_workspace", ["workspaceId", "updatedAt"])
		.index("by_workspace_path", ["workspaceId", "path"])
		.index("by_authority_root", ["authorityRootId", "path"])
		.index("by_storage", ["storageId"]),

	livePocUsers: defineTable({
		workspaceId: v.id("workspaces"),
		docId: v.string(),
		userId: v.string(),
		name: v.string(),
		anchor: v.optional(v.number()),
		head: v.optional(v.number()),
		updatedAt: v.number(),
	})
		.index("by_doc", ["docId", "updatedAt"])
		.index("by_doc_user", ["docId", "userId"]),
});
