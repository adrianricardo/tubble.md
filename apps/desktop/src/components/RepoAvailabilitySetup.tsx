import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { Button, Input } from "@hubble.md/ui";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import MingcuteFolderOpenLine from "~icons/mingcute/folder-open-line";
import { desktopConvexUrl } from "../convex";
import { desktopApi } from "../desktopApi";
import type {
	DirectProjectionScope,
	LocalAvailabilityRecord,
} from "../desktopApi/types";
import {
	directScopeKey,
	repoAvailabilitySuggestedPath,
	setupProgressLabel,
} from "./localAgentAvailabilityModel";

type RepoPhase = "choose" | "preview" | "verifying" | "materializing" | "error";

type RepoFolder = {
	_id: string;
	name: string;
	parentId?: string;
};

function folderPath(
	folder: RepoFolder,
	folders: readonly RepoFolder[],
): string {
	const byId = new Map(folders.map((candidate) => [candidate._id, candidate]));
	const names = [folder.name];
	const seen = new Set([folder._id]);
	let parentId = folder.parentId;
	while (parentId && !seen.has(parentId)) {
		seen.add(parentId);
		const parent = byId.get(parentId);
		if (!parent) break;
		names.unshift(parent.name);
		parentId = parent.parentId;
	}
	return names.join(" / ");
}

