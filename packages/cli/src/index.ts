#!/usr/bin/env node
import { spawn } from "node:child_process";
import * as nodeFs from "node:fs/promises";
import net from "node:net";
import { homedir, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs as parseNodeArgs } from "node:util";
import {
	createConvexBackend,
	createConvexSubscriber,
} from "@hubble.md/convex-client";
import {
	type CloudSyncConfig,
	changedRange,
	exportLiveDocuments,
	importLiveDocuments,
	projectionFileName,
	readConfigOrDefault,
	reconcileProjectionFile,
	removeCloudSyncConfig,
	sync as runSync,
	SYNCED_FOLDER_INDEX_REL,
	type SyncResult,
	writeCloudSyncConfig,
	writeLiveDocumentProjections,
	writeSyncState,
} from "@hubble.md/sync";
import { createNodeFileSystem } from "@hubble.md/sync/node";
import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import chokidar from "chokidar";
import { ConvexHttpClient } from "convex/browser";
import {
	findInstalledHubbleApp,
	installDesktopDevRelease,
} from "./desktopInstall.js";

const fs = createNodeFileSystem();
const CREDENTIALS_DIR = join(homedir(), ".hubble");
const CREDENTIALS_PATH = join(CREDENTIALS_DIR, "credentials.json");
const DEVICE_AUTH_TIMEOUT_MS = 10 * 60 * 1000;
const DEVICE_AUTH_POLL_INTERVAL_MS = 2000;

function getConvexUrl(): string {
	return process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
}

type CliArgs = {
	command?: string;
	help: boolean;
	workspaceName?: string;
	workspaceId?: string;
	authToken?: string;
	baseRevision?: string;
	appendMarkdown?: string;
	replaceMarkdown?: string;
	afterHeading?: string;
	patchMarkdown?: string;
	file?: string;
	format?: string;
	json: boolean;
	out?: string;
	parentId?: string;
	title?: string;
	folderId?: string;
	folderName?: string;
	documentPath?: string;
	mountPath?: string;
	repoDir?: string;
	watch: boolean;
	assumeYes: boolean;
	actor?: string;
	deploymentUrl?: string;
	authFromCredentials: boolean;
	extraArgs: string[];
	workspacePath: string;
};

type Credentials = {
	deploymentUrl: string;
	refreshToken: string;
};

async function main() {
	const parsed = parseCliArgs(process.argv.slice(2));
	if ("error" in parsed) {
		console.error(parsed.error);
		printUsage();
		process.exitCode = 1;
		return;
	}

	if (parsed.help) {
		printHelp(parsed);
		return;
	}

	if (parsed.command === "login") {
		await runLogin(parsed);
		return;
	}

	if (parsed.command === "logout") {
		await runLogout();
		return;
	}

	if (parsed.command === "mount") {
		await runMount(parsed);
		return;
	}

	if (parsed.command === "ensure-desktop") {
		await runEnsureDesktop(parsed);
		return;
	}

	if (parsed.command === "status") {
		await runStatus(parsed);
		return;
	}

	await resolveStoredAuth(parsed);

	if (parsed.command === "cloud") {
		await runWithAuthRetry(parsed, () => runCloudCommand(parsed));
		return;
	}

	printUsage();
	process.exitCode = 1;
}

async function runCloudCommand(parsed: CliArgs) {
	const [action, ...extraArgs] = parsed.extraArgs;
	const { workspacePath } = parsed;

	if (extraArgs.length > 0 && action !== "document" && action !== "folder") {
		printUsage();
		process.exitCode = 1;
		return;
	}

	switch (action) {
		case "create":
			await runCreate(workspacePath, parsed);
			return;
		case "connect":
			await runConnect(workspacePath, parsed);
			return;
		case "disconnect":
			await removeCloudSyncConfig(fs, workspacePath);
			console.log("Cloud Sync disconnected");
			return;
		case "sync":
			await runManualSync(workspacePath, parsed);
			return;
		case "import":
			await runImport(workspacePath, parsed);
			return;
		case "export":
			await runExport(workspacePath, parsed);
			return;
		case "project":
			await runProject(workspacePath, parsed);
			return;
		case "document":
			await runDocumentCommand(workspacePath, parsed);
			return;
		case "folder":
			await runFolderCommand(workspacePath, parsed);
			return;
		case "watch":
			await runWatch(workspacePath, parsed);
			return;
	}

	printUsage();
	process.exitCode = 1;
}

async function runLogin(parsed: CliArgs) {
	if (parsed.extraArgs.length > 0) {
		printLoginHelp();
		process.exitCode = 1;
		return;
	}

	const deploymentUrl = await resolveLoginDeploymentUrl(parsed);
	const client = createConvexHttpClient(deploymentUrl);
	const requested = await client.mutation(api.deviceAuth.request, {
		hostname: hostname(),
	});

	console.log("Hubble device login");
	console.log("");
	console.log(`Code: ${requested.code}`);
	console.log(`Approve: ${requested.approveUrl}`);
	console.log("");
	console.log("Verify this code matches in the browser before approving.");
	await openBrowserBestEffort(requested.approveUrl);

	const startedAt = Date.now();
	while (Date.now() - startedAt < DEVICE_AUTH_TIMEOUT_MS) {
		await delay(DEVICE_AUTH_POLL_INTERVAL_MS);
		const result = await client.mutation(api.deviceAuth.poll, {
			code: requested.code,
		});
		switch (result.status) {
			case "pending":
				break;
			case "approved":
				if (!result.refreshToken) {
					throw new Error(
						"Approved device login did not return a refresh token.",
					);
				}
				await writeCredentials({
					deploymentUrl,
					refreshToken: result.refreshToken,
				});
				console.log(`Logged in to ${deploymentUrl}`);
				return;
			case "denied":
				throw new Error("Device login was denied.");
			case "expired":
				throw new Error("Device login expired. Run `hubble login` again.");
		}
	}

	throw new Error("Device login timed out. Run `hubble login` again.");
}

async function runLogout() {
	await nodeFs.rm(CREDENTIALS_PATH, { force: true });
	console.log("Logged out of Hubble CLI");
}

type CliServerStatus = {
	appVersion: string;
	auth: {
		deploymentUrl: string;
		email?: string;
		name?: string;
	} | null;
	mounts: Array<{
		folderId: string;
		folderName: string;
		workspaceId: string;
		mountPath: string;
		repoDir: string;
		status: string;
		lastReconcileAt: number | null;
		documentCount?: number;
	}>;
	projections?: Array<{
		scope: {
			scopeKey: string;
			kind: "all-accessible" | "workspace" | "folder";
			workspaceId: string | null;
			folderId: string | null;
			localRoot: string | null;
		};
		status: {
			state: string;
			connected: boolean;
			documentCount: number;
			pendingOperationCount: number;
			verificationReason: "offline" | "access" | null;
			lastReconcileAt: number | null;
			lastEventAt: number | null;
			lastError: string | null;
			telemetry: { queuedEventCount: number };
		};
		operations: {
			total: number;
			pendingReview: number;
			recovery: number;
			undoAvailable: number;
			byKind: Record<string, number>;
		};
	}>;
};

type CliSocketResponse<T> =
	| { id: string; ok: true; result: T }
	| { id: string; ok: false; error: string };

