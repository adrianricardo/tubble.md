import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { useQuery } from "convex/react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import MingcuteComputerLine from "~icons/mingcute/computer-line";
import MingcuteFileLine from "~icons/mingcute/file-line";
import MingcuteFolderLine from "~icons/mingcute/folder-line";
import MingcuteRightLine from "~icons/mingcute/right-line";

export type CloudContentContext =
	| { kind: "workspace"; workspaceId: string }
	| { kind: "shared-folder"; folderId: string; workspaceId: string };

type FolderInput = { id: string; name: string; parentId: string | null };
type DocumentInput = {
	id: string;
	title: string;
	folderId: string | null;
};

export type CloudContentNode =
	| {
			kind: "folder";
			id: string;
			name: string;
			children: CloudContentNode[];
	  }
	| { kind: "document"; id: string; name: string };

export type CloudFolderAvailability = {
	folderId: string;
	localPath: string;
	status:
		| "idle"
		| "verifying"
		| "connected"
		| "syncing"
		| "offline"
		| "pending-review"
		| "error"
		| "disconnected";
};

export type CloudDocumentSearchResult = {
	id: string;
	name: string;
	path: string;
};

export function searchCloudContent(
	nodes: CloudContentNode[],
	query: string,
): CloudDocumentSearchResult[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return [];
	const matches: CloudDocumentSearchResult[] = [];
	const visit = (items: CloudContentNode[], ancestors: string[]) => {
		for (const item of items) {
			if (item.kind === "folder") {
				visit(item.children, [...ancestors, item.name]);
			} else if (item.name.toLocaleLowerCase().includes(normalizedQuery)) {
				matches.push({
					id: item.id,
					name: item.name,
					path: ancestors.join(" / "),
				});
			}
		}
	};
	visit(nodes, []);
	return matches;
}

export function buildCloudContentTree(
	folders: FolderInput[],
	documents: DocumentInput[],
	rootParentId: string | null,
): CloudContentNode[] {
	const foldersByParent = new Map<string | null, FolderInput[]>();
	const documentsByFolder = new Map<string | null, DocumentInput[]>();
	for (const folder of folders) {
		const siblings = foldersByParent.get(folder.parentId) ?? [];
		siblings.push(folder);
		foldersByParent.set(folder.parentId, siblings);
	}
	for (const document of documents) {
		const siblings = documentsByFolder.get(document.folderId) ?? [];
		siblings.push(document);
		documentsByFolder.set(document.folderId, siblings);
	}
	const compareNames = (a: { name: string }, b: { name: string }) =>
		a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
	const visit = (parentId: string | null): CloudContentNode[] => {
		const childFolders = (foldersByParent.get(parentId) ?? [])
			.map(
				(folder): CloudContentNode => ({
					kind: "folder",
					id: folder.id,
					name: folder.name,
					children: visit(folder.id),
				}),
			)
			.sort(compareNames);
		const childDocuments = (documentsByFolder.get(parentId) ?? [])
			.map(
				(document): CloudContentNode => ({
					kind: "document",
					id: document.id,
					name: document.title,
				}),
			)
			.sort(compareNames);
		return [...childFolders, ...childDocuments];
	};
	return visit(rootParentId);
}

type VisibleNode = {
	node: CloudContentNode;
	depth: number;
	parentId: string | null;
};

function visibleNodes(
	nodes: CloudContentNode[],
	expanded: Set<string>,
	depth = 1,
	parentId: string | null = null,
): VisibleNode[] {
	const visible: VisibleNode[] = [];
	for (const node of nodes) {
		visible.push({ node, depth, parentId });
		if (node.kind === "folder" && expanded.has(node.id)) {
			visible.push(
				...visibleNodes(node.children, expanded, depth + 1, node.id),
			);
		}
	}
	return visible;
}

