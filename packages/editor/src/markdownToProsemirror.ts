import type { JSONContent } from "@tiptap/core";
import type {
	Element as HastElement,
	Root as HastRoot,
	RootContent,
} from "hast";
import { fromHtml } from "hast-util-from-html";
import type {
	AlignType,
	Content,
	Image,
	Link,
	List,
	ListItem,
	Paragraph,
	Root,
	Table,
	TableCell,
	TableRow,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { type Plugin, unified } from "unified";
import { visit } from "unist-util-visit";
import { splitVerbatimFrontMatterBlock } from "./frontMatter";
import { wikiDisplayNameForTarget } from "./markdownPath";

// Convert Markdown (string) -> TipTap JSONContent (ProseMirror document)
export function markdownToTiptapDoc(markdown: string): JSONContent {
	const split = splitVerbatimFrontMatterBlock(markdown);
	const frontMatter = split?.frontMatter ?? null;
	const body = split?.body ?? markdown;
	const input = rawMarkdownAddEmptyMarkers(body);
	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm, { singleTilde: false })
		.use(remarkRemoveEmptyMarkers);
	const parsed = processor.parse(input);
	const tree = processor.runSync(parsed) as Root;
	const content = normalizeBlockContent(tree.children).flatMap((node) =>
		blockToPM(node, input),
	);
	if (frontMatter !== null) {
		content.unshift({ type: "frontMatter", attrs: { raw: frontMatter } });
	}
	return {
		type: "doc",
		content,
	} satisfies JSONContent;
}

function normalizeBlockContent(children: Content[]): Content[] {
	// mdast root.children are already block-level. Return as-is for now.
	return children;
}

function blockToPM(node: Content, markdown: string): JSONContent[] {
	switch (node.type) {
		case "paragraph": {
			if (node.children.some((child) => child.type === "image")) {
				return splitParagraphAroundImages(node.children, markdown);
			}
			const paragraphHtml = node.children.every(
				(child) => child.type === "html",
			)
				? node.children.map((child) => child.value).join("")
				: null;
			if (paragraphHtml) {
				const embed = htmlToEmbed(paragraphHtml);
				if (embed) return [embed];
			}

			return [
				{
					type: "paragraph",
					content: inlineToPM(node.children ?? [], markdown),
				},
			];
		}
		case "heading":
			return [
				{
					type: "heading",
					attrs: { level: node.depth ?? 1 },
					content: inlineToPM(node.children ?? [], markdown),
				},
			];
		case "blockquote":
			return [
				{
					type: "blockquote",
					content: (node.children ?? []).flatMap((n) =>
						blockToPM(n as Content, markdown),
					),
				},
			];
		case "code":
			return [
				{
					type: "codeBlock",
					attrs: { language: node.lang ?? null },
					content: node.value ? [{ type: "text", text: node.value }] : [],
				},
			];
		case "thematicBreak":
			return [{ type: "horizontalRule" }];
		case "list": {
			const list = node as List;
			if (list.ordered) {
				// Ordered list: ignore any task checkbox semantics
				return [
					{
						type: "orderedList",
						attrs: { start: list.start ?? 1 },
						content: list.children.flatMap((li) =>
							listItemToPM(li as ListItem, /* allowChecked */ false, markdown),
						),
					},
				];
			}

			// Bullet list: allow listItem.checked to flow into attrs.checked
			return [
				{
					type: "bulletList",
					content: list.children.flatMap((li) =>
						listItemToPM(li as ListItem, /* allowChecked */ true, markdown),
					),
				},
			];
		}
		case "html": {
			// Parse HTML to extract known block nodes, fallback to text for everything else
			const raw = node.value ?? "";
			if (raw.trim() === "") return [];

			try {
				const hastTree = fromHtml(raw, { fragment: true });
				const embed = hastToEmbed(hastTree);
				if (embed) {
					return [embed];
				}
				const images = extractImagesFromHast(hastTree);
				if (images.length > 0) {
					return images;
				}
			} catch {
				// If parsing fails, fall through to text fallback
			}

			// Fallback: keep raw HTML as a text paragraph to avoid data loss
			return [
				{
					type: "paragraph",
					content: [{ type: "text", text: raw }],
				},
			];
		}
		case "table":
			return tableToPM(node as Table, markdown);
		case "tableRow":
		case "tableCell":
			return [];
		case "image": {
			return imageToPM(node as Image);
		}
		default: {
			// Unknown block: try to stringify inline if possible or drop.
			// For safety, don’t throw; produce nothing.
			return [];
		}
	}
}

