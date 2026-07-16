# Sonnet Task Briefs — Realtime Collab UI

**Purpose:** self-contained briefs so a *cold* Sonnet agent can build the next UI
features without re-exploring the codebase. Each task is "wire a UI onto a backend
API that already exists, committed and typechecked." Read **only** the brief you're
assigned plus the **Shared context** section below — that is enough.

Pickup order recommended: **A (Search) → B (Comments) → C (Activity)**. Search is
the most self-contained; do it first to warm up on the conventions.

> ⚠️ The two **Opus-only** tasks (desktop always-on, offline) are at the bottom.
> **Do not start those as a Sonnet pickup** — they need an architecture decision
> first. They are listed here only so the boundary is explicit.

---

## Shared context (read once)

### Where things are
- **All UI for these tasks goes in `apps/www/src/shell/AppShell.tsx`** (document
  header lives at ~line 600–639). The header already hosts `VersionHistoryButton`
  and `SuggestionsReviewButton` — **copy those as your template.**
- Sidebar: `apps/www/src/shell/Sidebar.tsx`. It exposes
  `onSelectDocument(documentId: string)` for navigating to a doc — use this for
  Search results.
- Editor: `apps/www/src/shell/EditorView.tsx`. It already exposes
  `onSelectionChange({ anchor: number; head: number })` (ProseMirror positions,
  currently used for presence cursors) — reuse this for comment anchoring.
- Backend API namespace: `api.documents.*` from `@hubble.md/sync-backend`
  (defined in `packages/sync-backend/convex/documents.ts`). **The backend for all
  three tasks is done — do not modify it unless a brief explicitly says to.**

### Canonical UI pattern (copy this)
`VersionHistoryButton` at `apps/www/src/shell/AppShell.tsx:751` is the reference
implementation. Note the conventions it uses:
- `useQuery(api.documents.X, { documentId: documentId as Id<"documents"> })`
- `useMutation(api.documents.Y)`; call with `actor: testIdentity?.name ?? undefined`
- `Modal` from `@hubble.md/ui` (`import { AppShellFrame, Modal } from "@hubble.md/ui"`)
- `Id<"...">` types from the generated data model (already imported in the file)
- Tailwind uses **bracket utilities** for spacing, e.g.
  `[padding-block:0.25rem] [padding-inline:0.5rem]` — match the surrounding code,
  don't introduce a different spacing convention.
- A `useState(false)` `open` flag toggles the `Modal`.
- Date formatting: reuse `formatRevisionDate(ms)` (already in the file).

### Actor attribution
Test mode has no auth user, so attribute writes with `actor: testIdentity?.name`.
Pass `testIdentity` into your component the same way `VersionHistoryButton` receives
it (`testIdentity={testIdentity}` at the call site in the header).

### How to view your work (servers are already running)
- Convex (local anonymous): `http://127.0.0.1:3210` — port 3210
- Vite (`apps/www`): `http://localhost:5173`
- **Open:** `http://localhost:5173/?test=1` (skips login; uses the local backend +
  test workspace `jd72rs2kfn4gj8yeavk2m05ccs899r3t`).
- Direct doc link (has seeded revisions, good for testing in-doc UI):
  `http://localhost:5173/w/jd72rs2kfn4gj8yeavk2m05ccs899r3t/d/jn729fmj5ew46ygvykmst9vneh89b0a2?test=1`
- If a server isn't up: `pnpm dev:sync-backend` (Convex) and
  `pnpm --filter ./apps/www dev` (Vite).
- Seed data via the Convex CLI from `packages/sync-backend`, e.g.
  `npx convex run documents:createCommentThread '{...}'`.

### Verification (load-bearing — `pnpm check` is Biome-only, NOT a real check)
- `pnpm typecheck` — real TS check across all 6 TS packages. **Run this.**
- `pnpm --filter @hubble.md/www build` — web app build.
- `pnpm check` — Biome lint/format (run it, but it proves nothing about types).
- Then a human/visual pass in the browser at the URLs above.

