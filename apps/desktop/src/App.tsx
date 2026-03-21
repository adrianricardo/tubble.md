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
import { TaskItem } from "@tiptap/extension-list";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { keymatch } from "keymatch";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startAgentBridgeListener } from "./agentBridgeServer";
import { createAppMenu } from "./appMenu";
import { FormattingPalette } from "./editor/FormattingPalette";
import { handleImagePaste } from "./editor/handleImagePaste";
import { createImageExtension } from "./editor/ImageExtension";
import { LinkPopover } from "./editor/LinkPopover";
import { SmartLinkExtension } from "./editor/SmartLinkExtension";
import { VirtualCursor } from "./editor/VirtualCursor";
import { loadPath, savePathContent, viewerStore } from "./store";
import "./App.css";

// Forces editor refresh when underlying TipTap extensions change
const HMR_REV = (() => {
	if (!import.meta.hot) return 0;
	const hotData = import.meta.hot.data as { __editorRev?: number };
	hotData.__editorRev = (hotData.__editorRev ?? 0) + 1;
	return hotData.__editorRev;
})();

function App() {
	const state = useStoreValue(viewerStore);

	const openFilePicker = useCallback(async () => {
		const selected = await open({
			multiple: false,
			directory: false,
			title: "Open Markdown file",
			filters: [
				{ name: "Markdown", extensions: ["md", "markdown", "mdown"] },
				{ name: "Text", extensions: ["txt", "text"] },
			],
		});
		if (typeof selected === "string") {
			await loadPath(selected);
		}
	}, []);

	useEffect(() => {
		const setupMenu = async () => {
			const menu = await createAppMenu({ open: () => void openFilePicker() });
			await menu.setAsAppMenu();
		};
		void setupMenu();
		const onKeyDown = async (event: KeyboardEvent) => {
			if (keymatch(event, "CmdOrCtrl+O")) {
				event.preventDefault();
				await openFilePicker();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [openFilePicker]);

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
		const cleanup = startAgentBridgeListener();
		return () => void cleanup.then((fn) => fn());
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
			<section className="content" aria-live="polite">
				{state.status === "loading" && <p>Loading…</p>}
				{state.status === "error" && (
					<p>{state.error ?? "Failed to open file."}</p>
				)}
				{state.status !== "loading" &&
					state.status !== "error" &&
					!state.currentPath && <p>Open a markdown file to edit. Press ⌘O.</p>}
				{state.status === "ready" && state.currentPath && (
					<MarkdownEditor
						key={`${state.currentPath}:${HMR_REV}`}
						path={state.currentPath}
						initialMarkdown={state.content}
					/>
				)}
			</section>
		</main>
	);
}
const SAVE_DEBOUNCE_MS = 120;

function MarkdownEditor({
	path,
	initialMarkdown,
}: {
	path: string;
	initialMarkdown: string;
}) {
	const latestMarkdownRef = useRef(initialMarkdown);
	const syncingFromStoreRef = useRef(false);
	const saveTimerRef = useRef<number | null>(null);
	const editorRootRef = useRef<HTMLDivElement | null>(null);
	const editorViewportRef = useRef<HTMLDivElement | null>(null);
	const [editorViewportEl, setEditorViewportEl] =
		useState<HTMLDivElement | null>(null);
	const setEditorViewport = useCallback((node: HTMLDivElement | null) => {
		editorViewportRef.current = node;
		setEditorViewportEl(node);
	}, []);
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

			if (syncingFromStoreRef.current) return;

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
		const unsubscribe = viewerStore.subscribe((state) => {
			if (!editor || state.content === latestMarkdownRef.current) return;
			syncingFromStoreRef.current = true;
			const doc = markdownToTiptapDoc(state.content);
			editor.commands.setContent(doc);
			latestMarkdownRef.current = state.content;
			syncingFromStoreRef.current = false;
		});
		return unsubscribe;
	}, [editor]);

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
			<FormattingPalette editor={editor} scrollContainer={editorViewportEl} />
		</div>
	);
}

export default App;
