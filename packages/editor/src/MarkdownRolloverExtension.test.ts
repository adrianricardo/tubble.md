import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { __testing } from "./MarkdownRolloverExtension";

const schema = new Schema({
	nodes: {
		doc: { content: "paragraph+" },
		paragraph: {
			content: "text*",
			group: "block",
			parseDOM: [{ tag: "p" }],
			toDOM: () => ["p", 0],
		},
		text: { group: "inline" },
	},
	marks: {
		bold: { parseDOM: [{ tag: "strong" }], toDOM: () => ["strong", 0] },
		italic: { parseDOM: [{ tag: "em" }], toDOM: () => ["em", 0] },
		code: { parseDOM: [{ tag: "code" }], toDOM: () => ["code", 0] },
		strike: { parseDOM: [{ tag: "s" }, { tag: "del" }], toDOM: () => ["s", 0] },
	},
});

function buildDoc() {
	const bold = schema.marks.bold.create();
	return schema.node("doc", null, [
		schema.node("paragraph", null, [
			schema.text("This is "),
			schema.text("bolded text", [bold]),
			schema.text(" done"),
		]),
	]);
}

function transactionWithSelectionSet(selectionSet: boolean) {
	// inferSideFromCursorMotion only reads Transaction.selectionSet in these tests.
	// We pass the minimal shape and cast to avoid constructing a full ProseMirror Transaction.
	return { selectionSet } as unknown as Transaction;
}

function stateAt(pos: number) {
	const doc = buildDoc();
	return EditorState.create({
		schema,
		doc,
		selection: TextSelection.create(doc, pos),
	});
}

function getMarkRange(state: EditorState, markName: string) {
	let from: number | null = null;
	let to: number | null = null;
	state.doc.nodesBetween(0, state.doc.content.size, (node, pos) => {
		if (!node.isText) return;
		const hasMark = node.marks.some((mark) => mark.type.name === markName);
		if (!hasMark) return;
		if (from == null) from = pos;
		to = pos + node.nodeSize;
	});
	if (from == null || to == null)
		throw new Error(`mark range missing: ${markName}`);
	return { from, to };
}

const range = getMarkRange(stateAt(2), "bold");
const BOLD_START = range.from;
const BOLD_END = range.to;

describe("markdown rollover side transitions", () => {
	it("start boundary: left from inside toggles outside", () => {
		expect(
			__testing.getNextSideForArrow({
				boundary: "start",
				currentSide: "inside",
				key: "ArrowLeft",
			}),
		).toBe("outside");
	});

	it("end boundary: right from inside toggles outside", () => {
		expect(
			__testing.getNextSideForArrow({
				boundary: "end",
				currentSide: "inside",
				key: "ArrowRight",
			}),
		).toBe("outside");
	});

	it("regression: ArrowLeft from inside into start boundary stays inside", () => {
		const oldState = stateAt(BOLD_START + 1);
		const newState = stateAt(BOLD_START);
		expect(
			__testing.inferSideFromCursorMotion(
				oldState,
				newState,
				transactionWithSelectionSet(true),
				{ markType: schema.marks.bold, boundary: "start" },
			),
		).toBe("inside");
	});

	it("regression: ArrowRight into start boundary from outside resolves inside", () => {
		const oldState = stateAt(BOLD_START - 1);
		const newState = stateAt(BOLD_START);
		expect(
			__testing.inferSideFromCursorMotion(
				oldState,
				newState,
				transactionWithSelectionSet(true),
				{ markType: schema.marks.bold, boundary: "start" },
			),
		).toBe("inside");
	});

	it("returns null when selection was not set by transaction", () => {
		const oldState = stateAt(BOLD_START - 1);
		const newState = stateAt(BOLD_START);
		expect(
			__testing.inferSideFromCursorMotion(
				oldState,
				newState,
				transactionWithSelectionSet(false),
				{ markType: schema.marks.bold, boundary: "start" },
			),
		).toBeNull();
	});

	it("end boundary: moving from outside to boundary resolves inside", () => {
		const oldState = stateAt(BOLD_END + 1);
		const newState = stateAt(BOLD_END);
		expect(
			__testing.inferSideFromCursorMotion(
				oldState,
				newState,
				transactionWithSelectionSet(true),
				{ markType: schema.marks.bold, boundary: "end" },
			),
		).toBe("inside");
	});

	it("identifies right-of-delimiter positions correctly", () => {
		expect(__testing.isCursorRightOfDelimiter("start", "inside")).toBe(true);
		expect(__testing.isCursorRightOfDelimiter("end", "outside")).toBe(true);
		expect(__testing.isCursorRightOfDelimiter("start", "outside")).toBe(false);
		expect(__testing.isCursorRightOfDelimiter("end", "inside")).toBe(false);
	});
});
