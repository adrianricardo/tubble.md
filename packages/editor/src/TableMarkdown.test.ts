import { describe, expect, it } from "vitest";
import { markdownToTiptapDoc } from "./markdownToProsemirror";
import { tiptapDocToMarkdown } from "./prosemirrorToMarkdown";

describe("table markdown conversion", () => {
	it("round-trips a basic table byte-stable", () => {
		expect(roundTrip("| A | B |\n| --- | --- |\n| C | D |\n")).toBe(
			"| A | B |\n| --- | --- |\n| C | D |\n",
		);
	});

	it("round-trips column alignment", () => {
		const input =
			"| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |\n";
		const doc = markdownToTiptapDoc(input);

		expect(
			doc.content?.[0]?.content?.[0]?.content?.map((cell) => cell.attrs),
		).toEqual([{ align: "left" }, { align: "center" }, { align: "right" }]);
		expect(tiptapDocToMarkdown(doc)).toBe(input);
	});

	it("escapes pipes inside table cells", () => {
		const input = "| A | B |\n| --- | --- |\n| a \\| b | c |\n";

		expect(roundTrip(input)).toBe(input);
	});

	it("preserves empty cells", () => {
		const input = "| A | B | C |\n| --- | --- | --- |\n|  | x |  |\n";

		expect(roundTrip(input)).toBe(input);
	});

	it("round-trips inline marks and links inside cells", () => {
		const input =
			"| Text | More |\n| --- | --- |\n| **bold** `code` [site](https://example.com) [[Notes/File 2.md]] | ok |\n";

		expect(roundTrip(input)).toBe(input);
	});

	it("round-trips a table between other blocks", () => {
		const input = "Before\n\n| A | B |\n| --- | --- |\n| C | D |\n\nAfter\n";

		expect(roundTrip(input)).toBe(input);
	});

	it("round-trips a table with only a header row", () => {
		const input = "| A | B |\n| --- | --- |\n";

		expect(roundTrip(input)).toBe(input);
	});
});

function roundTrip(markdown: string) {
	return tiptapDocToMarkdown(markdownToTiptapDoc(markdown));
}
