import { describe, expect, it } from "vitest";
import { markdownToTiptapDoc } from "./markdownToProsemirror";
import { tiptapDocToMarkdown } from "./prosemirrorToMarkdown";
import { getHubbleEditorSchema } from "./schema";

describe("image markdown conversion", () => {
	it("parses markdown image into image node", () => {
		const doc = markdownToTiptapDoc("![diagram](example.assets/abc123.png)");
		const image = doc.content?.[0];
		expect(image?.type).toBe("image");
		expect(image?.attrs).toEqual({
			src: "example.assets/abc123.png",
			alt: "diagram",
			title: undefined,
		});
	});

	it("serializes image node back to markdown image syntax", () => {
		const markdown = tiptapDocToMarkdown({
			type: "doc",
			content: [
				{
					type: "image",
					attrs: {
						src: "example.assets/abc123.png",
						alt: "diagram",
					},
				},
			],
		});
		expect(markdown).toBe("![diagram](example.assets/abc123.png)\n");
	});

	it("ignores markdown images with empty URLs", () => {
		const doc = markdownToTiptapDoc("before\n\n![]()\n\nafter");
		expect(doc.content?.some((node) => node.type === "image")).toBe(false);
	});

	it.each([
		{
			name: "image before text",
			markdown: "![diagram](example.png) trailing",
			expected: [
				{ type: "image", attrs: { src: "example.png", alt: "diagram" } },
				{ type: "paragraph", content: [{ type: "text", text: "trailing" }] },
			],
		},
		{
			name: "text before image",
			markdown: "leading ![diagram](example.png)",
			expected: [
				{ type: "paragraph", content: [{ type: "text", text: "leading" }] },
				{ type: "image", attrs: { src: "example.png", alt: "diagram" } },
			],
		},
		{
			name: "text on both sides",
			markdown: "before ![diagram](example.png) after",
			expected: [
				{ type: "paragraph", content: [{ type: "text", text: "before" }] },
				{ type: "image", attrs: { src: "example.png", alt: "diagram" } },
				{ type: "paragraph", content: [{ type: "text", text: "after" }] },
			],
		},
		{
			name: "multiple images",
			markdown: "one ![first](one.png) middle ![second](two.png) three",
			expected: [
				{ type: "paragraph", content: [{ type: "text", text: "one" }] },
				{ type: "image", attrs: { src: "one.png", alt: "first" } },
				{ type: "paragraph", content: [{ type: "text", text: "middle" }] },
				{ type: "image", attrs: { src: "two.png", alt: "second" } },
				{ type: "paragraph", content: [{ type: "text", text: "three" }] },
			],
		},
	])("keeps $name", ({ markdown, expected }) => {
		const doc = markdownToTiptapDoc(markdown);
		expect(doc.content).toMatchObject(expected);
		expect(() => getHubbleEditorSchema().nodeFromJSON(doc)).not.toThrow();
		expect(tiptapDocToMarkdown(doc)).toContain(".png)");
	});
});
