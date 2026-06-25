import { getAuthUserId } from "@convex-dev/auth/server";
import { ProsemirrorSync } from "@convex-dev/prosemirror-sync";
import {
	getHubbleEditorSchema,
	markdownToTiptapDoc,
	tiptapDocToMarkdown,
} from "@hubble.md/editor";
import { Step, Transform } from "@tiptap/pm/transform";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { currentActorName } from "./authIdentity";
import {
	documentRole,
	requireDocumentOwner,
	requireDocumentRead,
	requireDocumentWrite,
	requireWorkspaceMember,
} from "./permissions";

const prosemirrorSync = new ProsemirrorSync(components.prosemirrorSync);

type DocumentRole = "owner" | "editor" | "commenter" | "viewer";
type LinkScope = "workspace" | "public";

function normalizeTitle(title: string): string {
	const trimmed = title.trim();
	if (!trimmed) throw new Error("Document title is required");
	return trimmed;
}

function syncDocumentId(documentId: string): string {
	return `document:${documentId}`;
}

async function ensureDocumentShare(
	ctx: MutationCtx,
	args: {
		documentId: Id<"documents">;
		userId?: Id<"users">;
		linkScope?: LinkScope;
		role: DocumentRole;
	},
) {
	const now = Date.now();
	const existing =
		args.userId !== undefined
			? await ctx.db
					.query("docShares")
					.withIndex("by_document_user", (q) =>
						q.eq("documentId", args.documentId).eq("userId", args.userId),
					)
					.unique()
			: args.linkScope !== undefined
				? await ctx.db
						.query("docShares")
						.withIndex("by_document_link", (q) =>
							q
								.eq("documentId", args.documentId)
								.eq("linkScope", args.linkScope),
						)
						.unique()
				: null;
	if (existing) {
		await ctx.db.patch(existing._id, {
			role: args.role,
			updatedAt: now,
		});
		return existing._id;
	}
	return ctx.db.insert("docShares", {
		documentId: args.documentId,
		userId: args.userId,
		linkScope: args.linkScope,
		role: args.role,
		createdAt: now,
		updatedAt: now,
	});
}

async function ensureCurrentUserOwnerShare(
	ctx: MutationCtx,
	documentId: Id<"documents">,
) {
	const userId = await getAuthUserId(ctx);
	if (!userId) return;
	await ensureDocumentShare(ctx, {
		documentId,
		userId,
		role: "owner",
	});
}

async function replaceLiveDocumentMarkdown(
	ctx: MutationCtx,
	documentId: string,
	markdown: string,
) {
	const schema = getHubbleEditorSchema();
	const id = syncDocumentId(documentId);
	const nextDoc = schema.nodeFromJSON(markdownToTiptapDoc(markdown));
	const snapshot = (await ctx.runQuery(
		components.prosemirrorSync.lib.getSnapshot,
		{ id },
	)) as { content: string | null; version?: number };

	if (!snapshot.content) {
		await prosemirrorSync.create(ctx, id, nextDoc.toJSON());
		return;
	}

	await prosemirrorSync.transform(
		ctx,
		id,
		schema,
		(doc) => {
			if (doc.eq(nextDoc)) return null;
			const tr = new Transform(doc);
			tr.replaceWith(0, doc.content.size, nextDoc.content);
			return tr;
		},
		{ clientId: "import" },
	);
}

async function projectMarkdown(
	ctx: MutationCtx | QueryCtx,
	documentId: string,
): Promise<{ markdown: string; version: number | null }> {
	const schema = getHubbleEditorSchema();
	const id = syncDocumentId(documentId);
	const snapshot = (await ctx.runQuery(
		components.prosemirrorSync.lib.getSnapshot,
		{ id },
	)) as { content: string | null; version?: number };
	if (!snapshot.content || snapshot.version === undefined) {
		// A document row can exist before the editor creates its first live
		// ProseMirror snapshot; read projection should stay empty, not fail.
		return { markdown: "", version: null };
	}
	const transform = new Transform(
		schema.nodeFromJSON(JSON.parse(snapshot.content)),
	);
	const latest = (await ctx.runQuery(components.prosemirrorSync.lib.getSteps, {
		id,
		version: snapshot.version,
	})) as { steps: string[]; version: number };
	for (const step of latest.steps) {
		transform.step(Step.fromJSON(schema, JSON.parse(step)));
	}
	return {
		markdown: tiptapDocToMarkdown(transform.doc.toJSON()),
		version: latest.version,
	};
}

