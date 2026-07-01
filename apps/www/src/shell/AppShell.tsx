import { useAuthToken } from "@convex-dev/auth/react";
import { createConvexSubscriber } from "@hubble.md/convex-client";
import { withMarkdownExtension } from "@hubble.md/editor";
import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { AppShellFrame, Modal, UserBadge } from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import { useMutation, useQuery } from "convex/react";
import {
	Component,
	type ErrorInfo,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import MingcuteAtLine from "~icons/mingcute/at-line";
import MingcuteCloseLine from "~icons/mingcute/close-line";
import MingcuteGroupLine from "~icons/mingcute/group-line";
import MingcuteUserAddLine from "~icons/mingcute/user-add-line";
import type { TestIdentity } from "../App";
import { SignOutButton } from "../auth/AuthScreens";
import { saveWorkspace } from "../connection/connection";
import {
	applyRemoteChange,
	clearCurrentPath,
	getActionCtx,
	loadPath,
	loadWorkspaceSnapshot,
	markRemoteDeleted,
	refreshAssets,
	refreshFiles,
	reloadFromRemote,
	savePathContent,
	teardownActions,
} from "../store/actions";
import { viewerStore, workspaceStore } from "../store/state";
import { EditorView } from "./EditorView";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";

type Props = {
	url: string;
	workspaceId: string;
	filePath: string | null;
	documentId: string | null;
	testIdentity: TestIdentity | null;
	onSelectFile: (path: string) => void;
	onSelectDocument: (documentId: string) => void;
	onSwitch: (id: string) => void;
	onWorkspaceLoaded: (workspaceId: string) => void;
	onDisconnect: () => void;
};

type LiveDocumentErrorBoundaryProps = {
	children: ReactNode;
};

type LiveDocumentErrorBoundaryState = {
	error: Error | null;
};

class LiveDocumentErrorBoundary extends Component<
	LiveDocumentErrorBoundaryProps,
	LiveDocumentErrorBoundaryState
> {
	state: LiveDocumentErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("Live document route failed:", error, info.componentStack);
	}

	render() {
		if (this.state.error) {
			return <LiveDocumentAccessError error={this.state.error} />;
		}
		return this.props.children;
	}
}

