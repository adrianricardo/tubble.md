import { describe, expect, it } from "vitest";
import { markdownToTiptapDoc } from "./markdownToProsemirror";
import { tiptapDocToMarkdown } from "./prosemirrorToMarkdown";

describe("embed markdown conversion", () => {
	it("does not parse legacy embed custom elements as embed nodes", () => {
		const doc = markdownToTiptapDoc(
			'# Roadmap\n\n<embed-kanban board="roadmap"></embed-kanban>',
		);

		expect(doc.content?.[1]?.type).toBe("paragraph");
		expect(doc.content?.some((node) => node.type === "embed")).toBe(false);
	});

	it("parses a relative html iframe into an iframe embed node", () => {
		const doc = markdownToTiptapDoc(
			'# Demo\n\n<iframe src="./kanban.html"></iframe>',
		);

		expect(doc.content?.[1]).toEqual({
			type: "embed",
			attrs: {
				kind: "iframe",
				src: "./kanban.html",
			},
		});
	});

	it("does not parse remote iframe urls as embed nodes", () => {
		const doc = markdownToTiptapDoc(
			'<iframe src="https://google.com"></iframe>',
		);

		expect(doc.content?.[0]?.type).toBe("paragraph");
		expect(doc.content?.some((node) => node.type === "embed")).toBe(false);
	});

	it("does not parse unsafe iframe url schemes as embed nodes", () => {
		const doc = markdownToTiptapDoc(
			'<iframe src="javascript:alert(1)"></iframe>',
		);

		expect(doc.content?.[0]?.type).toBe("paragraph");
		expect(doc.content?.some((node) => node.type === "embed")).toBe(false);
	});

	it("does not parse a nested embed element as an embed node", () => {
		const doc = markdownToTiptapDoc("<div><embed-kanban></embed-kanban></div>");

		expect(doc.content?.[0]?.type).toBe("paragraph");
		expect(doc.content?.[0]?.content?.[0]?.text).toBe(
			"<div><embed-kanban></embed-kanban></div>",
		);
	});

	it("does not parse embed HTML with sibling content as an embed node", () => {
		const doc = markdownToTiptapDoc(
			"<embed-kanban></embed-kanban><p>Keep me</p>",
		);

		expect(doc.content?.[0]?.type).toBe("paragraph");
		expect(doc.content?.some((node) => node.type === "embed")).toBe(false);
	});

	it("does not serialize legacy custom embed nodes", () => {
		const markdown = tiptapDocToMarkdown({
			type: "doc",
			content: [
				{
					type: "embed",
					attrs: {
						kind: "bundle",
						name: "kanban",
						tagName: "embed-kanban",
						props: {
							board: "roadmap",
						},
					},
				},
			],
		});

		expect(markdown).toBe("");
	});

	it("serializes an iframe embed node back to iframe syntax", () => {
		const markdown = tiptapDocToMarkdown({
			type: "doc",
			content: [
				{
					type: "embed",
					attrs: {
						kind: "iframe",
						src: "./kanban.html",
					},
				},
			],
		});

		expect(markdown).toBe('<iframe src="./kanban.html"></iframe>');
	});
});
