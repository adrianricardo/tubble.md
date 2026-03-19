import type { JSONContent } from "@tiptap/core";
import { markdownToTiptapDoc } from "./markdownToProsemirror";
import { tiptapDocToMarkdown } from "./prosemirrorToMarkdown";

export type TrackedMarkdownDocument = {
	path: string;
	markdown: string;
	revision: number;
	contentHash: string;
	updatedAt: string;
};

export type MarkdownBlockSnapshot = {
	ref: string;
	type: string;
	markdown: string;
	textPreview: string;
	level?: number;
};

type MarkdownBlockInput = {
	markdown: string;
};

export type TrackedMarkdownSnapshot = TrackedMarkdownDocument & {
	blocks: MarkdownBlockSnapshot[];
};

export type ReplaceBlockOperation = {
	op: "replace_block";
	ref: string;
	block: MarkdownBlockInput;
};

export type InsertAfterOperation = {
	op: "insert_after";
	ref: string;
	blocks: MarkdownBlockInput[];
};

export type InsertBeforeOperation = {
	op: "insert_before";
	ref: string;
	blocks: MarkdownBlockInput[];
};

export type DeleteBlockOperation = {
	op: "delete_block";
	ref: string;
};

export type ReplaceRangeOperation = {
	op: "replace_range";
	fromRef: string;
	toRef: string;
	blocks: MarkdownBlockInput[];
};

export type FindReplaceInBlockOperation = {
	op: "find_replace_in_block";
	ref: string;
	find: string;
	replace: string;
	occurrence?: "first" | "last" | "all";
};

export type MarkdownEditOperation =
	| ReplaceBlockOperation
	| InsertAfterOperation
	| InsertBeforeOperation
	| DeleteBlockOperation
	| ReplaceRangeOperation
	| FindReplaceInBlockOperation;

export type ApplyTrackedMarkdownEditRequest = {
	baseRevision: number;
	operations: MarkdownEditOperation[];
	updatedAt?: string;
};

export type ApplyTrackedMarkdownEditSuccess = {
	success: true;
	nextState: TrackedMarkdownDocument;
	snapshot: TrackedMarkdownSnapshot;
};

export type ApplyTrackedMarkdownEditFailure = {
	success: false;
	code: ApplyTrackedMarkdownEditErrorCode;
	error: string;
	snapshot: TrackedMarkdownSnapshot;
};

export type ApplyTrackedMarkdownEditResult =
	| ApplyTrackedMarkdownEditSuccess
	| ApplyTrackedMarkdownEditFailure;

type MutableTrackedBlock = {
	ref: string | null;
	node: JSONContent;
};

type ApplyTrackedMarkdownEditErrorCode =
	| "STALE_REVISION"
	| "INVALID_REF"
	| "INVALID_OPERATION"
	| "INVALID_BLOCK_MARKDOWN"
	| "FIND_NOT_FOUND";

type ApplyTrackedMarkdownEditError = {
	code: ApplyTrackedMarkdownEditErrorCode;
	error: string;
};

type ApplyOperationError = Exclude<
	ApplyTrackedMarkdownEditError,
	{ code: "STALE_REVISION" }
>;

const TEXT_PREVIEW_LIMIT = 200;

export function hashMarkdownContent(markdown: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < markdown.length; index += 1) {
		hash ^= markdown.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(36);
}

export function createTrackedMarkdownDocument(input: {
	path: string;
	markdown: string;
	updatedAt?: string;
}): TrackedMarkdownDocument {
	return buildTrackedMarkdownDocument(
		input.path,
		input.markdown,
		1,
		input.updatedAt,
	);
}

export function updateTrackedMarkdownDocument(
	current: TrackedMarkdownDocument | null,
	input: {
		path: string;
		markdown: string;
		updatedAt?: string;
	},
): TrackedMarkdownDocument {
	if (!current || current.path !== input.path) {
		return createTrackedMarkdownDocument(input);
	}

	if (current.markdown === input.markdown) {
		return current;
	}
	return buildTrackedMarkdownDocument(
		input.path,
		input.markdown,
		current.revision + 1,
		input.updatedAt,
	);
}

export function buildTrackedMarkdownSnapshot(
	document: TrackedMarkdownDocument,
): TrackedMarkdownSnapshot {
	return {
		...document,
		blocks: buildMarkdownBlockSnapshot(document.markdown),
	};
}

export function buildMarkdownBlockSnapshot(
	markdown: string,
): MarkdownBlockSnapshot[] {
	return getTopLevelBlocks(markdown).map((block, index) => ({
		ref: `b${index + 1}`,
		type: block.type ?? "unknown",
		markdown: serializeBlock(block),
		textPreview: extractTextPreview(block),
		...(typeof block.attrs?.level === "number"
			? { level: block.attrs.level }
			: {}),
	}));
}

