import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	type AuthorityTransferOperation,
	AuthorityTransferStore,
} from "./authorityTransferStore";

const roots: string[] = [];

async function fixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), "hubble-transfer-store-"));
	roots.push(root);
	return {
		root,
		store: new AuthorityTransferStore(
			path.join(root, "authority-transfers.json"),
		),
	};
}

function draft(repoRoot: string): AuthorityTransferOperation {
	return {
		id: "operation-1",
		direction: "git-to-cloud",
		intent: "move",
		phase: "draft",
		source: { kind: "git", repoRoot, relativePath: "notes" },
		destination: null,
		manifestSummary: null,
		manifestHash: null,
		previewFingerprint: null,
		lastError: null,
		createdAt: 1,
		updatedAt: 1,
	};
}

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true })),
	);
});

describe("AuthorityTransferStore", () => {
	it("persists and cancels an inert preview draft", async () => {
		const { root, store } = await fixture();
		await store.upsert(draft(root));

		const cancelled = await store.cancel("operation-1", 2);

		expect(cancelled.phase).toBe("cancelled");
		expect(await store.list()).toMatchObject([
			{ id: "operation-1", phase: "cancelled", updatedAt: 2 },
		]);
	});

	it("rejects mismatched transfer endpoints", async () => {
		const { root, store } = await fixture();
		await expect(
			store.upsert({
				...draft(root),
				source: {
					kind: "cloud",
					workspaceId: "workspace-1",
					folderId: "folder-1",
				},
			}),
		).rejects.toThrow("Transfer direction does not match its endpoints");
	});

	it("refuses cancellation after cutover begins", async () => {
		const { root, store } = await fixture();
		await store.upsert({ ...draft(root), phase: "cutting-over" });

		await expect(store.cancel("operation-1")).rejects.toThrow(
			"cannot cancel from cutting-over",
		);
	});
});
