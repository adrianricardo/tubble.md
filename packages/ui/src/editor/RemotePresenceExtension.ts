import { Extension } from "@tiptap/core";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type RemotePresenceCursor = {
	userId: string;
	name: string;
	color: string;
	anchor: number;
	head: number;
};

export const remotePresenceKey = new PluginKey<RemotePresenceCursor[]>(
	"remotePresence",
);

export const RemotePresenceExtension = Extension.create({
	name: "remotePresence",

	addProseMirrorPlugins() {
		return [
			new Plugin<RemotePresenceCursor[]>({
				key: remotePresenceKey,
				state: {
					init: () => [],
					apply: (tr, value) => {
						const next = tr.getMeta(remotePresenceKey);
						return Array.isArray(next) ? next : value;
					},
				},
				props: {
					decorations: (state: EditorState) => {
						const cursors = remotePresenceKey.getState(state) ?? [];
						if (cursors.length === 0) return null;

						const decorations: Decoration[] = [];
						for (const cursor of cursors) {
							const anchor = clampPosition(
								cursor.anchor,
								state.doc.content.size,
							);
							const head = clampPosition(cursor.head, state.doc.content.size);
							const from = Math.min(anchor, head);
							const to = Math.max(anchor, head);

							if (from !== to) {
								decorations.push(
									Decoration.inline(from, to, {
										class: "pm-remote-selection",
										style: `--remote-presence-color: ${cursor.color}`,
									}),
								);
							}

							decorations.push(
								Decoration.widget(
									head,
									() => createRemoteCaret(cursor.name, cursor.color),
									{ side: 1 },
								),
							);
						}

						return DecorationSet.create(state.doc, decorations);
					},
				},
			}),
		];
	},
});

function clampPosition(position: number, max: number): number {
	return Math.max(0, Math.min(position, max));
}

function createRemoteCaret(name: string, color: string): HTMLElement {
	const caret = document.createElement("span");
	caret.className = "pm-remote-caret";
	caret.style.setProperty("--remote-presence-color", color);
	caret.contentEditable = "false";

	const label = document.createElement("span");
	label.className = "pm-remote-caret-label";
	label.textContent = name;
	caret.append(label);

	return caret;
}
