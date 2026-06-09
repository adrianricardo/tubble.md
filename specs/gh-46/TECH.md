# Add Workspace dialog with Cloud Sync setup

Issue: https://github.com/bholmesdev/hubble.md/issues/46
Product spec: `specs/gh-46/PRODUCT.md`
Base commit: `e352538fcac0826efc4518ad8cdc479df9ea2a61`

## Context

This builds the desktop UI and IPC layer for the folder-first Cloud Sync model from issue #45. The user-visible behavior is defined in `PRODUCT.md`; this plan references its Behavior numbers.

Current desktop flow is direct: `WorkspaceSwitcher` renders `Add folder...` and calls `openWorkspace()` ([apps/desktop/src/components/WorkspaceSwitcher.tsx](https://github.com/bholmesdev/hubble.md/blob/e352538fcac0826efc4518ad8cdc479df9ea2a61/apps/desktop/src/components/WorkspaceSwitcher.tsx#L42)), while `openWorkspace()` immediately calls `desktopApi.openFolderPicker()` when no path is provided ([apps/desktop/src/store/actions.ts](https://github.com/bholmesdev/hubble.md/blob/e352538fcac0826efc4518ad8cdc479df9ea2a61/apps/desktop/src/store/actions.ts#L102)). Electron exposes only a folder picker IPC today ([apps/desktop/electron/main.ts](https://github.com/bholmesdev/hubble.md/blob/e352538fcac0826efc4518ad8cdc479df9ea2a61/apps/desktop/electron/main.ts#L746)).

The sync package already models optional nested `cloudSync` ([packages/sync/src/types.ts](https://github.com/bholmesdev/hubble.md/blob/e352538fcac0826efc4518ad8cdc479df9ea2a61/packages/sync/src/types.ts#L3)) and config helpers create/remove it ([packages/sync/src/config.ts](https://github.com/bholmesdev/hubble.md/blob/e352538fcac0826efc4518ad8cdc479df9ea2a61/packages/sync/src/config.ts#L56)). `init()` currently creates or reuses a remote Workspace by name, writes sync state, and writes Cloud Sync config ([packages/sync/src/sync.ts](https://github.com/bholmesdev/hubble.md/blob/e352538fcac0826efc4518ad8cdc479df9ea2a61/packages/sync/src/sync.ts#L20)). Convex client/backend APIs expose get/create/list Workspace primitives ([packages/convex-client/src/index.ts](https://github.com/bholmesdev/hubble.md/blob/e352538fcac0826efc4518ad8cdc479df9ea2a61/packages/convex-client/src/index.ts#L20), [packages/sync-backend/convex/sync.ts](https://github.com/bholmesdev/hubble.md/blob/e352538fcac0826efc4518ad8cdc479df9ea2a61/packages/sync-backend/convex/sync.ts#L62)).

Dependency: implement after issue #45 lands or adapt to its final exported CLI/sync APIs.

## Affected apps and packages

- `apps/desktop`: Add dialog UI, state orchestration, settings UI, Electron IPC, daemon registration calls, desktop validation.
- `packages/sync`: Reuse nested `cloudSync` types/config helpers; likely add explicit connect-existing/create-new helpers if issue #45 does not expose them.
- `packages/convex-client`: Ensure desktop can validate deployment URLs and list/create remote Workspaces without duplicating Convex client code.
- `packages/ui`: Reuse `Modal`, `Button`, `Input`, and existing menu/sidebar primitives; add only small primitives if the dialog needs reusable checkbox/tooltip/select controls.
- `packages/cli`: No primary UI work, but keep manual sync behavior compatible with `cloudSync.backgroundSync=false`.

## Module architecture

- `apps/desktop/src/components/AddWorkspaceDialog.tsx`: Controlled dialog for folder choice, optional Agent Instructions, Cloud Sync setup, validation states, and submit actions.
- `apps/desktop/src/components/WorkspaceSwitcher.tsx`: Rename menu item and open the dialog instead of calling `openWorkspace()` directly for new Workspaces.
- `apps/desktop/src/components/Sidebar.tsx`: Empty-state Add Workspace button opens the dialog and preserves current folder behavior after submit.
- `apps/desktop/src/store/actions.ts`: Split direct opening from setup. Keep `openWorkspace(path)` as the low-level folder loader; add `showAddWorkspaceDialog()`, `chooseWorkspaceFolder()`, and `completeAddWorkspace()`.
- `apps/desktop/src/store/state.ts` plus persistence if needed: Track dialog open state and in-flight setup state outside persisted recent Workspaces.
- `apps/desktop/src/desktopApi/types.ts`, `apps/desktop/electron/preload.ts`, `apps/desktop/electron/main.ts`: Add IPC for reading/writing `.hubble` support files, Cloud Sync connect/setup, initial sync, and daemon registration. Grant filesystem access only after the user chooses the folder.
- `apps/desktop/src/components/WorkspaceSettings.tsx`: New settings surface or section attached to the existing app chrome/menu path, exposing Cloud Sync details and disconnect/retry/relink flows.
- `packages/convex-client`: Export a small helper for deployment URL validation/listing if desktop should not import `ConvexHttpClient` directly.

Data flow: dialog gathers local choices, Electron grants folder access, renderer validates remote choices through a typed API, submit asks the main process or sync facade to write config/state and run initial sync, then renderer opens the folder with existing `openWorkspace(path)`.

## Detailed plan

1. Replace visible copy for Behavior 1-2 and route both entry points to dialog state.
2. Build `AddWorkspaceDialog` with folder picker, dirty/cancel handling, inline validation, keyboard focus, and reduced-motion-safe show/hide states for Behavior 3-7 and 26-27.
3. Add Agent Instructions option behind a narrow writer API. Keep support-file creation separate from opening the folder so Behavior 7 and 9 can be tested independently.
4. Add Cloud Sync subform: URL input validates on blur, remote Workspace list loads after valid URL, create-new path uses folder basename, and Auto sync defaults true for Behavior 10-17.
5. Reuse issue #45 sync connect APIs. If needed, add `connectCloudSync({ workspacePath, deploymentUrl, workspaceId | workspaceName, backgroundSync })` in `packages/sync` so desktop does not rebuild config/state logic.
6. Run initial sync through the existing reconciliation path after config/state creation for Behavior 18-19.
7. Add daemon registration IPC/facade. Treat registration as a post-connect step: persist Cloud Sync success first, then show retry state on daemon failure for Behavior 20-21.
8. Add Workspace settings section with connected, local-only, retry, disconnect, copy id, and relink confirmation states for Behavior 22-25.
9. Keep all layout CSS using logical spacing props such as `padding-inline`, `padding-block`, `margin-inline`, and `margin-block`.

Tradeoff: keep the first implementation desktop-only. Web already requires synced Workspaces and has separate connect/open screens, so sharing the whole dialog would blur surface-specific behavior.

## Testing and validation

- Unit/component tests for `AddWorkspaceDialog` states: no folder, picker cancel, Plain Folder submit, Cloud Sync disabled/enabled, invalid URL, fetch failure, existing remote selection, create-new validation, Auto sync default.
- Store/action tests around `completeAddWorkspace()` to assert Behavior 6-9 and no recent Workspace mutation until successful folder open.
- Sync facade tests for Behavior 18-21: config/state writes, existing versus new remote Workspace, initial sync call, `backgroundSync=false`, daemon registration failure does not remove `cloudSync`.
- Settings tests for Behavior 22-25: local-only state, connected state, copyable ids, retry, disconnect, relink confirmation.
- Manual desktop validation: open with no folder, run the UX validation from `PRODUCT.md`, and inspect the selected folder for `.hubble` absence/presence.
- Commands: use `pnpm check` during iteration, then `pnpm build:desktop` before implementation PR review.

## Risks and mitigations

- Issue #45 API drift: implement #46 after #45 merges or isolate all sync calls behind one desktop facade.
- Accidental `.hubble` writes on Plain Folder open: add direct tests around Behavior 7 and keep support-file writers out of the low-level `openWorkspace(path)`.
- Partial Cloud Sync setup: order operations so config/state write and initial sync errors surface in the dialog, while daemon registration failure becomes retryable settings state.
- Relink data surprises: require confirmation and route through the same reconciliation path as initial sync.

## Parallelization

Useful after issue #45 lands. One agent can own desktop dialog/state and another can own Electron/sync facade plus settings, with shared contract types agreed first. Merge sync facade before wiring dialog submit.
