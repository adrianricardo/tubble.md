import { useEffect, useState } from "react";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteLayoutLeftLine from "~icons/mingcute/layout-left-line";
import { createNote } from "../noteActions";
import { workspaceStore } from "../workspaceStore";
import { Button } from "./ui/button";

const IS_MACOS = navigator.userAgent.includes("Mac");
const TRAFFIC_LIGHT_CLEARANCE = 78;

function basename(path: string) {
	return path.split(/[\\/]/).pop() ?? path;
}

export function Toolbar({
	hasWorkspace,
	sidebarOpen,
	scrollContainer,
	currentPath,
}: {
	hasWorkspace: boolean;
	sidebarOpen: boolean;
	scrollContainer: HTMLDivElement | null;
	currentPath: string | null;
}) {
	const [showBorder, setShowBorder] = useState(false);

	useEffect(() => {
		if (!scrollContainer) {
			setShowBorder(false);
			return;
		}
		const update = () => setShowBorder(scrollContainer.scrollTop > 0);
		update();
		scrollContainer.addEventListener("scroll", update, { passive: true });
		return () => scrollContainer.removeEventListener("scroll", update);
	}, [scrollContainer]);

	const toggleSidebar = () => {
		workspaceStore.set((s) => ({ ...s, sidebarOpen: !s.sidebarOpen }));
	};

	const borderClass = hasWorkspace
		? sidebarOpen
			? "border-b border-border"
			: showBorder
				? "[border-block-end:1px_dashed_var(--border)]"
				: "border-transparent"
		: "border-transparent";

	return (
		<div
			className={`flex items-center py-1 ${borderClass}`}
			data-tauri-drag-region
		>
			<div
				className="flex items-center gap-1 px-2"
				style={{
					paddingInlineStart: IS_MACOS ? TRAFFIC_LIGHT_CLEARANCE : 8,
					flex: "0 100 114px",
				}}
			>
				{hasWorkspace && (
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={toggleSidebar}
						aria-label="Toggle sidebar"
						className={sidebarOpen ? "text-brand" : ""}
					>
						<MingcuteLayoutLeftLine className="size-4" />
					</Button>
				)}
			</div>
			<span
				className="truncate text-center text-xs text-muted-foreground"
				style={{ flex: "1 1 auto" }}
				data-tauri-drag-region
			>
				{currentPath ? basename(currentPath) : "\u00A0"}
			</span>
			<div
				className="flex items-center justify-end px-2"
                // Hack: shrink 100 allows the side toggles to shrink before the title bar starts to truncate
				style={{ flex: "0 100 114px" }}
			>
				{hasWorkspace && (
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => void createNote()}
						aria-label="New Note"
						title="New Note (⌘N)"
					>
						<MingcuteAddLine className="size-4" />
					</Button>
				)}
			</div>
		</div>
	);
}
