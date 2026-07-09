import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { Button } from "@hubble.md/ui";
import { Authenticated, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { desktopApi } from "../desktopApi";
import type { RepoLinkResult, RepoMount } from "../desktopApi/types";
import { SettingsSection } from "./SettingsDialog";

/**
 * Repo-link mount UI (RB3 / D11): pick a cloud folder + a local git repo
 * directory, mount the folder's Live-Document projection inside the repo
 * working tree, and keep it out of git via `.git/info/exclude`.
 */
export function RepoLinkSection({ deploymentUrl }: { deploymentUrl: string }) {
	return (
		<SettingsSection
			title="Repo links"
			description="Mount a cloud folder inside a local git repository so your agents can work beside the code. Hubble never reads repo contents or runs git."
		>
			<Authenticated>
				<RepoLinkManager deploymentUrl={deploymentUrl} />
			</Authenticated>
		</SettingsSection>
	);
}

/** Renderer-side copy of the main process's mount-segment sanitizer (preview only). */
function sanitizeMountSegment(name: string): string {
	const cleaned = name
		.replace(/[/\\:*?"<>|]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^[. ]+|[. ]+$/g, "");
	return cleaned || "hubble-folder";
}

function RepoLinkManager({ deploymentUrl }: { deploymentUrl: string }) {
	const authToken = useAuthToken();
	const workspaces = useQuery(api.sync.listWorkspaces, {});
	const [workspaceId, setWorkspaceId] = useState<string>("");
	const folders = useQuery(
		api.folders.list,
		workspaceId ? { workspaceId: workspaceId as Id<"workspaces"> } : "skip",
	);
	const [folderId, setFolderId] = useState<string>("");
	const [repoDir, setRepoDir] = useState<string | null>(null);
	const [mountPath, setMountPath] = useState<string>("");
	const [mountPathEdited, setMountPathEdited] = useState(false);
	const [pending, setPending] = useState<"link" | "unlink" | null>(null);
	const [mounts, setMounts] = useState<RepoMount[]>([]);
	const [lastResult, setLastResult] = useState<RepoLinkResult | null>(null);
	const reconnectedForToken = useRef<string | null>(null);

	const refreshMounts = useCallback(async () => {
		setMounts(await desktopApi.listRepoMounts());
	}, []);

	useEffect(() => {
		void refreshMounts();
	}, [refreshMounts]);

	// Reconnect persisted mounts once per fresh JWT (mirrors the synced-folder
	// renderer-driven token refresh pattern).
	useEffect(() => {
		if (!authToken || reconnectedForToken.current === authToken) return;
		reconnectedForToken.current = authToken;
		void desktopApi
			.reconnectRepoMounts({ deploymentUrl, authToken })
			.then(setMounts)
			.catch(() => {
				reconnectedForToken.current = null;
			});
	}, [authToken, deploymentUrl]);

	useEffect(() => {
		if (workspaces === undefined || workspaces.length === 0) return;
		if (workspaces.some((workspace) => workspace._id === workspaceId)) return;
		setWorkspaceId(workspaces[0]._id);
	}, [workspaceId, workspaces]);

	const selectedFolder = folders?.find((folder) => folder._id === folderId);

	// Default mount path <repo>/<sanitized-folder-name>/ (editable).
	useEffect(() => {
		if (mountPathEdited) return;
		if (!repoDir || !selectedFolder) return;
		setMountPath(`${repoDir}/${sanitizeMountSegment(selectedFolder.name)}`);
	}, [mountPathEdited, repoDir, selectedFolder]);

	const pickRepoDir = async () => {
		const picked = await desktopApi.openFolderPicker();
		if (!picked) return;
		setRepoDir(picked);
		setMountPathEdited(false);
	};

	const link = async () => {
		if (!authToken || !repoDir || !selectedFolder || !workspaceId) return;
		setPending("link");
		setLastResult(null);
		try {
			const result = await desktopApi.linkRepoFolder({
				folderId: selectedFolder._id,
				folderName: selectedFolder.name,
				workspaceId,
				repoDir,
				mountPath: mountPath || undefined,
				deploymentUrl,
				authToken,
			});
			setLastResult(result);
			await refreshMounts();
			if (!result.isGitRepo) {
				toast.warning("That folder is not a git repository", {
					description:
						"The folder was mounted anyway, but no git exclude was written.",
				});
			} else if (!result.excluded && result.manualGitignoreLine) {
				toast.warning("Could not update .git/info/exclude", {
					description: `Add this line to your .gitignore manually: ${result.manualGitignoreLine}`,
					duration: 12_000,
				});
			} else {
				toast.success("Repo linked", {
					description: `Mounted at ${result.mountPath} — invisible to git status.`,
				});
			}
			if (result.brainSeeded) {
				toast.success("BRAIN.md created", {
					description:
						"An agent-context file was seeded in the folder. Edit it like any doc.",
				});
			}
		} catch (error) {
			toast.error("Failed to link repo", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setPending(null);
		}
	};

	const unlink = async (mount: RepoMount) => {
		setPending("unlink");
		try {
			await desktopApi.unlinkRepoFolder(mount.folderId);
			await refreshMounts();
			toast("Repo unlinked", {
				description: `Sync stopped. The files at ${mount.mountPath} were left on disk.`,
			});
		} catch (error) {
			toast.error("Failed to unlink repo", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setPending(null);
		}
	};

	const isBusy = pending !== null;

	return (
		<div className="grid gap-4 text-xs">
			{mounts.length > 0 ? (
				<div className="grid gap-2">
					<p className="font-medium text-foreground">Linked repos</p>
					<ul className="grid gap-2">
						{mounts.map((mount) => (
							<li
								key={mount.folderId}
								className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border [padding-block:0.5rem] [padding-inline:0.625rem]"
							>
								<div className="grid min-w-0 gap-0.5">
									<p className="font-medium text-foreground">
										{mount.folderName}
										{mount.repoName ? ` → ${mount.repoName}` : ""}
									</p>
									<p className="break-all text-muted-foreground">
										{mount.mountPath}
									</p>
									<p className="text-muted-foreground">
										{mount.status === "disconnected"
											? "Not syncing (sign in to reconnect)"
											: `Sync: ${mount.status}`}
									</p>
								</div>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => void unlink(mount)}
									disabled={isBusy}
								>
									Unlink
								</Button>
							</li>
						))}
					</ul>
					<p className="text-muted-foreground">
						Unlinking stops sync on this machine and leaves the files on disk.
					</p>
				</div>
			) : null}

			<div className="grid max-w-md gap-2">
				<p className="font-medium text-foreground">Link a folder to a repo</p>
				<label htmlFor="repo-link-workspace" className="text-xs font-medium">
					Space
				</label>
				<select
					id="repo-link-workspace"
					value={workspaceId}
					onChange={(event) => {
						setWorkspaceId(event.target.value);
						setFolderId("");
					}}
					disabled={isBusy || workspaces === undefined}
					className="w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
				>
					{workspaces === undefined ? (
						<option value="">Loading spaces…</option>
					) : workspaces.length === 0 ? (
						<option value="">No spaces available</option>
					) : (
						workspaces.map((workspace) => (
							<option key={workspace._id} value={workspace._id}>
								{workspace.name}
							</option>
						))
					)}
				</select>

				<label htmlFor="repo-link-folder" className="text-xs font-medium">
					Cloud folder
				</label>
				<select
					id="repo-link-folder"
					value={folderId}
					onChange={(event) => {
						setFolderId(event.target.value);
						setMountPathEdited(false);
					}}
					disabled={isBusy || !workspaceId || folders === undefined}
					className="w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
				>
					<option value="">
						{folders === undefined ? "Loading folders…" : "Choose a folder…"}
					</option>
					{(folders ?? []).map((folder) => (
						<option key={folder._id} value={folder._id}>
							{folder.name}
						</option>
					))}
				</select>

				<div className="grid gap-1">
					<span className="text-xs font-medium">Local git repository</span>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => void pickRepoDir()}
							disabled={isBusy}
						>
							{repoDir ? "Change repo…" : "Choose repo…"}
						</Button>
						{repoDir ? (
							<span className="break-all text-muted-foreground">{repoDir}</span>
						) : null}
					</div>
				</div>

				{repoDir && selectedFolder ? (
					<div className="grid gap-1">
						<label
							htmlFor="repo-link-mount-path"
							className="text-xs font-medium"
						>
							Mount path
						</label>
						<input
							id="repo-link-mount-path"
							type="text"
							value={mountPath}
							onChange={(event) => {
								setMountPath(event.target.value);
								setMountPathEdited(true);
							}}
							disabled={isBusy}
							className="w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
						/>
						<p className="text-muted-foreground">
							The folder's documents appear here as files, excluded from git.
						</p>
					</div>
				) : null}

				<div>
					<Button
						type="button"
						size="sm"
						onClick={() => void link()}
						disabled={isBusy || !authToken || !repoDir || !selectedFolder}
					>
						{pending === "link" ? "Linking…" : "Link repo"}
					</Button>
				</div>

				{lastResult &&
				!lastResult.excluded &&
				lastResult.manualGitignoreLine ? (
					<div className="grid gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 [padding-block:0.5rem] [padding-inline:0.625rem]">
						<p className="font-medium text-foreground">
							Add this line to your .gitignore
						</p>
						<code className="break-all">{lastResult.manualGitignoreLine}</code>
						<p className="text-muted-foreground">
							Hubble could not write .git/info/exclude, so git will see the
							mount until you ignore it manually. Sync works either way.
						</p>
					</div>
				) : null}
			</div>
		</div>
	);
}