async function runMount(parsed: CliArgs) {
	if (parsed.extraArgs.length > 0) {
		printMountHelp();
		process.exitCode = 1;
		return;
	}
	if (!parsed.workspaceId) {
		console.error("Missing required --workspace id.");
		process.exitCode = 1;
		return;
	}
	if (!parsed.folderId) {
		console.error("Missing required --folder id.");
		process.exitCode = 1;
		return;
	}
	if (!parsed.folderName) {
		console.error("Missing required --folder-name name.");
		process.exitCode = 1;
		return;
	}
	if (!parsed.repoDir) {
		console.error("Missing required --repo dir.");
		process.exitCode = 1;
		return;
	}

	const auth = await resolveDesktopAuth(parsed);
	const socketPath = getCliSocketPath();
	await ensureDesktopReady(parsed, auth, socketPath);

	const repoDir = resolve(parsed.workspacePath, parsed.repoDir);
	const mountPath = parsed.mountPath
		? resolve(parsed.workspacePath, parsed.mountPath)
		: undefined;
	const result = await sendCliCommand<{
		mountPath: string;
		documentCount?: number;
	}>(socketPath, "link-repo", {
		workspaceId: parsed.workspaceId,
		folderId: parsed.folderId,
		folderName: parsed.folderName,
		repoDir,
		mountPath,
		deploymentUrl: auth.deploymentUrl,
		authToken: auth.authToken,
	});

	const verified = await sendCliCommand<CliServerStatus>(socketPath, "status");
	const mount = verified.mounts.find(
		(entry) => entry.folderId === parsed.folderId,
	);
	if (!mount) {
		throw new Error(
			`Desktop app linked the folder but did not report mount ${parsed.folderId} in status.`,
		);
	}
	if (mount.status !== "connected" && mount.status !== "syncing") {
		throw new Error(
			`Desktop app reported mount ${parsed.folderId} as ${mount.status}, not connected.`,
		);
	}
	const indexPath = join(
		mount.mountPath,
		...SYNCED_FOLDER_INDEX_REL.split("/"),
	);
	try {
		const indexStat = await nodeFs.stat(indexPath);
		if (!indexStat.isFile()) throw new Error(`${indexPath} is not a file`);
	} catch (error) {
		throw new Error(
			`Live mount was not proven: sync index is missing at ${indexPath}. Check that the desktop app is signed in and can sync this folder. (${errorMessage(error)})`,
		);
	}

	console.log("Live mount connected");
	console.log(`  mount: ${mount.mountPath}`);
	console.log(`  repo: ${mount.repoDir}`);
	console.log(`  status: ${mount.status}`);
	const documentCount = result.documentCount ?? mount.documentCount;
	if (documentCount !== undefined) {
		console.log(
			`  documents: ${documentCount} document${documentCount === 1 ? "" : "s"}`,
		);
	}
}

async function runEnsureDesktop(parsed: CliArgs) {
	if (parsed.extraArgs.length > 0) {
		printEnsureDesktopHelp();
		process.exitCode = 1;
		return;
	}
	const auth = await resolveDesktopAuth(parsed);
	const status = await ensureDesktopReady(parsed, auth, getCliSocketPath());
	console.log("Hubble desktop is ready");
	console.log(`  version: ${status.appVersion}`);
	if (status.auth?.email) console.log(`  account: ${status.auth.email}`);
}

async function runStatus(parsed: CliArgs) {
	if (parsed.extraArgs.length > 0) {
		printStatusHelp();
		process.exitCode = 1;
		return;
	}
	const status = await readAppStatus(getCliSocketPath());
	if (parsed.json) {
		console.log(JSON.stringify(status, null, 2));
		return;
	}
	console.log(`Hubble desktop ${status.appVersion}`);
	const projections = status.projections ?? [];
	if (projections.length === 0) {
		console.log("No projection roots reported.");
		return;
	}
	for (const projection of projections) {
		console.log("");
		console.log(projection.scope.localRoot ?? "Unconfigured projection");
		console.log(`  health: ${projection.status.state}`);
		console.log(`  documents: ${projection.status.documentCount}`);
		console.log(
			`  queued edits: ${projection.status.telemetry.queuedEventCount}`,
		);
		console.log(`  pending review: ${projection.operations.pendingReview}`);
		console.log(`  recovery: ${projection.operations.recovery}`);
	}
}

async function ensureDesktopReady(
	parsed: CliArgs,
	auth: { deploymentUrl: string; authToken: string },
	socketPath: string,
): Promise<CliServerStatus> {
	let status = await readAppStatus(socketPath).catch(() => null);
	if (!status) {
		let appPath = await findInstalledHubbleApp();
		if (!appPath) {
			const approved =
				parsed.assumeYes ||
				(await confirmDesktopInstall(
					"Hubble desktop is required for live mounts. Download and install the verified dev build?",
				));
			if (!approved) throw new Error("Desktop installation was declined.");
			console.log("Downloading and verifying Hubble desktop…");
			const installed = await installDesktopDevRelease();
			appPath = installed.appPath;
			console.log(
				`Installed Hubble ${installed.version} (${installed.commit.slice(0, 12)})`,
			);
		}
		await launchHubbleApp(appPath);
		status = await waitForAppStatus(socketPath, 60_000);
	}

	if (!status.auth) {
		const client = createConvexHttpClient(auth.deploymentUrl, auth.authToken);
		const handoff = await client.mutation(
			api.deviceAuth.createDesktopHandoff,
			{},
		);
		await sendCliCommand(socketPath, "login-with-handoff", {
			deploymentUrl: auth.deploymentUrl,
			code: handoff.code,
		});
		status = await waitForDesktopSignIn(socketPath, 30_000);
	}

	await assertMountAccountMatches(status, auth);
	return status;
}

async function confirmDesktopInstall(message: string): Promise<boolean> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		throw new Error(
			"Desktop installation needs confirmation. Re-run with --yes after approving the install.",
		);
	}
	const readline = createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	try {
		const answer = await readline.question(`${message} [y/N] `);
		return answer.trim().toLowerCase() === "y";
	} finally {
		readline.close();
	}
}

async function runManualSync(workspacePath: string, parsed: CliArgs) {
	const cloudSync = await readCloudSyncConfig(workspacePath);
	if (!cloudSync) return;

	await syncOnce(workspacePath, cloudSync, "manual", parsed.authToken);
}

async function runImport(workspacePath: string, parsed: CliArgs) {
	const cloudSync = await readCloudSyncConfig(workspacePath);
	if (!cloudSync) return;

	const backend = createConvexBackend(
		cloudSync.deploymentUrl,
		parsed.authToken,
	);
	const result = await importLiveDocuments(backend, fs, {
		workspaceId: cloudSync.workspaceId,
		workspacePath,
		idempotencyKey: `cli:${cloudSync.deviceId}:${workspacePath}`,
		actor: `device:${cloudSync.deviceId}`,
	});
	console.log(
		`live import: ${result.imported.length} file${result.imported.length === 1 ? "" : "s"} ` +
			`(${result.created.length} created, ${result.reused.length} already imported)`,
	);
}

async function runExport(workspacePath: string, parsed: CliArgs) {
	const cloudSync = await readCloudSyncConfig(workspacePath);
	if (!cloudSync) return;

	const backend = createConvexBackend(
		cloudSync.deploymentUrl,
		parsed.authToken,
	);
	const result = await exportLiveDocuments(backend, fs, {
		workspaceId: cloudSync.workspaceId,
		workspacePath,
	});
	console.log(
		`live export: ${result.exported.length} file${result.exported.length === 1 ? "" : "s"}` +
			(result.skipped.length > 0
				? ` (${result.skipped.length} without paths skipped)`
				: ""),
	);
}

