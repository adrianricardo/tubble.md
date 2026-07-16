import type { AuthorityTransferOperation } from "../desktopApi/types";

export function safeGitFolderName(name: string): string {
	const normalized = name
		.normalize("NFKD")
		.replace(/[^a-zA-Z0-9._ -]/g, "")
		.trim()
		.replace(/\s+/g, "-");
	return normalized || "hubble-folder";
}

export function displayFolderName(folderId: string): string {
	const normalized = folderId.replace(/\/+$/, "");
	return normalized.split("/").pop() || normalized || folderId;
}

export function previewChanged(
	previousFingerprint: string | null,
	nextFingerprint: string,
): boolean {
	return (
		previousFingerprint !== null && previousFingerprint !== nextFingerprint
	);
}

export function parseShareRecipients(
	value: string,
	role: "editor" | "commenter" | "viewer",
) {
	const candidates = value
		.split(/[\n,]/)
		.map((email) => email.trim().toLocaleLowerCase())
		.filter(Boolean);
	const invalid = candidates.filter(
		(email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
	);
	return {
		shares: [
			...new Map(
				candidates
					.filter((email) => !invalid.includes(email))
					.map((email) => [email, { email, role }] as const),
			).values(),
		],
		invalid,
	};
}

export function canConfirmGitToCloud(input: {
	online: boolean;
	journaled: boolean;
	hasInspection: boolean;
	confirmationBlocked: boolean;
	hasWorkspace: boolean;
	membersLoaded: boolean;
	authReady: boolean;
	stale: boolean;
	busy: boolean;
	shareIntentReady: boolean;
}): boolean {
	return (
		input.online &&
		input.journaled &&
		input.hasInspection &&
		!input.confirmationBlocked &&
		input.hasWorkspace &&
		input.membersLoaded &&
		input.authReady &&
		!input.stale &&
		!input.busy &&
		input.shareIntentReady
	);
}

export function canConfirmCloudToGit(input: {
	online: boolean;
	journaled: boolean;
	hasCloudPreview: boolean;
	hasDestination: boolean;
	destinationOccupied: boolean;
	authReady: boolean;
	stale: boolean;
	busy: boolean;
}): boolean {
	return (
		input.online &&
		input.journaled &&
		input.hasCloudPreview &&
		input.hasDestination &&
		!input.destinationOccupied &&
		input.authReady &&
		!input.stale &&
		!input.busy
	);
}

export function selectAuthorityRecoveryOperation(
	operations: AuthorityTransferOperation[],
) {
	const recent = [...operations].sort(
		(left, right) => right.updatedAt - left.updatedAt,
	);
	return (
		recent.find(
			(operation) =>
				operation.phase !== "draft" &&
				operation.phase !== "completed" &&
				operation.phase !== "cancelled",
		) ??
		recent.find(
			(operation) =>
				operation.phase === "completed" && operation.intent !== "export-copy",
		) ??
		null
	);
}