// Images are block nodes in the editor schema, so mixed Markdown paragraphs
// become image blocks with schema-valid paragraphs for the surrounding inline runs.
function splitParagraphAroundImages(
	children: Content[],
	markdown: string,
): JSONContent[] {
	const blocks: JSONContent[] = [];
	let run: Content[] = [];
	const flushRun = () => {
		const content = inlineToPM(trimInlineRun(run), markdown);
		run = [];
		if (content.length > 0) blocks.push({ type: "paragraph", content });
	};

	for (const child of children) {
		if (child.type === "image") {
			flushRun();
			blocks.push(...imageToPM(child));
		} else {
			run.push(child);
		}
	}
	flushRun();
	return blocks;
}

function trimInlineRun(run: Content[]): Content[] {
	const trimmed = [...run];
	const first = trimmed[0];
	if (first?.type === "text") {
		const value = first.value.trimStart();
		if (value) trimmed[0] = { ...first, value };
		else trimmed.shift();
	}
	const last = trimmed[trimmed.length - 1];
	if (last?.type === "text") {
		const value = last.value.trimEnd();
		if (value) trimmed[trimmed.length - 1] = { ...last, value };
		else trimmed.pop();
	}
	return trimmed;
}

function tableToPM(tableNode: Table, markdown: string): JSONContent[] {
	if (!tableNode.children.length) return [];
	const rows = tableNode.children.map((row, rowIndex) =>
		tableRowToPM(row, rowIndex === 0, tableNode.align ?? [], markdown),
	);
	return [
		{
			type: "table",
			content: rows,
		},
	];
}

function tableRowToPM(
	row: TableRow,
	isHeaderRow: boolean,
	align: AlignType[],
	markdown: string,
): JSONContent {
	return {
		type: "tableRow",
		content: row.children.map((cell, columnIndex) =>
			tableCellToPM(cell, isHeaderRow, align[columnIndex] ?? null, markdown),
		),
	};
}

function tableCellToPM(
	cell: TableCell,
	isHeaderCell: boolean,
	align: AlignType,
	markdown: string,
): JSONContent {
	const inlineContent = inlineToPM(cell.children ?? [], markdown);
	const paragraph: JSONContent = { type: "paragraph" };
	if (inlineContent.length > 0) {
		paragraph.content = inlineContent;
	}
	return {
		type: isHeaderCell ? "tableHeader" : "tableCell",
		attrs: { align },
		content: [paragraph],
	};
}

function hastToEmbed(root: HastRoot): JSONContent | null {
	const children = root.children.filter(hasMeaningfulHtml);
	if (children.length !== 1) return null;
	const [node] = children;
	if (!isHastElement(node)) return null;

	const tagName = node.tagName.toLowerCase();
	if (node.children.some(hasMeaningfulHtml)) return null;

	if (tagName === "iframe") {
		const src = getStringProperty(node.properties?.src);
		if (!isValidIframeEmbedSrc(src)) return null;
		return {
			type: "embed",
			attrs: {
				kind: "iframe",
				src,
			},
		};
	}

	return null;
}