export function applyTrackedMarkdownEdit(
	current: TrackedMarkdownDocument,
	request: ApplyTrackedMarkdownEditRequest,
): ApplyTrackedMarkdownEditResult {
	const currentSnapshot = buildTrackedMarkdownSnapshot(current);
	if (request.baseRevision !== current.revision) {
		return {
			success: false,
			...createEditError("STALE_REVISION", "Document revision is stale."),
			snapshot: currentSnapshot,
		};
	}

	if (request.operations.length === 0) {
		return {
			success: false,
			...createEditError(
				"INVALID_OPERATION",
				"At least one edit operation is required.",
			),
			snapshot: currentSnapshot,
		};
	}

	const blocks = toMutableTrackedBlocks(current.markdown);
	for (const operation of request.operations) {
		const error = applyOperation(blocks, operation);
		if (error) {
			return {
				success: false,
				...error,
				snapshot: currentSnapshot,
			};
		}
	}

	const nextMarkdown = serializeDocumentBlocks(
		blocks.map((block) => block.node),
	);
	const nextState = updateTrackedMarkdownDocument(current, {
		path: current.path,
		markdown: nextMarkdown,
		updatedAt: request.updatedAt,
	});
	return {
		success: true,
		nextState,
		snapshot: buildTrackedMarkdownSnapshot(nextState),
	};
}

function applyOperation(
	blocks: MutableTrackedBlock[],
	operation: MarkdownEditOperation,
): ApplyOperationError | null {
	switch (operation.op) {
		case "replace_block": {
			const index = findTrackedBlockIndex(blocks, operation.ref);
			if (index < 0) {
				return invalidRef(operation.ref);
			}
			const parsed = parseSingleBlock(operation.block.markdown);
			if (!parsed.success) {
				return parsed;
			}
			blocks[index] = {
				ref: blocks[index]?.ref ?? null,
				node: parsed.block,
			};
			return null;
		}
		case "insert_after": {
			const index = findTrackedBlockIndex(blocks, operation.ref);
			if (index < 0) {
				return invalidRef(operation.ref);
			}
			const parsed = parseInsertedBlocks(operation.blocks);
			if (!parsed.success) {
				return parsed;
			}
			blocks.splice(index + 1, 0, ...parsed.blocks);
			return null;
		}
		case "insert_before": {
			const index = findTrackedBlockIndex(blocks, operation.ref);
			if (index < 0) {
				return invalidRef(operation.ref);
			}
			const parsed = parseInsertedBlocks(operation.blocks);
			if (!parsed.success) {
				return parsed;
			}
			blocks.splice(index, 0, ...parsed.blocks);
			return null;
		}
		case "delete_block": {
			const index = findTrackedBlockIndex(blocks, operation.ref);
			if (index < 0) {
				return invalidRef(operation.ref);
			}
			blocks.splice(index, 1);
			return null;
		}
		case "replace_range": {
			const fromIndex = findTrackedBlockIndex(blocks, operation.fromRef);
			if (fromIndex < 0) {
				return invalidRef(operation.fromRef);
			}
			const toIndex = findTrackedBlockIndex(blocks, operation.toRef);
			if (toIndex < 0) {
				return invalidRef(operation.toRef);
			}
			if (fromIndex > toIndex) {
				return createEditError(
					"INVALID_OPERATION",
					"replace_range requires fromRef to appear before toRef.",
				);
			}
			const parsed = parseInsertedBlocks(operation.blocks);
			if (!parsed.success) {
				return parsed;
			}
			blocks.splice(fromIndex, toIndex - fromIndex + 1, ...parsed.blocks);
			return null;
		}
		case "find_replace_in_block": {
			const index = findTrackedBlockIndex(blocks, operation.ref);
			if (index < 0) {
				return invalidRef(operation.ref);
			}
			if (operation.find.length === 0) {
				return createEditError(
					"INVALID_OPERATION",
					"find_replace_in_block requires a non-empty find string.",
				);
			}

			const block = blocks[index];
			if (!block) {
				return invalidRef(operation.ref);
			}

			const currentMarkdown = serializeBlock(block.node);
			const nextMarkdown = replaceInMarkdownBlock(
				currentMarkdown,
				operation.find,
				operation.replace,
				operation.occurrence ?? "first",
			);
			if (nextMarkdown === null) {
				return createEditError(
					"FIND_NOT_FOUND",
					"find_replace_in_block could not find the requested text.",
				);
			}

			const parsed = parseSingleBlock(nextMarkdown);
			if (!parsed.success) {
				return parsed;
			}

			blocks[index] = {
				ref: block.ref,
				node: parsed.block,
			};
			return null;
		}
	}
}