function appendMarkdown(currentMarkdown: string, markdown: string): string {
	const base = currentMarkdown.trimEnd();
	const addition = markdown.trim();
	if (!base) return addition;
	if (!addition) return base;
	return `${base}\n\n${addition}`;
}

function insertMarkdownAfterHeading(
	currentMarkdown: string,
	heading: string,
	markdown: string,
): string {
	const lines = currentMarkdown.split(/\r?\n/);
	const target = heading.trim().toLowerCase();
	const index = lines.findIndex((line) => {
		const match = /^(#{1,6})\s+(.+)$/.exec(line);
		return match?.[2]?.trim().toLowerCase() === target;
	});
	if (index === -1) {
		throw new Error(`Heading not found: ${heading}`);
	}
	const addition = markdown.trim();
	if (!addition) return currentMarkdown;
	return [
		...lines.slice(0, index + 1),
		"",
		addition,
		...lines.slice(index + 1),
	].join("\n");
}

async function transformLiveDocumentMarkdown(
	ctx: MutationCtx,
	documentId: Id<"documents">,
	nextMarkdown: string,
	clientId: string,
) {
	const schema = getHubbleEditorSchema();
	const id = syncDocumentId(documentId);
	const nextDoc = schema.nodeFromJSON(markdownToTiptapDoc(nextMarkdown));
	await prosemirrorSync.transform(
		ctx,
		id,
		schema,
		(doc) => {
			if (doc.eq(nextDoc)) return null;
			const tr = new Transform(doc);
			tr.replaceWith(0, doc.content.size, nextDoc.content);
			return tr;
		},
		{ clientId },
	);
}

function markdownOutline(markdown: string) {
	return markdown
		.split(/\r?\n/)
		.map((line, index) => {
			const match = /^(#{1,6})\s+(.+)$/.exec(line);
			if (!match) return null;
			const text = match[2]?.trim();
			if (!text) return null;
			return {
				level: match[1]?.length ?? 1,
				text,
				line: index + 1,
				slug: text
					.toLowerCase()
					.replace(/[^a-z0-9\s-]/g, "")
					.trim()
					.replace(/\s+/g, "-"),
			};
		})
		.filter((heading) => heading !== null);
}

export const list = query({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, { workspaceId }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const documents = await ctx.db
			.query("documents")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		const activeDocuments = documents
			.filter((document) => document.deletedAt === undefined)
			.sort((a, b) => b.updatedAt - a.updatedAt);
		const roles = await Promise.all(
			activeDocuments.map((document) => documentRole(ctx, document._id)),
		);
		return activeDocuments.filter((_, index) => roles[index] !== null);
	},
});

export const get = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		await requireDocumentRead(ctx, documentId);
		const document = await ctx.db.get(documentId);
		if (!document || document.deletedAt !== undefined) return null;
		return document;
	},
});

export const getWithMarkdown = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		await requireDocumentRead(ctx, documentId);
		const document = await ctx.db.get(documentId);
		if (!document || document.deletedAt !== undefined) return null;
		const projection = await projectMarkdown(ctx, documentId);
		return {
			...document,
			markdown: projection.markdown,
			version: projection.version,
		};
	},
});

export const getForAgent = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		await requireDocumentRead(ctx, documentId);
		const document = await ctx.db.get(documentId);
		if (!document || document.deletedAt !== undefined) return null;
		const projection = await projectMarkdown(ctx, documentId);
		return {
			documentId,
			revision: projection.version ?? 0,
			markdown: projection.markdown,
			outline: markdownOutline(projection.markdown),
			title: document.title,
			path: document.path,
			updatedAt: document.updatedAt,
			updatedBy: document.updatedBy,
		};
	},
});

export const listWithMarkdown = query({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, { workspaceId }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const documents = await ctx.db
			.query("documents")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		const activeDocuments = documents
			.filter((document) => document.deletedAt === undefined)
			.sort((a, b) => b.updatedAt - a.updatedAt);
		const readableDocuments = [];
		for (const document of activeDocuments) {
			if ((await documentRole(ctx, document._id)) !== null) {
				readableDocuments.push(document);
			}
		}
		return Promise.all(
			readableDocuments.map(async (document) => {
				const projection = await projectMarkdown(ctx, document._id);
				return {
					...document,
					markdown: projection.markdown,
					version: projection.version,
				};
			}),
		);
	},
});

