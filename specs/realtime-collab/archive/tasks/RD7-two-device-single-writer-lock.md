# RD7 - Two-Device Single-Writer Lock Hardening

**Tier:** standard
**Depends on:** RT done
**Status:** landed locally

## Goal

Harden the synced-folder `owner.json` lock for the real-world case where the
chosen sync root itself lives in iCloud, Dropbox, or another shared folder. v1 is
detect-and-refuse: only one Hubble process may watch/materialize/reconcile a root
at a time, and a second fresh owner must stop the local engine rather than start a
write fight.

## Implementation

- `acquireSingleWriterLock` already refuses a fresh foreign owner and reclaims a
  stale owner.
- `heartbeatSingleWriterLock` now performs the same ownership check before writing
  heartbeat data. It refuses to overwrite a fresh foreign owner and only writes
  when the lock is free, stale, or still owned by this device.
- `SyncedFolderService` treats heartbeat lock loss as a terminal sync error for
  the connected root: it stops cloud subscriptions, watcher/timers, and drops the
  backend handle so later materialize calls cannot write into a folder now owned by
  another device.

## Acceptance

- Fresh foreign owner at connect time refuses with the existing "already syncing"
  status path.
- Fresh foreign owner appearing after connect is preserved on disk; this process
  does not overwrite it.
- Heartbeat lock loss emits an error, sets status to error, closes subscriptions,
  and prevents manual refresh from materializing.
- Stale foreign heartbeat remains reclaimable.

## Verification

```bash
pnpm --filter @hubble.md/desktop test -- syncedFolderClassify.test.ts syncedFolderService.test.ts
pnpm exec biome check apps/desktop/electron/syncedFolderClassify.ts apps/desktop/electron/syncedFolderService.ts apps/desktop/electron/syncedFolderClassify.test.ts apps/desktop/electron/syncedFolderService.test.ts
pnpm typecheck
pnpm build:desktop
```

## Out of Scope

- True multi-device-same-root support. Each device should still pick its own sync
  root.
- Distributed locking stronger than the shared `owner.json` heartbeat. RD7 only
  hardens the v1 detect-and-refuse lock already chosen in `SYNCED-FOLDER.md`.
- Packaged release and install smoke. RD9 owns that.