export function AppShell({
	url,
	workspaceId,
	filePath,
	documentId,
	testIdentity,
	onSelectFile,
	onSelectDocument,
	onSwitch,
	onWorkspaceLoaded,
	onDisconnect,
}: Props) {
	const viewer = useStoreValue(viewerStore);
	const workspace = useStoreValue(workspaceStore);
	const [newNoteName, setNewNoteName] = useState<string | null>(null);
	const [newNoteSubmitted, setNewNoteSubmitted] = useState(false);
	const newNoteInputRef = useRef<HTMLInputElement>(null);
	// Auth is provided at the router root (App.tsx). The standalone store/sync
	// clients aren't React-context clients, so they need the JWT threaded in
	// explicitly. Test-bootstrap (?test=1) sessions are anonymous (no token).
	const authToken = useAuthToken();

	// biome-ignore lint/correctness/useExhaustiveDependencies: snapshot reloads on workspace identity or auth-token change; file route changes load below
	useEffect(() => {
		// Wait for the JWT before hitting authed workspace queries (skip the wait
		// for anonymous test sessions).
		if (!testIdentity && !authToken) return;
		void loadWorkspaceSnapshot(
			url,
			workspaceId,
			filePath,
			authToken ?? undefined,
		).then((loaded) => {
			if (!loaded) return;
			saveWorkspace(workspaceId);
			onWorkspaceLoaded(workspaceId);
		});
	}, [url, workspaceId, authToken]);

	useEffect(() => {
		if (workspace.snapshot?.id !== workspaceId) return;
		if (documentId) {
			clearCurrentPath();
			return;
		}
		if (filePath) {
			if (viewerStore.get().currentPath !== filePath) void loadPath(filePath);
			return;
		}
		clearCurrentPath();
	}, [documentId, filePath, workspace.snapshot?.id, workspaceId]);

	useEffect(() => {
		return () => {
			teardownActions();
		};
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: subscription owns its lifecycle by url+workspaceId+authToken
	useEffect(() => {
		if (!workspace.snapshot) return;
		const subscriber = createConvexSubscriber(url, authToken ?? undefined);
		const unsubscribe = subscriber.onFilesChanged(
			workspace.snapshot.id,
			() => {
				void onRemoteFilesChanged();
			},
			(err) => {
				console.error("subscription error:", err);
			},
		);
		const unsubscribeAssets = subscriber.onAssetsChanged(
			workspace.snapshot.id,
			() => {
				void refreshAssets();
			},
			(err) => {
				console.error("asset subscription error:", err);
			},
		);
		return () => {
			unsubscribe();
			unsubscribeAssets();
			void subscriber.close();
		};
	}, [url, workspace.snapshot, authToken]);

	useEffect(() => {
		if (newNoteName !== null) {
			requestAnimationFrame(() => newNoteInputRef.current?.focus());
		}
	}, [newNoteName]);

	const newNotePath = normalizeNotePath(newNoteName ?? "");
	const newNoteConflict = workspace.files.some(
		(file) => file.path === newNotePath,
	);
	const showNewNoteConflict = newNoteSubmitted && newNoteConflict;

	const handleNewNote = () => {
		setNewNoteName("");
		setNewNoteSubmitted(false);
	};

	const submitNewNote = async (event: React.FormEvent) => {
		event.preventDefault();
		setNewNoteSubmitted(true);
		const name = (newNoteName ?? "").trim();
		if (!name) return;
		const path = normalizeNotePath(name);
		if (workspace.files.some((file) => file.path === path)) return;
		await savePathContent(path, "");
		setNewNoteName(null);
		setNewNoteSubmitted(false);
		await refreshFiles();
		onSelectFile(path);
	};

	const onRemoteFilesChanged = async () => {
		// Live Documents are cloud-CRDT-rendered (the `documentId` route → the
		// `LiveDocumentView` below), not file-authoritative. They must never run
		// the legacy whole-file `ChangeKind` classification / conflict path
		// (SYNCED-FOLDER §4). `documentId` is the existing signal that the open
		// view is a Live Document; when set, `currentPath` is cleared above.
		if (documentId) return;
		const ctx = getActionCtx();
		if (!ctx) return;
		const remote = await ctx.backend.getFiles(ctx.workspaceId, {
			includeDeleted: true,
		});
		// One tombstone-inclusive fetch updates the sidebar and detects whether
		// the current file was deleted.
		const visible = remote
			.filter((f) => !f.deleted)
			.map((f) => ({
				path: f.path,
				contentHash: f.contentHash,
				updatedAt: f.updatedAt,
				deleted: f.deleted,
			}));
		workspaceStore.set((state) => ({ ...state, files: visible }));

		const v = viewerStore.get();
		if (!v.currentPath) return;
		const current = remote.find((f) => f.path === v.currentPath);
		if (!current || current.deleted) {
			markRemoteDeleted(v.currentPath);
			return;
		}
		applyRemoteChange(v.currentPath, current.content, current.contentHash);
	};

	if (!workspace.snapshot) {
		return (
			<main className="flex h-dvh items-center justify-center bg-background text-foreground">
				<p className="text-sm text-muted-foreground">
					{workspace.status === "error"
						? (workspace.error ?? "Workspace failed to load")
						: "Loading workspace…"}
				</p>
			</main>
		);
	}

	const shellContent = (
		<AppShellContent
			url={url}
			documentId={documentId}
			testIdentity={testIdentity}
			viewer={viewer}
			workspace={workspace}
			newNoteName={newNoteName}
			newNoteInputRef={newNoteInputRef}
			newNotePath={newNotePath}
			showNewNoteConflict={showNewNoteConflict}
			onSelectFile={onSelectFile}
			onSelectDocument={onSelectDocument}
			onSwitch={onSwitch}
			onDisconnect={onDisconnect}
			onNewNote={handleNewNote}
			onSubmitNewNote={submitNewNote}
			onSetNewNoteName={setNewNoteName}
			onReloadWorkspace={() => {
				void loadWorkspaceSnapshot(
					url,
					workspaceId,
					filePath,
					authToken ?? undefined,
				);
			}}
		/>
	);

	// Auth gating + the Convex provider now live at the router root (App.tsx).
	return shellContent;
}

function AppShellContent({
	url,
	documentId,
	testIdentity,
	viewer,
	workspace,
	newNoteName,
	newNoteInputRef,
	newNotePath,
	showNewNoteConflict,
	onSelectFile,
	onSelectDocument,
	onSwitch,
	onDisconnect,
	onNewNote,
	onSubmitNewNote,
	onSetNewNoteName,
	onReloadWorkspace,
}: {
	url: string;
	documentId: string | null;
	testIdentity: TestIdentity | null;
	viewer: ReturnType<typeof viewerStore.get>;
	workspace: ReturnType<typeof workspaceStore.get>;
	newNoteName: string | null;
	newNoteInputRef: React.RefObject<HTMLInputElement | null>;
	newNotePath: string;
	showNewNoteConflict: boolean;
	onSelectFile: (path: string) => void;
	onSelectDocument: (documentId: string) => void;
	onSwitch: (id: string) => void;
	onDisconnect: () => void;
	onNewNote: () => void;
	onSubmitNewNote: (event: React.FormEvent) => void;
	onSetNewNoteName: (name: string | null) => void;
	onReloadWorkspace: () => void;
}) {
	if (!workspace.snapshot) return null;

	return (
		<AppShellFrame
			sidebar={
				<Sidebar
					url={url}
					workspaceId={workspace.snapshot.id}
					workspaceName={workspace.snapshot.name}
					selectedDocumentId={documentId}
					onSelectFile={onSelectFile}
					onSelectDocument={onSelectDocument}
					onSwitch={onSwitch}
					onDisconnect={onDisconnect}
				/>
			}
			toolbar={
				<Toolbar
					onNewNote={onNewNote}
					sessionSlot={
						<div className="flex items-center gap-1">
							<WorkspaceMembersButton workspaceId={workspace.snapshot.id} />
							<CurrentUserBadge testIdentity={testIdentity} />
							{!testIdentity ? <SignOutButton /> : undefined}
						</div>
					}
				/>
			}
		>
			{workspace.status === "error" && workspace.error && (
				<ExternalChangeBanner
					message={workspace.error}
					onReload={onReloadWorkspace}
				/>
			)}
			{newNoteName !== null && (
				<form
					onSubmit={onSubmitNewNote}
					className="border-b border-border bg-muted/40 [padding-block:0.5rem] [padding-inline:0.75rem]"
				>
					<div className="mx-auto flex max-w-3xl items-center gap-2">
						<input
							ref={newNoteInputRef}
							type="text"
							required
							value={newNoteName}
							onChange={(e) => onSetNewNoteName(e.target.value)}
							placeholder="note-name.md"
							aria-invalid={showNewNoteConflict}
							aria-describedby={
								showNewNoteConflict ? "new-note-conflict" : undefined
							}
							className="flex-1 rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.25rem] [padding-inline:0.5rem]"
						/>
						<button
							type="submit"
							className="rounded-sm bg-primary text-xs font-medium text-primary-foreground [padding-block:0.25rem] [padding-inline:0.75rem]"
						>
							Create
						</button>
						<button
							type="button"
							onClick={() => onSetNewNoteName(null)}
							className="rounded-sm text-xs text-muted-foreground hover:bg-sidebar-accent [padding-block:0.25rem] [padding-inline:0.75rem]"
						>
							Cancel
						</button>
					</div>
					{showNewNoteConflict && (
						<p
							id="new-note-conflict"
							className="mx-auto mt-2 max-w-3xl text-sm text-destructive"
						>
							A file named {newNotePath} already exists.
						</p>
					)}
				</form>
			)}
			{documentId && (
				<LiveDocumentErrorBoundary key={documentId}>
					<LiveDocumentView
						workspaceId={workspace.snapshot.id}
						documentId={documentId}
						testIdentity={testIdentity}
					/>
				</LiveDocumentErrorBoundary>
			)}
			{!documentId && viewer.currentPath && (
				<div className="flex h-full min-h-0 flex-col">
					{testIdentity && (
						<LivePocIdentityBar
							workspaceId={workspace.snapshot.id}
							path={viewer.currentPath}
							identity={testIdentity}
						/>
					)}
					{viewer.externalChange.kind === "conflict" && (
						<ExternalChangeBanner
							message="Remote changes available. Reload to accept."
							onReload={reloadFromRemote}
						/>
					)}
					{viewer.externalChange.kind === "deleted" && (
						<ExternalChangeBanner
							message="This file was deleted remotely. Reload before editing."
							onReload={() => {
								if (viewer.currentPath) void loadPath(viewer.currentPath);
							}}
						/>
					)}
					<EditorView
						workspaceId={workspace.snapshot.id}
						path={viewer.currentPath}
						initialMarkdown={viewer.content}
						testIdentity={testIdentity}
					/>
				</div>
			)}
			{!documentId && !viewer.currentPath && viewer.status === "loading" && (
				<p className="[padding:1.5rem] text-sm text-muted-foreground">
					Loading…
				</p>
			)}
			{!documentId && !viewer.currentPath && viewer.status === "error" && (
				<p className="[padding:1.5rem] text-sm text-destructive">
					{viewer.error}
				</p>
			)}
			{!documentId &&
				!viewer.currentPath &&
				viewer.status !== "loading" &&
				viewer.status !== "error" &&
				workspace.filesLoaded && (
					<div className="flex h-full items-center justify-center [padding:1.5rem]">
						<p className="text-sm text-muted-foreground">
							Select a file, or create a new one with +.
						</p>
					</div>
				)}
		</AppShellFrame>
	);
}

function CurrentUserBadge({
	testIdentity,
}: {
	testIdentity: TestIdentity | null;
}) {
	const viewer = useQuery(api.viewer.me, testIdentity ? "skip" : {});
	if (testIdentity) {
		return <UserBadge user={{ name: testIdentity.name }} />;
	}
	if (!viewer) return null;
	return <UserBadge user={viewer} />;
}

function LiveDocumentAccessError({ error }: { error: Error }) {
	const message = error.message.toLowerCase();
	const isUnauthorized = message.includes("unauthorized");
	return (
		<div className="flex h-full items-center justify-center [padding-block:1.5rem] [padding-inline:1.5rem]">
			<div className="max-w-md rounded-sm border border-border bg-background [padding-block:1rem] [padding-inline:1rem]">
				<p className="m-0 text-sm font-medium text-foreground">
					{isUnauthorized
						? "You do not have access to this document."
						: "Document failed to load."}
				</p>
				<p className="m-0 text-sm text-muted-foreground [margin-block-start:0.5rem]">
					{isUnauthorized
						? "Ask the owner to share it with your account, or enable public link access before sending the link."
						: error.message}
				</p>
			</div>
		</div>
	);
}

function LiveDocumentView({
	workspaceId,
	documentId,
	testIdentity,
}: {
	workspaceId: string;
	documentId: string;
	testIdentity: TestIdentity | null;
}) {
	const document = useQuery(api.documents.getWithMarkdown, {
		documentId: documentId as Id<"documents">,
	});
	const suggestions = useQuery(api.documents.listSuggestions, {
		documentId: documentId as Id<"documents">,
	});
	const currentViewer = useQuery(api.viewer.me, testIdentity ? "skip" : {});
	const markEdited = useMutation(api.documents.markEdited);
	const lastEditMarkRef = useRef(0);
	const pendingSuggestions =
		suggestions?.filter((suggestion) => suggestion.status === "pending") ?? [];
	// Live Documents must not follow mutable path/title metadata; the Convex
	// document ID is the stable collaboration authority.
	const syncDocId = `document:${documentId}`;
	const markLiveDocumentEdited = useCallback(() => {
		const now = Date.now();
		if (now - lastEditMarkRef.current < 5_000) return;
		lastEditMarkRef.current = now;
		void markEdited({
			documentId: documentId as Id<"documents">,
			actor: testIdentity?.name,
		});
	}, [documentId, markEdited, testIdentity?.name]);

	// Track editor selection for comment anchoring (v1: lifted from EditorView).
	const selectionRef = useRef<{ anchor: number; head: number }>({
		anchor: 0,
		head: 0,
	});
	const handleSelectionChange = useCallback(
		(selection: { anchor: number; head: number }) => {
			selectionRef.current = selection;
		},
		[],
	);

	if (document === undefined) {
		return (
			<div className="flex h-full items-center justify-center [padding:1.5rem]">
				<p className="text-sm text-muted-foreground">Loading document…</p>
			</div>
		);
	}

	if (document === null) {
		return (
			<div className="flex h-full items-center justify-center [padding:1.5rem]">
				<p className="text-sm text-muted-foreground">Document not found.</p>
			</div>
		);
	}

	const path = document.path ?? withMarkdownExtension(document.title);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<LivePresenceBar
				workspaceId={workspaceId}
				docId={syncDocId}
				testIdentity={testIdentity}
				currentViewer={currentViewer}
			/>
			<div className="border-b border-border bg-muted/30">
				<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground [padding-block:0.5rem] [padding-inline:0.75rem]">
					<span className="font-medium text-foreground">{document.title}</span>
					<div className="flex items-center gap-2">
						<VersionHistoryButton
							documentId={documentId}
							testIdentity={testIdentity}
						/>
						<CommentsButton
							documentId={documentId}
							testIdentity={testIdentity}
							getSelection={() => selectionRef.current}
						/>
						<ActivityButton documentId={documentId} />
						{pendingSuggestions.length > 0 && (
							<SuggestionsReviewButton
								documentTitle={document.title}
								suggestions={pendingSuggestions}
							/>
						)}
						<span>
							{formatEditedMeta(document.updatedAt, document.updatedBy)}
						</span>
					</div>
				</div>
			</div>
			<EditorView
				workspaceId={workspaceId}
				path={path}
				initialMarkdown={document.markdown}
				syncDocumentId={syncDocId}
				testIdentity={testIdentity}
				onLiveDocumentEdit={markLiveDocumentEdited}
				onSelectionChange={handleSelectionChange}
			/>
		</div>
	);
}

function SuggestionsReviewButton({
	documentTitle,
	suggestions,
}: {
	documentTitle: string;
	suggestions: Array<{
		_id: Id<"documentSuggestions">;
		actor?: string;
		baseRevision: number;
		intent: unknown;
	}>;
}) {
	const [open, setOpen] = useState(false);
	const acceptSuggestion = useMutation(api.documents.acceptSuggestion);
	const rejectSuggestion = useMutation(api.documents.rejectSuggestion);
	const [busyId, setBusyId] = useState<string | null>(null);

	const runSuggestionAction = async (
		suggestionId: Id<"documentSuggestions">,
		action: "accept" | "reject",
	) => {
		setBusyId(suggestionId);
		try {
			if (action === "accept") {
				await acceptSuggestion({ suggestionId });
			} else {
				await rejectSuggestion({ suggestionId });
			}
		} finally {
			setBusyId(null);
		}
	};

	return (
		<>
			<button
				type="button"
				className="rounded-sm border border-border bg-background text-xs font-medium text-foreground hover:bg-accent [padding-block:0.25rem] [padding-inline:0.5rem]"
				onClick={() => setOpen(true)}
			>
				{suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}
			</button>
			<Modal
				open={open}
				onOpenChange={setOpen}
				title={`Suggestions for ${documentTitle}`}
				description="Review proposed agent changes before applying them."
			>
				<div className="flex flex-col gap-2">
					{suggestions.map((suggestion) => (
						<div
							key={suggestion._id}
							className="rounded-sm border border-border bg-background [padding-block:0.75rem] [padding-inline:0.75rem]"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div>
									<p className="m-0 text-xs font-medium text-foreground">
										{suggestion.actor ?? "Agent"}
									</p>
									<p className="m-0 mt-1 text-[11px] text-muted-foreground">
										Base revision {suggestion.baseRevision}
									</p>
								</div>
								<div className="flex gap-1">
									<button
										type="button"
										disabled={busyId === suggestion._id}
										className="rounded-sm bg-primary text-xs font-medium text-primary-foreground disabled:opacity-50 [padding-block:0.375rem] [padding-inline:0.625rem]"
										onClick={() =>
											void runSuggestionAction(suggestion._id, "accept")
										}
									>
										Accept
									</button>
									<button
										type="button"
										disabled={busyId === suggestion._id}
										className="rounded-sm text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 [padding-block:0.375rem] [padding-inline:0.625rem]"
										onClick={() =>
											void runSuggestionAction(suggestion._id, "reject")
										}
									>
										Reject
									</button>
								</div>
							</div>
							<pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-sm bg-muted text-[11px] text-muted-foreground [padding-block:0.5rem] [padding-inline:0.5rem]">
								{describeSuggestionIntent(suggestion.intent)}
							</pre>
						</div>
					))}
				</div>
			</Modal>
		</>
	);
}

function describeSuggestionIntent(intent: unknown): string {
	if (!intent || typeof intent !== "object") return "Unknown suggestion";
	if (!("kind" in intent) || typeof intent.kind !== "string") {
		return JSON.stringify(intent, null, 2);
	}
	if (intent.kind === "insert-after-heading" && "heading" in intent) {
		return `Insert after heading: ${String(intent.heading)}`;
	}
	if (intent.kind === "append-markdown") return "Append markdown";
	if (intent.kind === "replace-document") return "Replace document";
	return intent.kind;
}

function VersionHistoryButton({
	documentId,
	testIdentity,
}: {
	documentId: string;
	testIdentity: TestIdentity | null;
}) {
	const [open, setOpen] = useState(false);
	const revisions = useQuery(api.documents.listRevisions, {
		documentId: documentId as Id<"documents">,
	});
	const restoreRevision = useMutation(api.documents.restoreRevision);
	const [busyId, setBusyId] = useState<string | null>(null);

	const handleRestore = async (revisionId: Id<"revisions">) => {
		setBusyId(revisionId);
		try {
			await restoreRevision({
				revisionId,
				actor: testIdentity?.name ?? undefined,
			});
			setOpen(false);
		} finally {
			setBusyId(null);
		}
	};

	return (
		<>
			<button
				type="button"
				className="rounded-sm border border-border bg-background text-xs font-medium text-foreground hover:bg-accent [padding-block:0.25rem] [padding-inline:0.5rem]"
				onClick={() => setOpen(true)}
			>
				History
			</button>
			<Modal
				open={open}
				onOpenChange={setOpen}
				title="Version history"
				description="Browse and restore earlier versions of this document."
				className="max-w-lg"
			>
				{revisions === undefined ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : revisions.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No saved revisions yet.
					</p>
				) : (
					<div className="flex flex-col gap-2">
						{revisions.map((revision) => (
							<div
								key={revision._id}
								className="rounded-sm border border-border bg-background [padding-block:0.75rem] [padding-inline:0.75rem]"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div>
										<p className="m-0 text-xs font-medium text-foreground">
											{revision.label ?? revision.actor ?? "Snapshot"}
										</p>
										<p className="m-0 mt-0.5 text-[11px] text-muted-foreground">
											{formatRevisionDate(revision.createdAt)}
											{revision.actor && revision.label
												? ` · ${revision.actor}`
												: ""}
											{" · "}rev {revision.revision}
										</p>
									</div>
									<button
										type="button"
										disabled={busyId !== null}
										className="rounded-sm bg-primary text-xs font-medium text-primary-foreground disabled:opacity-50 [padding-block:0.375rem] [padding-inline:0.625rem]"
										onClick={() => void handleRestore(revision._id)}
									>
										{busyId === revision._id ? "Restoring…" : "Restore"}
									</button>
								</div>
								{revision.markdown.length > 0 && (
									<pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-sm bg-muted text-[11px] text-muted-foreground [padding-block:0.5rem] [padding-inline:0.5rem]">
										{revision.markdown.slice(0, 400)}
										{revision.markdown.length > 400 ? "…" : ""}
									</pre>
								)}
							</div>
						))}
					</div>
				)}
			</Modal>
		</>
	);
}

