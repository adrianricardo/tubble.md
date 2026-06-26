import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { api } from "@hubble.md/sync-backend";
import { Button } from "@hubble.md/ui";
import {
	Authenticated,
	AuthLoading,
	Unauthenticated,
	useQuery,
} from "convex/react";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { desktopApi } from "../desktopApi";
import type {
	SyncedFolderEvent,
	SyncedFolderRootInspection,
	SyncedFolderStatus,
} from "../desktopApi/types";
import { SettingsSection } from "./SettingsDialog";

export function CloudSyncSection({ deploymentUrl }: { deploymentUrl: string }) {
	return (
		<SettingsSection
			title="Cloud sync"
			description="Sign in to the fork deployment before connecting a synced folder."
		>
			<AuthLoading>
				<p className="text-xs text-muted-foreground">Checking session…</p>
			</AuthLoading>
			<Unauthenticated>
				<CloudSignInForm />
			</Unauthenticated>
			<Authenticated>
				<SignedInCloudSync deploymentUrl={deploymentUrl} />
			</Authenticated>
		</SettingsSection>
	);
}

export function CloudSyncUnavailableSection() {
	return (
		<SettingsSection
			title="Cloud sync"
			description="Set VITE_CONVEX_URL to enable Convex Auth in the desktop renderer."
		>
			<p className="text-xs text-muted-foreground">
				Cloud sync is unavailable in this build.
			</p>
		</SettingsSection>
	);
}

function CloudSignInForm() {
	const { signIn } = useAuthActions();
	const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const submit = async (event: FormEvent<HTMLFormElement>) => {
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
		<form onSubmit={submit} className="grid max-w-sm gap-3">
			<div className="grid gap-1">
				<label htmlFor="desktop-auth-email" className="text-xs font-medium">
					Email
				</label>
				<input
					id="desktop-auth-email"
					name="email"
					type="email"
					required
					autoComplete="email"
					className="w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
				/>
			</div>
			{mode === "signUp" ? (
				<div className="grid gap-1">
					<label htmlFor="desktop-auth-name" className="text-xs font-medium">
						Name
					</label>
					<input
						id="desktop-auth-name"
						name="name"
						type="text"
						required
						autoComplete="name"
						className="w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
					/>
				</div>
			) : null}
			<div className="grid gap-1">
				<label htmlFor="desktop-auth-password" className="text-xs font-medium">
					Password
				</label>
				<input
					id="desktop-auth-password"
					name="password"
					type="password"
					required
					autoComplete={mode === "signIn" ? "current-password" : "new-password"}
					className="w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
				/>
			</div>
			{error ? <p className="text-xs text-destructive">{error}</p> : null}
			<div className="flex flex-wrap gap-2">
				<Button type="submit" size="sm" disabled={pending}>
					{pending ? "Working…" : mode === "signIn" ? "Sign in" : "Sign up"}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => {
						setError(null);
						setMode(mode === "signIn" ? "signUp" : "signIn");
					}}
				>
					{mode === "signIn" ? "Create account" : "Sign in instead"}
				</Button>
			</div>
		</form>
	);
}

