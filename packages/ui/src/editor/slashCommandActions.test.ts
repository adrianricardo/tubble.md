// @vitest-environment happy-dom

import { Editor, type JSONContent, Node } from "@tiptap/core";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import {
	applySlashCommand,
	findSlashToken,
	type SlashToken,
} from "./slashCommandActions";

const editors: Editor[] = [];
const CheckedListItem = ListItem.extend({
	addAttributes() {
		return {
			checked: {
				default: null,
			},
		};
	},
});
const Table = Node.create({
	name: "table",
	group: "block",
	content: "tableRow+",
	renderHTML() {
		return ["table", ["tbody", 0]];
	},
});
const TableRow = Node.create({
	name: "tableRow",
	content: "(tableCell | tableHeader)*",
	renderHTML() {
		return ["tr", 0];
	},
});
const TableHeader = Node.create({
	name: "tableHeader",
	content: "paragraph",
	renderHTML() {
		return ["th", 0];
	},
});
const TableCell = Node.create({
	name: "tableCell",
	content: "paragraph",
	renderHTML() {
		return ["td", 0];
	},
});

afterEach(() => {
	for (const editor of editors) editor.destroy();
	editors.length = 0;
});

describe("slash command token detection", () => {
	it("detects slash commands at the start of a text block", () => {
		const editor = createEditor(docWithParagraph("/h"));

		expect(findSlashToken(editor)).toMatchObject({ query: "h" });
	});

	it("detects slash commands after whitespace", () => {
		const editor = createEditor(docWithParagraph("hello /h"));

		expect(findSlashToken(editor)).toMatchObject({ query: "h" });
	});

	it("does not detect slash commands inside phrases or paths", () => {
		expect(findSlashToken(createEditor(docWithParagraph("hello/there")))).toBe(
			null,
		);
		expect(findSlashToken(createEditor(docWithParagraph("docs/foo")))).toBe(
			null,
		);
	});
});

describe("slash command document actions", () => {
	it("converts an empty slash paragraph in place", () => {
		const editor = createEditor(docWithParagraph("/h2"));
		const token = expectSlashToken(editor);

		applySlashCommand(editor, token, "heading2");

		expect(editor.getJSON()).toMatchObject({
			type: "doc",
			content: [
				{ type: "heading", attrs: { level: 2 } },
				{ type: "paragraph" },
			],
		});
	});

	it("inserts a new block after non-empty slash paragraphs", () => {
		const editor = createEditor(docWithParagraph("text /h2"));
		const token = expectSlashToken(editor);

		applySlashCommand(editor, token, "heading2");

		expect(editor.getJSON()).toMatchObject({
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "text " }] },
				{ type: "heading", attrs: { level: 2 } },
				{ type: "paragraph" },
			],
		});
	});

	it("creates unchecked task list items", () => {
		const editor = createEditor(docWithParagraph("/todo"));
		const token = expectSlashToken(editor);

		applySlashCommand(editor, token, "taskList");

		expect(editor.getJSON()).toMatchObject({
			type: "doc",
			content: [
				{
					type: "bulletList",
					content: [
						{
							type: "listItem",
							attrs: { checked: false },
							content: [{ type: "paragraph" }],
						},
					],
				},
				{ type: "paragraph" },
			],
		});
	});

	it("inserts a paragraph after a divider", () => {
		const editor = createEditor(docWithParagraph("/divider"));
		const token = expectSlashToken(editor);

		applySlashCommand(editor, token, "divider");

		expect(editor.getJSON()).toMatchObject({
			type: "doc",
			content: [{ type: "horizontalRule" }, { type: "paragraph" }],
		});
	});

	it("inserts a 3-column table with a header row", () => {
		const editor = createEditor(docWithParagraph("/table"));
		const token = expectSlashToken(editor);

		applySlashCommand(editor, token, "table");

		expect(editor.getJSON()).toMatchObject({
			type: "doc",
			content: [
				{
					type: "table",
					content: [
						{
							type: "tableRow",
							content: [
								{ type: "tableHeader", content: [{ type: "paragraph" }] },
								{ type: "tableHeader", content: [{ type: "paragraph" }] },
								{ type: "tableHeader", content: [{ type: "paragraph" }] },
							],
						},
						{
							type: "tableRow",
							content: [
								{ type: "tableCell", content: [{ type: "paragraph" }] },
								{ type: "tableCell", content: [{ type: "paragraph" }] },
								{ type: "tableCell", content: [{ type: "paragraph" }] },
							],
						},
					],
				},
				{ type: "paragraph" },
			],
		});
		expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
		expect(editor.state.selection.$from.node(-1).type.name).toBe("tableHeader");
	});

	it("toggles strikethrough for following typed text", () => {
		const editor = createEditor(docWithParagraph("/strike"));
		const token = expectSlashToken(editor);

		applySlashCommand(editor, token, "strike");

		editor.commands.insertContent("next");
		expect(editor.getJSON()).toMatchObject({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "next",
							marks: [{ type: "strike" }],
						},
					],
				},
			],
		});
	});
});

function createEditor(content: JSONContent) {
	const editor = new Editor({
		element: document.createElement("div"),
		extensions: [
			StarterKit.configure({
				bulletList: false,
				orderedList: false,
				listItem: false,
			}),
			BulletList,
			OrderedList,
			CheckedListItem,
			Table,
			TableRow,
			TableHeader,
			TableCell,
		],
		content,
	});
	editors.push(editor);
	Object.defineProperty(editor, "isFocused", { value: true });
	editor.view.dispatch(
		editor.state.tr.setSelection(
			TextSelection.create(editor.state.doc, editor.state.doc.content.size - 1),
		),
	);
	return editor;
}

function expectSlashToken(editor: Editor): SlashToken {
	const token = findSlashToken(editor);
	expect(token).not.toBeNull();
	if (!token) throw new Error("Expected slash token");
	return token;
}

function docWithParagraph(text: string): JSONContent {
	return {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: text ? [{ type: "text", text }] : undefined,
			},
		],
	};
}