function formatRevisionDate(ms: number): string {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(ms));
}

// ── Task B: Comments UI ──────────────────────────────────────────────────────

function CommentsButton({
	documentId,
	testIdentity,
	getSelection,
}: {
	documentId: string;
	testIdentity: TestIdentity | null;
	getSelection: () => { anchor: number; head: number };
}) {
	const [open, setOpen] = useState(false);
	const threads = useQuery(api.documents.listCommentThreads, {
		documentId: documentId as Id<"documents">,
	});
	const createThread = useMutation(api.documents.createCommentThread);
	const replyToThread = useMutation(api.documents.replyToCommentThread);
	const resolveThread = useMutation(api.documents.resolveCommentThread);
	const mentionCandidates = useQuery(
		api.documents.listMentionCandidates,
		open ? { documentId: documentId as Id<"documents"> } : "skip",
	);
	const [newBody, setNewBody] = useState("");
	const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);

	const activeThreads =
		threads?.filter((t) => t.resolvedAt === undefined) ?? [];
	const resolvedThreads =
		threads?.filter((t) => t.resolvedAt !== undefined) ?? [];
	const threadCount = activeThreads.length;

	const handleCreateThread = async () => {
		const body = newBody.trim();
		if (!body) return;
		setBusy(true);
		try {
			const sel = getSelection();
			await createThread({
				documentId: documentId as Id<"documents">,
				anchor: { from: sel.anchor, to: sel.head },
				body,
				actor: testIdentity?.name ?? undefined,
			});
			setNewBody("");
		} finally {
			setBusy(false);
		}
	};

	const handleReply = async (threadId: Id<"commentThreads">) => {
		const body = (replyBodies[threadId] ?? "").trim();
		if (!body) return;
		setBusy(true);
		try {
			await replyToThread({
				threadId,
				body,
				actor: testIdentity?.name ?? undefined,
			});
			setReplyBodies((prev) => ({ ...prev, [threadId]: "" }));
		} finally {
			setBusy(false);
		}
	};

	const handleResolve = async (threadId: Id<"commentThreads">) => {
		setBusy(true);
		try {
			await resolveThread({
				threadId,
				actor: testIdentity?.name ?? undefined,
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<button
				type="button"
				className="rounded-sm border border-border bg-background text-xs font-medium text-foreground hover:bg-accent [padding-block:0.25rem] [padding-inline:0.5rem]"
				onClick={() => setOpen(true)}
			>
				{threadCount > 0
					? `${threadCount} comment${threadCount === 1 ? "" : "s"}`
					: "Comments"}
			</button>
			<Modal
				open={open}
				onOpenChange={setOpen}
				title="Comments"
				description="Threads on this document. Select text before adding a comment to anchor it."
				className="max-w-lg"
			>
				<div className="flex flex-col gap-3">
					{/* New comment composer */}
					<div className="rounded-sm border border-border bg-background [padding-block:0.75rem] [padding-inline:0.75rem]">
						<p className="m-0 mb-1 text-xs font-medium text-foreground">
							New comment
						</p>
						<textarea
							value={newBody}
							onChange={(e) => setNewBody(e.target.value)}
							placeholder="Add a comment… (@name to mention)"
							rows={2}
							className="w-full resize-none rounded-sm border border-border bg-muted/30 text-xs text-foreground outline-none focus:border-ring [padding-block:0.375rem] [padding-inline:0.5rem]"
						/>
						<MentionPicker
							value={newBody}
							onChange={setNewBody}
							candidates={mentionCandidates}
						/>
						<button
							type="button"
							disabled={busy || !newBody.trim()}
							onClick={() => void handleCreateThread()}
							className="mt-1 rounded-sm bg-primary text-xs font-medium text-primary-foreground disabled:opacity-50 [padding-block:0.375rem] [padding-inline:0.625rem]"
						>
							Comment
						</button>
					</div>

					{/* Active threads */}
					{threads === undefined ? (
						<p className="text-sm text-muted-foreground">Loading…</p>
					) : activeThreads.length === 0 && resolvedThreads.length === 0 ? (
						<p className="text-sm text-muted-foreground">No comments yet.</p>
					) : null}

					{activeThreads.map((thread) => (
						<div
							key={thread._id}
							className="rounded-sm border border-border bg-background [padding-block:0.75rem] [padding-inline:0.75rem]"
						>
							{thread.comments.map((comment) => (
								<div key={comment._id} className="mb-2 last:mb-0">
									<div className="flex items-baseline justify-between gap-2">
										<span className="text-xs font-medium text-foreground">
											{comment.author}
										</span>
										<span className="text-[10px] text-muted-foreground">
											{formatRevisionDate(comment.createdAt)}
										</span>
									</div>
									<p className="m-0 mt-0.5 whitespace-pre-wrap text-xs text-foreground">
										{comment.body}
									</p>
								</div>
							))}
							<div className="mt-2 flex gap-1 border-t border-border [padding-block-start:0.5rem]">
								<input
									type="text"
									value={replyBodies[thread._id] ?? ""}
									onChange={(e) =>
										setReplyBodies((prev) => ({
											...prev,
											[thread._id]: e.target.value,
										}))
									}
									placeholder="Reply…"
									className="min-w-0 flex-1 rounded-sm border border-border bg-muted/30 text-xs text-foreground outline-none focus:border-ring [padding-block:0.25rem] [padding-inline:0.375rem]"
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault();
											void handleReply(thread._id);
										}
									}}
								/>
								<MentionPicker
									value={replyBodies[thread._id] ?? ""}
									onChange={(nextValue) =>
										setReplyBodies((prev) => ({
											...prev,
											[thread._id]: nextValue,
										}))
									}
									candidates={mentionCandidates}
									compact
								/>
								<button
									type="button"
									disabled={busy || !(replyBodies[thread._id] ?? "").trim()}
									onClick={() => void handleReply(thread._id)}
									className="rounded-sm bg-muted text-xs text-foreground hover:bg-accent disabled:opacity-50 [padding-block:0.25rem] [padding-inline:0.375rem]"
								>
									Reply
								</button>
								<button
									type="button"
									disabled={busy}
									onClick={() => void handleResolve(thread._id)}
									className="rounded-sm text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 [padding-block:0.25rem] [padding-inline:0.375rem]"
								>
									Resolve
								</button>
							</div>
						</div>
					))}

					{/* Resolved threads (collapsed summary) */}
					{resolvedThreads.length > 0 && (
						<p className="text-[11px] text-muted-foreground">
							{resolvedThreads.length} resolved thread
							{resolvedThreads.length === 1 ? "" : "s"} hidden.
						</p>
					)}
				</div>
			</Modal>
		</>
	);
}

