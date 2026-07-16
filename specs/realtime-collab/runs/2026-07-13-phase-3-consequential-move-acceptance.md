# Run record — Phase 3 consequential-move desktop acceptance (2026-07-13)

Issue: #171. Deployment: dev `strong-setter-709`. Desktop: isolated Electron dev
wrapper `Hubble Dev Phase3 Acceptance`, with its own user-data profile. Mirror:
`/tmp/hubble-phase3-mirror.fqrpEo`. Cloud workspace:
`Phase 3 Acceptance 2026-07-13` (`mn76dym1w26p998wej00jrwjqn8ae34x`).

## Acceptance fixture

A real document moved between two top-level folders with three simultaneous access
boundary changes:

- named user `ado test`: viewer → editor;
- public link: no access → commenter, then changed to viewer during review;
- repository exposure: added to `acceptance-repo` at cloud path
  `Shared Public Repo`.

The test used the production watcher and real files. Because macOS may deliver a
rename's add before its unlink, the accepted correlation attempts staged the unlink
first and recreated the exact bytes within the 750 ms hash-correlation window.

## Acceptance results

- **Rendered preview — pass.** The foreground Electron dialog named the document and
  exact source/destination paths, rendered `ado test: Viewer → Editor`, showed the
  public-link role transition, and identified `acceptance-repo (Shared Public Repo)`.
  The dialog was labelled/described for assistive technology and initially focused
  its safe close/cancellation control.
- **Stale impact refresh — pass.** The destination public role changed from commenter
  to viewer after the review opened. The first approval left the cloud document in
  its source folder, retained the durable operation, refreshed its fingerprint, and
  rerendered `No access → Viewer`.
- **Approval — pass.** A second approval committed the reviewed folder move and
  cleared the journal without changing the Markdown bytes.
- **Cancellation — pass.** The reverse move rendered the corresponding role loss,
  public-link removal, and repository removal. An edit made at the pending destination
  reconciled while review was open. Escape cancelled the move, restored the latest
  bytes to the source path, removed the pending destination, preserved the cloud
  folder, and cleared the journal.

## Finding fixed during the run

Confirmation sent the mirror-relative path (including the top-level workspace
directory) as the document's canonical cloud `path`. The materializer tolerated that
legacy shape, but it violated the workspace-relative path contract. Rename, prepare,
and confirmation now share one normalization rule: whole-workspace mirrors strip the
workspace directory, while repo-link mounts preserve their full subtree-relative
path. Regression coverage includes neutral rename, cross-folder move, stale
confirmation, and repo-mount relocation. The corrected live approval stored exactly
`Private Team/Consequential Move.md`.

## Verification

- Desktop tests: 137/137 passed.
- `pnpm build:desktop`: passed.
- Dev backend deployment completed from `packages/sync-backend`.
- `git diff --check`: passed.

## Operator notes and residue

The acceptance workspace retains `Consequential Move` in `Private Team` plus the
folder-boundary fixture metadata. The Markdown includes the deliberate edit made
during cancellation review. One initial unstaged macOS rename was classified as
create + Trash rather than move; both source documents were restored through durable
Undo and the accidental destination duplicate was moved to cloud Trash before the
accepted runs. No pending projection operations remain.
