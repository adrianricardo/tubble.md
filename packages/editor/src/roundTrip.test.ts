import { describe, expect, it } from "vitest";
import { markdownToTiptapDoc } from "./markdownToProsemirror";
import { tiptapDocToMarkdown } from "./prosemirrorToMarkdown";
import { getHubbleEditorSchema } from "./schema";

describe("markdown round-trip idempotency", () => {
	it("keeps nested emphasis byte-stable", () => {
		for (const markdown of [
			"***x***\n",
			"**a *b* c**\n",
			"*a **b** c*\n",
			"Nested **a *b* c** emphasis.\n",
		]) {
			expectStableRoundTrips(markdown);
		}
	});

	it("keeps literal single tildes as literal text", () => {
		for (const markdown of ["~60s granularity\n", "~not strike~\n"]) {
			expectStableRoundTrips(markdown);
		}
	});

	it("keeps double-tilde strikethrough byte-stable", () => {
		expectStableRoundTrips("~~strike~~\n");
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
# Body
`;

		expectStableRoundTrips(markdown);
	});

	it("keeps frontmatter-only documents byte-stable", () => {
		const markdown = `---
title: Dogfood note
---
`;

		expectStableRoundTrips(markdown);
	});

	it("keeps bare URLs, emails, autolinks, and explicit links distinct", () => {
		const markdown =
			"Visit https://x.com or hello@example.com\n\n<https://x.com>\n\n<hello@example.com>\n\n[https://x.com](https://x.com)\n";

		expectStableRoundTrips(markdown);
	});

	it("keeps GFM tables byte-stable", () => {
		const markdown =
			"| Feature | Status |\n| :--- | ---: |\n| Tables | **ok** |\n| Pipes | a \\| b |\n";

		expectStableRoundTrips(markdown);
	});

	it("keeps fenced code blocks opaque", () => {
		const markdown =
			"```md\n---\ntitle: Not frontmatter\n---\n***not emphasis***\n```\n";

		expectStableRoundTrips(markdown);
	});

	it("keeps common block structure stable", () => {
		expectStableRoundTrips("# Heading\n\n- one\n- two\n\n> quoted\n");
	});

	it("keeps escaped markdown control characters stable", () => {
		expectStableRoundTrips(String.raw`Escaped \* stays literal` + "\n");
	});

	it("normalizes missing trailing newlines once", () => {
		expectRoundTripsTo("No trailing newline", "No trailing newline\n");
	});
});

function roundTrip(markdown: string) {
	return tiptapDocToMarkdown(markdownToTiptapDoc(markdown));
}

function schemaRoundTrip(markdown: string) {
	const normalized = schema()
		.nodeFromJSON(markdownToTiptapDoc(markdown))
		.toJSON();
	return tiptapDocToMarkdown(normalized);
}

let cachedSchema: ReturnType<typeof getHubbleEditorSchema> | null = null;

function schema() {
	cachedSchema ??= getHubbleEditorSchema();
	return cachedSchema;
}

function expectStableRoundTrips(markdown: string) {
	expectRoundTripsTo(markdown, markdown);
}

function expectRoundTripsTo(markdown: string, expected: string) {
	for (const path of [roundTrip, schemaRoundTrip]) {
		const once = path(markdown);
		expect(once).toBe(expected);
		expect(path(once)).toBe(once);
	}
}
