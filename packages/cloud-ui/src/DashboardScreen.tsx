import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { useMutation, useQuery } from "convex/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteArrowRightLine from "~icons/mingcute/arrow-right-line";
import MingcuteFolderLine from "~icons/mingcute/folder-line";
import MingcuteSearchLine from "~icons/mingcute/search-line";
import { categorizeError, describeError } from "./convex-error";

const LOADING_ROW_KEYS = ["one", "two", "three", "four"];

type Props = {
	onOpenDocument: (workspaceId: string, documentId: string) => void;
	onOpenWorkspace: (workspaceId: string) => void;
	onOpenFolder: (folderId: string) => void;
	headerActions?: ReactNode;
	footer?: ReactNode;
};

export function DashboardScreen({
	onOpenDocument,
	onOpenWorkspace,
	onOpenFolder,
	headerActions,
	footer,
}: Props) {
	const dashboard = useQuery(api.documents.dashboard, {
		recentLimit: 8,
		sharedLimit: 6,
	});
	// Subtree "Shared with me" (RB2/D12): top-most shared folders come from the
	// guest-safe listSharedWithMe query, not the member-gated workspace lists.
	const sharedWithMe = useQuery(api.documents.listSharedWithMe, {});
	const createDocument = useMutation(api.documents.create);
	const [creating, setCreating] = useState(false);
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [error, setError] = useState<string | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			setDebouncedSearch(searchInput);
		}, 180);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [searchInput]);

	const searchResults = useQuery(
		api.documents.searchAll,
		debouncedSearch.trim() ? { query: debouncedSearch, limit: 12 } : "skip",
	);

	const privateWorkspace = useMemo(
		() => dashboard?.workspaces.find((workspace) => workspace.personal),
		[dashboard],
	);
	const fallbackWorkspace = dashboard?.workspaces[0];
	const createTarget = privateWorkspace ?? fallbackWorkspace;
	const teams =
		dashboard?.workspaces.filter((workspace) => !workspace.personal) ?? [];

	const handleCreate = async () => {
		if (!createTarget) return;
		setCreating(true);
		setError(null);
		try {
			const documentId = await createDocument({
				workspaceId: createTarget._id,
				title: "Untitled",
			});
			onOpenDocument(createTarget._id, documentId);
		} catch (err) {
			setError(describeError(categorizeError(err)));
		} finally {
			setCreating(false);
		}
	};

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 [padding-block:2rem] [padding-inline:1.25rem] md:[padding-block:2.5rem]">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex flex-col gap-1">
					<p className="[margin:0] text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
						Tubble
					</p>
					<h1 className="[margin:0] text-2xl font-semibold tracking-normal md:text-3xl">
						Live Documents
					</h1>
				</div>
				<div className="flex items-center gap-2">
					{headerActions}
					<button
						type="button"
						onClick={() => void handleCreate()}
						disabled={!createTarget || creating}
						className="inline-flex min-h-9 items-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 [padding-block:0.5rem] [padding-inline:0.875rem]"
					>
						<MingcuteAddLine className="size-4" />
						{creating ? "Creating..." : "New live document"}
					</button>
				</div>
			</header>
			{error ? (
				<p className="[margin:0] rounded-md border border-destructive/30 bg-destructive/10 text-sm text-destructive [padding-block:0.625rem] [padding-inline:0.75rem]">
					{error}
				</p>
			) : null}

			<div className="relative">
				<MingcuteSearchLine className="pointer-events-none absolute size-4 text-muted-foreground [inset-block-start:0.8rem] [inset-inline-start:0.875rem]" />
				<input
					type="search"
					value={searchInput}
					onChange={(event) => setSearchInput(event.target.value)}
					placeholder="Search every live document..."
					className="min-h-11 w-full rounded-md border border-border bg-sidebar text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring [padding-block:0.65rem] [padding-inline:2.5rem_0.875rem]"
				/>
			</div>

			<div className="flex flex-col gap-6">
				{debouncedSearch.trim() ? (
					<SearchPanel
						query={debouncedSearch}
						results={searchResults}
						onOpenDocument={onOpenDocument}
					/>
				) : (
					<div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
						<section className="flex flex-col gap-3">
							<SectionHeader title="Recents" />
							<div className="grid gap-2">
								{dashboard === undefined ? (
									<LoadingRows />
								) : dashboard.recents.length > 0 ? (
									dashboard.recents.map((document) => (
										<DocumentRow
											key={document._id}
											document={document}
											onOpen={() =>
												onOpenDocument(document.workspaceId, document._id)
											}
										/>
									))
								) : (
									<EmptyState
										title="Start with one live document."
										body={
											createTarget
												? "Create a doc and invite someone from the share menu."
												: "Your private space is still provisioning."
										}
									/>
								)}
							</div>
						</section>

						<aside className="flex flex-col gap-5">
							<section className="flex flex-col gap-3">
								<SectionHeader title="Private" />
								{dashboard === undefined ? (
									<LoadingRows compact />
								) : privateWorkspace ? (
									<WorkspaceCard
										name={privateWorkspace.name}
										label="Private space"
										onOpen={() => onOpenWorkspace(privateWorkspace._id)}
									/>
								) : (
									<EmptyState
										title="Private space pending."
										body="It appears after the signup callback provisions your account."
									/>
								)}
							</section>

							<section className="flex flex-col gap-3">
								<SectionHeader title="Teams" />
								{dashboard === undefined ? (
									<LoadingRows compact />
								) : teams.length > 0 ? (
									<div className="grid gap-2">
										{teams.map((workspace) => (
											<WorkspaceCard
												key={workspace._id}
												name={workspace.name}
												label={workspace.role}
												onOpen={() => onOpenWorkspace(workspace._id)}
											/>
										))}
									</div>
								) : (
									<EmptyState
										title="No teams yet."
										body="Shared team spaces will collect here."
									/>
								)}
							</section>

							<section className="flex flex-col gap-3">
								<SectionHeader title="Shared with me" />
								{sharedWithMe === undefined ? (
									<LoadingRows compact />
								) : sharedWithMe.folders.length > 0 ||
									sharedWithMe.documents.length > 0 ? (
									<div className="grid gap-2">
										{sharedWithMe.folders.map((folder) => (
											<SharedFolderCard
												key={folder.folderId}
												name={folder.name}
												workspaceName={folder.workspaceName}
												role={folder.role}
												documentCount={folder.documents.length}
												onOpen={() => onOpenFolder(folder.folderId)}
											/>
										))}
										{sharedWithMe.documents.map((document) => (
											<DocumentRow
												key={document._id}
												document={{
													_id: document._id,
													workspaceId: document.workspaceId,
													title: document.title,
													path: document.path ?? undefined,
													workspaceName: document.workspaceName,
													updatedAt: document.updatedAt,
													role: document.role ?? "viewer",
												}}
												compact
												onOpen={() =>
													onOpenDocument(document.workspaceId, document._id)
												}
											/>
										))}
									</div>
								) : (
									<EmptyState
										title="Nothing shared yet."
										body="Folders and documents collaborators share with you appear here."
									/>
								)}
							</section>
						</aside>
					</div>
				)}
				{footer}
			</div>
		</div>
	);
}

