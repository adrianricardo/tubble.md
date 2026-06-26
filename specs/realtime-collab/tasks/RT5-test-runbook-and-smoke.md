# RT5 — Human test runbook + Convex seed/smoke script

**Tier:** standard (Sonnet) — doc + a scripted smoke; needs care to be accurate but
no architectural calls. **Depends-on:** none to author; **verify after** RT2.

## Objective

Produce (1) a step-by-step **human test runbook** that walks the
`READY-TO-TEST.plan.md` acceptance criteria on the deployed fork Convex, and (2) a
small **seed/smoke script** that prepares a test workspace + doc and asserts a
disk→cloud reconcile, so the human starts from a known state.

## Read first

- `specs/realtime-collab/READY-TO-TEST.plan.md` — the acceptance criteria this
  runbook must exercise (sign-in → connect → materialize → edit → no conflict file →
  backstop → rename).
- `scripts/reconcile-poc.mjs` — the existing throwaway chokidar/reconcile smoke; copy
  its shape (chokidar on one file, submit via the reconcile path) for the assert.
- `packages/sync-backend/convex/` — `documents.importMarkdown`, `sync.listWorkspaces`
  for seeding; how the POC scripts authenticate to a local/deployed Convex.
- `apps/desktop` env handling from RT1 (`VITE_CONVEX_URL`) so the runbook's setup
  steps name the right env vars.

## Scope

1. **`specs/realtime-collab/TEST-RUNBOOK.md`** — numbered steps with expected results
   and pass/fail checkboxes, covering:
   - Prereqs: deployed Convex URL + a test account; desktop env set.
   - Sign in; open Settings → Synced Folder; choose an empty `~/Hubble-test`.
   - Connect → assert the cloud docs appear in nested folders; viewer docs are
     read-only (`ls -l` shows `0444`).
   - Edit a writable doc → assert it shows in the browser within ~2s and **no
     `*.conflict-<ts>`** appears (`find ~/Hubble-test -name '*.conflict-*'` empty).
   - Force a backstop (corrupt `.hubble/state/live-documents/<id>.base.md`) → assert
     a `*.local-edit-<ts>` sibling appears and the file reloads.
   - Rename in Finder → cloud doc renames; move → folder changes.
   - Disconnect → watcher stops; reconnect → no duplicate docs (idempotent).
2. **`scripts/synced-folder-reconcile-smoke.mjs`** — a **package-level reconcile
   smoke** (NOT a full app smoke): seeds a workspace + one doc via Convex, writes the
   sync root's base cache, simulates a file edit, runs the **reconcile path**
   (`reconcileProjectionFile`, as `scripts/reconcile-poc.mjs` does), and asserts the
   cloud doc updated. Be explicit that this **bypasses the desktop watcher + IPC** —
   it does *not* prove `connectSyncedFolder → materialize → edit → cloud`. That full
   path is proven by the **human runbook step** (item 1), not this script.
   - **Auth:** against deployed Convex with real auth, the script **cannot seed
     without a token**. Either (a) take `CONVEX_URL` + an `AUTH_TOKEN` env input, or
     (b) restrict the script to a local/legacy unauthenticated `convex dev`
     deployment and say so. Do not pretend it works unauthenticated against the
     deployed backend.

## Out of scope

App code changes (this is a doc + script). Don't modify the engine.

## Verify

- The smoke script runs against a local `convex dev` (or document the exact deployed
  setup it needs). `node --check scripts/synced-folder-smoke.mjs` passes.
- The runbook is internally consistent with the actual IPC/flow RT2 built (verify
  after RT2 lands).

## Constraints & done

No commit; no `PROGRESS.md` edit. Return: the two files, what the smoke asserts and
what stays human-gated, verify results, suggested PROGRESS note + changelog line.