export const applyPatch = mutation({
	args: {
		documentId: v.id("documents"),
		baseRevision: v.number(),
		intent: v.union(
			v.object({
				kind: v.literal("replace-document"),
				markdown: v.string(),
			}),
			v.object({
				kind: v.literal("append-markdown"),
				markdown: v.string(),
			}),
			v.object({
				kind: v.literal("insert-after-heading"),
				heading: v.string(),
				markdown: v.string(),
			}),
		),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { documentId, baseRevision, intent, actor }) => {
		await requireDocumentWrite(ctx, documentId);
		const document = await ctx.db.get(documentId);
		if (!document || document.deletedAt !== undefined) {
			throw new Error("Document not found");
		}

		const current = await projectMarkdown(ctx, documentId);
		const currentRevision = current.version ?? 0;
		if (currentRevision !== baseRevision) {
			throw new Error(
				`Stale base revision: expected ${currentRevision}, got ${baseRevision}`,
			);
		}

		const nextMarkdown =
			intent.kind === "replace-document"
				? intent.markdown
				: intent.kind === "append-markdown"
					? appendMarkdown(current.markdown, intent.markdown)
					: insertMarkdownAfterHeading(
							current.markdown,
							intent.heading,
							intent.markdown,
						);

		await transformLiveDocumentMarkdown(ctx, documentId, nextMarkdown, "agent");
		const now = Date.now();
		await ctx.db.patch(documentId, {
			updatedBy: actor?.trim() || "Agent",
			updatedAt: now,
		});
		const projection = await projectMarkdown(ctx, documentId);
		return {
			documentId,
			revision: projection.version ?? currentRevision,
			markdown: projection.markdown,
			outline: markdownOutline(projection.markdown),
			updatedAt: now,
		};
	},
});

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		title: v.string(),
		path: v.optional(v.string()),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { workspaceId, title, path, actor }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const now = Date.now();
		const resolvedActor = await currentActorName(ctx, actor);
		const documentId = await ctx.db.insert("documents", {
			workspaceId,
			title: normalizeTitle(title),
			path: path?.trim() || undefined,
			createdBy: resolvedActor,
			createdAt: now,
			updatedBy: resolvedActor,
			updatedAt: now,
		});
		await ensureCurrentUserOwnerShare(ctx, documentId);
		return documentId;
	},
});

export const importMarkdown = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		path: v.string(),
		title: v.string(),
		markdown: v.string(),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { workspaceId, path, title, markdown, actor }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const resolvedActor = await currentActorName(ctx, actor);
		const normalizedTitle = normalizeTitle(title);
		const normalizedPath = path.trim();
		if (!normalizedPath) throw new Error("Document path is required");
		const pathMatches = await ctx.db
			.query("documents")
			.withIndex("by_workspace_path", (q) =>
				q.eq("workspaceId", workspaceId).eq("path", normalizedPath),
			)
			.collect();
		const existing = pathMatches.find(
			(document) => document.deletedAt === undefined,
		);
		const now = Date.now();
		const documentId = existing
			? existing._id
			: await ctx.db.insert("documents", {
					workspaceId,
					title: normalizedTitle,
					path: normalizedPath,
					createdBy: resolvedActor,
					createdAt: now,
					updatedBy: resolvedActor,
					updatedAt: now,
				});
		if (existing) {
			await ctx.db.patch(documentId, {
				title: normalizedTitle,
				path: normalizedPath,
				updatedBy: resolvedActor,
				updatedAt: now,
			});
		} else {
			await ensureCurrentUserOwnerShare(ctx, documentId);
		}
		await replaceLiveDocumentMarkdown(ctx, documentId, markdown);
		return {
			documentId,
			path: normalizedPath,
			title: normalizedTitle,
			created: !existing,
		};
	},
});

export const listShares = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		await requireDocumentOwner(ctx, documentId);
		const shares = await ctx.db
			.query("docShares")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.collect();
		return Promise.all(
			shares.map(async (share) => ({
				...share,
				user: share.userId ? await ctx.db.get(share.userId) : null,
			})),
		);
	},
});

