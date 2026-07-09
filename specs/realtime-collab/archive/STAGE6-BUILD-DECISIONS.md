# Stage 6 Build Decisions (settled 2026-06-25)

These three decisions were made with the human after the OFFLINE-DECISION.md and
DESKTOP-ALWAYS-ON.md design pass. They are **settled** — implementing agents build
to these, do not re-open them. They refine (do not contradict) Decision 6 in
DECISIONS.md.

## Decision A — Offline scope: BOTH flavors now, no Yjs fork
Per `OFFLINE-DECISION.md`: keep `@convex-dev/prosemirror-sync` + Convex as the single
realtime authority. Build **both** offline flavors in this push:
1. **External-file offline** — persistent on-disk watcher queue (in `.hubble`) that
   replays through the already-built reconcile path on reconnect. (Desktop track.)
2. **In-editor durable offline** — a thin IndexedDB persistence/replay layer on the
   package's own primitives so unsynced steps survive a reload-while-offline, and
   replay on reconnect. (Editor track.) The package ships a *read-only* dead cache
   (`getCachedState` reads `sessionStorage`, nothing writes it) — we provide the
   writer + durable store. Yjs stays a pre-stated contingency only.

## Decision B — On-disk model: DESIGNATED SYNCED FOLDER (Drive-for-Desktop)
A single user-chosen sync root (e.g. `~/Hubble`) is a **managed mirror** of the
user's cloud membership. The cloud CRDT is authoritative; the folder is an optional
local window so users can edit Live Documents in their own tools/agents.
- Structure mirrors cloud: one top-level folder per workspace, a `Shared with me/`
  area for individual doc shares, nested folders per the `folders` table.
- Every file maps to a stable `documentId` via an index under `.hubble` — identity
  is never inferred from the (mutable) path. Moving a file = "move document".
- Role = filesystem permission: commenter/viewer docs are chmod read-only on disk.
- **Bounded watch root:** the app only ever watches/writes inside the sync root.
  The user's real repos, Downloads, and legacy file-authoritative workspaces are
  never touched — this is what structurally rules out the authority-collision and
  real-file-clobber risks of watching the whole tree.
- Conflict backstop: `*.local-edit-<ts>` copy beside the file when a merge can't be
  applied, never an overwrite of the user's words.
- This SUPERSEDES the "path-agnostic / deferred on-disk path" assumption in
  DESKTOP-ALWAYS-ON.md and resolves Decision 6's deferred path question.
- Open sub-question deferred to the synced-folder design: whether creating a *new*
  local file inside a workspace folder creates a new Live Document (Drive-style) or
  whether new docs are created in-app and mirror down. Recommend supporting
  local-create, but it's a v1 scope call in `SYNCED-FOLDER.md`.

## Decision C — Always-on trigger: ONLY when a cloud workspace is connected
Background process + `Tray` (no quit on window close) **only** while a cloud
Live-Document workspace is connected. When no cloud workspace is connected, keep
today's quit-on-close behavior so purely-local users get no surprise background
process.

## Phase sequencing & track assignment
- **Phase 0 ✅ landed** (`c0d6ddf`): reusable reconciler extracted into `@hubble.md/sync`.
- **Track A — Desktop main process (sequential; touches `apps/desktop/electron/*`, desktop store, `packages/sync`):**
  - Phase 1 — Tray + always-on lifecycle (Decision C).
  - Phase 2 — Host the reconcile engine (`reconcileProjectionFile`) in main behind a manual trigger (IPC). No workspace-wide watcher yet.
  - Phase 3 — Synced-folder materialization + watcher + auto-reconcile (gated on `SYNCED-FOLDER.md`).
  - Phase 4 — Route Live-Doc external changes to reconcile, bypassing legacy conflict classification.
  - Phase 5 — `*.local-edit-<ts>` backstop + read-only chmod + external-file offline queue/flush.
  - Phase 6 — Status UI + pause/resume.
- **Track B — In-editor durable offline (parallel; touches the editor sync binding + a new IndexedDB module):** independent of Track A.
- **Track C — `SYNCED-FOLDER.md` design (doc only):** unblocks Track A Phase 3+.
