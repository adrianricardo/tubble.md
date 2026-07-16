import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { Button, Input, Modal } from "@hubble.md/ui";
import { useQuery } from "convex/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import MingcuteFolderOpenLine from "~icons/mingcute/folder-open-line";
import { desktopConvexUrl } from "../convex";
import { desktopApi } from "../desktopApi";
import type {
	AuthorityTransferOperation,
	CloudToGitAuthorityMoveResult,
	GitDestinationInspection,
	GitFolderInspection,
	GitToCloudAuthorityMoveResult,
} from "../desktopApi/types";
import {
	canConfirmCloudToGit,
	canConfirmGitToCloud,
	parseShareRecipients,
	previewChanged,
	safeGitFolderName,
} from "./authorityMovePreviewModel";

const authorityPreviewFocusDelayMs = 100;

export type AuthorityPreviewTarget =
	| {
			direction: "git-to-cloud";
			intent: "move" | "share";
			folderPath: string;
			name: string;
	  }
	| {
			direction: "cloud-to-git";
			intent: "move" | "export-copy";
			workspaceId: string;
			folderId: string;
			name: string;
	  };

function useOnlineState() {
	const [online, setOnline] = useState(() => navigator.onLine);
	useEffect(() => {
		const update = () => setOnline(navigator.onLine);
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, []);
	return online;
}

export function AuthorityMovePreviewDialog({
	target,
	onClose,
	onReverse,
	onManageShare,
}: {
	target: AuthorityPreviewTarget;
	onClose: () => void;
	onReverse: (target: AuthorityPreviewTarget) => void;
	onManageShare?: (folderId: string, folderName: string) => void;
}) {
	const online = useOnlineState();
	const authToken = useAuthToken();
	const cancelRef = useRef<HTMLButtonElement>(null);
	const operationId = useRef(crypto.randomUUID());
	const journalSaveRef = useRef<Promise<void> | null>(null);
	const [completion, setCompletion] = useState<Extract<
		CloudToGitAuthorityMoveResult,
		{ status: "completed" }
	> | null>(null);
	const [gitToCloudCompletion, setGitToCloudCompletion] = useState<Extract<
		GitToCloudAuthorityMoveResult,
		{ status: "completed" }
	> | null>(null);
	const [undoEligible, setUndoEligible] = useState(false);
	const destinationInputId = useId();
	const shareRecipientsId = useId();
	const workspaces = useQuery(
		api.sync.listWorkspaces,
		target.direction === "git-to-cloud" ? {} : "skip",
	);
	const [workspaceId, setWorkspaceId] = useState<string | null>(null);
	const selectedWorkspaceId =
		target.direction === "git-to-cloud"
			? (workspaceId ?? workspaces?.[0]?._id ?? null)
			: null;
	const [shareRecipientInput, setShareRecipientInput] = useState("");
	const [shareRole, setShareRole] = useState<"editor" | "commenter" | "viewer">(
		"editor",
	);
	const parsedShareRecipients = useMemo(
		() => parseShareRecipients(shareRecipientInput, shareRole),
		[shareRecipientInput, shareRole],
	);
	const requestedShares = useMemo(
		() =>
			target.direction === "git-to-cloud" && target.intent === "share"
				? parsedShareRecipients.shares
				: [],
		[parsedShareRecipients.shares, target.direction, target.intent],
	);
	const gitAudience = useQuery(
		api.authorityTransfers.getGitFolderMoveAudience,
		target.direction === "git-to-cloud" && selectedWorkspaceId
			? {
					workspaceId: selectedWorkspaceId as Id<"workspaces">,
					rootName: target.name,
					requestedShares,
				}
			: "skip",
	);
	const cloudMovePreview = useQuery(
		api.authorityTransfers.getCloudFolderMovePreview,
		target.direction === "cloud-to-git" &&
			target.intent === "move" &&
			!completion
			? { folderId: target.folderId as Id<"folders"> }
			: "skip",
	);
	const cloudCopyPreview = useQuery(
		api.authorityTransfers.getCloudFolderExportCopyPreview,
		target.direction === "cloud-to-git" &&
			target.intent === "export-copy" &&
			!completion
			? { folderId: target.folderId as Id<"folders"> }
			: "skip",
	);
	const cloudPreview = cloudMovePreview ?? cloudCopyPreview;
	const [placementId, setPlacementId] = useState<string | null>(null);
	const [repositoryPath, setRepositoryPath] = useState<string | null>(null);
	const [relativePath, setRelativePath] = useState(() =>
		safeGitFolderName(target.name),
	);
	const [inspection, setInspection] = useState<
		GitFolderInspection | GitDestinationInspection | null
	>(null);
	const [loading, setLoading] = useState(false);
	const [moving, setMoving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [stale, setStale] = useState(false);
	const [journaled, setJournaled] = useState(false);
	const [reviewedCloudFingerprint, setReviewedCloudFingerprint] = useState<
		string | null
	>(null);
	useEffect(() => {
		const focusTimer = window.setTimeout(
			() => cancelRef.current?.focus(),
			authorityPreviewFocusDelayMs,
		);
		return () => window.clearTimeout(focusTimer);
	}, []);
	useEffect(() => {
		if (target.direction !== "cloud-to-git") return;
		void desktopApi.listFolderAuthorityPlacements().then((placements) => {
			setPlacementId(
				placements.find(
					(placement) => placement.cloudFolderId === target.folderId,
				)?.id ?? null,
			);
		});
	}, [target]);

	const inspect = async () => {
		setLoading(true);
		setError(null);
		try {
			const next =
				target.direction === "git-to-cloud"
					? await desktopApi.inspectGitAuthorityFolder(target.folderPath)
					: repositoryPath
						? await desktopApi.inspectGitAuthorityDestination({
								repositoryPath,
								relativePath,
							})
						: null;
			if (next) {
				const changed = previewChanged(
					inspection?.previewFingerprint ?? null,
					next.previewFingerprint,
				);
				setStale(changed);
				if (changed) setJournaled(false);
				setInspection(next);
			}
			if (
				target.direction === "cloud-to-git" &&
				cloudPreview &&
				reviewedCloudFingerprint !== null &&
				reviewedCloudFingerprint !== cloudPreview.previewFingerprint
			) {
				setJournaled(false);
				setStale(false);
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setLoading(false);
		}
	};

	// The target is immutable while this keyed modal is open; refreshes are explicit.
	// biome-ignore lint/correctness/useExhaustiveDependencies: run one initial Git inspection per target
	useEffect(() => {
		if (target.direction === "git-to-cloud") void inspect();
	}, [target]);

	useEffect(() => {
		if (!inspection || journaled) return;
		if (
			target.direction === "git-to-cloud" &&
			(!selectedWorkspaceId || !gitAudience)
		)
			return;
		if (
			target.direction === "cloud-to-git" &&
			(!repositoryPath || !cloudPreview)
		)
			return;
		const now = Date.now();
		const operation: AuthorityTransferOperation = {
			id: operationId.current,
			direction: target.direction,
			intent: target.intent,
			phase: "draft",
			source:
				target.direction === "git-to-cloud"
					? {
							kind: "git",
							repoRoot: (inspection as GitFolderInspection).repoRoot,
							relativePath: (inspection as GitFolderInspection).relativePath,
						}
					: {
							kind: "cloud",
							workspaceId: target.workspaceId,
							folderId: target.folderId,
						},
			destination:
				target.direction === "git-to-cloud"
					? {
							kind: "cloud",
							workspaceId: selectedWorkspaceId as string,
							parentFolderId: null,
						}
					: {
							kind: "git",
							repoRoot: (inspection as GitDestinationInspection).repoRoot,
							relativePath: (inspection as GitDestinationInspection)
								.relativePath,
						},
			manifestSummary:
				target.direction === "git-to-cloud"
					? (inspection as GitFolderInspection).manifest.summary
					: {
							folderCount: 0,
							markdownCount: cloudPreview?.manifest.markdownCount ?? 0,
							assetCount: cloudPreview?.manifest.assetCount ?? 0,
							totalBytes: cloudPreview?.manifest.totalBytes ?? 0,
							excludedCount:
								cloudPreview?.manifest.excludedAuthorityRoots.length ?? 0,
							blockingExclusionCount: 0,
						},
			manifestHash:
				target.direction === "git-to-cloud"
					? (inspection as GitFolderInspection).manifest.manifestHash
					: (cloudPreview?.manifest.manifestHash ?? null),
			previewFingerprint:
				target.direction === "git-to-cloud"
					? inspection.previewFingerprint
					: (cloudPreview?.previewFingerprint ?? null),
			requestedShares,
			audienceFingerprint:
				target.direction === "git-to-cloud"
					? (gitAudience?.fingerprint ?? null)
					: null,
			destinationPreviewFingerprint:
				target.direction === "cloud-to-git"
					? inspection.previewFingerprint
					: null,
			lastError: null,
			createdAt: now,
			updatedAt: now,
		};
		const save = desktopApi
			.saveAuthorityTransferOperation(operation)
			.then(() => {
				setJournaled(true);
				if (target.direction === "cloud-to-git") {
					setReviewedCloudFingerprint(cloudPreview?.previewFingerprint ?? null);
				}
			})
			.catch((cause) =>
				setError(cause instanceof Error ? cause.message : String(cause)),
			);
		journalSaveRef.current = save;
	}, [
		cloudPreview,
		inspection,
		journaled,
		gitAudience,
		repositoryPath,
		requestedShares,
		selectedWorkspaceId,
		target,
	]);

	const cancel = async () => {
		if (moving) return;
		setMoving(true);
		try {
			const save = journalSaveRef.current;
			if (save) await save;
			if (journaled && authToken && desktopConvexUrl) {
				if (target.direction === "git-to-cloud") {
					await desktopApi.cancelGitToCloudAuthorityMove({
						operationId: operationId.current,
						deploymentUrl: desktopConvexUrl,
						authToken,
					});
				} else {
					await desktopApi.cancelCloudToGitAuthorityMove({
						operationId: operationId.current,
						deploymentUrl: desktopConvexUrl,
						authToken,
					});
				}
			} else if (save) {
				await desktopApi.cancelAuthorityTransferOperation(operationId.current);
			}
			onClose();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setMoving(false);
		}
	};
	const undoCloudToGit = async () => {
		if (!completion || !authToken || !desktopConvexUrl || moving) return;
		setMoving(true);
		setError(null);
		try {
			const eligible = await desktopApi.getCloudToGitUndoEligibility(
				operationId.current,
			);
			if (!eligible) {
				setUndoEligible(false);
				setError(
					"Git files changed after the move. Use Move to Hubble Cloud from the folder menu so new work is reviewed.",
				);
				return;
			}
			const result = await desktopApi.undoCloudToGitAuthorityMove({
				operationId: operationId.current,
				deploymentUrl: desktopConvexUrl,
				authToken,
			});
			if (result.status === "restored") {
				onClose();
				return;
			}
			if (result.status === "changed") {
				setUndoEligible(false);
				setError(
					"Git files changed after the move. Start Move to Hubble Cloud from the folder menu.",
				);
				return;
			}
			setError(result.message);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setMoving(false);
		}
	};
	const confirmCloudToGit = async () => {
		if (
			target.direction !== "cloud-to-git" ||
			!destinationInspection ||
			!cloudPreview ||
			!repositoryPath ||
			!authToken ||
			!desktopConvexUrl ||
			moving
		) {
			return;
		}
		setMoving(true);
		setError(null);
		try {
			if (journalSaveRef.current) await journalSaveRef.current;
			const result = await desktopApi.moveCloudFolderToGit({
				operationId: operationId.current,
				cloudFolderId: target.folderId,
				repositoryPath,
				relativePath,
				placementId,
				deploymentUrl: desktopConvexUrl,
				authToken,
				expectedCloudPreviewFingerprint: cloudPreview.previewFingerprint,
				expectedDestinationFingerprint:
					destinationInspection.previewFingerprint,
				intent: target.intent,
			});
			if (result.status === "stale") {
				setInspection(result.destination);
				setStale(true);
				setJournaled(false);
				return;
			}
			if (result.status === "needs-attention") {
				setError(result.message);
				return;
			}
			setCompletion(result);
			setUndoEligible(result.undoEligible);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setMoving(false);
		}
	};
	const confirmGitToCloud = async () => {
		if (
			target.direction !== "git-to-cloud" ||
			!sourceInspection ||
			!selectedWorkspaceId ||
			!gitAudience ||
			!authToken ||
			!desktopConvexUrl ||
			moving
		) {
			return;
		}
		setMoving(true);
		setError(null);
		try {
			if (journalSaveRef.current) await journalSaveRef.current;
			const result = await desktopApi.moveGitFolderToCloud({
				operationId: operationId.current,
				folderPath: target.folderPath,
				workspaceId: selectedWorkspaceId,
				parentFolderId: null,
				deploymentUrl: desktopConvexUrl,
				authToken,
				expectedPreviewFingerprint: sourceInspection.previewFingerprint,
				expectedAudienceFingerprint: gitAudience.fingerprint,
				intent: target.intent,
				requestedShares,
			});
			if (result.status === "stale") {
				setInspection(result.inspection);
				setStale(true);
				setJournaled(false);
				return;
			}
			if (result.status === "needs-attention") {
				setError(result.message);
				return;
			}
			setGitToCloudCompletion(result);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setMoving(false);
		}
	};
	const chooseRepository = async () => {
		const selected = await desktopApi.createFolderPicker({
			title: "Choose a Git repository",
			create: false,
		});
		if (!selected) return;
		setRepositoryPath(selected);
		setInspection(null);
		setStale(false);
	};

	const sourceInspection =
		target.direction === "git-to-cloud"
			? (inspection as GitFolderInspection | null)
			: null;
	const destinationInspection =
		target.direction === "cloud-to-git"
			? (inspection as GitDestinationInspection | null)
			: null;
	const cloudPreviewChanged =
		target.direction === "cloud-to-git" &&
		journaled &&
		reviewedCloudFingerprint !== null &&
		cloudPreview !== undefined &&
		reviewedCloudFingerprint !== cloudPreview.previewFingerprint;
	const previewIsStale = stale || cloudPreviewChanged;
	if (gitToCloudCompletion && target.direction === "git-to-cloud") {
		return (
			<Modal
				open
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
				initialFocus={cancelRef}
				finalFocus={false}
				title={`“${target.name}” is now stored in Hubble Cloud`}
				description="Hubble verified every supported byte before changing the folder’s authority."
				className="max-w-lg"
			>
				<div className="flex flex-col gap-4 text-xs">
					<output
						className="rounded-sm border border-border bg-muted/30 p-3"
						aria-live="polite"
					>
						<p className="m-0 font-medium text-foreground">
							Now stored in Hubble Cloud
						</p>
						<p className="m-0 text-muted-foreground">
							{target.intent === "share"
								? "The reviewed recipients and inherited Workspace audience can collaborate now."
								: "The folder is available on the web with realtime collaboration."}
						</p>
					</output>
					<div className="flex flex-col gap-1 text-muted-foreground">
						<p className="m-0">
							The original Git bytes are retained outside the repository at:
						</p>
						<p className="m-0 break-all text-foreground">
							{gitToCloudCompletion.recoveryPath}
						</p>
						<p className="m-0">
							Hubble did not commit, push, rewrite history, or alter the
							repository remote. No editable local cloud projection was created.
						</p>
					</div>
					<div className="flex flex-wrap justify-end gap-2 border-t border-border [padding-block-start:0.75rem]">
						<Button
							type="button"
							variant="outline"
							onClick={() =>
								void navigator.clipboard.writeText(
									gitToCloudCompletion.recoveryPath,
								)
							}
						>
							Copy recovery path
						</Button>
						{onManageShare ? (
							<Button
								type="button"
								variant="outline"
								onClick={() =>
									onManageShare(gitToCloudCompletion.cloudFolderId, target.name)
								}
							>
								Manage sharing
							</Button>
						) : null}
						{selectedWorkspaceId ? (
							<Button
								type="button"
								variant="outline"
								onClick={() =>
									onReverse({
										direction: "cloud-to-git",
										intent: "move",
										workspaceId: selectedWorkspaceId,
										folderId: gitToCloudCompletion.cloudFolderId,
										name: target.name,
									})
								}
							>
								Move back to Git…
							</Button>
						) : null}
						<Button ref={cancelRef} type="button" onClick={onClose}>
							Done
						</Button>
					</div>
				</div>
			</Modal>
		);
	}
	if (completion) {
		return (
			<Modal
				open
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
				initialFocus={cancelRef}
				finalFocus={false}
				title={
					completion.cloudArchived
						? `“${target.name}” is now stored in Git`
						: `Git copy of “${target.name}” exported`
				}
				description={
					completion.cloudArchived
						? "Hubble verified the exported bytes before ending web and realtime access."
						: "Hubble verified the exported bytes. The cloud folder remains authoritative and collaborative."
				}
				className="max-w-lg"
			>
				<div className="flex flex-col gap-4 text-xs">
					<output className="sr-only" aria-live="polite">
						{moving
							? "Restoring cloud folder"
							: completion.cloudArchived
								? "Move completed"
								: "Git copy exported"}
					</output>
					<output
						className="rounded-sm border border-border bg-muted/30 p-3"
						aria-live="polite"
					>
						<p className="m-0 font-medium text-foreground">
							{completion.cloudArchived
								? "Now stored in Git"
								: "Detached Git copy"}
						</p>
						<p className="m-0 break-all text-muted-foreground">
							{completion.destinationPath}
						</p>
					</output>
					<div className="flex flex-col gap-1 text-muted-foreground">
						<p className="m-0">
							{completion.workingTreeChanges.length} visible working-tree
							changes. Review and commit with your normal Git tools; Hubble did
							not commit or push.
						</p>
						{completion.cloudArchived ? (
							<>
								<p className="m-0">
									The cloud folder remains as recoverable history with no
									automatic expiry currently scheduled, but permanent retention
									is not promised. It is no longer available on the web or
									through Hubble sharing links.
								</p>
								<p className="m-0">
									{undoEligible
										? "Undo is available while these Git bytes remain unchanged."
										: "The Git folder changed; use Move to Hubble Cloud from its folder menu to review the reverse move."}
								</p>
							</>
						) : (
							<p className="m-0">
								This independent snapshot has no Hubble permissions. Editing it
								does not update Hubble Cloud; cloud sharing and history are
								unchanged.
							</p>
						)}
					</div>
					{error ? (
						<p
							role="alert"
							className="m-0 rounded-sm border border-destructive/40 bg-destructive/10 p-3"
						>
							{error}
						</p>
					) : null}
					<div className="flex flex-wrap justify-end gap-2 border-t border-border [padding-block-start:0.75rem]">
						<Button
							type="button"
							variant="outline"
							onClick={() =>
								void navigator.clipboard.writeText(completion.destinationPath)
							}
						>
							Copy path
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() =>
								void desktopApi.revealFile(completion.destinationPath)
							}
						>
							Reveal in Finder
						</Button>
						{undoEligible ? (
							<Button
								type="button"
								variant="outline"
								disabled={moving}
								onClick={() => void undoCloudToGit()}
							>
								{moving ? "Restoring…" : "Undo"}
							</Button>
						) : null}
						{completion.cloudArchived ? (
							<Button
								type="button"
								variant="outline"
								onClick={() =>
									onReverse({
										direction: "git-to-cloud",
										intent: "move",
										folderPath: completion.destinationPath,
										name: target.name,
									})
								}
							>
								Move to Hubble Cloud…
							</Button>
						) : null}
						<Button ref={cancelRef} type="button" onClick={onClose}>
							Done
						</Button>
					</div>
				</div>
			</Modal>
		);
	}

	return (
		<Modal
			open
			onOpenChange={(open) => {
				if (!open) void cancel();
			}}
			initialFocus={cancelRef}
			finalFocus={false}
			title={
				target.direction === "git-to-cloud"
					? `${target.intent === "share" ? "Share" : "Move"} “${target.name}” in Hubble Cloud`
					: target.intent === "export-copy"
						? `Export “${target.name}” as a Git copy`
						: `Move “${target.name}” to Git`
			}
			description={
				target.direction === "git-to-cloud"
					? "Review the exact content and audience before a verified authority move."
					: target.intent === "export-copy"
						? "Review exact files and Git state. This copy does not change the cloud folder."
						: "Review exact files, access loss, Git state, and recoverable cloud history before moving."
			}
			className="max-w-xl"
		>
			<div className="flex flex-col gap-4 text-xs">
				<output className="sr-only" aria-live="polite">
					{moving
						? target.direction === "git-to-cloud"
							? "Moving folder to Hubble Cloud"
							: target.intent === "export-copy"
								? "Exporting Git copy"
								: "Moving folder to Git"
						: loading
							? "Refreshing move preview"
							: error
								? "Folder move needs attention"
								: "Folder move preview ready"}
				</output>
				{!online ? (
					<output className="rounded-sm border border-warning/40 bg-warning/10 p-3">
						You’re offline. Cloud audience data may be stale; reconnect and
						refresh before continuing.
					</output>
				) : null}
				{target.direction === "git-to-cloud" ? (
					<>
						<label className="flex flex-col gap-1.5 font-medium">
							<span>Destination</span>
							<select
								value={selectedWorkspaceId ?? ""}
								onChange={(event) => {
									setWorkspaceId(event.currentTarget.value);
									setJournaled(false);
								}}
								className="h-8 rounded-sm border border-input bg-background px-2"
							>
								{workspaces?.map((workspace) => (
									<option key={workspace._id} value={workspace._id}>
										{workspace.name} — Workspace root
									</option>
								))}
							</select>
							<span className="font-normal text-muted-foreground">
								This first verified move targets the Workspace root; nested
								cloud destination selection remains a later UI slice.
							</span>
						</label>
						<PreviewCard title="Content">
							{sourceInspection ? (
								<>
									<p className="break-all text-foreground">
										{sourceInspection.sourcePath}
									</p>
									<p>
										{sourceInspection.manifest.summary.markdownCount} Markdown
										files, {sourceInspection.manifest.summary.assetCount}{" "}
										assets, {sourceInspection.manifest.summary.folderCount}{" "}
										folders.
									</p>
									<p>
										{sourceInspection.manifest.summary.excludedCount} excluded;{" "}
										{sourceInspection.manifest.summary.blockingExclusionCount}{" "}
										block confirmation.
									</p>
									<p>
										{sourceInspection.workingTreeChanges.length} visible
										working-tree changes. Git history stays in the repository.
									</p>
									{sourceInspection.manifest.exclusions.length > 0 ? (
										<PreviewDetails label="Review exclusions">
											{sourceInspection.manifest.exclusions.map((item) => (
												<li key={`${item.relativePath}:${item.reason}`}>
													{item.relativePath || "."} —{" "}
													{item.reason === "nested-authority"
														? "independent Hubble Cloud folder; move it from its own folder menu"
														: item.reason}
													{item.blocking ? " (blocks confirmation)" : ""}
												</li>
											))}
										</PreviewDetails>
									) : null}
								</>
							) : (
								<p>Inspecting the selected Git folder…</p>
							)}
						</PreviewCard>
						<PreviewCard title="Audience">
							{target.intent === "share" ? (
								<div className="grid gap-2 sm:grid-cols-[1fr_auto]">
									<label
										htmlFor={shareRecipientsId}
										className="flex flex-col gap-1.5 font-medium"
									>
										<span>People to share with</span>
										<Input
											id={shareRecipientsId}
											value={shareRecipientInput}
											placeholder="name@example.com"
											onChange={(event) => {
												setShareRecipientInput(event.currentTarget.value);
												setJournaled(false);
											}}
										/>
									</label>
									<label className="flex flex-col gap-1.5 font-medium">
										<span>Role</span>
										<select
											value={shareRole}
											onChange={(event) => {
												setShareRole(
													event.currentTarget.value as typeof shareRole,
												);
												setJournaled(false);
											}}
											className="h-8 rounded-sm border border-input bg-background px-2"
										>
											<option value="editor">Can edit</option>
											<option value="commenter">Can comment</option>
											<option value="viewer">Can view</option>
										</select>
									</label>
									{parsedShareRecipients.invalid.length > 0 ? (
										<p
											role="alert"
											className="m-0 text-destructive sm:col-span-2"
										>
											Check: {parsedShareRecipients.invalid.join(", ")}
										</p>
									) : null}
								</div>
							) : null}
							<p>
								{gitAudience
									? `${gitAudience.audience.length} people and pending invitees will have inherited Workspace access at the root.`
									: "Loading the exact Workspace member list…"}
							</p>
							<p>No public link is introduced by this preview.</p>
							{gitAudience && gitAudience.audience.length > 0 ? (
								<PreviewDetails label="Review people and roles">
									{gitAudience.audience.map((entry) => (
										<li key={`${entry.kind}:${entry.id}`}>
											{entry.name ?? entry.email ?? "Unknown member"} —{" "}
											{entry.role}
											{entry.kind === "invite" ? " (pending invite)" : ""}
										</li>
									))}
								</PreviewDetails>
							) : null}
						</PreviewCard>
						<PreviewCard title="After a verified cutover">
							<p>
								{target.intent === "share"
									? "Sharing uses the same authority move; it never creates a hidden copy."
									: "The selected folder becomes available on the web with realtime collaboration."}
							</p>
							<p>
								Supported working files leave Git authority only after cloud
								verification. Hubble will not commit, push, alter remotes, or
								erase prior Git history.
							</p>
							<p>
								Recovery bytes are retained outside the repository. This first
								cutover does not create an editable local cloud projection.
							</p>
						</PreviewCard>
					</>
				) : (
					<>
						<div className="grid gap-2 sm:grid-cols-[1fr_auto]">
							<label
								htmlFor={destinationInputId}
								className="flex flex-col gap-1.5 font-medium"
							>
								<span>Git destination folder</span>
								<Input
									id={destinationInputId}
									value={relativePath}
									onChange={(event) => {
										setRelativePath(event.currentTarget.value);
										setInspection(null);
										setJournaled(false);
									}}
								/>
							</label>
							<Button
								type="button"
								variant="outline"
								className="self-end"
								onClick={() => void chooseRepository()}
							>
								<MingcuteFolderOpenLine />
								{repositoryPath ? "Change repository" : "Choose repository"}
							</Button>
						</div>
						{repositoryPath ? (
							<p className="break-all text-muted-foreground">
								{repositoryPath}
							</p>
						) : null}
						<PreviewCard title="Content and history">
							<p>
								{cloudPreview
									? `${cloudPreview.manifest.markdownCount} Markdown files and ${cloudPreview.manifest.assetCount} assets (${cloudPreview.manifest.totalBytes.toLocaleString()} bytes) will ${target.intent === "export-copy" ? "be copied" : "move"}.`
									: "Loading the authoritative cloud manifest…"}
							</p>
							<p>
								{cloudPreview
									? target.intent === "export-copy"
										? `${cloudPreview.history.revisionCount} Hubble revisions remain with the authoritative cloud folder; they do not become Git commits.`
										: `${cloudPreview.history.revisionCount} Hubble revisions remain in the recoverable cloud archive; they do not become Git commits.`
									: "Cloud revision history does not become Git commits."}
							</p>
							{target.intent === "move" ? (
								<p>
									No automatic cloud archive expiry is currently scheduled, but
									Hubble does not promise permanent retention.
								</p>
							) : null}
							{cloudPreview ? (
								<PreviewDetails label="Review destination paths">
									{cloudPreview.manifest.items.map((item) => (
										<li key={item.relativePath}>
											{item.relativePath} — {item.kind},{" "}
											{item.size.toLocaleString()} bytes
										</li>
									))}
								</PreviewDetails>
							) : null}
							{cloudPreview?.manifest.excludedAuthorityRoots.length ? (
								<PreviewDetails label="Independent Git folders not moved">
									{cloudPreview.manifest.excludedAuthorityRoots.map(
										(boundary) => (
											<li key={boundary.folderId}>
												{boundary.relativePath} — stored independently in Git
											</li>
										),
									)}
								</PreviewDetails>
							) : null}
						</PreviewCard>
						<PreviewCard title="Audience consequence">
							<p>
								{cloudMovePreview
									? `${cloudMovePreview.audience.entries.length} inherited cloud access entries currently apply.`
									: target.intent === "export-copy"
										? "Cloud access, links, and realtime collaboration remain unchanged."
										: "Loading inherited members, shares, invites, and links…"}
							</p>
							<p>
								{cloudMovePreview?.audience.publicLinkRole
									? `The public link (${cloudMovePreview.audience.publicLinkRole}) will stop working.`
									: target.intent === "move"
										? "There is no inherited public link on this folder."
										: "The detached Git copy receives no Hubble sharing link."}
							</p>
							<p>
								{target.intent === "move"
									? "After cutover, repository access and distribution replace Hubble permissions, realtime collaboration, and web editing."
									: "Repository access applies only to the detached copy."}
							</p>
							{cloudMovePreview &&
							cloudMovePreview.audience.entries.length > 0 ? (
								<PreviewDetails label="Review people and roles">
									{cloudMovePreview.audience.entries.map((entry) => (
										<li key={`${entry.kind}:${entry.id}:${entry.role}`}>
											{entry.name ?? entry.email ?? "Unknown collaborator"} —{" "}
											{entry.role}
											{entry.kind === "invite" ? " (pending invite)" : ""}
										</li>
									))}
								</PreviewDetails>
							) : null}
						</PreviewCard>
						{destinationInspection ? (
							<PreviewCard title="Repository check">
								<p>
									{destinationInspection.repoName} ·{" "}
									{destinationInspection.collision === "occupied"
										? "Destination is occupied and blocks confirmation."
										: "Destination is empty."}
								</p>
								<p>
									{destinationInspection.workingTreeChanges.length} visible
									working-tree changes.
								</p>
								<p className="break-all">
									Resolved path: {destinationInspection.destinationPath}
								</p>
								<p>
									Repository remote metadata does not establish its audience.
									Review, commit, and push with normal Git tools after the
									verified{" "}
									{target.intent === "export-copy" ? "export" : "cutover"}.
								</p>
								{destinationInspection.workingTreeChanges.length > 0 ? (
									<PreviewDetails label="Review working-tree changes">
										{destinationInspection.workingTreeChanges.map((change) => (
											<li key={`${change.status}:${change.path}`}>
												{change.status} {change.path}
											</li>
										))}
									</PreviewDetails>
								) : null}
							</PreviewCard>
						) : null}
					</>
				)}
				{previewIsStale ? (
					<output className="rounded-sm border border-warning/40 bg-warning/10 p-3">
						Preview changed; review again.
					</output>
				) : null}
				{error ? (
					<p
						role="alert"
						className="rounded-sm border border-destructive/40 bg-destructive/10 p-3"
					>
						{error}
					</p>
				) : null}
				<div className="flex items-center justify-between gap-3 border-t border-border [padding-block-start:0.75rem]">
					<p className="text-muted-foreground">
						{target.direction === "git-to-cloud"
							? "Hubble stages and verifies cloud bytes before moving the Git source into retained recovery."
							: "Hubble writes and verifies Git bytes first, then ends web and realtime access while retaining cloud recovery."}
					</p>
					<div className="flex shrink-0 gap-2">
						<Button
							ref={cancelRef}
							type="button"
							variant="ghost"
							onClick={() => void cancel()}
						>
							{moving ? "Working…" : "Cancel"}
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={
								loading ||
								moving ||
								(target.direction === "cloud-to-git" && !repositoryPath)
							}
							onClick={() => void inspect()}
						>
							{loading ? "Inspecting…" : "Refresh preview"}
						</Button>
						{target.direction === "git-to-cloud" ? (
							<Button
								type="button"
								disabled={
									!canConfirmGitToCloud({
										online,
										journaled,
										hasInspection: sourceInspection !== null,
										confirmationBlocked:
											sourceInspection?.confirmationBlocked ?? true,
										hasWorkspace: selectedWorkspaceId !== null,
										membersLoaded: gitAudience !== undefined,
										authReady: Boolean(authToken && desktopConvexUrl),
										stale,
										busy: moving || loading,
										shareIntentReady:
											target.intent !== "share" ||
											(requestedShares.length > 0 &&
												parsedShareRecipients.invalid.length === 0),
									})
								}
								onClick={() => void confirmGitToCloud()}
							>
								{moving
									? "Moving…"
									: target.intent === "share"
										? "Share in Cloud"
										: "Move to Cloud"}
							</Button>
						) : (
							<Button
								type="button"
								disabled={
									!canConfirmCloudToGit({
										online,
										journaled,
										hasCloudPreview: cloudPreview !== undefined,
										hasDestination: destinationInspection !== null,
										destinationOccupied:
											destinationInspection?.collision === "occupied",
										authReady: Boolean(authToken && desktopConvexUrl),
										stale: previewIsStale,
										busy: moving || loading,
									})
								}
								onClick={() => void confirmCloudToGit()}
							>
								{moving
									? target.intent === "export-copy"
										? "Exporting…"
										: "Moving…"
									: target.intent === "export-copy"
										? "Export Git copy"
										: "Move to Git"}
							</Button>
						)}
					</div>
				</div>
			</div>
		</Modal>
	);
}

function PreviewCard({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-1 rounded-sm border border-border bg-muted/30 p-3">
			<h3 className="m-0 text-xs font-semibold">{title}</h3>
			<div className="flex flex-col gap-1 text-muted-foreground [&_p]:m-0">
				{children}
			</div>
		</section>
	);
}

function PreviewDetails({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<details className="[padding-block-start:0.25rem]">
			<summary className="cursor-pointer font-medium text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring">
				{label}
			</summary>
			<ul className="mb-0 flex max-h-32 flex-col gap-1 overflow-auto [padding-inline-start:1.25rem]">
				{children}
			</ul>
		</details>
	);
}
