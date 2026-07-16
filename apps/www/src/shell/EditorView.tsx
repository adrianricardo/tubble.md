import { useTiptapSync } from "@convex-dev/prosemirror-sync/tiptap";
import {
	markdownToTiptapDoc,
	parseMarkdownFrontMatter,
	wikiDisplayNameForTarget,
} from "@hubble.md/editor";
import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import {
	type RemotePresenceCursor,
	EditorView as SharedEditorView,
	type WikiTarget,
} from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TestIdentity } from "../App";
import {
	loadPath,
	savePathContent,
	updateEditorContent,
} from "../store/actions";
import { filesStore } from "../store/state";
import { createDurableOfflineExtension } from "./DurableOfflineExtension";
import {
	createDurableOfflinePersister,
	createIndexedDbBufferStore,
	type DurableBuffer,
	type DurableBufferStore,
	hydrateSessionCache,
} from "./durableOfflineBuffer";
import { handleImageDrop, handleImagePaste } from "./handleImageUpload";
import { createWebImageExtension } from "./WebImageExtension";

// One IndexedDB-backed store shared across editor mounts (keyed internally by
// sync doc id). Created lazily so SSR / no-IndexedDB environments degrade to a
// no-op store instead of crashing at import time.
let sharedBufferStore: DurableBufferStore | null = null;
function getDurableBufferStore(): DurableBufferStore {
	if (!sharedBufferStore) {
		sharedBufferStore = createIndexedDbBufferStore();
	}
	return sharedBufferStore;
}

type Props = {
	workspaceId: string;
	path: string;
	initialMarkdown: string;
	syncDocumentId?: string;
	testIdentity: TestIdentity | null;
	// Role-honest UI (RB2): viewers/commenters get a read-only ProseMirror view
	// instead of a dead-looking editor that silently drops their edits.
	// Defaults to true so existing owner/editor call sites are unaffected.
	canWrite?: boolean;
	onLiveDocumentEdit?: () => void;
	onSelectionChange?: (selection: { anchor: number; head: number }) => void;
};

const CURSOR_HEARTBEAT_MIN_MS = 250;
const REMOTE_CURSOR_COLORS = [
	"#2563eb",
	"#d97706",
	"#059669",
	"#dc2626",
	"#7c3aed",
	"#0891b2",
];

const noopChange = () => {};

export function EditorView(props: Props) {
	const docId = useMemo(
		() => props.syncDocumentId ?? `poc:${props.workspaceId}:${props.path}`,
		[props.syncDocumentId, props.workspaceId, props.path],
	);
	// Hydrate the durable offline buffer (IndexedDB -> sessionStorage) BEFORE the
	// editor mounts, so the package's `getCachedState` read path finds restored
	// steps even after a full app restart (sessionStorage alone does not survive
	// that). Gate the live editor on this so the synchronous read sees the seed.
	const hydration = useDurableOfflineHydration(docId);
	if (!hydration.ready) {
		return (
			<div className="flex h-full items-center justify-center p-6">
				<p className="text-sm text-muted-foreground">Loading live document…</p>
			</div>
		);
	}
	return (
		<LiveEditorView
			{...props}
			docId={docId}
			restoredBuffer={hydration.restoredBuffer}
		/>
	);
}

function useDurableOfflineHydration(docId: string): {
	ready: boolean;
	restoredBuffer: DurableBuffer | null;
} {
	const [state, setState] = useState<{
		docId: string;
		ready: boolean;
		restoredBuffer: DurableBuffer | null;
	}>({ docId, ready: false, restoredBuffer: null });

	useEffect(() => {
		let cancelled = false;
		setState({ docId, ready: false, restoredBuffer: null });
		void hydrateSessionCache(docId, getDurableBufferStore()).then((buffer) => {
			if (cancelled) return;
			setState({ docId, ready: true, restoredBuffer: buffer });
		});
		return () => {
			cancelled = true;
		};
	}, [docId]);

	// Guard against a stale value during the docId-change render before the
	// effect re-runs.
	if (state.docId !== docId) {
		return { ready: false, restoredBuffer: null };
	}
	return { ready: state.ready, restoredBuffer: state.restoredBuffer };
}

