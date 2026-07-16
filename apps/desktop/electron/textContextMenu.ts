type TextMenuWebContents = Pick<Electron.WebContents, "replaceMisspelling"> & {
	session: Pick<Electron.Session, "addWordToSpellCheckerDictionary">;
};

type TextMenuParams = Pick<
	Electron.ContextMenuParams,
	"dictionarySuggestions" | "editFlags" | "misspelledWord"
>;

const editItems = [
	{ role: "cut", flag: "canCut" },
	{ role: "copy", flag: "canCopy" },
	{ role: "paste", flag: "canPaste" },
	{ role: "selectAll", flag: "canSelectAll" },
] as const;

export function buildTextContextMenuTemplate(
	webContents: TextMenuWebContents,
	params: TextMenuParams,
): Electron.MenuItemConstructorOptions[] {
	const spellingItems: Electron.MenuItemConstructorOptions[] =
		params.misspelledWord.length > 0
			? [
					...(params.dictionarySuggestions.length > 0
						? params.dictionarySuggestions.map((suggestion) => ({
								label: suggestion,
								click: () => webContents.replaceMisspelling(suggestion),
							}))
						: [{ label: "No Guesses Found", enabled: false }]),
					{
						label: "Add to Dictionary",
						click: () =>
							webContents.session.addWordToSpellCheckerDictionary(
								params.misspelledWord,
							),
					},
					{ type: "separator" },
				]
			: [];

	return [
		...spellingItems,
		...editItems.map((item) => ({
			role: item.role,
			enabled: params.editFlags[item.flag],
		})),
	];
}