async function runProject(workspacePath: string, parsed: CliArgs) {
	const cloudSync = await readCloudSyncConfig(workspacePath);
	if (!cloudSync) return;

	const backend = createConvexBackend(
		cloudSync.deploymentUrl,
		parsed.authToken,
	);
	const result = await writeLiveDocumentProjections(backend, fs, {
		workspaceId: cloudSync.workspaceId,
		workspacePath,
	});
	console.log(
		`live projection: ${result.written.length} file${result.written.length === 1 ? "" : "s"} written to ${result.root}` +
			`, base cache in ${result.baseCacheRoot}` +
			(result.skipped.length > 0 ? ` (${result.skipped.length} skipped)` : ""),
	);
}

async function runDocumentCommand(workspacePath: string, parsed: CliArgs) {
	const [, subcommand] = parsed.extraArgs;
	if (parsed.extraArgs.length !== 2) {
		printDocumentHelp();
		process.exitCode = 1;
		return;
	}
	const cloudSync = await readCloudSyncConfig(workspacePath);
	if (!cloudSync) return;

	switch (subcommand) {
		case "get":
			await runDocumentGet(cloudSync.deploymentUrl, parsed);
			return;
		case "patch":
			await runDocumentPatch(cloudSync.deploymentUrl, parsed);
			return;
		case "create":
			await runDocumentCreate(workspacePath, cloudSync, parsed);
			return;
		case "shim":
			await runDocumentShim(workspacePath, cloudSync.deploymentUrl, parsed);
			return;
		case "reconcile":
			await runDocumentReconcile(
				workspacePath,
				cloudSync.deploymentUrl,
				parsed,
			);
			return;
		case "export":
			await runDocumentExport(workspacePath, cloudSync.deploymentUrl, parsed);
			return;
		default:
			printDocumentHelp();
			process.exitCode = 1;
	}
}

async function runDocumentGet(deploymentUrl: string, parsed: CliArgs) {
	if (!parsed.workspaceId) {
		console.error("Missing required --id documentId.");
		process.exitCode = 1;
		return;
	}
	const client = createConvexHttpClient(deploymentUrl, parsed.authToken);
	const document = await client.query(api.documents.getForAgent, {
		documentId: parsed.workspaceId as Id<"documents">,
	});
	console.log(JSON.stringify(document, null, 2));
}

async function runDocumentPatch(deploymentUrl: string, parsed: CliArgs) {
	if (!parsed.workspaceId) {
		console.error("Missing required --id documentId.");
		process.exitCode = 1;
		return;
	}
	if (!parsed.baseRevision) {
		console.error("Missing required --base-revision revision.");
		process.exitCode = 1;
		return;
	}
	const baseRevision = Number.parseInt(parsed.baseRevision, 10);
	if (!Number.isFinite(baseRevision)) {
		console.error(`Invalid --base-revision: ${parsed.baseRevision}`);
		process.exitCode = 1;
		return;
	}
	const intent = documentPatchIntent(parsed);
	if (!intent) {
		console.error(
			"Provide one of --replace markdown, --append markdown, or --after-heading heading --markdown markdown.",
		);
		process.exitCode = 1;
		return;
	}

	const client = createConvexHttpClient(deploymentUrl, parsed.authToken);
	const result = await client.mutation(api.documents.applyPatch, {
		documentId: parsed.workspaceId as Id<"documents">,
		baseRevision,
		intent,
		actor: parsed.actor,
	});
	console.log(JSON.stringify(result, null, 2));
}

function documentPatchIntent(parsed: CliArgs) {
	if (parsed.replaceMarkdown !== undefined) {
		return {
			kind: "replace-document" as const,
			markdown: parsed.replaceMarkdown,
		};
	}
	if (parsed.appendMarkdown !== undefined) {
		return {
			kind: "append-markdown" as const,
			markdown: parsed.appendMarkdown,
		};
	}
	if (parsed.afterHeading !== undefined && parsed.patchMarkdown !== undefined) {
		return {
			kind: "insert-after-heading" as const,
			heading: parsed.afterHeading,
			markdown: parsed.patchMarkdown,
		};
	}
	return null;
}

async function runDocumentCreate(
	workspacePath: string,
	cloudSync: CloudSyncConfig,
	parsed: CliArgs,
) {
	if (!parsed.title) {
		console.error("Missing required --title.");
		process.exitCode = 1;
		return;
	}
	if (!parsed.file) {
		console.error("Missing required --file path.md.");
		process.exitCode = 1;
		return;
	}
	const markdown = await fs.readFile(resolve(workspacePath, parsed.file));
	const backend = createConvexBackend(
		cloudSync.deploymentUrl,
		parsed.authToken,
	);
	const documentId = await backend.createDocument({
		workspaceId: cloudSync.workspaceId,
		folderId: parsed.folderId,
		title: parsed.title,
		path: parsed.documentPath,
		markdown,
		actor: parsed.actor,
	});
	console.log(documentId);
	console.log(`created document ${documentId}`);
}

async function runDocumentExport(
	workspacePath: string,
	deploymentUrl: string,
	parsed: CliArgs,
) {
	if (!parsed.workspaceId) {
		console.error("Missing required --id documentId.");
		process.exitCode = 1;
		return;
	}
	const format = parsed.format ?? "md";
	if (format !== "md") {
		console.error(`Unsupported document export format: ${format}`);
		process.exitCode = 1;
		return;
	}
	const client = createConvexHttpClient(deploymentUrl, parsed.authToken);
	const document = await client.query(api.documents.getForAgent, {
		documentId: parsed.workspaceId as Id<"documents">,
	});
	if (!document) {
		console.error(`Document not found: ${parsed.workspaceId}`);
		process.exitCode = 1;
		return;
	}
	const outPath = resolve(
		workspacePath,
		parsed.out ?? document.path ?? `${document.documentId}.md`,
	);
	await fs.ensureDir(dirname(outPath));
	await fs.writeFile(outPath, document.markdown);
	console.log(`exported ${document.title} to ${outPath}`);
}

async function runDocumentShim(
	workspacePath: string,
	deploymentUrl: string,
	parsed: CliArgs,
) {
	if (!parsed.workspaceId) {
		console.error("Missing required --id documentId.");
		process.exitCode = 1;
		return;
	}
	if (!parsed.file) {
		console.error("Missing required --file staging.md.");
		process.exitCode = 1;
		return;
	}
	const stagingPath = resolve(workspacePath, parsed.file);
	const applyStagingFile = async () => {
		const markdown = await fs.readFile(stagingPath);
		const client = createConvexHttpClient(deploymentUrl, parsed.authToken);
		const document = await client.query(api.documents.getForAgent, {
			documentId: parsed.workspaceId as Id<"documents">,
		});
		if (!document) throw new Error(`Document not found: ${parsed.workspaceId}`);
		if (!document.canWrite) {
			throw new Error(
				`Document ${parsed.workspaceId} is read-only for this user; refusing to apply staging-file edits.`,
			);
		}
		const range = changedRange(document.markdown, markdown);
		if (!range) {
			console.log(`shim skipped ${stagingPath}: no changes`);
			return;
		}
		await client.mutation(api.documents.applyPatch, {
			documentId: parsed.workspaceId as Id<"documents">,
			baseRevision: document.revision,
			intent: {
				kind: "replace-range",
				baseMarkdown: document.markdown,
				from: range.from,
				to: range.to,
				markdown: range.markdown,
			},
			actor: parsed.actor ?? "file-shim",
		});
		console.log(
			`shim reconciled ${range.to - range.from} base chars -> ${range.markdown.length} new chars for ${parsed.workspaceId} at revision ${document.revision}`,
		);
	};

	await applyStagingFile();
	if (!parsed.watch) return;

	console.log(`Watching staging file: ${stagingPath}`);
	let timer: ReturnType<typeof setTimeout> | null = null;
	const watcher = chokidar.watch(stagingPath, { ignoreInitial: true });
	watcher.on("change", () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			void applyStagingFile().catch((err) => {
				console.error("shim apply failed:", err);
			});
		}, 250);
	});
	const shutdown = async (signal: string) => {
		console.log(`Stopping Hubble document shim (${signal})`);
		if (timer) clearTimeout(timer);
		await watcher.close();
		process.exit(0);
	};
	process.on("SIGINT", () => {
		void shutdown("SIGINT");
	});
	process.on("SIGTERM", () => {
		void shutdown("SIGTERM");
	});
}

