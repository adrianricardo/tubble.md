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

**Decision:** Provisionally adopt `@convex-dev/prosemirror-sync` for the Stage 1
POC.

**Why:** It fits the existing Convex + Tiptap stack and supports the hard gates
already checked locally:

- Tiptap binding exists.
- Server-side transforms exist, which are required for future agent edits.
- Snapshot/version APIs exist, which are enough to build materialized version
  history later.
- Read/write hooks exist for future permission enforcement.

**Not final until:** Two-browser live merge, doc-size/performance, presence
strategy, and agent dashboard proof are validated.

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

## Current Open Decisions

- **Presence/cursors:** Use a custom Convex presence layer, find an API in
  `prosemirror-sync`, or reconsider provider if this is a hard blocker.
- **Stage 1 identity:** Decide the minimal POC identity model for two distinct
  users before full Stage 3 auth.
- **Stable document IDs timing:** The POC currently uses path-derived ids. Before
  anything durable ships, Live Documents need stable `documents` rows.
- **Offline:** `prosemirror-sync` does not currently provide the required offline
  merge story. Treat offline as a later explicit feature.
