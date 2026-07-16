import { describe, expect, it } from "vitest";
import type { LocalAvailabilityRecord } from "../desktopApi/types";
import {
	agentInstructions,
	availabilityJourneyState,
	availabilitySuggestedPath,
	directScopeKey,
	findDirectAvailability,
	healthyAvailabilityPath,
	repoAvailabilitySuggestedPath,
	setupProgressLabel,
} from "./localAgentAvailabilityModel";

function availability(
	overrides: Partial<LocalAvailabilityRecord> = {},
): LocalAvailabilityRecord {
	return {
		scopeKey: "workspace:space-1",
		scope: { kind: "workspace", workspaceId: "space-1" },
		displayName: "Product Space",
		localRoot: "/Users/me/Hubble/Product Space",
		association: "standalone",
		incompatible: false,
		repoRoot: null,
		repoName: null,
		repoRemoteUrl: null,
		gitExclusion: { status: "not-applicable" },
		state: "connected",
		lastSyncAt: 1,
		pendingOperationCount: 0,
		recoveryCount: 0,
		createdAt: 1,
		updatedAt: 1,
		lastConnectedAt: 1,
		...overrides,
	};
}

describe("local agent availability onboarding", () => {
	it("joins only the exact selected Workspace or shared-folder scope", () => {
		const records = [
			availability(),
			availability({
				scopeKey: "folder:shared-1",
				scope: {
					kind: "folder",
					workspaceId: "space-1",
					folderId: "shared-1",
				},
			}),
		];

		expect(
			findDirectAvailability(records, {
				kind: "workspace",
				workspaceId: "space-1",
			}),
		).toBe(records[0]);
		expect(
			findDirectAvailability(records, {
				kind: "folder",
				workspaceId: "space-1",
				folderId: "shared-1",
			}),
		).toBe(records[1]);
		expect(
			findDirectAvailability(records, {
				kind: "folder",
				workspaceId: "space-1",
				folderId: "descendant",
			}),
		).toBeNull();
	});

	it("selects discovery, legacy overlap, healthy, recovery, and review states", () => {
		const legacy = availability({
			scopeKey: "all-accessible",
			scope: { kind: "all-accessible" },
			association: "legacy",
			incompatible: true,
		});

		expect(availabilityJourneyState(null, null)).toBe("unavailable");
		expect(availabilityJourneyState(null, legacy)).toBe("legacy-overlap");
		expect(availabilityJourneyState(availability(), legacy)).toBe("ready");
		expect(
			availabilityJourneyState(availability({ state: "offline" }), null),
		).toBe("recoverable");
		expect(
			availabilityJourneyState(
				availability({ state: "pending-review", pendingOperationCount: 2 }),
				null,
			),
		).toBe("attention");
	});

	it("builds stable keys and a recognizable sanitized destination", () => {
		expect(directScopeKey({ kind: "workspace", workspaceId: "space-1" })).toBe(
			"workspace:space-1",
		);
		expect(
			directScopeKey({
				kind: "folder",
				workspaceId: "space-1",
				folderId: "folder-1",
			}),
		).toBe("folder:folder-1");
		expect(
			availabilitySuggestedPath("/Users/me/", " Product: Launch / 2026 "),
		).toBe("/Users/me/Hubble/Product Launch 2026");
		expect(
			repoAvailabilitySuggestedPath(
				"/Users/me/code/project/",
				"Product: Brain",
			),
		).toBe("/Users/me/code/project/Product Brain");
	});

	it("promotes skills only for a healthy exact-scope path", () => {
		expect(healthyAvailabilityPath(availability())).toEqual({
			scopeKey: "workspace:space-1",
			path: "/Users/me/Hubble/Product Space",
		});
		expect(
			healthyAvailabilityPath(availability({ state: "syncing" })),
		).not.toBeNull();
		expect(
			healthyAvailabilityPath(availability({ state: "offline" })),
		).toBeNull();
		expect(healthyAvailabilityPath(null)).toBeNull();
	});

	it("names progress and agent handoff details in text", () => {
		expect(setupProgressLabel("verifying")).toContain("permissions");
		expect(setupProgressLabel("materializing")).toContain("watcher");
		expect(agentInstructions("Product Space", "/Hubble/Product")).toBe(
			"Use the synchronized Hubble Markdown for “Product Space” at:\n/Hubble/Product\n\nRead and edit Markdown files inside that folder. Hubble keeps permitted changes synchronized with the cloud.",
		);
	});
});