type MentionCandidate = {
	userId: Id<"users">;
	name?: string;
	email?: string;
	token: string | null;
};

function MentionPicker({
	value,
	onChange,
	candidates,
	compact = false,
}: {
	value: string;
	onChange: (value: string) => void;
	candidates: MentionCandidate[] | undefined;
	compact?: boolean;
}) {
	const query = currentMentionQuery(value);
	const matches = useMemo(() => {
		if (query === null || !candidates) return [];
		const normalized = query.toLowerCase();
		return candidates
			.filter((candidate) => {
				if (!candidate.token) return false;
				const label = `${candidate.name ?? ""} ${candidate.email ?? ""} ${candidate.token}`;
				return label.toLowerCase().includes(normalized);
			})
			.slice(0, compact ? 2 : 4);
	}, [candidates, compact, query]);

	if (query === null || matches.length === 0) return null;

	return (
		<div
			className={
				compact
					? "flex shrink-0 items-center gap-1"
					: "mt-1 flex flex-wrap items-center gap-1"
			}
		>
			{!compact ? (
				<span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
					<MingcuteAtLine className="size-3.5" />
					Mention
				</span>
			) : null}
			{matches.map((candidate) => (
				<button
					key={candidate.userId}
					type="button"
					onClick={() => onChange(insertMention(value, candidate.token ?? ""))}
					className="max-w-36 truncate rounded-sm border border-border bg-muted text-[11px] text-foreground hover:bg-accent [padding-block:0.1875rem] [padding-inline:0.375rem]"
				>
					@{candidate.token}
				</button>
			))}
		</div>
	);
}

