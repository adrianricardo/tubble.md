import { describe, expect, it } from "vitest";
import { classifyFileChange } from "./externalFileChange";

describe("classifyFileChange", () => {
	it("reload when clean editor sees disk change", () => {
		expect(
			classifyFileChange({
				editorContent: "before",
				baseline: "before",
				diskContent: "after",
			}),
		).toBe("reload");
	});

	it("match when editor already equals disk", () => {
		expect(
			classifyFileChange({
				editorContent: "local edit",
				baseline: "before",
				diskContent: "local edit",
			}),
		).toBe("match");
	});

	it("conflict when editor and disk diverge", () => {
		expect(
			classifyFileChange({
				editorContent: "local edit",
				baseline: "before",
				diskContent: "remote edit",
			}),
		).toBe("conflict");
	});

	it("none when disk unchanged", () => {
		expect(
			classifyFileChange({
				editorContent: "before",
				baseline: "before",
				diskContent: "before",
			}),
		).toBe("none");
	});

	it("none when disk unchanged but editor is dirty", () => {
		expect(
			classifyFileChange({
				editorContent: "local edit",
				baseline: "before",
				diskContent: "before",
			}),
		).toBe("none");
	});
});
