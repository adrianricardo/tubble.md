# RD4 - Production Auth Hardening and Enforcement Audit

Assigned tier: **premier**.

Why: this slice audits the production authorization boundary for Live Documents,
legacy sync, assets, sharing, ProseMirror step submission, and desktop
main-process token use. A missed gap can expose document contents or allow edits
from a viewer/anonymous caller, so this is correctness- and security-sensitive.

## Objective

Harden Convex Auth and authorization enforcement for the realtime-collab branch
before the broader security review. Every public backend read/write path should
either derive caller authority server-side or have an explicit legacy/test/public
rationale. A viewer must be able to read allowed document content, but must not
submit editable ProseMirror steps, apply patches, reconcile files, restore trash,
resolve comments, or otherwise mutate document content/metadata.

## Acceptance Criteria

- Convex Auth password provider remains the production auth provider for this
  slice; WorkOS/SSO remains a later enterprise option.
- `auth.config.ts`, `auth.ts`, `http.ts`, and `authTables` are present and wired.
- Public Convex queries/mutations in `documents.ts`, `folders.ts`, `sync.ts`, and
  `prosemirror.ts` have an auth/permission gate or an explicit documented
  exception.
- ProseMirror sync endpoints only serve stable Live Document sync IDs and enforce
  `requireDocumentRead` / `requireDocumentWrite` through the component hooks.
- Viewer-role users can read document projections but cannot submit editable
  steps, apply patches, reconcile projection files, create suggestions, create
  comment threads/replies, restore deleted documents, or resolve comments.
- Commenter-role users can comment/propose suggestions but cannot apply document
  mutations or submit ProseMirror write steps.
- Trash restore authorizes against the deleted document's role instead of broad
  workspace membership.
- Desktop main-process synced-folder backend and subscriber are created with the
  renderer-owned Convex Auth JWT; renderer token refresh reconnect remains the
  token-refresh mechanism until a main-process token fetcher exists.

## Files and Directories

Primary:

- `packages/sync-backend/convex/auth.ts`
- `packages/sync-backend/convex/auth.config.ts`
- `packages/sync-backend/convex/http.ts`
- `packages/sync-backend/convex/permissions.ts`
- `packages/sync-backend/convex/prosemirror.ts`
- `packages/sync-backend/convex/documents.ts`
- `packages/sync-backend/convex/folders.ts`
- `packages/sync-backend/convex/sync.ts`
- `packages/convex-client/src/index.ts`
- `apps/desktop/electron/syncedFolderService.ts`
- `apps/desktop/src/components/CloudSyncSection.tsx`

Supporting:

- `apps/desktop/electron/syncedFolderService.test.ts`
- `apps/desktop/electron/liveSync.test.ts`
- `specs/realtime-collab/PROGRESS.md`

Avoid touching:

- Schema migration/backfills. RD3 owns deployment shape.
- Doc-size/load or offline behavior. RD5/RD6 own those gates.
- General security review items such as path traversal and IPC attack surface.
  RD8 owns the broader security review; RD4 is auth enforcement.

## Implementation Guidance

1. Start from a static inventory of public Convex functions.
2. Treat caller-supplied user IDs or actor strings as display/attribution only,
   never as authorization.
3. Keep legacy unauthenticated workspace compatibility limited to existing
   `ownerId === undefined` workspaces.
4. Preserve explicit public-link behavior, but make role semantics strict:
   `viewer` reads only, `commenter` comments/proposes only, `editor` writes, and
   `owner` manages shares.
5. Prefer central permission helpers over one-off role checks.
6. Keep desktop token refresh renderer-driven: IPC carries the current JWT string
   and reconnects the main-process backend/subscriber when it changes.

## Tests to Add or Update

- Add focused tests if an existing package has a local test harness for the code
  being changed.
- For Convex function policy changes, run Convex codegen/typecheck against the
  configured deployment and record any deployment availability gap.
- Keep RD8's deeper adversarial/security tests out of scope unless a direct RD4
  auth bug requires one.

## Verification

Run focused checks first:

```sh
pnpm exec biome check packages/sync-backend/convex/permissions.ts packages/sync-backend/convex/prosemirror.ts packages/sync-backend/convex/documents.ts
pnpm --filter @hubble.md/sync-backend exec convex codegen
```

Then run the load-bearing checks:

```sh
pnpm typecheck
pnpm build:desktop
```

If the deployment is reachable, run:

```sh
pnpm --filter @hubble.md/sync-backend exec convex dev --once --typecheck enable
```

Report any pre-existing `pnpm check` formatting drift separately; do not use it
as a substitute for typecheck/build.

## Done Report

Return a short summary only:

- status: done / blocked
- files touched
- commands run and results
- auth gaps found and fixed
- any verification gaps or follow-up slices unblocked
