import { describe, expect, it, vi } from "vitest";
import { classifyFileChange } from "./externalFileChange";
import {
	isSyncedLiveDocument,
	resolveExternalFileChange,
} from "./syncedDocumentGuard";

describe("resolveExternalFileChange (routing isolation)", () => {
	const conflictingInputs = {
		// A genuine legacy conflict: editor dirty, disk diverged.
		editorContent: "local edit",
		baseline: "before",
		diskContent: "remote edit",
	};

	it("synced Live Document with clean editor: reloads and never invokes the classifier", () => {
		const classify = vi.fn(classifyFileChange);
		const decision = resolveExternalFileChange(
			{
				isSyncedLiveDocument: true,
				editorContent: "before",
				baseline: "before",
				diskContent: "after",
			},
			classify,
		);
		expect(decision).toBe("reload");
		expect(classify).not.toHaveBeenCalled();
	});

	it("synced Live Document with dirty editor: advances baseline and never invokes the classifier", () => {
		const classify = vi.fn(classifyFileChange);
		const decision = resolveExternalFileChange(
			{ isSyncedLiveDocument: true, ...conflictingInputs },
			classify,
		);
		expect(decision).toBe("sync-baseline");
		expect(classify).not.toHaveBeenCalled();
	});

	it("non-synced doc: still runs legacy classification (regression guard)", () => {
		const classify = vi.fn(classifyFileChange);
		const decision = resolveExternalFileChange(
			{ isSyncedLiveDocument: false, ...conflictingInputs },
			classify,
		);
		// Same answer the legacy classifier has always produced for this input.
		expect(decision).toBe("conflict");
		expect(classify).toHaveBeenCalledOnce();
	});

	it("non-synced doc: a clean reload still classifies as 'reload'", () => {
		const decision = resolveExternalFileChange({
			isSyncedLiveDocument: false,
			editorContent: "before",
			baseline: "before",
			diskContent: "after",
		});
		expect(decision).toBe("reload");
	});
});

describe("isSyncedLiveDocument", () => {
	it("false when the desktop bridge is absent (web build)", async () => {
		expect(await isSyncedLiveDocument("/Hubble/WS/Doc.md", undefined)).toBe(
			false,
		);
	});

	it("false when the bridge lacks the method", async () => {
		expect(await isSyncedLiveDocument("/Hubble/WS/Doc.md", {})).toBe(false);
	});

	it("true when the main process reports a synced document", async () => {
		const api = { isSyncedFolderDocument: vi.fn(async () => true) };
		expect(await isSyncedLiveDocument("/Hubble/WS/Doc.md", api)).toBe(true);
		expect(api.isSyncedFolderDocument).toHaveBeenCalledWith(
			"/Hubble/WS/Doc.md",
		);
	});

	it("false when the main process reports a non-synced document", async () => {
		const api = { isSyncedFolderDocument: vi.fn(async () => false) };
		expect(await isSyncedLiveDocument("/repo/notes.md", api)).toBe(false);
	});

	it("false (safe fallback) when the IPC call rejects", async () => {
		const api = {
			isSyncedFolderDocument: vi.fn(async () => {
				throw new Error("ipc down");
			}),
		};
		expect(await isSyncedLiveDocument("/Hubble/WS/Doc.md", api)).toBe(false);
	});
});
