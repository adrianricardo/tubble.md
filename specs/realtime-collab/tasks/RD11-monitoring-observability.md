# RD11 - Monitoring / Observability / On-Call

Assigned tier: **standard**.

Status: **landed locally 2026-06-28**.

## Objective

Give the synced-folder release path local operational visibility before adding
external alerting. The v1 production build should expose enough structured status
to see reconcile health, backstop rate, read-only rejects, offline queue depth,
and recent sync events from the desktop Settings panel.

## Implementation

- Added `SyncedFolderTelemetry` to the desktop API status contract.
- `SyncedFolderService` now records structured counters for:
  - successful reconciles,
  - backstops,
  - read-only rejected edits,
  - sync errors,
  - queued offline watcher events.
- Status now carries the most recent synced-folder events with timestamps and
  backstop reasons.
- The desktop Cloud Sync settings card shows queued offline edits, counters, and
  a recent event list next to the existing connection/error status.
- Focused service tests cover telemetry updates for reconcile, missing-base
  backstop, read-only rejection, subscription errors, and offline queue depth.

## Acceptance

- A user or support person can inspect synced-folder health without reading logs.
- Backstop and error rates are visible in `getSyncedFolderStatus()`.
- Queued offline events are visible before and after replay.
- The implementation does not add a vendor dependency or send document metadata
  off-device.

## Verification

```sh
pnpm --filter @hubble.md/desktop test -- syncedFolderService.test.ts
pnpm typecheck
pnpm build:desktop
```

## Follow-Up

- Wire the same telemetry to a production crash/error pipeline after the release
  owner chooses the service.
- Add rate-based alerts for sustained `errorCount`, `backstopCount`, and
  `queuedEventCount > 0` once there is a hosted monitoring sink.
