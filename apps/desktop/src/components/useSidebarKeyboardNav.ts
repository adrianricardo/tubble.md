import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { EDITOR_INPUT_SELECTOR } from "../selectors";

function isEditableElement(el: Element | null): boolean {
	if (!el) return false;
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
	return (el as HTMLElement).isContentEditable;
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

	useEffect(() => {
		if (focusedIndex === null) return;
		navRef.current
			?.querySelector(`[data-sidebar-index="${focusedIndex}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [focusedIndex, navRef]);

	// Enter opens hovered item even when nav isn't focused
	useEffect(() => {
		const onGlobalEnter = (event: KeyboardEvent) => {
			if (event.key !== "Enter") return;
			const idx = focusedIndexRef.current;
			if (idx === null) return;
			if (navRef.current?.contains(document.activeElement)) return;
			if (isEditableElement(document.activeElement)) return;
			event.preventDefault();
			if (items[idx]) onSelect(items[idx]);
		};
		window.addEventListener("keydown", onGlobalEnter);
		return () => window.removeEventListener("keydown", onGlobalEnter);
	}, [items, onSelect, navRef]);

	const onKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (items.length === 0) return;

			switch (event.key) {
				case "ArrowDown":
				case "ArrowUp": {
					event.preventDefault();
					const delta = event.key === "ArrowDown" ? 1 : -1;
					setFocusedIndex((prev) => {
						if (prev === null) return 0;
						return Math.max(0, Math.min(prev + delta, items.length - 1));
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
					document.querySelector<HTMLElement>(EDITOR_INPUT_SELECTOR)?.focus();
					break;
				}
			}
		},
		[items, focusedIndex, onSelect],
	);

	return { focusedIndex, setFocusedIndex, onKeyDown };
}
