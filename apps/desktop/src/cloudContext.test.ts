import { describe, expect, it } from "vitest";
import { resolveCloudContext } from "./cloudContext";

const workspaces = [
	{ _id: "team", personal: false },
	{ _id: "personal", personal: true },
] as const;
const sharedFolders = [
	{ folderId: "shared", workspaceId: "external" },
] as const;

describe("resolveCloudContext", () => {
	it("keeps a valid persisted workspace context", () => {
		expect(
			resolveCloudContext(
				{ kind: "workspace", workspaceId: "team" },
				workspaces,
				sharedFolders,
			),
		).toEqual({ kind: "workspace", workspaceId: "team" });
	});

	it("falls back to the personal workspace when persisted state is stale", () => {
		expect(
			resolveCloudContext(
				{ kind: "workspace", workspaceId: "missing" },
				workspaces,
				sharedFolders,
			),
		).toEqual({ kind: "workspace", workspaceId: "personal" });
	});

	it("defaults guest-only accounts to their first shared root", () => {
		expect(resolveCloudContext(null, [], sharedFolders)).toEqual({
			kind: "shared-folder",
			folderId: "shared",
			workspaceId: "external",
		});
	});
});
