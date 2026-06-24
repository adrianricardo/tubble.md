# Realtime Collaboration — Technical Spec

Companion to `PRODUCT.md`. Grounded in the current source as of the fork point.

## Current architecture (what we're changing)

- **Editor**: Tiptap v3 / ProseMirror with custom markdown↔ProseMirror conversion
  in `packages/editor` (`markdownToProsemirror.ts`, `prosemirrorToMarkdown.ts`).
  No Yjs, no CRDT, no `@tiptap/extension-collaboration`.
- **Editor save path**: every Tiptap update is serialized to a full markdown
  string via a debounced save callback (`packages/ui/src/editor/EditorView.tsx`).
  **The document is file-authoritative.**
- **Backend**: Convex (`packages/sync-backend/convex`). Schema = `workspaces`,
  `files`, `assets`. The `files` table stores the **full `content` string** +
  `contentHash` (`convex/schema.ts`).
- **Sync**: `packages/sync/src/sync.ts` — whole-file, content-hash,
  **last-write-wins** reconciliation. On divergence it writes a
  `*.conflict-<timestamp>` copy (`toConflictName`). Batch/polling, not live.
  Abstracted behind `SyncBackend` (`packages/sync/src/backend.ts`).
- **Conflict classification**: desktop/web explicitly classify external changes as
  reload/conflict/match (`apps/desktop/src/externalFileChange.ts`,
  `apps/www/src/store/actions.ts`). **Multiplayer deletes this entire class of
  user-visible conflict for live documents.**
- **No auth/users/permissions** anywhere in the schema or apps.
- **Documents are addressed by file path**, not stable ID.

## Core architectural decision

> **For Live Documents, the cloud realtime document (CRDT/OT, stored in Convex)
> is authoritative. Filesystem sync becomes an import/export/projection subsystem
> for those Live Documents. Everything else — permissions, history, agent
> workflows — depends on this.**

Make this commitment *before* building permissions, history, or the agent layer.
Retrofitting authority later means reworking every query. This commitment is
scoped to Live Documents; local-only Workspace editing, Plain Folder editing, and
Loose File editing remain file-authoritative.

## Target stack

- **Editor**: keep Tiptap; add the collaboration binding.
- **Realtime + persistence**: **Convex `@convex-dev/prosemirror-sync`** (official
  component: OT-based conflict-free merge, doc stored in Convex, presence). We are
  already on Convex + Tiptap, so this avoids a second backend authority.
  - **Decision gate (Stage 1 spike)**: validate doc-size limits, offline behavior,
    version-snapshot hooks, auth integration, and **server-side / programmatic
    edits** (needed for the agent layer). If it fails a hard requirement, fall back
    to **Yjs on Cloudflare Durable Objects + `y-websocket`** (Adrian already runs
    Cloudflare infra) or a managed layer (Liveblocks/PartyKit). Do *not* adopt the
    fallback without a concrete failing requirement.
- **Why not InstantDB**: it's a strong realtime relational DB but has no built-in
  ProseMirror/CRDT document component — the central rich-text complexity remains,
  and switching discards the existing `SyncBackend`, Convex client wrappers, and
  asset/workspace logic for no architectural payoff. **Stay on Convex.**

## Data model changes (Convex schema)

New/changed tables (illustrative — finalize during Stage 2/3):

```
users         { authId, name, email, image }
workspaces    { name, createdAt, ownerId }                       // + ownerId
members       { workspaceId, userId, role }                      // workspace membership
documents     { id (stable), workspaceId, title, path?, createdBy,
                createdAt, updatedAt, updatedBy, deletedAt? }     // NEW: doc identity
docShares     { documentId, userId|null, linkScope?, role }      // per-doc roles + link sharing
prosemirror   { ...managed by the collab component... }          // CRDT/step state
revisions     { documentId, createdAt, actor, label?,
                pmDoc (JSON), markdown, crdtMeta }                // version history
comments      { documentId, anchor, threadId, authorId, body, resolvedAt? }
assets        { ...existing... }                                 // stays LWW
```

Key shifts:
- **Stable `documents.id`** replaces path-as-identity. Path/title become mutable
  metadata. This fixes renames, moves, and history/comment anchoring under
  concurrent edits. *(Path-identity is a real risk in the current code.)*
