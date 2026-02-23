import {
	Menu,
	MenuItem,
	PredefinedMenuItem,
	Submenu,
} from "@tauri-apps/api/menu";
import { isMac } from "keymatch";

async function createAboutSubmenu(): Promise<Submenu> {
	return Submenu.new({
		text: "About",
		items: [
			await PredefinedMenuItem.new({ text: "Services", item: "Services" }),
			await PredefinedMenuItem.new({
				text: "separator-text",
				item: "Separator",
			}),
			await PredefinedMenuItem.new({ text: "Hide Hubble", item: "Hide" }),
			await PredefinedMenuItem.new({ text: "Hide Others", item: "HideOthers" }),
			await PredefinedMenuItem.new({ text: "Show All", item: "ShowAll" }),
			await PredefinedMenuItem.new({
				text: "separator-text",
				item: "Separator",
			}),
			await PredefinedMenuItem.new({ text: "Quit Hubble", item: "Quit" }),
		],
	});
}

async function createFileSubmenu(actions: {
	open: () => void;
}): Promise<Submenu> {
	return Submenu.new({
		text: "File",
		items: [
			await MenuItem.new({
				id: "open",
				text: "Open…",
				accelerator: "CmdOrCtrl+O",
				action: () => actions.open(),
			}),
			await PredefinedMenuItem.new({
				text: "separator-text",
				item: "Separator",
			}),
			await PredefinedMenuItem.new({ text: "Close", item: "CloseWindow" }),
		],
	});
}

async function createEditSubmenu(): Promise<Submenu> {
	return Submenu.new({
		text: "Edit",
		items: [
			await PredefinedMenuItem.new({ text: "Undo", item: "Undo" }),
			await PredefinedMenuItem.new({ text: "Redo", item: "Redo" }),
			await PredefinedMenuItem.new({
				text: "separator-text",
				item: "Separator",
			}),
			await PredefinedMenuItem.new({ text: "Cut", item: "Cut" }),
			await PredefinedMenuItem.new({ text: "Copy", item: "Copy" }),
			await PredefinedMenuItem.new({ text: "Paste", item: "Paste" }),
			await PredefinedMenuItem.new({ text: "Select all", item: "SelectAll" }),
		],
	});
}

export async function createAppMenu(actions: {
	open: () => void;
}): Promise<Menu> {
	const items: Submenu[] = [
		await createFileSubmenu(actions),
		await createEditSubmenu(),
	];
	if (isMac()) items.unshift(await createAboutSubmenu());
	return await Menu.new({ items });
}

export async function setupContextMenu(actions: { open: () => void }) {
	const menu = await Menu.new({
		items: [
			await MenuItem.new({
				id: "open",
				text: "Open…",
				accelerator: "CmdOrCtrl+O",
				action: () => actions.open(),
			}),
		],
	});

	const handler = async (e: MouseEvent) => {
		e.preventDefault();
		await menu.popup();
	};
	window.addEventListener("contextmenu", handler);
	return () => window.removeEventListener("contextmenu", handler);
}
