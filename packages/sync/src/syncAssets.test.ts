import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncBackend } from "./backend";
import type { FileSystem, LocalAsset } from "./fs";
import { sync } from "./sync";
import type { RemoteAsset } from "./types";

const workspacePath = "/workspace";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("legacy asset sync failures", () => {
	it("does not advance a failed upload and retries it on the next sync", async () => {
		const memory = createMemoryFileSystem([
			{ relativePath: "note.assets/local.png", hash: "local-hash" },
		]);
		const pushAsset = vi.fn(async () => {});
		const backend = createBackend({ pushAsset });
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("failed", { status: 500 }))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ storageId: "storage-local" }), {
					status: 200,
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const failed = await sync(backend, memory.fs, workspacePath);
		expect(failed.assetsFailed).toEqual(["note.assets/local.png"]);
		expect(failed.assetsPushed).toBe(0);
		expect(pushAsset).not.toHaveBeenCalled();
		expect(memory.readState().assets).toEqual({});

		const retried = await sync(backend, memory.fs, workspacePath);
		expect(retried.assetsFailed).toEqual([]);
		expect(retried.assetsPushed).toBe(1);
		expect(pushAsset).toHaveBeenCalledWith(
			expect.objectContaining({
				path: "note.assets/local.png",
				contentHash: "local-hash",
			}),
		);
		expect(memory.readState().assets).toMatchObject({
			"note.assets/local.png": { hash: "local-hash" },
		});
	});

	it("keeps partial download success while retrying only failed assets", async () => {
		const remotes = [
			remoteAsset("note.assets/bad.png", "bad-hash", "bad-storage"),
			remoteAsset("note.assets/good.png", "good-hash", "good-storage"),
		];
		const memory = createMemoryFileSystem();
		const backend = createBackend({ remotes });
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string | URL | Request) => {
				const value = String(url);
				if (value.endsWith("bad-storage")) {
					return new Response("failed", { status: 503 });
				}
				return new Response("good-hash", { status: 200 });
			}),
		);

		const partial = await sync(backend, memory.fs, workspacePath);
		expect(partial.assetsFailed).toEqual(["note.assets/bad.png"]);
		expect(partial.assetsPulled).toBe(1);
		expect(memory.binary("note.assets/bad.png")).toBeUndefined();
		expect(memory.binary("note.assets/good.png")).toEqual(
			new TextEncoder().encode("good-hash"),
		);
		expect(memory.readState().assets).toMatchObject({
			"note.assets/good.png": { hash: "good-hash" },
		});
		expect(memory.readState().assets).not.toHaveProperty("note.assets/bad.png");

		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string | URL | Request) => {
				const hash = String(url).endsWith("bad-storage")
					? "bad-hash"
					: "good-hash";
				return new Response(hash, { status: 200 });
			}),
		);
		const retried = await sync(backend, memory.fs, workspacePath);
		expect(retried.assetsFailed).toEqual([]);
		expect(retried.assetsPulled).toBe(1);
		expect(memory.binary("note.assets/bad.png")).toEqual(
			new TextEncoder().encode("bad-hash"),
		);
	});
});

function createMemoryFileSystem(initialAssets: LocalAsset[] = []) {
	const files = new Map<string, string>([
		[
			`${workspacePath}/.hubble/config.json`,
			JSON.stringify({
				cloudSync: {
					provider: "convex",
					deploymentUrl: "https://example.convex.cloud",
					workspaceId: "workspace-1",
					deviceId: "device-1",
					backgroundSync: false,
				},
			}),
		],
		[
			`${workspacePath}/.hubble/state.json`,
			JSON.stringify({ lastSyncedAt: 0, files: {}, assets: {} }),
		],
	]);
	const binaries = new Map<string, Uint8Array>();
	const assetHashes = new Map(
		initialAssets.map((asset) => [asset.relativePath, asset.hash]),
	);
	for (const asset of initialAssets) {
		binaries.set(
			`${workspacePath}/${asset.relativePath}`,
			new TextEncoder().encode(asset.hash),
		);
	}

	const fs: FileSystem = {
		async readFile(path) {
			const value = files.get(path);
			if (value === undefined) throw new Error(`Missing file: ${path}`);
			return value;
		},
		async writeFile(path, content) {
			files.set(path, content);
		},
		async deleteFile(path) {
			files.delete(path);
			binaries.delete(path);
			assetHashes.delete(path.slice(`${workspacePath}/`.length));
		},
		async readFileOrNull(path) {
			return files.get(path) ?? null;
		},
		async ensureDir() {},
		async listMarkdownFiles() {
			return [];
		},
		async readBinaryFile(path) {
			const value = binaries.get(path);
			if (!value) throw new Error(`Missing binary: ${path}`);
			return value;
		},
		async writeBinaryFile(path, data) {
			binaries.set(path, data);
			const relativePath = path.slice(`${workspacePath}/`.length);
			assetHashes.set(relativePath, new TextDecoder().decode(data));
		},
		async listAssetFiles() {
			return [...assetHashes].map(([relativePath, hash]) => ({
				relativePath,
				hash,
			}));
		},
	};

	return {
		fs,
		binary(relativePath: string) {
			return binaries.get(`${workspacePath}/${relativePath}`);
		},
		readState() {
			return JSON.parse(
				files.get(`${workspacePath}/.hubble/state.json`) ?? "{}",
			) as { assets?: Record<string, { hash: string }> };
		},
	};
}

function createBackend(options?: {
	remotes?: RemoteAsset[];
	pushAsset?: SyncBackend["pushAsset"];
}) {
	return {
		async getFiles() {
			return [];
		},
		async getAssets() {
			return options?.remotes ?? [];
		},
		async generateAssetUploadUrl() {
			return "https://upload.example";
		},
		pushAsset: options?.pushAsset ?? (async () => {}),
		async softDeleteAsset() {},
		async getAssetDownloadUrl(storageId: string) {
			return `https://download.example/${storageId}`;
		},
	} as unknown as SyncBackend;
}

function remoteAsset(
	path: string,
	contentHash: string,
	storageId: string,
): RemoteAsset {
	return {
		_id: `asset-${storageId}`,
		path,
		storageId,
		contentHash,
		updatedAt: 1,
		deviceId: "remote-device",
		deleted: false,
	};
}
