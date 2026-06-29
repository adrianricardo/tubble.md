# Realtime Collaboration - Operations Runbook

This runbook covers the v1 launch path after RD11. It is intentionally vendor
neutral: local desktop telemetry is available now, while external alerts wait for
a release-owner choice of monitoring sink.

## What Exists Now

- Desktop Settings > Cloud sync shows the connected root, mirrored document count,
  queued offline edits, sync counters, and recent synced-folder events.
- `desktopApi.getSyncedFolderStatus()` returns the same status for support
  diagnostics, including reconcile success, backstop, read-only reject, error, and
  queued-event counts.
- The synced-folder engine keeps failed offline replay events queued instead of
  materializing over unsynced local edits.
- Hosted Convex health still needs to be checked in the Convex dashboard for the
  active deployment.

## First Triage

1. Ask the user for the Cloud sync status card values:
   - connected root,
   - document count,
   - queued offline edits,
   - reconcile/backstop/read-only/error counters,
   - most recent event kind and message.
2. If the user can run the app with developer tools, read
   `desktopApi.getSyncedFolderStatus()` from the renderer console and preserve the
   full object in the support note.
3. Check the active Convex deployment dashboard for function errors, high latency,
   or auth failures around the user's reported timestamp.
4. Classify the issue before asking the user to reconnect:
   - `queuedEventCount > 0`: local edits are waiting for replay; avoid manual
     cloud materialization until the queue is understood.
   - `backstopCount > 0`: Hubble preserved local bytes as a `.local-edit-*` file.
   - `readOnlyRejectCount > 0`: the local role is viewer/commenter or the server
     rejected write access.
   - `errorCount > 0`: inspect recent events and Convex logs before retry loops.

## Escalation Thresholds

Use these thresholds for the first release until real alerts exist:

- Any non-zero `errorCount` with repeated recent `error` events in one session.
- Any `queuedEventCount > 0` that does not drain after reconnecting to the network
  and waiting for one materialize pass.
- More than one backstop for the same document in a day.
- A read-only reject reported by a user who should have editor access.
- A connected folder that loses ownership without another active device using the
  same root.

## Safe User Actions

- For auth/session errors, sign out, sign back in, then reconnect the same folder.
- For queued offline edits, leave the app running and reconnect the network before
  editing the same files elsewhere.
- For `.local-edit-*` files, compare the preserved file with the cloud document
  before deleting it.
- For read-only rejects, fix the document share role in Hubble before retrying the
  external file edit.

## Do Not Do

- Do not delete `.hubble/queue/events.json` unless the queued local edits have
  been inspected and intentionally abandoned.
- Do not remove `.local-edit-*` files until their content has been reconciled or
  judged obsolete.
- Do not run a bulk legacy-file import/backfill without an operator-confirmed
  production target and import policy.
- Do not treat local-only workspaces as subject to the Live Document size cap; the
  256 KiB cap is only for Live Documents.

## External Alert Follow-Up

When a release owner chooses a monitoring sink, wire alerts from the same status
shape:

- sustained `errorCount` growth,
- sustained `queuedEventCount > 0`,
- non-zero `backstopCount`,
- repeated lock-loss events,
- Convex function failures on `documents.applyPatch`, `documents.importMarkdown`,
  `documents.listWithMarkdown`, and `documents.listSharedWithMe`.

Avoid sending document markdown, titles, local filesystem paths, or user-auth
tokens to external telemetry.
