# Phase 6 destination-first import implementation

Date: 2026-07-13

## Scope

Implemented the first two Phase 6 steps at code/test/build level:

- Opening or dropping an unrelated Markdown file in the cloud desktop shell now
  opens a destination-first dialog instead of the local-authority editor.
- Member Workspaces offer Workspace root and folder destinations; shared contexts
  offer their accessible root and descendants with an audience description.
- **Import a copy** leaves the source untouched and identifies the connected file
  when the destination is locally available.
- **Move into Hubble** requires a connected projection before cloud mutation. After
  creation, Electron refreshes the owning projection, resolves the new document by
  cloud ID, verifies the materialized bytes against authoritative cloud Markdown,
  and only then removes the source.
- The backend import mutation accepts folder editors, uses a client operation key
  for retry idempotency, and rejects a different operation targeting an occupied
  folder/path instead of replacing either version.

The legacy first-run folder importer and CLI now provide stable operation keys and
report retried documents as already imported rather than updated.

## Verification

- `pnpm --filter @hubble.md/sync-backend test` — 72/72 passed.
- `pnpm --filter @hubble.md/sync test` — 47/47 passed.
- `pnpm --filter @hubble.md/desktop test` — 155/155 passed.
- `pnpm build:desktop` — passed (package builds, typechecks, renderer/main/preload
  production bundles).
- `git diff --check` — passed.
- `pnpm check` — attempted; repository-wide pre-existing diagnostics remain in
  ignored `brain/cloud/.hubble/` runtime metadata, `convex/tsconfig.json`,
  `skills-lock.json`, and `specs/realtime-collab/repo-brain-storyboard.html`.
  Changed-file Biome is the cleanliness gate for this pass.

## Acceptance still required

This session did not deploy the widened Convex schema or mutate dev cloud data.
After an authorized dev deploy, run real-file acceptance for Workspace root, nested
member folder, editor-shared folder, copy retention, verified move removal, occupied
cloud destination, occupied local materialization path, and a destination without
local availability. Keyboard and VoiceOver should cover the new dialog in the same
host pass.

## Next implementation slice

Implement Phase 6 authorization-loss/role-downgrade handling: reject further cloud
writes, preserve unsynchronized bytes as a clearly detached recovery copy, and never
republish those bytes after access is removed. Then add the minimal inspect/retry/
defer/keep-detached controls.
