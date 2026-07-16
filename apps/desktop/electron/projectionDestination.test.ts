import { describe, expect, it } from "vitest";
import { assertLocalProjectionDestinationAvailable } from "./projectionMounts";

const workspaceScope = {
	kind: "workspace",
	workspaceId: "workspace-1",
} as const;

describe("local projection destination availability", () => {
	it("accepts an empty root and a matching indexed projection", () => {
		expect(
			assertLocalProjectionDestinationAvailable("empty", null, workspaceScope),
		).toBe("new");
		expect(
			assertLocalProjectionDestinationAvailable(
				"existing-hubble",
				{ kind: "workspace", workspaceId: "workspace-1" },
				workspaceScope,
			),
		).toBe("reconnect");
	});

	it("rejects foreign content and a mismatched Hubble projection", () => {
		expect(() =>
			assertLocalProjectionDestinationAvailable(
				"non-empty-foreign",
				null,
				workspaceScope,
			),
		).toThrow("already contains files");
		expect(() =>
			assertLocalProjectionDestinationAvailable(
				"existing-hubble",
				{ kind: "folder", folderId: "folder-1" },
				workspaceScope,
			),
		).toThrow("different Hubble projection");
	});
});
