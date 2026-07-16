# Selected upstream improvements — Milestone 5 acceptance

Date: 2026-07-14

## Result

The authenticated Electron development app and packaged arm64 app completed the member
Workspace, editor-shared-root, viewer-shared-root, and direct-local-availability
matrix against dev deployment `strong-setter-709`. The run found and fixed one focus
defect: a document created from
a folder row opened and selected correctly but left tree focus on the prior row. Commit
`5ddb7f5` now requests stable-ID tree focus for the returned document, and the repeated
member and shared-editor flows focused the new reactive row after expanding its parent.

Milestone 5 is complete. The owner-side `testshare` fixture became available to the
signed-in packaged profile as a viewer-only shared root. Its empty context supplied a
focused negative check: the packaged tree rendered no rows, row-action triggers, or
menus; its context create controls were disabled; and no inaccessible Workspace
ancestor or sibling appeared. The read-only local-agent availability guide remained a
separate contextual onboarding surface outside the cloud tree, consistent with its
existing exact-scope projection contract rather than a direct row action.

The packaged profile became authenticated before implementation session 6 resumed.
That pass completed the packaged member, signed-in web Trash/restore, representative
rich-document, and native macOS text-service checks described below. The packaged
binary was relaunched with its existing profile and the development diagnostic flag
solely to expose CDP; it continued to load the packaged `file://` renderer from the
app bundle. No backend deployment occurred.

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
- The packaged `testshare` context identified `ado test's space · viewer`, rendered
  the empty shared-root state with zero tree items, action triggers, or menus, and
  disabled New document/New folder with `You can’t create in this context`. It exposed
  no Rename, Move, Trash, Share, or direct-local row action and no Workspace ancestor
  or sibling. The separate read-only local-agent onboarding card was confirmed outside
  the cloud tree.
- The directly available Hubble Brain folder retained Reveal, Copy path, Relocate, and
  Stop actions. Its `admin` descendant omitted those local actions. A real external
  Markdown edit to a temporary projected document reconciled into the open editor;
  the availability record returned `connected` with zero pending operations and zero
  recoveries. Trashing the canary removed its projected file.
- The current arm64 packaged app launched from
  `apps/desktop/release/mac-arm64/Hubble.app`. Its authenticated member Workspace
  exposed the compact root create controls and the expected Rename, Move…, and Move
  to Trash document menu. A temporary root document went through the existing
  destination dialog, create, rename, Trash confirmation, and Undo flow.
- The signed-in web surface observed that packaged document disappear reactively and
  return after Undo without a reload. The temporary document was then soft-trashed;
  no permanent deletion was used. The existing package session was copied in memory
  to localhost browser storage for this local acceptance only; no token value was
  logged or written to the repository.
- A temporary externally projected Markdown document exercised frontmatter, h1/h2,
  paragraphs, emphasis/link, nested lists, blockquote, table, rule, code block, image,
  and shared presence chrome on both packaged desktop and authenticated web. Both
  renderers produced the same node counts and structure. Light/dark screenshots were
  inspected on both surfaces; the theme-safe quote, rule, table, and code styling held,
  and both reported the selected 12px (`0.75em`) top-level rhythm. Removing the
  projected fixture removed it reactively from both surfaces.
- The packaged macOS context menu on selected `spelingg` exposed the `spelling`
  suggestion, Add to Dictionary, Cut/Copy/Paste/Select All, AutoFill, and the host's
  Query GPT text service. The application Edit menu exposed Writing Tools. Add to
  Dictionary was intentionally not invoked because acceptance must not permanently
  mutate the user's dictionary. The existing Electron regression invokes the
  suggestion and verifies `replaceMisspelling`; repeated automation could not keep
  the native popup available long enough to click it again after inspection.

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
- Session 6 added no product-code change or backend deployment. CDP verified the
  authenticated packaged member menu/create flow, packaged-to-web reactive Trash and
  Undo, matching rich-document structure and light/dark rendering, and the native
  spelling/text-service menu. All session fixtures were removed or soft-trashed.
- Session 7 added no product-code change, fixture mutation, or backend deployment.
  CDP confirmed the actual packaged `file://` renderer, the authenticated viewer role,
  disabled context creation, zero tree rows/action triggers/menus, and subtree
  isolation for `testshare`.
- Repository-wide `pnpm check` remains blocked by the recorded mounted
  `brain/cloud/.hubble/**` formatting, `convex/tsconfig.json`, `skills-lock.json`, and
  storyboard CSS specificity diagnostics; no changed product file failed.

## Exact next step

None for this plan. All five milestones and the prescribed packaged acceptance matrix
are complete; return to the repository roadmap's next independently prioritized build
item.