function SectionHeader({ title }: { title: string }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<h2 className="[margin:0] text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
				{title}
			</h2>
		</div>
	);
}

function DocumentRow({
	document,
	compact = false,
	onOpen,
}: {
	document: {
		_id: Id<"documents">;
		workspaceId: Id<"workspaces">;
		title: string;
		path?: string;
		workspaceName: string;
		updatedAt: number;
		updatedBy?: string;
		role: string;
	};
	compact?: boolean;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="group grid w-full gap-2 rounded-md border border-border bg-sidebar text-start shadow-sm transition hover:-translate-y-0.5 hover:border-ring hover:bg-sidebar-accent [padding-block:0.875rem] [padding-inline:1rem]"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 className="[margin:0] truncate text-sm font-semibold text-foreground">
						{document.title}
					</h3>
					<p className="[margin-block:0.25rem_0] truncate text-xs text-muted-foreground">
						{document.workspaceName}
						{document.path ? ` / ${document.path}` : ""}
					</p>
				</div>
				<MingcuteArrowRightLine className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
			</div>
			{!compact && (
				<div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
					<span>{document.role}</span>
					<span>{formatRelativeDate(document.updatedAt)}</span>
					{document.updatedBy ? <span>{document.updatedBy}</span> : null}
				</div>
			)}
		</button>
	);
}

