#!/usr/bin/env node
import { isInitialized, readConfig, sync as runSync } from "@hubble.md/sync";
import { createNodeFileSystem } from "@hubble.md/sync/node";
import { api } from "@hubble.md/sync-backend";
import chokidar from "chokidar";
import { ConvexClient } from "convex/browser";

const fs = createNodeFileSystem();

async function main() {
	const [command, ...args] = process.argv.slice(2);
	if (command !== "sync") {
		printUsage();
		process.exitCode = 1;
		return;
	}

	const workspacePath = process.cwd();
	if (!(await isInitialized(fs, workspacePath))) {
		console.error(
			`No valid Hubble workspace in ${workspacePath}. Expected .hubble/config.json.`,
		);
		process.exitCode = 1;
		return;
	}

	if (args.length === 0) {
		await syncOnce(workspacePath, "manual");
		return;
	}

	if (args.length === 1 && args[0] === "--continuous") {
		await syncContinuously(workspacePath);
		return;
	}

	printUsage();
	process.exitCode = 1;
}

async function syncOnce(workspacePath: string, reason: string) {
	const result = await runSync(fs, workspacePath);
	logResult(reason, result);
	return result;
}

async function syncContinuously(workspacePath: string) {
	const config = await readConfig(fs, workspacePath);
	console.log(`Hubble Sync watching ${workspacePath}`);
	console.log(`Workspace: ${config.workspaceName}`);

	const scheduler = createSyncScheduler(workspacePath);
	await scheduler.enqueue("startup");

	let sawInitialRemoteSnapshot = false;
	const client = new ConvexClient(config.convexUrl);
	const unsubscribe = client.onUpdate(
		api.sync.getFilesByWorkspace,
		{ workspaceId: config.workspaceId as never },
		() => {
			if (!sawInitialRemoteSnapshot) {
				sawInitialRemoteSnapshot = true;
				return;
			}
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
		await client.close();
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

function createSyncScheduler(workspacePath: string) {
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
				await syncOnce(workspacePath, currentReason);
				if (!pending) break;
				pending = false;
				currentReason = pendingReason;
			}
		} finally {
			running = false;
		}
	};

	return {
		enqueue: run,
	};
}

function logResult(
	reason: string,
	result: Awaited<ReturnType<typeof runSync>>,
) {
	console.log(
		`sync ${reason}: pushed=${result.pushed.length} pulled=${result.pulled.length} deleted=${result.deleted.length} conflicts=${result.conflicts.length} unchanged=${result.unchanged}`,
	);
	if (result.pushed.length > 0) {
		console.log(`  pushed: ${result.pushed.join(", ")}`);
	}
	if (result.pulled.length > 0) {
		console.log(`  pulled: ${result.pulled.join(", ")}`);
	}
	if (result.deleted.length > 0) {
		console.log(`  deleted: ${result.deleted.join(", ")}`);
	}
	if (result.conflicts.length > 0) {
		console.log(`  conflicts: ${result.conflicts.join(", ")}`);
	}
}

function printUsage() {
	console.error("Usage:");
	console.error("  hubble sync");
	console.error("  hubble sync --continuous");
}

void main();
