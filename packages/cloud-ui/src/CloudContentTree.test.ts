import { describe, expect, it } from "vitest";
import { buildCloudContentTree } from "./CloudContentTree";

describe("buildCloudContentTree", () => {
	it("renders root folders and documents in one stable hierarchy", () => {
		expect(
			buildCloudContentTree(
				[
					{ id: "folder-b", name: "Zulu", parentId: null },
					{ id: "folder-a", name: "Alpha", parentId: null },
					{ id: "nested", name: "Nested", parentId: "folder-a" },
				],
				[
					{ id: "root-doc", title: "Root note", folderId: null },
					{ id: "nested-doc", title: "Brief", folderId: "nested" },
				],
				null,
			),
		).toEqual([
			{
				kind: "folder",
				id: "folder-a",
				name: "Alpha",
				children: [
					{
						kind: "folder",
						id: "nested",
						name: "Nested",
						children: [{ kind: "document", id: "nested-doc", name: "Brief" }],
					},
				],
			},
			{ kind: "folder", id: "folder-b", name: "Zulu", children: [] },
			{ kind: "document", id: "root-doc", name: "Root note" },
		]);
	});

	it("uses the shared folder as the invisible context root", () => {
		expect(
			buildCloudContentTree(
				[{ id: "child", name: "Child", parentId: "shared" }],
				[{ id: "doc", title: "Shared note", folderId: "shared" }],
				"shared",
			),
		).toEqual([
			{ kind: "folder", id: "child", name: "Child", children: [] },
			{ kind: "document", id: "doc", name: "Shared note" },
		]);
	});
});
