# Brain Activity Log

## 2026-07-15 — Selective folder authority Milestone 2 completed

- Added atomic versioned device-local placement and authority-transfer stores, pure
  mixed Git/cloud tree composition, deterministic Markdown/asset manifests, and
  read-only Git/repository inspection with a fixed command allowlist, path
  canonicalization, exclusions, dirty-state snapshots, collisions, and fingerprints.
- Added development-only **Move to Hubble Cloud…**, **Share…**, and permission-gated
  **Move to Git…** previews. They name paths, content/exclusions, exact available
  member/share/link roles, Git/history/web/realtime consequences, offline/stale/
  collision states, and never expose confirmation or a production entry point before
  the transactional backend exists. Inherited guest audience gaps remain explicitly
  blocked for the Milestone 3 prepare API.
- Real Electron/CDP acceptance inspected tracked `specs/` content, detected and
  refreshed a temporary working-tree change as stale, cancelled without source/cloud
  mutation, and restored focus to the invoking folder action. The isolated profile
  was signed out, so Cloud-to-Git live interaction was not claimed; automated
  capability/menu coverage passes.
- Verification: `pnpm build:desktop`; sync 58/58, cloud UI 10/10, sync-backend 75/75,
  and desktop 194/194 tests; changed-file Biome and diff checks. No deployment, cloud
  fixture, push, PR, availability root, or lasting acceptance file was created.

## 2026-07-15 — Selective folder authority Milestone 1 completed

- Added a persisted Git/cloud desktop content discriminator while retaining the
  existing local-root path and cloud Workspace/shared-folder IDs as canonical state.
  Legacy state with a restored folder migrates to Git without erasing either choice.
- Opening a folder now selects the direct Git filesystem tree in cloud-configured
  builds. Sidebar, create/open commands, toolbar, home, editor selection, and import
  interception use the active content context rather than Convex availability.
- Added one two-way switcher path between recent Git roots and cloud contexts plus one
  textual Git marker at the direct root. Move actions, placement/authority registries,
  and cloud/local-availability mutation remain outside this milestone.
- Verification: 182 desktop tests, changed-file Biome, diff checks, desktop production
  build, and an isolated real Electron run covering one root/marker, a direct Markdown
  save and cleanup, Git → Cloud → Git switching, and Git relaunch persistence.
- The first acceptance command mistakenly used the recursive workspace dev script,
  which started the configured Convex dev watcher and reported unchanged functions
  ready before shutdown. It did not mutate fixtures; all subsequent acceptance ran
  from the isolated desktop package with no backend watcher.

## 2026-07-15 — Selective folder authority technical plan completed

- Revalidated the Git-default PRODUCT contract against the production desktop shell,
  filesystem and cloud trees, import path, local-availability/projection lifecycle,
  Convex permissions, Trash, and recovery code at `f758dde`.
- Added `specs/folder-authority-mobility/TECH.md`, mapping all 41 invariants to a mixed
  tree, device-local placement/operation state, read-only Git inspection, hidden cloud
  staging/archive, lossless cutovers, and explicit verification.
- Selected Milestone 1 as the first tracer bullet: restore Git as a production content
  context with one direct-root marker and no upload/transfer mutation. No product code,
  cloud fixture, backend deployment, push, or PR changed in this planning pass.

## 2026-07-15 — Local-agent availability Milestone 4 committed

- Audited and revalidated the existing contextual repository-link journey without
  mutating cloud, backend, or repository-link fixtures. All 178 desktop tests,
  changed-file Biome, diff checks, and `pnpm build:desktop` pass.
- Committed the implementation, focused TECH/run evidence, and matching roadmap update
  in `87a2d25`. Packaged physical-keyboard, VoiceOver, external-edit, relaunch, and
  Settings-management acceptance remains an explicit host gate.

## 2026-07-15 — Brain returned to Git; selective folder authority specified

- Restored all 13 active Hubble Brain documents byte-for-byte from the live cloud
  projection into tracked `brain/` paths; runtime `.hubble` metadata and Trash
  backstops were not treated as product documents.
- Retired the local `brain/cloud/` availability record and mount while preserving a
  temporary out-of-repo rollback copy. The cloud workspace remains a recovery backstop
  but is no longer canonical.
- Recorded the product correction: Git is the default for repository content; a folder
  moves to Hubble Cloud only for realtime collaboration or repository-independent
  access/privacy, and may move back later.
- Added the user-visible authority/movement contract at
  `specs/folder-authority-mobility/PRODUCT.md`, superseded ADR-0010 with ADR-0011, and
  redirected the roadmap from mandatory-cloud onboarding polish to the companion
  technical plan.
- Source: `sources/2026-07-15-git-default-folder-authority.md`.

## 2026-07-14 — Selected upstream improvements complete

- Completed Milestone 5 and the full five-milestone plan. The authenticated packaged
arm64 `file://` renderer selected the new `testshare` viewer root and exposed no
cloud-tree rows, action triggers, menus, direct-local row actions, or inaccessible
Workspace ancestors/siblings; context New document/New folder controls were
disabled with an explicit read-only explanation.
- The exact-scope read-only local-agent onboarding card was verified as a separate
surface outside the tree. No fixture mutation or backend deployment occurred.
- The existing editor/UI/cloud UI/sync/backend/desktop/web package matrix,
changed-file Biome, diff checks, packaged dist build, simplify, comments review,
and review-readiness remain the final implementation verification baseline.
- Source:
`specs/upstream-selected-improvements/runs/2026-07-14-milestone-5-acceptance.md`;
build state: `brain/synthesized/roadmap.md`.

## 2026-07-14 — Desktop share selector stacking fix

- Raised the shared folder/document role and link-access selector positioner portals
above the modal layer, fixing menus that opened behind the share dialog.
- Real Electron/CDP acceptance on `testshare` confirmed the viewer option was visibly
topmost, accepted the click, changed the trigger value, and left the dialog open.
- Verification: cloud UI 10/10 tests, changed-file Biome, diff checks,
simplify/comments/review-readiness, and `pnpm build:desktop`. No backend deployment,
product-direction change, push, publication, or PR occurred; roadmap sequencing is
unchanged.

## 2026-07-14 — Selected upstream improvements Milestone 5 packaged continuation

- Resumed the authenticated arm64 package and completed the member create/menu flow,
signed-in packaged-to-web reactive Trash/Undo, and cleanup through soft Trash.
- Rendered one temporary directly projected representative document on packaged
desktop and web. Matching frontmatter, headings, nested lists, quote, table, rule,
code, image, and presence structure passed in inspected light/dark screenshots with
the selected 12px block rhythm; projection removal cleared both surfaces.
- The packaged macOS text menu exposed a live spelling suggestion, Add to Dictionary,
ordinary edit actions, AutoFill, and a host text service; Writing Tools remained
present in the application Edit menu. The permanent dictionary mutation was not
invoked. Existing regression coverage directly verifies suggestion replacement.
- No product code, backend deployment, push, publication, or PR occurred. Temporary
fixtures were removed or soft-trashed. The sole remaining external gate is a real
viewer-shared root for packaged no-write/no-leak menu inspection.
- Source:
`specs/upstream-selected-improvements/runs/2026-07-14-milestone-5-acceptance.md`;
build state: `brain/synthesized/roadmap.md`.

## 2026-07-14 — Selected upstream improvements Milestone 5 integration pass

- Completed the available populated member, editor-shared-root, and direct-local-
availability matrix for cloud create controls and row menus. Pointer/right-click,
Shift+F10, Context Menu, Escape restore, rename, same-boundary move, exact repo-impact
review, Trash/Undo, subtree isolation, and direct-only local actions passed.
- A real external edit to a temporary Hubble Brain projection reconciled into the
editor; the projection returned connected with zero pending/recovery operations. All
temporary visible fixtures were soft-trashed, and the projected canary file was
removed without permanent deletion.
- Live acceptance found that row-created documents opened but left tree focus on the
prior row. Commit `5ddb7f5` routes the returned cloud ID through stable-ID focus and
ancestor expansion; repeated member and shared-editor creation passed.
- Verification: editor 79/79, UI 20/20, cloud UI 10/10, sync 53/53, sync-backend
75/75, desktop 177/177, and web 4/4 tests; changed-file Biome; diff checks;
`pnpm build:desktop:dist`; simplify, comments, and review-readiness. The known
repository-wide formatting/specificity diagnostics remain unchanged.
- Safety incident: an attempted anonymous local Convex start prompted a project link
and unexpectedly updated dev `strong-setter-709`; the canonical desktop dev command
also ran the backend watcher. No further deployment or rollback was attempted. See
`specs/upstream-selected-improvements/runs/2026-07-14-milestone-5-acceptance.md`.
- Remaining external gates: this account has no viewer-shared root, and the fresh
package opens signed out because packaged auth storage does not inherit the dev HTTP
origin. Next: interactively sign into the package with viewer access and finish the
viewer, desktop/web Trash, rich-document, and native text-service checks without
redeploying.

## 2026-07-14 — Selected upstream improvements Milestone 4 complete

