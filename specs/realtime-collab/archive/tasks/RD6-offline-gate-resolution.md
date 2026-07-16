# RD6 — Offline Gate Resolution

**Tier:** premier
**Depends on:** RT done
**Status:** closed locally with explicit v1 boundary

## Goal

Close the remaining Stage-1 offline gate without forking away from
`@convex-dev/prosemirror-sync`.

RD6 has two independent tracks:

1. **External-file offline:** desktop watcher changes to Live Document projection
   files are durably queued under `.hubble/queue/` when the backend is offline or
   a replay fails, then replayed through the existing reconcile path on reconnect.
2. **In-editor durable offline:** the IndexedDB/sessionStorage step buffer from
   `d5355c7` is human-verified for reload-while-offline replay, or bounded as a
   deferred limitation if it fails. **Result:** bounded/deferred for v1 full
   reload while the backend is unavailable, because the current app shell still
   needs live Convex workspace/document queries before the editor can mount.

No Yjs/Durable Objects fork should be started unless the in-editor replay path has
a concrete failing test that the thin buffer cannot address.

## Current Slice

- Build the external-file queue in `apps/desktop/electron/syncedFolderService.ts`.
- Keep queue data inside the existing synced-folder state tree:
  `.hubble/queue/events.json`.
- Replay queued watcher events before cloud materialization on reconnect so
  unsynced local bytes are reconciled before the materializer can overwrite the
  projection.
- If replay still fails, retain the event at the head of the queue with attempt
  metadata and skip materialization to avoid clobbering local offline edits.
- Add focused desktop tests for enqueue, replay, and failed-replay retention.

## Acceptance

- Offline watcher events are persisted and are not routed to the backend while the
  service is offline.
- Reconnect drains queued projection edits through `reconcileProjectionFile`.
- Failed queue replay stays on disk and does not allow cloud materialization to
  overwrite the local edit.
- `pnpm --filter @hubble.md/desktop test -- syncedFolderService.test.ts` passes.
- `pnpm typecheck` passes.
- RD6 can close by explicit product boundary for in-editor durability: v1 supports
  transient in-editor disconnect while the tab stays open and the external-file
  durable queue; full reload/app-restart while Convex is unavailable is deferred to
  a future app-shell offline cache + editor replay slice.

## Closure Evidence

Closed locally on 2026-06-28 with the v1 boundary above.

- Browser probe on `http://localhost:5173` against
  `https://strong-setter-709.convex.cloud` confirmed an offline in-editor edit
  writes `sessionStorage["convex-sync-document:<id>"]` while visible in the editor.
- The same probe found that reloading with the whole Convex backend blocked does
  not remount the editor: the workspace/document shell queries fail before
  `useTiptapSync` can consume the restored cache. This is outside the thin
  ProseMirror buffer's scope and requires an app-shell offline cache.
- Focused unit coverage verifies the session bridge and IndexedDB-to-session
  hydration path:
  `pnpm --filter @hubble.md/www test -- durableOfflineBuffer.test.ts`.
- Desktop queue coverage verifies enqueue, replay, and failed-replay retention:
  `pnpm --filter @hubble.md/desktop test -- syncedFolderService.test.ts`.

## Out of Scope

- Yjs / Durable Object fork.
- Packaged desktop release.
- Security review and merge-to-main work.
