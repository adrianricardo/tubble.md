import { type AnyExtension, type Extensions, getSchema } from "@tiptap/core";
import { TaskItem } from "@tiptap/extension-list";
import {
	Table,
	TableCell,
	TableHeader,
	TableRow,
} from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { FrontMatterExtension } from "./FrontMatterNode";
import { HeadingExtension } from "./Heading";
import { LinkExtension } from "./Link";
import { listExtensions } from "./List";
import { MarkdownRolloverExtension } from "./MarkdownRolloverExtension";
import { StrikethroughShortcutExtension } from "./StrikethroughShortcutExtension";

type HubbleEditorExtensionsOptions = {
	codeBlock?: AnyExtension;
};

const tableCellAlignAttribute = {
	default: null,
	parseHTML: (element: HTMLElement) =>
		parseTableCellAlign(element.style.textAlign),
	renderHTML: (attrs: { align?: unknown }) => {
		const align = normalizeTableCellAlign(attrs.align);
		return align ? { style: `text-align: ${align}` } : {};
	},
};

const MarkdownTableCell = TableCell.extend({
	content: "paragraph",
	addAttributes() {
		return {
			...this.parent?.(),
			align: tableCellAlignAttribute,
		};
	},
});

const MarkdownTableHeader = TableHeader.extend({
	content: "paragraph",
	addAttributes() {
		return {
			...this.parent?.(),
			align: tableCellAlignAttribute,
		};
	},
});

export function createHubbleEditorExtensions(
	options: HubbleEditorExtensionsOptions = {},
): Extensions {
	return [
		StarterKit.configure({
			...(options.codeBlock ? { codeBlock: false } : {}),
			listItem: false,
		}),
		...(options.codeBlock ? [options.codeBlock] : []),
		FrontMatterExtension,
		LinkExtension,
		HeadingExtension,
		MarkdownRolloverExtension,
		StrikethroughShortcutExtension,
		...listExtensions,
		TaskItem.configure({ nested: true }),
		Table.configure({ renderWrapper: true, resizable: false }),
		TableRow,
		MarkdownTableHeader,
		MarkdownTableCell,
	];
}

export function getHubbleEditorSchema() {
	return getSchema(createHubbleEditorExtensions());
}

function parseTableCellAlign(value: string | null | undefined) {
	return normalizeTableCellAlign(value);
}

function normalizeTableCellAlign(value: unknown) {
	return value === "left" || value === "center" || value === "right"
		? value
		: null;
}
