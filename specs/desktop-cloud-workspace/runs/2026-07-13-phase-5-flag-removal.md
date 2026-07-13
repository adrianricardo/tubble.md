# Phase 5 unified-tree flag removal

Date: 2026-07-13

## Scope

Close the Phase 5 removal checkpoint after the populated-tree, real-filesystem,
physical keyboard, and literal VoiceOver acceptance gates passed.

## Result

- Removed `VITE_UNIFIED_CLOUD_TREE` and its feature-flag module.
- Cloud-enabled desktop builds now always render the unified Workspace/shared-folder
  context and cloud-ID tree.
- Removed the legacy signed-in **Folders** / **Live Documents** sidebar, legacy cloud
  create behavior, guest wedge, and local-authority dashboard actions.
- Preserved the no-cloud development fallback and reusable local editor/filesystem
  primitives. They are inputs to Phase 6 import, not a cloud-enabled production mode.
- Retained dashboard Workspace selection by routing it through `CloudContext`.

## Verification

- `pnpm --filter @hubble.md/desktop test` — passed, 17 files / 154 tests.
- `pnpm build:desktop` — passed, including dependency builds, desktop TypeScript,
  Electron/Vite production build, and package typechecks.
- `pnpm exec biome check apps/desktop/src/App.tsx apps/desktop/src/components/Sidebar.tsx apps/desktop/src/vite-env.d.ts` — passed.
- `git diff --check` — passed.
- Repository search found no remaining `VITE_UNIFIED_CLOUD_TREE`,
  `unifiedCloudTreeEnabled`, or desktop `featureFlags` reference.

## Next

Begin Phase 6 with destination-first import. The existing
`importLiveDocuments` / `importSyncedFolderMarkdown` path is Workspace-root-only and
predates the unified cloud context. Evolve it into a folder-aware idempotent contract,
then route file-open/drop entry points through **Import a copy** / **Move into Hubble**.
Never delete a source until cloud creation and the managed local copy are verified.
