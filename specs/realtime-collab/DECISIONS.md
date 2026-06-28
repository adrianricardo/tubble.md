# Realtime Collaboration — Decision Log

This file keeps the fork's decisions and reasoning in one place for review and
share-back. For task status, use `PROGRESS.md`.

## 1. Introduce Live Documents

**Decision:** Introduce **Live Documents** as a distinct synced document mode.

For Live Documents, the authoritative state is the cloud ProseMirror/OT document
stored through Convex. Markdown files and markdown strings are projections for
readability, export/import, backups, and legacy tooling.

**Why:** The existing Hubble model is file-authoritative. That works for local
editing and whole-file sync, but it cannot safely support simultaneous typing,
agent edits, anchored comments, permissions, or cloud version history. Those
features need a stable document identity and an operational edit stream.

**Scope:** This decision does **not** redefine all Hubble editing. Local-only
Workspace editing, Plain Folder editing, and Loose File editing remain
file-authoritative.

**Canonical repo record:** `docs/adr/0009-live-documents-are-cloud-authoritative.md`.

## 2. Keep Convex As The Primary Backend

**Decision:** Keep Convex for the realtime-collab fork unless the Stage 1 decision
gate finds a concrete hard failure.

**Why:** Hubble already has Convex backend packages, generated API imports,
workspace/file/asset tables, and client wrappers. Moving to a different backend
would discard that integration without eliminating the hard problem: rich-text
realtime document state.

**Rejected direction:** InstantDB for this fork. It is a strong realtime
relational database, but it does not provide a built-in ProseMirror/CRDT document
component, so it does not remove the core editor-collaboration complexity.

## 3. Provisionally Adopt `@convex-dev/prosemirror-sync`

**Decision:** Adopt `@convex-dev/prosemirror-sync` for the current production path,
with an explicit Live Document size cap before deploy. Do **not** trigger the
Yjs/Durable Objects fallback yet.

**Why:** It fits the existing Convex + Tiptap stack and supports the hard gates
already checked locally:

- Tiptap binding exists.
- Server-side transforms exist, which are required for future agent edits.
- Snapshot/version APIs exist, which are enough to build materialized version
  history later.
- Read/write hooks exist for future permission enforcement.

**RD5 doc-size result:** Hosted measurements on `strong-setter-709` proved the
current shape works for small/medium documents but fails the large-doc gate:
64 KiB, 256 KiB, and 320 KiB markdown docs patched and converged through reactive
subscribers, while 384 KiB and 512 KiB failed on first patch with Convex values
over 1 MiB and 768 KiB import timed out.

**Why continue instead of fallback:** The failure is concrete but localized to the
current storage/revision materialization shape. The rest of the fork already has
substantial Convex/prosemirror-sync integration: auth, permissions, revisions,
agent patching, synced-folder projection, and sharing. Moving to Yjs/DO now would
reopen that whole surface before proving Convex cannot meet the first production
release with a documented cap.

**Current release boundary:** Live Documents must ship with a conservative markdown
size cap, initially **256 KiB**, enforced before import/conversion/mutation. Local
file-authoritative workspaces remain unrestricted. Raising the cap requires a
follow-up storage/revision redesign and a rerun of RD5.

**RD5 live editor result:** Hosted two-browser testing on `strong-setter-709`
passed with Ada/Ben `?test=1` sessions editing document
`kn7e5a4kwk4mhb207mxnxst9t189h9tj`. Presence appeared in both sessions, separate
paragraph edits merged into backend revision 107, and same-paragraph adjacent
inserts converged in both browser pages and backend revision 175.

**Known gap:** The installed package source exposes sync APIs but no obvious
presence/cursor API. Presence may need an additional Convex-backed layer or a
different collaboration provider if cursors are a hard Stage 1 requirement.

## 4. Use Model C For Agents

**Decision:** Agents should edit through the Live Document API, with a legacy
file shim only as compatibility.

**Why:** Native agent edits through the document API can be patch-sized,
attributed, rebased/rejected against a known revision, and streamed to humans.
Whole-file file-watcher edits are document-sized, delayed until save, and risky
under concurrent human editing.

**Model C shape:**

- Native path: `getDocument` + `applyPatch` against a Live Document revision.
- Read path: markdown projection is available for grep/read/backup.
- Legacy path: file-only agents write a staging file; a shim converts that into a
  single API patch.

## 5. Version History Is Product History, Not Git

**Decision:** Live Document version history should be a linear product history
with restore-as-new-change.

**Why:** Users need browse/restore semantics like Google Docs, not branches,
commits, or raw CRDT internals. Restoring a previous version should create a new
change replacing the current document content, never mutate history.

## 6. Local Files Are Editable Inputs For Live Documents

**Decision:** A Live Document's markdown file on disk is a **bidirectional**
projection — editable in any app by any human or agent, not read-only. The
always-on Hubble desktop app watches the file and reconciles external saves into the
CRDT via **base-cache diff → scoped patch**: conflict-free, attributed, no manual
sync.

**Why:** It preserves Hubble's "edit your markdown anywhere" identity for Live
Documents while keeping the cloud CRDT authoritative. Diffing against a known base
produces *operations* the CRDT merges safely — the prior-art Yjs/Motif pattern — so
we get edit-anywhere without the old last-write-wins clobber.

**This revises Decision 4 (Model C):** the legacy file-only shim was the special
case; the watcher now handles any external editor, and the earlier read-only
projection becomes bidirectional. See TECH "Bidirectional file reconciliation" and
"Code changes required (revising already-written code)".

**Boundaries / risks:** real-time = on-save (not keystroke); requires the app
running (window or tray); external edits get best-effort (diffed) attribution;
markdown↔ProseMirror fidelity is contained by scoping conversion to the changed
range + base cache + `*.local-edit-<ts>` backstop.

**Open:** on-disk path for the editable projection (normal tree vs. dedicated
location) — deferred; direction decided, path TBD.

## Current Open Decisions

- **Presence/cursors:** Use a custom Convex presence layer, find an API in
  `prosemirror-sync`, or reconsider provider if this is a hard blocker.
- **Offline:** two flavors of the same machinery — (a) in-editor offline via CRDT
  local buffer/replay (`prosemirror-sync` offline is spike-gated; Yjs/`y-indexeddb`
  is the proven fallback), and (b) external-file offline edits queued by the watcher
  and flushed on reconnect via the reconcile path (Decision 6).
- **Large-doc cap removal:** Decide the storage/revision design that can safely
  raise or remove the initial 256 KiB Live Document markdown cap.
