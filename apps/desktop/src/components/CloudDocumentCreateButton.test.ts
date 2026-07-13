import { describe, expect, it } from "vitest";
import { buildCloudCreateDestinations } from "./CloudDocumentCreateButton";

describe("buildCloudCreateDestinations", () => {
	it("labels Workspace root access and nested folder paths", () => {
		expect(
			buildCloudCreateDestinations([
				{ id: "nested", name: "Launch", parentId: "root" },
				{ id: "root", name: "Projects", parentId: null },
			]),
		).toEqual([
			{
				folderId: null,
				label: "Workspace root",
				detail: "Available to Workspace members",
			},
			{
				folderId: "root",
				label: "Projects",
				detail: "Inherits this folder’s access",
			},
			{
				folderId: "nested",
				label: "Projects / Launch",
				detail: "Inherits this folder’s access",
			},
		]);
	});
});
