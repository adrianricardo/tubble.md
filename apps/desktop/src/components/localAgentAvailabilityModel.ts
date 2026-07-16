import type {
	DirectProjectionScope,
	LocalAvailabilityRecord,
} from "../desktopApi/types";

export type AvailabilityJourneyState =
	| "unavailable"
	| "legacy-overlap"
	| "ready"
	| "recoverable"
	| "attention";

export function directScopeKey(scope: DirectProjectionScope): string {
	return scope.kind === "workspace"
		? `workspace:${scope.workspaceId}`
		: `folder:${scope.folderId}`;
}

export function findDirectAvailability(
	records: readonly LocalAvailabilityRecord[],
	scope: DirectProjectionScope,
): LocalAvailabilityRecord | null {
	const scopeKey = directScopeKey(scope);
	return records.find((record) => record.scopeKey === scopeKey) ?? null;
}

export function healthyAvailabilityPath(
	availability: LocalAvailabilityRecord | null,
): { scopeKey: string; path: string } | null {
	if (
		availability?.state !== "connected" &&
		availability?.state !== "syncing"
	) {
		return null;
	}
	return { scopeKey: availability.scopeKey, path: availability.localRoot };
}

export function availabilityJourneyState(
	availability: LocalAvailabilityRecord | null,
	legacyMirror: LocalAvailabilityRecord | null,
): AvailabilityJourneyState {
	if (!availability) return legacyMirror ? "legacy-overlap" : "unavailable";
	if (availability.state === "connected" || availability.state === "syncing") {
		return "ready";
	}
	if (
		availability.state === "pending-review" ||
		availability.pendingOperationCount > 0 ||
		availability.recoveryCount > 0
	) {
		return "attention";
	}
	return "recoverable";
}

export function availabilitySuggestedPath(
	homeDir: string,
	displayName: string,
): string {
	const segment = sanitizeAvailabilitySegment(displayName);
	return `${homeDir.replace(/[/\\]+$/g, "")}/Hubble/${segment}`;
}

export function sanitizeAvailabilitySegment(displayName: string): string {
	return (
		displayName
			.replace(/[/\\:*?"<>|]/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.replace(/^[. ]+|[. ]+$/g, "") || "Hubble Space"
	);
}

export function repoAvailabilitySuggestedPath(
	repoRoot: string,
	folderName: string,
): string {
	return `${repoRoot.replace(/[/\\]+$/g, "")}/${sanitizeAvailabilitySegment(folderName)}`;
}

export function agentInstructions(
	displayName: string,
	localRoot: string,
): string {
	return `Use the synchronized Hubble Markdown for “${displayName}” at:\n${localRoot}\n\nRead and edit Markdown files inside that folder. Hubble keeps permitted changes synchronized with the cloud.`;
}

export function setupProgressLabel(
	phase: "verifying" | "materializing",
): string {
	return phase === "verifying"
		? "Verifying scope, permissions, and destination…"
		: "Materializing Markdown and connecting the watcher…";
}
