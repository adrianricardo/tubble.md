import { describe, expect, it } from "vitest";
import { composeAuthorityTree } from "./authorityTree";

describe("authority tree", () => {
	it("substitutes one cloud boundary and omits projected Git descendants", () => {
		const tree = composeAuthorityTree({
			repoRoot: "/repo",
			entries: [
				{ kind: "folder", absolutePath: "/repo/notes" },
				{ kind: "document", absolutePath: "/repo/notes/local.md" },
				{ kind: "folder", absolutePath: "/repo/shared" },
				{ kind: "document", absolutePath: "/repo/shared/projected.md" },
			],
			placements: [
				{
					id: "placement-1",
					absolutePath: "/repo/shared",
					cloudFolderId: "folder-1",
					children: [
						{
							kind: "cloud-document",
							id: "cloud:document-1",
							cloudDocumentId: "document-1",
						},
					],
				},
			],
		});

		expect(tree).toMatchObject({
			kind: "git-folder",
			id: "git:/repo",
			children: [
				{
					kind: "git-folder",
					absolutePath: "/repo/notes",
					children: [
						{ kind: "git-document", absolutePath: "/repo/notes/local.md" },
					],
				},
				{
					kind: "cloud-boundary",
					id: "placement:placement-1",
					absolutePath: "/repo/shared",
					children: [{ kind: "cloud-document" }],
				},
			],
		});
	});

	it("ignores entries and placements outside the selected repository", () => {
		const tree = composeAuthorityTree({
			repoRoot: "C:\\repo",
			entries: [
				{ kind: "document", absolutePath: "C:\\repo\\inside.md" },
				{ kind: "document", absolutePath: "C:\\other\\outside.md" },
			],
			placements: [
				{
					id: "outside",
					absolutePath: "C:\\other\\cloud",
					cloudFolderId: "folder-outside",
				},
			],
		});

		expect(tree).toMatchObject({
			kind: "git-folder",
			absolutePath: "C:/repo",
			children: [{ absolutePath: "C:/repo/inside.md" }],
		});
	});
});
