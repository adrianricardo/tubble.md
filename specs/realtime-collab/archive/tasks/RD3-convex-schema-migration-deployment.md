# RD3 — Convex Schema Migration + Deployment

Assigned tier: **premier**.

Why: this slice can mutate a hosted Convex deployment, gates every later
production-readiness slice, and must account for existing production/dev data
without breaking currently deployed legacy sync clients.

## Objective

Make the realtime-collab Convex backend deployable on a real hosted deployment and
produce the migration/backfill plan needed before RD2/RD4/RD5 can safely run.

RD3 is not "add the schema from scratch"; the branch already contains the Stage
1-6 realtime schema and functions under `packages/sync-backend/convex`. This slice
validates that backend against hosted Convex, identifies any schema/index/codegen
gaps, and records the exact safe deployment sequence.

## Acceptance Criteria

- `packages/sync-backend/convex/schema.ts` includes the realtime production tables
  and indexes required by the ready-to-deploy plan:
  `documents`, `folders`, `revisions`, `commentThreads`, `comments`,
  `documentSuggestions`, `activityEvents`, `notifications`, `members`, `docShares`
  including `docShares.by_user`, plus the Convex Auth tables and prosemirror-sync
  component registration.
- Generated Convex API files under `packages/sync-backend/convex/_generated/`
  match the current functions/components after running codegen against the intended
  deployment.
- Convex backend typecheck passes with the real deployment:
  `pnpm --filter @hubble.md/sync-backend exec convex dev --once --typecheck enable`.
- A zero-downtime migration/backfill plan is recorded for existing deployments:
  legacy anonymous `workspaces.ownerId === undefined`, legacy `files` rows, and new
  authenticated `users`/`members`/`docShares` data must coexist during rollout.
- Deployment-specific blockers are documented explicitly rather than hidden behind
  local-only success.

## Files and Directories

Primary:

- `packages/sync-backend/convex/schema.ts`
- `packages/sync-backend/convex/convex.config.ts`
- `packages/sync-backend/convex/auth.config.ts`
- `packages/sync-backend/convex/_generated/`
- `packages/sync-backend/package.json`
- `specs/realtime-collab/READY-TO-DEPLOY.plan.md`
- `specs/realtime-collab/PROGRESS.md`

Reference:

- `convex/_generated/ai/guidelines.md` if present; otherwise use the Convex
  guidelines from the repo instructions.
- `specs/realtime-collab/PRODUCT.md`
- `specs/realtime-collab/TECH.md`
- `specs/realtime-collab/SPIKE.md`
- `specs/realtime-collab/ORCHESTRATION-NOTES.md`

Avoid touching:

- Desktop synced-folder runtime files. RD1/RD6 own those.
- Web UI materialization for `Shared with me/`. RD2 owns that.
- Hosted deployment data unless the operator has explicitly confirmed the target
  deployment and accepted the mutation risk.

## Constraints and Gotchas

- The actual Convex backend lives in `packages/sync-backend/convex`, not a
  top-level `convex/` directory.
- This project uses Convex Auth; always keep `auth.config.ts` deployable with
  `CONVEX_SITE_URL`.
- `pnpm typecheck` does not typecheck Convex functions. Use Convex codegen/dev
  typecheck for backend verification.
- New optional fields and new tables/indexes are safe schema changes. Making
  existing fields required, changing types, or deleting fields requires a
  widen-migrate-narrow plan.
- Existing legacy workspaces may have `ownerId === undefined`; permissions code
  intentionally treats those as legacy-accessible. Do not narrow that field in RD3.
- `docShares.by_user` is required before RD2 can materialize `Shared with me/`.
- Sub-agents must not commit and must not edit `PROGRESS.md`; the orchestrator
  handles progress/changelog updates after review.

## Suggested Work

1. Inspect the current schema, Convex config, generated API, and package scripts.
2. Compare the schema against RD3 acceptance and the architecture in `TECH.md`.
3. Run non-mutating/local checks first:
   - `pnpm --filter @hubble.md/sync-backend exec convex codegen`
   - `pnpm --filter @hubble.md/sync-backend exec convex dev --once --typecheck enable`
4. If codegen/typecheck changes files or fails, make the smallest fix needed.
5. Write/update the deployment notes in the ready-to-deploy plan if the migration
   path is incomplete or deployment blockers are discovered.

## Done Report

Return a short summary only:

- status: done / blocked
- files touched
- commands run and results
- deployment target used, if any
- migration/backfill decisions or blockers
- follow-up slices unblocked
