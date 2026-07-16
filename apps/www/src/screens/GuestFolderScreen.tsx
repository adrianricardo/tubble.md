import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { AppShellFrame, UserBadge } from "@hubble.md/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
	Component,
	type ErrorInfo,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { Link } from "react-router";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteFolderLine from "~icons/mingcute/folder-line";
import MingcuteRightLine from "~icons/mingcute/right-line";
import { SignOutButton } from "../auth/AuthScreens";
import { LiveDocumentErrorBoundary, LiveDocumentView } from "../shell/AppShell";

// Guest folder experience (RB2). Rendered for the `/folder/<folderId>` invite
// link route. Everything on this screen comes from RB1's guest-safe queries
// (`folders.listSubtree`, `documents.searchFolder`, folder-aware
// `documents.create`) — NOT the workspace snapshot, which is member-gated
// (AppShell loads it by workspaceId and would 403 for a guest).

type Props = {
	folderId: string;
	documentId: string | null;
	onSelectDocument: (documentId: string) => void;
};

type Subtree = NonNullable<FunctionReturnType<typeof api.folders.listSubtree>>;

export function GuestFolderScreen(props: Props) {
	// Once the subtree has loaded successfully, a later "Unauthorized" thrown by
	// the live subscription (caught by GuestFolderErrorBoundary below) means
	// access was just revoked while viewing — distinct copy from "never had
	// access" (RB6 empty/error-state pass). Lifted above the boundary so the
	// fallback can read it.
	const hasLoadedRef = useRef(false);
	return (
		<GuestFolderErrorBoundary key={props.folderId} hasLoadedRef={hasLoadedRef}>
			<GuestFolderContent {...props} hasLoadedRef={hasLoadedRef} />
		</GuestFolderErrorBoundary>
	);
}

function GuestFolderContent({
	folderId,
	documentId,
	onSelectDocument,
	hasLoadedRef,
}: Props & { hasLoadedRef: { current: boolean } }) {
	const convexFolderId = folderId as Id<"folders">;
	const subtree = useQuery(api.folders.listSubtree, {
		folderId: convexFolderId,
	});
	const viewer = useQuery(api.viewer.me, {});
	const createDocument = useMutation(api.documents.create);
	const [creatingIn, setCreatingIn] = useState<string | null>(null);
	useEffect(() => {
		if (subtree) hasLoadedRef.current = true;
	}, [subtree, hasLoadedRef]);

	const handleCreateDocument = async (targetFolderId: Id<"folders">) => {
		if (!subtree || creatingIn) return;
		setCreatingIn(targetFolderId);
		try {
			const newDocumentId = await createDocument({
				workspaceId: subtree.folder.workspaceId,
				folderId: targetFolderId,
				title: "Untitled",
			});
			onSelectDocument(newDocumentId);
		} finally {
			setCreatingIn(null);
		}
	};

	if (subtree === undefined) {
		return (
			<main className="flex h-dvh items-center justify-center bg-background text-foreground">
				<p className="text-sm text-muted-foreground">Loading shared folder…</p>
			</main>
		);
	}

	if (subtree === null) {
		return (
			<GuestFolderNotice
				title="This folder isn't there anymore."
				body="Its owner may have deleted it, or the link points somewhere that no longer exists. Ask whoever shared it with you to send a fresh link."
			/>
		);
	}

	return (
		<AppShellFrame
			toolbar={
				<>
					<div className="flex items-center justify-between gap-3 border-b border-border bg-background [padding-block:0.5rem] [padding-inline:0.75rem]">
						<div className="flex min-w-0 items-center gap-2">
							<Link
								to="/"
								className="shrink-0 rounded-sm text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground [padding-block:0.25rem] [padding-inline:0.5rem]"
							>
								← Home
							</Link>
							<span className="truncate text-sm font-medium text-foreground">
								{subtree.folder.name}
							</span>
							<span className="shrink-0 rounded-sm border border-border text-[11px] capitalize text-muted-foreground [padding-block:0.125rem] [padding-inline:0.375rem]">
								{subtree.canWrite
									? subtree.role
									: `${subtree.role} · read-only`}
							</span>
						</div>
						<div className="flex items-center gap-1">
							{viewer ? <UserBadge user={viewer} /> : null}
							<SignOutButton />
						</div>
					</div>
					<BringYourAgentBanner folderId={subtree.folder._id} />
				</>
			}
			sidebar={
				<GuestFolderSidebar
					subtree={subtree}
					selectedDocumentId={documentId}
					creatingIn={creatingIn}
					onSelectDocument={onSelectDocument}
					onCreateDocument={(id) => void handleCreateDocument(id)}
				/>
			}
		>
			{documentId ? (
				<LiveDocumentErrorBoundary key={documentId}>
					<LiveDocumentView
						workspaceId={subtree.folder.workspaceId}
						documentId={documentId}
						testIdentity={null}
					/>
				</LiveDocumentErrorBoundary>
			) : (
				<div className="flex h-full items-center justify-center [padding:1.5rem]">
					<div className="max-w-md text-center">
						<p className="m-0 text-sm font-medium text-foreground">
							{subtree.documents.length > 0
								? "Select a document from the sidebar."
								: subtree.canWrite
									? "This folder is empty. Create the first document with +."
									: "Nothing's been added here yet — check back once your team starts writing."}
						</p>
						{subtree.canWrite && subtree.documents.length === 0 && (
							<button
								type="button"
								disabled={creatingIn !== null}
								onClick={() => void handleCreateDocument(subtree.folder._id)}
								className="mt-3 rounded-sm bg-primary text-xs font-medium text-primary-foreground disabled:opacity-50 [padding-block:0.375rem] [padding-inline:0.75rem]"
							>
								{creatingIn ? "Creating…" : "New document"}
							</button>
						)}
					</div>
				</div>
			)}
		</AppShellFrame>
	);
}

