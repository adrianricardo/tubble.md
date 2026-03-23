import {
	LinkExtension,
	listExtensions,
	MarkdownRolloverExtension,
	markdownToTiptapDoc,
	tiptapDocToMarkdown,
} from "@hubble.md/editor";
import { useStoreValue } from "@simplestack/store/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { watch } from "@tauri-apps/plugin-fs";
import { TaskItem } from "@tiptap/extension-list";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { keymatch } from "keymatch";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAppMenu } from "./appMenu";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { FormattingStatusBar } from "./editor/FormattingStatusBar";
import { handleImagePaste } from "./editor/handleImagePaste";
import { createImageExtension } from "./editor/ImageExtension";
import { LinkPopover } from "./editor/LinkPopover";
import { SmartLinkExtension } from "./editor/SmartLinkExtension";
import { VirtualCursor } from "./editor/VirtualCursor";
import { loadPath, savePathContent, viewerStore } from "./store";
import { openWorkspace, refreshFiles, workspaceStore } from "./workspaceStore";
import { EDITOR_INPUT_ATTR, SIDEBAR_NAV_SELECTOR } from "./selectors";
import "./App.css";

// Forces editor refresh when underlying TipTap extensions change
const HMR_REV = (() => {
	if (!import.meta.hot) return 0;
	const hotData = import.meta.hot.data as { __editorRev?: number };
	hotData.__editorRev = (hotData.__editorRev ?? 0) + 1;
	return hotData.__editorRev;
})();

function focusSidebarNav() {
	document.querySelector<HTMLElement>(SIDEBAR_NAV_SELECTOR)?.focus();
}

