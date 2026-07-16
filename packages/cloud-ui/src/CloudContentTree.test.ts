import { describe, expect, it } from "vitest";
import {
	buildCloudContentTree,
	cloudContextRootFolderId,
	cloudFolderAncestorIds,
	cloudMoveDestinations,
	cloudNodeAncestorIds,
	cloudTreeActions,
	cloudTreeCreateActions,
	cloudTreeItemAccessibleLabel,
	nextCloudTreeFocusId,
	searchCloudContent,
} from "./CloudContentTree";

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
				parentId: null,
				children: [
					{
						kind: "folder",
						id: "nested",
						name: "Nested",
						parentId: "folder-a",
						children: [
							{
								kind: "document",
								id: "nested-doc",
								name: "Brief",
								folderId: "nested",
								path: null,
							},
						],
					},
				],
			},
			{
				kind: "folder",
				id: "folder-b",
				name: "Zulu",
				parentId: null,
				children: [],
			},
			{
				kind: "document",
				id: "root-doc",
				name: "Root note",
				folderId: null,
				path: null,
			},
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
			{
				kind: "folder",
				id: "child",
				name: "Child",
				parentId: "shared",
				children: [],
			},
			{
				kind: "document",
				id: "doc",
				name: "Shared note",
				folderId: "shared",
				path: null,
			},
		]);
	});

	it("searches documents only within the current tree", () => {
		const tree = buildCloudContentTree(
			[{ id: "folder", name: "Research", parentId: null }],
			[
				{ id: "match", title: "Launch brief", folderId: "folder" },
				{ id: "other", title: "Meeting notes", folderId: null },
			],
			null,
		);
		expect(searchCloudContent(tree, "launch")).toEqual([
			{ id: "match", name: "Launch brief", path: "Research" },
		]);
	});
});

describe("cloud tree create controls", () => {
	const writable = {
		canCreate: true,
		canWriteDocument: (documentId: string) => documentId !== "read-only",
		canWriteFolder: (folderId: string) => folderId !== "read-only",
		canShareFolder: (folderId: string) => folderId === "owned",
		canMoveFolderToGit: (folderId: string) => folderId === "owned",
		canExportFolderCopy: (folderId: string) => folderId === "readable",
	};

	it("maps the current context root without exposing the shared root as a row", () => {
		expect(
			cloudContextRootFolderId({ kind: "workspace", workspaceId: "space" }),
		).toBeNull();
		expect(
			cloudContextRootFolderId({
				kind: "shared-folder",
				workspaceId: "space",
				folderId: "shared",
			}),
		).toBe("shared");
	});

	it("derives both create actions from the same root and folder capabilities", () => {
		expect(cloudTreeCreateActions(null, writable)).toEqual([
			"create-document",
			"create-folder",
		]);
		expect(cloudTreeCreateActions("folder", writable)).toEqual([
			"create-document",
			"create-folder",
		]);
		expect(cloudTreeCreateActions("read-only", writable)).toEqual([]);
		expect(
			cloudTreeCreateActions(null, {
				canCreate: false,
				canWriteDocument: () => false,
				canWriteFolder: () => false,
				canShareFolder: () => false,
			}),
		).toEqual([]);
	});

	it("returns the ancestors that must expand before focusing a created folder", () => {
		const tree = buildCloudContentTree(
			[
				{ id: "root", name: "Root", parentId: null },
				{ id: "parent", name: "Parent", parentId: "root" },
				{ id: "created", name: "Created", parentId: "parent" },
			],
			[],
			null,
		);
		expect(cloudFolderAncestorIds(tree, "created")).toEqual(["root", "parent"]);
		expect(cloudFolderAncestorIds(tree, "missing")).toBeNull();
		expect(cloudNodeAncestorIds(tree, "created")).toEqual(["root", "parent"]);
	});

	it("derives row menus from kind, capability, and direct availability", () => {
		expect(cloudTreeActions({ kind: "document", id: "doc" }, writable)).toEqual(
			["rename", "move", "trash"],
		);
		expect(
			cloudTreeActions({ kind: "document", id: "read-only" }, writable),
		).toEqual([]);
		expect(cloudTreeActions({ kind: "folder", id: "owned" }, writable)).toEqual(
			[
				"create-document",
				"create-folder",
				"rename",
				"trash",
				"share",
				"move-to-git",
			],
		);
		expect(
			cloudTreeActions({ kind: "folder", id: "folder" }, writable, true),
		).toEqual([
			"create-document",
			"create-folder",
			"rename",
			"trash",
			"reveal-local",
			"copy-local-path",
			"relocate-local",
			"stop-local",
		]);
		expect(
			cloudTreeActions({ kind: "folder", id: "readable" }, writable),
		).toEqual([
			"create-document",
			"create-folder",
			"rename",
			"trash",
			"export-copy",
		]);
	});

	it("keeps move destinations inside the current context and restores nearby focus", () => {
		const tree = buildCloudContentTree(
			[
				{ id: "child", name: "Child", parentId: "shared" },
				{ id: "nested", name: "Nested", parentId: "child" },
			],
			[],
			"shared",
		);
		expect(cloudMoveDestinations(tree, "shared")).toEqual([
			{ folderId: "shared", name: "Shared folder root", depth: 0 },
			{ folderId: "child", name: "Child", depth: 1 },
			{ folderId: "nested", name: "Nested", depth: 2 },
		]);
		expect(
			nextCloudTreeFocusId(["before", "removed", "after"], "removed", [
				"before",
				"after",
			]),
		).toBe("after");
	});
});

describe("cloudTreeItemAccessibleLabel", () => {
	it("keeps the item name and local state explicit for screen readers", () => {
		expect(cloudTreeItemAccessibleLabel("Projects")).toBe("Projects");
		expect(
			cloudTreeItemAccessibleLabel("Projects", {
				folderId: "folder",
				localPath: "/repo/brain/cloud",
				status: "connected",
			}),
		).toBe("Projects. Available at /repo/brain/cloud.");
		expect(cloudTreeItemAccessibleLabel("Projects", undefined, true)).toBe(
			"Projects. Actions available.",
		);
		expect(
			cloudTreeItemAccessibleLabel("Projects", {
				folderId: "folder",
				localPath: "/repo/brain/cloud",
				status: "pending-review",
			}),
		).toContain("needs review");
	});
});
