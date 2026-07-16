# Synced Folder — On-Disk Mirror Design (Stage 6, Decision B / Track C)

> **Historical implementation foundation (2026-07-11):** The target desktop behavior
> is now `/specs/desktop-cloud-workspace/PRODUCT.md`, with a commit-pinned migration plan
> in its sibling `TECH.md`. Do not treat this document's single global sync root,
> app-running assumptions, immediate delete behavior, or parallel local-authority modes
> as current product intent. Reuse its reconcile primitives only after the new plan's
> startup-drift and operation-safety gates are satisfied. ADR-0010 records the
> superseding authority model.

Implementation-ready design for the **designated synced folder** model: a single
user-chosen sync root (e.g. `~/Hubble`) that is a managed, Drive-for-Desktop-style
mirror of the user's cloud Live-Document membership. **Design only — no production
code here.** This doc unblocks desktop Track A Phases 3–5.

Authoritative context this builds to:
- `STAGE6-BUILD-DECISIONS.md` **Decision B** — the synced-folder model (settled).
- `DECISIONS.md` **§6** (editable inputs / bidirectional reconcile) and
  `docs/adr/0009-…` (authority models: Live Documents are cloud-authoritative;
  Workspace / Plain-Folder / Loose-File remain file-authoritative — **must not
  collide**).
- `DESKTOP-ALWAYS-ON.md` — the always-on desktop architecture this plugs into;
  this doc **resolves its Decision-6 "open on-disk path" question** (Risk #1) by
  fixing the path to the synced folder.
- `PRODUCT.md` — "Local files as editable inputs."

What already exists and is reused verbatim (grounding):
- `packages/sync/src/reconcile.ts` — `reconcileProjectionFile()`, `changedRange()`,
  `readReconcileBase()` / `writeReconcileBase()`, `toLocalEditName()`,
  `liveDocumentBaseCacheRoot()`. The reconcile core is **already extracted**
  (DESKTOP-ALWAYS-ON Phase 0 landed, `c0d6ddf`).
- `packages/sync/src/sync.ts` — `writeLiveDocumentProjections()` (materializer +
  base-cache writer + read-only chmod via `setReadOnly`).
- `packages/convex-client/src/index.ts` — `createConvexBackend()` →
  `getLiveDocuments` (over `api.documents.listWithMarkdown`),
  `getDocumentForAgent` (`api.documents.getForAgent`), `applyDocumentPatch`
  (`api.documents.applyPatch`).
- Convex queries/mutations in `packages/sync-backend/convex/`:
  `documents.listWithMarkdown / search / listTrash / restoreRemoved / remove /
  rename / importMarkdown`, `folders.list / listTrash / moveDocument /
  remove / restoreRemoved`, `sync.listWorkspaces / listWorkspaceMembers`.

---

## 0. Model in one paragraph

The cloud CRDT is authoritative. `~/Hubble` is an **optional local window** onto
the documents the signed-in user can already see in the cloud, laid out to mirror
cloud structure (workspaces → folders → docs, plus a `Shared with me/` area).
Every on-disk `.md` file is bound to a stable `documentId` through an **index under
`.hubble`**, never through its (mutable) path. The desktop main process keeps the
folder in sync **in both directions**: cloud changes are *materialized* down to
disk; on-disk saves are *reconciled* up via the already-proven base-cache-diff →
scoped-patch path. The watcher is **confined to the sync root** and never touches
the user's real repos, Downloads, or legacy file-authoritative workspaces — that
bounded watch root is the structural safety guarantee of Decision B.

---

## 1. Folder layout

One top-level folder per workspace the user belongs to (`sync.listWorkspaces`),
each containing the workspace's folder tree (`folders.list`, nested via
`parentId`) and its Live Documents (`documents.listWithMarkdown`, placed by
`folderId`). A sibling `Shared with me/` area holds documents granted to the user
through an individual `docShares` row in a workspace they are **not** a member of.
A hidden `.hubble/` directory at the root holds all state (index, base caches,
trash, queue) and is the *only* place Hubble writes metadata.

