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
type PatchIntent =
	| { kind: "replace-document"; markdown: string }
	| { kind: "append-markdown"; markdown: string }
	| { kind: "insert-after-heading"; heading: string; markdown: string };

const patchIntentValidator = v.union(
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
);

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

async function logActivity(
	ctx: MutationCtx,
	args: {
		documentId: Id<"documents">;
		type: string;
		message: string;
		actor?: string;
		metadata?: unknown;
	},
) {
	const document = await ctx.db.get(args.documentId);
	if (!document) return;
	await ctx.db.insert("activityEvents", {
		workspaceId: document.workspaceId,
		documentId: args.documentId,
		type: args.type,
		actor: args.actor,
		message: args.message,
		createdAt: Date.now(),
		metadata: args.metadata,
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
): Promise<{
	markdown: string;
	version: number | null;
	pmDoc: unknown | null;
}> {
	const schema = getHubbleEditorSchema();
	const id = syncDocumentId(documentId);
	const snapshot = (await ctx.runQuery(
		components.prosemirrorSync.lib.getSnapshot,
		{ id },
	)) as { content: string | null; version?: number };
	if (!snapshot.content || snapshot.version === undefined) {
		// A document row can exist before the editor creates its first live
		// ProseMirror snapshot; read projection should stay empty, not fail.
		return { markdown: "", version: null, pmDoc: null };
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
		pmDoc: transform.doc.toJSON(),
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

async function applyPatchToDocument(
	ctx: MutationCtx,
	args: {
		documentId: Id<"documents">;
		baseRevision: number;
		intent: PatchIntent;
		actor?: string;
	},
) {
	await requireDocumentWrite(ctx, args.documentId);
	const document = await ctx.db.get(args.documentId);
	if (!document || document.deletedAt !== undefined) {
		throw new Error("Document not found");
	}

	const current = await projectMarkdown(ctx, args.documentId);
	const currentRevision = current.version ?? 0;
	if (currentRevision !== args.baseRevision) {
		throw new Error(
			`Stale base revision: expected ${currentRevision}, got ${args.baseRevision}`,
		);
	}

	await materializeRevisionForDocument(ctx, {
		documentId: args.documentId,
		actor: args.actor?.trim() || "Agent",
		label: "Before agent patch",
	});

	const nextMarkdown =
		args.intent.kind === "replace-document"
			? args.intent.markdown
			: args.intent.kind === "append-markdown"
				? appendMarkdown(current.markdown, args.intent.markdown)
				: insertMarkdownAfterHeading(
						current.markdown,
						args.intent.heading,
						args.intent.markdown,
					);

	await transformLiveDocumentMarkdown(
		ctx,
		args.documentId,
		nextMarkdown,
		"agent",
	);
	const now = Date.now();
	await ctx.db.patch(args.documentId, {
		updatedBy: args.actor?.trim() || "Agent",
		updatedAt: now,
	});
	await logActivity(ctx, {
		documentId: args.documentId,
		type: "document.patch",
		actor: args.actor?.trim() || "Agent",
		message: "Applied a document patch",
		metadata: { baseRevision: args.baseRevision, intent: args.intent.kind },
	});
	const projection = await projectMarkdown(ctx, args.documentId);
	return {
		documentId: args.documentId,
		revision: projection.version ?? currentRevision,
		markdown: projection.markdown,
		outline: markdownOutline(projection.markdown),
		updatedAt: now,
	};
}

async function materializeRevisionForDocument(
	ctx: MutationCtx,
	args: {
		documentId: Id<"documents">;
		actor?: string;
		label?: string;
	},
) {
	await requireDocumentRead(ctx, args.documentId);
	const projection = await projectMarkdown(ctx, args.documentId);
	return ctx.db.insert("revisions", {
		documentId: args.documentId,
		createdAt: Date.now(),
		actor: args.actor,
		label: args.label,
		pmDoc: projection.pmDoc,
		markdown: projection.markdown,
		revision: projection.version ?? 0,
		crdtMeta: { prosemirrorVersion: projection.version ?? 0 },
	});
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

function searchSnippet(markdown: string, query: string): string {
	const lower = markdown.toLowerCase();
	const index = lower.indexOf(query.toLowerCase());
	if (index === -1) return markdown.slice(0, 160);
	const start = Math.max(0, index - 80);
	const end = Math.min(markdown.length, index + query.length + 80);
	return markdown.slice(start, end).trim();
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

export const listRevisions = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		await requireDocumentRead(ctx, documentId);
		const revisions = await ctx.db
			.query("revisions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.collect();
		return revisions.sort((a, b) => b.createdAt - a.createdAt);
	},
});

export const listActivity = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		await requireDocumentRead(ctx, documentId);
		const events = await ctx.db
			.query("activityEvents")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.collect();
		return events.sort((a, b) => b.createdAt - a.createdAt);
	},
});

export const materializeRevision = mutation({
	args: {
		documentId: v.id("documents"),
		label: v.optional(v.string()),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { documentId, label, actor }) => {
		await requireDocumentWrite(ctx, documentId);
		return materializeRevisionForDocument(ctx, {
			documentId,
			label: label?.trim() || undefined,
			actor: actor?.trim() || "Manual snapshot",
		});
	},
});

export const restoreRevision = mutation({
	args: {
		revisionId: v.id("revisions"),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { revisionId, actor }) => {
		const revision = await ctx.db.get(revisionId);
		if (!revision) throw new Error("Revision not found");
		await requireDocumentWrite(ctx, revision.documentId);
		await materializeRevisionForDocument(ctx, {
			documentId: revision.documentId,
			label: "Before restore",
			actor: actor?.trim() || "Restore",
		});
		await transformLiveDocumentMarkdown(
			ctx,
			revision.documentId,
			revision.markdown,
			"restore",
		);
		const now = Date.now();
		await ctx.db.patch(revision.documentId, {
			updatedBy: actor?.trim() || "Restore",
			updatedAt: now,
		});
		await logActivity(ctx, {
			documentId: revision.documentId,
			type: "document.restore",
			actor: actor?.trim() || "Restore",
			message: "Restored a revision",
			metadata: { revisionId },
		});
		const projection = await projectMarkdown(ctx, revision.documentId);
		return {
			documentId: revision.documentId,
			revision: projection.version ?? 0,
			markdown: projection.markdown,
			outline: markdownOutline(projection.markdown),
			updatedAt: now,
		};
	},
});

export const listCommentThreads = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		await requireDocumentRead(ctx, documentId);
		const threads = await ctx.db
			.query("commentThreads")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.collect();
		return Promise.all(
			threads
				.sort((a, b) => b.createdAt - a.createdAt)
				.map(async (thread) => ({
					...thread,
					comments: await ctx.db
						.query("comments")
						.withIndex("by_thread", (q) => q.eq("threadId", thread._id))
						.collect(),
				})),
		);
	},
});

