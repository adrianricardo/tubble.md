# Phase 5 populated-tree host acceptance

Date: 2026-07-13

## Scope

Run the preflight checklist against the real flagged Electron renderer, populated dev
data, native macOS dialogs, and real projection files. Fix findings before deciding
whether `VITE_UNIFIED_CLOUD_TREE` can be removed.

## Result

The host run completed most of the gate and found three production issues:

1. The unified shell listed persisted repo mounts but did not reconnect them. The
   reconnect effect lived only in the legacy Settings repo-link panel, which is not
   mounted during normal unified-shell use. The unified sidebar now reconnects once
   per fresh auth token and immediately reports the real engine status.
2. Base UI did not consistently transfer focus from a tree row when the local-actions
   menu was opened through a synthetic Context Menu key event. The tree now holds the
   first item ref and focuses it after the portal mounts. Both Shift+F10 and
   ContextMenu handlers focus **Reveal in file browser**.
3. The create dialog's prior `useEffect(...focus())` was not the dialog focus
   manager's contract. `Modal` now exposes Base UI's `initialFocus`; a clean,
   foreground Electron open focuses the selected **Workspace root** radio.

The internal flag remains. The destructive clean-remove branch requires action-time
confirmation before deleting `/tmp/scratch-repo/Scratch-remove`, and literal
VoiceOver speech plus a physical Shift+F10 pass are still outstanding. Phase 6 stays
gated.

## Live acceptance evidence

- The flagged renderer launched at `http://localhost:1420/` with CDP on port 9222 and
  loaded populated Hubble Product Brain data.
- Arrow navigation, Home/End, Left/Right expansion and parent/child movement passed.
  The accessibility tree reported stable names, levels 1–3, expanded state,
  selection, focusability, and local-path/action availability. A renderer screenshot
  confirmed the visible tree-row focus ring.
- Synthetic Shift+F10 and ContextMenu key events opened the local actions and focused
  **Reveal in file browser**. Chromium CDP on this Mac did not deliver physical F10 or
  ContextMenu key codes, so the physical-key portion remains.
- Hubble Product Brain reported two Workspace members. The destination dialog started
  on the checked Workspace-root radio and announced **Available to Workspace
  members**. Arrow-key selection announced nested paths and **Inherits this folder's
  access**. Creation succeeded at Workspace root and at `Hubble Brain / admin`; the
  latter appeared as a level-3 document.
- The scratch projection relocated through Electron's native folder picker from
  `/tmp/scratch-repo/Scratch` to
  `/private/tmp/hubble-phase5-relocated-20260713`. The old root disappeared, document
  bytes were unchanged, v2 `syncRoot` and indexed absolute paths changed to the new
  root, and the engine returned to connected.
- A post-relocation local canary synchronized: the file SHA-256 exactly matched the
  projection-index hash after the engine returned idle.
- Atomic real-file stop and relocate calls made immediately after local writes both
  returned `blocked / dirty`; the source path and exact written bytes remained.
- Clean stop with **Keep detached copy** removed local availability while preserving
  the Markdown bytes at the relocated path. The Scratch cloud folder remained in the
  tree.
- Scratch was re-linked at `/tmp/scratch-repo/Scratch-remove`, connected, and is ready
  for the final clean-remove confirmation.
- Synthetic picker probing also created one extra **Untitled** document in
  `adrian's space`. It was left intact because deleting cloud data requires explicit
  action-time confirmation; it should be removed with the acceptance documents during
  cleanup if Adrian wants a clean dev corpus.

## Automated verification

- `pnpm --filter @hubble.md/cloud-ui test` — 5/5 passed.
- `pnpm --filter @hubble.md/desktop exec vitest run electron/repoMountClean.test.ts src/components/CloudDocumentCreateButton.test.ts` — 7/7 passed.
- UI and cloud-UI builds — passed.
- Desktop TypeScript check — passed after dependency builds.
- Changed-file `biome check` — passed.
- `VITE_UNIFIED_CLOUD_TREE=1 pnpm build:desktop` — passed.
- `git diff --check` — passed.
- Simplify/comments/review-readiness pass — completed; the two non-obvious lifecycle
  and menu-focus seams retain why-comments.

## Remaining gate

1. With explicit action-time confirmation, choose **Remove local files** for the clean
   `/tmp/scratch-repo/Scratch-remove` projection. Confirm the local root disappears,
   the Scratch cloud folder remains, and no document/share state changes.
2. Run VoiceOver against the populated tree and dialog. Record the spoken level,
   expanded/selected state, local path/status, action availability, destination access
   descriptions, and safe initial focus. Press physical Shift+F10 while the app is
   foregrounded; Context Menu key handling is already covered synthetically because
   the host keyboard has no such key.
3. Decide whether to delete the acceptance **Untitled** documents (including the
   accidental `adrian's space` document) from dev data.
4. If those pass, rerun focused checks, remove the internal unified-tree flag and
   legacy production branch, then begin Phase 6.
