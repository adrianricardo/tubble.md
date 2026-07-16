import {
	computePosition,
	flip,
	offset,
	type ReferenceElement,
	shift,
} from "@floating-ui/dom";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import MingcuteAlignCenterLine from "~icons/mingcute/align-center-line";
import MingcuteAlignLeftLine from "~icons/mingcute/align-left-line";
import MingcuteAlignRightLine from "~icons/mingcute/align-right-line";
import MingcuteArrowToDownLine from "~icons/mingcute/arrow-to-down-line";
import MingcuteArrowToLeftLine from "~icons/mingcute/arrow-to-left-line";
import MingcuteArrowToRightLine from "~icons/mingcute/arrow-to-right-line";
import MingcuteArrowToUpLine from "~icons/mingcute/arrow-to-up-line";
import MingcuteColumnLine from "~icons/mingcute/column-line";
import MingcuteDelete2Line from "~icons/mingcute/delete-2-line";
import MingcuteLayoutTopLine from "~icons/mingcute/layout-top-line";
import MingcuteTableLine from "~icons/mingcute/table-line";
import { cn } from "../lib/utils";
import { Button } from "../primitives/button";
import { Separator } from "../primitives/separator";
import styles from "./TableControls.module.css";

type TableAlign = "left" | "center" | "right";
type TableContext = {
	tableStart: number;
	tableNode: PMNode;
	columnIndex: number;
};
type TableCommands = {
	addRowBefore: () => boolean;
	addRowAfter: () => boolean;
	addColumnBefore: () => boolean;
	addColumnAfter: () => boolean;
	deleteRow: () => boolean;
	deleteColumn: () => boolean;
	toggleHeaderRow: () => boolean;
	deleteTable: () => boolean;
};

export function TableControls({
	editor,
	viewportRef,
}: {
	editor: Editor | null;
	viewportRef: RefObject<HTMLDivElement | null>;
}) {
	const popoverRef = useRef<HTMLDivElement | null>(null);
	const positionRequestIdRef = useRef(0);
	const [context, setContext] = useState<TableContext | null>(null);
	const [position, setPosition] = useState<{ x: number; y: number } | null>(
		null,
	);
	const activeAlign = context
		? getColumnAlign(context.tableNode, context.columnIndex)
		: null;

	const update = useCallback(() => {
		if (!editor?.isEditable) {
			setContext(null);
			setPosition(null);
			return;
		}
		const nextContext = getTableContext(editor);
		setContext(nextContext);
		if (!nextContext) {
			setPosition(null);
			return;
		}
		const viewport = viewportRef.current;
		const popover = popoverRef.current;
		const reference = editor.view.nodeDOM(nextContext.tableStart);
		if (!viewport || !popover || !isReferenceElement(reference)) return;
		const requestId = ++positionRequestIdRef.current;
		void computePosition(reference, popover, {
			strategy: "absolute",
			placement: "top-start",
			middleware: [
				offset(6),
				flip({ boundary: viewport, padding: 8 }),
				shift({ boundary: viewport, padding: 8 }),
			],
		}).then(({ x, y }) => {
			if (requestId !== positionRequestIdRef.current) return;
			setPosition({ x, y });
		});
	}, [editor, viewportRef]);

	useEffect(() => {
		if (!editor) return;
		update();

		editor.on("selectionUpdate", update);
		editor.on("transaction", update);
		editor.on("focus", update);
		editor.on("blur", update);
		window.addEventListener("resize", update);
		const viewport = viewportRef.current;
		viewport?.addEventListener("scroll", update, { passive: true });

		return () => {
			editor.off("selectionUpdate", update);
			editor.off("transaction", update);
			editor.off("focus", update);
			editor.off("blur", update);
			window.removeEventListener("resize", update);
			viewport?.removeEventListener("scroll", update);
		};
	}, [editor, update, viewportRef]);

	useLayoutEffect(() => {
		update();
	}, [update]);

	if (!editor || !context) return null;

	const runCommand = (name: keyof TableCommands) => {
		editor.commands.focus(undefined, { scrollIntoView: false });
		const command = (editor.commands as unknown as TableCommands)[name];
		command?.();
	};
	const setAlign = (align: TableAlign) => {
		setCurrentColumnAlign(editor, context, align);
		update();
	};

	return (
		<div
			ref={popoverRef}
			className="absolute z-[4]"
			style={{
				insetInlineStart: `${position?.x ?? 0}px`,
				insetBlockStart: `${position?.y ?? 0}px`,
				visibility: position ? "visible" : "hidden",
			}}
		>
			<div
				className={styles.popover}
				role="toolbar"
				aria-label="Table controls"
				onMouseDown={(event) => event.preventDefault()}
			>
				<div className={styles.group}>
					<ControlButton
						label="Add row above"
						onClick={() => runCommand("addRowBefore")}
					>
						<MingcuteArrowToUpLine aria-hidden="true" />
					</ControlButton>
					<ControlButton
						label="Add row below"
						onClick={() => runCommand("addRowAfter")}
					>
						<MingcuteArrowToDownLine aria-hidden="true" />
					</ControlButton>
					<ControlButton
						label="Toggle header row"
						onClick={() => runCommand("toggleHeaderRow")}
					>
						<MingcuteLayoutTopLine aria-hidden="true" />
					</ControlButton>
					<ControlButton
						label="Delete row"
						onClick={() => runCommand("deleteRow")}
					>
						<MingcuteDelete2Line aria-hidden="true" />
					</ControlButton>
				</div>
				<Separator orientation="vertical" />
				<div className={styles.group}>
					<ControlButton
						label="Add column before"
						onClick={() => runCommand("addColumnBefore")}
					>
						<MingcuteArrowToLeftLine aria-hidden="true" />
					</ControlButton>
					<ControlButton
						label="Add column after"
						onClick={() => runCommand("addColumnAfter")}
					>
						<MingcuteArrowToRightLine aria-hidden="true" />
					</ControlButton>
					<ControlButton
						label="Delete column"
						onClick={() => runCommand("deleteColumn")}
					>
						<MingcuteColumnLine aria-hidden="true" />
					</ControlButton>
				</div>
				<Separator orientation="vertical" />
				<div className={styles.group}>
					<ControlButton
						active={activeAlign === "left"}
						label="Align column left"
						onClick={() => setAlign("left")}
					>
						<MingcuteAlignLeftLine aria-hidden="true" />
					</ControlButton>
					<ControlButton
						active={activeAlign === "center"}
						label="Align column center"
						onClick={() => setAlign("center")}
					>
						<MingcuteAlignCenterLine aria-hidden="true" />
					</ControlButton>
					<ControlButton
						active={activeAlign === "right"}
						label="Align column right"
						onClick={() => setAlign("right")}
					>
						<MingcuteAlignRightLine aria-hidden="true" />
					</ControlButton>
				</div>
				<Separator orientation="vertical" />
				<ControlButton
					label="Delete table"
					onClick={() => runCommand("deleteTable")}
				>
					<MingcuteTableLine aria-hidden="true" />
				</ControlButton>
			</div>
		</div>
	);
}

