#!/usr/bin/env node
import { spawn } from "node:child_process";
import { basename } from "node:path";
import { createConvexBackend } from "../packages/convex-client/dist/index.js";

const DEFAULT_WORKSPACE_NAME = "MCP Server Smoke";

function parseArgs(argv) {
	const parsed = {
		url: process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? "",
		authToken: process.env.AUTH_TOKEN ?? process.env.CONVEX_AUTH_TOKEN ?? "",
		workspaceId: process.env.WORKSPACE_ID ?? "",
		workspaceName: process.env.WORKSPACE_NAME ?? DEFAULT_WORKSPACE_NAME,
		actor: process.env.ACTOR ?? "mcp-server-smoke",
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = () => {
			const value = argv[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error(`Missing value for ${arg}`);
			}
			index += 1;
			return value;
		};

		switch (arg) {
			case "--url":
				parsed.url = next();
				break;
			case "--auth-token":
				parsed.authToken = next();
				break;
			case "--workspace-id":
				parsed.workspaceId = next();
				break;
			case "--workspace-name":
				parsed.workspaceName = next();
				break;
			case "--actor":
				parsed.actor = next();
				break;
			case "--help":
			case "-h":
				parsed.help = true;
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return parsed;
}

function printHelp() {
	console.log(`Usage:
  CONVEX_URL=<url> AUTH_TOKEN=<jwt> node scripts/mcp-server-smoke.mjs

Options:
  --url             Convex deployment URL. Defaults to CONVEX_URL or VITE_CONVEX_URL.
  --auth-token      Convex Auth JWT. Defaults to AUTH_TOKEN or CONVEX_AUTH_TOKEN.
  --workspace-id    Existing workspace id to seed into.
  --workspace-name  Workspace to create/reuse when --workspace-id is omitted.
                    Defaults to "${DEFAULT_WORKSPACE_NAME}".
  --actor           Actor metadata for imports and patches.

Build packages first:
  pnpm --filter @hubble.md/sync build
  pnpm --filter @hubble.md/convex-client build
  pnpm --filter @hubble.md/mcp-server build

The smoke launches packages/mcp-server/dist/index.js over stdio, then calls
hubble_get_document, hubble_patch_document, and hubble_export_markdown against a
timestamped hosted Live Document.
`);
}

function requireInput(value, name) {
	if (!value) throw new Error(`Missing ${name}`);
	return value;
}

async function resolveWorkspaceId(backend, args) {
	if (args.workspaceId) return args.workspaceId;
	const existing = await backend.getWorkspace(args.workspaceName);
	if (existing) return existing;
	return backend.createWorkspace(args.workspaceName);
}

function parseResultText(result, label) {
	const content = result?.content;
	if (!Array.isArray(content) || content[0]?.type !== "text") {
		throw new Error(`Unexpected ${label} MCP result shape`);
	}
	if (result.isError) {
		throw new Error(`${label} failed: ${content[0].text}`);
	}
	return content[0].text;
}

class McpStdioClient {
	constructor(command, args) {
		this.nextId = 1;
		this.pending = new Map();
		this.buffer = Buffer.alloc(0);
		this.stderr = "";
		this.child = spawn(command, args, {
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.child.stdout.on("data", (chunk) => this.handleStdout(chunk));
		this.child.stderr.on("data", (chunk) => {
			this.stderr += chunk.toString();
		});
		this.child.on("exit", (code, signal) => {
			if (code === 0 || this.pending.size === 0) return;
			const error = new Error(
				`MCP server exited before responding: code=${code} signal=${signal}\n${this.stderr}`,
			);
			for (const { reject } of this.pending.values()) reject(error);
			this.pending.clear();
		});
	}

	handleStdout(chunk) {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		while (true) {
			const headerEnd = this.buffer.indexOf("\r\n\r\n");
			if (headerEnd === -1) return;

			const header = this.buffer.subarray(0, headerEnd).toString();
			const lengthMatch = /^Content-Length: (\d+)$/im.exec(header);
			if (!lengthMatch) {
				throw new Error(`Missing MCP Content-Length header: ${header}`);
			}

			const contentLength = Number(lengthMatch[1]);
			const messageStart = headerEnd + 4;
			const messageEnd = messageStart + contentLength;
			if (this.buffer.length < messageEnd) return;

			const rawMessage = this.buffer
				.subarray(messageStart, messageEnd)
				.toString();
			this.buffer = this.buffer.subarray(messageEnd);
			this.handleMessage(JSON.parse(rawMessage));
		}
	}

	handleMessage(message) {
		if (message.id === undefined) return;
		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id);
		if (message.error) {
			pending.reject(
				new Error(
					`MCP ${pending.method} failed: ${message.error.message ?? JSON.stringify(message.error)}`,
				),
			);
			return;
		}
		pending.resolve(message.result);
	}

	request(method, params) {
		const id = this.nextId;
		this.nextId += 1;
		const message = {
			jsonrpc: "2.0",
			id,
			method,
			params,
		};
		const raw = JSON.stringify(message);
		this.child.stdin.write(
			`Content-Length: ${Buffer.byteLength(raw)}\r\n\r\n${raw}`,
		);
		return new Promise((resolve, reject) => {
			this.pending.set(id, { method, resolve, reject });
		});
	}

	notify(method, params) {
		const raw = JSON.stringify({
			jsonrpc: "2.0",
			method,
			params,
		});
		this.child.stdin.write(
			`Content-Length: ${Buffer.byteLength(raw)}\r\n\r\n${raw}`,
		);
	}

	async close() {
		this.child.stdin.end();
		if (this.child.exitCode !== null) return;
		await new Promise((resolve) => {
			const timeout = setTimeout(() => {
				this.child.kill("SIGTERM");
				resolve();
			}, 1000);
			this.child.once("exit", () => {
				clearTimeout(timeout);
				resolve();
			});
		});
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		printHelp();
		return;
	}

	const url = requireInput(args.url, "CONVEX_URL");
	const authToken = requireInput(args.authToken, "AUTH_TOKEN");
	const backend = createConvexBackend(url, authToken);
	const workspaceId = await resolveWorkspaceId(backend, args);
	const stamp = new Date()
		.toISOString()
		.replace(/[-:T.Z]/g, "")
		.slice(0, 14);
	const docPath = `Smoke Tests/mcp-${stamp}.md`;
	const title = basename(docPath, ".md");
	const initialMarkdown = `# ${title}\n\nInitial MCP smoke content.\n`;
	const patchMarker = `MCP patch ${stamp}.`;

	const imported = await backend.importLiveDocument({
		workspaceId,
		path: docPath,
		title,
		markdown: initialMarkdown,
		actor: args.actor,
	});

	const client = new McpStdioClient("node", [
		"packages/mcp-server/dist/index.js",
		"--url",
		url,
		"--auth-token",
		authToken,
	]);

	try {
		await client.request("initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "hubble-mcp-smoke", version: "0.0.1" },
		});
		client.notify("notifications/initialized", {});

		const getResult = await client.request("tools/call", {
			name: "hubble_get_document",
			arguments: { documentId: imported.documentId },
		});
		const document = JSON.parse(parseResultText(getResult, "get document"));
		if (!document.canWrite) {
			throw new Error(
				`Imported document is not writable: ${document.documentId}`,
			);
		}

		const patchResult = await client.request("tools/call", {
			name: "hubble_patch_document",
			arguments: {
				documentId: document.documentId,
				baseRevision: document.revision,
				append: `\n\n${patchMarker}\n`,
				actor: args.actor,
			},
		});
		const patched = JSON.parse(parseResultText(patchResult, "patch document"));
		if (patched.revision <= document.revision) {
			throw new Error(
				`Expected revision to advance past ${document.revision}, got ${patched.revision}`,
			);
		}

		const exportResult = await client.request("tools/call", {
			name: "hubble_export_markdown",
			arguments: { documentId: document.documentId },
		});
		const exportedMarkdown = parseResultText(exportResult, "export markdown");
		if (!exportedMarkdown.includes(patchMarker)) {
			throw new Error("Exported markdown did not include the MCP patch marker");
		}

		console.log("MCP server smoke passed");
		console.log(`Convex: ${url}`);
		console.log(`Workspace: ${workspaceId}`);
		console.log(`Document: ${document.documentId}`);
		console.log(`Revision: ${document.revision} -> ${patched.revision}`);
	} finally {
		await client.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
