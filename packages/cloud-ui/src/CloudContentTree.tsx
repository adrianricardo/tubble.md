import { Menu } from "@base-ui/react/menu";
import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { Button } from "@hubble.md/ui";
import { useQuery } from "convex/react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import MingcuteAddLine from "~icons/mingcute/add-line";
import MingcuteComputerLine from "~icons/mingcute/computer-line";
import MingcuteCopy2Line from "~icons/mingcute/copy-2-line";
import MingcuteDelete2Line from "~icons/mingcute/delete-2-line";
import MingcuteEditLine from "~icons/mingcute/edit-line";
import MingcuteFileLine from "~icons/mingcute/file-line";
import MingcuteFolderLine from "~icons/mingcute/folder-line";
import MingcuteFolderOpenLine from "~icons/mingcute/folder-open-line";
import MingcuteMore2Line from "~icons/mingcute/more-2-line";
import MingcuteMoveLine from "~icons/mingcute/move-line";
import MingcuteRightLine from "~icons/mingcute/right-line";
import MingcuteShareForwardLine from "~icons/mingcute/share-forward-line";
import MingcuteUnlinkLine from "~icons/mingcute/unlink-line";

export type CloudContentContext =
	| { kind: "workspace"; workspaceId: string }
	| { kind: "shared-folder"; folderId: string; workspaceId: string };

export type CloudTreeCapabilities = {
	canCreate: boolean;
	canWriteDocument: (documentId: string) => boolean;
	canWriteFolder: (folderId: string) => boolean;
	canShareFolder: (folderId: string) => boolean;
	canMoveFolderToGit?: (folderId: string) => boolean;
	canExportFolderCopy?: (folderId: string) => boolean;
};

export type CloudTreeCreateAction = "create-document" | "create-folder";

export type CloudTreeAction =
	| CloudTreeCreateAction
	| "rename"
	| "move"
	| "trash"
	| "share"
	| "move-to-git"
	| "export-copy"
	| "reveal-local"
	| "copy-local-path"
	| "relocate-local"
	| "stop-local";

export function cloudContextRootFolderId(
	context: CloudContentContext,
): string | null {
	return context.kind === "shared-folder" ? context.folderId : null;
}

export function cloudTreeCreateActions(
	folderId: string | null,
	capabilities: CloudTreeCapabilities,
): CloudTreeCreateAction[] {
	const canCreate = folderId
		? capabilities.canWriteFolder(folderId)
		: capabilities.canCreate;
	return canCreate ? ["create-document", "create-folder"] : [];
}

type FolderInput = { id: string; name: string; parentId: string | null };
type DocumentInput = {
	id: string;
	title: string;
	folderId: string | null;
	path?: string | null;
};

export type CloudContentNode =
	| {
			kind: "folder";
			id: string;
			name: string;
			parentId: string | null;
			children: CloudContentNode[];
	  }
	| {
			kind: "document";
			id: string;
			name: string;
			folderId: string | null;
			path: string | null;
	  };

export type CloudTreeActionTarget =
	| {
			kind: "folder";
			id: string;
			name: string;
			parentId: string | null;
			path: null;
	  }
	| {
			kind: "document";
			id: string;
			name: string;
			parentId: string | null;
			path: string | null;
	  };

export type CloudMoveDestination = {
	folderId: string | null;
	name: string;
	depth: number;
};

export type CloudDocumentMoveRequest = {
	document: Extract<CloudTreeActionTarget, { kind: "document" }>;
	destinations: CloudMoveDestination[];
};

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

export function cloudTreeItemAccessibleLabel(
	name: string,
	availability?: CloudFolderAvailability,
	hasActions = false,
): string {
	if (!availability) return hasActions ? `${name}. Actions available.` : name;
	const state =
		availability.status === "connected"
			? `Available at ${availability.localPath}`
			: availability.status === "pending-review"
				? `${availability.localPath}, needs review`
				: availability.status === "disconnected"
					? `${availability.localPath}, not connected`
					: `${availability.localPath}, ${availability.status}`;
	return `${name}. ${state}.${hasActions ? " Actions available." : ""}`;
}

