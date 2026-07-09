# RD8 - Security Review

Assigned tier: **premier**.

Why: this slice reviews release-blocking security boundaries across Convex auth,
desktop filesystem access, IPC, synced-folder materialization, ProseMirror step
submission, and sharing semantics. A missed issue can expose document content,
allow unauthorized edits, or write outside the user-granted sync root.

## Objective

Run the broader ready-to-deploy security review after RD4's auth hardening. Close
small release-blocking issues in place, and record any larger follow-up that
should gate RD10 rather than silently shipping.

## Reviewed Surfaces

- Convex authorization helpers and public Live Document functions:
  `packages/sync-backend/convex/permissions.ts`,
  `packages/sync-backend/convex/documents.ts`, and
  `packages/sync-backend/convex/prosemirror.ts`.
- ProseMirror sync API boundaries: only `document:<id>` sync IDs are accepted and
  reads/writes flow through `requireDocumentRead` / `requireDocumentWrite`.
- Desktop grant boundary and IPC surface:
  `apps/desktop/electron/main.ts`,
  `apps/desktop/electron/preload.ts`, and
  `apps/desktop/src/desktopApi/types.ts`.
- Synced-folder watcher, single-writer lock, materializer, and path construction:
  `apps/desktop/electron/syncedFolderService.ts`,
  `apps/desktop/electron/syncedFolderClassify.ts`,
  `packages/sync/src/sync.ts`, and focused tests.
- Public-link share semantics in `documents.ts`.

## Findings Closed

- Removed public throwaway ProseMirror POC mutation endpoints from
  `prosemirror.ts`. The production agent/file-reconcile surfaces are
  `documents.applyPatch`, `documents.getForAgent`, and the sync API with
  permission hooks.
- Re-routed `scripts/reconcile-poc.mjs` to the production `documents.applyPatch`
  `replace-range` intent so it no longer depends on the removed POC endpoint.
- Hardened cloud sync IPC input parsing in Electron main with zod schemas for
  deployment URLs, JWT strings, workspace/document ids, and projection paths.
  Production requires `https:` Convex URLs; local `http:` remains dev-only.
- Removed renderer control of the synced-folder single-writer lock device id.
  The Electron main process now owns the lock identity.
- Tightened synced-folder path sanitization for cloud-controlled workspace,
  folder, document, and shared-document names by stripping leading dot/space
  runs as well as trailing reserved runs. Added a regression test for
  traversal-looking cloud names.

## Residual Risks / Follow-ups

- Public-link shares currently mean "any caller with the document id can read at
  the configured public role." That matches the current share model, but RD10
  should keep it feature-flagged with the rest of Live Documents until a human
  confirms whether public links need unguessable share tokens before release.
- The desktop renderer is a trusted local app surface with context isolation and
  no node integration. RD8 now validates the new cloud IPC payloads in main, but
  older local-file IPC remains grant-based rather than schema-validating every
  payload shape. No release blocker was found there because paths still pass
  `assertGranted`.
- Full packaged-app hardening (CSP review, auto-update signing/notarization, and
  install smoke) remains RD9.

## Verification

Run:

```sh
pnpm --filter @hubble.md/sync test -- syncedFolder
pnpm --filter @hubble.md/desktop test -- syncedFolderService syncedFolderClassify
node --check scripts/reconcile-poc.mjs
pnpm --filter @hubble.md/sync-backend exec convex codegen
pnpm typecheck
pnpm build:desktop
```

Convex function typecheck is covered by `convex codegen` in this slice. If a
hosted deployment is available, optionally rerun
`pnpm --filter @hubble.md/sync-backend exec convex dev --once --typecheck enable`.
