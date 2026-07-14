# Roadmap / Current State

Build-state half of the roadmap. Track strategy/sequencing moved to the cloud brain
(`brain/cloud/synthesized/Track Strategy.md` when mounted) — split 2026-07-10 by the
hubble-init apply run.

## ➤ NEXT STEP (updated 2026-07-13, cross-device checkpoint prioritized)

**Pause Phase 6 recovery implementation long enough to publish and exercise an
installable development desktop build on a second Mac.** Adrian wants cross-device
live evidence before choosing the next UX/UI improvements. Follow
`specs/desktop-cloud-workspace/CROSS-DEVICE-DEV-RELEASE-PLAN.md`: make the existing
`desktop-dev-latest` workflow dispatchable, push and build the exact `v1-release`
candidate against dev Convex, verify the arm64/x64 artifacts and manifest, install on
the second Mac, then run the focused cloud-editor + watched-filesystem + quit/offline
matrix. Record the run and use its findings to choose between UX/UI follow-ups, Phase
6 recovery completion, and production distribution.

Known release starting point: local `v1-release` is clean at `94b63e6`, 27 commits
ahead of `origin/v1-release`; the dev-release workflow exists locally but is not yet
present on GitHub's default branch or remote `v1-release`; and
`adrianricardo/hubble.md` has no `desktop-dev-latest` release. This is an unsigned dev
checkpoint, not a production version/tag/notarization pass.

**Session 9 preflight (2026-07-13):** fetched remotes confirm `94b63e6` is still an
undiverged 27-commit fast-forward candidate, its ignored environment files are not in
the candidate, and desktop/backend configuration agrees on the intended
`strong-setter-709` dev deployment. `pnpm build:desktop` passes. Read-only GitHub checks
confirm the workflow is still absent from default branch `main` and the dev release is
still absent. Dev function metadata includes the import/relocation surface but cannot
prove the deployed code matches the candidate, so checkpoint execution now waits for
the plan-required operator confirmation to publish the workflow, push `v1-release`,
deploy the dev backend, and dispatch/replace `desktop-dev-latest`.

**Operator confirmation (2026-07-13):** Adrian authorized those four external
mutations in the active Codex task. Resume the checkpoint at the dev deployment and
GitHub publication steps; production release work and test-data removal remain out of
scope.

