// SPIKE (Stage 1, realtime-collab): prosemirror-sync server API + a proof that
// AGENTS can edit a document server-side (the Model C agent layer, TECH.md).
//
// Status: scaffold. The `components.prosemirrorSync` symbol and the typed
// `_generated/api` references below only resolve AFTER running `convex dev`
// once with the component registered (see convex.config.ts). Until then this
// file will not typecheck — that is expected for the spike. See SPIKE.md.

import { v } from "convex/values";
import { ProsemirrorSync } from "@convex-dev/prosemirror-sync";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";

const prosemirrorSync = new ProsemirrorSync(components.prosemirrorSync);

// Realtime sync endpoints consumed by the Tiptap client via `useTiptapSync`.
// TODO(stage-3): gate these behind document permission checks (owner/editor/
// viewer). A viewer must never receive `submitSteps`/`submitSnapshot`.
export const {
	getSnapshot,
	submitSnapshot,
	latestVersion,
	getSteps,
	submitSteps,
} = prosemirrorSync.syncApi({
	// checkRead / checkWrite hooks go here in Stage 3.
});

// --- Agent edit path (Model C) -------------------------------------------
// Proves the decision-gate question "can an agent edit server-side, no browser?"
// `transform` receives the latest doc and returns a ProseMirror Transform/Transaction;
// the change streams to every connected human like any collaborator edit.
//
// The real Model C API (`applyPatch(id, baseRevision, intent)`, outline-targeted
// edits) is built on top of this in Stage 4. This is the minimal proof.
//
// NOTE: `schema` must be the SAME ProseMirror schema the editor uses. Derive it
// from the Tiptap extensions in packages/editor (`getSchema(extensions)`) so
// server and client agree. Left as a TODO until the editor schema is exported.
export const agentAppendParagraph = mutation({
	args: { docId: v.string(), text: v.string() },
	handler: async (ctx, { docId, text }) => {
		// const schema = getEditorSchema(); // TODO: export from packages/editor
		// await prosemirrorSync.transform(ctx, docId, schema, (doc) => {
		//   const tr = new Transform(doc);
		//   tr.insert(doc.content.size, schema.node("paragraph", null, schema.text(text)));
		//   return tr;
		// });
		throw new Error(
			"SPIKE scaffold: wire editor schema + uncomment transform() — see SPIKE.md",
		);
	},
});