function currentMentionQuery(value: string): string | null {
	const match = /(^|\s)@([a-zA-Z0-9._%+-]*)$/.exec(value);
	return match ? (match[2] ?? "") : null;
}

function insertMention(value: string, token: string): string {
	return value.replace(/(^|\s)@([a-zA-Z0-9._%+-]*)$/, `$1@${token} `);
}

// ── Task C: Activity feed UI ──────────────────────────────────────────────────

function ActivityButton({ documentId }: { documentId: string }) {
	const [open, setOpen] = useState(false);
	const activity = useQuery(
		api.documents.listActivity,
		open ? { documentId: documentId as Id<"documents"> } : "skip",
	);

	return (
		<>
			<button
				type="button"
				className="rounded-sm border border-border bg-background text-xs font-medium text-foreground hover:bg-accent [padding-block:0.25rem] [padding-inline:0.5rem]"
				onClick={() => setOpen(true)}
			>
				Activity
			</button>
			<Modal
				open={open}
				onOpenChange={setOpen}
				title="Activity"
				description="Recent events on this document."
				className="max-w-lg"
			>
				{activity === undefined ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : activity.length === 0 ? (
					<p className="text-sm text-muted-foreground">No activity yet.</p>
				) : (
					<div className="flex max-h-96 flex-col gap-1 overflow-auto">
						{activity.map((event) => (
							<div
								key={event._id}
								className="flex items-start gap-2 rounded-sm bg-muted/40 [padding-block:0.5rem] [padding-inline:0.625rem]"
							>
								<div className="min-w-0 flex-1">
									<p className="m-0 text-xs text-foreground">{event.message}</p>
									<p className="m-0 mt-0.5 text-[10px] text-muted-foreground">
										{event.actor}
										{" · "}
										{formatRevisionDate(event.createdAt)}
									</p>
								</div>
							</div>
						))}
					</div>
				)}
				<p className="mt-3 text-[10px] text-muted-foreground">
					Note: notification bell requires an authenticated session and is not
					demoable under ?test=1.
				</p>
			</Modal>
		</>
	);
}

