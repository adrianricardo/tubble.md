# Selected upstream improvements — Milestone 5 acceptance

Date: 2026-07-14

## Result

The authenticated Electron development app completed the available member Workspace,
editor-shared-root, and direct-local-availability matrix against dev deployment
`strong-setter-709`. The run found and fixed one focus defect: a document created from
a folder row opened and selected correctly but left tree focus on the prior row. Commit
`5ddb7f5` now requests stable-ID tree focus for the returned document, and the repeated
member and shared-editor flows focused the new reactive row after expanding its parent.

Two external gates remain before Milestone 5 can be called complete:

1. The signed-in account currently exposes editor-shared roots but no viewer-shared
   root. Automated capability/backend coverage passes, but the viewer menu must still
   be inspected in a real authenticated context.
2. The freshly built packaged app opens signed out. Copying the development profile to
   an isolated packaged profile does not carry auth across the dev HTTP and packaged
   file origins. Authenticated packaged member/viewer checks, desktop/web reactive
   Trash confirmation, and packaged native text-service acceptance therefore require
   an interactive sign-in (and a viewer fixture or viewer account).

## Live evidence

- A populated member Workspace exposed one compact New document/New folder pair and
  one cloud tree. Root and nested folder creation expanded ancestors, revealed the new
  rows, and focused them. Row/menu document creation did the same after `5ddb7f5`.
- Pointer triggers, right-click, Shift+F10, and the Context Menu key opened the same
  capability-derived action model. Escape restored the origin row. Document menus
  exposed Rename, Move…, and Move to Trash; owner folder menus combined create,
  rename, Share, Trash, and direct-only local actions.
- Document and folder rename preserved the open editor, one reactive row, and stable
  focus. A same-audience move completed without review. Moving toward the repo-linked
  Hubble Brain showed `Added to hubble.md (Hubble Brain)` and did not mutate until the
  explicit Approve move action; the run cancelled at review.
- Move to Trash removed documents reactively. Immediate Undo restored a test document
  and announced restoration. Temporary test documents/folders were soft-trashed after
  the run; no permanent deletion was used.
- The editor-shared `smoke-folder` context showed only `Smoke Doc` and the invisible
  `Shared folder root` move destination. It exposed writable create/rename/move/Trash
  actions, omitted Share and local actions, and never exposed Workspace ancestors or
  siblings.
- The directly available Hubble Brain folder retained Reveal, Copy path, Relocate, and
  Stop actions. Its `admin` descendant omitted those local actions. A real external
  Markdown edit to a temporary projected document reconciled into the open editor;
  the availability record returned `connected` with zero pending operations and zero
  recoveries. Trashing the canary removed its projected file.
- The current arm64 packaged app launched from
  `apps/desktop/release/mac-arm64/Hubble.app` and rendered its signed-out shell over
  CDP. Authenticated packaged interaction stopped at the sign-in gate.

## Backend safety note

The hosted dev backend initially lacked `folders:getContextCapabilities`. An attempt
to start the pre-existing anonymous local deployment prompted the Convex CLI to link it
to the existing `dubble.md` project and unexpectedly updated `strong-setter-709` with
the current backend. A subsequent canonical `pnpm dev:desktop` also ran the workspace's
`sync-backend` dev script. This exceeded the plan's instruction not to deploy merely
for acceptance. No further deployment, rollback, push, publication, or PR was
performed. Live function metadata now contains the required query. The incident is
recorded here rather than hidden or followed by an unsafe rollback.

## Verification

- Editor 79/79, UI 20/20, cloud UI 10/10, sync 53/53, sync-backend 75/75,
  desktop 177/177, and web 4/4 tests passed.
- Changed-file Biome and `git diff --check` passed.
- `pnpm build:desktop:dist` passed and produced the arm64 ZIP/package.
- Simplify, comments, and review-readiness completed for `5ddb7f5`.
- Repository-wide `pnpm check` remains blocked by the recorded mounted
  `brain/cloud/.hubble/**` formatting, `convex/tsconfig.json`, `skills-lock.json`, and
  storyboard CSS specificity diagnostics; no changed product file failed.

## Exact next step

Sign into the freshly built packaged app with a profile that can open the member
Workspace and a viewer-shared root. Repeat viewer menu inspection, Trash/restore with
the signed-in web surface open, the representative rich document comparison, and the
macOS spelling/text-services checks. Do not redeploy the backend.