**Session 10 publication (2026-07-13):** the dev backend is deployed, `main` contains
the dispatchable workflow, `origin/v1-release` is at the published candidate
`d0a2cc1`, and
[`desktop-dev-latest`](https://github.com/adrianricardo/hubble.md/releases/tag/desktop-dev-latest)
contains exactly the arm64/x64 ZIPs plus manifest. The successful
[Actions run](https://github.com/adrianricardo/hubble.md/actions/runs/29297362856)
built both architectures; independent downloads matched manifest commit, sizes, and
SHA-256 hashes. The first dispatch exposed and the candidate now fixes a redundant
pnpm-version workflow input. A mistaken root-level Convex invocation temporarily
removed indexes/component registration; the correct `packages/sync-backend` deploy
restored every reported index and remounted ProseMirror before publication, and
function metadata confirms the candidate import/relocation surface.

**Next:** on the second Mac, record architecture/macOS, download its matching ZIP and
verify it against the published manifest, install/approve the expected unsigned app,
sign in to dev, and confirm the same known cloud document. Then run the two-device
editor/filesystem/quit/offline matrix. This is now a physical-device gate; do not
resume Phase 6 recovery or production distribution before recording its evidence.

**Second-Mac onboarding findings (2026-07-13, acceptance still in progress):** the
unsigned build's unexplained **Hubble Safe Storage** Keychain prompt led Adrian to
choose Deny accidentally, so dev-install guidance needs pre-prompt context and a safe
retry path. After sign-in, an unrequested **Bring “README.md” into Hubble** dialog
appeared over Settings. Code inspection shows that a startup file argument or macOS
`open-file` event can be queued while signed out and revealed only by the authenticated
tree after login, severing the visible cause from the prompt; the event's exact source
is not yet proven. Record this as both an onboarding UX problem and a packaged-launch
correctness investigation. Do not treat the import as user intent without confirming
its source path and trigger.

**Next implementation step selected (2026-07-13): local-agent availability
onboarding.** The clean install exposed a more fundamental gap: a user can see a
populated cloud Space and an HTML Apps/skills promotion without learning that local
agents still have no filesystem path. Implement
`specs/local-agent-availability-onboarding/TECH.md` against the observable contract in
its sibling `PRODUCT.md`. The primary journey must create an exact current-Space or
shared-root standalone projection; it must not relabel the legacy all-accessible
mirror. The secondary journey links one cloud folder into one Git repository. Both end
with a verified path, agent handoff actions, and skills guidance only after local
availability exists. Finish recording the physical cross-device matrix in parallel
with planning/implementation evidence; its safety failures can still preempt this UX
slice.

**Local-agent availability Milestone 1 completed (2026-07-13):** projection scope
and materialization behavior are frozen at code/test level. Sync, Convex subscriber,
and desktop service now share explicit `all-accessible`, `workspace`, and `folder`
scopes with stable keys. A Workspace root plans and materializes only its root
documents, nested topology, and empty folders directly at the selected local root;
it excludes every unrelated Workspace and shared item. Workspace subscriptions watch
only that Workspace's folder/document queries. Existing all-accessible and folder
projection paths remain covered by the compatibility suites, and Workspace mount
identity mismatch pauses instead of rebinding an indexed root. Revalidation on the
pinned `d0a2cc1` base restored dependencies from the local pnpm store; sync tests pass
51/51, Convex-client tests 1/1, desktop tests 156/156, changed-file Biome passes, and
`pnpm build:desktop` passes.

**Local-agent availability Milestone 2 completed (2026-07-13):** direct local
availability now persists in an atomically written, versioned
`local-availability.json` registry. First read migrates every valid legacy
`repo-mounts.json` entry once without rewriting the legacy file or reconnecting an
engine. Projection lifecycle, status/events, operation routing, overlap validation,
reconnect, relocation, and stop now use stable Workspace/folder scope keys. Workspace
roots conflict with every root in the same Workspace, folder ancestry conflicts remain
guarded, and all local-root checks canonicalize missing/symlinked paths before any
setup mutation. Existing folder APIs are thin adapters over typed scope-based
IPC/preload/renderer APIs; the legacy all-accessible mirror remains separate, is
reported as incompatible, and must be stopped in Settings rather than being relabeled
or migrated. Desktop tests pass 160/160, changed-file Biome and diff checks pass, and
`pnpm build:desktop` passes after simplify/comments/review-readiness.

**Local-agent availability Milestone 3 implementation completed; packaged acceptance
pending (2026-07-13):** the selected member Workspace or shared-folder context now
owns a discoverable standalone onboarding card and exact-scope state join. The native
destination chooser proposes `~/Hubble/<context>`, returns a prospective path without
creating it, and leaves guarded validation/mutation to the Milestone 2 lifecycle. The
dialog names scope, role/capability, destination, and stop-local safety; real scoped
Electron events announce verification/materialization progress; cancellation before
creation is inert; and offline/error/review states offer accurate retry or Settings
recovery. Connected completion exposes the exact path, reveal/copy, and agent
instructions, while relaunch/token refresh reconnects all generalized records. The
legacy broad mirror remains explicitly incompatible, dismissed guidance leaves a
compact contextual entry, and the dashboard-only Settings discovery was removed.
The existing Settings repo-link workflow remains unchanged for Milestone 4.

Focused onboarding tests pass 4/4, sync tests pass 51/51, changed-file Biome and diff
checks pass, and `pnpm build:desktop` passes after simplify/comments/review-readiness.
The desktop suite passes 158 non-socket tests; its six CLI server tests cannot bind a
Unix socket in the managed sandbox (`EPERM`). Repository-wide `pnpm check` still sees
pre-existing formatting diagnostics in mounted `.hubble` metadata and unrelated
files. The required real Electron workflow was attempted, but the sandbox denied
process inspection and localhost binding, so no packaged/UI acceptance is claimed.

**Local-agent availability Milestone 3 packaged acceptance completed
(2026-07-14):** a clean isolated packaged profile reached populated dev data and
completed the contextual `testspace2` member journey by keyboard. The chooser left its
prospective path absent, live regions announced verification/materialization/
completion, the connected path persisted across relaunch and a real CLI-backed auth
token rotation, and an external Markdown marker reconciled into the cloud editor (then
was removed again). Supplemental packaged lifecycle calls proved exact root/nested
materialization for `Phase 3 Acceptance 2026-07-13`, including a temporary empty cloud
folder, with one Workspace ID throughout the index; the editor-shared `smoke-folder`
materialized as one exact subtree. Cancellation returned focus to the invoking action
and changed neither disk nor registry, and overlapping roots were rejected before
mutation.

The first occupied-root attempt exposed a Milestone 3 safety defect: standalone setup
accepted a foreign sentinel file and materialized around it. Direct availability
preflight now permits only an empty destination or a matching version-2 Hubble index;
foreign content and differently scoped indexes are rejected before setup writes. The
desktop suite passes 166/166, changed-file Biome passes, `pnpm build:desktop` passes,
and the rebuilt package preserved the fixed-case sentinel as the destination's only
file while creating no registry record.

The remaining matrix passed on 2026-07-14 with a temporary viewer-shared dev root.
The contextual preview named the source Workspace, `viewer` role, read-only access,
and exact destination. Offline setup persisted only the scoped recovery record and
Hubble metadata, announced verification/materialization/error, and offered an
accurate retry. Terminating at that state and relaunching online recovered without
restarting onboarding: exactly one shared Markdown document materialized, the v2
index named only that folder and Workspace, the file was mode `0444`, and an external
append failed without changing its hash. CDP's packaged accessibility tree exposed
the literal dialog, scope, role, path, progress, error, completion, and action labels.
VoiceOver itself launched, but this host denied Apple-event reads of its last phrase,
cursor, and caption window, so literal synthesized speech could not be captured; the
AX/live-region evidence is the maximum this host permits.

Both temporary cloud folders (`M3 Empty Acceptance 2026-07-13` and the viewer fixture),
the isolated profile, and every registry-named acceptance root were removed after all
projection processes stopped. Desktop tests pass 166/166 and `pnpm build:desktop`
passes. **Next local-agent availability step:** begin TECH Milestone 4 in a fresh
session; no Milestone 4 work was started during packaged acceptance.

## ➤ NEXT STEP (updated 2026-07-09, post-apply-run)

**Apply-mode is built and has run for real once**: `567-platform/brain` was split into
the "567 Brain" Hubble workspace on dev (Adrian's call to use a real repo instead of a
throwaway corpus; git remote = the safety net). Move commit `567-platform@180eebc`,
run record `/specs/hubble-init/runs/2026-07-09-567-brain-apply-run.md`, skill rules
13–16 extracted. CLI grew auth-token plumbing + `folder create/list/export` +
`document create` (uncommitted → committed this session).

Next session, in order:

1. ~~Desktop repo-link the "567 Brain" folder~~ **✅ verified 2026-07-10** live with
   Adrian: workspace "567 Product Brain" appears via owner membership in the
   repo-link picker (gap #10 fix not needed for this path), mounted over
   `567-platform/brain/cloud/` (repo root = 567-platform), git exclude + BRAIN.md
   confirmed, and live watch verified BOTH directions — app edit → file, and file
   append → cloud reconcile in ~5s. Stale CLI export archived and replaced by the
   live mount. UX learnings: the repo picker wants the git root (users try the
   mount dir — "not a repo" error), and the mount-path field silently keeps stale
   values across relinks.
2. ~~Fix serializer bugs (DESIGN.md §Gap #8)~~ **✅ done 2026-07-10** (working
   tree, uncommitted): all four bugs fixed in `packages/editor` — nested-emphasis
   divergence, lone `~` doubling, verbatim frontmatter round-trip (frozen
   decision: opaque block, no structured editing), bare-URL/autolink
   preservation. `roundTrip.test.ts` is the idempotency guard. Follow-up: four
   call sites pre-strip frontmatter and should adopt the new path
   (`packages/ui` EditorView ×2, desktop `App.tsx`, www EditorView). Gap #9
   (workspace ownership transfer / `hubble login`) is the auth follow-up.
3. ~~Split THIS repo's `brain/`~~ **✅ done 2026-07-10** — Track C target 2 executed
   by the hubble-init apply run: 10 docs (8 whole + cloud halves of decision-log and
   roadmap) → "Hubble Brain" folder, workspace "Hubble Product Brain" (dev), Adrian
   owner member. Export-diff gate passed (whitespace normalization + one mark-order
   canonicalization; zero content loss; all exports are round-trip fixed points).
   RESOLVER+BRAINKEEPER consolidated into one governance doc. Run record:
   `/specs/hubble-init/runs/2026-07-10-hubble-brain-apply-run.md`.

## ➤ NEXT STEP (updated 2026-07-11, Phases 3+4 IMPLEMENTED)

**Magic-flow Phases 1+2 are implemented AND live-verified** (commits `f51023a`,
`79f6024`; run record `specs/hubble-init/runs/2026-07-11-magic-flow-live-acceptance.md`):
`hubble login` device flow proven end-to-end on dev (approve became an action —
nested mutations lose built-in env vars); `hubble mount` proven zero-click on a
scratch repo (both sync directions ≤12s) and **`brain/cloud/` here is now a live
mount** (11 docs; local 2026-07-11 entries merged up; slug-era files removed;
git-side refs updated to the title-based projection names).

**Magic-flow Phases 3+4 are implemented and independently rechecked at the code,
test, and build levels** (run record
`specs/hubble-init/runs/2026-07-11-magic-flow-phase-3-4-verification.md`).
`hubble ensure-desktop` now detects, confirms, downloads, size/hash-verifies,
installs, opens, and signs in the macOS development app using a two-minute,
single-use handoff code rather than copying the CLI refresh token. The manual repo-link
form accepts a selected child directory, shows the resolved git root, and derives a
fresh suggested mount path after either selection changes. The stable dev release has
not been published and the complete install path still needs a clean-machine operator
acceptance pass; do not describe Phase 3 as packaged-live-verified yet.

**Projection correctness guards are implemented at code/test level** (working tree,
2026-07-11): document `path` is the canonical filename for desktop materialization
and CLI folder export (title fallback for pathless legacy docs), watcher events wait
for an in-flight materialize pass to install its index/self-write hashes before
classification, and startup now computes the exact desired cloud projection through
a no-write planner before materialization. New Markdown is classified separately from
untracked files that collide with a desired cloud path; collisions pause startup and
preserve local bytes. Existing mounts migrate by document-ID rekey. Focused sync +
desktop suites and `pnpm build:desktop` pass. Live dogfood acceptance is not yet
recorded.

**Desktop cloud-workspace Phase 0 revalidation and documentation supersession are
complete** (working tree, 2026-07-11): TECH was revalidated against `8f2fb06` plus the
projection guards; its ownership/module map remains current. ADR-0010 now supersedes
the legacy dual-authority model, with `CONTEXT.md`, ADR-0009, and active synced-folder
guidance reconciled.

**Phase 2 startup safety is complete at code/test/build level** (working tree, 2026-07-11):
tracked quit-time edits reconcile against their saved base before materialization;
missing tracked files, unsafe backstops, and untracked desired-path collisions pause
without touching local bytes. Missing-file and collision blockers now persist in a
versioned device-local operations journal with stable IDs/timestamps, are counted in
service status, and clear durably after resolution. Quit-time missing/add pairs now
correlate by inode first and exact content hash second; unique moves and ambiguous
candidate sets are journaled without applying cloud changes or touching local bytes.
Materialization now captures the reviewed destination hashes and compare-checks each
cloud document write; a late local change stops the pass, preserves its bytes, and
persists a typed guard conflict. The index is now a v2 mount-identified envelope with
observed topology and lossless v1 migration; mount mismatches pause for review.
Offline launch and access-verification failures persist pending verification, preserve
every local byte, and surface `verifying`, `offline`, and `pending-review` status.
Sync tests pass 43/43, desktop tests pass 123/123, and the desktop production build
passes. Packaged live acceptance remains outstanding.

**Next build step:** Phase 3's code-level and isolated-Electron acceptance gates are
complete. Begin the desktop cloud-workspace implementation from
`specs/desktop-cloud-workspace/TECH.md` by rerunning its HEAD revalidation gate and
updating the module map before editing code. Keep `cloud create` in a scratch cwd
because it connects its cwd as the workspace path. Publishing `desktop-dev-latest`
and clean-machine Phase 3 acceptance remain separate operator gates.

**Phase 3 topology slice is implemented** (working tree, 2026-07-11): whole-workspace
materialization now persists explicit folder topology from the cloud folder tree,
including empty folders and parent identity. Watcher creates and correlated moves use
that topology before the legacy sibling-document fallback, so an empty destination is
no longer mistaken for the Workspace root. Sync tests pass 43/43, desktop tests pass
124/124, and `pnpm build:desktop` passes. Next: replace composed cross-folder mutations
with the atomic prepare/confirm relocation contract and persist consequential moves.

**Phase 3 atomic relocation prepare seam is implemented** (working tree, 2026-07-11):
the sync backend and Convex adapter expose `prepareDocumentRelocation`; one transaction
authorizes source and destination, compares bounded inherited user/public-link and
repo-link exposure, atomically applies neutral folder/title/path changes, or returns a
current fingerprint and aggregate impact without moving the document. Backend tests
pass 66/66 and sync/client typechecks pass. Next: add confirmation-time fingerprint
revalidation, then route watcher moves through prepare and persist review-required
results before any cloud hierarchy change.

**Phase 3 implementation queue published 2026-07-11:** GitHub issues
[#168](https://github.com/bholmesdev/hubble.md/issues/168) through
[#173](https://github.com/bholmesdev/hubble.md/issues/173) cover atomic confirmation,
watcher relocation policy, durable consequential moves, desktop review/cancellation,
deletion classification, and Trash/Undo recovery. Dependency chain:
`#168 → #169 → #170 → #171` and `#170 → #172 → #173`. The authenticated GitHub
user can create issues but cannot apply repository labels; the queue therefore still
needs a maintainer to apply `ready-to-implement` and remove any automated
`needs-triage` labels.

**Atomic relocation confirmation is implemented** (commit `7377eec`, issue #168
closed): confirmation re-authorizes and recomputes exposure in one Convex transaction,
commits only an exact current fingerprint, and returns refreshed impact without moving
when the review is stale. Shared backend/client contracts are wired; backend tests pass
68/68 and sync plus Convex-client typechecks pass. Next implementation slice: #169,
route watched moves through relocation prepare before building durable review state.

**Watched relocation policy and durable consequential moves are implemented** (commit
`775b739`, issues #169–#170 closed): watcher rename/move events use the atomic prepare
contract; neutral changes complete and re-key by document ID, while consequential moves
are journaled before review with stable identity, impact, paths, and current content
hash. Pending destination edits keep syncing content and refresh the journal; startup
verification retains the operation, status remains `pending-review`, and cloud
materialization pauses rather than recreating or overwriting either path. Sync tests
pass 44/44, desktop tests pass 125/125, and `pnpm build:desktop` passes. Next: #171,
the coordinator/IPC review path with approval, stale-impact refresh, cancellation, and
collision recovery.

**Desktop consequential-move review is accepted** (2026-07-13; issue #171): typed
coordinator and IPC APIs list, approve,
and cancel durable moves. Confirmation revalidates the fingerprint and refreshes stale
impact without moving; cancellation restores the latest destination bytes to the
source, while an occupied source preserves both files and leaves a durable recovery
item. Hubble foregrounds an accessible review dialog with the safe action focused,
Escape/dismissal as cancellation, and an OS notification fallback. Desktop tests pass
128/128 and the desktop production build passes. The richer impact contract landed at
code/test/build level on 2026-07-13: it detects inherited role upgrades/downgrades as
consequential, returns exact gain/loss counts plus up to 25 named role changes, shows
public-link before/after roles, and identifies added/removed repo-linked folders by
cloud path and repository metadata. Older device journals remain readable. Dev
deployment plus isolated Electron acceptance passed for the rendered preview, stale
refresh without a move, approval, and Escape cancellation with an intervening edit.
The run found and fixed canonical relocation paths incorrectly retaining the mirror's
top-level workspace directory; whole-workspace moves now store workspace-relative
paths while repo mounts preserve subtree-relative paths. Desktop tests pass 137/137
and `pnpm build:desktop` passes after simplify/review-readiness. Run record:
`specs/realtime-collab/runs/2026-07-13-phase-3-consequential-move-acceptance.md`.

**Deletion classification safety is implemented at code/test/build level** (working
tree, 2026-07-11; issue #172): the existing move-correlation window is now the bounded
deletion aggregation gate. Exactly one online writable document unlink may reach cloud
Trash; rapid/bulk bursts, read-only copies, offline deletions, a missing projection
root, and inaccessible storage/parents become durable deletion-review operations
without cloud mutation. Offline bursts coalesce into one bounded item list, startup
refresh retains deletion intent, and pending work contributes to `pending-review`
status. Existing launch-time missing-file guards remain the distinct quit-time path;
moving a file outside the root naturally enters the safe single-unlink policy while
leaving the external copy detached. Desktop tests pass 133/133, sync tests pass 45/45,
and `pnpm build:desktop` passes. Packaged filesystem-event acceptance remains. Next:
#173, cloud Trash plus durable Undo/local restoration over these classified operations.

**Trash, durable Undo, and deletion recovery are implemented at code/test/build
level** (working tree, 2026-07-13; issue #173): watcher deletes journal stable intent
before the cloud mutation, resume idempotently after a crash/reconnect, and retain a
non-blocking Undo item across restart. Offline and bulk reviews can restore local files
without cloud mutation or approve Trash in bounded 25-document coordinator calls.
Desktop IPC/UI foregrounds the safe recovery action and uses an OS notification when
backgrounded. Cloud Trash is now distinguished from access loss so remote Trash removes
a clean managed copy, while remote restore rematerializes after a no-write collision
preflight; occupied paths preserve both versions as durable recovery work. Sync tests
pass 46/46, desktop tests pass 135/135, backend tests pass 69/69, and
`pnpm build:desktop` passes after the required simplify/review-readiness pass.
Isolated Electron real-filesystem acceptance passed on 2026-07-13 for single-delete
Undo across restart, offline/restart review, bulk recovery, quit-time review, remote
Trash, and collision-safe remote restore. That run also wired the production offline
predicate and fixed restart-only pending-count/startup-resume gaps; see
`specs/realtime-collab/runs/2026-07-13-phase-3-trash-undo-acceptance.md`. Issue #173 is
accepted. Issue #171's richer impact preview is implemented at code/test/build level;
its deployed isolated-Electron acceptance is the final Phase 3 bundle gate.

**Desktop cloud-workspace HEAD revalidation and the first Phase 4 multi-root slice
are complete** (working tree, 2026-07-13): TECH was revalidated against `51f0ee9`
after the accepted Phase 3 bundle. New mount validation rejects identical,
ancestor/descendant, and symlink-resolved local roots plus overlapping cloud folder
subtrees before creating a directory or changing repo/cloud metadata. The legacy
whole-workspace mirror and folder mounts are now mutually exclusive, and managed-path
classification checks every active engine. Desktop tests pass 141/141 and
`pnpm build:desktop` passes. Next: introduce the projection manager to own all engine
lifecycle, pending-operation routing, and aggregate status, then replace
workspace-global repo mount subscriptions with folder-scoped subscriptions.

**Phase 4 projection-manager ownership is implemented** (working tree, 2026-07-13):
one coordinator now owns the whole-workspace engine and every folder engine, cleans up
failed mount starts, aggregates per-root status and pending journals, resolves managed
paths across all roots, and routes move/deletion/Trash review actions to the journal
that owns each operation. Repo-linked folder reviews now use the same foreground
dialog and OS notification path as the legacy mirror. Desktop tests pass 144/144.

**Phase 4 multi-root correctness and agent status are complete at code/test/build
level** (working tree, 2026-07-13): every renderer event and agent-facing status record
now carries local-root, Workspace, and folder scope; the legacy multi-Workspace mirror
uses null cloud IDs. Repo mounts subscribe only to their folder-subtree query instead
of every accessible Workspace and shared root. `hubble status --json`, backed by the
desktop socket, reports per-root health, queued edits, pending review, recovery, Undo,
and bounded operation-kind counts without document content or credentials. Desktop
tests pass 145/145, CLI and Convex-client typechecks pass, `pnpm build:desktop` passes,
and both JSON and human-readable status output passed a real Unix-socket acceptance.

**Phase 5 unified-context foundation is implemented** (working tree, 2026-07-13):
persisted desktop state migrates the legacy selected Workspace into a discriminated
Workspace/shared-folder `CloudContext`; stale selections fall back safely and
guest-only accounts default to an accessible top-most shared root. Behind
`VITE_UNIFIED_CLOUD_TREE=1`, the context switcher includes member Workspaces and shared
roots, and the new cloud-ID tree renders root folders and documents once in one
alphabetical hierarchy with stable expansion/selection and keyboard tree navigation.
Contextual creation supports Workspace root and writable shared-root contexts. Focused
tree/context/persistence tests pass. The next flagged slice now scopes search to the
current tree, joins repo-mount availability/status by folder ID, and removes the local
filesystem tree plus local create/open entry points from the unified shell. Healthy
mounts stay quiet; exception states are named. Desktop tests pass 150/150, cloud UI
tests pass 4/4, and `pnpm build:desktop` passes. A real flagged Electron smoke pass
confirmed the local-authority labels/actions are absent while an already-open local
document remains editable; populated-cloud interaction was blocked by a transient dev
Convex push 500. The contextual controls and destination prompt left by this foundation
are completed below; populated-tree acceptance remains.

**Phase 5 contextual controls and destination prompting are implemented at
code/test/build level** (working tree, 2026-07-13): directly available folder roots in
the unified tree expose reveal, copy-path, relocate, and stop-local actions, with
Shift+F10/ContextMenu access from keyboard-focused tree rows. Relocate and stop require
a connected byte-clean engine, re-check after the watcher closes, and preserve local
bytes when status or content cannot be proven clean. Relocation rejects occupied or
overlapping roots and re-keys legacy/v2 absolute-path indexes before reconnecting.
Clean stop offers removal or a detached Markdown copy; cloud content and sharing stay
unchanged. Global create in a multi-member Workspace now prompts for Workspace root or
a labeled folder path and names root access explicitly. Focused desktop tests pass
7/7, cloud UI tests pass 4/4, and `pnpm build:desktop` passes after
simplify/review-readiness. **Acceptance remains:** use the desktop-app testing workflow
with the unified flag and populated dev data to run keyboard + screen-reader acceptance for
tree navigation, local action menus, the multi-member destination dialog, relocation,
and clean/dirty stop. Record real-filesystem results, fix any findings, then decide
whether the internal flag can be removed. Phase 6 import, revocation, and minimal
recovery completion remain after that gate.

**Phase 5 populated-tree acceptance preflight is complete** (working tree,
2026-07-13): static accessibility review found and fixed unstable tree-item accessible
names caused by nested action controls, added explicit named local state/menu semantics,
and made the selected Workspace-root destination the create dialog's initial focus.
Cloud UI tests pass 5/5, focused cleanliness/destination tests pass 7/7, changed-file
Biome and `git diff --check` pass, and the flagged production desktop build passes.
The managed session could not run the interactive Electron gate: macOS process
inspection, localhost/Unix-socket listeners, and direct Electron startup were denied
before app interaction. The internal flag remains. Run record and exact host checklist:
`specs/desktop-cloud-workspace/runs/2026-07-13-phase-5-acceptance-preflight.md`.
**Next:** run that checklist in a host session with Electron/CDP and populated dev data,
fix any finding, then remove the flag if the gate passes. Do not begin Phase 6 ahead of
this gate.

**Phase 5 populated-tree host acceptance is mostly complete** (working tree,
2026-07-13): real Electron/CDP and populated dev data passed hierarchical keyboard/AX
semantics, multi-member root+nested creation, native scratch-root relocation with v2
index rewrite/reconnect/post-move sync, dirty stop+relocate byte preservation, and the
detached-copy clean stop. The run found and fixed three live-only gaps: unified mode
did not reconnect persisted mounts unless Settings mounted, ContextMenu opening did
not explicitly focus the first action, and the destination dialog used an effect
instead of Base UI's native initial-focus contract. Focused tests, dependency builds,
desktop typecheck, changed-file Biome/diff checks, and the flagged production desktop
build pass. Run record:
`specs/desktop-cloud-workspace/runs/2026-07-13-phase-5-populated-tree-acceptance.md`.
**Next:** obtain action-time confirmation and exercise **Remove local files** on the
clean `/tmp/scratch-repo/Scratch-remove` test projection, then record literal
VoiceOver speech and a physical Shift+F10 pass. If both pass, remove the internal flag
and legacy production branch; only then begin Phase 6.

**Implementation session 5 + authorized cleanup follow-up (2026-07-13):** the flagged
app relaunched with populated dev data, and the Scratch mount reconnected `connected`
and inspected `clean`. After Adrian's action-time confirmation, the real Hubble
**Remove local files** path removed `/tmp/scratch-repo/Scratch-remove`, reported local
availability stopped, and left the Scratch cloud folder visible without a local
marker. Exactly three documents created by this acceptance run (Workspace root,
`Hubble Brain/admin`, and the accidental `adrian's space` document) were moved to
Hubble Trash; older `Untitled` documents were preserved. Adrian then completed the
human-only gate: physical Fn+Shift+F10 opened the local actions menu and VoiceOver
announced **Reveal in file browser**, item 1 of 4, the local path, and the four-item
menu; Cmd+N announced the destination dialog with **Workspace root** selected/focused,
**Available to Workspace members**, and its position in the destination group. Phase
5 acceptance passes. **Next:** remove the internal flag and legacy production branch,
rerun focused checks/build, then begin Phase 6 import, revocation, and minimal recovery
completion.

**Phase 5 is complete and ungated** (working tree, 2026-07-13):
`VITE_UNIFIED_CLOUD_TREE`, its feature-flag module, and the legacy signed-in cloud
sidebar/create/dashboard branches are removed. Every cloud-enabled desktop build now
uses the accepted unified context/tree; the no-cloud development fallback keeps the
reusable local editor and filesystem primitives needed for import. Desktop tests pass
154/154, changed-file Biome and `git diff --check` pass, and `pnpm build:desktop`
passes after simplify/comments/review-readiness. Run record:
`specs/desktop-cloud-workspace/runs/2026-07-13-phase-5-flag-removal.md`.
**Next:** begin Phase 6 at import destination-first semantics. Replace the existing
workspace-root-only `importLiveDocuments`/`importSyncedFolderMarkdown` seam with a
folder-aware, idempotent import contract, then route file-open/drop entry points to an
Import a copy / Move into Hubble flow. Source deletion must wait for verified cloud
creation and managed materialization.

**Phase 6 destination-first import is implemented at code/test/build level**
(working tree, 2026-07-13): opening or dropping unrelated Markdown in the cloud shell
now prompts for a Workspace-root/folder/shared-subtree destination, previews its
audience, and offers **Import a copy** or **Move into Hubble**. Folder editors can
import through an idempotency-keyed backend mutation; retries reuse the created
document, while a distinct operation at an occupied folder/path preserves the
existing document. Copy leaves the source detached. Move requires a connected owning
projection before creation, refreshes it afterward, verifies the indexed document's
materialized bytes against cloud Markdown, and only then removes the source. Backend
tests pass 72/72, desktop tests pass 155/155, and the desktop production build passes
after simplify/comments/review-readiness. Run record:
`specs/desktop-cloud-workspace/runs/2026-07-13-phase-6-import.md`.
**Next:** implement authorization-loss/role-downgrade recovery so rejected queued
writes become a clearly detached preserved copy and can never republish after access
is removed, then add inspect/retry/defer/keep-detached controls. The import slice also
needs an authorized dev deploy plus real-file keyboard/VoiceOver acceptance before
packaged completion.

Desktop IA follow-up (direction settled 2026-07-11): replace the simultaneous
**Folders** / **Live Documents** / **On this computer** sidebar with one current
context and one folder/document tree. Repo-linked projections become contextual
folder availability; remove standalone local-authority editing while preserving local
editing through watched projections of cloud folders. New documents inherit folder
access, and root documents have no direct/guest shares by default while retaining
normal workspace-member access.
The observable contract is now
`specs/desktop-cloud-workspace/PRODUCT.md`; the architecture handoff is the
commit-pinned `specs/desktop-cloud-workspace/TECH.md`. A future implementing agent must
run TECH's revalidation gate and update its module map against HEAD before editing code.
The first safety gate is startup drift: no cloud materialization may overwrite edits
made while Hubble was quit. Source:
`brain/cloud/sources/2026-07-11 Desktop Navigation IA.md`. Keep this behind the
projection correctness guards above unless explicitly reprioritized.

Documentation gate for this feature: preserve PRODUCT.md as the product-intent source
while code changes. Do not maintain public marketing/support prose in parallel with an
unstable implementation. After packaged acceptance passes, derive those docs from the
product contract plus the shipped UI and live failure-mode QA; do not infer intended
behavior from code alone.

Backlog (non-blocking): serializer continuation-indent preservation
(`packages/editor`, whitespace-only normalization from the split run); frontmatter
call-site adoption (4 sites); Track D vision extraction (Adrian-gated); production
deploy/QA gates still not run.

Adrian's todos (added 2026-07-13, for Adrian to work in parallel with agent
implementation — not yet started):

1. Agent-led UX/UI audit: have an agent review the desktop app's current UX/UI
   (unified cloud tree, onboarding flows, local-agent availability surfaces) and
   surface findings/recommendations.
2. Get Codex's opinion on upstream sync strategy: this repo was forked from an
   original remote; ask Codex whether it's still possible to pull in the latest
   changes from that original upstream, and whether continuing to track it is
   reasonable long-term or whether it's better to formally break off and diverge
   as an independent project.

Todos to flesh out with an agent and plan before ready to implement (added
2026-07-13, not yet planned):

3. Simplify the local-agent-availability onboarding card into a single CTA.
   Current state (screenshot, desktop sidebar "Use this content with local
   agents" card): two competing top-level actions are shown side by side —
   "Make available on this Mac" (primary button) and "Link to a code
   repository" (secondary text link) — plus a "Dismiss" affordance, all in one
   compact card. This reads as confusing/ambiguous about which path to take.
   Direction: collapse to a single top-level CTA on the card; clicking it opens
   a modal that presents the two real options (standalone local availability vs.
   linking a code repository) as clearly labeled choices with plain-language
   explainer text for each, so the tradeoff is legible before committing. Needs
   a design pass (copy + modal layout) and a look at how this interacts with the
   existing `specs/local-agent-availability-onboarding/` spec before scoping
   implementation.

4. Let the "Make available" destination dialog accept its default path directly.
   Current state (screenshot, "Make 'magic-test' available" dialog): the
   Destination field already shows a proposed default path
   (`/Users/adriantavares/Hubble/magic-test`), but the primary "Make available"
   button appears disabled/unconfirmed until the user clicks "Choose this or
   another folder..." first. Adrian should be able to accept the shown default
   and confirm immediately without being forced through the folder picker.
   Direction: treat the prospective default path as already selected on dialog
   open so "Make available" is actionable right away; "Choose this or another
   folder..." remains available for overriding it. Needs a look at the
   destination-chooser flow in
   `specs/local-agent-availability-onboarding/` before scoping implementation.

5. Investigate "Local files are not connected" state — likely a bug, not just
   copy. Current state (screenshot, `testspace2` sidebar card): a local,
   already-materialized folder (`/Users/adriantavares/testspace2`) shows "Local
   files are not connected" with a "Retry connection" CTA. Adrian's flag: local
   files on disk shouldn't conceptually depend on a "connection" at all — they
   already exist on the Mac's filesystem. This suggests either (a) the label is
   wrong and this is actually a projection-engine/watcher/sync-connection state
   being mislabeled as a local-file-availability problem, or (b) there's a real
   bug where local file access is being gated on something (e.g. cloud auth,
   the sync engine) that it shouldn't need. Needs investigation into what
   "not connected" actually means here (engine status vs. filesystem reality)
   before deciding whether this is a copy fix, a status-model fix, or a real
   correctness bug, per the projection/engine status work in
   `specs/desktop-cloud-workspace/`.

## Where the build actually is (2026-07-09)

- Branch `v1-release`. RB1–RB7 repo-brain code phases are **committed** (folder shares,
  guest web experience, desktop repo-link mount + BRAIN.md seeding, guest onboarding,
  launch-gate prep) — see git log 2026-07-03..05.
- GFM table support **committed** (`65c21c6`): shared Tiptap table schema, markdown
  round-trip, slash-command insertion, floating table controls. Shipped mid-apply-run
  after the run's verification caught tables being silently dropped (the exact
  data-loss bug the safety gate exists for); dev backend redeployed with it.
- **Uncommitted work in the tree** (not yet described by any doc): `SpaceSwitcher.tsx`,
  `packages/cloud-ui/`, edits across desktop + www shells, members backend. Needs a
  fact-check/documentation pass before it drifts.
- Production deploy/QA gates were deferred by the pivot (one repo-first launch) and
  remain not run. QA runbook: `/specs/realtime-collab/TEST-RUNBOOK.md`.
