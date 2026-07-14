import { describe, expect, it, vi } from "vitest";
import { buildTextContextMenuTemplate } from "./textContextMenu";

describe("text context menu", () => {
	it("offers spelling replacement and dictionary actions before edit roles", () => {
		const replaceMisspelling = vi.fn();
		const addWordToSpellCheckerDictionary = vi.fn();
		const template = buildTextContextMenuTemplate(
			{
				replaceMisspelling,
				session: { addWordToSpellCheckerDictionary },
			},
			{
				misspelledWord: "amzing",
				dictionarySuggestions: ["amazing"],
				editFlags: {
					canCut: true,
					canCopy: true,
					canPaste: false,
					canDelete: false,
					canSelectAll: true,
					canEditRichly: true,
					canRedo: false,
					canUndo: false,
				},
			},
		);

		expect(
			template.map((item) => item.label ?? item.role ?? item.type),
		).toEqual([
			"amazing",
			"Add to Dictionary",
			"separator",
			"cut",
			"copy",
			"paste",
			"selectAll",
		]);
		template[0]?.click?.(
			{} as Electron.MenuItem,
			{} as Electron.BrowserWindow,
			{
				preventDefault: vi.fn(),
			} as unknown as Electron.KeyboardEvent,
		);
		template[1]?.click?.(
			{} as Electron.MenuItem,
			{} as Electron.BrowserWindow,
			{
				preventDefault: vi.fn(),
			} as unknown as Electron.KeyboardEvent,
		);
		expect(replaceMisspelling).toHaveBeenCalledWith("amazing");
		expect(addWordToSpellCheckerDictionary).toHaveBeenCalledWith("amzing");
		expect(template.find((item) => item.role === "paste")?.enabled).toBe(false);
	});

	it("shows a disabled fallback when the spellchecker has no guesses", () => {
		const template = buildTextContextMenuTemplate(
			{
				replaceMisspelling: vi.fn(),
				session: { addWordToSpellCheckerDictionary: vi.fn() },
			},
			{
				misspelledWord: "zzzz",
				dictionarySuggestions: [],
				editFlags: {
					canCut: false,
					canCopy: false,
					canPaste: false,
					canDelete: false,
					canSelectAll: false,
					canEditRichly: true,
					canRedo: false,
					canUndo: false,
				},
			},
		);

		expect(template[0]).toMatchObject({
			label: "No Guesses Found",
			enabled: false,
		});
	});
});
