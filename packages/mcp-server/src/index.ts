#!/usr/bin/env node
import { createConvexBackend } from "@hubble.md/convex-client";
import type { AgentPatchIntent } from "@hubble.md/sync";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type HubbleToolResult = {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
};

function getArgValue(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	if (index === -1) return undefined;
	return process.argv[index + 1];
}

function getDeploymentUrl(): string {
	return (
		getArgValue("--url") ??
		process.env.HUBBLE_CONVEX_URL ??
		process.env.CONVEX_URL ??
		"http://127.0.0.1:3210"
	);
}

function getAuthToken(): string | undefined {
	return (
		getArgValue("--auth-token") ??
		process.env.HUBBLE_AUTH_TOKEN ??
		process.env.CONVEX_AUTH_TOKEN
	);
}

function textResult(value: unknown): HubbleToolResult {
	return {
		content: [
			{
				type: "text",
				text:
					typeof value === "string" ? value : JSON.stringify(value, null, 2),
			},
		],
	};
}

function errorResult(error: unknown): HubbleToolResult {
	return {
		content: [
			{
				type: "text",
				text: error instanceof Error ? error.message : String(error),
			},
		],
		isError: true,
	};
}

function createPatchIntent(args: {
	replace?: string;
	append?: string;
	afterHeading?: string;
	markdown?: string;
	baseMarkdown?: string;
	from?: number;
	to?: number;
}): AgentPatchIntent {
	const selected = [
		args.replace !== undefined,
		args.append !== undefined,
		args.afterHeading !== undefined,
		args.from !== undefined ||
			args.to !== undefined ||
			args.baseMarkdown !== undefined,
	].filter(Boolean).length;
	if (selected !== 1) {
		throw new Error(
			"Choose exactly one patch mode: replace, append, insert after heading, or replace range.",
		);
	}

	if (args.replace !== undefined) {
		return { kind: "replace-document", markdown: args.replace };
	}
	if (args.append !== undefined) {
		return { kind: "append-markdown", markdown: args.append };
	}
	if (args.afterHeading !== undefined) {
		if (args.markdown === undefined) {
			throw new Error("markdown is required with afterHeading.");
		}
		return {
			kind: "insert-after-heading",
			heading: args.afterHeading,
			markdown: args.markdown,
		};
	}
	if (
		args.baseMarkdown === undefined ||
		args.from === undefined ||
		args.to === undefined ||
		args.markdown === undefined
	) {
		throw new Error(
			"baseMarkdown, from, to, and markdown are required for replace-range patches.",
		);
	}
	return {
		kind: "replace-range",
		baseMarkdown: args.baseMarkdown,
		from: args.from,
		to: args.to,
		markdown: args.markdown,
	};
}

const deploymentUrl = getDeploymentUrl();
const backend = createConvexBackend(deploymentUrl, getAuthToken());
const server = new McpServer({
	name: "hubble-live-documents",
	version: "0.0.1",
});

server.registerTool(
	"hubble_get_document",
	{
		title: "Get Hubble Live Document",
		description:
			"Read a Hubble Live Document with revision, markdown, role, and write capability.",
		inputSchema: {
			documentId: z.string().min(1),
		},
	},
	async ({ documentId }) => {
		try {
			const document = await backend.getDocumentForAgent(documentId);
			if (!document) throw new Error(`Document not found: ${documentId}`);
			return textResult(document);
		} catch (error) {
			return errorResult(error);
		}
	},
);

server.registerTool(
	"hubble_patch_document",
	{
		title: "Patch Hubble Live Document",
		description:
			"Apply an attributed patch to a Hubble Live Document through the same permission-checked API used by agents and the CLI.",
		inputSchema: {
			documentId: z.string().min(1),
			baseRevision: z.number().int().nonnegative(),
			replace: z.string().optional(),
			append: z.string().optional(),
			afterHeading: z.string().optional(),
			markdown: z.string().optional(),
			baseMarkdown: z.string().optional(),
			from: z.number().int().nonnegative().optional(),
			to: z.number().int().nonnegative().optional(),
			actor: z.string().optional(),
		},
	},
	async (args) => {
		try {
			const result = await backend.applyDocumentPatch({
				documentId: args.documentId,
				baseRevision: args.baseRevision,
				intent: createPatchIntent(args),
				actor: args.actor ?? "mcp-agent",
			});
			return textResult(result);
		} catch (error) {
			return errorResult(error);
		}
	},
);

server.registerTool(
	"hubble_export_markdown",
	{
		title: "Export Hubble Live Document Markdown",
		description:
			"Return only the current markdown projection for a Hubble Live Document.",
		inputSchema: {
			documentId: z.string().min(1),
		},
	},
	async ({ documentId }) => {
		try {
			const document = await backend.getDocumentForAgent(documentId);
			if (!document) throw new Error(`Document not found: ${documentId}`);
			return textResult(document.markdown);
		} catch (error) {
			return errorResult(error);
		}
	},
);

const transport = new StdioServerTransport();
await server.connect(transport);
