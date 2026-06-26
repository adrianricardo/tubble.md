import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { createConvexSubscriber } from "@hubble.md/convex-client";
import { withMarkdownExtension } from "@hubble.md/editor";
import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { AppShellFrame, Modal } from "@hubble.md/ui";
import { useStoreValue } from "@simplestack/store/react";
import {
	Authenticated,
	AuthLoading,
	ConvexReactClient,
	Unauthenticated,
	useMutation,
	useQuery,
} from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TestIdentity } from "../App";
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
	const convexClient = useMemo(() => new ConvexReactClient(url), [url]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: snapshot reloads only when workspace identity changes; file route changes load below
	useEffect(() => {
		void loadWorkspaceSnapshot(url, workspaceId, filePath).then((loaded) => {
			if (!loaded) return;
			saveWorkspace(workspaceId);
			onWorkspaceLoaded(workspaceId);
		});
	}, [url, workspaceId]);

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: subscription owns its lifecycle by url+workspaceId
	useEffect(() => {
		if (!workspace.snapshot) return;
		const subscriber = createConvexSubscriber(url);
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
	}, [url, workspace.snapshot]);

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

	return (
		<ConvexAuthProvider client={convexClient}>
			{testIdentity ? (
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
						void loadWorkspaceSnapshot(url, workspaceId, filePath);
					}}
				/>
			) : (
				<>
					<AuthLoading>
						<AuthStatus message="Checking session…" />
					</AuthLoading>
					<Unauthenticated>
						<SignInScreen />
					</Unauthenticated>
					<Authenticated>
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
								void loadWorkspaceSnapshot(url, workspaceId, filePath);
							}}
						/>
					</Authenticated>
				</>
			)}
		</ConvexAuthProvider>
	);
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
					sessionSlot={!testIdentity ? <SignOutButton /> : undefined}
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
				<LiveDocumentView
					workspaceId={workspace.snapshot.id}
					documentId={documentId}
					testIdentity={testIdentity}
				/>
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

function SignInScreen() {
	const { signIn } = useAuthActions();
	const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const submit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		setPending(true);
		const formData = new FormData(event.currentTarget);
		formData.set("flow", mode);
		try {
			await signIn("password", formData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Sign in failed");
		} finally {
			setPending(false);
		}
	};

	return (
		<main className="flex h-dvh items-center justify-center bg-background text-foreground [padding-block:1.5rem] [padding-inline:1.5rem]">
			<form
				onSubmit={submit}
				className="w-full max-w-sm rounded-sm border border-border bg-card [padding-block:1rem] [padding-inline:1rem]"
			>
				<h1 className="text-base font-semibold text-foreground">
					{mode === "signIn" ? "Sign in to Hubble" : "Create your account"}
				</h1>
				<label
					htmlFor="auth-email"
					className="mt-4 block text-sm font-medium text-foreground"
				>
					Email
				</label>
				<input
					id="auth-email"
					name="email"
					type="email"
					required
					autoComplete="email"
					className="mt-2 w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
				/>
				{mode === "signUp" && (
					<>
						<label
							htmlFor="auth-name"
							className="mt-3 block text-sm font-medium text-foreground"
						>
							Name
						</label>
						<input
							id="auth-name"
							name="name"
							type="text"
							required
							autoComplete="name"
							className="mt-2 w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
						/>
					</>
				)}
				<label
					htmlFor="auth-password"
					className="mt-3 block text-sm font-medium text-foreground"
				>
					Password
				</label>
				<input
					id="auth-password"
					name="password"
					type="password"
					required
					autoComplete={mode === "signIn" ? "current-password" : "new-password"}
					className="mt-2 w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
				/>
				{error && <p className="mt-3 text-sm text-destructive">{error}</p>}
				<button
					type="submit"
					disabled={pending}
					className="mt-4 w-full rounded-sm bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60 [padding-block:0.5rem] [padding-inline:0.75rem]"
				>
					{pending ? "Working…" : mode === "signIn" ? "Sign in" : "Sign up"}
				</button>
				<button
					type="button"
					onClick={() => {
						setError(null);
						setMode(mode === "signIn" ? "signUp" : "signIn");
					}}
					className="mt-3 w-full rounded-sm text-sm text-muted-foreground hover:bg-sidebar-accent [padding-block:0.5rem] [padding-inline:0.75rem]"
				>
					{mode === "signIn" ? "Create an account" : "Sign in instead"}
				</button>
			</form>
		</main>
	);
}

function SignOutButton() {
	const { signOut } = useAuthActions();
	return (
		<button
			type="button"
			onClick={() => void signOut()}
			className="rounded-sm text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground [padding-block:0.25rem] [padding-inline:0.5rem]"
		>
			Sign out
		</button>
	);
}

function AuthStatus({ message }: { message: string }) {
	return (
		<main className="flex h-dvh items-center justify-center bg-background text-foreground">
			<p className="text-sm text-muted-foreground">{message}</p>
		</main>
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
			actor: testIdentity?.name ?? "Local collaborator",
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
			{testIdentity && (
				<LivePocIdentityBar
					workspaceId={workspaceId}
					docId={syncDocId}
					identity={testIdentity}
				/>
			)}
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
	const convexWorkspaceId = workspaceId as Id<"workspaces">;
	const heartbeat = useMutation(api.pocIdentity.heartbeat);
	const activeUsers = useQuery(api.pocIdentity.listActive, { docId });

	useEffect(() => {
		let cancelled = false;
		const beat = () => {
			if (cancelled) return;
			void heartbeat({
				workspaceId: convexWorkspaceId,
				docId,
				userId: identity.userId,
				name: identity.name,
			});
		};
		beat();
		const interval = window.setInterval(beat, 10_000);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [convexWorkspaceId, docId, heartbeat, identity.name, identity.userId]);

	const collaborators = activeUsers?.map((user) =>
		user.userId === identity.userId ? `${user.name} (you)` : user.name,
	) ?? [`${identity.name} (you)`];

	return (
		<div className="border-b border-border bg-muted/40">
			<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground [padding-block:0.5rem] [padding-inline:0.75rem]">
				<span>POC identity: {identity.name}</span>
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
