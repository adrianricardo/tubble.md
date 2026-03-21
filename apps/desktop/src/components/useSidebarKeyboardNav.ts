import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

const SIDEBAR_ITEM_SELECTOR = "[data-sidebar-index]";

function isEditableElement(el: Element | null): boolean {
	if (!el) return false;
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
	if ((el as HTMLElement).isContentEditable) return true;
	return false;
}

export function useSidebarKeyboardNav<T>({
	items,
	onSelect,
	navRef,
}: {
	items: T[];
	onSelect: (item: T) => void;
	navRef: RefObject<HTMLElement | null>;
}) {
	const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
	const focusedIndexRef = useRef(focusedIndex);
	focusedIndexRef.current = focusedIndex;

	// Scroll the focused item into view
	useEffect(() => {
		if (focusedIndex === null) return;
		const nav = navRef.current;
		if (!nav) return;
		const el = nav.querySelector(
			`${SIDEBAR_ITEM_SELECTOR}[data-sidebar-index="${focusedIndex}"]`,
		);
		el?.scrollIntoView({ block: "nearest" });
	}, [focusedIndex, navRef]);

	// Global Enter listener: opens hovered item even when nav isn't focused
	useEffect(() => {
		const onGlobalEnter = (event: KeyboardEvent) => {
			if (event.key !== "Enter") return;
			const idx = focusedIndexRef.current;
			if (idx === null) return;
			// Skip if nav already has focus (handled by onKeyDown)
			if (navRef.current?.contains(document.activeElement)) return;
			// Skip if user is typing in an editable field
			if (isEditableElement(document.activeElement)) return;
			event.preventDefault();
			const item = items[idx];
			if (item) onSelect(item);
		};
		window.addEventListener("keydown", onGlobalEnter);
		return () => window.removeEventListener("keydown", onGlobalEnter);
	}, [items, onSelect, navRef]);

	const onKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (items.length === 0) return;

			switch (event.key) {
				case "ArrowDown": {
					event.preventDefault();
					setFocusedIndex((prev) => {
						if (prev === null) return 0;
						return Math.min(prev + 1, items.length - 1);
					});
					break;
				}
				case "ArrowUp": {
					event.preventDefault();
					setFocusedIndex((prev) => {
						if (prev === null) return 0;
						return Math.max(prev - 1, 0);
					});
					break;
				}
				case "Enter": {
					if (focusedIndex !== null && items[focusedIndex]) {
						event.preventDefault();
						onSelect(items[focusedIndex]);
					}
					break;
				}
				case "Escape": {
					event.preventDefault();
					setFocusedIndex(null);
					// Return focus to the editor
					const editor = document.querySelector<HTMLElement>(".editorInput");
					editor?.focus();
					break;
				}
			}
		},
		[items, focusedIndex, onSelect],
	);

	return { focusedIndex, setFocusedIndex, onKeyDown };
}
