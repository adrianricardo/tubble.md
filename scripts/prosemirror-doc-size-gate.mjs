#!/usr/bin/env node
import { setTimeout as delay } from "node:timers/promises";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { api } from "../packages/sync-backend/convex/_generated/api.js";

const DEFAULT_WORKSPACE_NAME = "RD5 Doc Size Gate";
const DEFAULT_SIZES_KIB = [64, 256, 768];
const DEFAULT_PATCH_COUNTS = [8, 12, 16];
const DEFAULT_TIMEOUT_MS = 30_000;

function parseArgs(argv) {
	const parsed = {
		url: process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? "",
		authToken: process.env.AUTH_TOKEN ?? process.env.CONVEX_AUTH_TOKEN ?? "",
		workspaceId: process.env.WORKSPACE_ID ?? "",
		workspaceName: process.env.WORKSPACE_NAME ?? DEFAULT_WORKSPACE_NAME,
		sizes: DEFAULT_SIZES_KIB,
		patches: DEFAULT_PATCH_COUNTS,
		actor: process.env.ACTOR ?? "rd5-doc-size-gate",
		timeoutMs: DEFAULT_TIMEOUT_MS,
		json: false,
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
			case "--sizes":
				parsed.sizes = parsePositiveIntegerList(next(), arg);
				break;
			case "--patches":
				parsed.patches = parsePositiveIntegerList(next(), arg);
				break;
			case "--actor":
				parsed.actor = next();
				break;
			case "--timeout-ms":
				parsed.timeoutMs = Number(next());
				if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) {
					throw new Error("--timeout-ms must be a positive number");
				}
				break;
			case "--json":
				parsed.json = true;
				break;
			case "--help":
			case "-h":
				parsed.help = true;
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	if (parsed.patches.length === 1 && parsed.sizes.length > 1) {
		parsed.patches = parsed.sizes.map(() => parsed.patches[0]);
	}
	if (parsed.patches.length !== parsed.sizes.length) {
		throw new Error(
			"--patches must have one value or one value per --sizes entry",
		);
	}

	return parsed;
}

function parsePositiveIntegerList(value, label) {
	const values = value.split(",").map((entry) => Number(entry.trim()));
	if (
		values.length === 0 ||
		values.some((entry) => !Number.isInteger(entry) || entry <= 0)
	) {
		throw new Error(
			`${label} must be a comma-separated list of positive integers`,
		);
	}
	return values;
}

function printHelp() {
	console.log(`Usage:
  CONVEX_URL=<url> node scripts/prosemirror-doc-size-gate.mjs

Options:
  --url             Convex deployment URL. Defaults to CONVEX_URL or VITE_CONVEX_URL.
  --auth-token      Convex Auth JWT. Defaults to AUTH_TOKEN or CONVEX_AUTH_TOKEN.
  --workspace-id    Existing workspace id to seed into.
  --workspace-name  Workspace to create/reuse when --workspace-id is omitted.
                    Defaults to "${DEFAULT_WORKSPACE_NAME}".
  --sizes           Comma-separated initial markdown sizes in KiB.
                    Defaults to ${DEFAULT_SIZES_KIB.join(",")}.
  --patches         Comma-separated patch counts, or one value for every size.
                    Defaults to ${DEFAULT_PATCH_COUNTS.join(",")}.
  --actor           Actor metadata for imports and patches.
  --timeout-ms      Reactive subscriber convergence timeout.
                    Defaults to ${DEFAULT_TIMEOUT_MS}.
  --json            Print only the JSON report.

The script creates timestamped Live Documents and mutates them through
documents.importMarkdown, documents.applyPatch, and documents.getForAgent. It also
opens two Convex reactive subscribers and waits for both to observe the final
revision. It does not replace the manual two-browser Tiptap editor pass.
`);
}

function requireInput(value, name) {
	if (!value) throw new Error(`Missing ${name}`);
	return value;
}

function byteLength(value) {
	return new TextEncoder().encode(value).byteLength;
}

function percentile(values, p) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(
		sorted.length - 1,
		Math.ceil((p / 100) * sorted.length) - 1,
	);
	return sorted[index];
}

async function measure(label, fn) {
	const startedAt = performance.now();
	const result = await fn();
	return {
		label,
		elapsedMs: Math.round(performance.now() - startedAt),
		result,
	};
}

function makeMarkdown(targetKiB, label) {
	const targetBytes = targetKiB * 1024;
	const heading = `# RD5 ${label}\n\n`;
	const paragraph =
		"Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
		"Praesent live document load testing keeps paragraphs simple and repeatable.\n\n";
	let markdown = heading;
	let index = 1;
	while (byteLength(markdown) < targetBytes) {
		markdown += `## Section ${index}\n\n${paragraph}`;
		index += 1;
	}
	return markdown.slice(0, targetBytes);
}

function patchMarkdown(label, index) {
	return `\n\nRD5 patch ${index + 1} for ${label}: ${"x".repeat(192)}`;
}

async function resolveWorkspaceId(client, args) {
	if (args.workspaceId) return args.workspaceId;
	const existing = await client.query(api.sync.getWorkspace, {
		name: args.workspaceName,
	});
	if (existing) return existing._id;
	return client.mutation(api.sync.createWorkspace, {
		name: args.workspaceName,
	});
}

