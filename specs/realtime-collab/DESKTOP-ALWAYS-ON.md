# Desktop Always-On App — Implementation Design (Stage 6, Decision 6)

Implementation-ready design + phased plan for making the Electron desktop app
"always-on" so it can reconcile external Live Document file edits into the cloud
CRDT in the background. **Design only — no production code here.**

Authoritative context: `DECISIONS.md` §6, `TECH.md` ("Bidirectional file
reconciliation", "Desktop lifecycle", "Code changes required" items 4–5),
`PROGRESS.md` Stage 6 "Desktop always-on app" `[ ]`.

---

## 1. Current state (what exists today, with citations)

### 1.1 Electron lifecycle — window-centric, no background, no tray

`apps/desktop/electron/main.ts`:

- **Single window model.** `createWindow()` (L917) builds one `BrowserWindow`,
  stored in module-global `mainWindow` (L100). `window.on("closed")` nulls it
  (L967).
- **`window-all-closed` quits everywhere except macOS** (L1359–1361):
  ```ts
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  ```
  On macOS the process technically survives a window close (OS convention), but
  there is **no Tray, no menubar affordance, and no way to reopen** except the
  Dock `activate` handler (L1363) which rebuilds a window. On Windows/Linux the
  app fully quits. So today there is effectively **no always-on background mode**.
- **Single-instance lock** already in place (L1318) with a `second-instance`
  handler (L1322) — important: the tray model must not fight this.
- **Watcher is renderer-driven and per-active-file only.** `desktop:watch-path`
  (L1206) creates a `chokidar` watcher with `depth: 0` scoped to the one open
  file; changes are pushed to the renderer via
  `desktop:watch-path:<watchId>` (L1212). Watchers live in `watchers` Map
  (L121) and are torn down by `desktop:unwatch-path` (L1244). **There is no
  workspace-wide watcher and no sync engine in main.**
- **No Convex client, no `@hubble.md/sync` dependency** in `apps/desktop`
  (`apps/desktop/package.json` dependencies — confirmed absent). The desktop app
  is filesystem-only; the `desktop:menu-sync-workspace` menu item (L605) just
  forwards an IPC event to the renderer. **All cloud sync / reconcile is
  CLI-only**, matching `TECH.md` item 4.
- IPC is registered in `registerIpc()` (L978); the renderer-facing surface is
  declared in `apps/desktop/electron/preload.ts` via `contextBridge` (L101) and
  typed by `apps/desktop/src/desktopApi/types`.

### 1.2 External-change handling — file-authoritative conflict classification

This is the path that must be **bypassed for Live Documents**:

- `apps/desktop/src/externalFileChange.ts` — `classifyFileChange()` returns
  `FileAction = "none" | "reload" | "conflict" | "match"` by comparing
  `editorContent` / `baseline` / `diskContent` (whole-file string equality).
- Consumers in `apps/desktop/src/store/actions.ts`:
  - `savePathContent()` (L379) runs a **preflight** classify before writing
    (L396); a non-`none` action aborts the save and surfaces the result via
    `applyFileAction`.
  - `handleExternalFileChange()` (L751) classifies a watcher-reported disk change
    and applies it.
- `apps/desktop/src/store/state.ts` `applyFileAction()` (L68): `conflict` sets
  `externalChange = { kind: "conflict", diskContent }` (a user-visible banner);
  `reload`/`match` adopt disk content.
- **Web app has a parallel implementation**: `apps/www/src/store/actions.ts` has
  its own `ChangeKind` classifier (L208–227) and conflict state (L603–607,
  `reloadFromRemote` L613). Same conflict-banner semantics, remote-content keyed.

The whole-file conflict-copy precedent lives in the sync engine:
`packages/sync/src/sync.ts` `toConflictName()` (L452) writes `*.conflict-<ts>`
on divergence (L134). The new backstop (`*.local-edit-<ts>`) mirrors this.

### 1.3 The reconcile engine to relocate into main (today: CLI-only)

The full reconcile loop already exists and is proven (Stage 4 + Stage 1 POC). It
is assembled from:

- **`packages/convex-client` `createConvexBackend(url)`** (`src/index.ts` L20) —
  wraps a `ConvexHttpClient` as a `SyncBackend`. Reusable from main as-is.
- **`packages/sync`**:
  - `writeLiveDocumentProjections()` (`sync.ts` L336) materializes Live Documents
    to `.hubble/projections/live-documents` **and writes the per-doc base cache**
    to `.hubble/state/live-documents/<id>.base.md` + `<id>.json`
    (`{ documentId, revision, path, role, canWrite, projectedAt }`, L369–388).
    Read-only `chmod` for viewers via `fs.setReadOnly` (L366–368).
  - `createNodeFileSystem()` (`fs-node.ts`) — `setReadOnly` = `chmod 0o444/0o644`
    (L48).
- **The reconcile driver — `packages/cli/src/index.ts` `runDocumentReconcile()`
  (L471)**, exposed as `hubble cloud document reconcile --id <id> --file
  <projection.md> [--watch]`. Per save it:
  1. `readReconcileBase()` (L438) loads `<id>.base.md` + `<id>.json`.
  2. Refuses if `metadata.canWrite === false` (L495).
  3. `changedRange(base, next)` (L409) — minimal prefix/suffix diff → `{ from,
     to, markdown }` (returns `null` on no-op).
  4. `api.documents.getForAgent` to re-check `canWrite` (L508–515).
  5. `api.documents.applyPatch` with `intent: { kind: "replace-range",
     baseMarkdown, from, to, markdown }`, `actor: "file-reconcile"` (L516–527) —
     this is the **rebasable scoped-patch** path (not whole-file replace).
  6. Writes the re-materialized `result.markdown` back to the projection file and
     updates the base cache via `writeReconcileBase()` (L447, L528–533).
  - `--watch` runs a `chokidar` watcher with a 250ms debounce (L544–551).

**The desktop "always-on" task is fundamentally: lift the `runDocumentReconcile`
logic out of the CLI and host it as a long-lived service in the Electron main
process, driven by a workspace-wide watcher, with lifecycle (tray) so it keeps
running with no window.** None of the cloud/CRDT logic changes; this is plumbing
+ lifecycle + routing.

---

## 2. Target architecture

### 2.1 Tray / lifecycle model (recommended)

**Model: "single always-on app; window is just a view."**

- Keep the existing single-instance lock and one `BrowserWindow`.
- Introduce an explicit **`isQuitting` flag** and a **`Tray`**. The app runs in
  two states: *window open* and *background (tray-only)*.
- `window-all-closed` becomes a **no-op when a workspace with Live Documents is
  connected** (do not `app.quit()`); the main process keeps the watcher + sync
  engine alive. Closing the window hides/destroys the window but leaves the
  process running, indicated by the tray icon.
- The **Tray menu** provides: "Open Hubble" (re-create/focus window via the same
  `createWindow()` / `activate` path), a sync-status line ("Syncing N
  documents", "Paused", "Offline"), "Pause/Resume background sync", and "Quit
  Hubble" (sets `isQuitting = true`, tears down watchers + Convex client, then
  `app.quit()`).
- `app.on("before-quit")` sets `isQuitting`; the window `close` handler checks
  it: if not quitting and background mode is active, `event.preventDefault()` +
  `window.hide()` (macOS) or destroy-but-keep-process (Win/Linux) so the tray is
  the only quit path. macOS `activate` already recreates the window (L1363).
- **Escape hatch / opt-out:** if no workspace is connected to cloud Live
  Documents, fall back to today's behavior (`window-all-closed` → quit on
  non-darwin) so a purely-local user is not surprised by a background process.