function formatEditedMeta(updatedAt: number, updatedBy?: string) {
	const editedAt = new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(updatedAt));
	return updatedBy
		? `Last edited by ${updatedBy} at ${editedAt}`
		: `Last edited ${editedAt}`;
}

type WorkspaceRole = "owner" | "admin" | "member";

function WorkspaceMembersButton({ workspaceId }: { workspaceId: string }) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<WorkspaceRole>("member");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const members = useQuery(
		api.sync.listWorkspaceMembers,
		open ? { workspaceId: workspaceId as Id<"workspaces"> } : "skip",
	);
	const invites = useQuery(
		api.members.listWorkspaceInvites,
		open ? { workspaceId: workspaceId as Id<"workspaces"> } : "skip",
	);
	const inviteMember = useMutation(api.members.inviteWorkspaceMember);
	const setMemberRole = useMutation(api.members.setWorkspaceMemberRole);
	const removeMember = useMutation(api.members.removeWorkspaceMember);
	const revokeInvite = useMutation(api.members.revokeWorkspaceInvite);

	const run = async (action: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await action();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Action failed");
		} finally {
			setBusy(false);
		}
	};

	const submitInvite = async (event: React.FormEvent) => {
		event.preventDefault();
		const trimmed = email.trim();
		if (!trimmed) return;
		await run(async () => {
			await inviteMember({
				workspaceId: workspaceId as Id<"workspaces">,
				email: trimmed,
				role,
			});
			setEmail("");
			setRole("member");
		});
	};

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border bg-background text-xs font-medium text-foreground hover:bg-accent [padding-inline:0.625rem]"
			>
				<MingcuteGroupLine className="size-4" />
				Members
			</button>
			<Modal
				open={open}
				onOpenChange={setOpen}
				title="Workspace members"
				description="Invite collaborators and manage workspace roles."
				className="max-w-xl"
			>
				<form
					onSubmit={(event) => void submitInvite(event)}
					className="grid gap-2 rounded-sm border border-border bg-background [padding-block:0.75rem] [padding-inline:0.75rem]"
				>
					<label
						htmlFor="workspace-member-email"
						className="text-xs font-medium text-foreground"
					>
						Invite by email
					</label>
					<div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
						<input
							id="workspace-member-email"
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							placeholder="person@example.com"
							className="min-h-9 rounded-sm border border-border bg-muted/30 text-xs text-foreground outline-none focus:border-ring [padding-block:0.375rem] [padding-inline:0.5rem]"
						/>
						<RoleSelect
							value={role}
							onChange={(nextRole) => setRole(nextRole)}
							disabled={busy}
						/>
						<button
							type="submit"
							disabled={busy || !email.trim()}
							className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-sm bg-primary text-xs font-medium text-primary-foreground disabled:opacity-50 [padding-inline:0.75rem]"
						>
							<MingcuteUserAddLine className="size-4" />
							Invite
						</button>
					</div>
					{error ? (
						<p className="m-0 text-xs text-destructive">{error}</p>
					) : null}
				</form>

				<div className="mt-3 grid gap-2">
					{members === undefined ? (
						<p className="text-sm text-muted-foreground">Loading members…</p>
					) : members.length === 0 ? (
						<p className="text-sm text-muted-foreground">No members yet.</p>
					) : (
						members.map((member) => (
							<div
								key={member._id}
								className="grid gap-2 rounded-sm border border-border bg-background [padding-block:0.75rem] [padding-inline:0.75rem] sm:grid-cols-[1fr_8rem_auto]"
							>
								<div className="min-w-0">
									<p className="m-0 truncate text-xs font-medium text-foreground">
										{member.user?.name ?? member.user?.email ?? "Unknown user"}
									</p>
									<p className="m-0 mt-0.5 truncate text-[11px] text-muted-foreground">
										{member.user?.email ?? member.role}
									</p>
								</div>
								<RoleSelect
									value={member.role}
									onChange={(nextRole) =>
										void run(() =>
											setMemberRole({
												workspaceId: workspaceId as Id<"workspaces">,
												userId: member.userId,
												role: nextRole,
											}),
										)
									}
									disabled={busy}
								/>
								<button
									type="button"
									disabled={busy}
									onClick={() =>
										void run(() =>
											removeMember({
												workspaceId: workspaceId as Id<"workspaces">,
												userId: member.userId,
											}),
										)
									}
									className="inline-flex min-h-9 items-center justify-center rounded-sm text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 [padding-inline:0.625rem]"
								>
									<MingcuteCloseLine className="size-4" />
									<span className="sr-only">Remove member</span>
								</button>
							</div>
						))
					)}
				</div>

				{invites !== undefined && invites.length > 0 ? (
					<div className="mt-4 grid gap-2">
						<p className="m-0 text-xs font-medium text-muted-foreground">
							Pending invites
						</p>
						{invites.map((invite) => (
							<div
								key={invite._id}
								className="flex items-center justify-between gap-2 rounded-sm bg-muted/40 [padding-block:0.5rem] [padding-inline:0.625rem]"
							>
								<span className="min-w-0 truncate text-xs text-foreground">
									{invite.email} · {invite.workspaceRole}
								</span>
								<button
									type="button"
									disabled={busy}
									onClick={() =>
										void run(() =>
											revokeInvite({
												workspaceId: workspaceId as Id<"workspaces">,
												inviteId: invite._id,
											}),
										)
									}
									className="rounded-sm text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 [padding-block:0.25rem] [padding-inline:0.375rem]"
								>
									Revoke
								</button>
							</div>
						))}
					</div>
				) : null}
			</Modal>
		</>
	);
}

