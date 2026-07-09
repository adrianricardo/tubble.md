# Realtime Collaboration — Product Spec

> Fork goal: evolve Hubble from a single-user, file-synced markdown app into a
> **team Google-Docs replacement** with realtime multiplayer editing, cloud
> version history (not git), team permissions, and first-class AI-agent
> collaboration. Built in stages, starting from a happy-path realtime POC.

## Summary

Today Hubble is file-authoritative: each device edits markdown files on disk and
a background engine reconciles whole files to Convex with **last-write-wins** and
`*.conflict-<timestamp>` copies on divergence. That is Dropbox-for-markdown — the
opposite of Google Docs, where concurrent edits *merge*.

This effort introduces **Live Documents**: synced, realtime-editable documents
whose authoritative representation is a **CRDT/operational realtime document** in
Convex. It does not redefine every Hubble editing mode. Local-only workspaces,
plain folders, and loose files remain file-authoritative. For Live Documents,
Tiptap remains the editor, Convex remains the backend, and the team product layer
adds users, teams, permissions, presence, comments, and version history. AI agents
become first-class collaborators whose edits appear live to everyone — not
file-writers racing humans through a serializer.

## Problem

- **No concurrent editing.** Two people on one document produce a conflict file,
  not a merge.
- **No teams.** There are no users, memberships, roles, or sharing — only
  workspaces, files, and assets.
- **No version history.** The backend stores only the latest content + hash;
  there is nothing to browse or restore.
- **Agent edits are coarse and racy.** Agents write whole files; changes are only
  visible after a save + sync cycle, and a whole-file agent rewrite can clobber a
  human's in-flight edit.

## Goals

- Multiple humans edit the same document simultaneously with conflict-free merge
  (no conflict files for live documents).
- AI agents edit documents and their changes appear **in real time** to every
  human viewing the document, attributed to the agent.
- Cloud-hosted, Google-Docs-style **version history with restore** — no git,
  no branches/commits/merges.
- **Team permissions**: workspace membership + per-document roles
  (owner / editor / commenter / viewer), sharing, and link-based access.
- Stays on the existing stack (Convex + Tiptap) — no backend rewrite.

## Non-goals

- Not preserving the whole-file last-write-wins sync engine for *live* documents.
  (File sync survives only as an import/export/projection subsystem — see TECH.)
- Not replacing local-only, plain-folder, or loose-file editing. Those remain
  file-authoritative outside Live Document mode.
- Not git-style branching/merging. Version history is linear restore points.
- Not a real-time *binary* asset co-editing model (assets stay last-write-wins).
- Not building our own CRDT or realtime transport — we adopt an existing one.
- Not *perfect* intent/keystroke reconstruction for edits made outside the app.
  External file edits are reconciled via base-cache diff → scoped patch (see "Local
  files as editable inputs"); attribution and cursor fidelity are coarser than
  in-app edits, but the edit is never lost or clobbered.

## The agent model (decided: Model C)

The document API/CRDT is authoritative. Agents edit through the **same document
API humans use** (apply a patch against a known revision → server converts intent
to editor steps → streamed live to all collaborators). The markdown file persists
on disk as a projection for read/grep/backup — and is **also an editable input**:
external saves (human or agent) are reconciled back into the CRDT via base-cache
diff → scoped patch (see "Local files as editable inputs"). The legacy file-only
shim is the headless special case of that general reconcile path.

Why C over the alternatives:

| Model | Speed (edit→visible) | Agent token cost/edit | Verdict |
|---|---|---|---|
| **A** file↔CRDT bridge | Chunky: watcher debounce + whole-file diff; nothing visible until save | **O(document size)** — must read+rewrite whole file | Highest correctness risk; worst on both axes |
| **B** API-only | One hop; can stream token-by-token | **O(change size)** if API exposes outline/anchors | Cleanest, but no file-only agent support |
| **C** API + file shim | B-tier for native agents; A-tier only on shim path | B-tier for native agents; A-tier only for legacy | **Chosen** — B's wins, A's cost contained to a legacy path |

Model A's two weaknesses compound: a long agent generation is invisible until it
finishes *and* costs full-document tokens to produce. Model C gives native agents
streaming visibility and patch-sized token cost, while keeping "read it as a file"
for free.

## Local files as editable inputs (decided)

Live Documents are cloud-authoritative, but their markdown files on disk remain
**editable inputs**, not read-only output. Any human or agent may edit a Live
Document's file in any external app; the always-on Hubble desktop app watches the
file, diffs the saved version against a per-file **last-synced base cache**,
converts the diff into a **scoped patch** against the current revision, and applies
it to the CRDT — which merges it conflict-free and broadcasts it to all
collaborators, attributed, with no manual sync step. This restores Hubble's "edit
your markdown anywhere" identity for Live Documents while keeping the cloud CRDT
authoritative, and generalizes the Model-C legacy shim from "file-only agents
only" to "any external editor, human or agent."

What makes it safe (vs. the old last-write-wins file sync):

- The diff is computed against a known base and converted to **operations**, so the
  CRDT merges it with concurrent remote edits instead of clobbering them. This is
  the prior-art pattern (Yjs + File System Access API / Motif).
- The markdown→ProseMirror conversion runs **only on the changed range against a
  known revision**, not whole-file — containing the projection-fidelity risk.
- If the base cache is missing/stale, the app writes a conflict copy
  (`*.local-edit-<ts>`) rather than silently overwriting.

Boundaries:

- **Real time = on-save**, not keystroke-by-keystroke. In-app editing still streams
  live; external-file edits land when the file is saved and detected.
- **Requires the Hubble app running** on that device (window open *or* in the
  background/tray). The editor can be any app; the watcher is Hubble's. Same
  precondition as today's sync engine — not a regression.
- External edits get **best-effort attribution** (diffed, not keystroke-level), so
  cursor stability and "edited by" are coarser than in-app edits.

**Offline is the same machinery, two flavors.** (a) Offline edit *in the Hubble
editor* is solved by the CRDT's local buffering + replay on reconnect (the
Google-Docs model). (b) External file edit while disconnected is the reconcile path
above, queued by the watcher and flushed on reconnect. They look like one feature
to the user but differ in where edit intent is captured.