export const createCommentThread = mutation({
	args: {
		documentId: v.id("documents"),
		anchor: v.any(),
		body: v.string(),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { documentId, anchor, body, actor }) => {
		await requireDocumentRead(ctx, documentId);
		const trimmed = body.trim();
		if (!trimmed) throw new Error("Comment body is required");
		const author = await currentActorName(ctx, actor);
		const now = Date.now();
		const threadId = await ctx.db.insert("commentThreads", {
			documentId,
			anchor,
			createdBy: author,
			createdAt: now,
		});
		await ctx.db.insert("comments", {
			documentId,
			threadId,
			author,
			body: trimmed,
			createdAt: now,
		});
		await logActivity(ctx, {
			documentId,
			type: "comment.thread",
			actor: author,
			message: "Started a comment thread",
			metadata: { threadId },
		});
		return threadId;
	},
});

export const replyToCommentThread = mutation({
	args: {
		threadId: v.id("commentThreads"),
		body: v.string(),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { threadId, body, actor }) => {
		const thread = await ctx.db.get(threadId);
		if (!thread) throw new Error("Comment thread not found");
		await requireDocumentRead(ctx, thread.documentId);
		const trimmed = body.trim();
		if (!trimmed) throw new Error("Comment body is required");
		const commentId = await ctx.db.insert("comments", {
			documentId: thread.documentId,
			threadId,
			author: await currentActorName(ctx, actor),
			body: trimmed,
			createdAt: Date.now(),
		});
		await logActivity(ctx, {
			documentId: thread.documentId,
			type: "comment.reply",
			actor: await currentActorName(ctx, actor),
			message: "Replied to a comment thread",
			metadata: { threadId, commentId },
		});
		return commentId;
	},
});

