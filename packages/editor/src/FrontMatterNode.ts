import { mergeAttributes, Node } from "@tiptap/core";

export const FrontMatterExtension = Node.create({
	name: "frontMatter",
	group: "block",
	atom: true,
	selectable: false,

	addAttributes() {
		return {
			raw: {
				default: "",
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: "div[data-front-matter]",
				getAttrs: (element) => ({
					raw: (element as HTMLElement).getAttribute("data-raw") ?? "",
				}),
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		const raw =
			typeof HTMLAttributes.raw === "string" ? HTMLAttributes.raw : "";
		return [
			"div",
			mergeAttributes({
				"data-front-matter": "true",
				"data-raw": raw,
				hidden: "true",
			}),
		];
	},
});