async function runDocumentReconcile(
	workspacePath: string,
	deploymentUrl: string,
	parsed: CliArgs,
) {
	if (!parsed.workspaceId) {
		console.error("Missing required --id documentId.");
		process.exitCode = 1;
		return;
	}
	if (!parsed.file) {
		console.error("Missing required --file projection.md.");
		process.exitCode = 1;
		return;
	}
	const documentId = parsed.workspaceId;
	const projectionPath = resolve(workspacePath, parsed.file);
	const backend = createConvexBackend(deploymentUrl, parsed.authToken);
	const applyProjectionFile = async () => {
		const outcome = await reconcileProjectionFile(backend, fs, {
			documentId,
			projectionPath,
			workspacePath,
			actor: parsed.actor,
			path: parsed.file,
		});
		switch (outcome.status) {
			case "backstop":
				if (outcome.reason === "missing-base") {
					throw new Error(
						`Missing reconcile base cache for ${documentId}. Run \`hubble cloud project\` before reconciling projection edits.`,
					);
				}
				throw new Error(
					`Document ${documentId} is read-only for this user; refusing to reconcile projection edits.`,
				);
			case "no-op":
				console.log(`reconcile skipped ${projectionPath}: no changes`);
				return;
			case "reconciled":
				console.log(
					`reconciled ${outcome.baseChars} base chars -> ${outcome.newChars} new chars at revision ${outcome.revision}`,
				);
				return;
		}
	};

	await applyProjectionFile();
	if (!parsed.watch) return;

	console.log(`Watching Live Document projection: ${projectionPath}`);
	let timer: ReturnType<typeof setTimeout> | null = null;
	const watcher = chokidar.watch(projectionPath, { ignoreInitial: true });
	watcher.on("change", () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			void applyProjectionFile().catch((err) => {
				console.error("reconcile failed:", err);
			});
		}, 250);
	});
	const shutdown = async (signal: string) => {
		console.log(`Stopping Hubble document reconcile (${signal})`);
		if (timer) clearTimeout(timer);
		await watcher.close();
		process.exit(0);
	};
	process.on("SIGINT", () => {
		void shutdown("SIGINT");
	});
	process.on("SIGTERM", () => {
		void shutdown("SIGTERM");
	});
}

async function runFolderCommand(workspacePath: string, parsed: CliArgs) {
	const [, subcommand] = parsed.extraArgs;
	if (parsed.extraArgs.length !== 2) {
		printFolderHelp();
		process.exitCode = 1;
		return;
	}
	const cloudSync = await readCloudSyncConfig(workspacePath);
	if (!cloudSync) return;

	switch (subcommand) {
		case "create":
			await runFolderCreate(cloudSync, parsed);
			return;
		case "list":
			await runFolderList(cloudSync, parsed);
			return;
		case "export":
			await runFolderExport(workspacePath, cloudSync, parsed);
			return;
		default:
			printFolderHelp();
			process.exitCode = 1;
	}
}

async function runFolderCreate(cloudSync: CloudSyncConfig, parsed: CliArgs) {
	if (!parsed.workspaceName) {
		console.error("Missing required --name.");
		process.exitCode = 1;
		return;
	}
	const backend = createConvexBackend(
		cloudSync.deploymentUrl,
		parsed.authToken,
	);
	const folderId = await backend.createFolder({
		workspaceId: cloudSync.workspaceId,
		parentId: parsed.parentId,
		name: parsed.workspaceName,
		actor: parsed.actor,
	});
	console.log(folderId);
	console.log(`created folder ${folderId}`);
}

async function runFolderList(cloudSync: CloudSyncConfig, parsed: CliArgs) {
	const backend = createConvexBackend(
		cloudSync.deploymentUrl,
		parsed.authToken,
	);
	const folders = await backend.getFolders(cloudSync.workspaceId);
	for (const folder of folders) {
		console.log(`${folder._id}\t${folder.name}\t${folder.parentId ?? "-"}`);
	}
}

async function runFolderExport(
	workspacePath: string,
	cloudSync: CloudSyncConfig,
	parsed: CliArgs,
) {
	if (!parsed.folderId) {
		console.error("Missing required --folder folderId.");
		process.exitCode = 1;
		return;
	}
	if (!parsed.out) {
		console.error("Missing required --out dir.");
		process.exitCode = 1;
		return;
	}
	const outDir = resolve(workspacePath, parsed.out);
	const backend = createConvexBackend(
		cloudSync.deploymentUrl,
		parsed.authToken,
	);
	const documents = await backend.getFolderSubtreeDocuments(parsed.folderId);
	const usedByDir = new Map<string, Set<string>>();
	await fs.ensureDir(outDir);

	for (const document of documents) {
		const dirRel = sanitizeRelPath(document.relativePath);
		const used = usedByDir.get(dirRel) ?? new Set<string>();
		usedByDir.set(dirRel, used);
		const fileName = uniqueName(
			used,
			projectionFileName(document.path, document.title),
		);
		const relPath = dirRel ? `${dirRel}/${fileName}` : fileName;
		const slash = relPath.lastIndexOf("/");
		if (slash > 0) await fs.ensureDir(`${outDir}/${relPath.slice(0, slash)}`);
		await fs.writeFile(`${outDir}/${relPath}`, document.markdown);
	}
	await fs.writeFile(
		`${outDir}/.hubble-export.json`,
		`${JSON.stringify(
			{
				static: true,
				exportedAt: new Date().toISOString(),
				folderId: parsed.folderId,
			},
			null,
			2,
		)}\n`,
	);

	console.log(
		`exported ${documents.length} document${documents.length === 1 ? "" : "s"} to ${outDir}`,
	);
}

async function runWatch(workspacePath: string, parsed: CliArgs) {
	const cloudSync = await readCloudSyncConfig(workspacePath);
	if (!cloudSync) return;

	await syncContinuously(workspacePath, cloudSync, parsed.authToken);
}

async function runCreate(workspacePath: string, opts: CliArgs) {
	if (opts.workspaceId) {
		console.error("Use --name with create, not --id.");
		process.exitCode = 1;
		return;
	}
	if (!opts.workspaceName) {
		console.error("Missing required --name.");
		process.exitCode = 1;
		return;
	}

	const deploymentUrl = getDeploymentUrl(opts);
	const backend = createConvexBackend(deploymentUrl, opts.authToken);
	const workspaceId = await backend.createWorkspace(opts.workspaceName);
	await writeCloudConnection(workspacePath, {
		deploymentUrl,
		workspaceId,
		label: opts.workspaceName,
	});
}