function createHttpClient(url, authToken) {
	const client = new ConvexHttpClient(url);
	if (authToken) client.setAuth(authToken);
	return client;
}

function createReactiveClient(url, authToken) {
	const client = new ConvexClient(url);
	if (authToken) client.setAuth(async () => authToken);
	return client;
}

async function waitForReactiveRevision(args) {
	const observed = [null, null];
	const clients = [
		createReactiveClient(args.url, args.authToken),
		createReactiveClient(args.url, args.authToken),
	];
	let unsubscribes = [];

	const done = new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(
				new Error(
					`Timed out waiting for subscribers to observe revision ${args.revision}; observed ${observed.join(", ")}`,
				),
			);
		}, args.timeoutMs);
		unsubscribes = clients.map((client, index) =>
			client.onUpdate(
				api.documents.getForAgent,
				{ documentId: args.documentId },
				(document) => {
					observed[index] = document?.revision ?? null;
					if (observed.every((revision) => revision >= args.revision)) {
						clearTimeout(timeout);
						for (const unsubscribe of unsubscribes) unsubscribe();
						resolve([...observed]);
					}
				},
				(error) => {
					clearTimeout(timeout);
					for (const unsubscribe of unsubscribes) unsubscribe();
					reject(error);
				},
			),
		);
	});

	try {
		return await done;
	} finally {
		await Promise.all(clients.map((client) => client.close()));
	}
}

async function runCase(args) {
	const label = `${args.sizeKiB}kib-${args.stamp}`;
	const title = `RD5 ${label}`;
	const path = `RD5/${title}.md`;
	const markdown = makeMarkdown(args.sizeKiB, label);

	const imported = await measure("import", () =>
		args.client.mutation(api.documents.importMarkdown, {
			workspaceId: args.workspaceId,
			path,
			title,
			markdown,
			actor: args.actor,
		}),
	);

	const documentId = imported.result.documentId;
	const initialRead = await measure("initialRead", () =>
		args.client.query(api.documents.getForAgent, { documentId }),
	);
	if (!initialRead.result?.canWrite) {
		throw new Error(`Seeded document is not writable: ${documentId}`);
	}

	let revision = initialRead.result.revision;
	const patchLatencies = [];
	for (let index = 0; index < args.patchCount; index += 1) {
		const patch = await measure(`patch-${index + 1}`, () =>
			args.client.mutation(api.documents.applyPatch, {
				documentId,
				baseRevision: revision,
				intent: {
					kind: "append-markdown",
					markdown: patchMarkdown(label, index),
				},
				actor: args.actor,
			}),
		);
		revision = patch.result.revision;
		patchLatencies.push(patch.elapsedMs);
		// Give reactive indexes/subscriptions a small scheduling window between
		// writes; this keeps the gate closer to a human editing burst than a tight
		// transactional loop.
		await delay(25);
	}

	const finalRead = await measure("finalRead", () =>
		args.client.query(api.documents.getForAgent, { documentId }),
	);
	const observedRevisions = await waitForReactiveRevision({
		url: args.url,
		authToken: args.authToken,
		documentId,
		revision: finalRead.result.revision,
		timeoutMs: args.timeoutMs,
	});

	return {
		sizeKiB: args.sizeKiB,
		patchCount: args.patchCount,
		documentId,
		path,
		initialBytes: byteLength(markdown),
		finalBytes: byteLength(finalRead.result.markdown),
		importMs: imported.elapsedMs,
		initialReadMs: initialRead.elapsedMs,
		finalReadMs: finalRead.elapsedMs,
		patchLatencyMs: {
			min: Math.min(...patchLatencies),
			p50: percentile(patchLatencies, 50),
			p95: percentile(patchLatencies, 95),
			max: Math.max(...patchLatencies),
		},
		initialRevision: initialRead.result.revision,
		finalRevision: finalRead.result.revision,
		observedRevisions,
	};
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		printHelp();
		return;
	}

	const url = requireInput(args.url, "CONVEX_URL");
	const client = createHttpClient(url, args.authToken);
	const workspaceId = await resolveWorkspaceId(client, args);
	const stamp = new Date()
		.toISOString()
		.replace(/[-:T.Z]/g, "")
		.slice(0, 14);
	const cases = [];

	for (let index = 0; index < args.sizes.length; index += 1) {
		const caseArgs = {
			url,
			authToken: args.authToken,
			client,
			workspaceId,
			stamp,
			sizeKiB: args.sizes[index],
			patchCount: args.patches[index],
			actor: args.actor,
			timeoutMs: args.timeoutMs,
		};
		try {
			cases.push(await runCase(caseArgs));
		} catch (error) {
			cases.push({
				sizeKiB: caseArgs.sizeKiB,
				patchCount: caseArgs.patchCount,
				error: error instanceof Error ? error.message : String(error),
			});
			break;
		}
	}

	const ok = cases.every((testCase) => !("error" in testCase));
	const report = {
		ok,
		convexUrl: url,
		workspaceId,
		actor: args.actor,
		startedAt: stamp,
		cases,
	};

	if (args.json) {
		console.log(JSON.stringify(report, null, 2));
		if (!ok) process.exitCode = 1;
		return;
	}

	console.log(ok ? "RD5 doc-size gate passed" : "RD5 doc-size gate failed");
	console.log(JSON.stringify(report, null, 2));
	if (!ok) process.exitCode = 1;
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
