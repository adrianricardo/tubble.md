import { describe, expect, it } from "vitest";
import type { AuthorityTransferOperation } from "../desktopApi/types";
import {
	canConfirmCloudToGit,
	canConfirmGitToCloud,
	displayFolderName,
	parseShareRecipients,
	previewChanged,
	safeGitFolderName,
	selectAuthorityRecoveryOperation,
} from "./authorityMovePreviewModel";

describe("authority move preview helpers", () => {
	it("normalizes a cloud folder name without inventing a path hierarchy", () => {
		expect(safeGitFolderName("  Product notes / Q3  ")).toBe(
			"Product-notes-Q3",
		);
		expect(safeGitFolderName("💫")).toBe("hubble-folder");
	});

	it("derives a label from canonical and trailing-slash folder ids", () => {
		expect(displayFolderName("notes/research")).toBe("research");
		expect(displayFolderName("notes/research/")).toBe("research");
	});

	it("only reports staleness after an established fingerprint changes", () => {
		expect(previewChanged(null, "next")).toBe(false);
		expect(previewChanged("same", "same")).toBe(false);
		expect(previewChanged("before", "after")).toBe(true);
	});

	it("exposes confirmation only after every verified-cutover prerequisite", () => {
		const ready = {
			online: true,
			journaled: true,
			hasInspection: true,
			confirmationBlocked: false,
			hasWorkspace: true,
			membersLoaded: true,
			authReady: true,
			stale: false,
			busy: false,
			shareIntentReady: true,
		};
		expect(canConfirmGitToCloud(ready)).toBe(true);
		for (const key of [
			"online",
			"journaled",
			"hasInspection",
			"hasWorkspace",
			"membersLoaded",
			"authReady",
		] as const) {
			expect(canConfirmGitToCloud({ ...ready, [key]: false })).toBe(false);
		}
		expect(canConfirmGitToCloud({ ...ready, confirmationBlocked: true })).toBe(
			false,
		);
		expect(canConfirmGitToCloud({ ...ready, stale: true })).toBe(false);
		expect(canConfirmGitToCloud({ ...ready, busy: true })).toBe(false);
	});

	it("normalizes and validates carried Share recipients", () => {
		expect(
			parseShareRecipients(
				" Ada@Example.com, invalid, ada@example.com\nlin@example.com ",
				"editor",
			),
		).toEqual({
			shares: [
				{ email: "ada@example.com", role: "editor" },
				{ email: "lin@example.com", role: "editor" },
			],
			invalid: ["invalid"],
		});
	});

	it("prioritizes interrupted operations and retains completed move recovery", () => {
		const operation = (
			id: string,
			phase: AuthorityTransferOperation["phase"],
			intent: AuthorityTransferOperation["intent"],
			updatedAt: number,
		) =>
			({
				id,
				phase,
				intent,
				updatedAt,
			}) as AuthorityTransferOperation;
		const completed = operation("completed", "completed", "move", 30);
		const interrupted = operation("interrupted", "needs-attention", "move", 20);
		expect(
			selectAuthorityRecoveryOperation([
				completed,
				interrupted,
				operation("draft", "draft", "move", 40),
			]),
		).toBe(interrupted);
		expect(
			selectAuthorityRecoveryOperation([
				operation("copy", "completed", "export-copy", 40),
				completed,
			]),
		).toBe(completed);
	});

	it("requires current cloud and Git previews before moving to Git", () => {
		const ready = {
			online: true,
			journaled: true,
			hasCloudPreview: true,
			hasDestination: true,
			destinationOccupied: false,
			authReady: true,
			stale: false,
			busy: false,
		};
		expect(canConfirmCloudToGit(ready)).toBe(true);
		for (const key of [
			"online",
			"journaled",
			"hasCloudPreview",
			"hasDestination",
			"authReady",
		] as const) {
			expect(canConfirmCloudToGit({ ...ready, [key]: false })).toBe(false);
		}
		expect(canConfirmCloudToGit({ ...ready, destinationOccupied: true })).toBe(
			false,
		);
		expect(canConfirmCloudToGit({ ...ready, stale: true })).toBe(false);
		expect(canConfirmCloudToGit({ ...ready, busy: true })).toBe(false);
	});
});
