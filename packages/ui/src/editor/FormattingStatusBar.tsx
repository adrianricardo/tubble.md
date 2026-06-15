import { getCaretFormattingState } from "@hubble.md/editor";
import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";
import MingcuteBoldLine from "~icons/mingcute/bold-line";
import MingcuteItalicLine from "~icons/mingcute/italic-line";
import MingcuteLinkLine from "~icons/mingcute/link-line";
import { shouldShowFooterDivider } from "../lib/scrollOverflow";
import { Button } from "../primitives/button";

type CountMode = "words" | "chars";

type PaletteState = {
	wordCount: number;
	charCount: number;
	activeMarkNames: string[];
	canEscapeBoundary: boolean;
	showDashedDivider: boolean;
};

export function FormattingStatusBar({
	editor,
	scrollContainer,
}: {
	editor: Editor | null;
	scrollContainer: HTMLDivElement | null;
}) {
	const [countMode, setCountMode] = useState<CountMode>("words");
	const [paletteState, setPaletteState] = useState<PaletteState>({
		wordCount: 0,
		charCount: 0,
		activeMarkNames: [],
		canEscapeBoundary: false,
		showDashedDivider: false,
	});

	useEffect(() => {
		if (!editor) return;
		const resolvedScrollContainer =
			scrollContainer ??
			(editor.view.dom.closest(".editorViewport") as HTMLDivElement | null) ??
			null;

		const update = () => {
			const text = editor.getText();
			const wordCount = countWords(text);
			const charCount = text.length;
			const { state } = editor;
			const showDashedDivider = shouldShowFooterDivider(
				resolvedScrollContainer,
			);
			if (!editor.isFocused || !state.selection.empty) {
				setPaletteState({
					wordCount,
					charCount,
					activeMarkNames: [],
					canEscapeBoundary: false,
					showDashedDivider,
				});
				return;
			}

			const caretState = getCaretFormattingState(state);
			setPaletteState({
				wordCount,
				charCount,
				activeMarkNames: caretState.activeMarkNames,
				canEscapeBoundary: caretState.canEscapeBoundary,
				showDashedDivider,
			});
		};

		update();
		requestAnimationFrame(update);
		editor.on("selectionUpdate", update);
		editor.on("transaction", update);
		editor.on("focus", update);
		editor.on("blur", update);
		resolvedScrollContainer?.addEventListener("scroll", update, {
			passive: true,
		});
		window.addEventListener("scroll", update, true);
		window.addEventListener("resize", update);

		return () => {
			editor.off("selectionUpdate", update);
			editor.off("transaction", update);
			editor.off("focus", update);
			editor.off("blur", update);
			resolvedScrollContainer?.removeEventListener("scroll", update);
			window.removeEventListener("scroll", update, true);
			window.removeEventListener("resize", update);
		};
	}, [editor, scrollContainer]);
	if (!editor) return null;
	const dividerClass = paletteState.showDashedDivider
		? "[border-block-start:1px_dashed_var(--border)]"
		: "border-transparent";

	return (
		<div
			className={`z-[3] flex h-8 items-center justify-between bg-background/95 px-2 text-[12px] backdrop-blur-[2px] ${dividerClass}`}
		>
			<Button
				variant="ghost"
				size="xs"
				className="text-muted-foreground"
				title={
					countMode === "words" ? "Show character count" : "Show word count"
				}
				onClick={() => setCountMode((m) => (m === "words" ? "chars" : "words"))}
			>
				{countMode === "words"
					? `${paletteState.wordCount} words`
					: `${paletteState.charCount} characters`}
			</Button>
			<div className="flex items-center gap-2 text-muted-foreground">
				{paletteState.canEscapeBoundary && (
					<span className="inline-flex h-4 items-center rounded-sm border border-border bg-secondary px-1 text-[11px] leading-none text-foreground shadow-overlay">
						esc
					</span>
				)}
				{paletteState.activeMarkNames.includes("bold") && (
					<MingcuteBoldLine className="size-4" />
				)}
				{paletteState.activeMarkNames.includes("italic") && (
					<MingcuteItalicLine className="size-4" />
				)}
				{paletteState.activeMarkNames.includes("link") && (
					<MingcuteLinkLine className="size-4" />
				)}
			</div>
		</div>
	);
}

function countWords(text: string) {
	const trimmed = text.trim();
	if (trimmed.length === 0) return 0;
	return trimmed.split(/\s+/).length;
}
