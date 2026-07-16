import { describe, expect, it } from "vitest";
import { projectionScopeKey } from "./projectionScope.js";

describe("projectionScopeKey", () => {
	it("uses stable keys for every projection scope", () => {
		expect(projectionScopeKey({ kind: "all-accessible" })).toBe(
			"all-accessible",
		);
		expect(projectionScopeKey({ kind: "workspace", workspaceId: "ws_1" })).toBe(
			"workspace:ws_1",
		);
		expect(
			projectionScopeKey({
				kind: "folder",
				workspaceId: "ws_1",
				folderId: "folder_1",
			}),
		).toBe("folder:folder_1");
	});
});