function GuestFolderSidebar({
	subtree,
	selectedDocumentId,
	creatingIn,
	onSelectDocument,
	onCreateDocument,
}: {
	subtree: Subtree;
	selectedDocumentId: string | null;
	creatingIn: string | null;
	onSelectDocument: (documentId: string) => void;
	onCreateDocument: (folderId: Id<"folders">) => void;
}) {
	const [searchInput, setSearchInput] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			setDebouncedQuery(searchInput);
		}, 200);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [searchInput]);

	const searchResults = useQuery(
		api.documents.searchFolder,
		debouncedQuery.trim()
			? { folderId: subtree.folder._id, query: debouncedQuery, limit: 20 }
			: "skip",
	);
	const isSearching = debouncedQuery.trim().length > 0;

	const toggle = (id: string) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<nav className="flex w-60 shrink-0 flex-col overflow-auto border-r border-sidebar-border bg-sidebar [padding-block:0.5rem] [padding-inline:0.5rem]">
			<div className="flex items-center justify-between gap-2 [padding-block-end:0.25rem] [padding-inline:0.25rem]">
				<h2 className="m-0 truncate text-[10px] font-medium uppercase text-muted-foreground">
					Shared folder
				</h2>
				{subtree.canWrite && (
					<button
						type="button"
						className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
						aria-label="New document"
						title="New document"
						disabled={creatingIn !== null}
						onClick={() => onCreateDocument(subtree.folder._id)}
					>
						<MingcuteAddLine className="size-3.5" />
					</button>
				)}
			</div>
			<input
				type="search"
				value={searchInput}
				onChange={(event) => setSearchInput(event.target.value)}
				placeholder="Search this folder…"
				className="mb-1 w-full rounded-sm border border-border bg-background text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring [padding-block:0.25rem] [padding-inline:0.5rem]"
			/>
			{isSearching ? (
				<div className="flex flex-col">
					{searchResults === undefined && (
						<p className="m-0 text-xs text-muted-foreground [padding-block:0.375rem] [padding-inline:0.25rem]">
							Searching…
						</p>
					)}
					{searchResults?.length === 0 && (
						<p className="m-0 text-xs text-muted-foreground [padding-block:0.375rem] [padding-inline:0.25rem]">
							No results for "{debouncedQuery}".
						</p>
					)}
					{searchResults?.map((result) => (
						<button
							key={result.documentId}
							type="button"
							className="flex flex-col rounded-sm text-start hover:bg-sidebar-accent [padding-block:0.375rem] [padding-inline:0.5rem]"
							onClick={() => {
								onSelectDocument(result.documentId);
								setSearchInput("");
							}}
						>
							<span className="block truncate text-[length:var(--font-size-sidebar)] font-medium text-sidebar-foreground">
								{result.title}
							</span>
							{result.snippet && (
								<span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
									{result.snippet}
								</span>
							)}
						</button>
					))}
				</div>
			) : (
				<GuestSubtreeLevel
					subtree={subtree}
					parentId={subtree.folder._id}
					depth={0}
					collapsed={collapsed}
					selectedDocumentId={selectedDocumentId}
					creatingIn={creatingIn}
					onToggle={toggle}
					onSelectDocument={onSelectDocument}
					onCreateDocument={onCreateDocument}
				/>
			)}
		</nav>
	);
}

