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
- Not supporting arbitrary, un-integrated, file-only agents writing *concurrently*
  into live documents as the primary path (handled via a compatibility shim only).

## The agent model (decided: Model C)

The document API/CRDT is authoritative. Agents edit through the **same document
API humans use** (apply a patch against a known revision → server converts intent
to editor steps → streamed live to all collaborators). The markdown file persists
on disk as a **read-only projection** so agents and tools can read/grep/back it up.
A thin local **shim** lets legacy file-only agents write to a staging file, which
it converts into an API patch against the current revision.

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
attributed, streamed edits. Read-only file projection on disk. Legacy file-only
agent shim (staging file → API patch). Suggestion mode (agent proposes, human
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
| Agent layer (our edge) | Agent-as-collaborator API, attributed live agent edits, read-only file projection, legacy file shim |

## Open questions

- Auth provider: Convex Auth vs Clerk vs WorkOS (team/SSO needs may decide).
- Does `@convex-dev/prosemirror-sync` meet our needs on doc size, offline, version
  snapshots, and server-side agent edits? (Stage 1 spike answers this.)
- Suggestion-mode UX for agent edits: auto-apply for trusted agents vs always
  propose-and-accept.
