# RD6 — Offline Gate Resolution

**Tier:** premier
**Depends on:** RT done
**Status:** in progress

## Goal

Close the remaining Stage-1 offline gate without forking away from
`@convex-dev/prosemirror-sync`.

RD6 has two independent tracks:

1. **External-file offline:** desktop watcher changes to Live Document projection
   files are durably queued under `.hubble/queue/` when the backend is offline or
   a replay fails, then replayed through the existing reconcile path on reconnect.
2. **In-editor durable offline:** the IndexedDB/sessionStorage step buffer from
   `d5355c7` is human-verified for reload-while-offline replay, or bounded as a
   deferred limitation if it fails.

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
- Before RD6 can be closed: human browser verification of the in-editor durable
  offline buffer must pass, or the product boundary must explicitly defer
  reload-while-offline in-editor durability.

## Out of Scope

- Yjs / Durable Object fork.
- Packaged desktop release.
- Security review and merge-to-main work.