const BLOCKED_IFRAME_SCHEME = /^(file:|data:|javascript:|hubble-asset:)/i;
const LOCAL_IFRAME_SRC = /^(\.{1,2}\/|[^:/\\]+(?:\/|$)).*\.html(?:[?#].*)?$/i;

function getStringProperty(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	return "";
}

function isValidIframeEmbedSrc(src: string): boolean {
	if (!src.trim()) return false;
	if (BLOCKED_IFRAME_SCHEME.test(src)) {
		return false;
	}
	if (src.startsWith("/") || src.startsWith("\\") || src.startsWith("//")) {
		return false;
	}
	return LOCAL_IFRAME_SRC.test(src);
}

function isHastElement(node: RootContent): node is HastElement {
	return node.type === "element";
}

function hasMeaningfulHtml(node: RootContent): boolean {
	return node.type !== "text" || node.value.trim() !== "";
}

function listItemToPM(
	li: ListItem,
	allowChecked: boolean,
	markdown: string,
): JSONContent[] {
	// mdast listItem children may be paragraphs and nested lists.
	const blocks = (li.children ?? []) as Content[];
	const first = blocks[0];
	const paragraphContent =
		first && first.type === "paragraph"
			? inlineToPM(first.children ?? [], markdown)
			: [];
	const restBlocks = (
		first && first.type === "paragraph" ? blocks.slice(1) : blocks
	).flatMap((node) => blockToPM(node, markdown));
	const content: JSONContent[] = [];
	content.push({ type: "paragraph", content: paragraphContent });
	content.push(...restBlocks);

	const checkedAttr = allowChecked && li.checked != null ? !!li.checked : null;
	return [
		{
			type: "listItem",
			attrs: { checked: checkedAttr },
			content,
		},
	];
}

function imageToPM(imageNode: Image): JSONContent[] {
	if (!imageNode.url) return [];
	return [
		{
			type: "image",
			attrs: {
				src: imageNode.url || "",
				alt: imageNode.alt || "",
				title: imageNode.title || undefined,
			},
		},
	];
}

function htmlToEmbed(raw: string | undefined): JSONContent | null {
	if (!raw?.trim()) return null;
	try {
		return hastToEmbed(fromHtml(raw, { fragment: true }));
	} catch {
		return null;
	}
}

function inlineToPM(children: Content[], markdown: string): JSONContent[] {
	const out: JSONContent[] = [];
	for (const child of children ?? []) {
		switch (child.type) {
			case "text":
				if (child.value && child.value.length > 0) {
					out.push(...textToPM(child.value));
				}
				break;
			case "strong":
				out.push(
					...applyMark(inlineToPM(child.children ?? [], markdown), "bold"),
				);
				break;
			case "emphasis":
				out.push(
					...applyMark(inlineToPM(child.children ?? [], markdown), "italic"),
				);
				break;
			case "delete":
				out.push(
					...applyMark(inlineToPM(child.children ?? [], markdown), "strike"),
				);
				break;
			case "inlineCode":
				if (child.value) {
					out.push({
						type: "text",
						text: child.value,
						marks: [{ type: "code" }],
					});
				}
				break;
			case "break":
				out.push({ type: "hardBreak" });
				break;
			case "link":
				out.push(
					...applyMark(
						inlineToPM(child.children ?? [], markdown),
						"link",
						typeof child.url === "string"
							? {
									href: child.url,
									kind: "url",
									target: null,
									...linkMarkdownStyleAttrs(child, markdown),
								}
							: undefined,
					),
				);
				break;
			case "image":
				// Not supported; render alt text inline.
				if (child.alt) out.push({ type: "text", text: child.alt });
				break;
			case "html":
				if (child.value) out.push({ type: "text", text: child.value });
				break;
			default:
				// Unknown inline; ignore.
				break;
		}
	}
	return out;
}

function textToPM(text: string): JSONContent[] {
	const out: JSONContent[] = [];
	const wikiLinkPattern = /\[\[([^\]\n]+)\]\]/g;
	let lastIndex = 0;
	for (const match of text.matchAll(wikiLinkPattern)) {
		const index = match.index ?? 0;
		if (index > lastIndex) {
			out.push({ type: "text", text: text.slice(lastIndex, index) });
		}

		const rawLink = match[1] ?? "";
		const separatorIndex = rawLink.indexOf("|");
		const rawTarget =
			separatorIndex === -1 ? rawLink : rawLink.slice(0, separatorIndex);
		const rawAlias =
			separatorIndex === -1 ? "" : rawLink.slice(separatorIndex + 1);
		const target = rawTarget.trim();
		if (target) {
			out.push({
				type: "text",
				text: rawAlias || wikiDisplayNameForTarget(target),
				marks: [
					{
						type: "link",
						attrs: { href: target, kind: "wiki", target },
					},
				],
			});
		} else {
			out.push({ type: "text", text: match[0] });
		}
		lastIndex = index + match[0].length;
	}

	if (lastIndex < text.length) {
		out.push({ type: "text", text: text.slice(lastIndex) });
	}
	return out;
}

function linkMarkdownStyleAttrs(node: Link, markdown: string) {
	const raw = sourceForNode(node, markdown);
	if (raw.startsWith("<") && raw.endsWith(">")) {
		return { markdownStyle: "autolink" };
	}
	const text = node.children
		.map((child) => (child.type === "text" ? child.value : ""))
		.join("");
	if (raw === text && urlMatchesAutolinkText(node.url, text)) {
		return { markdownStyle: "bare" };
	}
	return {};
}

function sourceForNode(
	node: {
		position?: { start?: { offset?: number }; end?: { offset?: number } };
	},
	markdown: string,
) {
	const start = node.position?.start?.offset;
	const end = node.position?.end?.offset;
	if (typeof start !== "number" || typeof end !== "number") return "";
	return markdown.slice(start, end);
}

function urlMatchesAutolinkText(url: string, text: string) {
	return url === text || url === `mailto:${text}`;
}

function applyMark(
	nodes: JSONContent[],
	markType: "bold" | "italic" | "strike" | "link",
	attrs?: Record<string, unknown>,
): JSONContent[] {
	return nodes.map((n) => {
		if (n.type === "text") {
			const marks = [
				...(n.marks ?? []),
				attrs ? { type: markType, attrs } : { type: markType },
			];
			return { ...n, marks };
		}
		// For nested structures, descend if needed; most inline nodes here are text/hardBreak only.
		return n;
	});
}

const EMPTY_PARKER = "HUBBLE_INTERNAL_EMPTY_MARKER";

function rawMarkdownAddEmptyMarkers(rawMarkdown: string) {
	return (
		rawMarkdown
			// Handle empty paragraphs by double newlines
			.split("\n\n")
			.map((line) => {
				// Runs of empty lines are truncated into a single paragraph.
				// Add a marker to force each empty line to be a new paragraph.
				if (line.length === 0) {
					return EMPTY_PARKER;
				}
				return line;
			})
			.join("\n\n")
			// Handle empty checklist items by single newline
			.split("\n")
			.map((line) => {
				if (line.match(/^-\s\[(\s|x)\]\s*$/)) {
					return `${line} ${EMPTY_PARKER}`;
				}
				return line;
			})
			.join("\n")
	);
}

/**
 * Extract image nodes from a HAST tree (parsed HTML).
 */
function extractImagesFromHast(hastTree: HastRoot): JSONContent[] {
	const images: JSONContent[] = [];

	function visitHastNode(node: HastRoot | HastElement) {
		if (node.type === "element" && node.tagName === "img") {
			const attrs: {
				src?: string;
				alt?: string;
				title?: string;
				width?: number;
				height?: number;
			} = {};
			if (node.properties?.src) attrs.src = String(node.properties.src);
			if (node.properties?.alt) attrs.alt = String(node.properties.alt);
			if (node.properties?.title) attrs.title = String(node.properties.title);
			if (node.properties?.width)
				attrs.width = Number(node.properties.width) || undefined;
			if (node.properties?.height)
				attrs.height = Number(node.properties.height) || undefined;

			images.push({ type: "image", attrs });
		}

		if ("children" in node && node.children) {
			for (const child of node.children) {
				if (child.type === "element") {
					visitHastNode(child);
				}
			}
		}
	}

	visitHastNode(hastTree);
	return images;
}

const remarkRemoveEmptyMarkers: Plugin<[]> = () => {
	return (tree) => {
		visit(tree, "paragraph", (node: Paragraph) => {
			const paragraphText = node.children
				.filter((child) => child.type === "text")
				.map((child) => child.value)
				.join("");

			if (paragraphText.includes(EMPTY_PARKER)) {
				node.children = [];
			}
		});
	};
};