export function RepoAvailabilitySetup({
	contextScope,
	contextName,
	contextDetail,
	capability,
	authToken,
	onComplete,
	onCancel,
}: {
	contextScope: DirectProjectionScope;
	contextName: string;
	contextDetail: string;
	capability: "read-write" | "read-only";
	authToken: string | null;
	onComplete: (record: LocalAvailabilityRecord) => void;
	onCancel: () => void;
}) {
	const createFolder = useMutation(api.folders.create);
	const workspaceFolders = useQuery(
		api.folders.list,
		contextScope.kind === "workspace"
			? { workspaceId: contextScope.workspaceId as Id<"workspaces"> }
			: "skip",
	);
	const folders = (workspaceFolders ?? []) as RepoFolder[];
	const [selectedFolderId, setSelectedFolderId] = useState(
		contextScope.kind === "folder" ? contextScope.folderId : "",
	);
	const [createdFolderName, setCreatedFolderName] = useState("");
	const [creatingFolder, setCreatingFolder] = useState(false);
	const [repoRoot, setRepoRoot] = useState<string | null>(null);
	const [phase, setPhase] = useState<RepoPhase>("choose");
	const [error, setError] = useState<string | null>(null);

	const selectedFolder = useMemo(() => {
		if (contextScope.kind === "folder") {
			return { _id: contextScope.folderId, name: contextName };
		}
		return folders.find((folder) => folder._id === selectedFolderId) ?? null;
	}, [contextName, contextScope, folders, selectedFolderId]);
	const mountPath =
		repoRoot && selectedFolder
			? repoAvailabilitySuggestedPath(repoRoot, selectedFolder.name)
			: "";

	useEffect(() => {
		if (!selectedFolder) return;
		const scopeKey = directScopeKey({
			kind: "folder",
			workspaceId: contextScope.workspaceId,
			folderId: selectedFolder._id,
		});
		return desktopApi.onLocalAvailabilityProgress((event) => {
			if (event.scopeKey === scopeKey) setPhase(event.phase);
		});
	}, [contextScope.workspaceId, selectedFolder]);

	const chooseRepo = async () => {
		const selected = await desktopApi.openFolderPicker();
		if (!selected) return;
		const resolved = await desktopApi.resolveGitRepoRoot(selected);
		if (!resolved) {
			setError(
				"That folder is not inside a Git repository. Choose the repository or any folder inside it.",
			);
			setPhase("error");
			return;
		}
		setRepoRoot(resolved);
		setError(null);
		setPhase("preview");
	};

	const addFolder = async () => {
		const name = createdFolderName.trim();
		if (contextScope.kind !== "workspace" || !name || creatingFolder) return;
		setCreatingFolder(true);
		try {
			const folderId = await createFolder({
				workspaceId: contextScope.workspaceId as Id<"workspaces">,
				name,
			});
			setSelectedFolderId(folderId);
			setCreatedFolderName("");
			setRepoRoot(null);
			setPhase("choose");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : String(caught));
			setPhase("error");
		} finally {
			setCreatingFolder(false);
		}
	};

	const connectRepo = async () => {
		if (
			!selectedFolder ||
			!repoRoot ||
			!mountPath.trim() ||
			!authToken ||
			!desktopConvexUrl ||
			phase === "verifying" ||
			phase === "materializing"
		)
			return;
		setError(null);
		setPhase("verifying");
		try {
			const record = await desktopApi.createLocalAvailability({
				scope: {
					kind: "folder",
					workspaceId: contextScope.workspaceId,
					folderId: selectedFolder._id,
				},
				displayName: selectedFolder.name,
				localRoot: mountPath.trim(),
				association: "repo",
				repoRoot,
				deploymentUrl: desktopConvexUrl,
				authToken,
			});
			onComplete(record);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : String(caught));
			setPhase("error");
		}
	};

	const busy = phase === "verifying" || phase === "materializing";
	const canLink = capability === "read-write";

	return (
		<div className="flex flex-col gap-3">
			<div className="grid gap-2 rounded-sm border border-border bg-muted/35 [padding-block:0.625rem] [padding-inline:0.625rem]">
				<PreviewRow
					label="Current context"
					value={`${contextName} · ${contextDetail}`}
				/>
				<PreviewRow
					label="Repository boundary"
					value="Hubble watches only the connected Markdown folder and never runs Git."
				/>
			</div>

			{contextScope.kind === "workspace" ? (
				<div className="grid gap-2">
					<label
						htmlFor="repo-availability-folder"
						className="text-xs font-medium text-foreground"
					>
						Cloud folder
					</label>
					<select
						id="repo-availability-folder"
						value={selectedFolderId}
						onChange={(event) => {
							setSelectedFolderId(event.target.value);
							setRepoRoot(null);
							setPhase("choose");
						}}
						disabled={busy || workspaceFolders === undefined}
						className="w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
					>
						<option value="">
							{workspaceFolders === undefined
								? "Loading folders…"
								: "Choose a folder…"}
						</option>
						{folders.map((folder) => (
							<option key={folder._id} value={folder._id}>
								{folderPath(folder, folders)}
							</option>
						))}
					</select>
					<div className="flex gap-2">
						<Input
							value={createdFolderName}
							onChange={(event) => setCreatedFolderName(event.target.value)}
							placeholder="Or create a root folder"
							aria-label="New cloud folder name"
							disabled={busy || !canLink}
						/>
						<Button
							variant="outline"
							onClick={() => void addFolder()}
							disabled={
								!createdFolderName.trim() || creatingFolder || busy || !canLink
							}
						>
							{creatingFolder ? "Creating…" : "Create"}
						</Button>
					</div>
				</div>
			) : (
				<div className="rounded-sm border border-border [padding-block:0.5rem] [padding-inline:0.625rem]">
					<p className="m-0 text-xs font-medium text-foreground">
						Cloud folder
					</p>
					<p className="m-0 text-[11px] text-muted-foreground">{contextName}</p>
				</div>
			)}

			{!canLink ? (
				<output className="m-0 block rounded-sm border border-amber-500/35 bg-amber-500/10 text-[11px] text-foreground [padding-block:0.5rem] [padding-inline:0.625rem]">
					Your role can use a read-only local folder, but linking a repository
					requires edit access. Make this content available on the Mac instead.
				</output>
			) : null}

			<div className="grid gap-2">
				<span className="text-xs font-medium text-foreground">
					Git repository
				</span>
				<Button
					variant="outline"
					onClick={() => void chooseRepo()}
					disabled={!selectedFolder || busy || !canLink}
				>
					<MingcuteFolderOpenLine />{" "}
					{repoRoot ? "Choose another repository…" : "Choose repository…"}
				</Button>
				{repoRoot ? (
					<PathBlock label="Resolved Git root" path={repoRoot} />
				) : null}
			</div>

			{repoRoot && selectedFolder ? (
				<div className="grid gap-2 rounded-sm border border-border bg-muted/35 [padding-block:0.625rem] [padding-inline:0.625rem]">
					<PathBlock label="Local Markdown path" path={mountPath} />
					<PreviewRow
						label="Cloud scope"
						value={folderPath(selectedFolder, folders)}
					/>
					<PreviewRow
						label="Local access"
						value={capability === "read-write" ? "Read and write" : "Read-only"}
					/>
					<PreviewRow
						label="Git"
						value="Excluded through .git/info/exclude when writable; otherwise Hubble shows a manual ignore pattern."
					/>
					<PreviewRow
						label="Agent context"
						value="Creates BRAIN.md only when this cloud folder does not already contain one."
					/>
				</div>
			) : null}

			<div aria-live="polite" aria-atomic="true">
				{busy ? (
					<p className="m-0 rounded-sm bg-muted text-[11px] text-foreground [padding-block:0.5rem] [padding-inline:0.625rem]">
						{setupProgressLabel(phase)}
					</p>
				) : null}
				{phase === "error" && error ? (
					<div
						role="alert"
						className="rounded-sm border border-destructive/35 bg-destructive/10 [padding-block:0.5rem] [padding-inline:0.625rem]"
					>
						<p className="m-0 text-[11px] font-medium text-foreground">
							Repository link did not complete
						</p>
						<p className="m-0 break-words text-[10px] text-muted-foreground [padding-block-start:0.2rem]">
							{error}
						</p>
					</div>
				) : null}
			</div>

			<div className="flex justify-end gap-2">
				<Button
					data-repo-availability-cancel
					autoFocus
					variant="ghost"
					onClick={onCancel}
					disabled={busy}
				>
					Cancel
				</Button>
				<Button
					onClick={() => void connectRepo()}
					disabled={
						!selectedFolder ||
						!repoRoot ||
						!mountPath.trim() ||
						!authToken ||
						busy ||
						!canLink
					}
				>
					Link folder
				</Button>
			</div>
		</div>
	);
}

function PreviewRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 text-[11px]">
			<span className="text-muted-foreground">{label}</span>
			<span className="min-w-0 break-words text-foreground">{value}</span>
		</div>
	);
}

function PathBlock({ label, path }: { label: string; path: string }) {
	return (
		<div>
			<p className="m-0 text-[10px] text-muted-foreground">{label}</p>
			<p className="m-0 break-all rounded-sm border border-border bg-background font-mono text-[11px] text-foreground [padding-block:0.4rem] [padding-inline:0.5rem]">
				{path}
			</p>
		</div>
	);
}
