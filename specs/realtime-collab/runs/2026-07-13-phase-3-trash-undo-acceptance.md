# Run record — Phase 3 Trash/Undo desktop acceptance (2026-07-13)

Issue: #173. Deployment: dev `strong-setter-709`. Desktop: isolated Electron dev
wrapper `Hubble Dev Phase3 Acceptance`, with its own user-data profile. Mirror:
`/tmp/hubble-phase3-mirror.fqrpEo`. Cloud workspace:
`Phase 3 Acceptance 2026-07-13` (`mn76dym1w26p998wej00jrwjqn8ae34x`).

## Acceptance results

- **Single local delete + durable Undo — pass.** A real unlink produced a stable
  `trash-undo` journal entry before cloud Trash. The Undo dialog survived an app
  restart and reconnect; Undo restored both the cloud document and its local
  projection, then cleared the journal.
- **Offline + restart review — pass.** A process-local offline sentinel held the
  unlink as `deletion-review(reason: offline)` and left the cloud document readable.
  The on-disk review survived restart while still offline, reappeared after reconnect,
  and approval produced the durable Trash/Undo path. Undo restored the document.
- **Bulk review — pass.** Two real unlinks inside the aggregation window became one
  `deletion-review(reason: bulk)` with two items. “Restore files” recreated both local
  projections without mutating cloud Trash and cleared the journal.
- **Quit-time review — pass.** Removing two tracked files while no watcher was active
  produced durable `missing-document` startup blockers on reconnect; the cloud copies
  stayed intact. Restoring the expected bytes cleared the blockers and completed
  startup.
- **Remote Trash + restore collision — pass.** Cloud Trash removed a clean managed
  projection and emitted `removed-remote-trash` without writing a local access-loss
  backstop. Restoring from cloud while the path was occupied preserved the untracked
  local bytes and produced a durable `path-collision`; removing the collision allowed
  the cloud document to materialize normally.

## Findings fixed during the run

1. The production main process had no offline predicate, so the offline branch existed
   only in unit tests. The desktop coordinator now uses Electron `net.isOnline()` and
   supports a process-local sentinel for deterministic acceptance testing.
2. An offline reconnect loaded the journal but reported zero pending operations. The
   journal count is now loaded before the offline verification return, with regression
   coverage.
3. Resolving a review that blocked startup changed status to `connected` without
   starting subscriptions or the filesystem watcher. Review resolution now resumes the
   saved connection once blocking operations are gone; the offline/restart regression
   asserts that startup completes and clears its prior error.

## Verification

- Sync tests: 46/46 passed.
- Desktop tests: 135/135 passed after the acceptance fixes.
- Backend tests: 69/69 passed.
- `pnpm build:desktop`: passed after the acceptance fixes.
- Targeted Biome check and `git diff --check`: passed.

## Operator notes and residue

- The isolated workspace retains the two intended acceptance documents. One accidental
  duplicate created while staging the first restore-collision attempt was moved to
  cloud Trash; it is not part of the active mirror.
- During setup, `convex dev --once` was accidentally run once from the repository root,
  which temporarily removed the dev deployment's indexes and component mount because
  the root `convex/` directory is not the backend package. It was immediately corrected
  by running the command from `packages/sync-backend`; all indexes and the ProseMirror
  component were restored and Convex reported the full function set ready. No table or
  document deletion was reported.