function LiveEditorView({
	workspaceId,
	path,
	initialMarkdown,
	syncDocumentId,
	testIdentity,
	canWrite = true,
	onLiveDocumentEdit,
	onSelectionChange: onExternalSelectionChange,
	docId,
	restoredBuffer,
}: Props & { docId: string; restoredBuffer: DurableBuffer | null }) {
	const files = useStoreValue(filesStore);
	const convexWorkspaceId = workspaceId as Id<"workspaces">;
	const initialBody = useMemo(
		() => parseMarkdownFrontMatter(initialMarkdown).body,
		[initialMarkdown],
	);
	const createdDocRef = useRef<string | null>(null);
	const lastCursorHeartbeatRef = useRef(0);
	const heartbeat = useMutation(api.pocIdentity.heartbeat);
	const activeUsers = useQuery(api.pocIdentity.listActive, { docId });
	const viewer = useQuery(api.viewer.me, testIdentity ? "skip" : {});
	const sync = useTiptapSync(api.prosemirror, docId, {
		warnOnUnsyncedClose: false,
		onSyncError: (error) => {
			console.error("ProseMirror sync error:", error);
		},
	});
	const wikiTargets: WikiTarget[] = files.map((file) => ({
		path: file.path,
		target: file.path,
		title: wikiDisplayNameForTarget(file.path),
	}));
	const remotePresence = useMemo<RemotePresenceCursor[]>(() => {
		if (!activeUsers) return [];
		const currentUserId = testIdentity?.userId ?? viewer?._id;
		return activeUsers.flatMap((user) => {
			if (currentUserId && user.userId === currentUserId) return [];
			if (user.anchor === undefined || user.head === undefined) return [];
			return [
				{
					userId: user.userId,
					name: user.name,
					anchor: user.anchor,
					head: user.head,
					color: user.color ?? colorForUser(user.userId),
				},
			];
		});
	}, [activeUsers, testIdentity, viewer?._id]);

	const publishSelection = useCallback(
		(selection: { anchor: number; head: number }) => {
			onExternalSelectionChange?.(selection);
			const now = Date.now();
			if (now - lastCursorHeartbeatRef.current < CURSOR_HEARTBEAT_MIN_MS) {
				return;
			}
			lastCursorHeartbeatRef.current = now;
			const payload = testIdentity
				? {
						workspaceId: convexWorkspaceId,
						docId,
						userId: testIdentity.userId,
						name: testIdentity.name,
						anchor: selection.anchor,
						head: selection.head,
					}
				: {
						workspaceId: convexWorkspaceId,
						docId,
						anchor: selection.anchor,
						head: selection.head,
					};
			void heartbeat(payload).catch((error) => {
				console.error("Presence heartbeat failed:", error);
			});
		},
		[
			convexWorkspaceId,
			docId,
			heartbeat,
			onExternalSelectionChange,
			testIdentity,
		],
	);
	const handleLiveDocumentChange = useCallback(
		(_path: string, _markdown: string) => {
			onLiveDocumentEdit?.();
		},
		[onLiveDocumentEdit],
	);

	// Durable in-editor offline: persists unsynced collab steps to IndexedDB +
	// sessionStorage as the user types, and clears them once acknowledged. The
	// editor is keyed by docId, so this persister is stable for its lifetime.
	const durableOfflineExtension = useMemo(
		() =>
			createDurableOfflineExtension(
				createDurableOfflinePersister({
					docId,
					store: getDurableBufferStore(),
					restoredBuffer,
				}),
			),
		[docId, restoredBuffer],
	);

	useEffect(() => {
		if (
			sync.isLoading ||
			sync.initialContent ||
			createdDocRef.current === docId
		) {
			return;
		}
		const createLiveDocument = "create" in sync ? sync.create : undefined;
		if (!createLiveDocument) return;
		createdDocRef.current = docId;
		void createLiveDocument(markdownToTiptapDoc(initialBody)).catch((error) => {
			createdDocRef.current = null;
			console.error("Failed to create ProseMirror sync document:", error);
		});
	}, [docId, initialBody, sync]);

	if (sync.isLoading || !sync.initialContent || !sync.extension) {
		return (
			<div className="flex h-full items-center justify-center p-6">
				<p className="text-sm text-muted-foreground">Loading live document…</p>
			</div>
		);
	}

	return (
		<SharedEditorView
			key={docId}
			path={path}
			initialMarkdown={initialMarkdown}
			initialContent={sync.initialContent}
			wikiTargets={wikiTargets}
			remotePresence={remotePresence}
			editorProps={{ editable: () => canWrite }}
			extensions={[
				sync.extension,
				createWebImageExtension(),
				durableOfflineExtension,
			]}
			onPaste={(editor, event) => handleImagePaste({ editor, event })}
			onDrop={(editor, event) => handleImageDrop({ editor, event })}
			onSelectionChange={publishSelection}
			persistChanges={false}
			syncInitialMarkdownChanges={!syncDocumentId}
			onLocalChange={
				syncDocumentId ? handleLiveDocumentChange : updateEditorContent
			}
			onSave={syncDocumentId ? noopChange : savePathContent}
			onOpenExternalLink={(href) => {
				window.open(href, "_blank", "noopener");
			}}
			onOpenWikiLink={(target) => void loadPath(target.split("#")[0] ?? target)}
		/>
	);
}

function colorForUser(userId: string): string {
	let hash = 0;
	for (let i = 0; i < userId.length; i += 1) {
		hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
	}
	return REMOTE_CURSOR_COLORS[hash % REMOTE_CURSOR_COLORS.length] ?? "#2563eb";
}
