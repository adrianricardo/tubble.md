import type { JSONContent } from "@tiptap/core";
import type { LinkAttrs } from "./Link";
import { wikiDisplayNameForTarget } from "./markdownPath";

/**
 * Convert TipTap JSONContent (ProseMirror document) -> Markdown string
 * This is the reverse of remark-to-prosemirror.ts and runs synchronously.
 */
export function tiptapDocToMarkdown(doc: JSONContent): string {
	if (doc.type !== "doc" || !doc.content) {
		return "";
	}

	let frontMatter = "";
	const blocks: string[] = [];
	for (const node of doc.content) {
		if (node.type === "frontMatter") {
			if (!frontMatter && typeof node.attrs?.raw === "string") {
				frontMatter = node.attrs.raw;
			}
			continue;
		}
		blocks.push(blockToMarkdown(node));
	}
	const markdown = `${frontMatter}${blocks.join("\n\n")}`;
	if (markdown === "" || markdown.endsWith("\n")) return markdown;
	return `${markdown}\n`;
}

function blockToMarkdown(node: JSONContent): string {
	if (!node.type) return "";

	switch (node.type) {
		case "paragraph": {
			const content = inlineToMarkdown(node.content ?? []);
			// Empty paragraphs should produce a blank line
			return content || "";
		}

		case "heading": {
			const level = node.attrs?.level ?? 1;
			const content = inlineToMarkdown(node.content ?? []);
			const hashes = "#".repeat(Math.min(Math.max(level, 1), 6));
			return `${hashes} ${content}`;
		}

		case "blockquote": {
			const blockContent = (node.content ?? [])
				.map(blockToMarkdown)
				.filter(Boolean)
				.join("\n\n");
			// Add '> ' prefix to each line
			return blockContent
				.split("\n")
				.map((line) => `> ${line}`)
				.join("\n");
		}

		case "codeBlock": {
			const content =
				node.content
					?.map((child) => (child.type === "text" ? (child.text ?? "") : ""))
					.join("") ?? "";
			const language =
				typeof node.attrs?.language === "string" ? node.attrs.language : "";
			return `\`\`\`${language}\n${content}\n\`\`\``;
		}

		case "horizontalRule": {
			return "---";
		}

		case "orderedList": {
			const start = node.attrs?.start ?? 1;
			return (node.content ?? [])
				.map((item, index) => listItemToMarkdown(item, start + index))
				.filter(Boolean)
				.join("\n");
		}

		case "bulletList": {
			return (node.content ?? [])
				.map((item) => listItemToMarkdown(item))
				.filter(Boolean)
				.join("\n");
		}

		case "image": {
			const src = node.attrs?.src ?? "";
			const alt = node.attrs?.alt ?? "";
			if (!src || node.attrs?.uploadId) return "";

			return `![${alt}](${src})`;
		}

		case "embed": {
			const src = String(node.attrs?.src ?? "");
			if (!isValidIframeEmbedSrc(src)) return "";
			return `<iframe src="${escapeHtmlAttr(src)}"></iframe>`;
		}

		case "table": {
			return tableToMarkdown(node);
		}

		default:
			return "";
	}
}

