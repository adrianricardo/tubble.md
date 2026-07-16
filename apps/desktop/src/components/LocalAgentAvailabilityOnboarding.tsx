import { Button, Modal } from "@hubble.md/ui";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import MingcuteCheckCircleLine from "~icons/mingcute/check-circle-line";
import MingcuteComputerLine from "~icons/mingcute/computer-line";
import MingcuteCopy2Line from "~icons/mingcute/copy-2-line";
import MingcuteFolderOpenLine from "~icons/mingcute/folder-open-line";
import { desktopConvexUrl } from "../convex";
import { desktopApi } from "../desktopApi";
import type {
	DirectProjectionScope,
	LocalAvailabilityRecord,
} from "../desktopApi/types";
import { revealFileLabel } from "../lib/revealFile";
import {
	agentInstructions,
	availabilityJourneyState,
	availabilitySuggestedPath,
	directScopeKey,
	setupProgressLabel,
} from "./localAgentAvailabilityModel";
import { RepoAvailabilitySetup } from "./RepoAvailabilitySetup";

type SetupPhase =
	| "preview"
	| "verifying"
	| "materializing"
	| "error"
	| "complete";

export function LocalAgentAvailabilityOnboarding({
	scope,
	displayName,
	contextDetail,
	capability,
	availability,
	legacyMirror,
	authToken,
	onAvailabilityChanged,
	onOpenSettings,
}: {
	scope: DirectProjectionScope;
	displayName: string;
	contextDetail: string;
	capability: "read-write" | "read-only";
	availability: LocalAvailabilityRecord | null;
	legacyMirror: LocalAvailabilityRecord | null;
	authToken: string | null;
	onAvailabilityChanged: (record: LocalAvailabilityRecord) => void;
	onOpenSettings: () => void;
}) {
	const scopeKey = directScopeKey(scope);
	const suggestedPath = availabilitySuggestedPath(
		desktopApi.homeDir,
		displayName,
	);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [journey, setJourney] = useState<"standalone" | "repo">("standalone");
	const [phase, setPhase] = useState<SetupPhase>("preview");
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [completion, setCompletion] = useState<LocalAvailabilityRecord | null>(
		null,
	);
	const [completionName, setCompletionName] = useState(displayName);
	const [instructionsVisible, setInstructionsVisible] = useState(false);
	const [retrying, setRetrying] = useState(false);
	const chooseButtonRef = useRef<HTMLButtonElement>(null);
	const dismissedKey = `hubble:local-availability-guide-dismissed:${scopeKey}`;
	const [dismissed, setDismissed] = useState(
		() => localStorage.getItem(dismissedKey) === "1",
	);
	const state = availabilityJourneyState(availability, legacyMirror);
	const busy = phase === "verifying" || phase === "materializing";
	const connected = completion ?? (state === "ready" ? availability : null);

	useEffect(
		() =>
			desktopApi.onLocalAvailabilityProgress((event) => {
				if (event.scopeKey === scopeKey) setPhase(event.phase);
			}),
		[scopeKey],
	);

	const openSetup = () => {
		setJourney("standalone");
		setPhase("preview");
		setSelectedPath(null);
		setError(null);
		setCompletion(null);
		setInstructionsVisible(false);
		setDialogOpen(true);
	};
	const openRepoSetup = () => {
		setJourney("repo");
		setPhase("preview");
		setError(null);
		setCompletion(null);
		setCompletionName(displayName);
		setInstructionsVisible(false);
		setDialogOpen(true);
	};

	const chooseDestination = async () => {
		const path = await desktopApi.createFolderPicker({
			title: `Make “${displayName}” available`,
			defaultPath: selectedPath ?? suggestedPath,
			create: false,
		});
		if (path) setSelectedPath(path);
	};

	const createAvailability = async () => {
		if (!selectedPath || !authToken || !desktopConvexUrl || busy) return;
		setError(null);
		setPhase("verifying");
		try {
			const record = await desktopApi.createLocalAvailability({
				scope,
				displayName,
				localRoot: selectedPath,
				association: "standalone",
				deploymentUrl: desktopConvexUrl,
				authToken,
			});
			onAvailabilityChanged(record);
			if (record.state === "connected" || record.state === "syncing") {
				setCompletion(record);
				setCompletionName(displayName);
				setPhase("complete");
			} else {
				setError(
					record.state === "offline"
						? "The destination is saved, but Hubble is offline. Reconnect to finish setup."
						: "The destination is saved, but the local watcher is not connected yet.",
				);
				setPhase("error");
			}
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : String(caught));
			setPhase("error");
		}
	};

	const retryConnection = async (): Promise<LocalAvailabilityRecord | null> => {
		if (!authToken || !desktopConvexUrl || retrying) return null;
		setRetrying(true);
		try {
			const records = await desktopApi.reconnectLocalAvailability({
				deploymentUrl: desktopConvexUrl,
				authToken,
			});
			const next = records.find((record) => record.scopeKey === scopeKey);
			if (next) onAvailabilityChanged(next);
			if (!next || (next.state !== "connected" && next.state !== "syncing")) {
				toast.error("Local availability still needs attention", {
					description: "Check your connection, then try again.",
				});
			}
			return next ?? null;
		} catch (caught) {
			toast.error("Could not reconnect local availability", {
				description: caught instanceof Error ? caught.message : String(caught),
			});
			return null;
		} finally {
			setRetrying(false);
		}
	};

	const retrySetup = async () => {
		const next = await retryConnection();
		if (next?.state === "connected" || next?.state === "syncing") {
			setCompletion(next);
			setPhase("complete");
		}
	};

	const copyPath = async (localRoot: string) => {
		try {
			await navigator.clipboard.writeText(localRoot);
			toast.success("Local path copied");
		} catch {
			toast.error("Failed to copy local path");
		}
	};

	const copyInstructions = async (
		record: LocalAvailabilityRecord,
		name = displayName,
	) => {
		try {
			await navigator.clipboard.writeText(
				agentInstructions(name, record.localRoot),
			);
			toast.success("Agent instructions copied");
		} catch {
			toast.error("Failed to copy agent instructions");
		}
	};

	if (connected && !dialogOpen) {
		return (
			<div className="flex items-start gap-2 rounded-sm border border-border/70 bg-sidebar-accent/35 [padding-block:0.5rem] [padding-inline:0.625rem]">
				<MingcuteComputerLine className="size-3.5 shrink-0 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					<p className="m-0 truncate text-[11px] font-medium text-sidebar-foreground">
						Available on this Mac
					</p>
					<p
						className="m-0 truncate text-[10px] text-muted-foreground"
						title={connected.localRoot}
					>
						{connected.localRoot}
					</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => {
						setCompletion(connected);
						setPhase("complete");
						setDialogOpen(true);
					}}
				>
					Use with agent
				</Button>
			</div>
		);
	}

	return (
		<>
			{state === "legacy-overlap" ? (
				<div className="flex flex-col gap-2 rounded-sm border border-amber-500/35 bg-amber-500/10 [padding-block:0.625rem] [padding-inline:0.625rem]">
					<p className="m-0 text-[11px] font-medium text-sidebar-foreground">
						A broader cloud mirror is active
					</p>
					<p className="m-0 text-[10px] leading-relaxed text-muted-foreground">
						The legacy mirror includes every accessible Space. Keep using it, or
						stop it in Settings before making only “{displayName}” available.
					</p>
					<Button variant="outline" size="sm" onClick={onOpenSettings}>
						Review in Settings
					</Button>
				</div>
			) : state === "attention" && availability ? (
				<div
					className="flex flex-col gap-2 rounded-sm border border-amber-500/35 bg-amber-500/10 [padding-block:0.625rem] [padding-inline:0.625rem]"
					aria-live="polite"
				>
					<p className="m-0 text-[11px] font-medium text-sidebar-foreground">
						Local files need attention
					</p>
					<p className="m-0 text-[10px] text-muted-foreground">
						{availability.localRoot} ·{" "}
						{availability.pendingOperationCount || availability.recoveryCount}{" "}
						item(s) waiting for review
					</p>
					<Button variant="outline" size="sm" onClick={onOpenSettings}>
						Review in Settings
					</Button>
				</div>
			) : state === "recoverable" && availability ? (
				<div
					className="flex flex-col gap-2 rounded-sm border border-border bg-sidebar-accent/35 [padding-block:0.625rem] [padding-inline:0.625rem]"
					aria-live="polite"
				>
					<p className="m-0 text-[11px] font-medium text-sidebar-foreground">
						{availability.state === "offline"
							? "Local files are offline"
							: "Local files are not connected"}
					</p>
					<p
						className="m-0 truncate text-[10px] text-muted-foreground"
						title={availability.localRoot}
					>
						{availability.localRoot}
					</p>
					<Button
						size="sm"
						onClick={() => void retryConnection()}
						disabled={retrying || !authToken}
					>
						{retrying ? "Retrying…" : "Retry connection"}
					</Button>
				</div>
			) : dismissed ? (
				<div className="flex items-center justify-between gap-2 rounded-sm border border-border/70 [padding-block:0.375rem] [padding-inline:0.5rem]">
					<span className="text-[10px] text-muted-foreground">
						Local agents need a folder on this Mac.
					</span>
					<Button variant="ghost" size="sm" onClick={openSetup}>
						Set up
					</Button>
				</div>
			) : (
				<div className="flex flex-col gap-2 rounded-sm border border-border bg-sidebar-accent/35 [padding-block:0.625rem] [padding-inline:0.625rem]">
					<div className="flex items-start justify-between gap-2">
						<div>
							<p className="m-0 text-[11px] font-medium text-sidebar-foreground">
								Use this content with local agents
							</p>
							<p className="m-0 text-[10px] leading-relaxed text-muted-foreground [padding-block-start:0.2rem]">
								The cloud content you see is not available as files on this Mac
								yet.
							</p>
						</div>
						<button
							type="button"
							className="shrink-0 rounded-sm text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [padding-block:0.125rem] [padding-inline:0.25rem]"
							onClick={() => {
								localStorage.setItem(dismissedKey, "1");
								setDismissed(true);
							}}
							aria-label={`Dismiss local availability guide for ${displayName}`}
						>
							Dismiss
						</button>
					</div>
					<Button size="sm" onClick={openSetup}>
						Make available on this Mac
					</Button>
					<Button variant="ghost" size="sm" onClick={openRepoSetup}>
						Link to a code repository
					</Button>
				</div>
			)}

			<Modal
				open={dialogOpen}
				onOpenChange={(open) => {
					if (!open && !busy) setDialogOpen(false);
				}}
				initialFocus={
					journey === "standalone"
						? chooseButtonRef
						: () =>
								document.querySelector<HTMLButtonElement>(
									"[data-repo-availability-cancel]",
								)
				}
				title={
					phase === "complete"
						? "Ready for local agents"
						: journey === "repo"
							? "Link cloud content to a repository"
							: `Make “${displayName}” available`
				}
				description={
					journey === "repo"
						? "Connect one cloud folder to one Git repository without exposing unrelated repository files."
						: "Create one exact, synchronized Markdown folder on this Mac."
				}
			>
				{phase === "complete" && completion ? (
					<div className="flex flex-col gap-3" aria-live="polite">
						<div className="flex items-center gap-2 text-sm font-medium text-foreground">
							<MingcuteCheckCircleLine className="size-5 text-emerald-600 dark:text-emerald-400" />
							<span>“{completionName}” is available on this Mac.</span>
						</div>
						<PathBlock path={completion.localRoot} />
						{completion.association === "repo" &&
						completion.gitExclusion.status === "manual" ? (
							<output className="block rounded-sm border border-amber-500/35 bg-amber-500/10 [padding-block:0.5rem] [padding-inline:0.625rem]">
								<p className="m-0 text-[11px] font-medium text-foreground">
									Add this pattern to the repository’s .gitignore
								</p>
								<code className="break-all text-[10px] text-foreground">
									{completion.gitExclusion.pattern}
								</code>
								<p className="m-0 text-[10px] text-muted-foreground [padding-block-start:0.2rem]">
									Sync is connected, but Hubble could not update
									.git/info/exclude.
								</p>
							</output>
						) : null}
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								onClick={() => void copyPath(completion.localRoot)}
							>
								<MingcuteCopy2Line /> Copy path
							</Button>
							<Button
								variant="outline"
								onClick={() => void desktopApi.revealFile(completion.localRoot)}
							>
								<MingcuteFolderOpenLine />{" "}
								{revealFileLabel(desktopApi.platform)}
							</Button>
							<Button
								onClick={() => setInstructionsVisible((visible) => !visible)}
							>
								{instructionsVisible
									? "Hide agent instructions"
									: "Show agent instructions"}
							</Button>
						</div>
						{instructionsVisible ? (
							<div className="flex flex-col gap-2 rounded-sm border border-border bg-muted/50 [padding-block:0.625rem] [padding-inline:0.625rem]">
								<p className="m-0 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">
									{agentInstructions(completionName, completion.localRoot)}
								</p>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										void copyInstructions(completion, completionName)
									}
								>
									Copy instructions
								</Button>
							</div>
						) : null}
						<div className="flex justify-end">
							<Button onClick={() => setDialogOpen(false)}>Done</Button>
						</div>
					</div>
				) : journey === "repo" ? (
					<RepoAvailabilitySetup
						contextScope={scope}
						contextName={displayName}
						contextDetail={contextDetail}
						capability={capability}
						authToken={authToken}
						onComplete={(record) => {
							onAvailabilityChanged(record);
							setCompletion(record);
							setCompletionName(record.displayName);
							setPhase("complete");
						}}
						onCancel={() => setDialogOpen(false)}
					/>
				) : (
					<div className="flex flex-col gap-3">
						<div className="grid gap-2 rounded-sm border border-border bg-muted/35 [padding-block:0.625rem] [padding-inline:0.625rem]">
							<PreviewRow label="Cloud scope" value={displayName} />
							<PreviewRow label="Context" value={contextDetail} />
							<PreviewRow
								label="Local access"
								value={
									capability === "read-write" ? "Read and write" : "Read-only"
								}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="text-xs font-medium text-foreground">
								Destination
							</span>
							<PathBlock
								path={selectedPath ?? suggestedPath}
								muted={!selectedPath}
							/>
							<Button
								ref={chooseButtonRef}
								variant="outline"
								onClick={() => void chooseDestination()}
								disabled={busy}
							>
								<MingcuteFolderOpenLine />{" "}
								{selectedPath
									? "Choose another folder…"
									: "Choose this or another folder…"}
							</Button>
						</div>
						<p className="m-0 text-[11px] leading-relaxed text-muted-foreground">
							Only this {scope.kind === "workspace" ? "Space" : "shared folder"}{" "}
							becomes available. Stopping later does not delete or unshare cloud
							content.
						</p>
						<div aria-live="polite" aria-atomic="true">
							{busy ? (
								<p className="m-0 rounded-sm bg-muted text-[11px] text-foreground [padding-block:0.5rem] [padding-inline:0.625rem]">
									{setupProgressLabel(phase)}
								</p>
							) : null}
							{phase === "error" && error ? (
								<div
									className="rounded-sm border border-destructive/35 bg-destructive/10 [padding-block:0.5rem] [padding-inline:0.625rem]"
									role="alert"
								>
									<p className="m-0 text-[11px] font-medium text-foreground">
										Setup did not complete
									</p>
									<p className="m-0 break-words text-[10px] text-muted-foreground [padding-block-start:0.2rem]">
										{error}
									</p>
								</div>
							) : null}
						</div>
						<div className="flex flex-wrap justify-end gap-2">
							<Button
								variant="ghost"
								onClick={() => setDialogOpen(false)}
								disabled={busy}
							>
								Cancel
							</Button>
							{phase === "error" ? (
								<Button
									variant="outline"
									onClick={() => void chooseDestination()}
								>
									Change destination
								</Button>
							) : null}
							<Button
								onClick={() =>
									void (phase === "error" && availability
										? retrySetup()
										: createAvailability())
								}
								disabled={!selectedPath || !authToken || busy}
							>
								{phase === "error"
									? "Retry"
									: busy
										? "Connecting…"
										: "Make available"}
							</Button>
						</div>
					</div>
				)}
			</Modal>
		</>
	);
}

function PreviewRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 text-[11px]">
			<span className="text-muted-foreground">{label}</span>
			<span className="min-w-0 text-foreground">{value}</span>
		</div>
	);
}

function PathBlock({ path, muted = false }: { path: string; muted?: boolean }) {
	return (
		<p
			className={`m-0 break-all rounded-sm bg-muted font-mono text-[11px] [padding-block:0.5rem] [padding-inline:0.625rem] ${muted ? "text-muted-foreground" : "text-foreground"}`}
		>
			{path}
		</p>
	);
}