- **Roles enforced server-side** in every query/mutation. A viewer must never
  receive editable document steps — enforce at the data boundary, not the client.

## Agent layer (Model C) — detail

- **Document patch API** (Convex mutations + an MCP server / `hubble` CLI surface):
  - `getDocument(id) → { revision, markdown, outline }` — `outline` (heading map)
    lets agents target edits **without ingesting the whole doc** (token efficiency).
  - `applyPatch(id, baseRevision, intent)` where intent ∈ {replace-range,
    insert-after-heading, markdown-patch}. Server converts intent → ProseMirror
    steps → CRDT transaction, **attributed to the agent**, streamed to all clients.
    If the doc moved past `baseRevision`, the server rebases or rejects — never
    blind-overwrites.
  - Edits can **stream** (token-by-token → steps → broadcast) so humans see "agent
    editing…" live.
- **Read-only file projection**: the markdown file on disk is continuously
  re-materialized from the authoritative doc. Agents/tools read/grep/back it up;
  they do **not** write it on the collaboration path.
- **Legacy file-only shim**: a local watcher on a *staging* file converts a
  file-only agent's write into a single `applyPatch(markdown-patch)` against the
  current revision. The lossy markdown→steps conversion runs **once, server-side,
  against a known base** — not continuously against live-mutating file state.
- **Suggestion mode**: untrusted agents propose changes (track-changes) that a
  human accepts; trusted agents may auto-apply.

## Version history (not git)

- The CRDT is the live editing substrate; **don't** expose raw CRDT internals as
  the history UI, and **don't** model history as git commits/branches.
- On meaningful boundaries (debounce windows, session close, manual "name this
  version", and **before any restore**), materialize a `revisions` row:
  `{ documentId, createdAt, actor, label?, pmDoc (ProseMirror JSON), markdown,
  crdtMeta }`.
- **Restore = a new change** that replaces current content with the chosen
  revision's content. It never mutates history.
- Storing both `pmDoc` (for faithful restore/diff/preview) and `markdown` (for
  export/search) is the robust middle path — raw-CRDT-only makes preview/diff hard;
  markdown-only loses editor state.

## Risks & mitigations

- **Markdown projection correctness.** The custom converter is currently a
  best-effort save path; as a projection it becomes correctness-critical. Mitigate:
  projection is **one-way** (doc→markdown) on the normal path; markdown→doc only on
  explicit import/shim-patch against a known revision. Add round-trip property tests
  for tables, frontmatter, embeds, custom nodes.
- **Path identity.** Move to stable document IDs early (Stage 2) before sharing and
  history anchor to anything.
- **Permissions retrofit.** Design roles into queries from Stage 3's first mutation,
  not bolted onto clients.
- **Assets + collaboration.** Rich docs need asset ownership, permissions, GC, and
  versioned references; assets stay LWW but gain doc-scoped permission checks.
- **Second-backend creep.** If the collab component forces a Durable-Objects/Yjs
  fallback, keep Convex as the source of truth for documents/permissions/history
  and treat the realtime layer as transport only — avoid two authorities.

## Stage → engineering mapping

1. **POC**: add collab component, bind to Tiptap, auth-gate, presence cursors, one
   shared doc. Spike answers the decision gate.
2. **Doc entities**: `documents` table + stable IDs, Live Document CRUD in web app,
   markdown projection on read, migrate file-sync to import/export for Live
   Documents.
3. **Permissions**: `users`/`members`/`docShares`, auth provider, server-side
   enforcement, share dialog + link sharing.
4. **Agent layer**: patch API + MCP/CLI, projection writer, legacy shim, suggestion
   mode.
5. **History & review**: `revisions` + restore UI, comments/threads, track-changes,
   activity feed.
6. **Polish**: folders/search/export/import, offline merge, audit log, trash,
   admin.

## Notes

- `origin` still points at upstream `bholmesdev/hubble.md`. Repoint to the fork
  before pushing fork-specific work.
- This spec reflects the second-opinion review (Codex) and source reading done at
  the fork point; revisit the decision gate after the Stage 1 spike.