function GuestSubtreeLevel({
	subtree,
	parentId,
	depth,
	collapsed,
	selectedDocumentId,
	creatingIn,
	onToggle,
	onSelectDocument,
	onCreateDocument,
}: {
	subtree: Subtree;
	parentId: Id<"folders">;
	depth: number;
	collapsed: Set<string>;
	selectedDocumentId: string | null;
	creatingIn: string | null;
	onToggle: (id: string) => void;
	onSelectDocument: (documentId: string) => void;
	onCreateDocument: (folderId: Id<"folders">) => void;
}) {
	const childFolders = subtree.folders.filter(
		(folder) => folder.parentId === parentId,
	);
	const childDocuments = subtree.documents.filter(
		(document) => document.folderId === parentId,
	);
	const indent = `${0.25 + depth * 0.75}rem`;

	return (
		<div>
			{childDocuments.map((document) => (
				<button
					key={document._id}
					type="button"
					className={`block w-full truncate rounded-sm text-start text-[length:var(--font-size-sidebar)] text-sidebar-foreground [padding-block:0.3125rem] ${
						document._id === selectedDocumentId
							? "bg-sidebar-accent font-medium"
							: "hover:bg-sidebar-accent"
					}`}
					style={{ paddingInlineStart: indent }}
					onClick={() => onSelectDocument(document._id)}
					title={document.title}
				>
					{document.title}
				</button>
			))}
			{childFolders.map((folder) => {
				const isCollapsed = collapsed.has(folder._id);
				return (
					<div key={folder._id}>
						<div className="group flex items-center rounded-sm text-sidebar-foreground hover:bg-sidebar-accent">
							<button
								type="button"
								className="flex min-w-0 flex-1 items-center gap-1 bg-transparent text-start [padding-block:0.3125rem]"
								style={{ paddingInlineStart: indent }}
								onClick={() => onToggle(folder._id)}
							>
								<MingcuteRightLine
									className={`size-3 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-90"}`}
								/>
								<MingcuteFolderLine className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="truncate text-[length:var(--font-size-sidebar)]">
									{folder.name}
								</span>
							</button>
							{subtree.canWrite && (
								<button
									type="button"
									className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100 [margin-inline-end:0.25rem]"
									aria-label={`New document in ${folder.name}`}
									title="New document"
									disabled={creatingIn !== null}
									onClick={() => onCreateDocument(folder._id)}
								>
									<MingcuteAddLine className="size-3.5" />
								</button>
							)}
						</div>
						{!isCollapsed && (
							<GuestSubtreeLevel
								subtree={subtree}
								parentId={folder._id}
								depth={depth + 1}
								collapsed={collapsed}
								selectedDocumentId={selectedDocumentId}
								creatingIn={creatingIn}
								onToggle={onToggle}
								onSelectDocument={onSelectDocument}
								onCreateDocument={onCreateDocument}
							/>
						)}
					</div>
				);
			})}
			{depth === 0 &&
				childFolders.length === 0 &&
				childDocuments.length === 0 && (
					<p className="m-0 text-xs text-muted-foreground [padding-block:0.375rem] [padding-inline:0.25rem]">
						Nothing here yet.
					</p>
				)}
		</div>
	);
}