```
~/Hubble/                              ← sync root (user-chosen; the bounded watch root)
├── .hubble/                           ← all Hubble state; never a document, always ignored by mirror
│   ├── index/
│   │   ├── synced-folder.json         ← absPath → {documentId, workspaceId, folderId, inode, hash, role}
│   │   └── owner.json                 ← {deviceId, pid, heartbeatAt}  (single-writer lock, §6)
│   ├── state/live-documents/          ← per-doc base cache (existing format)
│   │   ├── <documentId>.base.md
│   │   └── <documentId>.json          ← {documentId, revision, path, role, canWrite, projectedAt}
│   ├── trash/                         ← tombstoned local copies on access-loss (§6)
│   └── queue/                         ← offline watcher queue (seam only; owned by offline decision)
│
├── Product Team/                      ← workspace folder  (workspaceId = ws_a)
│   ├── Roadmap.md                     ← Live Document, folderId = null (workspace root)
│   ├── Specs/                         ← folder  (folderId = f_specs, parentId = null)
│   │   ├── Realtime Collab.md         ← Live Document, folderId = f_specs   [editor → 0644]
│   │   └── Archive/                   ← folder  (folderId = f_arch, parentId = f_specs)
│   │       └── Old Plan.md            ← Live Document  [viewer → 0444 read-only]
│   └── Notes.md
│
├── Personal/                          ← second workspace folder (workspaceId = ws_b)
│   └── Journal.md
│
└── Shared with me/                    ← docShares to this user outside their workspaces
    └── Alice — Budget 2026.md         ← docShare(role=commenter) → 0444 read-only
```

Layout rules:
- **Workspace name → top folder.** Sanitize for the filesystem; collisions
  disambiguated with the workspace id suffix (kept in the index, not shown twice).
- **Folder tree → directories.** Built from `folders.list` by walking `parentId`.
  A document's directory = the path of its `folderId`; `folderId == null` →
  workspace root.
- **Document → `<title>.md`.** Filename derives from `documents.title`
  (sanitized), **not** from the free-form `documents.path` column. `path` stays
  authoritative *metadata* recorded in the index; the on-disk path is computed
  from `(workspace, folder tree, title)`. Sibling-title collisions get a ` (2)`
  suffix, tracked in the index.
- **`Shared with me/`** is flat by document (prefixed with the sharer/workspace
  name) because a non-member has no view of that workspace's folder tree.
- **Read-only by role.** `editor`/`owner` → `0644`; `commenter`/`viewer` →
  `0444`, exactly as `writeLiveDocumentProjections` already does via
  `fs.setReadOnly(path, canWrite === false)` (`sync.ts` L366–368).

### Backend gaps this layout exposes (must be filled before Phase 3 finalizes)

These are real, grounded gaps — the current queries don't return enough to build
the tree:

1. **`folderId` is dropped in the client mapper.** `documents.listWithMarkdown`
   returns the full row (`...document`, including `folderId`), but
   `convex-client/src/index.ts` `getLiveDocuments` (L56–66) and
   `LiveDocumentProjection` (`packages/sync/src/types.ts` L41) **do not carry
   `folderId`**. Thread it through both, or folders can't be mirrored.
2. **No folder fetch in `SyncBackend`.** Add `getFolders(workspaceId)` to
   `backend.ts` over the existing `api.folders.list` so the materializer can build
   the directory tree.
3. **No "shared with me" query, and no index to back one.** `documents.listShares`
   is **owner-scoped per document**; `listWithMarkdown` requires workspace
   membership, so a non-member's shared doc is unreachable. A new
   `documents.listSharedWithMe` is needed (auth user → their `docShares` →
   documents), **and** `docShares` needs a **`by_user` index** — the schema today
   only has `by_document`, `by_document_user`, `by_document_link`
   (`schema.ts` L76–78), so a per-user lookup would be a full scan. v1 may ship
   without `Shared with me/` (workspace folders only) and add this in a fast
   follow; the layout reserves the area either way.

---

## 2. Identity & index — path is mutable metadata

**The binding is `documentId`, the path is metadata.** Two indexes cooperate:

- **Forward (already exists): `documentId → {revision, path, role, canWrite}`** in
  `.hubble/state/live-documents/<documentId>.json` — written by
  `writeLiveDocumentProjections` (`sync.ts` L374–388) and refreshed by
  `writeReconcileBase` (`reconcile.ts` L133). This is the reconcile base cache.
- **Reverse (new): `absPath → {documentId, workspaceId, folderId, inode, hash, role}`**
  in `.hubble/index/synced-folder.json`. Built at materialization time, this is
  the registry the watcher consults to answer "is this path a Live Document, and
  which one?" — the same role the base-cache directory plays in DESKTOP-ALWAYS-ON
  §2.4, generalized to the whole sync root.

`inode` (from `fs.stat`) and `hash` (`contentHash` from `@hubble.md/sync`) are the
disambiguators for filesystem moves.

### Finder move / rename → "move document"

A path change is a **metadata** change, never an identity change:
- **Rename in place** (`Specs/Realtime Collab.md` → `Specs/RTC.md`): same dir,
  new basename. Resolve the old path in the index → `documentId` → call
  `documents.rename(documentId, title=<new basename>, path=<new rel path>)`.
- **Move across folders** (drag `Roadmap.md` into `Specs/`): new parent dir.
  Resolve `documentId` → find the target dir's `folderId` from the index/tree →
  call `folders.moveDocument(documentId, folderId)` and `documents.rename` to
  update `title`/`path`. Both mutations exist (`folders.ts` L111,
  `documents.ts` L1361). The index entry's key is rewritten to the new absPath;
  `documentId` is unchanged.
- **Move out of the sync root** (drag to `~/Desktop`): leaves the bounded watch
  root → treated as a **local delete** of the projection (see §6), not a cloud
  delete by default.

### Rename vs. delete+create disambiguation (watcher)

`chokidar` reports a move as `unlink(old)` then `add(new)` — never an atomic
"rename" event. The watcher correlates them in a short window:

1. On `unlink(P)` where `P` is in the index → **hold** the entry (don't act yet);
   start a correlation timer (~750ms).
2. On `add(Q)` within the window → compute `inode(Q)` and `hash(Q)`. If
   `inode(Q) === heldEntry.inode` (same physical file; true on macOS/Linux moves)
   **or** `hash(Q) === heldEntry.hash` (content identical) → classify as **rename/
   move** → run the move-document path above, re-key the index `P → Q`.
3. If the window expires with no matching `add` → classify `unlink(P)` as a real
   **local delete / access-loss** (§6).
4. An `add(Q)` with no held entry and no index hit → **local-create** candidate
   (§5).

This is the same self-write-suppression discipline DESKTOP-ALWAYS-ON §4.5 flags:
the reconciler's own write-back (`reconcileProjectionFile` L211) and the
materializer's writes are tagged in an in-memory `recentlyWrittenByUs` set
(absPath + mtime/hash) so they never re-enter classification as external edits.

---

## 3. Materialization — cloud → disk

### Which queries drive the mirror

| On-disk artifact            | Source query (via `SyncBackend`)                         |
|-----------------------------|----------------------------------------------------------|
| Top-level workspace folders | `sync.listWorkspaces` (member/owner filtered)            |
| Directory tree per workspace| `folders.list(workspaceId)` (new `getFolders`)           |
| Documents + markdown + role | `documents.listWithMarkdown(workspaceId)` (`getLiveDocuments`) |
| `Shared with me/`           | `documents.listSharedWithMe` (**new**, §1 gap 3)         |
| Trash reconciliation        | `documents.listTrash`, `folders.listTrash`               |
| Cross-doc search (Stage 6)  | `documents.search` — index-only, not materialized        |

The **materializer is a generalization of `writeLiveDocumentProjections`**
(`sync.ts` L336). Today it writes a flat tree keyed by `document.path` into
`.hubble/projections/live-documents`. For the synced folder it must instead:
- accept the **sync root** as `workspacePath`/`projectionRoot` (it already accepts
  a `projectionRoot` override, L347), so `.hubble/state` and base caches land at
  `~/Hubble/.hubble/...` — exactly where `reconcileProjectionFile`'s
  `liveDocumentBaseCacheRoot(workspacePath)` expects them (`reconcile.ts` L63);
- compute the **nested on-disk path** from `(workspaceName, folderTree[folderId],
  sanitize(title))` instead of `document.path ?? <id>.md` (L358);
- write/refresh **both** indexes (§2);
- keep its existing **read-only chmod** and base-cache writes unchanged.

Recommended: add `materializeSyncedFolder(backend, fs, { syncRoot })` next to
`writeLiveDocumentProjections` rather than overloading it, so the legacy
agent-projection tree and the new user-facing mirror stay independent.

### What runs when

- **On connect / startup** (after `app.whenReady()` once a cloud workspace is
  connected — Decision C gate): for each workspace from `listWorkspaces`, run the
  full materialize pass → create/update/remove local files, write both indexes and
  base caches. This is the precondition for any reconcile (the base cache must
  exist before a save can be diffed).
- **On cloud changes:** the desktop hosts a **Convex subscription** (the reactive
  `ConvexClient`, not just the one-shot `ConvexHttpClient` in `createConvexBackend`)
  on `listWithMarkdown` / `folders.list` / `listWorkspaces`. Each push triggers an
  incremental materialize diff: compute the desired file set vs. the index, then
  **add** new docs, **rewrite** changed markdown + base cache (suppressing the
  self-write), **chmod** on role change, **remove** docs that left the set (§6
  access-loss). Coalesce/debounce bursts (~250ms) to match reconcile cadence.
- **Role → permission** is applied on every materialize: `canWrite === false`
  (commenter/viewer) → `0444`; the reconciler additionally refuses these before
  ever calling `applyPatch` (`reconcile.ts` L183–185, re-checked against
  `getDocumentForAgent` L193–195), so a read-only doc can never be written up even
  if the OS chmod is bypassed.

---

## 4. Bounded watch root & isolation — the safety guarantee

**One watcher, rooted at the sync root, and nowhere else.** A single `chokidar`
watcher over `~/Hubble` replaces today's per-active-file `desktop:watch-path`
(`main.ts` L1206, `depth: 0`) **for synced-folder documents only**. It is
configured to:
- **ignore `~/Hubble/.hubble/**`** (state is not content),
- ignore dotfiles and editor scratch files (`.swp`, `~$`, `.tmp`, atomic-save
  temp names),
- only act on `.md` files.

Because the watch root *is* the sync root, the watcher **physically cannot** see
the user's real repos, Downloads, or legacy file-authoritative Workspace / Plain
Folder / Loose File trees — those live elsewhere on disk and are opened through
the renderer's existing per-file `watchPath`, which is left untouched. This is the
structural reason Decision B rules out the authority-collision and real-file-clobber
risks: **legacy file-authoritative paths are never under the bounded watch root, so
the Live-Document reconcile engine never runs on them, and the legacy whole-file
conflict engine never runs on Live Documents.** (ADR-0009 separation holds by
construction, not by a runtime flag.)

### Routing a change

On a debounced `change(P)` inside the sync root, the service looks up `P` in
`.hubble/index/synced-folder.json`:
- **Hit (Live Document)** → call
  `reconcileProjectionFile(backend, fs, { documentId, projectionPath: P,
  workspacePath: syncRoot, actor: "file-reconcile" })`. Outcomes
  (`reconcile.ts` L39–50):
  - `reconciled` → write-back already done by the reconciler; push
    `desktop:live-sync:event { kind: "reconciled" }`; refresh index hash. **No
    `*.conflict-<ts>` is ever written**, and the renderer's
    `classifyFileChange`/`applyFileAction` (`externalFileChange.ts`,
    `store/actions.ts` L751) is **never invoked** for this path.
  - `no-op` → ignore (identical content; also the self-write case).
  - `backstop("missing-base" | "read-only")` → host writes the
    `*.local-edit-<ts>` copy (§6) and re-materializes.
- **Miss, but inside a workspace folder** → **local-create** candidate (§5).
- **Miss, outside any workspace folder** (e.g. a stray file dropped at the root) →
  ignore; surface a gentle "not a synced location" hint, never reconcile.

The legacy conflict classifier in `externalFileChange.ts` and its web twin
(`apps/www/src/store/actions.ts` `ChangeKind`) keep running **only** for
non-synced, file-authoritative documents — unchanged. The two paths share no files
and no watch root.

---

## 5. Local-create question — **recommendation: support it in v1**

**Recommendation: a brand-new `.md` saved inside a workspace folder (not
`Shared with me/`) creates a new Live Document.** Identity is **server-assigned**.

Mechanism (reuses an existing, idempotent primitive):
- On a classified **local-create** (§2 step 4: `add(Q)`, no index hit, inside a
  workspace folder, `.md`, file stable for one debounce window):
  1. derive `workspaceId` from `Q`'s top folder and `folderId` from its directory
     (both in the index/tree);
  2. call `documents.importMarkdown({ workspaceId, path, title, markdown })`
     (`documents.ts` L1180). It **inserts a new document, assigns the
     `documentId`, and is idempotent on `(workspaceId, path)`** (L1194–1214) — so a
     replayed create or a races-with-materialize never double-creates;
  3. if the new doc isn't at the workspace root, follow with
     `folders.moveDocument(documentId, folderId)`;
  4. write the index + base cache for the returned `documentId`; the next
     materialize round-trips the canonical markdown back.

Why support it (rationale):
- It preserves Hubble's core identity — "make a file, it's a note" — which the
  whole product is built around (`PRODUCT.md`). A Drive-style mirror where you
  *can't* create by dropping a file would feel broken to existing users.
- The backend primitive already exists and is **idempotent by path**, which
  defuses the scariest failure (duplicate docs from replayed/atomic-save events).
- Identity stays server-authoritative (insert returns the id), consistent with
  "cloud is authoritative."

Guardrails (why it's safe to ship in v1):
- **Scope:** only inside a workspace folder, only `.md`, never in `Shared with
  me/` or `.hubble/`.
- **Debounce + stability:** wait until the file stops changing (editors write
  atomically via temp+rename; treat the final settled file as the create) to avoid
  importing half-written content.
- **Membership required:** `importMarkdown` calls `requireWorkspaceMember`
  (L1189) — a user who can't write the workspace simply gets a rejected create and
  a toast, never a silent failure.
- **Folder-create** (mkdir in a workspace) maps to `folders.create`; empty dirs
  can be lazily created on first doc move if we want to avoid noise. v1 may defer
  folder-create-from-disk and only mirror folders downward.

If the human wants the most conservative v1, the fallback is "new docs are in-app
only and mirror down" — but the recommendation is **support local-create**, gated
by the guardrails above.

---

## 6. Edge cases

1. **Access loss (cloud keeps the doc, user loses access).** Detected by
   *materialization*, not the watcher: the doc/folder leaves the desired set
   returned by `listWithMarkdown` / `listSharedWithMe` / `folders.list` while still
   existing in the cloud. Action: move the local file to `.hubble/trash/` (don't
   hard-delete the user's bytes), drop its index + base-cache entries, push a
   `removed-access` event. Crucially this is **direction-aware**: a disappearance
   seen *from the cloud query* is access-loss (remove locally, never call cloud
   `remove`); a disappearance seen *from the watcher* (local `unlink`) is a **local
   delete** → call `documents.remove(documentId)` (soft-delete, `documents.ts`
   L1384). Getting this direction wrong is the path to accidental data loss, so the
   two signals are kept strictly separate.

2. **Deletion / trash mapping.** Cloud trash (`documents.listTrash`,
   `folders.listTrash`) docs are **not** materialized (they're filtered out by
   `deletedAt`). The materializer distinguishes cloud Trash from access loss:
   cloud Trash removes a clean managed copy, while access loss keeps a backstop in
   `.hubble/trash/`. **Restore** (`documents.restoreRemoved` /
   `folders.restoreRemoved`) re-adds the document to the desired set; the next
   materialize recreates it after a no-write collision preflight. A **local
   delete** persists a stable device-local operation before calling
   `documents.remove`, then exposes durable Undo through the desktop and cloud
   Trash. Offline, bulk, read-only, or unavailable-root deletions remain review
   operations without cloud mutation. Approved batches are capped at 25 documents
   per coordinator call.

3. **`*.local-edit-<ts>` backstop placement.** `reconcileProjectionFile` returns
   `{ status: "backstop", reason }` for `missing-base` / `read-only`; the
   **host** (`apps/desktop/electron/liveSync.ts`, Phase 5) turns that into:
   write the on-disk bytes to `toLocalEditName(projectionPath)` (`reconcile.ts`
   L108 — a **sibling in the same workspace folder**, so the user sees their copy
   next to the doc), then re-materialize the authoritative markdown over the
   projection and refresh the base cache. **Never a silent clobber.** This mirrors
   the legacy `*.conflict-<ts>` precedent (`sync.ts` `toConflictName`) but for the
   Live-Document path. Read-only docs never reach `applyPatch` (double-checked at
   `reconcile.ts` L183 and L193).

4. **Two devices, same sync root.** The dangerous case: `~/Hubble` itself sits in
   iCloud/Dropbox or is shared between two machines, so two reconcilers and two
   `.hubble/state` caches collide and double-write. Mitigation: a **single-writer
   lock** at `.hubble/index/owner.json` (`{deviceId, pid, heartbeatAt}`) with a
   heartbeat; on startup, if a *fresh* heartbeat from another `deviceId` is
   present, the second instance refuses to run the watcher/materializer and shows
   "Hubble is already syncing this folder on <device>." v1 = detect-and-refuse;
   true multi-device-same-root is out of scope (each device should pick its own
   sync root).

5. **First-run on an existing non-empty folder.** Don't blast user files. If the
   chosen sync root is non-empty and not already a Hubble root (no
   `.hubble/index`), refuse-by-default and offer two explicit choices: (a) pick/
   create an empty subfolder, or (b) **import** existing `.md` into the cloud via
   the existing `importLiveDocuments` path (`sync.ts` L396, idempotent by path)
   before turning on the mirror. Never auto-materialize over unknown files.

6. **Watcher feedback loop & atomic saves.** Reconcile and materialize both write
   `.md` files the watcher will observe. Suppress via the `recentlyWrittenByUs`
   set (§2) plus `changedRange`/`changedMarkdownRange` returning `null` on
   identical content (`reconcile.ts` L95). Editor atomic-save (temp file + rename)
   is the most common false "rename" — handled by the §2 unlink/add correlation
   restricted to **indexed** paths and the dotfile/temp ignore globs.

---

## 7. Phased implementation plan (desktop Phases 3–5)

Builds on DESKTOP-ALWAYS-ON Phases 0 (landed), 1 (tray), 2 (`LiveSyncService`
skeleton + Convex client in main). Verified with `pnpm typecheck`,
`pnpm build:desktop`, and `vitest` (note: `pnpm check` is Biome-only, no typecheck).

### Phase 3 — Synced-folder materialization + bounded watcher + auto-reconcile

The first slice. Stand up the mirror and the one-way-and-back loop.

- **Backend plumbing (thread folders through):**
  - `packages/sync/src/types.ts` — add `folderId` to `LiveDocumentProjection`.
  - `packages/convex-client/src/index.ts` — carry `folderId` in `getLiveDocuments`
    (L56); add `getFolders(workspaceId)` over `api.folders.list`.
  - `packages/sync/src/backend.ts` — add `getFolders` to `SyncBackend`.
- **Materializer:**
  - `packages/sync/src/sync.ts` — add `materializeSyncedFolder(backend, fs,
    { syncRoot })`: build folder tree, compute nested on-disk paths, write files +
    both indexes + base caches, apply read-only chmod (reuse existing
    `setReadOnly` logic). Export from `packages/sync/src/index.ts`.
  - `packages/sync/src/syncedFolderIndex.ts` (new) — read/write/diff
    `.hubble/index/synced-folder.json`; `absPath ↔ documentId`; inode+hash capture.
- **Desktop service & watcher:**
  - `apps/desktop/electron/liveSync.ts` — `chokidar` over `syncRoot` (ignore
    `.hubble/**`, dotfiles, non-`.md`), 250ms debounce, `classify(change)` →
    `reconcileProjectionFile` on index hit; reactive Convex subscription →
    incremental materialize; `recentlyWrittenByUs` suppression; single-writer lock.
  - `apps/desktop/electron/main.ts` — extend `registerIpc()` with
    `desktop:live-sync:connect(syncRoot, deploymentUrl)` /`:disconnect`/`:status`;
    push `desktop:live-sync:event`. `preload.ts` + `src/desktopApi/types` for the
    surface.
- **Verify:** unit-test `syncedFolderIndex` diff and `classify` (rename vs.
  delete+create vs. create) with an in-memory `FileSystem` + fake `SyncBackend`;
  `materializeSyncedFolder` tree-building test. Manual: connect → tree appears;
  external save → cloud updates, **no conflict file**; rename file → `documents.
  rename`; move file → `folders.moveDocument`.

### Phase 4 — Routing isolation (bypass legacy classification for synced docs)

Make the renderer + web defer entirely to the synced-folder engine.

- **Touches:** `apps/desktop/src/store/actions.ts` — `savePathContent` (L379)
  preflight and `handleExternalFileChange` (L751) branch on
  `desktop:live-sync:is-live-document(absPath)` (new IPC, answered from the
  index); if synced → write and return, no `classifyFileChange`.
  `apps/desktop/src/externalFileChange.ts` — unchanged logic, simply not called
  for synced docs. `apps/www/src/store/actions.ts` — skip `ChangeKind` (L208) for
  Live Documents (already cloud-CRDT-rendered).
- **Verify:** `pnpm typecheck`, `@hubble.md/www` build, `pnpm build:desktop`; unit
  test the "is-live-document → skip classify" branch. Confirm a synced doc never
  produces `*.conflict-<ts>` and a legacy doc still does.

### Phase 5 — Backstop + access-loss/trash + read-only enforcement

Wire the safety nets and the direction-aware removal.

- **Touches:** `apps/desktop/electron/liveSync.ts` — on `backstop`: write
  `toLocalEditName` copy, re-materialize, refresh base cache, emit
  `conflict-backstop`/`read-only-rejected`; implement access-loss (cloud-driven →
  `.hubble/trash`, never cloud-delete) vs. local-delete (`documents.remove`)
  split; trash restore via materialize. `packages/sync/src/reconcile.ts` —
  reuse `toLocalEditName` (already present); add a `backstop` host helper if
  shared with CLI. `main.ts`/renderer — toasts for backstop/read-only/removed
  events.
- **Verify:** unit-test the three backstop triggers (missing base, read-only
  refusal, stale-revision reject) and the access-loss direction split with a fake
  backend. Manual: corrupt a base cache → `.local-edit` sibling appears, live
  version reloads, zero data loss; revoke a share → file moves to `.hubble/trash`,
  cloud doc untouched.

> Offline (queued watcher edits flushed on reconnect) stays a **seam** in
> `liveSync.ts` (`enqueue`/`flush` no-ops, `.hubble/queue/` reserved) and is owned
> by the offline decision — not designed here, per STAGE6-BUILD-DECISIONS
> Decision A.

---

## 8. Summary of required net-new backend work (so Phase 3 isn't blocked mid-flight)

- `LiveDocumentProjection.folderId` + carry it in `convex-client` (trivial).
- `SyncBackend.getFolders` over existing `api.folders.list` (trivial).
- `documents.listSharedWithMe` query **+ a `by_user` index on `docShares`**
  (`schema.ts`) — needed only for `Shared with me/`; may slip to a fast follow,
  with the area reserved in the layout.

Everything else (materialize, reconcile, rename/move, trash, chmod, create) is
built on functions that **already exist and are proven** in `packages/sync`,
`packages/convex-client`, and the Convex `documents`/`folders` modules.