async function runConnect(workspacePath: string, opts: CliArgs) {
	if (opts.workspaceName && opts.workspaceId) {
		console.error("Use only one of --name or --id.");
		process.exitCode = 1;
		return;
	}
	if (!opts.workspaceName && !opts.workspaceId) {
		console.error("Missing required --name or --id.");
		process.exitCode = 1;
		return;
	}

	const deploymentUrl = getDeploymentUrl(opts);
	const backend = createConvexBackend(deploymentUrl, opts.authToken);
	const workspaceId =
		opts.workspaceId ?? (await backend.getWorkspace(opts.workspaceName ?? ""));

	if (!workspaceId) {
		console.error(`Remote workspace not found: ${opts.workspaceName}`);
		process.exitCode = 1;
		return;
	}

	await writeCloudConnection(workspacePath, {
		deploymentUrl,
		workspaceId,
		label: opts.workspaceName ?? workspaceId,
	});
}

async function writeCloudConnection(
	workspacePath: string,
	opts: {
		deploymentUrl: string;
		workspaceId: string;
		label: string;
	},
) {
	const current = await readConfigOrDefault(fs, workspacePath);
	const deviceId = current.cloudSync?.deviceId ?? crypto.randomUUID();
	const config = await writeCloudSyncConfig(fs, workspacePath, {
		provider: "convex",
		deploymentUrl: opts.deploymentUrl,
		workspaceId: opts.workspaceId,
		deviceId,
		backgroundSync: current.cloudSync?.backgroundSync ?? false,
	});
	await ensureSyncState(workspacePath);
	console.log(`Cloud Sync connected: ${opts.label}`);
	console.log(`  workspace: ${config.cloudSync?.workspaceId}`);
	console.log(`  device: ${config.cloudSync?.deviceId}`);
}

function getDeploymentUrl(
	opts: Pick<CliArgs, "deploymentUrl">,
	credentials?: Credentials | null,
): string {
	return opts.deploymentUrl ?? credentials?.deploymentUrl ?? getConvexUrl();
}

function getAuthToken(flagValue?: string): string | undefined {
	return (
		flagValue ?? process.env.HUBBLE_AUTH_TOKEN ?? process.env.CONVEX_AUTH_TOKEN
	);
}

async function resolveLoginDeploymentUrl(parsed: CliArgs): Promise<string> {
	if (parsed.deploymentUrl) return parsed.deploymentUrl;
	const cloudSync = (await readConfigOrDefault(fs, parsed.workspacePath))
		.cloudSync;
	if (cloudSync?.deploymentUrl) return cloudSync.deploymentUrl;
	const credentials = await readCredentials();
	return getDeploymentUrl(parsed, credentials);
}

async function resolveStoredAuth(parsed: CliArgs) {
	if (parsed.authToken) return;

	const credentials = await readCredentials();
	if (!credentials) return;

	parsed.deploymentUrl ??= credentials.deploymentUrl;
	const tokens = await refreshCredentials(credentials);
	parsed.authToken = tokens.token;
	parsed.authFromCredentials = true;
}

async function resolveDesktopAuth(parsed: CliArgs): Promise<{
	deploymentUrl: string;
	authToken: string;
}> {
	if (parsed.authToken) {
		return {
			deploymentUrl: await resolveLoginDeploymentUrl(parsed),
			authToken: parsed.authToken,
		};
	}

	const credentials = await readCredentials();
	if (!credentials) {
		throw new Error(
			"This command requires a Hubble user login. Run `hubble login` first.",
		);
	}
	if (
		parsed.deploymentUrl &&
		parsed.deploymentUrl !== credentials.deploymentUrl
	) {
		throw new Error(
			`Saved login is for ${credentials.deploymentUrl}, not ${parsed.deploymentUrl}. Run \`hubble login --url ${parsed.deploymentUrl}\` first.`,
		);
	}
	const tokens = await refreshCredentials(credentials);
	return {
		deploymentUrl: credentials.deploymentUrl,
		authToken: tokens.token,
	};
}

function getCliSocketPath(): string {
	const userData = process.env.HUBBLE_APP_USERDATA;
	if (userData) return join(userData, "cli.sock");
	if (process.platform === "darwin") {
		return join(
			homedir(),
			"Library",
			"Application Support",
			"Hubble",
			"cli.sock",
		);
	}
	return join(homedir(), ".config", "Hubble", "cli.sock");
}

async function readAppStatus(socketPath: string): Promise<CliServerStatus> {
	return sendCliCommand<CliServerStatus>(socketPath, "status");
}

async function waitForAppStatus(
	socketPath: string,
	timeoutMs: number,
): Promise<CliServerStatus> {
	const startedAt = Date.now();
	let lastError: unknown = null;
	while (Date.now() - startedAt < timeoutMs) {
		try {
			return await readAppStatus(socketPath);
		} catch (error) {
			lastError = error;
			await delay(500);
		}
	}
	throw new Error(
		`Hubble did not open its CLI socket at ${socketPath} within ${Math.round(timeoutMs / 1000)}s. (${errorMessage(lastError)})`,
	);
}

async function waitForDesktopSignIn(
	socketPath: string,
	timeoutMs: number,
): Promise<CliServerStatus> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const status = await readAppStatus(socketPath);
		if (status.auth) return status;
		await delay(250);
	}
	throw new Error(
		"Hubble desktop opened but did not complete the one-time CLI sign-in.",
	);
}

async function launchHubbleApp(appPath?: string): Promise<void> {
	if (process.platform !== "darwin") {
		throw new Error("Hubble desktop is currently supported on macOS only.");
	}
	try {
		await spawnAndWait("open", appPath ? [appPath] : ["-a", "Hubble"]);
		return;
	} catch {
		try {
			await spawnAndWait("open", ["-b", "com.benholmes.hubblemd.desktop"]);
			return;
		} catch (error) {
			throw new Error(
				`Could not launch Hubble desktop. (${errorMessage(error)})`,
			);
		}
	}
}

function spawnAndWait(command: string, args: string[]): Promise<void> {
	return new Promise((resolveSpawn, rejectSpawn) => {
		const child = spawn(command, args, { stdio: "ignore" });
		child.on("error", rejectSpawn);
		child.on("exit", (code) => {
			if (code === 0) resolveSpawn();
			else rejectSpawn(new Error(`${command} exited ${code}`));
		});
	});
}

async function assertMountAccountMatches(
	status: CliServerStatus,
	auth: { deploymentUrl: string; authToken: string },
) {
	if (!status.auth) {
		console.warn(
			"Warning: Hubble desktop did not report a signed-in account; proceeding with CLI credentials.",
		);
		return;
	}
	if (status.auth.deploymentUrl !== auth.deploymentUrl) {
		throw new Error(
			`Hubble desktop is signed in to ${status.auth.deploymentUrl}, but CLI credentials target ${auth.deploymentUrl}. Sign into the same deployment before mounting.`,
		);
	}
	if (!status.auth.email) return;

	const client = createConvexHttpClient(auth.deploymentUrl, auth.authToken);
	const viewer = await client.query(api.viewer.me, {});
	const cliEmail = viewer?.email;
	if (!cliEmail) {
		throw new Error(
			"Hubble desktop reported a signed-in account, but the CLI token did not resolve a viewer email. Run `hubble login` again.",
		);
	}
	if (cliEmail.toLowerCase() !== status.auth.email.toLowerCase()) {
		throw new Error(
			`Hubble desktop is signed in as ${status.auth.email}, but CLI credentials are for ${cliEmail}. Run \`hubble login\` with the same account or sign into the desktop app as ${cliEmail}.`,
		);
	}
}