function toMutableTrackedBlocks(markdown: string): MutableTrackedBlock[] {
	return getTopLevelBlocks(markdown).map((node, index) => ({
		ref: `b${index + 1}`,
		node,
	}));
}

function getTopLevelBlocks(markdown: string): JSONContent[] {
	const document = markdownToTiptapDoc(markdown);
	return document.content ? [...document.content] : [];
}

function serializeDocumentBlocks(blocks: JSONContent[]): string {
	return tiptapDocToMarkdown({
		type: "doc",
		content: blocks,
	});
}

function serializeBlock(block: JSONContent): string {
	return serializeDocumentBlocks([block]);
}

function parseSingleBlock(markdown: string):
	| {
			success: true;
			block: JSONContent;
	  }
	| {
			success: false;
			code: "INVALID_BLOCK_MARKDOWN";
			error: string;
	  } {
	const blocks = getTopLevelBlocks(markdown);
	if (blocks.length !== 1) {
		return invalidBlockMarkdown(
			"Block markdown must parse to exactly one top-level block.",
		);
	}
	const [block] = blocks;
	if (!block) {
		return invalidBlockMarkdown("Block markdown could not be parsed.");
	}
	return {
		success: true,
		block,
	};
}

function parseInsertedBlocks(blocks: MarkdownBlockInput[]):
	| {
			success: true;
			blocks: MutableTrackedBlock[];
	  }
	| {
			success: false;
			code: "INVALID_BLOCK_MARKDOWN" | "INVALID_OPERATION";
			error: string;
	  } {
	if (blocks.length === 0) {
		return invalidOperation(
			"Insert and replace operations require at least one block.",
		);
	}

	const nextBlocks: MutableTrackedBlock[] = [];
	for (const block of blocks) {
		const parsed = parseSingleBlock(block.markdown);
		if (!parsed.success) {
			return parsed;
		}
		nextBlocks.push({
			ref: null,
			node: parsed.block,
		});
	}

	return {
		success: true,
		blocks: nextBlocks,
	};
}

function findTrackedBlockIndex(
	blocks: MutableTrackedBlock[],
	ref: string,
): number {
	return blocks.findIndex((block) => block.ref === ref);
}

function invalidRef(ref: string): {
	code: "INVALID_REF";
	error: string;
} {
	return createEditError("INVALID_REF", `Unknown block ref: ${ref}`);
}

function invalidOperation(error: string): {
	success: false;
	code: "INVALID_OPERATION";
	error: string;
} {
	return {
		success: false,
		...createEditError("INVALID_OPERATION", error),
	};
}

function invalidBlockMarkdown(error: string): {
	success: false;
	code: "INVALID_BLOCK_MARKDOWN";
	error: string;
} {
	return {
		success: false,
		...createEditError("INVALID_BLOCK_MARKDOWN", error),
	};
}

function createEditError<TCode extends ApplyTrackedMarkdownEditErrorCode>(
	code: TCode,
	error: string,
): {
	code: TCode;
	error: string;
} {
	return { code, error };
}

function replaceInMarkdownBlock(
	markdown: string,
	find: string,
	replace: string,
	occurrence: "first" | "last" | "all",
): string | null {
	if (occurrence === "all") {
		if (!markdown.includes(find)) {
			return null;
		}
		return markdown.split(find).join(replace);
	}

	if (occurrence === "last") {
		const index = markdown.lastIndexOf(find);
		if (index < 0) {
			return null;
		}
		return `${markdown.slice(0, index)}${replace}${markdown.slice(index + find.length)}`;
	}

	const index = markdown.indexOf(find);
	if (index < 0) {
		return null;
	}
	return `${markdown.slice(0, index)}${replace}${markdown.slice(index + find.length)}`;
}

function extractTextPreview(node: JSONContent): string {
	const text = collectText(node).replace(/\s+/g, " ").trim();
	return text.length > TEXT_PREVIEW_LIMIT
		? text.slice(0, TEXT_PREVIEW_LIMIT)
		: text;
}

function buildTrackedMarkdownDocument(
	path: string,
	markdown: string,
	revision: number,
	updatedAt?: string,
): TrackedMarkdownDocument {
	return {
		path,
		markdown,
		revision,
		contentHash: hashMarkdownContent(markdown),
		updatedAt: updatedAt ?? new Date().toISOString(),
	};
}

function collectText(node: JSONContent): string {
	let text = node.text ?? "";
	for (const child of node.content ?? []) {
		text += collectText(child);
	}
	return text;
}
