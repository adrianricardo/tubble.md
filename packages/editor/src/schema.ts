import { type AnyExtension, type Extensions, getSchema } from "@tiptap/core";
import { TaskItem } from "@tiptap/extension-list";
import StarterKit from "@tiptap/starter-kit";
import { HeadingExtension } from "./Heading";
import { LinkExtension } from "./Link";
import { listExtensions } from "./List";
import { MarkdownRolloverExtension } from "./MarkdownRolloverExtension";
import { StrikethroughShortcutExtension } from "./StrikethroughShortcutExtension";

type HubbleEditorExtensionsOptions = {
	codeBlock?: AnyExtension;
};

export function createHubbleEditorExtensions(
	options: HubbleEditorExtensionsOptions = {},
): Extensions {
	return [
		StarterKit.configure({
			...(options.codeBlock ? { codeBlock: false } : {}),
			listItem: false,
		}),
		...(options.codeBlock ? [options.codeBlock] : []),
		LinkExtension,
		HeadingExtension,
		MarkdownRolloverExtension,
		StrikethroughShortcutExtension,
		...listExtensions,
		TaskItem.configure({ nested: true }),
	];
}

export function getHubbleEditorSchema() {
	return getSchema(createHubbleEditorExtensions());
}
