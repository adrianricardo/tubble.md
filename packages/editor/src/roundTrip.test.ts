import { describe, expect, it } from "vitest";
import { markdownToTiptapDoc } from "./markdownToProsemirror";
import { tiptapDocToMarkdown } from "./prosemirrorToMarkdown";

describe("markdown round-trip idempotency", () => {
	it("keeps nested emphasis byte-stable", () => {
		for (const markdown of ["***x***", "**a *b* c**", "*a **b** c*"]) {
			expect(roundTrip(markdown)).toBe(markdown);
			expect(roundTrip(roundTrip(markdown))).toBe(roundTrip(markdown));
		}
	});

	it("keeps literal single tildes as literal text", () => {
		for (const markdown of ["~60s granularity", "~not strike~"]) {
			expect(roundTrip(markdown)).toBe(markdown);
			expect(roundTrip(roundTrip(markdown))).toBe(roundTrip(markdown));
		}
	});

	it("keeps double-tilde strikethrough byte-stable", () => {
		const markdown = "~~strike~~";

		expect(roundTrip(markdown)).toBe(markdown);
		expect(roundTrip(roundTrip(markdown))).toBe(markdown);
	});

	it("preserves leading YAML frontmatter verbatim", () => {
		const markdown = `---
title: Dogfood note
tags:
  - sync
  - markdown
nested:
  owner:
    name: Ada
---
# Body`;

		expect(roundTrip(markdown)).toBe(markdown);
		expect(roundTrip(roundTrip(markdown))).toBe(markdown);
	});

	it("keeps bare URLs, emails, autolinks, and explicit links distinct", () => {
		const markdown =
			"Visit https://x.com or hello@example.com\n\n<https://x.com>\n\n<hello@example.com>\n\n[https://x.com](https://x.com)";

		expect(roundTrip(markdown)).toBe(markdown);
		expect(roundTrip(roundTrip(markdown))).toBe(markdown);
	});

	it("keeps GFM tables byte-stable", () => {
		const markdown =
			"| Feature | Status |\n| :--- | ---: |\n| Tables | **ok** |\n| Pipes | a \\| b |";

		expect(roundTrip(markdown)).toBe(markdown);
		expect(roundTrip(roundTrip(markdown))).toBe(markdown);
	});

	it("keeps fenced code blocks opaque", () => {
		const markdown =
			"```md\n---\ntitle: Not frontmatter\n---\n***not emphasis***\n```";

		expect(roundTrip(markdown)).toBe(markdown);
		expect(roundTrip(roundTrip(markdown))).toBe(markdown);
	});

	it("keeps common block structure stable", () => {
		const markdown = "# Heading\n\n- one\n- two\n\n> quoted";

		expect(roundTrip(markdown)).toBe(markdown);
		expect(roundTrip(roundTrip(markdown))).toBe(markdown);
	});

	it("keeps escaped markdown control characters stable", () => {
		const markdown = String.raw`Escaped \* stays literal`;

		expect(roundTrip(markdown)).toBe(markdown);
		expect(roundTrip(roundTrip(markdown))).toBe(markdown);
	});
});

function roundTrip(markdown: string) {
	return tiptapDocToMarkdown(markdownToTiptapDoc(markdown));
}