Rationale: this is the minimal change that satisfies `TECH.md` "Desktop
lifecycle (single always-on app)" — *"main process hosts the watcher + sync
engine and survives window close; system-tray indicator; quit only via
tray/menu; the renderer is just UI."* It reuses the existing single-window +
single-instance machinery rather than introducing a hidden second window.

### 2.2 Where the watcher + sync engine run

**In the main process**, as a new module `apps/desktop/electron/liveSync.ts` (a
`LiveSyncService`), started after `app.whenReady()` once a workspace is connected
and torn down on quit / workspace disconnect.

Responsibilities (a thin port of `runDocumentReconcile`, reusing shared
packages — `apps/desktop` gains a `@hubble.md/sync`, `@hubble.md/convex-client`,
`@hubble.md/sync-backend`, `convex` dependency set, mirroring the CLI):

1. **Backend**: `createConvexBackend(deploymentUrl)` from `@hubble.md/convex-client`.
2. **Projection + base-cache refresh**: call `writeLiveDocumentProjections()`
   from `@hubble.md/sync` on connect and on a periodic/realtime trigger so the
   base cache exists for every Live Document before reconcile can run.
3. **Workspace-wide watcher**: one `chokidar` watcher over the Live Document set
   (today's `desktop:watch-path` is `depth: 0` per active file — insufficient).
   Watch the projection/editable tree; on `change`, debounce (~250ms, matching
   CLI) and route to the reconcile path (§2.4).
4. **Reconcile per changed file**: the exact `runDocumentReconcile` inner steps
   — `readReconcileBase` → `changedRange` → `getForAgent` canWrite check →
   `applyPatch({ kind: "replace-range" })` → write back + `writeReconcileBase`.
5. **Status + offline queue hooks**: emit status to the tray and renderer; on
   network failure, enqueue the changed file (see §4 — offline-dependent, kept
   behind a seam).

**Refactor to avoid copy-paste:** extract the reconcile core
(`changedRange`, `readReconcileBase`, `writeReconcileBase`, the
apply-one-file routine) out of `packages/cli/src/index.ts` into a reusable
`packages/sync` export (e.g. `reconcileProjectionFile()` /
`createLiveDocumentReconciler()`). Then **both** the CLI command and the desktop
`LiveSyncService` call the same function. This keeps CLI and desktop behavior
identical and is the single most valuable structural change in this work.

### 2.3 IPC surface (main ⇄ renderer)

The renderer becomes "just UI" for sync; main owns the engine. New IPC
(registered in `registerIpc()`, exposed in `preload.ts`, typed in
`src/desktopApi/types`):

- `desktop:live-sync:connect` `(workspacePath, deploymentUrl, workspaceId)` →
  start `LiveSyncService`.
- `desktop:live-sync:disconnect` `(workspacePath)` → stop service.
- `desktop:live-sync:status` `()` → `{ state: "idle"|"syncing"|"offline"|"paused",
  pending: number, lastReconciledAt, lastError }` (pull, parallels
  `desktop:get-update-state` L1282).
- `desktop:live-sync:pause` / `:resume`.
- **Push event** `desktop:live-sync:event` → `{ documentId, path, kind:
  "reconciled"|"conflict-backstop"|"read-only-rejected"|"error", revision? }` so
  the renderer can clear/refresh the open editor and show toasts. Mirrors the
  existing `desktop:update-state` push (L692) and `sendToRenderer` helper (L491).
- `desktop:live-sync:is-live-document` `(absPath)` → `boolean` (renderer asks
  before applying legacy conflict classification — see §2.4).

The renderer keeps its existing per-file `watchPath` for **non-Live** documents
only; Live Documents are owned by the main-process watcher.

### 2.4 Routing: reconcile vs. legacy conflict classification

The core behavioral change. A disk change to a path must be classified as
**Live Document → reconcile (no conflict file)** or **legacy file → existing
`classifyFileChange`**.

**How a Live Document is identified on disk:** the **base-cache index** is the
registry. `.hubble/state/live-documents/<documentId>.json` already records
`{ documentId, revision, path, canWrite }` for every projected Live Document
(`sync.ts` L376, CLI `writeReconcileBase` L457). The service builds an in-memory
map **`absolutePath → { documentId, canWrite }`** by reading that directory on
connect and keeping it current as projections refresh. A path is a Live Document
iff it resolves to an entry in that map. This deliberately **does not hardcode a
location**, so it stays compatible with the still-open Decision 6 question
("on-disk path for the editable projection: normal tree vs. dedicated location —
deferred"). Whatever path the projection writer chooses, the base-cache index is
the source of truth.

**Routing decision (main process owns it):**

- On a watcher `change`, the `LiveSyncService` looks up the path in the
  Live-Document map.
  - **Hit** → run the reconcile path (§2.2 step 4). The renderer's legacy
    `classifyFileChange` / `applyFileAction` is **never** invoked for this file;
    no `*.conflict-<ts>` is written. After a successful reconcile, main pushes
    `desktop:live-sync:event { kind: "reconciled" }` and the renderer adopts the
    re-materialized `result.markdown` (the editor reloads cleanly — no banner).
  - **Miss** → forward to the renderer as today (`handleExternalFileChange`,
    `classifyFileChange`), preserving file-authoritative behavior for Plain
    Folder / Loose File / Workspace docs (unchanged per Decision 1 scope).
- The **renderer save preflight** (`savePathContent` L396) must also branch: for
  a Live Document, skip `classifyFileChange` and let main's watcher pick up the
  write and reconcile it. (Simplest: renderer calls
  `desktop:live-sync:is-live-document` before its preflight; if true, write and
  return without conflict logic.)
- **Web app (`apps/www/src/store/actions.ts`)**: same routing intent — Live
  Documents already render through the cloud CRDT (`useTiptapSync`), so the web
  editor should **not** run its `ChangeKind` classifier for Live Documents at
  all. This file's classifier stays for legacy file-authoritative web docs only.

### 2.5 The `*.local-edit-<ts>` conflict-copy backstop

The reconcile path is normally conflict-free (diff → operations, CRDT merge).
The backstop fires only when reconcile **cannot be safely scoped** (mirrors
`TECH.md` "Backstop" and the existing `*.conflict-<ts>` precedent):

- Trigger conditions (each is an existing failure point in `runDocumentReconcile`):
  1. **Base cache missing/stale** — `readReconcileBase` returns `null` (CLI
     L490). Today the CLI throws; the desktop service must instead write a
     backstop copy.
  2. **`applyPatch` rejects on stale `baseRevision`** (the server rebase/reject
     path) and a re-fetch + re-diff still fails to apply cleanly.
  3. **markdown→steps conversion fails / out-of-range mapping** (the fidelity
     ceiling — tables, frontmatter, custom nodes).
- Backstop action: write the on-disk version to `<name>.local-edit-<ts><ext>`
  (a sibling of `toConflictName` in `packages/sync/src/sync.ts`, e.g.
  `toLocalEditName()`), then **re-materialize the authoritative doc** into the
  projection path and refresh the base cache — **never silently clobber**. Emit
  `desktop:live-sync:event { kind: "conflict-backstop" }` so the renderer can
  toast "Saved your local edit as <file>; reloaded the live version."
- **Permissions:** read-only docs (`canWrite === false`) never reach reconcile —
  the projection is `chmod 0o444` (sync.ts L368) and the service refuses before
  calling `applyPatch` (CLI L495). A viewer's external edit, if forced, becomes a
  `read-only-rejected` event + backstop copy, never a server write.

---

## 3. Phased implementation plan

Each phase is independently shippable and verified with `pnpm typecheck`,
`pnpm build:desktop`, and unit tests (`vitest`). Note: `pnpm check` is
Biome-only and does **not** typecheck (per PROGRESS START-HERE).

### Phase 0 — Extract a reusable reconciler (no behavior change)

Pull the CLI reconcile core into `@hubble.md/sync` so CLI + desktop share it.

- **Touches:**
  - `packages/sync/src/reconcile.ts` (new): `changedRange`, `readReconcileBase`,
    `writeReconcileBase`, `toLocalEditName`, and
    `reconcileProjectionFile(backend, fs, { documentId, projectionPath,
    workspacePath, actor })` returning a typed result/`"no-op"`/`"backstop"`.
  - `packages/sync/src/index.ts` — export it.
  - `packages/cli/src/index.ts` — `runDocumentReconcile` calls the shared fn
    (delete the local copies at L409/L438/L447/L471 inner body).
- **Verify:** `pnpm --filter @hubble.md/sync build` + `@hubble.md/cli` build;
  new `packages/sync/src/reconcile.test.ts` (unit-test `changedRange`,
  `toLocalEditName`, backstop selection with a fake `SyncBackend` + in-memory
  `FileSystem`); `pnpm typecheck`. CLI reconcile behavior must be unchanged.

### Phase 1 — Tray + always-on lifecycle (no sync yet)

Make the app survive window close behind a tray, gated on a feature flag /
connected workspace.

- **Touches:** `apps/desktop/electron/main.ts` (add `Tray`, `isQuitting`,
  rewrite `window-all-closed` L1359 + window `close` handler L960, tray menu →
  reuse `createWindow`/`activate`), a small `apps/desktop/electron/tray.ts`,
  tray icon asset. `preload.ts` + `src/desktopApi/types` if a "quit to tray"
  toggle is surfaced.
- **Verify:** `pnpm build:desktop`; manual smoke (close window → process alive,
  tray reopens window, Quit exits). No renderer behavior change.

### Phase 2 — Host the reconcile engine in main (manual trigger)

Add the Convex client + `LiveSyncService` skeleton in main, wired to the shared
reconciler, triggered explicitly (no auto-watch yet).

- **Touches:** `apps/desktop/package.json` (+`@hubble.md/sync`,
  `@hubble.md/convex-client`, `@hubble.md/sync-backend`, `convex`);
  `apps/desktop/electron.vite.config.ts` (`externalizeDepsPlugin` exclude list if
  any of these must be bundled); `apps/desktop/electron/liveSync.ts` (new);
  `main.ts` (`registerIpc` → `desktop:live-sync:connect/disconnect/status`);
  `preload.ts` + `src/desktopApi/types`.
- **Verify:** `pnpm build:desktop`, `pnpm typecheck`; unit test the service's
  pure routing/index-building logic against a fake backend.

### Phase 3 — Workspace-wide watcher + auto-reconcile

Replace per-file watching for Live Documents with a service-owned watcher.

- **Touches:** `apps/desktop/electron/liveSync.ts` (chokidar over the projection
  tree, 250ms debounce, base-cache index `absPath → {documentId, canWrite}`,
  call `reconcileProjectionFile` per change); `main.ts` push
  `desktop:live-sync:event`; `preload.ts` + types.
- **Verify:** `pnpm build:desktop`, `pnpm typecheck`; unit test index lookup +
  debounce dispatch; manual: external save → cloud doc updates, no conflict file.

### Phase 4 — Routing: bypass legacy conflict classification for Live Docs

Make renderer + web defer to reconcile for Live Documents.

- **Touches:** `apps/desktop/src/store/actions.ts` (`savePathContent` L396
  preflight branch, `handleExternalFileChange` L751 branch via
  `desktop:live-sync:is-live-document`); `apps/desktop/src/externalFileChange.ts`
  (no logic change — it simply stops being called for Live Docs);
  `apps/www/src/store/actions.ts` (skip `ChangeKind` classifier L208 for Live
  Documents). Add `desktop:live-sync:is-live-document` IPC.
- **Verify:** `pnpm typecheck`, `@hubble.md/www` build, `pnpm build:desktop`;
  extend `externalFileChange.test.ts` is N/A (logic unchanged) — add a routing
  unit test for the "is live document → skip classify" branch.

### Phase 5 — `*.local-edit-<ts>` backstop + read-only handling

Wire the backstop into the service for the three failure modes (§2.5).

- **Touches:** `packages/sync/src/reconcile.ts` (`toLocalEditName`, backstop
  result); `apps/desktop/electron/liveSync.ts` (on backstop: write copy,
  re-materialize, refresh base cache, emit event); `main.ts`/renderer toast for
  `conflict-backstop` / `read-only-rejected`.
- **Verify:** `pnpm typecheck`, `pnpm build:desktop`; unit test backstop file
  naming + the three trigger paths with a fake backend (missing base, stale
  revision reject, conversion error). Manual: corrupt base cache → `.local-edit`
  copy appears, live version reloads, no data loss.

### Phase 6 — Status UI + pause/resume (polish)

Tray + renderer status surface.

- **Touches:** `main.ts`/`tray.ts` (status line, pause/resume), renderer status
  indicator + toasts consuming `desktop:live-sync:event`/`:status`.
- **Verify:** `pnpm build:desktop`, `pnpm typecheck`; manual smoke.

---

## 4. Open questions / risks

### Hard dependency on the separate "offline decision" (flagged)

`DECISIONS.md` "Current Open Decisions → Offline" and Stage 6 "Offline edit +
merge" `[ ]` define **external-file offline edits: watcher queues edits and
flushes on reconnect via the reconcile path.** That queue/flush policy
(persistence format, ordering, conflict-on-flush, retry/backoff) is **owned by
the offline decision doc and must not be designed here.** This plan stays
compatible by:

- Treating offline as a **seam** in `LiveSyncService`: a single
  `enqueue(changedFile)` / `flush()` boundary. Phases 0–6 above implement the
  **online** path (reconcile while connected) and leave `enqueue` as a no-op /
  in-memory stub. When the offline decision lands, only that seam changes — tray
  status already exposes an `"offline"` state and `pending` count for it to fill.
- **What is independent and can proceed now:** tray/always-on lifecycle (Phase
  1), watcher-in-main (Phases 2–3), reconcile routing + backstop (Phases 4–5).
  None of these require the offline policy.
- **What must wait for the offline decision:** durable queue persistence,
  flush-on-reconnect ordering, and any "queued external edits survive app
  restart" guarantee.

### Risks / questions needing the human's call

1. **On-disk projection path (Decision 6 "Open", deferred).** Normal workspace
   tree vs. dedicated `.hubble/projections/live-documents`. This design is
   path-agnostic (base-cache index is the registry), but the watcher scope and
   the "edit the file in your normal tree" UX depend on the answer. **Needs the
   product call before Phase 3 finalizes the watch root.**
2. **Foundational provisional gate.** prosemirror-sync **offline ❌** and
   **doc-size ⚠️** are still open (PROGRESS START-HERE, SPIKE.md). The reconcile
   *online* path is locally proven; a Yjs/DO fallback would change the transport
   under `LiveSyncService` but not the tray/watcher/routing structure. Keep the
   backend behind `createConvexBackend` so a fallback is swappable.
3. **Background process expectations / opt-out.** Should a purely-local user ever
   get a background process? Recommended: **only** run always-on when a workspace
   is connected to cloud Live Documents; otherwise keep today's quit-on-close.
   Confirm this default and whether macOS should hide-to-tray vs. hide-to-dock.
4. **Single-instance + tray interaction.** The existing `second-instance` handler
   (main.ts L1322) assumes a live `mainWindow`; with background mode the window
   may be destroyed. The reopen path must recreate it (reuse `activate` L1363).
   Low risk, but must be covered in Phase 1.
5. **Watcher feedback loop.** Reconcile writes `result.markdown` back to the
   projection file (CLI L528), which the watcher will see as a change. The CLI
   relies on `changedRange` returning `null` (no-op) for an identical write; the
   service must apply the same self-write suppression (ignore the write it just
   made) to avoid a reconcile loop. Verify in Phase 3.
6. **Two parallel classifiers.** Desktop (`externalFileChange.ts`) and web
   (`apps/www/src/store/actions.ts`) duplicate conflict logic. Phase 4 only
   *bypasses* them for Live Docs; it does not unify them. Flag whether to unify
   later (out of scope here).
```