function RoleSelect({
	value,
	onChange,
	disabled,
}: {
	value: WorkspaceRole;
	onChange: (role: WorkspaceRole) => void;
	disabled?: boolean;
}) {
	return (
		<select
			value={value}
			disabled={disabled}
			onChange={(event) => onChange(event.target.value as WorkspaceRole)}
			className="min-h-9 rounded-sm border border-border bg-muted/30 text-xs text-foreground outline-none focus:border-ring disabled:opacity-50 [padding-block:0.375rem] [padding-inline:0.5rem]"
		>
			<option value="member">Member</option>
			<option value="admin">Admin</option>
			<option value="owner">Owner</option>
		</select>
	);
}

function normalizeNotePath(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return "";
	return withMarkdownExtension(trimmed);
}

function LivePocIdentityBar({
	workspaceId,
	path,
	docId: providedDocId,
	identity,
}: {
	workspaceId: string;
	path?: string;
	docId?: string;
	identity: TestIdentity;
}) {
	const docId = useMemo(
		() => providedDocId ?? `poc:${workspaceId}:${path ?? ""}`,
		[providedDocId, workspaceId, path],
	);
	return (
		<LivePresenceBar
			workspaceId={workspaceId}
			docId={docId}
			testIdentity={identity}
			currentViewer={null}
		/>
	);
}

