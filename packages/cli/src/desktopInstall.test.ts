import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	downloadVerifiedAsset,
	selectDesktopRelease,
} from "./desktopInstall.js";

const sha256 = "a".repeat(64);
const release = {
	tag_name: "desktop-dev-latest",
	assets: [
		{
			name: "Hubble-dev-arm64-mac.zip",
			size: 42,
			browser_download_url: "https://example.test/Hubble.zip",
		},
	],
};
const manifest = {
	schemaVersion: 1 as const,
	tag: "desktop-dev-latest",
	commit: "abc123",
	version: "0.1.13-dev.abc123",
	assets: [
		{
			arch: "arm64" as const,
			name: "Hubble-dev-arm64-mac.zip",
			size: 42,
			sha256,
		},
	],
};

describe("desktop dev release selection", () => {
	test("selects the matching verified architecture", () => {
		expect(selectDesktopRelease(release, manifest, "arm64")).toMatchObject({
			version: manifest.version,
			commit: manifest.commit,
			expectedSha256: sha256,
		});
	});

	test("rejects release metadata that disagrees with the manifest", () => {
		expect(() =>
			selectDesktopRelease(
				{ ...release, assets: [{ ...release.assets[0], size: 41 }] },
				manifest,
				"arm64",
			),
		).toThrow("does not match");
	});

	test("rejects unsupported architectures", () => {
		expect(() => selectDesktopRelease(release, manifest, "riscv64")).toThrow(
			"architecture riscv64",
		);
	});

	test("streams an artifact only when size and SHA-256 match", async () => {
		const bytes = new TextEncoder().encode("verified desktop artifact");
		const directory = await fs.mkdtemp(path.join(tmpdir(), "hubble-cli-test-"));
		const destination = path.join(directory, "Hubble.zip");
		try {
			await downloadVerifiedAsset(
				async () => new Response(bytes),
				{
					version: "test",
					commit: "abc123",
					asset: { ...release.assets[0], size: bytes.byteLength },
					expectedSha256: createHash("sha256").update(bytes).digest("hex"),
				},
				destination,
			);
			expect(await fs.readFile(destination)).toEqual(Buffer.from(bytes));
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});
});