## Staged delivery

Each stage ships something usable. Earlier stages do not depend on later ones.

### Stage 1 — Realtime editing POC (happy path)
Two authenticated humans co-edit one document live, conflict-free, with presence
cursors. No permissions model yet, no agents, no history UI. Proves the CRDT +
Convex + Tiptap path end to end. **This stage does not involve agents.**

### Stage 2 — Documents as first-class cloud entities
Stable document IDs (not file paths), document list/create/rename/delete in the
web app, markdown projection on read. Live presence (who's here), basic "last
edited by." Migrate the existing file-sync path to import/export.

### Stage 3 — Team permissions
Users + auth (Convex auth integration). Workspace membership. Per-document roles
(owner/editor/commenter/viewer). Share dialog + link sharing. Server-side
enforcement on every query/mutation (a viewer never receives editable steps).

### Stage 4 — Agent collaboration layer (Model C)
Document patch API + MCP/CLI tooling so agents edit as collaborators with live,
attributed, streamed edits. Bidirectional file projection on disk (read + reconcile
external saves via base-cache diff → scoped patch). Legacy file-only agent shim
(headless case of the reconcile path). Suggestion mode (agent proposes, human
accepts).

### Stage 5 — Version history & review workflow
Materialized document revisions (browse + restore). Comments & threads anchored to
text, @mentions, resolve. Track-changes / suggestion review. Activity feed +
notifications.

### Stage 6 — Polish toward Docs parity
Folders/shared drives, cross-document search, export (md/PDF/docx), import, offline
edit + merge on reconnect, audit log, trash + restore, admin/role management.

## Google-Docs-parity feature checklist

| Category | Features |
|---|---|
| Co-editing core | Live cursors, presence, selection highlights, follow-along |
| Review | Comments + threads anchored to text, @mentions, resolve, suggestion mode |
| History | Named version history + restore, "changes since I last looked", per-edit attribution |
| Org & sharing | Folders/shared drives, search, share dialog, link permissions, transfer ownership |
| Notifications | Comment/mention emails, "shared with you", activity feed |
| Editing | Offline edit + merge on reconnect, export (md/PDF/docx), import |
| Admin/safety | Audit log, soft-delete/trash + restore, role admin, basic DLP |
| Agent layer (our edge) | Agent-as-collaborator API, attributed live agent edits, bidirectional file projection (edit-anywhere, CRDT-reconciled), legacy file shim |

## Open questions

- Auth provider: Convex Auth vs Clerk vs WorkOS (team/SSO needs may decide).
- Does `@convex-dev/prosemirror-sync` meet our needs on doc size, offline, version
  snapshots, and server-side agent edits? (Stage 1 spike answers this.) Offline
  durability specifically gates the "offline-in-editor" half of file-edit
  reconciliation; Yjs/`y-indexeddb` is the documented fallback.
- Suggestion-mode UX for agent edits: auto-apply for trusted agents vs always
  propose-and-accept.
- On-disk path for the editable projection: normal workspace tree (grep/backup
  ergonomics; footgun mitigated by base cache + conflict copy) vs. a dedicated
  location. **Deferred** — the direction (files are editable inputs) is decided;
  the path is not.