export function CloudContentTree({
	context,
	selectedDocumentId,
	onSelectDocument,
	localFolders = [],
}: {
	context: CloudContentContext;
	selectedDocumentId: string | null;
	onSelectDocument: (documentId: string) => void;
	localFolders?: readonly CloudFolderAvailability[];
}) {
	const workspaceId = context.workspaceId as Id<"workspaces">;
	const workspaceFolders = useQuery(
		api.folders.list,
		context.kind === "workspace" ? { workspaceId } : "skip",
	);
	const workspaceDocuments = useQuery(
		api.documents.list,
		context.kind === "workspace" ? { workspaceId } : "skip",
	);
	const sharedSubtree = useQuery(
		api.folders.listSubtree,
		context.kind === "shared-folder"
			? { folderId: context.folderId as Id<"folders"> }
			: "skip",
	);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const deferredSearch = useDeferredValue(search);
	const itemRefs = useRef(new Map<string, HTMLButtonElement>());

	const nodes = useMemo(() => {
		if (context.kind === "workspace") {
			if (!workspaceFolders || !workspaceDocuments) return undefined;
			return buildCloudContentTree(
				workspaceFolders.map((folder) => ({
					id: folder._id,
					name: folder.name,
					parentId: folder.parentId ?? null,
				})),
				workspaceDocuments.map((document) => ({
					id: document._id,
					title: document.title,
					folderId: document.folderId ?? null,
				})),
				null,
			);
		}
		if (sharedSubtree === undefined) return undefined;
		if (sharedSubtree === null) return [];
		return buildCloudContentTree(
			sharedSubtree.folders.map((folder) => ({
				id: folder._id,
				name: folder.name,
				parentId: folder.parentId,
			})),
			sharedSubtree.documents.map((document) => ({
				id: document._id,
				title: document.title,
				folderId: document.folderId,
			})),
			context.folderId,
		);
	}, [context, sharedSubtree, workspaceDocuments, workspaceFolders]);

	const visible = nodes ? visibleNodes(nodes, expanded) : [];
	const searchResults = useMemo(
		() => (nodes ? searchCloudContent(nodes, deferredSearch) : []),
		[deferredSearch, nodes],
	);
	const availabilityByFolder = useMemo(
		() => new Map(localFolders.map((folder) => [folder.folderId, folder])),
		[localFolders],
	);
	const rootAvailability =
		context.kind === "shared-folder"
			? availabilityByFolder.get(context.folderId)
			: undefined;
	const focusItem = (id: string) => {
		setFocusedId(id);
		itemRefs.current.get(id)?.focus();
	};
	const toggleFolder = (id: string, open?: boolean) => {
		setExpanded((current) => {
			const next = new Set(current);
			const shouldOpen = open ?? !next.has(id);
			if (shouldOpen) next.add(id);
			else next.delete(id);
			return next;
		});
	};

	if (nodes === undefined) {
		return (
			<p className="m-0 text-xs text-muted-foreground [padding-block:0.5rem] [padding-inline:0.375rem]">
				Loading content…
			</p>
		);
	}
	if (nodes.length === 0) {
		return (
			<div className="flex flex-col items-center gap-1.5 text-center [padding-block:1.5rem] [padding-inline:0.75rem]">
				<MingcuteFolderLine className="size-5 text-muted-foreground/70" />
				<p className="m-0 text-xs font-medium text-sidebar-foreground">
					A quiet place for what comes next
				</p>
				<p className="m-0 text-[11px] text-muted-foreground">
					Create a document to begin.
				</p>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-col gap-1 [padding-block:0.25rem] [padding-inline:0.25rem]">
				<input
					type="search"
					value={search}
					onChange={(event) => setSearch(event.currentTarget.value)}
					placeholder="Search this context…"
					aria-label="Search this context"
					className="w-full rounded-sm border border-border bg-background text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring [padding-block:0.3rem] [padding-inline:0.5rem]"
				/>
				{rootAvailability ? (
					<AvailabilityMarker availability={rootAvailability} showPath />
				) : null}
			</div>
			{search.trim() ? (
				<ul
					aria-label="Search results"
					className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-auto [padding-block:0.25rem]"
				>
					{searchResults.length === 0 ? (
						<li className="text-[11px] text-muted-foreground [padding-block:0.75rem] [padding-inline:0.5rem]">
							No documents match “{search}”.
						</li>
					) : (
						searchResults.map((result) => (
							<li key={result.id}>
								<button
									type="button"
									className="flex w-full flex-col rounded-sm text-start hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [padding-block:0.375rem] [padding-inline:0.5rem]"
									onClick={() => onSelectDocument(result.id)}
								>
									<span className="truncate text-[length:var(--font-size-sidebar)] text-sidebar-foreground">
										{result.name}
									</span>
									{result.path ? (
										<span className="truncate text-[10px] text-muted-foreground">
											{result.path}
										</span>
									) : null}
								</button>
							</li>
						))
					)}
				</ul>
			) : (
				<div
					role="tree"
					aria-label="Cloud content"
					className="flex min-h-0 flex-col overflow-auto [padding-block:0.25rem]"
					onKeyDown={(event) => {
						const index = visible.findIndex(
							({ node }) => node.id === focusedId,
						);
						if (index < 0) return;
						const current = visible[index];
						if (event.key === "ArrowDown" && index < visible.length - 1) {
							event.preventDefault();
							focusItem(visible[index + 1].node.id);
						} else if (event.key === "ArrowUp" && index > 0) {
							event.preventDefault();
							focusItem(visible[index - 1].node.id);
						} else if (event.key === "Home") {
							event.preventDefault();
							focusItem(visible[0].node.id);
						} else if (event.key === "End") {
							event.preventDefault();
							focusItem(visible[visible.length - 1].node.id);
						} else if (
							event.key === "ArrowRight" &&
							current.node.kind === "folder"
						) {
							event.preventDefault();
							if (!expanded.has(current.node.id))
								toggleFolder(current.node.id, true);
							else if (current.node.children[0])
								focusItem(current.node.children[0].id);
						} else if (event.key === "ArrowLeft") {
							if (
								current.node.kind === "folder" &&
								expanded.has(current.node.id)
							) {
								event.preventDefault();
								toggleFolder(current.node.id, false);
							} else if (current.parentId) {
								event.preventDefault();
								focusItem(current.parentId);
							}
						}
					}}
				>
					{visible.map(({ node, depth }) => {
						const isFolder = node.kind === "folder";
						const isOpen = isFolder && expanded.has(node.id);
						const availability = isFolder
							? availabilityByFolder.get(node.id)
							: undefined;
						const isSelected =
							node.kind === "document" && node.id === selectedDocumentId;
						return (
							<button
								key={node.id}
								ref={(element) => {
									if (element) itemRefs.current.set(node.id, element);
									else itemRefs.current.delete(node.id);
								}}
								type="button"
								role="treeitem"
								aria-level={depth}
								aria-expanded={isFolder ? isOpen : undefined}
								aria-selected={isSelected}
								tabIndex={
									focusedId === node.id ||
									(focusedId === null && visible[0].node.id === node.id)
										? 0
										: -1
								}
								className={`group flex min-h-7 w-full items-center gap-1 rounded-sm text-start text-[length:var(--font-size-sidebar)] outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-ring ${
									isSelected
										? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
										: "text-sidebar-foreground hover:bg-sidebar-accent/70"
								}`}
								style={{
									paddingInlineStart: `${0.375 + (depth - 1) * 0.75}rem`,
								}}
								onFocus={() => setFocusedId(node.id)}
								onClick={() => {
									if (node.kind === "folder") toggleFolder(node.id);
									else onSelectDocument(node.id);
								}}
							>
								{node.kind === "folder" ? (
									<>
										<MingcuteRightLine
											className={`size-3 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`}
										/>
										<MingcuteFolderLine className="size-3.5 shrink-0 text-muted-foreground" />
									</>
								) : (
									<>
										<span className="size-3 shrink-0" />
										<MingcuteFileLine className="size-3.5 shrink-0 text-muted-foreground" />
									</>
								)}
								<span className="truncate">{node.name}</span>
								{availability ? (
									<AvailabilityMarker availability={availability} />
								) : null}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

function AvailabilityMarker({
	availability,
	showPath = false,
}: {
	availability: CloudFolderAvailability;
	showPath?: boolean;
}) {
	const status =
		availability.status === "connected"
			? null
			: availability.status === "pending-review"
				? "Needs review"
				: availability.status === "disconnected"
					? "Not connected"
					: availability.status[0].toLocaleUpperCase() +
						availability.status.slice(1);
	const label = status
		? `${availability.localPath} · ${status}`
		: `Available at ${availability.localPath}`;
	return (
		<span
			className={`ms-auto flex min-w-0 shrink items-center gap-1 text-[10px] ${status ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}
			title={label}
		>
			<span className="sr-only">{label}</span>
			<MingcuteComputerLine className="size-3 shrink-0" />
			{showPath ? (
				<span className="truncate">{availability.localPath}</span>
			) : null}
			{status ? <span className="shrink-0">{status}</span> : null}
		</span>
	);
}