function LivePresenceBar({
	workspaceId,
	docId,
	testIdentity,
	currentViewer,
}: {
	workspaceId: string;
	docId: string;
	testIdentity: TestIdentity | null;
	currentViewer:
		| {
				_id: Id<"users">;
				name?: string;
				email?: string;
		  }
		| null
		| undefined;
}) {
	const convexWorkspaceId = workspaceId as Id<"workspaces">;
	const heartbeat = useMutation(api.pocIdentity.heartbeat);
	const activeUsers = useQuery(api.pocIdentity.listActive, { docId });
	const currentUserId = testIdentity?.userId ?? currentViewer?._id;
	const currentName =
		testIdentity?.name ??
		currentViewer?.name ??
		currentViewer?.email ??
		"Collaborator";

	useEffect(() => {
		let cancelled = false;
		const beat = () => {
			if (cancelled) return;
			const payload = testIdentity
				? {
						workspaceId: convexWorkspaceId,
						docId,
						userId: testIdentity.userId,
						name: testIdentity.name,
					}
				: { workspaceId: convexWorkspaceId, docId };
			void heartbeat(payload).catch((error) => {
				console.error("Presence heartbeat failed:", error);
			});
		};
		beat();
		const interval = window.setInterval(beat, 10_000);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [convexWorkspaceId, docId, heartbeat, testIdentity]);

	const collaborators = activeUsers?.map((user) =>
		user.userId === currentUserId ? `${user.name} (you)` : user.name,
	) ?? [`${currentName} (you)`];

	return (
		<div className="border-b border-border bg-muted/40">
			<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground [padding-block:0.5rem] [padding-inline:0.75rem]">
				<span>
					{testIdentity
						? `POC identity: ${testIdentity.name}`
						: "Live presence"}
				</span>
				<span>{collaborators.join(", ")}</span>
			</div>
		</div>
	);
}

function ExternalChangeBanner({
	message,
	onReload,
}: {
	message: string;
	onReload: () => void;
}) {
	return (
		<div className="border-b border-border bg-muted/40">
			<div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
				<p className="m-0 text-sm text-muted-foreground">{message}</p>
				<button
					type="button"
					onClick={onReload}
					className="rounded-sm border border-border bg-background px-3 py-1 text-xs hover:bg-sidebar-accent"
				>
					Reload
				</button>
			</div>
		</div>
	);
}
