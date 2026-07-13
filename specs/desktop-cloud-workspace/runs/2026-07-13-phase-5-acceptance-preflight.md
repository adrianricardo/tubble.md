# Phase 5 populated-tree acceptance preflight

Date: 2026-07-13

## Scope

Prepare the flag-gated unified cloud tree for populated Electron acceptance of:

- roving keyboard tree navigation and folder expansion;
- screen-reader names for documents, folders, local state, and available actions;
- Shift+F10/ContextMenu local-availability menus;
- multi-member create destination prompting; and
- clean/dirty relocation and stop-local behavior over real files.

## Result

The code/test/build preflight passed, but this managed session could not run the GUI
portion. The prescribed launcher was denied macOS process inspection, Vite was denied
a localhost listener, and direct Electron startup aborted before its CDP endpoint
became available. These were environment restrictions before application interaction,
not Hubble failures. The internal flag therefore remains in place.

Static accessibility review found and fixed two issues before operator QA:

1. A locally available tree item could derive its accessible name from the nested
   action trigger and path. Tree items now have an explicit stable name that includes
   their named local state and advertises the action menu with `aria-haspopup`.
2. The multi-member destination dialog could initially focus its header close button.
   It now focuses the selected, non-destructive Workspace-root destination.

The filesystem safety seams remain covered with temporary real directories: connected
cleanliness, dirty blocking, and legacy/v2 projection-index root rewriting all pass.
This is not a substitute for the pending Electron picker/watcher/reconnect pass.

## Verification

- `pnpm --filter @hubble.md/cloud-ui test` — 5/5 passed.
- `pnpm --filter @hubble.md/desktop exec vitest run electron/repoMountClean.test.ts src/components/CloudDocumentCreateButton.test.ts` — 7/7 passed.
- Changed-file `biome check` — passed.
- `VITE_UNIFIED_CLOUD_TREE=1 pnpm build:desktop` — passed.
- Full desktop suite — 148 tests passed; the 6 CLI-server tests could not bind Unix
  sockets under the managed sandbox.
- `git diff --check` — passed.
- Simplify/comments/review-readiness pass — no further code changes required.

## Remaining operator gate

Run `VITE_UNIFIED_CLOUD_TREE=1 HUBBLE_DESKTOP_ENABLE_CDP=1 pnpm dev:desktop` in a host
session that permits Electron, CDP, localhost, and native folder dialogs. With the
populated dev account and real mount, verify:

1. Arrow keys, Home/End, Left/Right, Enter/Space, stable selection, and visible focus.
2. VoiceOver announcements for level, expanded/selected state, local path/status, and
   the presence of local actions.
3. Shift+F10 and the Context Menu key open the correct menu and focus its first item.
4. Multi-member creation starts on Workspace root, announces the access descriptions,
   and creates into both root and nested-folder destinations.
5. Relocation moves a clean root, rewrites its index, reconnects, and continues syncing.
6. Clean stop exercises both detached-copy and remove paths; a deliberate local edit
   blocks stop and relocation without changing either local or cloud bytes.

Fix any finding and rerun focused checks. Remove the flag only after this gate passes.
