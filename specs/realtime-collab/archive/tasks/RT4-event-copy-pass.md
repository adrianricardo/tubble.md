# RT4 — User-facing copy pass for synced-folder events

**Tier:** economy (Haiku) — mechanical string/UX wiring, no logic. **Depends-on:**
RT2 (the toast/status surface exists). **Parallel-with:** RT3.

## Objective

Give every synced-folder event and status a clear, human, non-alarming message.
Replace RT2's placeholder strings with final copy.

## Read first

- `apps/desktop/src/desktopApi/types.ts` — `SyncedFolderEvent` kinds and
  `SyncedFolderStatus` (`state`, `lastError`, `lastReconciledAt`).
- RT2's `SyncedFolderSection` — where toasts (`sonner`) and status text are rendered.
- An existing toast/copy example in the renderer for tone/voice.

## Scope

Provide final copy (and wire it) for:

| Event / state | Tone | Suggested message |
|---|---|---|
| `reconciled` | quiet/success (or silent + status only) | "Synced just now" / update "last reconciled" |
| `backstop` | reassuring, not scary | "Saved your local copy as a `.local-edit` file and reloaded the latest version — nothing was lost." |
| `read-only-rejected` | informative | "This document is read-only for you; your edit was kept as a `.local-edit` copy." |
| `removed-local` | neutral | "Removed from the cloud (you can restore it from Trash)." |
| `removed-access` | neutral | "You no longer have access; your local copy was moved to Trash." |
| `error` / `lastError` | actionable | surface the message + a retry/reconnect hint |
| status `idle/connected/syncing/error` | labels | short status pills |

Use sentence case, no jargon (`CRDT`, `reconcile` internals stay out of user copy).
Prefer **status-line updates** over a toast for the high-frequency `reconciled`
event to avoid toast spam.

## Out of scope

Any logic, event plumbing, or new events (RT2/Phase 5 own those). Pure copy + which
surface (toast vs status line) each uses.

## Verify

- `pnpm typecheck`, `pnpm build:desktop`, `pnpm --filter @hubble.md/desktop test`.

## Constraints & done

No commit; no `PROGRESS.md` edit. Return: the final copy map, which events became
toasts vs status-line, files touched, verify results, suggested changelog line.
