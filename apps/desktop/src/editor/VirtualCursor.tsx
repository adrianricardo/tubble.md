import { getMarkdownRolloverBoundaryState } from "@hubble.md/editor";
import type { Editor } from "@tiptap/core";
import { type RefObject, useEffect, useRef, useState } from "react";

type CursorStyle = "hidden" | "solid" | "blinking";
type CursorPosition = {
	left: number;
	top: number;
	width: number;
	height: number;
};

const CURSOR_SCALE = 1.5;
const BLINK_DELAY_MS = 500;

export function VirtualCursor({
	editor,
	containerRef,
}: {
	editor: Editor | null;
	containerRef: RefObject<HTMLDivElement | null>;
}) {
	const [cursorStyle, setCursorStyle] = useState<CursorStyle>("hidden");
	const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(
		null,
	);
	const [animatePosition, setAnimatePosition] = useState(true);
	const blinkTimeoutRef = useRef<number | null>(null);
	const inputModeRef = useRef<"pointer" | "keyboard">("keyboard");

	useEffect(() => {
		if (!editor) return;

		const clearBlinkTimeout = () => {
			if (blinkTimeoutRef.current !== null) {
				window.clearTimeout(blinkTimeoutRef.current);
				blinkTimeoutRef.current = null;
			}
		};

		const queueBlink = () => {
			setCursorStyle("solid");
			clearBlinkTimeout();
			blinkTimeoutRef.current = window.setTimeout(() => {
				setCursorStyle("blinking");
			}, BLINK_DELAY_MS);
		};

		const updateCursor = () => {
			const container = containerRef.current;
			if (!container || !editor.view) {
				setCursorStyle("hidden");
				return;
			}

			const { state, view } = editor;
			if (!state.selection.empty || !editor.isFocused) {
				setCursorStyle("hidden");
				return;
			}

			const rootRect = container.getBoundingClientRect();
			const coords = view.coordsAtPos(state.selection.head);
			let left = coords.left - rootRect.left;
			let top = coords.top - rootRect.top;
			let height = Math.max(coords.bottom - coords.top, 1);

			const boundary = getMarkdownRolloverBoundaryState(state);
			if (boundary && boundary.boundaryPos === state.selection.from) {
				const delimiter = view.dom.querySelector(
					`.pm-md-delimiter[data-pos="${boundary.boundaryPos}"][data-mark="${boundary.markName}"][data-boundary="${boundary.boundary}"]`,
				) as HTMLElement | null;
				if (delimiter) {
					const rect = delimiter.getBoundingClientRect();
					const useRightEdge =
						(boundary.boundary === "start" && boundary.side === "inside") ||
						(boundary.boundary === "end" && boundary.side === "outside");
					left = (useRightEdge ? rect.right : rect.left) - rootRect.left;
					top = rect.top - rootRect.top;
					height = Math.max(rect.height, height);
				}
			}

			const scaledHeight = height * CURSOR_SCALE;
			const topOffset = (scaledHeight - height) / 2;
			const width = scaledHeight * 0.02 + 2;
			setCursorPosition({
				left,
				top: top - topOffset,
				width,
				height: scaledHeight,
			});
			setAnimatePosition(inputModeRef.current === "keyboard");
			queueBlink();
		};
		const onMouseDown = () => {
			inputModeRef.current = "pointer";
		};
		const onKeyDown = () => {
			inputModeRef.current = "keyboard";
		};

		updateCursor();
		editor.on("selectionUpdate", updateCursor);
		editor.on("transaction", updateCursor);
		editor.on("focus", updateCursor);
		editor.on("blur", updateCursor);
		window.addEventListener("mousedown", onMouseDown, true);
		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("resize", updateCursor);
		window.addEventListener("scroll", updateCursor, true);

		return () => {
			editor.off("selectionUpdate", updateCursor);
			editor.off("transaction", updateCursor);
			editor.off("focus", updateCursor);
			editor.off("blur", updateCursor);
			window.removeEventListener("mousedown", onMouseDown, true);
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("resize", updateCursor);
			window.removeEventListener("scroll", updateCursor, true);
			clearBlinkTimeout();
		};
	}, [editor, containerRef]);

	if (!cursorPosition || cursorStyle === "hidden") return null;

	return (
		<span
			className={`pm-virtual-cursor ${cursorStyle === "blinking" ? "blinking" : ""} ${animatePosition ? "" : "no-position-transition"}`}
			aria-hidden="true"
			style={{
				left: `${cursorPosition.left}px`,
				top: `${cursorPosition.top}px`,
				width: `${cursorPosition.width}px`,
				height: `${cursorPosition.height}px`,
			}}
		/>
	);
}
