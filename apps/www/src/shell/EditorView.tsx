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
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { TestIdentity } from "../App";
import {
	loadPath,
	savePathContent,
	updateEditorContent,
} from "../store/actions";
import { filesStore } from "../store/state";
import { handleImageDrop, handleImagePaste } from "./handleImageUpload";
import { createWebImageExtension } from "./WebImageExtension";

type Props = {
	workspaceId: string;
	path: string;
	initialMarkdown: string;
	syncDocumentId?: string;
	testIdentity: TestIdentity | null;
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

export function EditorView({
	workspaceId,
	path,
	initialMarkdown,
	syncDocumentId,
	testIdentity,
}: Props) {
	const files = useStoreValue(filesStore);
	const docId = useMemo(
		() => syncDocumentId ?? `poc:${workspaceId}:${path}`,
		[syncDocumentId, workspaceId, path],
	);
	const convexWorkspaceId = workspaceId as Id<"workspaces">;
	const initialBody = useMemo(
		() => parseMarkdownFrontMatter(initialMarkdown).body,
		[initialMarkdown],
	);
	const createdDocRef = useRef<string | null>(null);
	const lastCursorHeartbeatRef = useRef(0);
	const heartbeat = useMutation(api.pocIdentity.heartbeat);
	const activeUsers = useQuery(
		api.pocIdentity.listActive,
		testIdentity ? { docId } : "skip",
	);
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
		if (!testIdentity || !activeUsers) return [];
		return activeUsers.flatMap((user) => {
			if (user.userId === testIdentity.userId) return [];
			if (user.anchor === undefined || user.head === undefined) return [];
			return [
				{
					userId: user.userId,
					name: user.name,
					anchor: user.anchor,
					head: user.head,
					color: colorForUser(user.userId),
				},
			];
		});
	}, [activeUsers, testIdentity]);

	const publishSelection = useCallback(
		(selection: { anchor: number; head: number }) => {
			if (!testIdentity) return;
			const now = Date.now();
			if (now - lastCursorHeartbeatRef.current < CURSOR_HEARTBEAT_MIN_MS) {
				return;
			}
			lastCursorHeartbeatRef.current = now;
			void heartbeat({
				workspaceId: convexWorkspaceId,
				docId,
				userId: testIdentity.userId,
				name: testIdentity.name,
				anchor: selection.anchor,
				head: selection.head,
			});
		},
		[convexWorkspaceId, docId, heartbeat, testIdentity],
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
			extensions={[sync.extension, createWebImageExtension()]}
			onPaste={(editor, event) => handleImagePaste({ editor, event })}
			onDrop={(editor, event) => handleImageDrop({ editor, event })}
			onSelectionChange={publishSelection}
			persistChanges={false}
			onLocalChange={syncDocumentId ? noopChange : updateEditorContent}
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
