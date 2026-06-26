import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { api } from "@hubble.md/sync-backend";
import { Button } from "@hubble.md/ui";
import {
	Authenticated,
	AuthLoading,
	Unauthenticated,
	useQuery,
} from "convex/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { desktopApi } from "../desktopApi";
import type { SyncedFolderStatus } from "../desktopApi/types";
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
	const [pending, setPending] = useState(false);
	const lastReconnectKey = useRef<string | null>(null);

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

	const connect = async () => {
		if (!authToken) {
			toast.error("Sign-in token is not ready yet");
			return;
		}
		setPending(true);
		try {
			const syncRoot = await desktopApi.createFolderPicker();
			if (!syncRoot) return;
			const nextStatus = await desktopApi.connectSyncedFolder({
				syncRoot,
				deploymentUrl,
				authToken,
			});
			lastReconnectKey.current = `${syncRoot}:${authToken}`;
			setStatus(nextStatus);
			toast.success("Synced folder connected");
		} catch (error) {
			toast.error("Failed to connect synced folder", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setPending(false);
		}
	};

	const disconnect = async () => {
		setPending(true);
		try {
			const nextStatus = await desktopApi.disconnectSyncedFolder();
			lastReconnectKey.current = null;
			setStatus(nextStatus);
		} catch (error) {
			toast.error("Failed to disconnect synced folder", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setPending(false);
		}
	};

	const signOutAndDisconnect = async () => {
		setPending(true);
		try {
			if (status?.connected) {
				const nextStatus = await desktopApi.disconnectSyncedFolder();
				setStatus(nextStatus);
				lastReconnectKey.current = null;
			}
			await signOut();
		} catch (error) {
			toast.error("Failed to sign out", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="grid gap-3 text-xs">
			<div className="grid gap-1 text-muted-foreground">
				<p>Signed in to {deploymentUrl}</p>
				<p>
					Workspaces:{" "}
					{workspaces === undefined ? "Loading…" : String(workspaces.length)}
				</p>
				<p>
					Synced folder:{" "}
					{status?.connected && status.syncRoot
						? status.syncRoot
						: "Not connected"}
				</p>
				{!status?.connected ? (
					<p>
						Use an empty folder until the first-run existing-folder guard lands.
					</p>
				) : null}
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					onClick={() => void connect()}
					disabled={pending || !authToken}
				>
					{status?.connected ? "Change folder" : "Choose sync folder"}
				</Button>
				{status?.connected ? (
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => void disconnect()}
						disabled={pending}
					>
						Disconnect
					</Button>
				) : null}
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => void signOutAndDisconnect()}
					disabled={pending}
				>
					Sign out
				</Button>
			</div>
			{status?.lastError ? (
				<p className="text-xs text-destructive">{status.lastError}</p>
			) : null}
		</div>
	);
}