### When done with a task
Follow the PROGRESS.md protocol: flip the task to `[x]` (or keep `[~]` if only
locally verified, per the repo's "unmerged" convention), fill `Landed`, and append
a dated Changelog line **in the same commit** as the code. Match the existing
changelog style.

---

## Task A — Cross-document Search UI  (Stage 6)  ⭐ start here

**Backend (done):** `api.documents.search`
```
search({ workspaceId: Id<"workspaces">, query: string, limit?: number })
  → Array<{ documentId, title, path?, updatedAt, updatedBy?, revision, snippet }>
```
Returns `[]` for an empty query; permission-filtered; default limit 20.

**Build:** a search affordance that lets the user type a query and jump to a
document.
- Recommended placement: a search input at the top of the **Sidebar**
  (`Sidebar.tsx`), or a header/command-palette-style box — your call, keep it
  simple and consistent with the existing sidebar styling.
- Debounce input (~200ms) before querying. Use
  `useQuery(api.documents.search, query.trim() ? { workspaceId, query } : "skip")`
  (the `"skip"` sentinel avoids querying on empty input).
- Render results: title, path, and `snippet` (the snippet already contains the
  matched context — render as plain text). Clicking a result calls
  `onSelectDocument(result.documentId)` to navigate.
- `workspaceId` is available where the Sidebar is rendered in AppShell
  (`workspace.snapshot.id`, passed as `workspaceId`).

**Out of scope:** full-text indexing, ranking, highlighting inside the editor.
It's a substring scan backend — don't over-build the frontend.

**Exit criteria:** typing a term that appears in a seeded doc shows results with
snippets; clicking one navigates to that document. `pnpm typecheck` + www build
clean.

**Seed/verify:** there are already several docs in the test workspace with body
text (e.g. "Reviewer notes", "Final sign-off", "Cursor Fix"). Search those strings.

---

## Task B — Comments UI  (Stage 5)

**Backend (done):**
```
listCommentThreads({ documentId })
  → Array<{ _id, documentId, anchor, createdBy, createdAt, resolvedAt?, resolvedBy?,
            comments: Array<{ _id, threadId, author, body, createdAt }> }>
createCommentThread({ documentId, anchor: any, body: string, actor? }) → threadId
replyToCommentThread({ threadId, body: string, actor? }) → commentId
resolveCommentThread({ threadId, actor? })
```
`@mention`s in a body are parsed server-side into notifications automatically — you
don't implement mention parsing, just let users type `@name` in the body.

**Build:** a comments surface for a document.
- Add a **"Comments"** button to the document header next to `History`
  (`AppShell.tsx` ~line 613), opening a `Modal` (or a side panel — Modal is the
  established pattern, prefer it for consistency).
- List threads newest-first (already sorted by backend). For each thread show its
  comments (author, body, relative time via `formatRevisionDate`), a reply input,
  and a **Resolve** button (hide/grey resolved threads).
- A "New comment" composer creates a thread. For the **anchor**: capture the
  current editor selection. The editor already surfaces `{ anchor, head }` via
  `onSelectionChange` in `EditorView.tsx` (used for cursors) — lift the latest
  selection up to the header (e.g. store it in state in the document view component
  that renders both `EditorView` and the header) and pass it as
  `anchor: { from: anchor, to: head }`. If no selection, pass
  `anchor: { from: 0, to: 0 }` (document-level comment) — acceptable for v1.

**Scope guidance (token/quality tradeoff):**
- **In scope (v1):** thread list, create/reply/resolve, anchor stored from
  selection, `@name` typed into body (notifications happen server-side).
- **Stretch (only if cheap):** render a highlight decoration on the anchored text
  range in the editor, and a `@mention` autocomplete dropdown. These touch the
  ProseMirror layer (`packages/ui` editor) and are genuinely harder — **do not let
  them block the v1 panel.** If they look non-trivial, ship v1 and note the stretch
  items as a follow-up `[~]` task in PROGRESS.

**Exit criteria:** can create a thread (with current selection as anchor), reply,
and resolve from the UI; threads persist across reload; `pnpm typecheck` + www
build clean. Verify in the browser with two doc views or by seeding via CLI.

---

## Task C — Activity feed UI  (Stage 5)

**Backend (done):**
```
listActivity({ documentId })
  → Array<{ _id, documentId, type, actor, message, createdAt, metadata? }>  (newest-first)
listNotifications({})  → per-user; REQUIRES an authed user (returns [] in ?test=1)
markNotificationRead({ notificationId })
```

**Build:** a per-document **Activity** panel.
- Add an **"Activity"** button to the document header (same pattern), opening a
  `Modal` that lists activity events: `message`, `actor`, and time
  (`formatRevisionDate(createdAt)`). Event `type` values include
  `document.restore`, `comment.thread`, `comment.reply`, `comment.resolve`,
  suggestion lifecycle, and patches — you can show `message` directly; optionally
  map `type` to a small icon/label.

**Notifications caveat (important):** `listNotifications` is keyed to the
authenticated Convex user and returns `[]` in `?test=1` mode (no auth user). So the
**notification bell is not demoable under `?test=1`.** Two honest options:
1. Build the activity panel now (fully demoable), and stub the notification bell
   behind the authenticated (non-test) flow, clearly noting it can't be verified in
   test mode this session; **or**
2. Build activity only and leave notification delivery as a follow-up `[~]` that
   needs an auth session. **Recommended: option 1 for activity + note the bell.**
Do not fake auth to make the bell light up — record the limitation honestly in the
task note, consistent with how the rest of PROGRESS.md documents skipped infra.

**Exit criteria:** activity panel lists events for a document (seed some by
restoring a revision or adding a comment first); `pnpm typecheck` + www build
clean.

---

## Opus-only — do NOT hand to Sonnet  (Stage 6, both `[ ]`)

These are the only two true `[ ]` tasks and the PROGRESS START HERE block flags
them as **design-shaped, not a cold pickup.** They need an architecture decision
*before* code, and they sit on the still-provisional Stage 1 foundation (offline is
unimplemented upstream in `prosemirror-sync`; see SPIKE.md for the Yjs/DO fallback).

1. **Desktop always-on app** — keep the Electron main process alive on window close
   (`window-all-closed`/`Tray`), host the live-doc watcher + sync engine in main
   (currently CLI-only), route external file changes to the **reconcile** path
   instead of conflict classification
   (`apps/desktop/src/externalFileChange.ts`, `apps/www/src/store/actions.ts`),
   with a `*.local-edit-<ts>` conflict-copy backstop.
   *Decision needed:* Electron lifecycle/tray model; where the watcher lives.

2. **Offline edit + merge on reconnect** — in-editor (CRDT local buffer/replay;
   **Yjs/`y-indexeddb` fallback if prosemirror-sync offline is insufficient** — this
   is the unresolved Stage 1 gate) and external-file (watcher queues edits, flushes
   on reconnect via reconcile).
   *Decision needed:* is prosemirror-sync offline enough, or do we fork to Yjs/DO?
   That is a foundational call — resolve it deliberately, not mid-implementation.

**Why separated:** these change the architecture and could trigger the
"fork-the-architecture" signal in SPIKE.md. Cheap, well-scoped UI work (A/B/C) for
Sonnet; expensive, irreversible foundation decisions for Opus.
