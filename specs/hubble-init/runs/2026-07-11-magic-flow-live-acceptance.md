# Run record — magic-flow Phases 1+2 live acceptance (2026-07-11)

Implementation: commits `f51023a` (Phases 1+2, Codex-built from
`MAGIC-FLOW-PLAN.md` frozen specs, Claude-reviewed) and `79f6024` (approve→action
fix, found by this acceptance run). Deployment: dev `strong-setter-709`; www dev
server on `localhost:5173`; desktop = dev build "Hubble Dev 5bdb15a0".

## Phase 1 — `hubble login` ✅

- `SITE_URL` env var set on the deployment (required by `deviceAuth:request` for
  the approve URL); backend pushed with `npx convex dev --once`.
- **First approve attempt failed live** with `Missing environment variable
  CONVEX_SITE_URL` from convex-auth's token mint. Root cause (reproduced with an
  env probe): built-in env vars (`CONVEX_SITE_URL`, `CONVEX_CLOUD_URL`) are
  present in top-level mutations/actions but **absent inside nested
  mutation→mutation `ctx.runMutation` calls** on this deployment. The library's
  own signIn works because it is an action calling `store` top-level. Fix:
  `deviceAuth.approve` is now an action → `approvePrepare` (validate + mint
  session) → `auth.store` (token mint) → `approveFinalize` (persist). (`79f6024`)
- After the fix: login → browser approve → `Logged in`, credentials at
  `~/.hubble/credentials.json` (0600). `cloud create --name magic-test`,
  `folder create`, `folder list` all ran with **zero auth flags** as
  adrian.tavares10@gmail.com; each command did a live refresh exchange with
  rotation (three consecutive rotations proven). Long-horizon (2h+) expiry
  survival follows from per-command re-exchange; not separately staged.
- Note: `cloud create` connects the **cwd** as a synced workspace path (wrote
  `.hubble/` into the repo root during the test; disconnected and removed). The
  skill should run workspace-create from a scratch cwd.

## Phase 2 — zero-click live link ✅

- Socket up at `<userData>/cli.sock`, mode 0600. `status` reported the
  renderer-pushed auth state (deployment + email) and mounts with
  `lastReconcileAt`.
- Scratch repo: `hubble mount` → zero clicks → `Live mount connected`, exit 0
  only after liveness proof. Canary edits: file→cloud ≤12s, cloud→file ≤10s.
  `.git/info/exclude` written; BRAIN.md seeded (1 doc).
- Dogfood: `brain/cloud/` relinked live (11 docs) replacing the 2026-07-10
  static projection. No data loss (backup at `/tmp/brain-cloud-backup-2026-07-11`
  was not needed): materialize wrote title-named projections beside the old
  slug-named static files; local-only 2026-07-11 content (nav-IA decision +
  phase entries) was merged into the watched files and synced up, verified via
  export; slug leftovers deleted (deleting unindexed files has no cloud effect
  — confirmed).

## New findings (platform)

1. **Projection naming inconsistency:** desktop materializer names files by doc
   *title* (`admin/Brain Activity Log.md`); `cloud folder export` names by doc
   *path* (`admin/activity-log.md`). Same folder produces different trees.
   Git-side references updated to title names (README/BRAINKEEPER); needs a
   product decision on one canonical naming.
2. **Duplication feedback loop (bug):** `cloud document create` with a title
   that differs from its path-derived filename, into a live-mounted folder,
   triggered materialize↔ingest ping-pong: the title-named materialized file was
   ingested as a *new* local doc, re-materialized under a "(2)" name, and so on —
   6 cloud copies before stabilizing. Contained (5 dupes removed via authed
   `documents:remove`). Date-slug filenames whose title == filename (the
   BRAINKEEPER sources convention) did not loop. Needs a dedupe/idempotency
   guard in the new-local-file ingestion path.
3. Serializer continuation-indent normalization (known backlog) confirmed again
   on round-tripped docs — whitespace-only.

## Residue

- Workspace `magic-test` (`mn74kydkggpt3k2gv5sj2mje5n8ab1cd`) with folder
  `Scratch` + live mount at `/tmp/scratch-repo/Scratch` — kept for undo-toast
  UX testing; safe to undo/delete.
- Exports under `/tmp/brain-cloud-*`, backup `/tmp/brain-cloud-backup-2026-07-11`.
- Toast display: mount succeeded zero-click; toast *appearance* pending Adrian's
  visual confirmation (socket → renderer event path is exercised either way).