- Landed coherent attributed commit `2bb2e5d`, rebuilding the selected row-menu
interaction on the cloud-ID current-context tree without importing upstream filesystem
authority, path identity, direct deletion, or low-level folder move behavior.
- Document rows now offer Rename, prepared/confirmed Move with exact audience/public/
repository review, and Move to Trash with Undo. Folder rows combine create, rename,
owner-authorized Share, Trash, and direct-only local availability actions in one menu.
- Added permission-checked uniform member and per-node shared-subtree capabilities so
stronger direct descendant grants remain usable under a read-only shared root while
unauthorized actions stay absent. Stable-ID focus expansion/fallback preserves roving
tree behavior across pointer context menus, Shift+F10/Context Menu invocation, menu
dismissal, reactive reorder, move, Trash, and restore.
- Verification: cloud UI 10/10, sync-backend 75/75, and desktop 177/177 tests;
cloud UI/desktop TypeScript; changed-file Biome; diff checks; simplify, comments, and
review-readiness; and `pnpm build:desktop`. Repository-wide `pnpm check` remains
limited only by the recorded mounted `.hubble` metadata, unrelated config formatting,
and storyboard specificity diagnostics.
- Next: TECH Milestone 5's member/editor/viewer/direct-availability integration and
packaged UI acceptance against a backend containing this commit. No push, deployment,
publication, or PR occurred.

## 2026-07-14 — Selected upstream improvements Milestones 1 and 2 complete

- Landed coherent, attributed commits `6d95b76` through `845db06` for UTF-8 and
delayed-save safety, storage failures, link/list/image/clipboard/emphasis invariants,
caret/native text actions, asset-transfer retry reporting, and save-timer cleanup.
- A real mixed-image visual fixture exposed the missing reusable projection-schema
image node. Fixed the contract, restored and verified the touched dev test document,
then continued with detached non-persistent fixtures.
- Adopted the roomier shared editor rhythm while preserving fork-only tables, tasks,
presence, and node views; restored nested flow and shared dark tokens with web.
- Verification: desktop and web visual acceptance in light/dark at 560/900/1440
pixels; editor 79/79, UI 20/20, cloud UI 5/5, sync 53/53, desktop 177/177, and web
4/4 tests; changed-file checks; and `pnpm build:desktop`. Repository-wide `pnpm
check` remains limited by known mounted/unrelated formatting diagnostics.
- Next: Milestone 3's capability-aware current-context create controls.

## 2026-07-14 — Selected upstream improvements implementation session 1

- Began `specs/upstream-selected-improvements/TECH.md` Milestone 1 without changing
cloud authority, projection scope, or sidebar behavior.
- Committed `6d95b76`: validated UTF-8 byte transfer for desktop text writes plus
delayed self-save watcher classification that preserves newer editor drafts. The
commit carries the required `c99e80d` upstream trailer.
- Implemented and tested best-effort browser-storage reads/writes. The valid in-memory
update survives quota/security failures, but this slice remains uncommitted because
the managed sandbox began denying `.git/index.lock` creation.
- Verification: focused desktop tests 28/28 and storage tests 4/4; renderer and
Electron TypeScript checks; changed-file Biome and `git diff --check`. The broader
desktop suite passed 167 non-socket tests; six CLI-server socket tests were blocked
by the known managed-sandbox `EPERM` restriction.
- Next: commit the isolated storage slice once Git index writes are available, then
resume Milestone 1 with adjacent link attributes and list change accumulation.
- Source: `specs/upstream-selected-improvements/TECH.md`; build state:
`brain/synthesized/roadmap.md`.

## 2026-07-14 — Selective upstream intake process

- Added the repo-owned `$upstream-intake` workflow with default, review-only, and
branch-only modes, isolated worktree application, semantic product-boundary review,
durable dispositions/attribution, verification, and guarded fast-forward landing.
- Added `pnpm upstream:audit`, a standard-library-only Markdown/JSON audit that validates
the saved watermark, optionally fetches only remote-tracking state, and reports target
cleanliness, divergence, new commits, path overlap, merge conflicts, and queued
candidates without changing the worktree, index, or local refs.
- Seeded the 2026-07-14 strategy screen and 13 retained candidates under
`specs/upstream-intake/`. No real upstream intake, fetch, candidate port, push, PR,
deployment, or upstream mutation occurred.
- Verification: audit fixtures 12/12; Markdown and JSON no-fetch audits; the exact
`pnpm upstream:audit` command from every workspace package; changed-file Biome;
`git diff --check`; `pnpm build:desktop`; simplify/comments/review-readiness. The
current offline audit reports zero new commits beyond `72c9e808`, 36 overlapping
paths, and 27 conflict events affecting 28 paths.
- Source: `/tmp/hubble-upstream-intake-implementation-plan.md`; durable policy and run
record: `specs/upstream-intake/`.

## 2026-07-13 — Local-agent onboarding Milestone 3 packaged acceptance pass

- Ran the clean-profile packaged desktop journey against populated dev data.
- Verified contextual member setup, exact Workspace isolation, root/nested/empty-folder materialization, external Markdown reconciliation, relaunch, real token refresh, editor-shared scope, keyboard focus, and renderer accessibility-tree announcements.
- Found and fixed an occupied-destination safety defect; the rebuilt package now rejects foreign content before writing and preserves the sentinel byte exactly.
- Acceptance remains incomplete because this account exposes no viewer-shared root, macOS revoked assistive access before literal VoiceOver speech could be recorded, and the offline/interrupted matrix still needs a clean rerun. The temporary cloud folder `M3 Empty Acceptance 2026-07-13` in `Phase 3 Acceptance 2026-07-13`, isolated profile, and named local acceptance roots also remain queued for removal.
- Source: `specs/local-agent-availability-onboarding/TECH.md`; build state: `brain/synthesized/roadmap.md`.

## 2026-07-13 — Local-agent onboarding Milestone 3 packaged acceptance pass

