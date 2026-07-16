import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { markdownToTiptapDoc } from "./markdownToProsemirror";
import { tiptapDocToMarkdown } from "./prosemirrorToMarkdown";

type Mark = NonNullable<JSONContent["marks"]>[number];
const MARK_TYPES = ["bold", "italic", "strike"] as const;
type MarkType = (typeof MARK_TYPES)[number];

describe("emphasis markdown invariants", () => {
	it.each([
		[
			"bold trailing whitespace",
			paragraph([text("bold ", mark("bold")), text("next")]),
			"**bold** next\n",
		],
		[
			"italic and strike trailing whitespace",
			paragraph([
				text("italic ", mark("italic")),
				text("and "),
				text("strike ", mark("strike")),
				text("next"),
			]),
			"*italic* and ~~strike~~ next\n",
		],
		[
			"whitespace inside code",
			paragraph([text("foo ", mark("code")), text("bar")]),
			"`foo `bar\n",
		],
		[
			"trailing all-whitespace mark",
			paragraph([text("a", mark("bold")), text("   ", mark("bold"))]),
			"**a**   \n",
		],
		[
			"leading all-whitespace mark",
			paragraph([text("   ", mark("bold")), text("a", mark("bold"))]),
			"   **a**\n",
		],
		[
			"interior marked whitespace",
			paragraph([
				text("a", mark("bold")),
				text(" ", mark("bold")),
				text("b", mark("bold")),
			]),
			"**a b**\n",
		],
	])("serializes %s", (_name, doc, expected) => {
		expect(tiptapDocToMarkdown(doc as JSONContent)).toBe(expected);
	});

	it.each([
		["bold", "italic", "**this *text* works**\n"],
		["bold", "strike", "**this ~~text~~ works**\n"],
		["italic", "strike", "*this ~~text~~ works*\n"],
	] as const)("keeps boundary whitespace outside nested %s and %s delimiters", (outer, inner, expected) => {
		expect(
			tiptapDocToMarkdown(
				paragraph([
					text("this", mark(outer)),
					text(" text ", mark(outer), mark(inner)),
					text("works", mark(outer)),
				]),
			),
		).toBe(expected);
	});

	it("keeps boundary whitespace outside triple nested delimiters", () => {
		expect(
			tiptapDocToMarkdown(
				paragraph([
					text("this", mark("bold"), mark("italic")),
					text(" text ", mark("bold"), mark("italic"), mark("strike")),
					text("works", mark("bold"), mark("italic")),
				]),
			),
		).toBe("***this ~~text~~ works***\n");
	});

	it("keeps shared-mark whitespace across group transitions", () => {
		expect(
			tiptapDocToMarkdown(
				paragraph([
					text("this", mark("bold")),
					text(" is italic ", mark("italic"), mark("strike")),
					text("text.", mark("strike")),
				]),
			),
		).toBe("**this** ~~*is italic* text.~~\n");
	});

	it.each([
		[wikiLink(), "bold", "**this [[target|alias]] text**\n"],
		[wikiLink(), "italic", "*this [[target|alias]] text*\n"],
		[wikiLink(), "strike", "~~this [[target|alias]] text~~\n"],
		[urlLink(), "bold", "**this [alias](https://example.com) text**\n"],
		[urlLink(), "italic", "*this [alias](https://example.com) text*\n"],
		[urlLink(), "strike", "~~this [alias](https://example.com) text~~\n"],
	] as const)("keeps link boundary whitespace outside %s delimiters", (link, markType, expected) => {
		expect(
			tiptapDocToMarkdown(
				paragraph([
					text("this", mark(markType)),
					text(" alias ", mark(markType), link),
					text("text", mark(markType)),
				]),
			),
		).toBe(expected);
	});

	it("keeps seeded generated emphasis Markdown stable", () => {
		const seed = 0x5eed1234;
		const random = createSeededRandom(seed);

		for (let iteration = 0; iteration < 200; iteration += 1) {
			const doc = randomDoc(random);
			const message = `seed ${seed} iteration ${iteration} doc ${JSON.stringify(doc)}`;
			const markdown = tiptapDocToMarkdown(doc);
			const reparsed = markdownToTiptapDoc(markdown);

			expect(tiptapDocToMarkdown(reparsed), message).toBe(markdown);
			expectNoMarkedBoundaryWhitespace(reparsed, message);
			for (const markType of MARK_TYPES) {
				expect(trimmedMarkedRuns(reparsed, markType), message).toEqual(
					trimmedMarkedRuns(doc, markType),
				);
			}
		}
	});
});

function paragraph(content: JSONContent[]): JSONContent {
	return { type: "doc", content: [{ type: "paragraph", content }] };
}

function text(value: string, ...marks: Mark[]): JSONContent {
	return marks.length
		? { type: "text", text: value, marks }
		: { type: "text", text: value };
}

function mark(type: string): Mark {
	return { type };
}

function wikiLink(): Mark {
	return {
		type: "link",
		attrs: { href: "target", kind: "wiki", target: "target" },
	};
}

function urlLink(): Mark {
	return { type: "link", attrs: { href: "https://example.com" } };
}

// A deterministic generator makes every property failure replayable from the
// seed and iteration printed by the assertion.
function createSeededRandom(seed: number) {
	return () => {
		seed += 0x6d2b79f5;
		let value = seed;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function randomInt(random: () => number, max: number) {
	return Math.floor(random() * max);
}

function randomWhitespace(random: () => number) {
	return Array.from({ length: randomInt(random, 4) }, () =>
		random() < 0.75 ? " " : "\t",
	).join("");
}

function randomWord(random: () => number) {
	return Array.from({ length: 1 + randomInt(random, 8) }, () =>
		String.fromCharCode(97 + randomInt(random, 26)),
	).join("");
}

function randomMarks(random: () => number) {
	return MARK_TYPES.slice(0, randomInt(random, MARK_TYPES.length + 1)).map(
		(type) => ({ type }),
	);
}

function randomDoc(random: () => number): JSONContent {
	const segmentCount = 1 + randomInt(random, 6);
	return paragraph(
		Array.from({ length: segmentCount }, (_, index) => ({
			type: "text",
			text: `${index === 0 ? "" : randomWhitespace(random)}${randomWord(random)}${index === segmentCount - 1 ? "" : randomWhitespace(random)}`,
			marks: randomMarks(random),
		})),
	);
}

function textNodes(doc: JSONContent) {
	const nodes: JSONContent[] = [];
	const visit = (node: JSONContent) => {
		if (node.type === "text") nodes.push(node);
		for (const child of node.content ?? []) visit(child);
	};
	visit(doc);
	return nodes;
}

function markedRuns(doc: JSONContent, markType: MarkType) {
	const runs: string[] = [];
	let current = "";
	for (const node of textNodes(doc)) {
		if (node.marks?.some((item) => item.type === markType)) {
			current += node.text ?? "";
		} else if (current) {
			runs.push(current);
			current = "";
		}
	}
	if (current) runs.push(current);
	return runs;
}

function trimmedMarkedRuns(doc: JSONContent, markType: MarkType) {
	return markedRuns(doc, markType)
		.map((run) => run.trim())
		.filter(Boolean)
		.sort();
}

function expectNoMarkedBoundaryWhitespace(doc: JSONContent, message: string) {
	for (const markType of MARK_TYPES) {
		for (const run of markedRuns(doc, markType)) {
			expect(run, `${message} ${markType} run`).not.toMatch(/^[ \t]|[ \t]$/);
		}
	}
}
