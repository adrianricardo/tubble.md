import { describe, expect, it } from "vitest";
import {
	buildAuthorityManifest,
	extractLocalMarkdownReferences,
} from "./authorityManifest";

describe("authority manifest", () => {
	it("canonicalizes items and fingerprints exclusions deterministically", async () => {
		const input = {
			items: [
				{
					relativePath: "notes\\image.assets\\hero.png",
					kind: "asset" as const,
					size: 7,
					hash: "asset-hash",
					gitState: "untracked" as const,
					readOnly: false,
					executable: false,
				},
				{
					relativePath: "notes/image.md",
					kind: "markdown" as const,
					size: 5,
					hash: "markdown-hash",
					gitState: "tracked" as const,
					readOnly: false,
					executable: false,
				},
			],
			exclusions: [
				{
					relativePath: "notes/missing.png",
					reason: "missing-reference" as const,
					blocking: true,
				},
			],
		};
		const first = await buildAuthorityManifest(input);
		const second = await buildAuthorityManifest({
			items: [...input.items].reverse(),
			exclusions: input.exclusions,
		});

		expect(first.manifestHash).toBe(second.manifestHash);
		expect(first.items.map((item) => item.relativePath)).toEqual([
			"notes/image.assets/hero.png",
			"notes/image.md",
		]);
		expect(first.summary).toEqual({
			folderCount: 2,
			markdownCount: 1,
			assetCount: 1,
			totalBytes: 12,
			excludedCount: 1,
			blockingExclusionCount: 1,
		});
	});

	it("extracts local Markdown and HTML references without remote URLs", () => {
		expect(
			extractLocalMarkdownReferences(
				'[Plan](notes/plan.md "title")\n![Hero](plan.assets/hero.png#crop)\n<img src="media/chart.png">\n[Web](https://example.com)',
			),
		).toEqual(["media/chart.png", "notes/plan.md", "plan.assets/hero.png"]);
	});

	it("keeps malformed percent escapes inspectable instead of throwing", () => {
		expect(
			extractLocalMarkdownReferences("[file](assets/%broken.png)"),
		).toEqual(["assets/%broken.png"]);
	});
});
