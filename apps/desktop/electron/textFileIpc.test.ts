import { describe, expect, it } from "vitest";
import { encodeTextForIpc, requireEncodedTextBytes } from "./textFileIpc";

describe("text file IPC", () => {
	it("preserves multibyte text as UTF-8 bytes", () => {
		const content = "café 中文 🚀";
		const bytes = requireEncodedTextBytes(encodeTextForIpc(content));

		expect(new TextDecoder().decode(bytes)).toBe(content);
	});

	it.each([
		"content",
		[256],
		[-1],
		[1.5],
		[Number.NaN],
	])("rejects invalid byte payload %j", (bytes) => {
		expect(() => requireEncodedTextBytes(bytes)).toThrow(
			"write-file-text requires encoded bytes",
		);
	});
});