function SignedInCloudSync({ deploymentUrl }: { deploymentUrl: string }) {
	const { signOut } = useAuthActions();
	const authToken = useAuthToken();
	const workspaces = useQuery(api.sync.listWorkspaces, {});
	const [status, setStatus] = useState<SyncedFolderStatus | null>(null);
	const [pendingAction, setPendingAction] = useState<
		"create" | "choose" | "import" | "disconnect" | "sign-out" | null
	>(null);
	const [blockedRoot, setBlockedRoot] = useState<string | null>(null);
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
	const [now, setNow] = useState(() => Date.now());
	const lastReconnectKey = useRef<string | null>(null);

	const refreshStatus = useCallback(async () => {
		const nextStatus = await desktopApi.getSyncedFolderStatus();
		setStatus(nextStatus);
		return nextStatus;
	}, []);

	useEffect(() => {
		let active = true;
		void desktopApi.getSyncedFolderStatus().then((nextStatus) => {
			if (active) setStatus(nextStatus);
		});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		const unsubscribe = desktopApi.onSyncedFolderEvent((event) => {
			showSyncedFolderToast(event);
			void refreshStatus().catch((error) => {
				toast.error("Failed to refresh synced-folder status", {
					description: error instanceof Error ? error.message : String(error),
				});
			});
		});
		return unsubscribe;
	}, [refreshStatus]);

	useEffect(() => {
		if (!status?.lastEventAt) return;
		const timer = window.setInterval(() => setNow(Date.now()), 15_000);
		return () => window.clearInterval(timer);
	}, [status?.lastEventAt]);

	useEffect(() => {
		if (workspaces === undefined || workspaces.length === 0) return;
		if (workspaces.some((workspace) => workspace._id === selectedWorkspaceId)) {
			return;
		}
		setSelectedWorkspaceId(workspaces[0]._id);
	}, [selectedWorkspaceId, workspaces]);

	useEffect(() => {
		if (!authToken || !status?.connected || !status.syncRoot) return;
		const reconnectKey = `${status.syncRoot}:${authToken}`;
		if (lastReconnectKey.current === reconnectKey) return;
		lastReconnectKey.current = reconnectKey;
		// IPC cannot carry Convex's token fetcher, so token refresh is renderer-driven:
		// reconnect the main-process backend whenever Convex Auth gives us a new JWT.
		void desktopApi
			.connectSyncedFolder({
				syncRoot: status.syncRoot,
				deploymentUrl,
				authToken,
			})
			.then(setStatus)
			.catch((error) => {
				lastReconnectKey.current = null;
				toast.error("Failed to refresh synced-folder auth", {
					description: error instanceof Error ? error.message : String(error),
				});
			});
	}, [authToken, deploymentUrl, status?.connected, status?.syncRoot]);

	const workspaceSummary = useMemo(() => {
		if (workspaces === undefined) return "Loading workspaces...";
		if (workspaces.length === 0) return "No cloud workspaces yet";
		if (workspaces.length === 1) return `Workspace: ${workspaces[0].name}`;
		return `Workspaces: ${workspaces.map((workspace) => workspace.name).join(", ")}`;
	}, [workspaces]);

	const connectInspectedRoot = async (
		syncRoot: string,
		inspection: SyncedFolderRootInspection,
	) => {
		if (!authToken) throw new Error("Sign-in token is not ready yet");
		if (inspection.state === "non-empty-foreign") {
			setBlockedRoot(syncRoot);
			toast.error("Choose how to use this folder first", {
				description:
					"This folder has files but is not a Hubble synced folder yet.",
			});
			return;
		}
		const nextStatus = await desktopApi.connectSyncedFolder({
			syncRoot,
			deploymentUrl,
			authToken,
		});
		lastReconnectKey.current = `${syncRoot}:${authToken}`;
		setBlockedRoot(null);
		setStatus(nextStatus);
		toast.success("Synced folder connected");
	};

	const connectToRoot = async (
		pickRoot: () => Promise<string | null>,
		action: "create" | "choose",
	) => {
		if (!authToken) {
			toast.error("Sign-in token is not ready yet");
			return;
		}
		setPendingAction(action);
		try {
			const syncRoot = await pickRoot();
			if (!syncRoot) return;
			const inspection = await desktopApi.inspectSyncedFolderRoot(syncRoot);
			await connectInspectedRoot(syncRoot, inspection);
		} catch (error) {
			toast.error("Failed to connect synced folder", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setPendingAction(null);
		}
	};

	const importBlockedRoot = async () => {
		if (!blockedRoot) return;
		if (!authToken) {
			toast.error("Sign-in token is not ready yet");
			return;
		}
		if (!selectedWorkspaceId) {
			toast.error("Choose a target workspace first");
			return;
		}
		setPendingAction("import");
		try {
			const result = await desktopApi.importSyncedFolderMarkdown({
				syncRoot: blockedRoot,
				deploymentUrl,
				authToken,
				workspaceId: selectedWorkspaceId,
			});
			await connectInspectedRoot(blockedRoot, { state: "existing-hubble" });
			toast.success("Markdown imported", {
				description: `${result.imported.length} file${result.imported.length === 1 ? "" : "s"} imported before enabling the mirror.`,
			});
		} catch (error) {
			toast.error("Failed to import folder", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setPendingAction(null);
		}
	};

	const disconnect = async () => {
		setPendingAction("disconnect");
		try {
			const nextStatus = await desktopApi.disconnectSyncedFolder();
			lastReconnectKey.current = null;
			setStatus(nextStatus);
		} catch (error) {
			toast.error("Failed to disconnect synced folder", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setPendingAction(null);
		}
	};

	const signOutAndDisconnect = async () => {
		setPendingAction("sign-out");
		try {
			if (status?.connected) {
				const nextStatus = await desktopApi.disconnectSyncedFolder();
				setStatus(nextStatus);
				lastReconnectKey.current = null;
				setBlockedRoot(null);
			}
			await signOut();
		} catch (error) {
			toast.error("Failed to sign out", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setPendingAction(null);
		}
	};

	const isBusy = pendingAction !== null;
	const statusView = getSyncedFolderStatusView(status);

	return (
		<div className="grid gap-4 text-xs">
			<div className="grid gap-2 rounded-md border border-border [padding-block:0.75rem] [padding-inline:0.75rem]">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="grid min-w-0 gap-1">
						<div className="flex flex-wrap items-center gap-2">
							<span className={statusView.dotClassName} aria-hidden="true" />
							<p className="text-sm font-medium text-foreground">
								{statusView.label}
							</p>
						</div>
						<p className="break-all text-muted-foreground">
							{status?.connected && status.syncRoot
								? status.syncRoot
								: "No folder connected"}
						</p>
					</div>
					{status?.connected ? (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => void disconnect()}
							disabled={isBusy}
						>
							{pendingAction === "disconnect"
								? "Disconnecting..."
								: "Disconnect"}
						</Button>
					) : null}
				</div>
				<div className="grid gap-1 text-muted-foreground">
					<p>{workspaceSummary}</p>
					<p>Deployment: {deploymentUrl}</p>
					<p>Documents mirrored: {status?.documentCount ?? 0}</p>
					<p>
						Last activity:{" "}
						{status?.lastEventAt
							? formatRelativeTime(status.lastEventAt, now)
							: "None yet"}
					</p>
				</div>
				{status?.lastError ? (
					<p className="text-xs text-destructive">{status.lastError}</p>
				) : null}
			</div>

			<div className="grid gap-2">
				<p className="text-muted-foreground">
					Connect an empty folder, or reconnect a folder that already has
					Hubble's sync index.
				</p>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						size="sm"
						onClick={() =>
							void connectToRoot(desktopApi.createFolderPicker, "create")
						}
						disabled={isBusy || !authToken}
					>
						{pendingAction === "create" ? "Opening..." : "Create folder"}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() =>
							void connectToRoot(desktopApi.openFolderPicker, "choose")
						}
						disabled={isBusy || !authToken}
					>
						{pendingAction === "choose" ? "Opening..." : "Choose existing"}
					</Button>
				</div>
			</div>

			{blockedRoot ? (
				<div className="grid gap-3 rounded-md border border-destructive/35 bg-destructive/5 [padding-block:0.75rem] [padding-inline:0.75rem]">
					<div className="grid gap-1">
						<p className="text-sm font-medium text-foreground">
							Folder is not empty
						</p>
						<p className="break-all text-muted-foreground">{blockedRoot}</p>
						<p className="text-muted-foreground">
							Choose or create an empty subfolder, or import this folder's
							markdown into a workspace before enabling the mirror.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							size="sm"
							onClick={() =>
								void connectToRoot(desktopApi.createFolderPicker, "create")
							}
							disabled={isBusy || !authToken}
						>
							{pendingAction === "create" ? "Opening..." : "Create subfolder"}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() =>
								void connectToRoot(desktopApi.openFolderPicker, "choose")
							}
							disabled={isBusy || !authToken}
						>
							{pendingAction === "choose" ? "Opening..." : "Choose subfolder"}
						</Button>
					</div>
					<div className="grid max-w-sm gap-2">
						<label
							htmlFor="desktop-sync-import-workspace"
							className="text-xs font-medium"
						>
							Import target workspace
						</label>
						<select
							id="desktop-sync-import-workspace"
							value={selectedWorkspaceId}
							onChange={(event) => setSelectedWorkspaceId(event.target.value)}
							disabled={isBusy || workspaces === undefined}
							className="w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
						>
							{workspaces === undefined ? (
								<option value="">Loading workspaces...</option>
							) : workspaces.length === 0 ? (
								<option value="">No workspaces available</option>
							) : (
								workspaces.map((workspace) => (
									<option key={workspace._id} value={workspace._id}>
										{workspace.name}
									</option>
								))
							)}
						</select>
						<Button
							type="button"
							size="sm"
							onClick={() => void importBlockedRoot()}
							disabled={isBusy || !authToken || !selectedWorkspaceId}
						>
							{pendingAction === "import"
								? "Importing..."
								: "Import and connect"}
						</Button>
					</div>
				</div>
			) : null}

			<div className="flex flex-wrap justify-between gap-2">
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => void signOutAndDisconnect()}
					disabled={isBusy}
				>
					{pendingAction === "sign-out" ? "Signing out..." : "Sign out"}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => void refreshStatus()}
					disabled={isBusy}
				>
					Refresh status
				</Button>
			</div>
		</div>
	);
}

