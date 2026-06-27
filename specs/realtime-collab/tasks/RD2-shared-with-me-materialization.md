# RD2 - Shared with Me Materialization

Assigned tier: **standard**.

Why: RD3 has already applied the `docShares.by_user` index on hosted dev, and
the remaining work is a bounded data-threading/materialization slice. It touches
Convex-facing query mapping, the sync package materializer, and desktop reactive
subscriptions, but it does not change auth policy, reconciliation semantics, or
the data-loss-sensitive rename/access-loss split from RD1.

## Objective

Populate a synced folder's top-level `Shared with me/` area from direct document
shares outside the signed-in user's workspaces.

Workspace-member documents continue to materialize under their workspace folder.
Direct shares for non-member workspaces materialize as flat markdown files under
`Shared with me/`, with role-based read-only flags and normal reconcile base
caches/index entries.

## Acceptance Criteria

- `documents.listSharedWithMe` returns enough display context for synced-folder
  filenames, including the source workspace name.
- `SyncBackend` exposes `getSharedWithMe()` through `@hubble.md/convex-client`.
- `materializeSyncedFolder()` writes shared documents under `Shared with me/`.
- The shared area is flat and filename-collision-safe.
- A workspace literally named `Shared with me` does not collide with the reserved
  shared area.
- Shared materialization writes the same reconcile base cache and reverse index as
  workspace-owned materialization.
- Role-based read-only behavior is preserved for shared commenter/viewer docs.
- Reactive cloud subscriptions include `documents.listSharedWithMe`, so new or
  removed direct shares materialize without manual refresh.

## Files and Directories

Primary:

- `packages/sync-backend/convex/documents.ts`
- `packages/convex-client/src/index.ts`
- `packages/sync/src/backend.ts`
- `packages/sync/src/types.ts`
- `packages/sync/src/sync.ts`
- `packages/sync/src/syncedFolder.test.ts`
- `apps/desktop/electron/syncedFolderService.test.ts`

Supporting:

- `apps/desktop/electron/liveSync.test.ts`
- `specs/realtime-collab/PROGRESS.md`

Avoid touching:

- Permission enforcement policy. RD4 owns the full auth audit.
- Offline queueing. RD6 owns durable queued reconcile.
- Release/feature-flag work. RD9/RD10 own packaging and merge gating.

## Implementation Guidance

1. Extend `documents.listSharedWithMe` only as needed for materialization context.
   Keep its existing non-member filtering so workspace-member documents do not
   double-list.
2. Add a shared projection type rather than overloading `LiveDocumentProjection`
   with fields that workspace materialization does not need.
3. Keep `Shared with me/` reserved before workspace folder names are disambiguated.
4. Store shared docs in the reverse index with their true `workspaceId`,
   `folderId: null`, current role, and content hash.
5. Use the same `writeReconcileBase()` path as normal synced-folder documents.
6. Subscribe directly to `documents.listSharedWithMe` alongside the workspace tree
   subscriptions introduced by RD1.

## Tests to Add or Update

- Sync materializer writes shared docs under `Shared with me/`.
- Shared docs get base cache metadata, reverse index entries, and read-only chmod.
- Filename collisions and the reserved `Shared with me` directory are stable.
- Desktop subscriber fake includes the shared-doc subscription path where needed.

## Verification

Run focused checks first:

```sh
pnpm --filter @hubble.md/sync test syncedFolder
pnpm --filter @hubble.md/desktop test syncedFolderService
pnpm --filter @hubble.md/convex-client typecheck
```

Then run the load-bearing checks:

```sh
pnpm typecheck
pnpm build:desktop
```

Convex deploy/typecheck can be re-run if generated API types or backend function
shape changes require it:

```sh
pnpm --filter @hubble.md/sync-backend exec convex codegen
pnpm --filter @hubble.md/sync-backend exec convex dev --once --typecheck enable
```

These Convex commands require a reachable deployment. Report any deployment
availability issue as a verification gap.

## Done Report

Return a short summary only:

- status: done / blocked
- files touched
- commands run and results
- shared-folder naming shape chosen
- any verification gaps or follow-up slices unblocked
