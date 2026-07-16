import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { getActiveLinkRange } from "./Link";

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
		strong: {
			parseDOM: [{ tag: "strong" }],
			toDOM: () => ["strong", 0],
		},
		link: {
			attrs: {
				href: {},
				kind: { default: "url" },
				target: { default: null },
				markdownStyle: { default: null },
			},
			inclusive: true,
			parseDOM: [{ tag: "a[href]" }],
			toDOM: () => ["a", 0],
		},
	},
});

describe("getActiveLinkRange", () => {
	it("returns a zero-width active link for stored link marks", () => {
		const doc = schema.node("doc", null, [schema.node("paragraph", null)]);
		const base = EditorState.create({
			schema,
			doc,
			selection: TextSelection.create(doc, 1),
		});
		const state = base.apply(
			base.tr.addStoredMark(
				schema.marks.link.create({ href: "https://example.com" }),
			),
		);

		expect(getActiveLinkRange(state)).toEqual({
			from: 1,
			to: 1,
			href: "https://example.com",
			kind: "url",
			target: null,
		});
	});

	it("does not merge adjacent links with different identities", () => {
		const doc = schema.node("doc", null, [
			schema.node("paragraph", null, [
				schema.text("bare", [
					schema.marks.link.create({
						href: "https://example.com",
						markdownStyle: "bare",
					}),
				]),
				schema.text("autolink", [
					schema.marks.link.create({
						href: "https://example.com",
						markdownStyle: "autolink",
					}),
				]),
				schema.text("other", [
					schema.marks.link.create({ href: "https://other.example" }),
				]),
			]),
		]);
		const state = EditorState.create({
			schema,
			doc,
			selection: TextSelection.create(doc, 1),
		});

		expect(getActiveLinkRange(state)).toEqual({
			from: 1,
			to: 5,
			href: "https://example.com",
			kind: "url",
			target: null,
			markdownStyle: "bare",
		});
	});

	it("merges adjacent text nodes with the same complete link identity", () => {
		const attrs = {
			href: "Notes/Project.md",
			kind: "wiki",
			target: "Notes/Project.md",
			markdownStyle: null,
		};
		const doc = schema.node("doc", null, [
			schema.node("paragraph", null, [
				schema.text("Project", [schema.marks.link.create(attrs)]),
				schema.text(" note", [
					schema.marks.link.create(attrs),
					schema.marks.strong.create(),
				]),
			]),
		]);
		const state = EditorState.create({
			schema,
			doc,
			selection: TextSelection.create(doc, 1),
		});

		expect(getActiveLinkRange(state)).toMatchObject({ from: 1, to: 13 });
	});
});