function ControlButton({
	active = false,
	children,
	label,
	onClick,
}: {
	active?: boolean;
	children: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			aria-label={label}
			aria-pressed={active || undefined}
			title={label}
			className={cn(styles.button, active && styles.active)}
			onClick={onClick}
		>
			{children}
		</Button>
	);
}

function getTableContext(editor: Editor): TableContext | null {
	const { $from } = editor.state.selection;
	let tableDepth = -1;
	let rowDepth = -1;
	for (let depth = $from.depth; depth > 0; depth--) {
		const nodeName = $from.node(depth).type.name;
		if (
			rowDepth === -1 &&
			(nodeName === "tableCell" || nodeName === "tableHeader")
		) {
			rowDepth = depth - 1;
		}
		if (nodeName === "table") {
			tableDepth = depth;
			break;
		}
	}
	if (tableDepth === -1 || rowDepth === -1) return null;
	return {
		tableStart: $from.before(tableDepth),
		tableNode: $from.node(tableDepth),
		columnIndex: $from.index(rowDepth),
	};
}

function getColumnAlign(
	tableNode: PMNode,
	columnIndex: number,
): TableAlign | null {
	let align: TableAlign | null = null;
	tableNode.forEach((row) => {
		if (align) return;
		if (columnIndex >= row.childCount) return;
		const cell = row.child(columnIndex);
		align = normalizeAlign(cell?.attrs.align);
	});
	return align;
}

function setCurrentColumnAlign(
	editor: Editor,
	context: TableContext,
	align: TableAlign,
) {
	const tr = editor.state.tr;
	context.tableNode.forEach((row, rowOffset) => {
		if (context.columnIndex >= row.childCount) return;
		row.forEach((cell, cellOffset, index) => {
			if (index !== context.columnIndex) return;
			const cellStart = context.tableStart + 1 + rowOffset + 1 + cellOffset;
			tr.setNodeMarkup(cellStart, undefined, { ...cell.attrs, align });
		});
	});
	editor.view.dispatch(tr.scrollIntoView());
	editor.commands.focus(undefined, { scrollIntoView: false });
}

function normalizeAlign(value: unknown): TableAlign | null {
	return value === "left" || value === "center" || value === "right"
		? value
		: null;
}

function isReferenceElement(value: unknown): value is ReferenceElement {
	return value instanceof Element;
}
