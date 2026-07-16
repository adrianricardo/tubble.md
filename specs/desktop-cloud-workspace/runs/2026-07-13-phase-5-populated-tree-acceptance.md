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

The destructive clean-remove branch, acceptance-data cleanup, literal VoiceOver
speech, and physical Shift+F10 pass all passed. Phase 5's populated-tree acceptance
gate is complete; the internal flag and legacy production branch can now be removed
before Phase 6 begins.

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
- Scratch was re-linked at `/tmp/scratch-repo/Scratch-remove`, connected, and the real
  **Remove local files** action removed the clean root. Hubble reported local
  availability stopped; the Scratch cloud folder remained visible without a local
  marker.
- Synthetic picker probing also created one extra **Untitled** document in
  `adrian's space`. After explicit cleanup authorization, it and the two acceptance
  documents created in Hubble Product Brain were moved to Hubble Trash. A timestamp
  guard preserved older `Untitled` documents; a post-mutation query found no recent
  acceptance `Untitled` documents remaining.

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

## Remaining implementation step

Remove the internal unified-tree flag and legacy production branch, rerun focused
checks and the desktop build, then begin Phase 6.

## Fresh-session follow-up (2026-07-13, implementation session 5)

The flagged Electron app relaunched successfully with populated dev data and CDP.
The persisted Scratch mount reconnected at `/tmp/scratch-repo/Scratch-remove`; the
main-process cleanliness inspection reported `clean` immediately before the pending
action. No local or cloud deletion was attempted because **Remove local files** still
requires action-time human confirmation.

VoiceOver launched, but macOS did not expose its scriptable `last phrase` or cursor
text to this agent session, so literal spoken output could not be recorded without a
human observer. The required physical Shift+F10 press likewise cannot be substituted
by another synthetic event (those already passed). The projection remains intact for
the operator gate.

## Authorized cleanup follow-up

After Adrian explicitly authorized both destructive cleanup actions, Hubble's real
**Remove local files** control removed the byte-clean
`/tmp/scratch-repo/Scratch-remove` root. The UI reported **Local availability
stopped**, the local path no longer existed, and the Scratch cloud folder remained in
the tree without a local marker.

The two documents created during the Hubble Product Brain acceptance (Workspace root
and `Hubble Brain/admin`) plus the accidental `adrian's space` document were moved to
Hubble Trash. Cleanup selected only `Untitled` documents created after the acceptance
run began, asserted that exactly three matched, and verified that no recent matching
documents remained. Older `Untitled` documents were not touched.

## Human VoiceOver and physical-key acceptance

Adrian completed the two observations that automation could not substitute:

- With the **Hubble Brain** tree item focused, physical Fn+Shift+F10 opened the local
  actions menu. VoiceOver announced **Reveal in file browser**, menu item 1 of 4, the
  local path, and the four-item local-availability menu.
- Cmd+N opened the multi-member destination dialog. VoiceOver announced the dialog,
  **Workspace root Available to Workspace members**, the selected radio state, its
  position, and the **Document destination** group. The visible and spoken initial
  focus was the selected Workspace-root radio.

The literal screen-reader and physical-key gate passes.
