# RD10 - Flag-Gated Merge to Fork Main

**Tier:** premier
**Depends on:** RD1, RD2, RD3-RD8
**Status:** landed locally

## Goal

Merge `spike/prosemirror-sync` with fork `main` while keeping Live Document and
synced-folder realtime collaboration surfaces behind a default-off feature flag.
The merge must preserve legacy file-authoritative workflows from ADR-0009.

## Flag

Renderer build flag:

```sh
VITE_HUBBLE_REALTIME_COLLAB=1
```

Default/unset/`0` keeps the launch-facing UI on existing file-authoritative
surfaces:

- Web hides the `/w/:workspaceId/d/:documentId` route, omits the Live Documents
  sidebar section, and skips the Convex Auth shell used only for realtime
  collaboration.
- Desktop omits Cloud Sync settings and does not create the desktop Convex Auth
  provider unless both the flag and `VITE_CONVEX_URL` are set.

## Merge Notes

- `origin/main` carried earlier Stage 2 public document CRUD in
  `packages/sync-backend/convex/sync.ts`; RD10 keeps the RD8-secured
  `documents.ts` API instead of reintroducing that duplicate public surface.
- Realtime API conflicts resolve to the spike branch versions because they include
  the later auth, permission, shared-with-me, offline-boundary, doc-size cap, and
  security-review work.
- Upstream non-conflicting changes from `origin/main` are otherwise retained.

## Acceptance

- Branch includes `origin/main` as a merge parent.
- Local `main` can fast-forward to the resolved branch commit.
- Live Document and synced-folder user-facing surfaces are unavailable unless the
  flag is enabled.
- `pnpm typecheck` and `pnpm build:desktop` pass after the merge.

## Result

Landed locally on 2026-06-28. `spike/prosemirror-sync` merged `origin/main`,
resolved realtime conflicts to the secured branch versions, added the default-off
flag, and can fast-forward local `main` after the merge commit.

## Verification

```bash
pnpm typecheck
pnpm build:desktop
```