function getSyncedFolderStatusView(status: SyncedFolderStatus | null): {
	label: string;
	dotClassName: string;
} {
	const dotBase = "size-2 rounded-full";
	if (!status?.connected) {
		return {
			label: "Not connected",
			dotClassName: `${dotBase} bg-muted-foreground/40`,
		};
	}
	switch (status.state) {
		case "connected":
			return {
				label: "Connected",
				dotClassName: `${dotBase} bg-emerald-500`,
			};
		case "syncing":
			return {
				label: "Syncing",
				dotClassName: `${dotBase} bg-sky-500`,
			};
		case "error":
			return {
				label: "Needs attention",
				dotClassName: `${dotBase} bg-destructive`,
			};
		case "idle":
			return {
				label: "Idle",
				dotClassName: `${dotBase} bg-muted-foreground/40`,
			};
	}
}

function showSyncedFolderToast(event: SyncedFolderEvent) {
	switch (event.kind) {
		case "reconciled":
			toast.success("Synced folder edit uploaded");
			return;
		case "renamed":
			toast.success("Synced folder rename uploaded");
			return;
		case "moved":
			toast.success("Synced folder move uploaded");
			return;
		case "created":
			toast.success("Synced folder document created");
			return;
		case "removed-local":
			toast("Synced folder document removed");
			return;
		case "removed-access":
			toast("Access changed for a synced document", {
				description: "The local copy was moved to the synced-folder trash.",
			});
			return;
		case "read-only-rejected":
			toast.error("Read-only document was not changed", {
				description: "Your local edit was saved beside the document.",
			});
			return;
		case "backstop":
			toast.error("Synced folder edit needs review", {
				description:
					event.reason === "missing-base"
						? "The local edit was preserved because the base cache was missing."
						: "The local edit was preserved because the document is read-only.",
			});
			return;
		case "error":
			toast.error("Synced folder error");
			return;
	}
}

function formatRelativeTime(timestamp: number, now: number) {
	const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
	if (elapsedSeconds < 10) return "just now";
	if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
	const elapsedMinutes = Math.floor(elapsedSeconds / 60);
	if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
	const elapsedHours = Math.floor(elapsedMinutes / 60);
	if (elapsedHours < 24) return `${elapsedHours}h ago`;
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(timestamp);
}