function App() {
	const state = useStoreValue(viewerStore);
	const workspace = useStoreValue(workspaceStore);
	const hasWorkspace = workspace.workspacePath !== null;
	const [scrollContainerEl, setScrollContainerEl] =
		useState<HTMLDivElement | null>(null);

	useEffect(() => {
		const ws = workspace.workspacePath;
		if (!ws) return;

		let disposed = false;
		let unwatch: null | (() => void) = null;

		const isIgnoredPath = (path: string) =>
			path.includes("/.hubble/") ||
			path.endsWith("/.hubble") ||
			path.includes("\\.hubble\\");

		const handleChange = async (paths: string[]) => {
			const changedPaths = paths.filter((path) => !isIgnoredPath(path));
			if (changedPaths.length === 0) return;

			void refreshFiles();
			const currentPath = viewerStore.get().currentPath;
			if (!currentPath) return;
			if (!changedPaths.includes(currentPath)) return;

			try {
				const nextContent = await invoke<string>("read_file_text", {
					path: currentPath,
				});
				const current = viewerStore.get();
				if (
					current.currentPath === currentPath &&
					current.content !== nextContent
				) {
					await loadPath(currentPath);
				}
			} catch {
				await loadPath(currentPath);
			}
		};

		const setup = async () => {
			unwatch = await watch(
				ws,
				(event) => {
					const paths = Array.isArray(event.paths) ? event.paths : [];
					void handleChange(paths);
				},
				{ recursive: true },
			);
			if (disposed && unwatch) {
				unwatch();
			}
		};

		void setup();
		return () => {
			disposed = true;
			if (unwatch) {
				unwatch();
			}
		};
	}, [workspace.workspacePath]);

	const openFilePicker = useCallback(async () => {
		const defaultPath = workspaceStore.get().workspacePath ?? undefined;
		const selected = await open({
			multiple: false,
			directory: false,
			title: "Open Markdown file",
			defaultPath,
			filters: [
				{ name: "Markdown", extensions: ["md", "markdown", "mdown"] },
				{ name: "Text", extensions: ["txt", "text"] },
			],
		});
		if (typeof selected === "string") {
			await loadPath(selected);
		}
	}, []);

	const openFolderPicker = useCallback(async () => {
		const selected = await open({
			multiple: false,
			directory: true,
			title: "Open Folder as Workspace",
		});
		if (typeof selected === "string") {
			openWorkspace(selected);
		}
	}, []);

	useEffect(() => {
		const setupMenu = async () => {
			const menu = await createAppMenu({
				open: () => void openFilePicker(),
				openFolder: () => void openFolderPicker(),
			});
			await menu.setAsAppMenu();
		};
		void setupMenu();
		const onKeyDown = async (event: KeyboardEvent) => {
			if (keymatch(event, "CmdOrCtrl+Shift+O")) {
				event.preventDefault();
				await openFolderPicker();
			} else if (keymatch(event, "CmdOrCtrl+O")) {
				event.preventDefault();
				await openFilePicker();
			} else if (keymatch(event, "CmdOrCtrl+Shift+E")) {
				event.preventDefault();
				const opening = !workspaceStore.get().sidebarOpen;
				workspaceStore.set((s) => ({ ...s, sidebarOpen: opening }));
				if (opening) {
					requestAnimationFrame(() => focusSidebarNav());
				}
			} else if (keymatch(event, "CmdOrCtrl+0")) {
				event.preventDefault();
				focusSidebarNav();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [openFilePicker, openFolderPicker]);

	useEffect(() => {
		let disposed = false;
		let unlisten: (() => void) | null = null;
		const setup = async () => {
			const nextUnlisten = await listen<{ path?: string }>(
				"hubble://open-file",
				async (event) => {
					const path = event.payload?.path;
					if (path) {
						await loadPath(path);
					}
				},
			);
			if (disposed) {
				nextUnlisten();
				return;
			}
			unlisten = nextUnlisten;
		};
		void setup();
		return () => {
			disposed = true;
			if (unlisten) {
				unlisten();
			}
		};
	}, []);

	useEffect(() => {
		let active = true;
		const init = async () => {
			const launchPath = await invoke<string | null>("get_launch_file_path");
			if (!active) return;

			if (typeof launchPath === "string" && launchPath.length > 0) {
				await loadPath(launchPath);
				return;
			}

			const lastPath = viewerStore.get().lastOpenedPath;
			if (lastPath) {
				await loadPath(lastPath);
			}
		};
		void init();
		return () => {
			active = false;
		};
	}, []);

	return (
		<main className="app">
			<Toolbar
				hasWorkspace={hasWorkspace}
				sidebarOpen={workspace.sidebarOpen}
				scrollContainer={scrollContainerEl}
			/>
			<div className="appBody">
				{hasWorkspace && workspace.sidebarOpen && workspace.workspacePath && (
					<Sidebar
						workspacePath={workspace.workspacePath}
						files={workspace.files}
						sortMode={workspace.sortMode}
						currentFilePath={state.currentPath}
					/>
				)}
				<section className="content" aria-live="polite">
					{state.status === "loading" && <p>Loading…</p>}
					{state.status === "error" && (
						<p>{state.error ?? "Failed to open file."}</p>
					)}
					{state.status !== "loading" &&
						state.status !== "error" &&
						!state.currentPath && (
							<p>Open a markdown file to edit. Press ⌘O.</p>
						)}
					{state.status === "ready" && state.currentPath && (
						<MarkdownEditor
							key={`${state.currentPath}:${HMR_REV}`}
							path={state.currentPath}
							initialMarkdown={state.content}
							onScrollContainerChange={setScrollContainerEl}
						/>
					)}
				</section>
			</div>
		</main>
	);
}
const SAVE_DEBOUNCE_MS = 120;

function MarkdownEditor({
	path,
	initialMarkdown,
	onScrollContainerChange,
}: {
	path: string;
	initialMarkdown: string;
	onScrollContainerChange?: (el: HTMLDivElement | null) => void;
}) {
	const latestMarkdownRef = useRef(initialMarkdown);
	const saveTimerRef = useRef<number | null>(null);
	const editorRootRef = useRef<HTMLDivElement | null>(null);
	const editorViewportRef = useRef<HTMLDivElement | null>(null);
	const [editorViewportEl, setEditorViewportEl] =
		useState<HTMLDivElement | null>(null);
	const setEditorViewport = useCallback(
		(node: HTMLDivElement | null) => {
			editorViewportRef.current = node;
			setEditorViewportEl(node);
			onScrollContainerChange?.(node);
		},
		[onScrollContainerChange],
	);
	const initialDoc = useMemo(
		() => markdownToTiptapDoc(initialMarkdown),
		[initialMarkdown],
	);

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				listItem: false,
			}),
			LinkExtension,
			SmartLinkExtension,
			MarkdownRolloverExtension,
			createImageExtension(path),
			...listExtensions,
			TaskItem.configure({
				nested: true,
			}),
		],
		content: initialDoc,
		onUpdate: ({ editor: currentEditor }) => {
			const markdown = tiptapDocToMarkdown(
				currentEditor.getJSON() as JSONContent,
			);
			latestMarkdownRef.current = markdown;

			if (saveTimerRef.current !== null) {
				window.clearTimeout(saveTimerRef.current);
			}
			saveTimerRef.current = window.setTimeout(() => {
				void savePathContent(path, latestMarkdownRef.current);
			}, SAVE_DEBOUNCE_MS);
		},
		editorProps: {
			attributes: {
				class: "editorInput",
				[EDITOR_INPUT_ATTR]: "",
			},
			handlePaste: (_view, event): boolean => {
				const currentEditor = editor;
				if (!currentEditor) return false;
				return handleImagePaste({
					editor: currentEditor,
					filePath: path,
					event,
				});
			},
		},
	});

	useEffect(() => {
		if (!editor) return;
		const current = tiptapDocToMarkdown(editor.getJSON() as JSONContent);
		if (current === initialMarkdown) return;
		editor.commands.setContent(markdownToTiptapDoc(initialMarkdown), {
			emitUpdate: false,
		});
	}, [editor, initialMarkdown]);

	useEffect(() => {
		return () => {
			if (saveTimerRef.current !== null) {
				window.clearTimeout(saveTimerRef.current);
			}
			void savePathContent(path, latestMarkdownRef.current);
		};
	}, [path]);

	return (
		<div className="editorRoot" ref={editorRootRef}>
			<div className="editorViewport" ref={setEditorViewport}>
				<EditorContent editor={editor} />
				<VirtualCursor
					editor={editor}
					containerRef={editorRootRef}
					viewportRef={editorViewportRef}
				/>
			</div>
			<LinkPopover editor={editor} containerRef={editorRootRef} />
			<FormattingStatusBar editor={editor} scrollContainer={editorViewportEl} />
		</div>
	);
}

export default App;