function SharedFolderCard({
	name,
	workspaceName,
	role,
	documentCount,
	onOpen,
}: {
	name: string;
	workspaceName: string;
	role: string;
	documentCount: number;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="group flex w-full items-center justify-between gap-3 rounded-md border border-border bg-sidebar text-start transition hover:border-ring hover:bg-sidebar-accent [padding-block:0.875rem] [padding-inline:1rem]"
		>
			<span className="flex min-w-0 items-center gap-2.5">
				<MingcuteFolderLine className="size-4 shrink-0 text-muted-foreground" />
				<span className="min-w-0">
					<span className="block truncate text-sm font-semibold">{name}</span>
					<span className="block truncate text-xs text-muted-foreground">
						{workspaceName} · <span className="capitalize">{role}</span> ·{" "}
						{documentCount} doc{documentCount === 1 ? "" : "s"}
					</span>
				</span>
			</span>
			<MingcuteArrowRightLine className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
		</button>
	);
}

function WorkspaceCard({
	name,
	label,
	onOpen,
}: {
	name: string;
	label: string;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="group flex w-full items-center justify-between gap-3 rounded-md border border-border bg-sidebar text-start transition hover:border-ring hover:bg-sidebar-accent [padding-block:0.875rem] [padding-inline:1rem]"
		>
			<span className="min-w-0">
				<span className="block truncate text-sm font-semibold">{name}</span>
				<span className="block text-xs capitalize text-muted-foreground">
					{label}
				</span>
			</span>
			<MingcuteArrowRightLine className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
		</button>
	);
}

function SearchPanel({
	query,
	results,
	onOpenDocument,
}: {
	query: string;
	results:
		| Array<{
				documentId: Id<"documents">;
				workspaceId: Id<"workspaces">;
				title: string;
				path?: string;
				workspaceName: string;
				updatedAt: number;
				updatedBy?: string;
				role: string;
				snippet: string;
		  }>
		| undefined;
	onOpenDocument: (workspaceId: string, documentId: string) => void;
}) {
	return (
		<section className="flex flex-col gap-3">
			<SectionHeader title={`Search results for "${query.trim()}"`} />
			<div className="grid gap-2">
				{results === undefined ? (
					<LoadingRows />
				) : results.length > 0 ? (
					results.map((result) => (
						<button
							key={result.documentId}
							type="button"
							onClick={() =>
								onOpenDocument(result.workspaceId, result.documentId)
							}
							className="group grid w-full gap-2 rounded-md border border-border bg-sidebar text-start transition hover:border-ring hover:bg-sidebar-accent [padding-block:0.875rem] [padding-inline:1rem]"
						>
							<div className="flex items-start justify-between gap-3">
								<span className="min-w-0">
									<span className="block truncate text-sm font-semibold">
										{result.title}
									</span>
									<span className="block truncate text-xs text-muted-foreground">
										{result.workspaceName}
										{result.path ? ` / ${result.path}` : ""}
									</span>
								</span>
								<MingcuteArrowRightLine className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
							</div>
							{result.snippet ? (
								<p className="[margin:0] line-clamp-2 text-xs text-muted-foreground">
									{result.snippet}
								</p>
							) : null}
						</button>
					))
				) : (
					<EmptyState
						title="No matches."
						body="Try a title, space, or phrase from the document."
					/>
				)}
			</div>
		</section>
	);
}

function EmptyState({ title, body }: { title: string; body: string }) {
	return (
		<div className="rounded-md border border-dashed border-border bg-sidebar/70 [padding-block:1rem] [padding-inline:1rem]">
			<p className="[margin:0] text-sm font-medium text-foreground">{title}</p>
			<p className="[margin-block:0.25rem_0] text-xs leading-5 text-muted-foreground">
				{body}
			</p>
		</div>
	);
}

function LoadingRows({ compact = false }: { compact?: boolean }) {
	return (
		<div className="grid gap-2" aria-hidden="true">
			{LOADING_ROW_KEYS.slice(0, compact ? 2 : 4).map((key) => (
				<div
					key={key}
					className="h-16 animate-pulse rounded-md border border-border bg-sidebar"
				/>
			))}
		</div>
	);
}

function formatRelativeDate(timestamp: number): string {
	const delta = Date.now() - timestamp;
	const minutes = Math.max(1, Math.round(delta / 60_000));
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 14) return `${days}d ago`;
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
	}).format(new Date(timestamp));
}
