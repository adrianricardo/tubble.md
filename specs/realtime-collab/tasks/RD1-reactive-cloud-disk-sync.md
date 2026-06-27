# RD1 - Reactive Cloud-to-Disk Sync

Assigned tier: **premier**.

Why: this slice is cross-process, auth-sensitive, and data-loss-sensitive. It
touches the Electron main-process synced-folder service, live Convex
subscriptions, on-disk materialization, watcher self-write suppression, and the
direction split between local deletes and cloud access loss.

## Objective

Replace the synced-folder manual refresh seam with an authenticated Convex
subscription path that reacts to cloud changes and materializes them to disk
without user action.

The implementation must preserve the existing local-file reconcile behavior:
local external saves still go through `reconcileProjectionFile`, local
rename/move/delete events still route through the watcher, and cloud-origin
access loss is still the only materialize path that moves local bytes to
`.hubble/trash/`.

## Acceptance Criteria

- `SyncedFolderService.connect()` starts authenticated cloud subscriptions after
  the initial materialize pass and tears them down on disconnect/reconnect.
- Subscription updates cover the desired synced-folder data set:
  `sync.listWorkspaces`, per-workspace `folders.list`, and per-workspace
  `documents.listWithMarkdown`.
- Cloud changes trigger a debounced materialize pass, not a user-visible manual
  refresh requirement.
- Self-written projection changes from cloud materialization are suppressed by
  the watcher, so they do not feed back into `applyDocumentPatch`.
- The rename/access-loss interaction is fixed: if a local Finder rename/move has
  already re-keyed the index, a later subscription-triggered materialize must not
  treat the old path as access loss and move it to `.hubble/trash/`.
- Cloud-origin removal/access loss still preserves local bytes in
  `.hubble/trash/` and never calls `removeDocument`.
- Errors from subscriptions surface through `SyncedFolderStatus.lastError` and a
  synced-folder error event without leaving duplicate subscriptions running.
- Existing manual `refresh()` remains a safe fallback for Settings/manual refresh.

## Files and Directories

Primary:

- `apps/desktop/electron/syncedFolderService.ts`
- `apps/desktop/electron/syncedFolderService.test.ts`
- `packages/convex-client/src/index.ts`
- `packages/sync/src/sync.ts`
- `packages/sync/src/syncedFolderIndex.ts`
- `packages/sync/src/backend.ts`

Likely supporting files:

- `packages/convex-client/package.json`
- `packages/sync/src/index.ts`
- `packages/sync/src/syncedFolder.test.ts`
- `apps/desktop/electron/main.ts`
- `apps/desktop/src/desktopApi/types.ts`
- `specs/realtime-collab/READY-TO-DEPLOY.plan.md`
- `specs/realtime-collab/PROGRESS.md`

Reference:

- `specs/realtime-collab/PRODUCT.md`
- `specs/realtime-collab/TECH.md`
- `specs/realtime-collab/ORCHESTRATION-NOTES.md`
- `specs/realtime-collab/tasks/RD3-convex-schema-migration-deployment.md`

Avoid touching:

- Offline queue implementation. RD6 owns durable `.hubble/queue/` replay.
- `Shared with me/` materialization. RD2 owns that.
- Auth enforcement policy. RD4 owns the full audit; RD1 should only preserve and
  use the renderer-provided auth token for main-process subscription clients.

## Current Seams

- `SyncedFolderService.refresh()` explicitly documents itself as the polling
  fallback. It calls `#materialize()`.
- `#materialize()` calls `materializeSyncedFolder()`, fills inodes, seeds
  `#recentlyWrittenByUs`, saves the reverse index, then compares the new desired
  index against the previous index with `diffSyncedFolderIndex()`.
- `diff.removed` from `#materialize()` is treated as materialize-origin access
  loss and moved to `.hubble/trash/` by `#handleAccessLoss()`.
- `packages/convex-client/src/index.ts` already has `createConvexSubscriber()`,
  but it only subscribes to legacy files/assets and currently does not accept an
  auth token or expose live-document/folder/workspace subscriptions.
- `materializeSyncedFolder()` always recomputes the whole desired mirror and
  skips identical file rewrites, so RD1 can start with debounced full
  materialize-on-update before optimizing to per-document writes.

## Implementation Guidance

1. Extend the Convex subscriber abstraction so the Electron main process can
   create an authenticated live subscription client. Keep the existing legacy
   file/assets subscription API compatible unless callers are updated.
2. Add subscription methods for the synced-folder desired set. A practical shape:
   a workspace-list subscription plus per-workspace subscriptions for folders and
   live documents. Rebuild per-workspace subscriptions when the workspace list
   changes.
3. Inject the subscriber factory into `SyncedFolderServiceOptions` so tests do
   not talk to Convex.
4. In `connect()`, run the initial materialize first, flush the offline seam, then
   start subscriptions. On any subscription callback, debounce and call the same
   materialize fallback path.
5. Make the materialize removal logic direction-safe for local renames/moves:
   reconcile desired/current by `documentId` before treating a missing old path as
   access loss. If the document still exists in the desired index under a new
   path, re-key/update instead of trashing the old path.
6. Ensure disconnect/reconnect closes the subscriber and clears timers so updates
   from old auth tokens or old sync roots cannot materialize into the new root.
7. Keep comments on the "why" behind direction-sensitive code. This is exactly
   the kind of state machine where a short comment prevents future data loss.

## Tests to Add or Update

- Connect forwards `authToken` to both backend and subscriber factories.
- A subscription callback after connect calls materialize and updates the reverse
  index/on-disk markdown.
- Multiple rapid subscription callbacks coalesce into one materialize pass.
- Disconnect closes subscriptions and prevents later callbacks from writing.
- A cloud update that changes markdown is written to disk and self-write
  suppressed when the watcher sees the same hash.
- A local rename followed by a subscription-triggered materialize for the same
  `documentId` does not write `.hubble/trash/` and does not call
  `removeDocument`.
- A true access-loss/removal from the cloud desired set still writes
  `.hubble/trash/`, drops base cache/index, and never calls `removeDocument`.
- Subscription error sets service status error state and emits an error event.

## Verification

Run focused checks first:

```sh
pnpm --filter @hubble.md/desktop test syncedFolderService
pnpm --filter @hubble.md/sync test syncedFolder
```

Then run the load-bearing project checks:

```sh
pnpm typecheck
pnpm build:desktop
```

If `packages/convex-client` changes generated imports or Convex APIs, also verify
the hosted backend remains generated/typechecked:

```sh
pnpm --filter @hubble.md/sync-backend exec convex codegen
pnpm --filter @hubble.md/sync-backend exec convex dev --once --typecheck enable
```

Convex checks require a reachable deployment. If they cannot run, report that as
a verification gap rather than substituting `pnpm check`.

## Model-Tier Routing After RD1

- **Premier:** RD4 auth audit, RD5 doc-size/load gate, RD6 offline gate, RD8
  security review, RD10 flag-gated merge. These are architecture, security, or
  fork-risk decisions.
- **Standard:** RD2 shared-with-me materialization, RD7 two-device lock hardening,
  RD9 packaged release, RD11 monitoring, RD12 MCP server if kept. These are
  bounded once their dependencies are satisfied.
- **Economy:** no standalone RD slice is currently economy-tier. Economy is only
  appropriate inside a slice for mechanical copy/test-fixture/doc edits after a
  higher-tier agent has made the design decision.

## Done Report

Return a short summary only:

- status: done / blocked
- files touched
- commands run and results
- subscription shape chosen
- direction-safety decision for rename vs access loss
- any verification gaps or follow-up slices unblocked