async function sendCliCommand<T>(
	socketPath: string,
	cmd: string,
	args?: object,
	// link-repo materializes the whole folder before responding, so it needs
	// far more headroom than a status ping.
	timeoutMs = cmd === "link-repo" ? 10 * 60 * 1000 : 5000,
): Promise<T> {
	const id = crypto.randomUUID();
	const response = await new Promise<CliSocketResponse<T>>(
		(resolveResponse, rejectResponse) => {
			const socket = net.createConnection(socketPath);
			let buffer = "";
			socket.setTimeout(timeoutMs);
			socket.on("connect", () => {
				socket.write(`${JSON.stringify({ id, cmd, args })}\n`);
			});
			socket.on("data", (chunk) => {
				buffer += chunk.toString("utf8");
				const newline = buffer.indexOf("\n");
				if (newline === -1) return;
				const line = buffer.slice(0, newline);
				socket.end();
				try {
					resolveResponse(JSON.parse(line) as CliSocketResponse<T>);
				} catch (error) {
					rejectResponse(error);
				}
			});
			socket.on("timeout", () => {
				socket.destroy(new Error(`Timed out waiting for ${cmd} response`));
			});
			socket.on("error", rejectResponse);
		},
	);
	if (response.id !== id) {
		throw new Error(`Mismatched CLI socket response id for ${cmd}`);
	}
	if (!response.ok) throw new Error(response.error);
	return response.result;
}

async function runWithAuthRetry(
	parsed: CliArgs,
	run: () => Promise<void>,
): Promise<void> {
	try {
		await run();
	} catch (err) {
		if (!parsed.authFromCredentials || !isAuthFailure(err)) throw err;
		const credentials = await readCredentials();
		if (!credentials) throw err;
		const tokens = await refreshCredentials(credentials);
		parsed.authToken = tokens.token;
		await run();
	}
}

async function refreshCredentials(credentials: Credentials) {
	try {
		const client = createConvexHttpClient(credentials.deploymentUrl);
		const result = await client.action(api.auth.signIn, {
			refreshToken: credentials.refreshToken,
		});
		if (!result.tokens) throw new Error("Refresh token was rejected");
		await writeCredentials({
			deploymentUrl: credentials.deploymentUrl,
			refreshToken: result.tokens.refreshToken,
		});
		return result.tokens;
	} catch (err) {
		throw new Error(
			`Saved Hubble login expired or was revoked. Run \`hubble login\` again. (${errorMessage(err)})`,
		);
	}
}

async function readCredentials(): Promise<Credentials | null> {
	try {
		const raw = await nodeFs.readFile(CREDENTIALS_PATH, "utf8");
		const parsed = JSON.parse(raw) as Partial<Credentials>;
		if (!parsed.deploymentUrl || !parsed.refreshToken) return null;
		return {
			deploymentUrl: parsed.deploymentUrl,
			refreshToken: parsed.refreshToken,
		};
	} catch (err) {
		if (isNodeError(err, "ENOENT")) return null;
		throw err;
	}
}