export const setUserShare = mutation({
	args: {
		documentId: v.id("documents"),
		userId: v.id("users"),
		role: v.union(
			v.literal("owner"),
			v.literal("editor"),
			v.literal("commenter"),
			v.literal("viewer"),
		),
	},
	handler: async (ctx, { documentId, userId, role }) => {
		await requireDocumentOwner(ctx, documentId);
		await ensureDocumentShare(ctx, { documentId, userId, role });
	},
});

export const setUserShareByEmail = mutation({
	args: {
		documentId: v.id("documents"),
		email: v.string(),
		role: v.union(
			v.literal("owner"),
			v.literal("editor"),
			v.literal("commenter"),
			v.literal("viewer"),
		),
	},
	handler: async (ctx, { documentId, email, role }) => {
		await requireDocumentOwner(ctx, documentId);
		const normalizedEmail = email.trim().toLowerCase();
		if (!normalizedEmail) throw new Error("Email is required");
		const users = await ctx.db.query("users").collect();
		const user = users.find(
			(candidate) => candidate.email?.toLowerCase() === normalizedEmail,
		);
		if (!user) throw new Error(`No Hubble user found for ${normalizedEmail}`);
		await ensureDocumentShare(ctx, { documentId, userId: user._id, role });
		return user._id;
	},
});

export const removeUserShare = mutation({
	args: {
		documentId: v.id("documents"),
		userId: v.id("users"),
	},
	handler: async (ctx, { documentId, userId }) => {
		await requireDocumentOwner(ctx, documentId);
		const existing = await ctx.db
			.query("docShares")
			.withIndex("by_document_user", (q) =>
				q.eq("documentId", documentId).eq("userId", userId),
			)
			.unique();
		if (existing) await ctx.db.delete(existing._id);
	},
});

export const setLinkShare = mutation({
	args: {
		documentId: v.id("documents"),
		linkScope: v.union(v.literal("workspace"), v.literal("public")),
		role: v.union(
			v.literal("editor"),
			v.literal("commenter"),
			v.literal("viewer"),
		),
	},
	handler: async (ctx, { documentId, linkScope, role }) => {
		await requireDocumentOwner(ctx, documentId);
		await ensureDocumentShare(ctx, { documentId, linkScope, role });
	},
});

export const clearLinkShare = mutation({
	args: {
		documentId: v.id("documents"),
		linkScope: v.union(v.literal("workspace"), v.literal("public")),
	},
	handler: async (ctx, { documentId, linkScope }) => {
		await requireDocumentOwner(ctx, documentId);
		const existing = await ctx.db
			.query("docShares")
			.withIndex("by_document_link", (q) =>
				q.eq("documentId", documentId).eq("linkScope", linkScope),
			)
			.unique();
		if (existing) await ctx.db.delete(existing._id);
	},
});

export const markEdited = mutation({
	args: {
		documentId: v.id("documents"),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { documentId, actor }) => {
		await requireDocumentWrite(ctx, documentId);
		const document = await ctx.db.get(documentId);
		if (!document || document.deletedAt !== undefined) return;
		const resolvedActor = await currentActorName(ctx, actor);
		await ctx.db.patch(documentId, {
			updatedBy: resolvedActor,
			updatedAt: Date.now(),
		});
	},
});

export const rename = mutation({
	args: {
		documentId: v.id("documents"),
		title: v.string(),
		path: v.optional(v.string()),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { documentId, title, path, actor }) => {
		await requireDocumentWrite(ctx, documentId);
		const document = await ctx.db.get(documentId);
		if (!document || document.deletedAt !== undefined) {
			throw new Error("Document not found");
		}
		const resolvedActor = await currentActorName(ctx, actor);
		await ctx.db.patch(documentId, {
			title: normalizeTitle(title),
			path: path?.trim() || undefined,
			updatedBy: resolvedActor,
			updatedAt: Date.now(),
		});
	},
});

export const remove = mutation({
	args: {
		documentId: v.id("documents"),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { documentId, actor }) => {
		await requireDocumentWrite(ctx, documentId);
		const document = await ctx.db.get(documentId);
		if (!document || document.deletedAt !== undefined) return;
		const now = Date.now();
		const resolvedActor = await currentActorName(ctx, actor);
		await ctx.db.patch(documentId, {
			deletedAt: now,
			updatedBy: resolvedActor,
			updatedAt: now,
		});
	},
});