export const resolveCommentThread = mutation({
	args: {
		threadId: v.id("commentThreads"),
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { threadId, actor }) => {
		const thread = await ctx.db.get(threadId);
		if (!thread || thread.resolvedAt !== undefined) return;
		await requireDocumentWrite(ctx, thread.documentId);
		await ctx.db.patch(threadId, {
			resolvedAt: Date.now(),
			resolvedBy: await currentActorName(ctx, actor),
		});
		await logActivity(ctx, {
			documentId: thread.documentId,
			type: "comment.resolve",
			actor: await currentActorName(ctx, actor),
			message: "Resolved a comment thread",
			metadata: { threadId },
		});
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

export const search = query({
	args: {
		workspaceId: v.id("workspaces"),
		query: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { workspaceId, query, limit }) => {
		await requireWorkspaceMember(ctx, workspaceId);
		const needle = query.trim().toLowerCase();
		if (!needle) return [];
		const documents = await ctx.db
			.query("documents")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		const results = [];
		for (const document of documents) {
			if (document.deletedAt !== undefined) continue;
			if ((await documentRole(ctx, document._id)) === null) continue;
			const projection = await projectMarkdown(ctx, document._id);
			const haystack = `${document.title}\n${document.path ?? ""}\n${projection.markdown}`;
			if (!haystack.toLowerCase().includes(needle)) continue;
			results.push({
				documentId: document._id,
				title: document.title,
				path: document.path,
				updatedAt: document.updatedAt,
				updatedBy: document.updatedBy,
				revision: projection.version ?? 0,
				snippet: searchSnippet(projection.markdown, query.trim()),
			});
			if (results.length >= (limit ?? 20)) break;
		}
		return results;
	},
});

export const applyPatch = mutation({
	args: {
		documentId: v.id("documents"),
		baseRevision: v.number(),
		intent: patchIntentValidator,
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { documentId, baseRevision, intent, actor }) => {
		return applyPatchToDocument(ctx, {
			documentId,
			baseRevision,
			intent,
			actor,
		});
	},
});

export const listSuggestions = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		await requireDocumentRead(ctx, documentId);
		return ctx.db
			.query("documentSuggestions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.collect();
	},
});

export const proposeSuggestion = mutation({
	args: {
		documentId: v.id("documents"),
		baseRevision: v.number(),
		intent: patchIntentValidator,
		actor: v.optional(v.string()),
	},
	handler: async (ctx, { documentId, baseRevision, intent, actor }) => {
		await requireDocumentRead(ctx, documentId);
		const suggestionId = await ctx.db.insert("documentSuggestions", {
			documentId,
			baseRevision,
			intent,
			actor: actor?.trim() || "Agent",
			status: "pending",
			createdAt: Date.now(),
		});
		await logActivity(ctx, {
			documentId,
			type: "suggestion.propose",
			actor: actor?.trim() || "Agent",
			message: "Proposed a document change",
			metadata: { suggestionId, intent: intent.kind },
		});
		return suggestionId;
	},
});

export const acceptSuggestion = mutation({
	args: { suggestionId: v.id("documentSuggestions") },
	handler: async (ctx, { suggestionId }) => {
		const suggestion = await ctx.db.get(suggestionId);
		if (!suggestion || suggestion.status !== "pending") {
			throw new Error("Suggestion not found");
		}
		const result = await applyPatchToDocument(ctx, {
			documentId: suggestion.documentId,
			baseRevision: suggestion.baseRevision,
			intent: suggestion.intent as PatchIntent,
			actor: suggestion.actor,
		});
		await ctx.db.patch(suggestionId, {
			status: "accepted",
			resolvedAt: Date.now(),
		});
		await logActivity(ctx, {
			documentId: suggestion.documentId,
			type: "suggestion.accept",
			actor: suggestion.actor,
			message: "Accepted a suggested change",
			metadata: { suggestionId },
		});
		return result;
	},
});

export const rejectSuggestion = mutation({
	args: { suggestionId: v.id("documentSuggestions") },
	handler: async (ctx, { suggestionId }) => {
		const suggestion = await ctx.db.get(suggestionId);
		if (!suggestion || suggestion.status !== "pending") return;
		await requireDocumentWrite(ctx, suggestion.documentId);
		await ctx.db.patch(suggestionId, {
			status: "rejected",
			resolvedAt: Date.now(),
		});
		await logActivity(ctx, {
			documentId: suggestion.documentId,
			type: "suggestion.reject",
			actor: await currentActorName(ctx),
			message: "Rejected a suggested change",
			metadata: { suggestionId },
		});
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
