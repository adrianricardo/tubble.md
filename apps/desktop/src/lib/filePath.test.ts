import { describe, expect, it } from "vitest";
import { isMarkdownAssetFolderName } from "./filePath";

describe("isMarkdownAssetFolderName", () => {
	it("matches canonical markdown asset directories", () => {
		expect(isMarkdownAssetFolderName("note.assets")).toBe(true);
		expect(isMarkdownAssetFolderName("note.assets.backup")).toBe(false);
		expect(isMarkdownAssetFolderName("assets")).toBe(false);
	});
});