function GuestFolderNotice({ title, body }: { title: string; body: string }) {
	return (
		<main className="flex h-dvh items-center justify-center bg-background text-foreground [padding-block:1.5rem] [padding-inline:1.5rem]">
			<div className="w-full max-w-md rounded-sm border border-border bg-card [padding-block:1rem] [padding-inline:1rem]">
				<p className="m-0 text-sm font-medium text-foreground">{title}</p>
				<p className="m-0 text-sm text-muted-foreground [margin-block-start:0.5rem]">
					{body}
				</p>
				<div className="mt-4 flex items-center gap-2">
					<Link
						to="/"
						className="rounded-sm bg-primary text-xs font-medium text-primary-foreground [padding-block:0.375rem] [padding-inline:0.75rem]"
					>
						Go to your dashboard
					</Link>
					<SignOutButton />
				</div>
			</div>
		</main>
	);
}

// Revocation is the expected failure mode here (owner removes the share while
// the guest has the folder open): the live `listSubtree` subscription errors
// with "Unauthorized" and convex-react rethrows it during render. Catch it and
// show a clean access-lost state instead of a crash — distinguishing "you were
// just removed" (revoked-while-viewing) from "you never had access" (dead/wrong
// link, or signed in on the wrong account) since they call for different next
// steps (RB6).
class GuestFolderErrorBoundary extends Component<
	{ children: ReactNode; hasLoadedRef: { current: boolean } },
	{ error: Error | null }
> {
	state: { error: Error | null } = { error: null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("Guest folder route failed:", error, info.componentStack);
	}

	render() {
		if (this.state.error) {
			const message = this.state.error.message.toLowerCase();
			const isUnauthorized = message.includes("unauthorized");
			const wasRevokedWhileViewing =
				isUnauthorized && this.props.hasLoadedRef.current;
			return (
				<GuestFolderNotice
					title={
						wasRevokedWhileViewing
							? "Your access to this folder was just removed."
							: isUnauthorized
								? "You don't have access to this folder."
								: "This folder failed to load."
					}
					body={
						wasRevokedWhileViewing
							? "The person who shared it removed your access — this doesn't undo edits you already made, but you can no longer view or edit here. Ask them to re-share it if that was a mistake."
							: isUnauthorized
								? "Either the invite link is wrong, your access was removed before you arrived, or you're signed in on the wrong account. Ask the person who shared it to re-invite you."
								: this.state.error.message
					}
				/>
			);
		}
		return this.props.children;
	}
}

// Keep this route honest while the signed public desktop release is pending.
// One dismissal is stored per folder since a guest may have several shares.
const AGENT_BANNER_DISMISSED_PREFIX = "hubble:agent-banner-dismissed:";
const DESKTOP_RELEASES_URL =
	"https://github.com/adrianricardo/tubble.md/releases";

function BringYourAgentBanner({ folderId }: { folderId: string }) {
	const storageKey = `${AGENT_BANNER_DISMISSED_PREFIX}${folderId}`;
	const [dismissed, setDismissed] = useState(
		() => localStorage.getItem(storageKey) === "1",
	);
	if (dismissed) return null;

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 [padding-block:0.5rem] [padding-inline:0.75rem]">
			<p className="m-0 min-w-0 flex-1 text-xs text-foreground">
				<span className="font-medium">Want your agent working here too?</span>{" "}
				The public Tubble macOS release is coming soon. Existing unsigned
				development builds are available for testing.
			</p>
			<div className="flex shrink-0 items-center gap-2">
				<a
					href={DESKTOP_RELEASES_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="rounded-sm bg-primary text-xs font-medium text-primary-foreground [padding-block:0.3125rem] [padding-inline:0.625rem]"
				>
					View development builds
				</a>
				<button
					type="button"
					onClick={() => {
						localStorage.setItem(storageKey, "1");
						setDismissed(true);
					}}
					className="rounded-sm text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground [padding-block:0.3125rem] [padding-inline:0.5rem]"
				>
					Dismiss
				</button>
			</div>
		</div>
	);
}