export function cloudTreeActions(
	node: Pick<CloudContentNode, "kind" | "id">,
	capabilities: CloudTreeCapabilities,
	hasDirectLocalAvailability = false,
): CloudTreeAction[] {
	const actions: CloudTreeAction[] = [];
	if (node.kind === "document") {
		if (capabilities.canWriteDocument(node.id)) {
			actions.push("rename", "move", "trash");
		}
		return actions;
	}
	if (capabilities.canWriteFolder(node.id)) {
		actions.push("create-document", "create-folder", "rename", "trash");
	}
	if (capabilities.canShareFolder(node.id)) actions.push("share");
	if (capabilities.canMoveFolderToGit?.(node.id)) actions.push("move-to-git");
	else if (capabilities.canExportFolderCopy?.(node.id))
		actions.push("export-copy");
	if (hasDirectLocalAvailability) {
		actions.push(
			"reveal-local",
			"copy-local-path",
			"relocate-local",
			"stop-local",
		);
	}
	return actions;
}

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
					parentId: folder.parentId,
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
					folderId: document.folderId,
					path: document.path ?? null,
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

type TreeActionRefs = {
	trigger: HTMLButtonElement | null;
	firstItem: HTMLDivElement | null;
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

export function cloudFolderAncestorIds(
	nodes: CloudContentNode[],
	folderId: string,
): string[] | null {
	for (const node of nodes) {
		if (node.kind !== "folder") continue;
		if (node.id === folderId) return [];
		const descendants = cloudFolderAncestorIds(node.children, folderId);
		if (descendants) return [node.id, ...descendants];
	}
	return null;
}

export function cloudNodeAncestorIds(
	nodes: CloudContentNode[],
	nodeId: string,
): string[] | null {
	for (const node of nodes) {
		if (node.id === nodeId) return [];
		if (node.kind !== "folder") continue;
		const descendants = cloudNodeAncestorIds(node.children, nodeId);
		if (descendants) return [node.id, ...descendants];
	}
	return null;
}

export function cloudMoveDestinations(
	nodes: CloudContentNode[],
	rootFolderId: string | null,
	rootName = rootFolderId ? "Shared folder root" : "Space root",
): CloudMoveDestination[] {
	const destinations: CloudMoveDestination[] = [
		{ folderId: rootFolderId, name: rootName, depth: 0 },
	];
	const visit = (items: CloudContentNode[], depth: number) => {
		for (const item of items) {
			if (item.kind !== "folder") continue;
			destinations.push({ folderId: item.id, name: item.name, depth });
			visit(item.children, depth + 1);
		}
	};
	visit(nodes, 1);
	return destinations;
}

export function nextCloudTreeFocusId(
	previousIds: readonly string[],
	missingId: string,
	nextIds: readonly string[],
): string | null {
	if (nextIds.length === 0) return null;
	const previousIndex = previousIds.indexOf(missingId);
	if (previousIndex < 0) return nextIds[0] ?? null;
	for (let distance = 1; distance < previousIds.length; distance++) {
		const after = previousIds[previousIndex + distance];
		if (after && nextIds.includes(after)) return after;
		const before = previousIds[previousIndex - distance];
		if (before && nextIds.includes(before)) return before;
	}
	return nextIds[0] ?? null;
}

export function CloudContentTree({
	context,
	selectedDocumentId,
	onSelectDocument,
	capabilities,
	focusNodeId,
	onFocusNodeHandled,
	onCreateDocumentInFolder,
	onRequestCreateFolder,
	onRequestRename,
	onRequestMoveDocument,
	onRequestTrash,
	onRequestShareFolder,
	onRequestMoveFolderToGit,
	onRequestExportFolderCopy,
	localFolders = [],
	onRevealLocalFolder,
	onCopyLocalPath,
	onRelocateLocalFolder,
	onStopLocalFolder,
}: {
	context: CloudContentContext;
	selectedDocumentId: string | null;
	onSelectDocument: (documentId: string) => void;
	capabilities: CloudTreeCapabilities;
	focusNodeId?: string | null;
	onFocusNodeHandled?: (nodeId: string) => void;
	onCreateDocumentInFolder?: (folderId: string) => void | Promise<void>;
	onRequestCreateFolder?: (parentId: string) => void;
	onRequestRename?: (target: CloudTreeActionTarget) => void;
	onRequestMoveDocument?: (request: CloudDocumentMoveRequest) => void;
	onRequestTrash?: (target: CloudTreeActionTarget) => void;
	onRequestShareFolder?: (target: CloudTreeActionTarget) => void;
	onRequestMoveFolderToGit?: (target: CloudTreeActionTarget) => void;
	onRequestExportFolderCopy?: (target: CloudTreeActionTarget) => void;
	localFolders?: readonly CloudFolderAvailability[];
	onRevealLocalFolder?: (availability: CloudFolderAvailability) => void;
	onCopyLocalPath?: (availability: CloudFolderAvailability) => void;
	onRelocateLocalFolder?: (availability: CloudFolderAvailability) => void;
	onStopLocalFolder?: (availability: CloudFolderAvailability) => void;
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
	const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const deferredSearch = useDeferredValue(search);
	const itemRefs = useRef(new Map<string, HTMLDivElement>());
	const actionRefs = useRef(new Map<string, TreeActionRefs>());
	const handledFocusNodeId = useRef<string | null>(null);
	const previousVisibleIds = useRef<string[]>([]);

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
					path: document.path ?? null,
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
				path: document.path,
			})),
			context.folderId,
		);
	}, [context, sharedSubtree, workspaceDocuments, workspaceFolders]);

	const visible = useMemo(
		() => (nodes ? visibleNodes(nodes, expanded) : []),
		[nodes, expanded],
	);
	const moveRootFolderId =
		context.kind === "workspace" ? null : context.folderId;
	const moveDestinations = useMemo(
		() => (nodes ? cloudMoveDestinations(nodes, moveRootFolderId) : []),
		[moveRootFolderId, nodes],
	);
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
	useEffect(() => {
		if (!nodes || !focusNodeId || handledFocusNodeId.current === focusNodeId)
			return;
		const ancestors = cloudNodeAncestorIds(nodes, focusNodeId);
		if (!ancestors) return;
		handledFocusNodeId.current = focusNodeId;
		setSearch("");
		setExpanded((current) => new Set([...current, ...ancestors]));
		setPendingFocusId(focusNodeId);
	}, [focusNodeId, nodes]);
	useEffect(() => {
		if (!pendingFocusId) return;
		const element = itemRefs.current.get(pendingFocusId);
		if (!element) return;
		setFocusedId(pendingFocusId);
		element.focus();
		element.scrollIntoView({ block: "nearest" });
		setPendingFocusId(null);
		onFocusNodeHandled?.(pendingFocusId);
	}, [onFocusNodeHandled, pendingFocusId]);
	useEffect(() => {
		const nextIds = visible.map(({ node }) => node.id);
		if (focusedId && !nextIds.includes(focusedId)) {
			const fallback = nextCloudTreeFocusId(
				previousVisibleIds.current,
				focusedId,
				nextIds,
			);
			setFocusedId(fallback);
			if (fallback) {
				requestAnimationFrame(() => itemRefs.current.get(fallback)?.focus());
			}
		}
		previousVisibleIds.current = nextIds;
	}, [focusedId, visible]);
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
	const setActionRef = <Key extends keyof TreeActionRefs>(
		id: string,
		key: Key,
		element: TreeActionRefs[Key],
	) => {
		const refs = actionRefs.current.get(id) ?? {
			trigger: null,
			firstItem: null,
		};
		refs[key] = element;
		if (refs.trigger || refs.firstItem) actionRefs.current.set(id, refs);
		else actionRefs.current.delete(id);
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
					Create a document or folder to begin.
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
					<AvailabilityControl
						availability={rootAvailability}
						showPath
						onReveal={onRevealLocalFolder}
						onCopyPath={onCopyLocalPath}
						onRelocate={onRelocateLocalFolder}
						onStop={onStopLocalFolder}
					/>
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
						} else if (
							(event.key === "F10" && event.shiftKey) ||
							event.key === "ContextMenu"
						) {
							const action = actionRefs.current.get(current.node.id);
							if (action?.trigger) {
								event.preventDefault();
								action.trigger.click();
								// Base UI does not consistently transfer focus for a synthetic
								// Context Menu trigger, so wait for its portal item to mount.
								setTimeout(
									() =>
										actionRefs.current.get(current.node.id)?.firstItem?.focus(),
									0,
								);
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
						const createActions = isFolder
							? cloudTreeCreateActions(node.id, capabilities)
							: [];
						const target: CloudTreeActionTarget =
							node.kind === "folder"
								? {
										kind: "folder",
										id: node.id,
										name: node.name,
										parentId: node.parentId,
										path: null,
									}
								: {
										kind: "document",
										id: node.id,
										name: node.name,
										parentId: node.folderId,
										path: node.path,
									};
						const actions = cloudTreeActions(
							node,
							capabilities,
							availability !== undefined,
						).filter((action) => {
							switch (action) {
								case "create-document":
									return onCreateDocumentInFolder !== undefined;
								case "create-folder":
									return onRequestCreateFolder !== undefined;
								case "rename":
									return onRequestRename !== undefined;
								case "move":
									return onRequestMoveDocument !== undefined;
								case "trash":
									return onRequestTrash !== undefined;
								case "share":
									return onRequestShareFolder !== undefined;
								case "move-to-git":
									return onRequestMoveFolderToGit !== undefined;
								case "export-copy":
									return onRequestExportFolderCopy !== undefined;
								case "reveal-local":
									return onRevealLocalFolder !== undefined;
								case "copy-local-path":
									return onCopyLocalPath !== undefined;
								case "relocate-local":
									return onRelocateLocalFolder !== undefined;
								case "stop-local":
									return onStopLocalFolder !== undefined;
							}
							return false;
						});
						return (
							<div
								key={node.id}
								role="treeitem"
								aria-label={cloudTreeItemAccessibleLabel(
									node.name,
									availability,
									actions.length > 0,
								)}
								aria-haspopup={actions.length > 0 ? "menu" : undefined}
								aria-level={depth}
								aria-expanded={isFolder ? isOpen : undefined}
								aria-selected={isSelected}
								tabIndex={
									focusedId === node.id ||
									(focusedId === null && visible[0].node.id === node.id)
										? 0
										: -1
								}
								className={`group flex min-h-7 min-w-0 items-center rounded-sm text-[length:var(--font-size-sidebar)] outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-ring ${
									isSelected
										? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
										: "text-sidebar-foreground hover:bg-sidebar-accent/70"
								}`}
								style={{
									paddingInlineStart: `${0.375 + (depth - 1) * 0.75}rem`,
								}}
								ref={(element) => {
									if (element) itemRefs.current.set(node.id, element);
									else itemRefs.current.delete(node.id);
								}}
								onFocus={() => setFocusedId(node.id)}
								onContextMenu={(event) => {
									if (actions.length === 0) return;
									event.preventDefault();
									focusItem(node.id);
									if (node.kind === "document") onSelectDocument(node.id);
									actionRefs.current.get(node.id)?.trigger?.click();
								}}
								onClick={(event) => {
									if (
										(event.target as HTMLElement).closest("[data-tree-actions]")
									)
										return;
									if (node.kind === "folder") toggleFolder(node.id);
									else onSelectDocument(node.id);
								}}
								onKeyDown={(event) => {
									if (
										event.target !== event.currentTarget ||
										(event.key !== "Enter" && event.key !== " ")
									)
										return;
									event.preventDefault();
									if (node.kind === "folder") toggleFolder(node.id);
									else onSelectDocument(node.id);
								}}
							>
								<span className="flex min-w-0 flex-1 items-center gap-1 text-start">
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
								</span>
								{isFolder && createActions.length > 0 ? (
									<span
										data-tree-actions
										className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
									>
										{createActions.includes("create-document") &&
										onCreateDocumentInFolder ? (
											<Button
												type="button"
												variant="ghost"
												size="icon-xs"
												aria-label={`New document in ${node.name}`}
												title="New document"
												onClick={() => void onCreateDocumentInFolder(node.id)}
											>
												<MingcuteAddLine className="size-3.5" />
											</Button>
										) : null}
										{createActions.includes("create-folder") &&
										onRequestCreateFolder ? (
											<Button
												type="button"
												variant="ghost"
												size="icon-xs"
												aria-label={`New folder in ${node.name}`}
												title="New folder"
												onClick={() => {
													toggleFolder(node.id, true);
													onRequestCreateFolder(node.id);
												}}
											>
												<MingcuteFolderLine className="size-3.5" />
											</Button>
										) : null}
									</span>
								) : null}
								{actions.length > 0 ? (
									<CloudTreeActionsMenu
										actions={actions}
										target={target}
										availability={availability}
										triggerRef={(element) => {
											setActionRef(node.id, "trigger", element);
										}}
										firstItemRef={(element) => {
											setActionRef(node.id, "firstItem", element);
										}}
										onReveal={onRevealLocalFolder}
										onCopyPath={onCopyLocalPath}
										onRelocate={onRelocateLocalFolder}
										onStop={onStopLocalFolder}
										onCreateDocument={onCreateDocumentInFolder}
										onCreateFolder={(folderId) => {
											toggleFolder(folderId, true);
											onRequestCreateFolder?.(folderId);
										}}
										onRename={onRequestRename}
										onMoveDocument={(document) =>
											onRequestMoveDocument?.({
												document,
												destinations: moveDestinations,
											})
										}
										onTrash={onRequestTrash}
										onShare={onRequestShareFolder}
										onMoveToGit={onRequestMoveFolderToGit}
										onExportCopy={onRequestExportFolderCopy}
										onClose={() => itemRefs.current.get(node.id)?.focus()}
									/>
								) : null}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function CloudTreeActionsMenu({
	actions,
	target,
	availability,
	triggerRef,
	firstItemRef,
	onCreateDocument,
	onCreateFolder,
	onRename,
	onMoveDocument,
	onTrash,
	onShare,
	onMoveToGit,
	onExportCopy,
	onReveal,
	onCopyPath,
	onRelocate,
	onStop,
	onClose,
}: {
	actions: CloudTreeAction[];
	target: CloudTreeActionTarget;
	availability?: CloudFolderAvailability;
	triggerRef: (element: HTMLButtonElement | null) => void;
	firstItemRef: (element: HTMLDivElement | null) => void;
	onCreateDocument?: (folderId: string) => void | Promise<void>;
	onCreateFolder?: (folderId: string) => void;
	onRename?: (target: CloudTreeActionTarget) => void;
	onMoveDocument?: (
		target: Extract<CloudTreeActionTarget, { kind: "document" }>,
	) => void;
	onTrash?: (target: CloudTreeActionTarget) => void;
	onShare?: (target: CloudTreeActionTarget) => void;
	onMoveToGit?: (target: CloudTreeActionTarget) => void;
	onExportCopy?: (target: CloudTreeActionTarget) => void;
	onReveal?: (availability: CloudFolderAvailability) => void;
	onCopyPath?: (availability: CloudFolderAvailability) => void;
	onRelocate?: (availability: CloudFolderAvailability) => void;
	onStop?: (availability: CloudFolderAvailability) => void;
	onClose: () => void;
}) {
	const firstAction = actions[0];
	const hasLocalActions = actions.some(
		(action) =>
			action === "reveal-local" ||
			action === "copy-local-path" ||
			action === "relocate-local" ||
			action === "stop-local",
	);
	const itemRef = (action: CloudTreeAction) =>
		action === firstAction ? firstItemRef : undefined;
	return (
		<Menu.Root
			onOpenChange={(open) => {
				if (!open) requestAnimationFrame(onClose);
			}}
		>
			<Menu.Trigger
				render={
					<Button
						ref={triggerRef}
						data-tree-actions
						tabIndex={-1}
						variant="ghost"
						size="icon-xs"
						aria-label={`Actions for ${target.name}`}
						title="Actions"
						className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none"
					/>
				}
			>
				<MingcuteMore2Line className="size-3.5" />
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner align="end" side="bottom" sideOffset={4}>
					<Menu.Popup className="z-50 w-52 origin-(--transform-origin) rounded-sm border border-border bg-popover p-1 text-popover-foreground shadow-overlay outline-hidden transition-[transform,opacity] motion-reduce:transition-none motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
						{actions.includes("create-document") ? (
							<Menu.Item
								ref={itemRef("create-document")}
								className={availabilityActionClass}
								onClick={() => void onCreateDocument?.(target.id)}
							>
								<MingcuteAddLine className="size-3.5" />
								New document
							</Menu.Item>
						) : null}
						{actions.includes("create-folder") ? (
							<Menu.Item
								ref={itemRef("create-folder")}
								className={availabilityActionClass}
								onClick={() => onCreateFolder?.(target.id)}
							>
								<MingcuteFolderLine className="size-3.5" />
								New folder
							</Menu.Item>
						) : null}
						{actions.includes("rename") ? (
							<Menu.Item
								ref={itemRef("rename")}
								className={availabilityActionClass}
								onClick={() => onRename?.(target)}
							>
								<MingcuteEditLine className="size-3.5" />
								Rename
							</Menu.Item>
						) : null}
						{actions.includes("move") && target.kind === "document" ? (
							<Menu.Item
								ref={itemRef("move")}
								className={availabilityActionClass}
								onClick={() => onMoveDocument?.(target)}
							>
								<MingcuteMoveLine className="size-3.5" />
								Move…
							</Menu.Item>
						) : null}
						{actions.includes("share") ? (
							<Menu.Item
								ref={itemRef("share")}
								className={availabilityActionClass}
								onClick={() => onShare?.(target)}
							>
								<MingcuteShareForwardLine className="size-3.5" />
								Share…
							</Menu.Item>
						) : null}
						{actions.includes("move-to-git") ? (
							<Menu.Item
								ref={itemRef("move-to-git")}
								className={availabilityActionClass}
								onClick={() => onMoveToGit?.(target)}
							>
								<MingcuteComputerLine className="size-3.5" />
								Move to Git…
							</Menu.Item>
						) : null}
						{actions.includes("export-copy") ? (
							<Menu.Item
								ref={itemRef("export-copy")}
								className={availabilityActionClass}
								onClick={() => onExportCopy?.(target)}
							>
								<MingcuteCopy2Line className="size-3.5" />
								Export Git copy…
							</Menu.Item>
						) : null}
						{actions.includes("trash") ? (
							<Menu.Item
								ref={itemRef("trash")}
								className={`${availabilityActionClass} text-destructive data-highlighted:text-destructive`}
								onClick={() => onTrash?.(target)}
							>
								<MingcuteDelete2Line className="size-3.5" />
								Move to Trash
							</Menu.Item>
						) : null}
						{hasLocalActions ? (
							<Menu.Separator className="my-1 h-px bg-border" />
						) : null}
						{availability && actions.includes("reveal-local") ? (
							<Menu.Item
								ref={itemRef("reveal-local")}
								className={availabilityActionClass}
								onClick={() => onReveal?.(availability)}
							>
								<MingcuteFolderOpenLine className="size-3.5" />
								Reveal in file browser
							</Menu.Item>
						) : null}
						{availability && actions.includes("copy-local-path") ? (
							<Menu.Item
								ref={itemRef("copy-local-path")}
								className={availabilityActionClass}
								onClick={() => onCopyPath?.(availability)}
							>
								<MingcuteCopy2Line className="size-3.5" />
								Copy local path
							</Menu.Item>
						) : null}
						{availability && actions.includes("relocate-local") ? (
							<Menu.Item
								ref={itemRef("relocate-local")}
								className={availabilityActionClass}
								onClick={() => onRelocate?.(availability)}
							>
								<MingcuteMoveLine className="size-3.5" />
								Relocate local availability…
							</Menu.Item>
						) : null}
						{availability && actions.includes("stop-local") ? (
							<Menu.Item
								ref={itemRef("stop-local")}
								className={availabilityActionClass}
								onClick={() => onStop?.(availability)}
							>
								<MingcuteUnlinkLine className="size-3.5" />
								Stop making available…
							</Menu.Item>
						) : null}
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	);
}

function AvailabilityControl({
	availability,
	showPath,
	onReveal,
	onCopyPath,
	onRelocate,
	onStop,
}: {
	availability: CloudFolderAvailability;
	showPath?: boolean;
	onReveal?: (availability: CloudFolderAvailability) => void;
	onCopyPath?: (availability: CloudFolderAvailability) => void;
	onRelocate?: (availability: CloudFolderAvailability) => void;
	onStop?: (availability: CloudFolderAvailability) => void;
}) {
	return (
		<div className="flex min-w-0 items-center rounded-sm hover:bg-sidebar-accent/70">
			<AvailabilityMarker availability={availability} showPath={showPath} />
			<AvailabilityActions
				availability={availability}
				onReveal={onReveal}
				onCopyPath={onCopyPath}
				onRelocate={onRelocate}
				onStop={onStop}
			/>
		</div>
	);
}

const availabilityActionClass =
	"flex w-full cursor-pointer items-center gap-2 rounded-sm text-start text-[11px] outline-hidden select-none data-highlighted:bg-accent [padding-block:0.375rem] [padding-inline:0.5rem]";

function AvailabilityActions({
	availability,
	triggerRef,
	firstItemRef,
	onReveal,
	onCopyPath,
	onRelocate,
	onStop,
}: {
	availability: CloudFolderAvailability;
	triggerRef?: (element: HTMLButtonElement | null) => void;
	firstItemRef?: (element: HTMLDivElement | null) => void;
	onReveal?: (availability: CloudFolderAvailability) => void;
	onCopyPath?: (availability: CloudFolderAvailability) => void;
	onRelocate?: (availability: CloudFolderAvailability) => void;
	onStop?: (availability: CloudFolderAvailability) => void;
}) {
	if (!onReveal && !onCopyPath && !onRelocate && !onStop) return null;
	return (
		<Menu.Root>
			<Menu.Trigger
				render={
					<Button
						ref={triggerRef}
						data-tree-actions
						tabIndex={triggerRef ? -1 : 0}
						variant="ghost"
						size="icon-xs"
						aria-label={`Local availability actions for ${availability.localPath}`}
						title="Local availability actions"
						className="shrink-0 opacity-70 transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none"
					/>
				}
			>
				<MingcuteMore2Line className="size-3.5" />
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner align="end" side="bottom" sideOffset={4}>
					<Menu.Popup className="z-50 w-52 origin-(--transform-origin) rounded-sm border border-border bg-popover p-1 text-popover-foreground shadow-overlay outline-hidden transition-[transform,opacity] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
						{onReveal ? (
							<Menu.Item
								ref={firstItemRef}
								className={availabilityActionClass}
								onClick={() => onReveal(availability)}
							>
								<MingcuteFolderOpenLine className="size-3.5" />
								Reveal in file browser
							</Menu.Item>
						) : null}
						{onCopyPath ? (
							<Menu.Item
								className={availabilityActionClass}
								onClick={() => onCopyPath(availability)}
							>
								<MingcuteCopy2Line className="size-3.5" />
								Copy local path
							</Menu.Item>
						) : null}
						{onRelocate ? (
							<Menu.Item
								className={availabilityActionClass}
								onClick={() => onRelocate(availability)}
							>
								<MingcuteMoveLine className="size-3.5" />
								Relocate local availability…
							</Menu.Item>
						) : null}
						{onStop ? (
							<Menu.Item
								className={availabilityActionClass}
								onClick={() => onStop(availability)}
							>
								<MingcuteUnlinkLine className="size-3.5" />
								Stop making available…
							</Menu.Item>
						) : null}
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
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
