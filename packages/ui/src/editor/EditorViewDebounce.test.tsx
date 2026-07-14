// @vitest-environment happy-dom

import { type Editor, Extension } from "@tiptap/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorView } from "./EditorView";

beforeEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	vi.useFakeTimers();
});

afterEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = false;
	vi.useRealTimers();
});

describe("EditorView save debounce", () => {
	it("does not clear an expired save timer when scheduling the next save", async () => {
		let editor: Editor | null = null;
		const CaptureEditor = Extension.create({
			name: "captureEditorForDebounceTest",
			onBeforeCreate() {
				editor = this.editor;
			},
		});
		const onSave = vi.fn();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<EditorView
					path="note.md"
					initialMarkdown=""
					extensions={[CaptureEditor]}
					saveDebounceMs={37}
					onLocalChange={() => {}}
					onSave={onSave}
					onOpenExternalLink={() => {}}
					onOpenWikiLink={() => {}}
				/>,
			);
		});
		if (!editor) throw new Error("Expected captured editor");
		const setTimeoutSpy = vi.spyOn(window, "setTimeout");
		const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

		act(() => {
			editor?.commands.insertContent("first");
		});
		const saveTimer = setTimeoutSpy.mock.results.find(
			(_result, index) => setTimeoutSpy.mock.calls[index]?.[1] === 37,
		)?.value;
		expect(saveTimer).toBeDefined();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(37);
		});
		expect(onSave).toHaveBeenCalledTimes(1);
		clearTimeoutSpy.mockClear();

		act(() => {
			editor?.commands.insertContent(" second");
		});
		expect(clearTimeoutSpy).not.toHaveBeenCalledWith(saveTimer);

		await act(async () => root.unmount());
		container.remove();
	});
});