- Ran the clean-profile packaged desktop journey against populated dev data.
- Verified contextual member setup, exact Workspace isolation, root/nested/empty-folder materialization, external Markdown reconciliation, relaunch, real token refresh, editor-shared scope, keyboard focus, and renderer accessibility-tree announcements.
- Found and fixed an occupied-destination safety defect; the rebuilt package now rejects foreign content before writing and preserves the sentinel byte exactly.
- Acceptance remains incomplete because this account exposes no viewer-shared root, macOS revoked assistive access before literal VoiceOver speech could be recorded, and the offline/interrupted matrix still needs a clean rerun. The temporary cloud folder `M3 Empty Acceptance 2026-07-13` in `Phase 3 Acceptance 2026-07-13`, isolated profile, and named local acceptance roots also remain queued for removal.
- Source: `specs/local-agent-availability-onboarding/TECH.md`; build state: `brain/synthesized/roadmap.md`.
- 2026-07-11 — Added the backend half of Phase 3's atomic relocation seam.
`prepareDocumentRelocation` authorizes both sides and compares inherited user shares,
public access, and repo-link exposure in one Convex transaction. Neutral moves update
folder/title/path atomically; consequential moves return a fingerprint plus bounded
impact without mutating the document. Backend 66/66 and client/sync typechecks pass.
Next: confirmation revalidation and watcher-side durable review operations.
- 2026-07-11 — Began desktop projection Phase 3 with explicit filesystem target
topology. Whole-workspace materialization now persists every cloud folder, including
empty folders and parent identity; watcher creates and correlated moves consult it
before the sibling-document fallback. Sync 43/43, desktop 124/124, and desktop build
pass. Next: atomic prepare/confirm relocation and consequential-move journaling.
- 2026-07-11 — Desktop projection Phase 2 startup safety completed at
code/test/build level: v2 mount-identified index envelope with lossless v1 migration
and observed topology; mount mismatch review; persisted offline/access verification
gates that never touch local bytes; distinct verifying/offline/pending-review status.
Sync 43/43, desktop 123/123, desktop production build passes. Packaged live acceptance
remains outstanding; next build slice is Phase 3 filesystem operation policy and review.
- 2026-07-11 — Added guarded projection-plan application. Startup captures the exact
destination hashes reviewed by the no-write plan, and the materializer compare-checks
each cloud-document destination immediately before writing. A late local edit now
stops the pass, preserves its bytes, and persists a typed `guard-conflict` operation.
Pure and service regressions pass (42 sync tests, 121 desktop tests). Next: versioned
index topology and mount identity, then offline/access verification.
- 2026-07-11 — Added quit-time move correlation to Phase 2 startup safety. Missing
indexed paths are matched to new Markdown by inode first and exact content hash second;
only one-to-one matches are classified as moves. Unique moves and ambiguous candidate
sets persist in the projection-operations journal, while cloud mutations and local
writes remain paused for review. Pure and service regressions pass (40 sync tests, 120
desktop tests). Next: guarded plan application, then versioned index topology/mount
identity and offline/access verification.
- 2026-07-11 — Added the versioned device-local projection-operations journal for
Phase 2 startup blockers. Missing managed documents and untracked desired-path
collisions now persist under `.hubble/pending/` with stable operation IDs, document and
folder identity, relevant hashes, and creation/update timestamps; no credentials are
stored. Synced-folder status exposes the pending count, and a resolved collision
durably clears on the next successful startup. Added pure persistence and service
integration regressions (38 sync tests, 119 desktop tests); `pnpm build:desktop`
passes. Next: correlate quit-time missing/add pairs by inode/hash and journal
unambiguous versus review-required move intent.
- 2026-07-11 — Added the next Phase 2 startup-safety slice: the desktop computes the
exact desired cloud projection through the existing path allocator on an in-memory,
no-write filesystem, then scans disk before materialization. New untracked Markdown is
distinguished from untracked files that collide with desired cloud paths; collisions
pause startup while preserving the local bytes and leaving the projection index
unwritten. Added pure planner and service regressions (36 sync tests, 119 desktop
tests); `pnpm build:desktop` passes. Repository-wide `pnpm check` still reaches the
previously recorded unrelated formatting diagnostics. Next: versioned durable pending
operations, then quit-time move correlation and guarded plan application.
- 2026-07-11 — Landed the first Phase 2 startup-drift safety slice in the working
tree. `SyncedFolderService.connect` now inspects all prior indexed files before cloud
materialization: quit-time tracked edits reconcile from the saved base first; missing
tracked files and unsafe reconcile backstops pause materialization without touching the
local path. Added a pure drift classifier and service regressions (34 sync tests, 118
desktop tests; relevant type checks clean). Deferred explicitly: untracked
files/collisions, quit-time rename/move correlation, durable pending operations, and
offline/access verification. The internal flag moves to the first coordinator/UI
runtime path; this safety correction applies to the existing engine.
- 2026-07-11 — Completed desktop cloud-workspace Phase 0 architecture revalidation
against `8f2fb06` plus the projection-guard working tree. Changes since the original
pin are install/auth handoff and repo-root resolution only; current ownership and phase
ordering remain valid. Added ADR-0010 for the cloud-authoritative/writable-projection
desktop model and reconciled `CONTEXT.md`, ADR-0009, and active synced-folder guidance.
Next implementation slice: internal development flag, then startup drift inspection
before every cloud materialize.
- 2026-07-11 — Closed the two Phase 2 projection-correctness gaps at code/test level.
Document `path` is now the canonical filename shared by desktop materialization and
CLI folder export, with title fallback for legacy pathless docs; existing mounts use
the current document-ID rekey migration. Watcher events now wait for an in-flight
materialize pass to install its reverse index/self-write hashes, preventing the
materializer's own `add` from entering the new-document import path. Added divergence
and paused-mid-write race regressions; 33 sync tests and 116 desktop tests pass, plus
sync/desktop/CLI type checks. Repository-wide `pnpm check` remains blocked by existing
format diagnostics in live-mount metadata, archived storyboard HTML, and other
unrelated files. Next: desktop cloud-workspace TECH revalidation and Phase 0 startup
drift gate; live dogfood acceptance of the filename migration remains outstanding.
- 2026-07-11 — Magic-flow Phases 3+4 implementation independently audited rather
than accepted from the session handoff. `hubble ensure-desktop` now covers macOS app
detection, explicit permission, architecture-specific release selection,
size/SHA-256 verification, installation, launch, and a two-minute single-use auth
handoff that avoids copying the CLI refresh token. The repo-link form now resolves
selected child directories to the git root and keeps suggested versus custom mount
paths distinct. Reproduced 183 tests plus desktop and CLI builds; fixed partial
download-write handling during review. Packaged release publication, a clean-machine
end-to-end install, and packaged visual form QA remain explicit operator gates. Run
record: `specs/hubble-init/runs/2026-07-11-magic-flow-phase-3-4-verification.md`.
- 2026-07-11 — Converted the desktop IA discussion and adversarial sync review into a
durable implementation handoff: observable product contract at
`/specs/desktop-cloud-workspace/PRODUCT.md` and a commit-pinned, mandatory-revalidation
architecture plan at `TECH.md`. Resolved the net filesystem UX: quit-time edits are
protected before startup materialization; safe edits remain automatic;
access/repo-exposure moves get an immediate impact-preview modal; ordinary delete is
Trash + Undo; suspicious/bulk/quit-time deletion requires review; deleting a local
root only stops availability. Updated vision, decisions, open questions, sequencing,
pending-extraction status, roadmap, and legacy-doc supersession pointers. Public
marketing/support copy is intentionally deferred until packaged behavior is shipped
and QA-verified.
- 2026-07-11 — **Magic-flow Phases 1+2 live-verified; this brain is now a live
mount.** `hubble login` device-flow proven end-to-end on dev (one browser approve;
refresh-token rotation across multiple commands; approve had to become an action —
nested mutations lose built-in env vars, fixed + committed). `hubble mount` proven:
zero-click socket link on a scratch repo (file→cloud ≤12s, cloud→file ≤10s), then
`brain/cloud/` relinked live (11 docs), local-only 2026-07-11 entries merged up to
cloud, static-era slug files removed (live projection names by title, export by
path — inconsistency flagged). New platform bug found+contained: CLI doc-create
with title≠path into a watched mount triggered a materialize↔ingest duplication
loop (6 copies; 5 removed). Run record:
`specs/hubble-init/runs/2026-07-11-magic-flow-live-acceptance.md`.
- 2026-07-11 — Desktop navigation IA resolved from dogfood: one current context and
one folder/document tree; no peer **Folders**, **Live Documents**, and **On this
computer** sections. Repo-linked projections become contextual availability;
standalone local-authority editing is excluded while watched local editing of cloud
folders remains essential. Added source,
product-decision entry, current-vision timeline entry, and roadmap implementation
follow-up.
- 2026-07-11 — Published the Phase 3 filesystem operation policy and review queue as
GitHub issues #168–#173: atomic relocation confirmation, watched relocation routing,
durable consequential moves, desktop review/cancellation, deletion classification,
and Trash/Undo recovery. Recorded the dependency graph in the git-side roadmap.
Label application is maintainer-gated because the authenticated GitHub user can
create issues but cannot add or remove repository labels.
- 2026-07-11 — Implemented and committed Phase 3 atomic relocation confirmation
(`7377eec`, issue #168 closed): confirmation-time authorization and fingerprint
revalidation are transactional; stale impact returns for renewed review without a
move. Backend tests pass 68/68; sync and Convex-client typechecks pass. Next: #169
watcher routing.
- 2026-07-11 — Implemented watched relocation policy plus durable consequential moves
(`775b739`, issues #169–#170 closed): neutral watcher moves use atomic prepare;
consequential intent is journaled before review, survives startup refresh, tracks
destination edits, and pauses materialization to preserve both paths. Sync 44/44,
desktop 125/125, and full desktop build pass. Next: #171 review approval/cancellation.
- 2026-07-11 — Phase 1 `hubble login` implemented in the working tree: device-flow
auth on convex-auth (`deviceAuth` request/approve/poll with burn-on-read, `/device`
approval page in www, CLI credentials at `~/.hubble/credentials.json` with
refresh-token rotation). Kills the throwaway-account dance; apply-mode now creates
workspaces as the logged-in user. DESIGN.md gaps #1 + #9 closed.
- 2026-07-11 — Phase 2 zero-click live link implemented in the working tree:
desktop `hubble://` registration, local 0600 CLI socket (`status`, `link-repo`),
shared repo-link execution, auth deployment guard, socket-triggered undo toast,
clean undo removal via sync-index hash checks, `lastReconcileAt` status, and CLI
`hubble mount` liveness verification. `hubble cloud folder export` now writes
`.hubble-export.json` so static exports cannot be confused with live mounts. Next:
dogfood by relinking this repo's `brain/cloud/` through the new command.
- 2026-07-10 — **The split (Track C target 2).** hubble-init apply run moved this
brain's strategy/vision half to the "Hubble Brain" cloud folder (workspace "Hubble
Product Brain", dev): 8 whole docs + cloud halves of decision-log
(product-decisions.md) and roadmap (track-strategy.md). Governance consolidated to
git-side BRAINKEEPER.md. Export-diff gate: zero content loss; whitespace + mark-order
normalizations recorded; all exports round-trip fixed points. Pre-move git sha
b18e84f; move commit fa26cc4. Run record:
/specs/hubble-init/runs/2026-07-10-hubble-brain-apply-run.md. This entry is the
first cloud-side log write.
- 2026-07-10 — Desktop repo-link of "567 Brain" verified live (roadmap NEXT STEP
item 1, RB3 path against an init-created folder). Owner-membership handoff put
the workspace in the picker; mount at `567-platform/brain/cloud/` with repo
root; git exclude + BRAIN.md seeded; live watch proven both directions (app
edit → file; file append → cloud in ~5s). Took three link attempts — UX
friction filed in roadmap: repo picker expects git root; mount-path field
retains stale values. Old serializer bug visible in the stale export
(`*********optionally*********`) vs clean live projection confirmed the Gap #8
fix on real data. Next: split THIS repo's brain (item 3).
- 2026-07-10 — Serializer idempotency fixed (DESIGN.md gap #8, all four bugs):
nested-emphasis divergence (root cause: per-text-node mark wrapping; now
mark-run serialization), lone `~` doubling (`singleTilde: false`), verbatim
frontmatter round-trip (opaque `frontMatter` node), bare-URL/autolink style
preservation. New `roundTrip.test.ts` idempotency corpus; 49/49 editor tests
green, desktop tsc clean. Implemented via Codex delegation, Claude-reviewed.
Committed (`f8048e3`) — then live smoke on dev caught a hole the unit tests
missed: the server projection path (`schema.nodeFromJSON`) re-sorts marks by
schema rank, re-breaking nested emphasis. Two follow-up rounds (`68d15eb`):
order-insensitive mark serialization (nesting by run length) and trailing-
newline normalization (non-empty output ends with one `\n`). Regression suite
now runs every corpus case through plain AND schema-normalized paths. Dev
backend redeployed; CLI upload→projection→export verified **byte-identical**
live (smoke workspace `serializer-smoke-0710`, leavable residue). Roadmap
NEXT STEP item 2 done; item 3 (brain split) unblocked.
- 2026-07-09 — Added uncommitted build-state note for GFM table support in
`brain/synthesized/roadmap.md`: shared editor schema + markdown round-trip,
slash-command insertion, table controls, and editor styling. No roadmap priority
change; apply-mode remains the next step.
- 2026-07-09 — Brain established. Created `brain/` (README, RESOLVER, BRAINKEEPER,
synthesized/{current-vision, decision-log, open-questions, roadmap}, sources/, admin/).
Archived 17 executed/superseded docs + `tasks/` to `/specs/realtime-collab/archive/`.
Rewrote specs README; added banner to REPO-BRAIN-VISION.md; wrote
`/specs/hubble-init/DESIGN.md`; added brain pointer to repo CLAUDE.md. Storyboard
already at v1.1 (agent-init) from earlier in the session.
- 2026-07-09 — First hubble-init dry run (Track B → C gate 1). Drafted
`.claude/skills/hubble-init/SKILL.md` (dry-run only), ran it on `brain/`, captured
Adrian's triage answers, folded three new defaults back into the skill. Run record:
`specs/hubble-init/runs/2026-07-09-brain-first-dry-run.md`; decision-log entry added;
source: `sources/2026-07-09-first-init-dry-run-triage-answers.md`.
- 2026-07-09 — Third hubble-init dry run (foreign repo: 567-platform brain, 50 files).
Four new defaults (consumer check, source-corpus integrity, assets stay git-side,
consolidation-with-tradeoffs); DESIGN.md gaps #6–7 added. Run record:
`specs/hubble-init/runs/2026-07-09-567-brain-generalization-run.md`.
- 2026-07-09 — Progress contract installed: CLAUDE.md gained Progress-contract +
merged AGENTS.md content; AGENTS.md replaced with a symlink to CLAUDE.md (stale
PROGRESS.md pointer removed). DESIGN.md + SKILL.md updated (rule 8, apply-mode
seeding). Decision-log entry added.
- 2026-07-09 — Second hubble-init dry run (archive stress corpus, 35 files). Three
new defaults folded into the skill (no archive exemption; cloud holds strategy
history; relocate-within-git verb). Run record:
`specs/hubble-init/runs/2026-07-09-archive-stress-run.md`; decision-log entry;
source: `sources/2026-07-09-archive-stress-run-answers.md`. Flagged for later:
ORCHESTRATION-NOTES.md is misfiled in the archive (un-archive decided, applies at
apply-mode time or earlier by hand).
- 2026-07-09 — Version-history verification run (code audit + live dev-deployment
test): no-data-loss gate for the split dogfood is now ✅ with caveats. Wrote
specs/hubble-init/VERIFICATION-version-history.md; updated roadmap + open-questions.
- 2026-07-11 — Phase 3 desktop consequential-move review implemented in the working
tree (#171): durable coordinator/IPC list, approve, and cancel APIs; confirmation-time
fingerprint refresh; cancellation restores edits made during review; occupied-source
collisions preserve both files as durable recovery work. Added an accessible
Hubble-owned dialog and notification fallback. Desktop tests 128/128 and production
build pass. Remaining acceptance: richer named role/repo-path impact payload and
packaged live QA.
- 2026-07-11 — Phase 3 deletion classification implemented in the working tree
(#172): the move-correlation expiry is now a bounded aggregation gate; only one
online writable unlink can reach cloud Trash. Bulk, read-only, offline, missing-root,
and unavailable-parent/storage cases persist one review operation without cloud
mutation; offline bursts coalesce and startup refresh retains them. Desktop 133/133,
sync 45/45, and full desktop build pass. Packaged filesystem-event QA remains; next
is #173 Trash/Undo recovery.
- 2026-07-13 — Phase 3 Trash/Undo recovery implemented at code/test/build level in
the working tree (#173): local deletes persist stable intent before cloud Trash,
resume after restart, and expose durable desktop Undo; offline/bulk approvals are
bounded to 25 documents. Remote Trash now removes clean managed copies, remote
restore rematerializes, and occupied restore paths preserve both versions as durable
recovery work. Sync 46/46, desktop 135/135, backend 69/69, and the full desktop build
pass after simplify/review-readiness. Packaged real-filesystem acceptance remains;
#171 also retains its richer impact-preview gate.
- 2026-07-13 — Phase 3 Trash/Undo real-filesystem acceptance passed in an isolated
Electron profile (#173): single-delete Undo survived restart; offline, bulk, and
quit-time deletions stayed durable and cloud-safe; remote Trash removed clean local
projections; remote restore preserved occupied paths as collision work. The run
found and fixed production offline detection plus two restart-only recovery gaps
(pending-count reload and completing watcher/subscription startup after review).
Run record: `specs/realtime-collab/runs/2026-07-13-phase-3-trash-undo-acceptance.md`.
Issue #173 is accepted; #171's richer impact preview remains the Phase 3 gate.
- 2026-07-13 — Phase 3 consequential-move impact preview completed at
code/test/build level (#171): inherited role upgrades/downgrades now require review;
the atomic prepare/confirm response includes exact gain/loss counts, up to 25 named
before/after role changes, public-link role changes, and each added/removed
repo-linked folder's cloud path and repository metadata. Older pending-operation
journals retain their count/boolean fallback. Backend 70/70 and the full desktop
build pass after simplify/review-readiness. Next session: deploy to dev and run the
isolated Electron acceptance for preview rendering, stale refresh, approval, and
cancellation; then close #171 and Phase 3.
- 2026-07-13 — Phase 3 consequential-move isolated Electron acceptance passed
(#171): a real file move crossed named user-role, public-link, and repo-link
boundaries; the dialog rendered exact impact, stale approval refreshed without a
cloud move, reviewed approval committed, and Escape cancellation preserved an edit
made during review. The run found and fixed canonical relocation paths retaining
the mirror's workspace directory; whole-workspace and repo-mount path contracts now
have separate regression coverage. Desktop 137/137 and full build pass. Run record:
`specs/realtime-collab/runs/2026-07-13-phase-3-consequential-move-acceptance.md`.
Phase 3's isolated-Electron gates are complete; next is desktop cloud-workspace TECH
HEAD revalidation.
- 2026-07-13 — Desktop cloud-workspace TECH revalidated against `51f0ee9`; the first
Phase 4 multi-root slice now rejects local path and cloud-subtree overlap before
mount-side writes, makes whole-workspace and folder projections mutually exclusive,
and checks managed-document identity across every active engine. Added symlink and
ancestry regressions. Desktop tests pass 141/141 and `pnpm build:desktop` passes.
Next:
projection-manager ownership, aggregate operation/status routing, then folder-scoped
subscriptions.
- 2026-07-13 — Phase 4 projection manager implemented: one coordinator now owns the
whole-workspace and repo-folder engines, aggregates root status and pending journals,
resolves managed paths, cleans up failed mount starts, and routes move, deletion,
Trash, and recovery actions to the journal that owns each operation. Repo-linked
review events now use the same foreground dialog and OS notification path. Desktop
tests pass 144/144. Next: explicit event/status scope, folder-scoped subscriptions,
and `hubble status --json`.
- 2026-07-13 — Phase 4 multi-root correctness and agent status completed at
code/test/build level: renderer events and socket status are root-scoped; repo mounts
subscribe only to their cloud folder subtree; and `hubble status --json` exposes
per-root health, queued edits, pending review, recovery, Undo, and bounded
operation-kind counts without content or credentials. Desktop tests pass 145/145,
the production desktop build passes, and JSON plus human output passed a real
Unix-socket acceptance. Next: Phase 5 persisted CloudContext and unified cloud tree.
- 2026-07-13 — Phase 5 unified desktop navigation began behind
`VITE_UNIFIED_CLOUD_TREE=1`: persisted state now migrates to Workspace/shared-folder
`CloudContext`; guest-only accounts default to a top-most shared root; one cloud-ID
tree combines root folders/documents with keyboard navigation and context-scoped
search/create. The flagged shell removes the local filesystem tree and local
create/open entry points, joins repo-mount availability/status by folder ID, and
keeps healthy state quiet. Desktop tests 150/150, cloud UI 4/4, and the production
desktop build pass. A real Electron smoke pass confirmed legacy local-authority
labels/actions are absent; populated-cloud interaction remains because the dev
Convex push returned a transient 500.
- 2026-07-13 — Phase 5 contextual local-availability controls and multi-member create
prompting completed at code/test/build level behind the unified-tree flag. Directly
available roots expose reveal, copy path, relocate, and stop actions; relocate/stop
use a two-stage connected + byte-clean gate, relocation safely re-keys legacy/v2
indexes, and clean stop offers removal or an unmistakably detached copy. Workspace
creation now asks for a labeled destination when multiple members share the root.
Focused desktop tests pass 7/7, cloud UI tests 4/4, and the production desktop build
passes after simplify/review-readiness. Next: populated dev-tree keyboard,
screen-reader, and real-filesystem acceptance before removing the internal flag.
- 2026-07-13 — Phase 5 populated-tree acceptance preflight completed. Static review
fixed tree-item screen-reader names/menu semantics and initial focus in the
multi-member destination dialog. Cloud UI 5/5, focused desktop 7/7, changed-file
Biome, diff check, and the flagged desktop build pass after simplify/comments/review
readiness. The managed environment denied process inspection, local/Unix listeners,
and direct Electron startup before interaction, so the internal flag remains and
Phase 6 stays gated. Exact host checklist and evidence:
`specs/desktop-cloud-workspace/runs/2026-07-13-phase-5-acceptance-preflight.md`.
- 2026-07-13 — Phase 5 populated-tree host acceptance completed through the
detached-copy stop branch. Real Electron/CDP and populated dev data passed tree/AX
semantics, multi-member root+nested creation, native scratch-root relocation with v2
index rewrite/reconnect/post-move sync, and atomic dirty stop/relocate byte
preservation. The run fixed unified-shell mount reconnection, first local-menu-item
focus, and dialog-native initial focus. The clean-remove branch still requires
action-time deletion confirmation; literal VoiceOver speech and physical Shift+F10
also remain, so the flag stays and Phase 6 is gated. Evidence:
`specs/desktop-cloud-workspace/runs/2026-07-13-phase-5-populated-tree-acceptance.md`.
- 2026-07-13 — Implementation session 5 re-established the flagged populated-data
Electron gate and confirmed the pending Scratch projection reconnected `connected`
and inspected byte-clean at `/tmp/scratch-repo/Scratch-remove`. No destructive action
was taken: local removal still needs action-time human confirmation, literal
VoiceOver output was unavailable to the agent's macOS scripting session, and the
required physical Shift+F10 cannot be replaced by the already-passing synthetic
event. The projection remains intact; Phase 6 and flag removal remain gated.
- 2026-07-13 — Adrian authorized the Phase 5 acceptance cleanup. Hubble's real
**Remove local files** path removed the clean `/tmp/scratch-repo/Scratch-remove`
projection while preserving the Scratch cloud folder. The two Hubble Product Brain
acceptance documents and the accidental `adrian's space` document were moved to
Hubble Trash with a creation-time guard; older `Untitled` documents were preserved.
The remaining gate is human-only literal VoiceOver speech plus a physical Shift+F10
observation before the unified-tree flag can be removed.
- 2026-07-13 — Adrian completed the Phase 5 human accessibility gate. Physical
Fn+Shift+F10 on **Hubble Brain** opened the local actions menu; VoiceOver announced
**Reveal in file browser**, item 1 of 4, the local path, and the four-item menu. Cmd+N
announced the multi-member destination dialog with **Workspace root** selected and
focused, **Available to Workspace members**, its position, and the destination group.
Phase 5 populated-tree acceptance passes; next is flag/legacy production-branch
removal before Phase 6.
- 2026-07-13 — Phase 5 shipped out of its internal gate at code/test/build level.
Removed `VITE_UNIFIED_CLOUD_TREE` and the legacy signed-in cloud sidebar, create, and
dashboard branches; cloud-enabled desktop builds now always render the accepted
unified context/tree. The no-cloud fallback retains reusable local editor/filesystem
primitives for Phase 6 import. Desktop tests pass 154/154, changed-file Biome and diff
checks pass, and `pnpm build:desktop` passes after simplify/comments/review-readiness.
Next: folder-aware idempotent import plus destination-first copy/move UI.
- 2026-07-13 — Phase 6 destination-first import implemented at code/test/build level.
Opening or dropping unrelated Markdown now prompts for a labeled cloud destination
and copy/move intent. Folder-authorized imports are retry-idempotent and preserve
path collisions; copy retains a detached source, while move requires and verifies a
managed materialization before source removal. Backend tests pass 72/72, desktop tests
pass 155/155, and the production desktop build passes. Next: authorization-loss and
role-downgrade recovery, followed by minimal inspect/retry/defer/keep-detached controls.
- 2026-07-13 — Reprioritized the immediate build checkpoint around Adrian's desired
cross-device live test. Added a focused dev-release/install/acceptance plan, made it
the git-side roadmap's current next step, and recorded that Phase 6 recovery is paused
rather than dropped. The plan targets a verified unsigned `desktop-dev-latest` build
on a second Mac and uses the resulting sync/UX evidence to choose the following work.
- 2026-07-13 — Published and independently verified the unsigned cross-device dev
release. Dev Convex is restored/deployed with the candidate import and relocation
surface; workflow commits `d0a2cc1` (`v1-release`) and `3b22657` (`main`) fixed a
redundant pnpm-version input found by the first dispatch. Actions run `29297362856`
passed both architecture builds and published `desktop-dev-latest`; both downloaded
ZIPs match the manifest's commit, sizes, and SHA-256 hashes. A mistaken root-level
Convex invocation temporarily removed indexes/component registration, then the
correct package deploy restored every reported index and remounted ProseMirror before
publication. Next: second-Mac installation and the focused two-device live matrix.
- 2026-07-13 — Captured the first second-Mac onboarding findings from the packaged dev
release. The unsigned app's unexplained **Hubble Safe Storage** system prompt caused
an accidental Deny, establishing a need for pre-prompt context and recovery guidance.
An unrequested `README.md` import dialog then appeared only after sign-in. Code review
found that a launch-file argument or macOS `open-file` event can be queued before auth
and revealed only afterward, hiding its cause; the exact triggering event remains to
be reproduced. Routed both findings to the cross-device run record and roadmap while
keeping the acceptance gate open.
- 2026-07-13 — Promoted local-agent availability onboarding to the next implementation
step after the packaged second-Mac app showed cloud content and an HTML Apps/skills
promotion without a path for agents to access the Space. Adrian approved two journeys:
make the exact current Space/shared root available in a standalone local folder, or
link one cloud folder into one Git repository. Added a focused PRODUCT/TECH spec pair
under `specs/local-agent-availability-onboarding/`. The plan introduces a
Workspace-scoped projection instead of relabeling the broader legacy mirror,
generalizes per-device availability lifecycle, and gates skills guidance on a verified
selected-context path. The cross-device safety matrix remains open and can still
preempt the UX slice if it finds a correctness blocker.
- 2026-07-13 — Completed local-agent availability TECH Milestone 1 at code/test level.
Added the shared projection-scope/key contract, guarded Workspace mount identity,
Workspace-root plan/materialize behavior (root documents, nested/empty topology,
roles, canonical paths, and no unrelated Spaces/shares), Workspace-only Convex
subscriptions, and explicit scope selection in the desktop sync service. Existing
all-accessible and folder compatibility paths remain covered. A fresh revalidation on
the pinned `d0a2cc1` base restored dependencies from the local pnpm store; sync tests
pass 51/51, Convex-client tests 1/1, desktop tests 156/156, changed-file Biome passes,
and `pnpm build:desktop` passes. Next: Milestone 2's versioned local-availability
registry/migration and scope-keyed lifecycle APIs.
- 2026-07-13 — Completed local-agent availability TECH Milestone 2 at
code/test/build level. Added the atomic versioned `local-availability.json` registry
with idempotent valid-entry migration from untouched `repo-mounts.json`; generalized
projection engines, status/events, pending-operation routing, validation, reconnect,
relocate, and stop around stable Workspace/folder scope keys; and exposed typed
scope-based IPC/preload/renderer APIs while retaining folder-ID compatibility
adapters. Direct Workspace roots and folder ancestry/local-root overlaps are rejected
before setup mutations. The legacy all-accessible mirror is separately reported as
incompatible and is never auto-migrated. Desktop tests pass 160/160, changed-file
Biome and diff checks pass, and `pnpm build:desktop` passes after
simplify/comments/review-readiness. Next: TECH Milestone 3's primary contextual
standalone onboarding journey; Milestone 4's repo journey remains out of scope.
- 2026-07-13 — Completed local-agent availability TECH Milestone 3 implementation at
code/test/build level, leaving packaged host acceptance explicit. The selected member
Workspace/shared-folder now owns exact-scope local-agent discovery, a native
prospective destination chooser, guarded standalone creation, real lifecycle progress
announcements, cancel/retry/error/review states, persisted reconnect, quiet healthy
state, path actions, and copyable agent instructions. Legacy broad-mirror overlap is
named honestly, dismissal retains a compact contextual entry, generalized folder
controls now work for standalone shared roots, and broad dashboard-only Settings
discovery was removed while Settings management remains. Focused onboarding tests
pass 4/4, sync tests 51/51, changed-file Biome/diff checks and `pnpm build:desktop`
pass after simplify/comments/review-readiness; 158 desktop tests pass while six
CLI-server Unix-socket tests are sandbox-blocked by `EPERM`. The managed environment
also denied the real Electron/CDP workflow at process inspection/localhost binding,
so next is clean-host member/shared/offline/cancel/keyboard/VoiceOver acceptance
before Milestone 4's repo journey or skills-gating cleanup.
- 2026-07-14 — Completed local-agent availability TECH Milestone 3 packaged desktop
acceptance. The clean-profile member/editor matrix remained green, and a temporary
viewer-shared dev folder proved the exact contextual role/path preview, offline error
and retry state, interrupted-relaunch recovery, one-subtree disk isolation, and
read-only enforcement (mode `0444`; external append denied with unchanged bytes).
Packaged live regions and the CDP accessibility tree exposed literal scope, role,
path, progress, error, completion, and action labels. VoiceOver launched, but macOS
denied Apple-event access to its phrase/cursor/caption interfaces, so literal speech
could not be harvested on this host. Soft-removed both named temporary cloud folders,
stopped all projection/dev processes, and deleted the isolated profile and named
acceptance roots. Desktop tests pass 166/166 and `pnpm build:desktop` passes. Milestone
4 was not started.
- 2026-07-15 — Completed folder-authority mobility TECH Milestone 3 locally. Added
hidden operation-owned cloud staging, active-only read/write/share/asset boundaries,
authoritative audience and collision revalidation, bounded idempotent Markdown/asset
ingestion, exact verification, atomic activation, and bounded cancellation. The
desktop now performs recovery-first Git-to-cloud cutover with rollback before
activation, forward recovery afterward, a durable transfer journal, and one mixed-tree
cloud boundary at the former Git path. Production confirmation is enabled only behind
the complete online/auth/inspection/audience/freshness/journal gate. Automated suites
and the official desktop build pass; a non-mutating Electron/CDP pass verified the
production menu, read-only audience preview, disabled invalid-source confirmation,
cancel, and focus return. No real cloud cutover, fixture mutation, deployment, push,
or PR occurred. Next: Milestone 4's authoritative cloud manifest/archive APIs and
verified cloud-to-Git cutover.
- 2026-07-14 — Completed selected upstream improvements TECH Milestone 3 in local
commit `edd2f71`. The cloud-ID current-context sidebar now has capability-gated root
New folder and folder-row New document/New folder controls, preserves the existing
multi-member document destination flow, targets shared creation at the invisible
shared root, and focuses/scrolls newly created reactive folder rows after expanding
their ancestors. A non-mutating Electron/CDP pass confirmed the populated member
Workspace controls, accessible names/tooltips, focused folder-name dialog, parent
expansion, and coexistence with direct local-availability actions. Editor tests pass
79/79, UI 20/20, sync 53/53, cloud UI 8/8, and desktop 177/177; changed-file Biome,
diff checks, simplify/comments/review-readiness, and `pnpm build:desktop` pass.
Repository-wide `pnpm check` remains limited by the previously recorded mounted and
unrelated formatting/specificity diagnostics. Next: selected improvements Milestone
4's general capability-derived row action menus and safe document mutation flows.
- 2026-07-14 — Completed the first real selective-upstream intake planning pass.
Upstream remained at the existing `72c9e808` watermark. Adrian approved later
reimplementation of the retained correctness/native-editor candidates and selected
the upstream editor's roomier spacing plus compact sidebar create controls and row
menus. The sidebar interaction will be rebuilt on Hubble's cloud-ID current-context
tree with permission-aware creation, Trash language, and the existing consequential
move review; upstream filesystem authority and direct-delete behavior remain rejected.
Landed the implementation plan and intake record on `v1-release` at `161b226`; no
product code was ported and the candidate queue remains intact until verification.
- 2026-07-13 — Reprioritized the immediate build checkpoint around Adrian's desired
cross-device live test. Added a focused dev-release/install/acceptance plan, made it
the git-side roadmap's current next step, and recorded that Phase 6 recovery is paused
rather than dropped. The plan targets a verified unsigned `desktop-dev-latest` build
on a second Mac and uses the resulting sync/UX evidence to choose the following work.
- 2026-07-13 — Published and independently verified the unsigned cross-device dev
release. Dev Convex is restored/deployed with the candidate import and relocation
surface; workflow commits `d0a2cc1` (`v1-release`) and `3b22657` (`main`) fixed a
redundant pnpm-version input found by the first dispatch. Actions run `29297362856`
passed both architecture builds and published `desktop-dev-latest`; both downloaded
ZIPs match the manifest's commit, sizes, and SHA-256 hashes. A mistaken root-level
Convex invocation temporarily removed indexes/component registration, then the
correct package deploy restored every reported index and remounted ProseMirror before
publication. Next: second-Mac installation and the focused two-device live matrix.
- 2026-07-13 — Captured the first second-Mac onboarding findings from the packaged dev
release. The unsigned app's unexplained **Hubble Safe Storage** system prompt caused
an accidental Deny, establishing a need for pre-prompt context and recovery guidance.
An unrequested `README.md` import dialog then appeared only after sign-in. Code review
found that a launch-file argument or macOS `open-file` event can be queued before auth
and revealed only afterward, hiding its cause; the exact triggering event remains to
be reproduced. Routed both findings to the cross-device run record and roadmap while
keeping the acceptance gate open.
- 2026-07-13 — Promoted local-agent availability onboarding to the next implementation
step after the packaged second-Mac app showed cloud content and an HTML Apps/skills
promotion without a path for agents to access the Space. Adrian approved two journeys:
make the exact current Space/shared root available in a standalone local folder, or
link one cloud folder into one Git repository. Added a focused PRODUCT/TECH spec pair
under `specs/local-agent-availability-onboarding/`. The plan introduces a
Workspace-scoped projection instead of relabeling the broader legacy mirror,
generalizes per-device availability lifecycle, and gates skills guidance on a verified
selected-context path. The cross-device safety matrix remains open and can still
preempt the UX slice if it finds a correctness blocker.
- 2026-07-13 — Completed local-agent availability TECH Milestone 1 at code/test level.
Added the shared projection-scope/key contract, guarded Workspace mount identity,
Workspace-root plan/materialize behavior (root documents, nested/empty topology,
roles, canonical paths, and no unrelated Spaces/shares), Workspace-only Convex
subscriptions, and explicit scope selection in the desktop sync service. Existing
all-accessible and folder compatibility paths remain covered. A fresh revalidation on
the pinned `d0a2cc1` base restored dependencies from the local pnpm store; sync tests
pass 51/51, Convex-client tests 1/1, desktop tests 156/156, changed-file Biome passes,
and `pnpm build:desktop` passes. Next: Milestone 2's versioned local-availability
registry/migration and scope-keyed lifecycle APIs.
- 2026-07-13 — Completed local-agent availability TECH Milestone 2 at
code/test/build level. Added the atomic versioned `local-availability.json` registry
with idempotent valid-entry migration from untouched `repo-mounts.json`; generalized
projection engines, status/events, pending-operation routing, validation, reconnect,
relocate, and stop around stable Workspace/folder scope keys; and exposed typed
scope-based IPC/preload/renderer APIs while retaining folder-ID compatibility
adapters. Direct Workspace roots and folder ancestry/local-root overlaps are rejected
before setup mutations. The legacy all-accessible mirror is separately reported as
incompatible and is never auto-migrated. Desktop tests pass 160/160, changed-file
Biome and diff checks pass, and `pnpm build:desktop` passes after
simplify/comments/review-readiness. Next: TECH Milestone 3's primary contextual
standalone onboarding journey; Milestone 4's repo journey remains out of scope.
- 2026-07-13 — Completed local-agent availability TECH Milestone 3 implementation at
code/test/build level, leaving packaged host acceptance explicit. The selected member
Workspace/shared-folder now owns exact-scope local-agent discovery, a native
prospective destination chooser, guarded standalone creation, real lifecycle progress
announcements, cancel/retry/error/review states, persisted reconnect, quiet healthy
state, path actions, and copyable agent instructions. Legacy broad-mirror overlap is
named honestly, dismissal retains a compact contextual entry, generalized folder
controls now work for standalone shared roots, and broad dashboard-only Settings
discovery was removed while Settings management remains. Focused onboarding tests
pass 4/4, sync tests 51/51, changed-file Biome/diff checks and `pnpm build:desktop`
pass after simplify/comments/review-readiness; 158 desktop tests pass while six
CLI-server Unix-socket tests are sandbox-blocked by `EPERM`. The managed environment
also denied the real Electron/CDP workflow at process inspection/localhost binding,
so next is clean-host member/shared/offline/cancel/keyboard/VoiceOver acceptance
before Milestone 4's repo journey or skills-gating cleanup.
- 2026-07-14 — Completed local-agent availability TECH Milestone 3 packaged desktop
acceptance. The clean-profile member/editor matrix remained green, and a temporary
viewer-shared dev folder proved the exact contextual role/path preview, offline error
and retry state, interrupted-relaunch recovery, one-subtree disk isolation, and
read-only enforcement (mode `0444`; external append denied with unchanged bytes).
Packaged live regions and the CDP accessibility tree exposed literal scope, role,
path, progress, error, completion, and action labels. VoiceOver launched, but macOS
denied Apple-event access to its phrase/cursor/caption interfaces, so literal speech
could not be harvested on this host. Soft-removed both named temporary cloud folders,
stopped all projection/dev processes, and deleted the isolated profile and named
acceptance roots. Desktop tests pass 166/166 and `pnpm build:desktop` passes. Milestone
4 was not started.
- 2026-07-15 — Completed selective folder authority TECH Milestone 4 at
  code/test/build scope. Added exact cloud Markdown/asset, inherited-audience,
  public-link, revision-history, archive, and restore contracts; guarded bounded
  cloud-to-Git export; atomic verified placement; cloud-last cutover; forward-only
  post-archive recovery; exact completion status; and unchanged-only Undo. Failure
  injection covers stale content, cancellation, archive rollback, interrupted resume,
  byte equality, and changed-byte Undo refusal. Sync-backend tests pass 85/85,
  Convex-client tests 3/3, desktop tests 211/211, and `pnpm build:desktop` passes after
  simplify/comments/review-readiness. The direct Electron wrapper exited before CDP
  became available, and no expendable cloud fixture was authorized, so real-renderer
  cutover acceptance moves to Milestone 5. No cloud fixtures, deployment, push, or PR
  were changed.
- 2026-07-15 — Paused selective folder authority TECH Milestone 5 at Adrian's
  requested stopping point. The uncommitted draft covers named nested-authority
  exclusions, carried Share recipients with fingerprinted atomic activation,
  manage-only moves versus reader-safe detached Git export copies, restart-visible
  offline/resume state, explicit retained-recovery language, live announcements, and
  reduced-motion transitions. Focused suites passed before the final recovery edits:
  sync-backend 86/86, Convex-client 3/3, cloud UI 10/10, and desktop 214/214. The
  frozen-lockfile install restored missing root dependency links, but the final
  changed-file checks, full `pnpm check`, `pnpm build:desktop`, packaged acceptance,
  simplify/comments/review-readiness, legacy cleanup, and milestone commit remain.
  The roadmap now names the exact restart sequence. No cloud fixture, deployment,
  push, or PR was changed.
- 2026-07-15 — Completed selective folder authority TECH Milestone 5 at automated
  code/test/build scope. Nested Git/cloud roots remain independent and are named in
  previews; Share recipients and roles are covered by the audience fingerprint and
  atomic activation; readable non-managers receive a detached verified Git export
  instead of authority-moving controls; and non-draft moves/exports expose offline-safe
  relaunch recovery, including an export interrupted after atomic placement. The UI
  now distinguishes active cloud copies from recoverable archives and adds literal
  progress/completion announcements plus reduced-motion transitions. The obsolete
  automatic single-file cloud-import prompt/IPC is removed; external Markdown entry
  points now select Git and open directly without an upload assumption. Sync-backend
  tests pass 86/86, sync 58/58, Convex-client 3/3, cloud UI 10/10, desktop 215/215,
  changed-file Biome/diff checks pass, and `pnpm build:desktop` passes after
  simplify/comments/review-readiness. Repository-wide `pnpm check` remains blocked
  only by unrelated pre-existing formatting diagnostics and storyboard warnings.
  Packaged interaction/cutover parity remains the next gate because Electron/CDP and
  the in-app browser helper are unavailable on this host and the task explicitly
  prohibited cloud fixture mutation. No deployment, push, PR, or cloud fixture was
  changed.
- 2026-07-15 — Completed the local non-mutating Milestone 5 renderer and final
  recovery-discoverability pass. Real Electron/CDP against the generated scratch
  playground showed the Git root marker, exact `Move to Hubble Cloud…` and `Share…`
  actions, mandatory content/audience/recovery disclosures, literal live-region text,
  disabled confirmation for a contentless/excluded source, cancel, and focus return
  to the invoking folder action. Completed moves now remain discoverable after
  relaunch with explicit retained-recovery policy and unchanged-only restore, while
  interrupted work takes priority. Desktop tests pass 216/216 and
  `pnpm build:desktop` passes after simplify/comments/review-readiness. The prescribed
  `pnpm dev:desktop` command also launched the workspace `convex dev` child and
  synchronized functions to the configured development deployment before all child
  processes were terminated. That deployment exceeded the task's explicit no-deploy
  constraint; no cloud fixture data or live authority transfer was mutated. Production
  package, VoiceOver/reduced-motion observation, and expendable-fixture cutovers remain
  separately gated. No push or PR occurred.
- 2026-07-15 — Reprioritized the repository around a public “try it today” launch.
  Captured Adrian's source direction, added the public-launch observable contract and
  claim-shaped execution plan, recorded the strategy decision, promoted the launch to
  the roadmap's single current next step, and made desktop, cross-device,
  selective-authority, and deep-recovery work conditional on the announcement rather
  than universal blockers. Four choices remain Adrian-gated: new name,
  independent-deployment topology, web-only versus desktop-inclusive launch, and
  rename depth. No product code, deployment, cloud fixture, push, PR, or release was
  changed.
- 2026-07-15 — Adrian accepted the launch defaults and required macOS for agent
  access. Fixed independent deployment on operator-owned managed Convex, public web
  plus macOS as the launch surfaces, a public-facing rename with documented internal
  compatibility identifiers, and one centralized source/validation boundary for
  mutable brand values. Promoted macOS signing/notarization, fork-owned release,
  Safe Storage/startup-file onboarding, independent deployment targeting, and the
  focused web → desktop → local agent → web → relaunch path to unconditional launch
  gates. Fully self-managed infrastructure, real selective-authority cutovers, and
  broader recovery remain backlog or claim-conditional. Only the new name remains
  unresolved; no product code or external state changed.
- 2026-07-15 — Selected **Tubble.md** as the intentionally replaceable launch name and
  completed the public-launch planning baseline. Tightened the announcement to cloud
  Workspaces on web/macOS, realtime editing/sharing, exact watched local Markdown for
  agents, and hosted-versus-independent deployment. Explicitly excluded
  selective-authority movement, broad offline/history/recovery, and editor-polish
  claims so their remaining acceptance stays in backlog. The roadmap now starts the
  next authorized implementation at the centralized brand manifest, compatibility
  map, and rename inventory. No product code, deployment, external rename, push, PR,
  or release changed.
- 2026-07-15 — Executed Phase 1 steps 1–4 of the public-launch plan as reviewable
  local artifacts: `specs/public-try-it-today-launch/BRAND-INVENTORY.md` (every
  Hubble/`bholmesdev` surface classified PUBLIC RENAME / COMPAT ALIAS / CLEANUP with a
  fixed no-stranding migration rule), `config/brand.json` (single source of truth for
  mutable public values; hosted web URL left UNRESOLVED; `@bholmesdev` retained as
  labeled attribution), `config/compatibility.json` (5 intentionally-retained
  identifiers), and `scripts/check-brand.mjs` / `pnpm check:brand` (report-only
  validator; `--strict` gates). Captured Adrian's decisions: public repo
  `adrianricardo/tubble.md`, placeholder web URL, `@bholmesdev` as attribution. Current
  punch list: 24 divergent public values + 1 unresolved. No rename applied, no external
  resource, deployment, push, PR, or release changed. Awaiting boundary review before
  Phase 1 steps 5–7.
- 2026-07-15 — Applied the Phase 1 in-repo rename (steps 5–6) driven by the manifest.
  All 13 package.json repository/bugs/homepage/description values, desktop
  productName/appName → Tubble, publish owner/repo → adrianricardo/tubble.md, protocol
  label → Tubble URL, both HTML titles, SECURITY.md, www auth/guest copy + download link,
  and a full README front-door rewrite (Tubble identity, upstream lineage/credits keeping
  @bholmesdev attribution, two-path try-it-today with best-effort trial warning, compat
  note). `pnpm check:brand` now reports 0 divergent public values (only the intentional
  UNRESOLVED web URL remains); `pnpm build:desktop` passes; biome clean. Corrected the
  compatibility map: productName/appName/userData follow the rename (no public installs to
  migrate); appId + hubble:// scheme + @hubble.md/* namespace + hubble CLI bin + upstream
  hubble-skills stay retained. Remaining Phase 1 work is EXTERNAL and Adrian-gated (GitHub
  repo rename, hosted web URL, clean-browser link audit). No external resource,
  deployment, push, PR, or release changed.
- 2026-07-15 — Attempted the authorized GitHub repo rename (adrianricardo/hubble.md →
  tubble.md) but the local `gh` token is invalid; recorded the exact re-auth + rename
  commands in the roadmap for Adrian. Then drafted Phase 2:
  `specs/public-try-it-today-launch/DEPLOY.md`, a complete clean-clone independent-
  deployment guide for the managed-Convex topology (backend deploy, Convex Auth env,
  100/day signup cap, web build/host, optional deployment-targeted desktop build with
  no-silent-fallback identity, data/backup/upgrade/teardown, and a DEPLOY-5 verification
  record). README "Deploy your own" links it as a draft. The guide is UNVERIFIED — the
  DEPLOY-5 clean-clone pass by a second operator (needs a real Convex account + host) is
  still required before the deploy claim is evidence-backed. No external resource,
  deployment, push, PR, or release changed.
- 2026-07-16 — Session wrap / handoff. Added a "⟳ RESUME HERE" block to the top of
  `roadmap.md` for a fresh agent and de-staled the old planning-only language. State at
  handoff: Phase 1 in-repo rename applied and verified (`check:brand` 0 divergent,
  `build:desktop` passes) but the working tree is entirely UNCOMMITTED; the GitHub repo
  rename is still blocked — the invalid `gh` token was NOT confirmed re-fixed this
  session (auth verification was interrupted), so the next agent must re-run
  `gh auth status` before assuming it works. Phase 2 `DEPLOY.md` remains a draft pending
  DEPLOY-5. No commit, push, deploy, or external mutation occurred.
- 2026-07-16 — Resumed the public-launch milestone from the roadmap, confirmed GitHub
  authentication is healthy for `adrianricardo`, and prepared the full Phase 1 in-repo
  identity boundary plus Phase 2 deployment-guide draft as one cohesive commit.
  `pnpm check:brand` reports 0 divergent public values and only the intentionally
  unresolved hosted URL; `pnpm build:desktop` passes. The simplify pass found no
  behavior-preserving reduction worth making. No push, deployment, or release occurred.
- 2026-07-16 — Completed the repository-identity follow-through. GitHub already
  reported the renamed `adrianricardo/tubble.md`; updated local `origin`, confirmed the
  old repository URL redirects, and verified the `desktop-dev-latest` prerelease and
  assets resolve. Fixed a missed public brand surface: future dev-release titles and
  assets now use Tubble, and `check:brand` validates both workflow and generator. Updated
  the live prerelease title without changing existing binary bytes. All README/security
  external links return successful signed-out HTTP destinations and all relative links
  exist. The literal clean-browser audit remains pending because the in-app browser
  failed to start due to a local native-module signature error.
- 2026-07-16 — Implemented the launch-critical hosted-trial boundary in account
  creation. Signup now names the lack of uptime, backup, support, security-review, and
  maintenance guarantees; warns against critical, sensitive, or irreplaceable data;
  recommends independent copies; and links to the independent-deployment guide. The
  notice progressively reveals only in signup, respects reduced motion, and removes its
  collapsed link from the accessibility tree and tab order. Added two focused render
  tests and a user-facing changelog entry. Web tests pass 6/6, www typecheck passes,
  changed-file Biome passes, and the review-readiness simplify/comments pass is clean.
- 2026-07-16 — Continued the public-launch milestone with capacity honesty and the
  operational signup control. Added a public reactive availability query for the
  100-account UTC-day cap and `LAUNCH_SIGNUPS_DISABLED`; the signup surface checks it
  before enabling submission while backend account creation independently enforces
  both states. Existing users can still sign in during a pause. Updated the independent
  deployment guide and added `specs/public-try-it-today-launch/READINESS.md` as the
  complete claim-shaped evidence/dependency index. The literal clean-browser audit was
  retried but remains locally blocked by the browser runtime's invalid native-module
  signature. Sync-backend tests pass 89/89, web tests pass 7/7, www typecheck passes,
  `pnpm check:brand` reports 0 divergent values plus the known unresolved URL, and
  `pnpm build:desktop` passes. No deployment, release, push, or production fixture
  mutation occurred.
- 2026-07-16 — Recorded Adrian's public destination decision:
  `https://tubble.adriantavares.com` is the temporary staging and hosted-trial front
  door; a dedicated custom domain comes later. Updated the product decision log,
  roadmap, and launch-readiness matrix while leaving `config/brand.json` unresolved
  until DNS, TLS, hosting, and application control are actually verified. No DNS,
  hosting, deployment, public link, push, or release changed.
- 2026-07-16 — Began the real hosted-trial deployment. Proved Convex production
  `rugged-mastiff-510` is separate from dev and empty, deployed backend commit
  `c40f963` with schema + `prosemirrorSync`, and configured production-only
  `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS` without exposing their values. Added typed
  signup-pause env handling and a minimal Cloudflare static-assets/SPA/custom-domain
  config; the www production artifact builds against the production Convex endpoint
  with no dev/test/secret markers. Custom-domain activation stopped before DNS change
  because the existing Wrangler profile is scoped to `Nopal Studio`, not the account
  owning `adriantavares.com`; the resulting unreachable Worker was deleted. The exact
  resume gate is Wrangler re-auth to the zone-owning account, then DNS/TLS/app-control
  proof before resolving `config/brand.json`. No push, account creation, fixture seed,
  desktop release, public announcement, or repository URL resolution occurred.
- 2026-07-16 — Adrian replaced the temporary destination with
  `https://tubble.nopalstudio.com`; refreshed Wrangler OAuth to the Nopal Studio
  account and completed the hosted-trial front door. Cloudflare Worker
  `tubble-trial` version `566d2f8b-a60c-4240-958c-3718900a7bfb` serves frontend
  commit `181935a` on the single custom domain; DNS A/AAAA, wildcard TLS, root and SPA
  200 responses, production Convex targeting, and artifact secret/dev-target scans
  pass. A fresh isolated Chrome profile rendered the signed-out Tubble page and full
  best-effort trial boundary; production signup availability returned `available`.
  `config/brand.json`, README, and all package homepages
  now use the proven URL; strict brand validation passes 0 divergent/0 unresolved.
  Backend commit `c40f963` remains deployed to empty production
  `rugged-mastiff-510` with Auth keys and the updated Nopal Studio `SITE_URL`.
  Sync-backend tests pass 89/89, web tests 7/7, www typecheck and
  `pnpm build:desktop` pass. The next gate is the first-account persistence smoke,
  awaiting Adrian's action-time approval/test identity; no account, push, release,
  announcement, or unrelated DNS change occurred.
- 2026-07-16 — With Adrian's action-time approval, created the first hosted-trial
  account `tubble-smoke-20260716182713@example.com`. Its private starter Space appeared
  with no teams/shares, and `Hosted Trial Persistence 2026-07-16` retained the exact
  timestamped marker across a cache-bypassing reload. An automation double-click made
  one extra Untitled document; it was soft-deleted, leaving one active smoke document.
  The signed-in page exposed stale `HUBBLE` branding, so commit `fce0a1e` changes the
  dashboard and deployment-error copy to Tubble and adds strict brand coverage.
  Cloudflare Worker version `7e6d5f82-a52a-4909-9dbf-28306a33094a` now serves that
  commit; six consecutive bare-root checks returned the new asset, and the preserved
  account rendered `TUBBLE`. Strict brand passes 0/0, Cloud UI tests 10/10, web tests
  7/7, www typecheck and `pnpm build:desktop` pass. Sign-out/sign-in recovery is still
  pending: the generated first-account password was volatile by design and disappeared
  when the headless renderer had to restart. A replacement disposable account—and the
  opportunity to prove account-A isolation—requires renewed action-time approval. No
  push, release, announcement, or unrelated external mutation occurred.
- 2026-07-16 — Completed the public hosted-trial persistence and isolation boundary.
  Normal macOS resolution and a fresh isolated Chrome profile reverified
  `https://tubble.nopalstudio.com` signed out without any DNS/Cloudflare change. Two
  action-time-approved disposable identities were created: the first verifier lost its
  volatile secret immediately after signup and left only an empty private Space; the
  renewed replacement completed the gate. Its credential was rotated three times
  through the authenticated production operator path while resuming verifier
  mismatches against the same approved test, never printed/committed, and discarded
  after final sign-out/profile cleanup. The
  replacement's exact marker survived cache-bypassing reload and sign-out/sign-in; the
  same private Space/document returned; no development fixtures, teams, shares, or
  unrelated accounts/Spaces appeared; account A's direct private document returned no
  editor/marker; account B's document remained available; and final signed-out route
  denial passed. Updated `READINESS.md` and the canonical roadmap. Remaining launch
  gates begin with the every-link clean-browser audit, then DEPLOY-5, production
  failure/operations/sharing evidence, and macOS release/round-trip work. No push,
  release, announcement, DNS/hosting change, or unrelated external mutation occurred.
- 2026-07-16 — Completed the literal every-link public-browser run from the tracked
  README, download UI, SECURITY, and www copy. The managed browser still fails because
  Apple rejects its bundled `classic-level.node` signature, so the accepted fallback
  used Chrome 150 with a new temporary profile, normal system DNS, 0 initial cookies,
  and no local app configuration. All provider/upstream/owned pages rendered signed
  out with no auth/session leakage, but the launch gate failed: public `main` still
  serves the old Hubble README and stale Hubble-branded linked docs; `DEPLOY.md`,
  `config/compatibility.json`, and `config/brand.json` return browser-visible 404s; and
  `releases/latest` resolves to the releases index containing only the unsigned
  `desktop-dev-latest` prerelease for `d0a2cc1` with legacy Hubble ZIP names. Recorded
  every destination, redirect, status, visible ownership/brand, and release metadata in
  `specs/public-try-it-today-launch/READINESS.md`. The next gate is to land/deploy the
  corrected public documentation revision and rerun the table; DEPLOY-5 follows only
  after it passes. `pnpm check:brand --strict` passes with 0 divergent and 0 unresolved
  public values, and `pnpm build:desktop` passes. No push, deploy, release
  publication/replacement, account action, credential use, DNS/Cloudflare change, or
  other external mutation occurred.
- 2026-07-16 — Remediated and completed the public-link launch gate with Adrian's
  authorization. Merged current `main` into `codex/public-doc-launch`, retaining the
  Tubble dev-release title/assets while incorporating main's pnpm CI fix; corrected the
  public contribution, desktop, and context docs; narrowed macOS download copy to the
  fork-owned releases index with an explicit unsigned-development warning; and expanded
  strict brand coverage to those linked surfaces. PR #7 merged to public `main` as
  `56345cef1097041083d3f35efcff05fec2c6830d`. Built www against production Convex
  `rugged-mastiff-510`, found no dev/test/private-key/signup-control markers, and
  deployed Worker version `87470941-99aa-4077-acba-ddd4fd1c020f`; Wrangler reports it
  at 100% on `tubble.nopalstudio.com`. A new Chrome 150 profile began with 0 cookies and
  passed all 19 unique README/download/security/www destinations, including the three
  formerly missing GitHub files; expected Twitter, Convex, and private-advisory
  redirects passed; hosted-trial storage remained empty; and no auth/session leakage
  appeared. The temporary profile was deleted. Verification passes strict brand 0/0,
  www tests 7/7, www typecheck, targeted Biome, `git diff --check`, and
  `pnpm build:desktop`. External writes were the review branch push, PR #7 creation and
  merge, public `main` update, and `tubble-trial` Worker deployment. No backend deploy,
  DNS/TLS change, account/data mutation, release asset publication/replacement,
  credential disclosure, tag, or announcement occurred. Phase 1 step 6 passes; the
  exact next major gate is second-operator DEPLOY-5.
