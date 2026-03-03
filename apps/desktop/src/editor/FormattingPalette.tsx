import { getCaretFormattingState } from "@hubble.md/editor";
import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

type PaletteState = {
	visible: boolean;
	activeMarkNames: string[];
	canEscapeBoundary: boolean;
};

const MARK_DISPLAY = [
	{ name: "bold", label: "B", className: "font-semibold" },
	{ name: "italic", label: "I", className: "italic" },
	{ name: "code", label: "`", className: "font-mono" },
	{ name: "strike", label: "S", className: "line-through" },
	{ name: "link", label: "🔗", className: "" },
] as const;

export function FormattingPalette({ editor }: { editor: Editor | null }) {
	const [paletteState, setPaletteState] = useState<PaletteState>({
		visible: false,
		activeMarkNames: [],
		canEscapeBoundary: false,
	});

	useEffect(() => {
		if (!editor) return;

		const update = () => {
			const { state } = editor;
			if (!editor.isFocused || !state.selection.empty) {
				setPaletteState({
					visible: false,
					activeMarkNames: [],
					canEscapeBoundary: false,
				});
				return;
			}

			const caretState = getCaretFormattingState(state);
			setPaletteState({
				visible: true,
				activeMarkNames: caretState.activeMarkNames,
				canEscapeBoundary: caretState.canEscapeBoundary,
			});
		};

		update();
		editor.on("selectionUpdate", update);
		editor.on("transaction", update);
		editor.on("focus", update);
		editor.on("blur", update);

		return () => {
			editor.off("selectionUpdate", update);
			editor.off("transaction", update);
			editor.off("focus", update);
			editor.off("blur", update);
		};
	}, [editor]);

	if (!paletteState.visible) return null;

	const activeMarks = MARK_DISPLAY.filter((mark) =>
		paletteState.activeMarkNames.includes(mark.name),
	);

	return (
		<div
			className="absolute z-[3] [inset-inline-end:1rem] [inset-block-end:1rem]"
			aria-hidden="true"
		>
			<div className="inline-flex items-center overflow-hidden rounded-full border border-[#c7c7c7] bg-[#f4f4f5] shadow-[0_1px_2px_rgba(0,0,0,0.09)]">
				{paletteState.canEscapeBoundary && (
					<span className="inline-flex items-center justify-center border-e border-[#d3d4d8] px-[0.45rem] text-[0.8rem] leading-none text-[#4b5563] [min-inline-size:2.2rem] [block-size:1.9rem]">
						esc
					</span>
				)}
				{activeMarks.map((mark) => (
					<span
						key={mark.name}
						className="inline-flex items-center justify-center border-e border-[#d3d4d8] text-[1rem] leading-none text-[#2f2f2f] [min-inline-size:1.9rem] [block-size:1.9rem]"
					>
						<span className={cn(mark.className)}>{mark.label}</span>
					</span>
				))}
				<button
					type="button"
					className="mx-[0.15rem] inline-flex cursor-pointer items-center justify-center rounded-full border-none bg-[#eceef0] text-[1.1rem] text-[#2f2f2f] hover:bg-[#e2e4e7] [inline-size:2rem] [block-size:2rem]"
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => {
						if (!editor) return;
						editor
							.chain()
							.focus(undefined, { scrollIntoView: false })
							.insertContent("/")
							.run();
					}}
				>
					/
				</button>
			</div>
		</div>
	);
}
