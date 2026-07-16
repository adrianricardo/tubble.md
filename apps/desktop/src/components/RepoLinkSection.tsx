import { useAuthToken } from "@convex-dev/auth/react";
import { Button } from "@hubble.md/ui";
import { Authenticated } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { desktopApi } from "../desktopApi";
import type { LocalAvailabilityRecord } from "../desktopApi/types";
import { revealFileLabel } from "../lib/revealFile";
import { SettingsSection } from "./SettingsDialog";

export function RepoLinkSection({ deploymentUrl }: { deploymentUrl: string }) {
	return (
		<SettingsSection
			title="Repository availability"
			description="Repository links are created from the cloud folder you are viewing. Manage existing links here. Hubble watches only each connected Markdown folder and never runs Git."
		>
			<Authenticated>
				<RepoLinkManager deploymentUrl={deploymentUrl} />
			</Authenticated>
		</SettingsSection>
	);
}

function formatRelativeTime(timestamp: number, now: number) {
	const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

function RepoLinkManager({ deploymentUrl }: { deploymentUrl: string }) {
	const authToken = useAuthToken();
	const [records, setRecords] = useState<LocalAvailabilityRecord[]>([]);
	const [pendingScopeKey, setPendingScopeKey] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const refresh = useCallback(async () => {
		setRecords(
			(await desktopApi.listLocalAvailability()).filter(
				(record) => record.association === "repo",
			),
		);
	}, []);

	useEffect(() => {
		void refresh();
		const unsubscribeLink = desktopApi.onRepoLinkLinked(() => void refresh());
		const unsubscribeSync = desktopApi.onSyncedFolderEvent(
			() => void refresh(),
		);
		const timer = window.setInterval(() => setNow(Date.now()), 15_000);
		return () => {
			unsubscribeLink();
			unsubscribeSync();
			window.clearInterval(timer);
		};
	}, [refresh]);

	const stop = async (record: LocalAvailabilityRecord) => {
		if (!authToken || pendingScopeKey) return;
		setPendingScopeKey(record.scopeKey);
		try {
			const result = await desktopApi.stopLocalAvailability({
				scopeKey: record.scopeKey,
				keepFiles: true,
				deploymentUrl,
				authToken,
			});
			if (result.status === "blocked") {
				toast.error("Could not stop repository availability", {
					description: result.cleanliness.message,
				});
				return;
			}
			await refresh();
			toast("Repository availability stopped", {
				description: `The files at ${record.localRoot} were left on disk.`,
			});
		} catch (caught) {
			toast.error("Could not stop repository availability", {
				description: caught instanceof Error ? caught.message : String(caught),
			});
		} finally {
			setPendingScopeKey(null);
		}
	};
	const copyPath = async (path: string) => {
		try {
			await navigator.clipboard.writeText(path);
			toast.success("Local path copied");
		} catch {
			toast.error("Could not copy the local path");
		}
	};

	if (records.length === 0) {
		return (
			<p className="m-0 text-xs text-muted-foreground">
				No repository folders are available on this Mac. Open a cloud context
				and choose “Link to a code repository” to create one.
			</p>
		);
	}

	return (
		<ul className="grid gap-2 text-xs">
			{records.map((record) => (
				<li
					key={record.scopeKey}
					className="grid gap-2 rounded-md border border-border [padding-block:0.625rem] [padding-inline:0.625rem]"
				>
					<div className="min-w-0">
						<p className="m-0 font-medium text-foreground">
							{record.displayName}
							{record.repoName ? ` → ${record.repoName}` : ""}
						</p>
						<p className="m-0 break-all text-muted-foreground">
							{record.localRoot}
						</p>
						<p className="m-0 text-muted-foreground">
							{record.state === "disconnected" ? "Not connected" : record.state}
							{" · Last sync: "}
							{record.lastSyncAt
								? formatRelativeTime(record.lastSyncAt, now)
								: "Not yet"}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => void desktopApi.revealFile(record.localRoot)}
						>
							{revealFileLabel(desktopApi.platform)}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => void copyPath(record.localRoot)}
						>
							Copy path
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => void stop(record)}
							disabled={!authToken || pendingScopeKey !== null}
						>
							{pendingScopeKey === record.scopeKey
								? "Stopping…"
								: "Stop and keep files"}
						</Button>
					</div>
				</li>
			))}
		</ul>
	);
}
