import { describe, expect, it } from "vitest";
import type { SyncBackend } from "./backend.js";
import type { LocalFile } from "./fs.js";
import {
	assertLiveDocumentMarkdownWithinCap,
	importLiveDocuments,
	LIVE_DOCUMENT_MARKDOWN_MAX_BYTES,
} from "./sync.js";

function backendRecorder() {
	const imported: string[] = [];
	const backend = {
		async importLiveDocument(
			args: Parameters<SyncBackend["importLiveDocument"]>[0],
		) {
			imported.push(args.path);
			return {
				documentId: args.path,
				path: args.path,
				title: args.title,
				created: true,
			};
		},
	} as Pick<SyncBackend, "importLiveDocument"> as SyncBackend;
	return { backend, imported };
}

function fsWithFiles(files: LocalFile[]) {
	return {
		async listMarkdownFiles() {
			return files;
		},
	};
}

describe("Live Document markdown cap", () => {
	it("allows markdown at the 256 KiB cap", () => {
		expect(() =>
			assertLiveDocumentMarkdownWithinCap(
				"a".repeat(LIVE_DOCUMENT_MARKDOWN_MAX_BYTES),
			),
		).not.toThrow();
	});

	it("rejects markdown over the 256 KiB cap", () => {
		expect(() =>
			assertLiveDocumentMarkdownWithinCap(
				"a".repeat(LIVE_DOCUMENT_MARKDOWN_MAX_BYTES + 1),
			),
		).toThrow("exceeds the 256 KiB limit");
	});

	it("preflights all imports before mutating cloud documents", async () => {
		const { backend, imported } = backendRecorder();
		const fs = fsWithFiles([
			{ relativePath: "small.md", content: "# Small", hash: "small" },
			{
				relativePath: "large.md",
				content: "a".repeat(LIVE_DOCUMENT_MARKDOWN_MAX_BYTES + 1),
				hash: "large",
			},
		]);

		await expect(
			importLiveDocuments(backend, fs, {
				workspaceId: "workspace",
				workspacePath: "/workspace",
			}),
		).rejects.toThrow('Live Document import "large.md" is too large');
		expect(imported).toEqual([]);
	});
});