const BLOCKED_IFRAME_SCHEME = /^(file:|data:|javascript:|hubble-asset:)/i;
const LOCAL_IFRAME_SRC = /^(\.{1,2}\/|[^:/\\]+(?:\/|$)).*\.html(?:[?#].*)?$/i;

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

function escapeHtmlAttr(value: string) {
	return value
		.split("&")
		.join("&amp;")
		.split('"')
		.join("&quot;")
		.split("<")
		.join("&lt;");
}

function getLinkAttrs(node: JSONContent | undefined): LinkAttrs | null {
	if (!node?.marks) return null;
	const linkMark = node.marks.find((mark) => mark.type === "link");
	if (!linkMark) return null;
	const attrs = linkMark.attrs as
		| {
				href?: unknown;
				kind?: unknown;
				target?: unknown;
				markdownStyle?: unknown;
		  }
		| undefined;
	if (typeof attrs?.href !== "string") return null;
	return {
		href: attrs.href,
		kind: attrs.kind === "wiki" ? "wiki" : "url",
		target: typeof attrs.target === "string" ? attrs.target : null,
		markdownStyle:
			attrs.markdownStyle === "bare" || attrs.markdownStyle === "autolink"
				? attrs.markdownStyle
				: null,
	};
}

function linkKey(attrs: LinkAttrs | null) {
	if (!attrs) return null;
	return `${attrs.kind}\u0000${attrs.href}\u0000${attrs.target ?? ""}\u0000${attrs.markdownStyle ?? ""}`;
}

function removeLinkMark(node: JSONContent): JSONContent {
	if (!node.marks) return node;
	return {
		...node,
		marks: node.marks.filter((mark) => mark.type !== "link"),
	};
}

function listItemToMarkdown(item: JSONContent, number?: number): string {
	if (item.type !== "listItem") return "";

	const isBullet = number === undefined;
	const content = (item.content ?? [])
		.map((node, index) => {
			if (index === 0 && node.type === "paragraph") {
				// First paragraph content goes inline with the bullet/number or checkbox
				return inlineToMarkdown(node.content ?? []);
			}
			// Additional blocks are indented
			return blockToMarkdown(node)
				.split("\n")
				.map((line) => `  ${line}`)
				.join("\n");
		})
		.filter(Boolean)
		.join("\n");

	// If this is a bullet item and it has a checked attribute (true/false), render as a task item
	const hasCheckedAttr = item.attrs && "checked" in item.attrs;
	const checked = hasCheckedAttr ? item.attrs?.checked : null;

	if (isBullet && checked !== null && checked !== undefined) {
		const checkbox = checked ? "[x]" : "[ ]";
		return `- ${checkbox} ${content}`;
	}

	const prefix = isBullet ? "-" : `${number}.`;
	return `${prefix} ${content}`;
}

function tableToMarkdown(table: JSONContent): string {
	const rows = (table.content ?? []).filter((row) => row.type === "tableRow");
	if (rows.length === 0) return "";

	const columnCount = rows.reduce(
		(max, row) => Math.max(max, row.content?.length ?? 0),
		0,
	);
	if (columnCount === 0) return "";

	const headerCells = rows[0].content ?? [];
	const header = serializeTableRow(headerCells, columnCount);
	const separator = Array.from({ length: columnCount }, (_, index) =>
		tableAlignSeparator(headerCells[index]?.attrs?.align),
	);
	const body = rows
		.slice(1)
		.map((row) => serializeTableRow(row.content ?? [], columnCount));

	return [header, separator, ...body]
		.map((cells) => `| ${cells.join(" | ")} |`)
		.join("\n");
}

function serializeTableRow(
	cells: JSONContent[],
	columnCount: number,
): string[] {
	return Array.from({ length: columnCount }, (_, index) =>
		tableCellToMarkdown(cells[index]),
	);
}

function tableCellToMarkdown(cell: JSONContent | undefined): string {
	if (!cell) return "";
	const blocks = cell.content ?? [];
	return blocks.map(tableCellBlockToMarkdown).filter(Boolean).join(" ");
}

function tableCellBlockToMarkdown(node: JSONContent): string {
	if (node.type === "paragraph") {
		return escapeTableCellPipes(
			inlineToMarkdown(node.content ?? [], { hardBreak: "space" }),
		);
	}
	return escapeTableCellPipes(blockToMarkdown(node).replace(/\s*\n+\s*/g, " "));
}

function tableAlignSeparator(align: unknown) {
	switch (align) {
		case "left":
			return ":---";
		case "center":
			return ":---:";
		case "right":
			return "---:";
		default:
			return "---";
	}
}

function escapeTableCellPipes(value: string) {
	return value.replace(/(?<!\\)\|/g, "\\|");
}

function inlineToMarkdown(
	nodes: JSONContent[],
	options: { hardBreak?: "markdown" | "space" } = {},
): string {
	return inlineNodesToMarkdown(normalizeInlineMarkWhitespace(nodes), options);
}

function inlineNodesToMarkdown(
	nodes: JSONContent[],
	options: { hardBreak?: "markdown" | "space" } = {},
): string {
	let result = "";
	for (let i = 0; i < nodes.length; ) {
		const node = nodes[i];
		const delimitedMark = getDelimitedMark(node, nodes[i + 1]);
		if (delimitedMark) {
			let j = i;
			const grouped: JSONContent[] = [];
			while (
				j < nodes.length &&
				hasMark(nodes[j]?.marks ?? [], delimitedMark)
			) {
				grouped.push(removeMark(nodes[j] as JSONContent, delimitedMark));
				j += 1;
			}
			const delimiter = delimiterForMark(delimitedMark);
			result += `${delimiter}${inlineNodesToMarkdown(grouped, options)}${delimiter}`;
			i = j;
			continue;
		}

		const attrs = getLinkAttrs(node);
		const key = linkKey(attrs);
		if (!attrs || !key) {
			result += nodeToMarkdown(node, options);
			i += 1;
			continue;
		}

		let j = i;
		const grouped: JSONContent[] = [];
		while (j < nodes.length && linkKey(getLinkAttrs(nodes[j])) === key) {
			grouped.push(removeLinkMark(nodes[j]));
			j += 1;
		}
		const text = inlineNodesToMarkdown(grouped, options);
		if (attrs.kind === "wiki") {
			const target = attrs.target || attrs.href;
			const defaultText = wikiDisplayNameForTarget(target);
			result +=
				text === defaultText
					? `[[${target}]]`
					: `[[${target}|${escapeWikiAlias(text)}]]`;
		} else if (
			attrs.markdownStyle === "bare" &&
			text === autolinkDisplayText(attrs)
		) {
			result += text;
		} else if (
			attrs.markdownStyle === "autolink" &&
			text === autolinkDisplayText(attrs)
		) {
			result += `<${text}>`;
		} else {
			result += `[${text}](${attrs.href})`;
		}
		i = j;
	}
	return result;
}

const BOUNDARY_SENSITIVE_MARKS = new Set(["bold", "italic", "strike", "link"]);
const DELIMITED_MARK_ORDER = ["bold", "italic", "strike"] as const;
type DelimitedMarkType = (typeof DELIMITED_MARK_ORDER)[number];
type Mark = NonNullable<JSONContent["marks"]>[number];

function getDelimitedMark(
	node: JSONContent | undefined,
	nextNode: JSONContent | undefined,
) {
	const marks = node?.marks ?? [];
	const nextMarks = nextNode?.marks ?? [];
	const continuingType = DELIMITED_MARK_ORDER.find(
		(markType) =>
			marks.some((mark) => mark.type === markType) &&
			nextMarks.some((mark) => mark.type === markType),
	);
	const type =
		continuingType ??
		DELIMITED_MARK_ORDER.find((markType) =>
			marks.some((mark) => mark.type === markType),
		);
	return type ? marks.find((mark) => mark.type === type) : null;
}

function delimiterForMark(mark: Mark) {
	switch (mark.type as DelimitedMarkType) {
		case "bold":
			return "**";
		case "italic":
			return "*";
		case "strike":
			return "~~";
	}
}

function removeMark(node: JSONContent, mark: Mark): JSONContent {
	if (!node.marks) return node;
	return {
		...node,
		marks: node.marks.filter((candidate) => !isSameMark(candidate, mark)),
	};
}

// Markdown emphasis delimiters cannot touch whitespace on their inner edge.
// Split boundary whitespace away from sensitive marks while retaining marks on
// whitespace between two nodes in the same run.
function normalizeInlineMarkWhitespace(nodes: JSONContent[]) {
	return nodes.flatMap((node, index) => {
		if (node.type !== "text" || !node.text || !node.marks?.length) {
			return [node];
		}
		if (node.marks.some((mark) => mark.type === "code")) return [node];

		const previousMarks = nodes[index - 1]?.marks ?? [];
		const nextMarks = nodes[index + 1]?.marks ?? [];
		if (/^[ \t]+$/.test(node.text)) {
			return [
				{
					...node,
					marks: boundaryMarks(
						boundaryMarks(node.marks, previousMarks),
						nextMarks,
					),
				},
			];
		}

		const leadingWhitespace = node.text.match(/^[ \t]+/)?.[0] ?? "";
		const trailingWhitespace = node.text.match(/[ \t]+$/)?.[0] ?? "";
		let remaining = node.text;
		const parts: JSONContent[] = [];
		if (leadingWhitespace && leadingWhitespace.length < remaining.length) {
			parts.push({
				...node,
				text: leadingWhitespace,
				marks: boundaryMarks(node.marks, previousMarks),
			});
			remaining = remaining.slice(leadingWhitespace.length);
		}

		const trailingLength =
			trailingWhitespace && trailingWhitespace.length < remaining.length
				? trailingWhitespace.length
				: 0;
		const content = trailingLength
			? remaining.slice(0, -trailingLength)
			: remaining;
		if (content) parts.push({ ...node, text: content });
		if (trailingLength) {
			parts.push({
				...node,
				text: remaining.slice(-trailingLength),
				marks: boundaryMarks(node.marks, nextMarks),
			});
		}
		return parts;
	});
}

function boundaryMarks(
	currentMarks: NonNullable<JSONContent["marks"]>,
	neighborMarks: NonNullable<JSONContent["marks"]>,
) {
	return currentMarks.filter(
		(mark) =>
			!BOUNDARY_SENSITIVE_MARKS.has(mark.type ?? "") ||
			hasMark(neighborMarks, mark),
	);
}

function hasMark(marks: NonNullable<JSONContent["marks"]>, mark: Mark) {
	return marks.some((candidate) => isSameMark(candidate, mark));
}

function isSameMark(left: Mark, right: Mark) {
	return (
		left.type === right.type &&
		JSON.stringify(left.attrs ?? null) === JSON.stringify(right.attrs ?? null)
	);
}

function autolinkDisplayText(attrs: LinkAttrs) {
	return attrs.href.startsWith("mailto:") ? attrs.href.slice(7) : attrs.href;
}

function nodeToMarkdown(
	node: JSONContent,
	options: { hardBreak?: "markdown" | "space" } = {},
): string {
	if (node.type === "text") {
		const text = node.text ?? "";
		return node.marks?.some((mark) => mark.type === "code")
			? `\`${text}\``
			: escapeMarkdownText(text);
	}
	if (node.type === "hardBreak") {
		return options.hardBreak === "space" ? " " : "  \n";
	}
	return "";
}

function escapeMarkdownText(text: string) {
	return text.replace(/\\/g, "\\\\").replace(/\*/g, "\\*");
}

function escapeWikiAlias(alias: string) {
	return alias.split("|").join("\\|");
}