async function writeCredentials(credentials: Credentials) {
	await nodeFs.mkdir(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
	await nodeFs.chmod(CREDENTIALS_DIR, 0o700);
	await nodeFs.writeFile(
		CREDENTIALS_PATH,
		`${JSON.stringify(credentials, null, 2)}\n`,
		{ mode: 0o600 },
	);
	await nodeFs.chmod(CREDENTIALS_PATH, 0o600);
}

async function openBrowserBestEffort(url: string) {
	const command =
		process.platform === "darwin"
			? "open"
			: process.platform === "linux"
				? "xdg-open"
				: null;
	if (!command) return;
	try {
		const child = spawn(command, [url], {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
	} catch {
		// The printed approval URL is the reliable path; browser opening is best-effort.
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function isAuthFailure(err: unknown): boolean {
	const message = errorMessage(err).toLowerCase();
	return (
		message.includes("unauthenticated") ||
		message.includes("not authenticated") ||
		message.includes("unauthorized") ||
		message.includes("401") ||
		message.includes("auth")
	);
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function isNodeError(err: unknown, code: string): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		(err as { code?: string }).code === code
	);
}

function createConvexHttpClient(url: string, authToken?: string) {
	const client = new ConvexHttpClient(url);
	if (authToken) client.setAuth(authToken);
	return client;
}

async function syncOnce(
	workspacePath: string,
	cloudSync: CloudSyncConfig,
	reason: string,
	authToken?: string,
) {
	const backend = createConvexBackend(cloudSync.deploymentUrl, authToken);
	const result = await runSync(backend, fs, workspacePath);
	logResult(reason, result);
	return result;
}

async function syncContinuously(
	workspacePath: string,
	cloudSync: CloudSyncConfig,
	authToken?: string,
) {
	const convexUrl = cloudSync.deploymentUrl;
	console.log(`Hubble Sync watching ${workspacePath}`);
	console.log(`Workspace: ${cloudSync.workspaceId}`);

	const scheduler = createSyncScheduler(workspacePath, cloudSync, authToken);
	await scheduler.enqueue("startup");

	const subscriber = createConvexSubscriber(convexUrl, authToken);
	const unsubscribe = subscriber.onFilesChanged(
		cloudSync.workspaceId,
		() => {
			void scheduler.enqueue("remote");
		},
		(err) => {
			console.error("Remote subscription failed:", err);
		},
	);

	let fsEventCount = 0;
	let fsTimer: ReturnType<typeof setTimeout> | null = null;
	const watcher = chokidar.watch(workspacePath, {
		ignoreInitial: true,
		ignored: (path) =>
			path.includes("/.hubble/") ||
			path.endsWith("/.hubble") ||
			path.includes("\\.hubble\\"),
	});

	const handleFsEvent = (event: string, path: string) => {
		fsEventCount += 1;
		console.log(`fs ${event}: ${path}`);
		if (fsTimer) clearTimeout(fsTimer);
		fsTimer = setTimeout(() => {
			const count = fsEventCount;
			fsEventCount = 0;
			void scheduler.enqueue(
				`filesystem (${count} event${count === 1 ? "" : "s"})`,
			);
		}, 250);
	};

	watcher
		.on("add", (path) => handleFsEvent("add", path))
		.on("change", (path) => handleFsEvent("change", path))
		.on("unlink", (path) => handleFsEvent("unlink", path))
		.on("addDir", (path) => handleFsEvent("addDir", path))
		.on("unlinkDir", (path) => handleFsEvent("unlinkDir", path))
		.on("error", (err) => {
			console.error("Workspace watcher failed:", err);
		});

	const shutdown = async (signal: string) => {
		console.log(`Stopping Hubble Sync (${signal})`);
		if (fsTimer) clearTimeout(fsTimer);
		unsubscribe();
		await subscriber.close();
		await watcher.close();
		process.exit(0);
	};

	process.on("SIGINT", () => {
		void shutdown("SIGINT");
	});
	process.on("SIGTERM", () => {
		void shutdown("SIGTERM");
	});
}

function createSyncScheduler(
	workspacePath: string,
	cloudSync: CloudSyncConfig,
	authToken?: string,
) {
	let running = false;
	let pending = false;
	let pendingReason = "queued";

	const run = async (reason: string) => {
		if (running) {
			pending = true;
			pendingReason = reason;
			return;
		}

		running = true;
		let currentReason = reason;
		try {
			while (true) {
				await syncOnce(workspacePath, cloudSync, currentReason, authToken);
				if (!pending) break;
				pending = false;
				currentReason = pendingReason;
			}
		} catch (error) {
			console.error("Cloud Sync failed:", error);
		} finally {
			running = false;
		}
	};

	return {
		enqueue: run,
	};
}

async function readCloudSyncConfig(
	workspacePath: string,
): Promise<CloudSyncConfig | null> {
	const config = await readConfigOrDefault(fs, workspacePath);
	if (config.cloudSync) return config.cloudSync;
	console.error(
		`No Cloud Sync config in ${workspacePath}. Run \`hubble cloud connect\` first.`,
	);
	process.exitCode = 1;
	return null;
}

async function ensureSyncState(workspacePath: string) {
	const state = await fs.readFileOrNull(`${workspacePath}/.hubble/state.json`);
	if (!state) {
		await writeSyncState(fs, workspacePath, { lastSyncedAt: 0, files: {} });
	}
}

function logResult(reason: string, result: SyncResult) {
	const files = `files(+${result.pushed.length} -${result.deleted.length} ↓${result.pulled.length})`;
	const assets = `assets(+${result.assetsPushed} -${result.assetsDeleted} ↓${result.assetsPulled} failed:${result.assetsFailed.length})`;
	console.log(`sync ${reason}: ${files} ${assets}`);
	if (result.conflicts.length > 0) {
		console.log(`  conflicts: ${result.conflicts.join(", ")}`);
	}
	if (result.assetsFailed.length > 0) {
		console.log(`  asset failures: ${result.assetsFailed.join(", ")}`);
	}
}

/**
 * Sanitize each segment of a `/`-joined relative path. Empty, `.` and `..`
 * segments are dropped so cloud-controlled paths can never escape the root.
 */
function sanitizeRelPath(relativePath: string): string {
	return relativePath
		.split("\\")
		.join("/")
		.split("/")
		.filter(
			(segment) => segment.length > 0 && segment !== "." && segment !== "..",
		)
		.map((segment) => sanitizeSegment(segment))
		.join("/");
}

function sanitizeSegment(name: string): string {
	const cleaned = name
		.replace(/[/\\:*?"<>|]/g, " ")
		// biome-ignore lint/suspicious/noControlCharactersInRegex: strip control chars
		.replace(/[\u0000-\u001f]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^[. ]+|[. ]+$/g, "");
	return cleaned || "Untitled";
}

function uniqueName(used: Set<string>, name: string): string {
	if (!used.has(name)) {
		used.add(name);
		return name;
	}
	const dot = name.lastIndexOf(".");
	const stem = dot === -1 ? name : name.slice(0, dot);
	const ext = dot === -1 ? "" : name.slice(dot);
	let n = 2;
	let candidate = `${stem} (${n})${ext}`;
	while (used.has(candidate)) {
		n += 1;
		candidate = `${stem} (${n})${ext}`;
	}
	used.add(candidate);
	return candidate;
}

function parseCliArgs(argv: string[]) {
	try {
		const args = argv[0] === "--" ? argv.slice(1) : argv;
		const help = args.includes("--help") || args.includes("-h");
		const parseableArgs = help
			? args.filter((arg) => arg !== "--help" && arg !== "-h")
			: args;
		const { values, positionals } = parseNodeArgs({
			args: parseableArgs,
			allowPositionals: true,
			options: {
				cwd: { type: "string" },
				name: { type: "string" },
				id: { type: "string" },
				url: { type: "string" },
				"auth-token": { type: "string" },
				"base-revision": { type: "string" },
				append: { type: "string" },
				replace: { type: "string" },
				"after-heading": { type: "string" },
				markdown: { type: "string" },
				file: { type: "string" },
				format: { type: "string" },
				json: { type: "boolean" },
				out: { type: "string" },
				parent: { type: "string" },
				title: { type: "string" },
				folder: { type: "string" },
				"folder-name": { type: "string" },
				workspace: { type: "string" },
				repo: { type: "string" },
				path: { type: "string" },
				watch: { type: "boolean" },
				yes: { type: "boolean", short: "y" },
				actor: { type: "string" },
			},
		});
		const [command, ...extraArgs] = positionals;
		return {
			command,
			help,
			workspaceName: values.name,
			workspaceId: values.workspace ?? values.id,
			authToken: getAuthToken(values["auth-token"]),
			baseRevision: values["base-revision"],
			appendMarkdown: values.append,
			replaceMarkdown: values.replace,
			afterHeading: values["after-heading"],
			patchMarkdown: values.markdown,
			file: values.file,
			format: values.format,
			json: values.json ?? false,
			out: values.out,
			parentId: values.parent,
			title: values.title,
			folderId: values.folder,
			folderName: values["folder-name"],
			documentPath: values.path,
			mountPath: values.path,
			repoDir: values.repo,
			watch: values.watch ?? false,
			assumeYes: values.yes ?? false,
			actor: values.actor,
			deploymentUrl: values.url,
			authFromCredentials: false,
			extraArgs,
			workspacePath: values.cwd ? resolve(values.cwd) : process.cwd(),
		};
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
		} as const;
	}
}

function printHelp(args: CliArgs) {
	if (args.command === "login") {
		printLoginHelp();
		return;
	}
	if (args.command === "logout") {
		printLogoutHelp();
		return;
	}
	if (args.command === "mount") {
		printMountHelp();
		return;
	}
	if (args.command === "ensure-desktop") {
		printEnsureDesktopHelp();
		return;
	}
	if (args.command === "status") {
		printStatusHelp();
		return;
	}
	if (args.command !== "cloud") {
		printRootHelp();
		return;
	}

	const [action] = args.extraArgs;
	switch (action) {
		case undefined:
			printCloudHelp();
			return;
		case "create":
			printCreateHelp();
			return;
		case "connect":
			printConnectHelp();
			return;
		case "sync":
			printSyncHelp();
			return;
		case "import":
			printImportHelp();
			return;
		case "export":
			printExportHelp();
			return;
		case "project":
			printProjectHelp();
			return;
		case "document":
			printDocumentHelp();
			return;
		case "folder":
			printFolderHelp();
			return;
		case "watch":
			printWatchHelp();
			return;
		case "disconnect":
			printDisconnectHelp();
			return;
		default:
			printCloudHelp();
	}
}

function printRootHelp() {
	console.log("Usage:");
	console.log("  hubble login [--url url]");
	console.log("  hubble logout");
	console.log("  hubble ensure-desktop [--url url] [--yes]");
	console.log("  hubble status [--json]");
	console.log(
		"  hubble mount --workspace id --folder id --folder-name name --repo dir [--path mountPath] [--url url] [--yes]",
	);
	console.log("  hubble [--cwd path] cloud <command>");
	console.log("");
	console.log("Commands:");
	console.log("  login    Sign in with browser approval");
	console.log("  logout   Remove saved CLI credentials");
	console.log("  ensure-desktop  Install, open, and sign in the desktop app");
	console.log(
		"  status   Report desktop projection health for people or agents",
	);
	console.log("  mount    Create a live desktop-watched repo mount");
	console.log("  cloud    Manage Cloud Sync");
}

function printStatusHelp() {
	console.log("Usage:");
	console.log("  hubble status [--json]");
	console.log("");
	console.log(
		"Reports every desktop projection root, health, queued edits, pending review, and recovery counts.",
	);
}

function printLoginHelp() {
	console.log("Usage:");
	console.log("  hubble login [--url url]");
	console.log("");
	console.log(
		"Starts a browser-approved device login and saves CLI credentials.",
	);
	console.log("");
	console.log("Options:");
	console.log("  --url url  Convex deployment URL");
}

function printLogoutHelp() {
	console.log("Usage:");
	console.log("  hubble logout");
	console.log("");
	console.log("Deletes saved Hubble CLI credentials.");
}

function printEnsureDesktopHelp() {
	console.log("Usage:");
	console.log("  hubble ensure-desktop [--url url] [--yes]");
	console.log("");
	console.log(
		"Ensures the verified Hubble dev build is installed, open, and signed in as the CLI user.",
	);
	console.log("");
	console.log("Options:");
	console.log("  --url url  Convex deployment URL");
	console.log(
		"  --yes, -y  Approve installation without an interactive prompt",
	);
}

function printMountHelp() {
	console.log("Usage:");
	console.log(
		"  hubble mount --workspace id --folder id --folder-name name --repo dir [--path mountPath] [--url url] [--yes]",
	);
	console.log("");
	console.log(
		"Links a cloud folder into a local repo through the Hubble desktop app and exits only after the live watcher is proven.",
	);
	console.log("");
	console.log("Options:");
	console.log("  --workspace id      Cloud workspace id");
	console.log("  --folder id         Cloud folder id");
	console.log("  --folder-name name  Cloud folder display name");
	console.log("  --repo dir          Local repository directory");
	console.log("  --path mountPath    Optional mount path");
	console.log("  --url url           Convex deployment URL");
	console.log(
		"  --yes, -y           Approve desktop installation without prompting",
	);
}

function printCloudHelp() {
	console.log("Usage:");
	console.log("  hubble [--cwd path] cloud <command>");
	console.log("");
	console.log("Commands:");
	console.log("  create      Create and link a remote workspace");
	console.log("  connect     Link an existing remote workspace");
	console.log("  sync        Run one sync");
	console.log("  import      Import local markdown as Live Documents");
	console.log("  export      Export Live Documents as markdown projections");
	console.log(
		"  project     Write read-only Live Document projections for agents",
	);
	console.log("  document    Read or patch a Live Document for agents");
	console.log("  folder      Create, list, or export cloud folders");
	console.log("  watch       Sync continuously");
	console.log("  disconnect  Remove Cloud Sync config");
}

function printCreateHelp() {
	console.log("Usage:");
	console.log(
		"  hubble [--cwd path] cloud create --name name [--url url] [--auth-token token]",
	);
	console.log("");
	console.log("Options:");
	console.log("  --name name  Remote workspace name to create");
	console.log("  --url url    Convex deployment URL");
	console.log("  --auth-token token  Convex auth token");
}

function printConnectHelp() {
	console.log("Usage:");
	console.log(
		"  hubble [--cwd path] cloud connect (--name name|--id id) [--url url] [--auth-token token]",
	);
	console.log("");
	console.log("Options:");
	console.log("  --name name  Existing remote workspace name");
	console.log("  --id id      Existing remote workspace id");
	console.log("  --url url    Convex deployment URL");
	console.log("  --auth-token token  Convex auth token");
}

function printSyncHelp() {
	console.log("Usage:");
	console.log("  hubble [--cwd path] cloud sync");
	console.log("");
	console.log("Runs one legacy whole-file sync for a linked workspace.");
}

function printImportHelp() {
	console.log("Usage:");
	console.log("  hubble [--cwd path] cloud import");
	console.log("");
	console.log("Imports local markdown files into cloud Live Documents.");
}

function printExportHelp() {
	console.log("Usage:");
	console.log("  hubble [--cwd path] cloud export");
	console.log("");
	console.log(
		"Exports cloud Live Documents to local markdown projection files.",
	);
}

function printProjectHelp() {
	console.log("Usage:");
	console.log("  hubble [--cwd path] cloud project");
	console.log("");
	console.log(
		"Writes Live Documents to .hubble/projections/live-documents for read-only agent access.",
	);
}

function printDocumentHelp() {
	console.log("Usage:");
	console.log("  hubble [--cwd path] cloud document get --id documentId");
	console.log(
		"  hubble [--cwd path] cloud document create --title title --file path.md [--folder folderId] [--path relativePath] [--actor name]",
	);
	console.log(
		"  hubble [--cwd path] cloud document patch --id documentId --base-revision n (--replace markdown|--append markdown|--after-heading heading --markdown markdown) [--actor name]",
	);
	console.log(
		"  hubble [--cwd path] cloud document shim --id documentId --file staging.md [--watch] [--actor name]",
	);
	console.log(
		"  hubble [--cwd path] cloud document reconcile --id documentId --file projection.md [--watch] [--actor name]",
	);
	console.log(
		"  hubble [--cwd path] cloud document export --id documentId [--format md] [--out file]",
	);
	console.log("");
	console.log(
		"Creates, reads, or patches Live Documents through the agent document API.",
	);
}

function printFolderHelp() {
	console.log("Usage:");
	console.log(
		"  hubble [--cwd path] cloud folder create --name name [--parent folderId] [--actor name]",
	);
	console.log("  hubble [--cwd path] cloud folder list");
	console.log(
		"  hubble [--cwd path] cloud folder export --folder folderId --out dir",
	);
	console.log("");
	console.log("Creates, lists, or exports cloud folder subtrees.");
}

function printWatchHelp() {
	console.log("Usage:");
	console.log("  hubble [--cwd path] cloud watch");
	console.log("");
	console.log("Watches legacy whole-file local and remote changes.");
}

function printDisconnectHelp() {
	console.log("Usage:");
	console.log("  hubble [--cwd path] cloud disconnect");
	console.log("");
	console.log("Removes cloudSync from .hubble/config.json.");
}

function printUsage() {
	console.error("Usage:");
	console.error("  hubble login [--url url]");
	console.error("  hubble logout");
	console.error(
		"  hubble mount --workspace id --folder id --folder-name name --repo dir [--path mountPath] [--url url] [--yes]",
	);
	console.error("  hubble [--cwd path] cloud create --name name [--url url]");
	console.error(
		"  hubble [--cwd path] cloud connect (--name name|--id id) [--url url]",
	);
	console.error("  hubble [--cwd path] cloud sync");
	console.error("  hubble [--cwd path] cloud import");
	console.error("  hubble [--cwd path] cloud export");
	console.error("  hubble [--cwd path] cloud project");
	console.error("  hubble [--cwd path] cloud document get --id documentId");
	console.error(
		"  hubble [--cwd path] cloud document create --title title --file path.md [--folder folderId] [--path relativePath] [--actor name]",
	);
	console.error(
		"  hubble [--cwd path] cloud document patch --id documentId --base-revision n (--replace markdown|--append markdown|--after-heading heading --markdown markdown)",
	);
	console.error(
		"  hubble [--cwd path] cloud document shim --id documentId --file staging.md [--watch]",
	);
	console.error(
		"  hubble [--cwd path] cloud document reconcile --id documentId --file projection.md [--watch]",
	);
	console.error(
		"  hubble [--cwd path] cloud document export --id documentId [--format md] [--out file]",
	);
	console.error(
		"  hubble [--cwd path] cloud folder create --name name [--parent folderId] [--actor name]",
	);
	console.error("  hubble [--cwd path] cloud folder list");
	console.error(
		"  hubble [--cwd path] cloud folder export --folder folderId --out dir",
	);
	console.error("  hubble [--cwd path] cloud watch");
	console.error("  hubble [--cwd path] cloud disconnect");
}

void main().catch((err) => {
	console.error(errorMessage(err));
	process.exitCode = 1;
});
