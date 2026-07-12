# Roadmap / Current State

Build-state half of the roadmap. Track strategy/sequencing moved to the cloud brain
(`brain/cloud/synthesized/Track Strategy.md` when mounted) — split 2026-07-10 by the
hubble-init apply run.

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

**Next build step:** begin Phase 3 filesystem operation policy and review: neutral
moves first, then consequential-move confirmation and deletion/Trash recovery. Add
the internal development flag when the new coordinator or unified UI first has a
runtime path to gate; the safety fix itself applies to the current engine. Also keep
`cloud create` in a scratch cwd because it connects its cwd as the workspace path. Publishing
`desktop-dev-latest` and clean-machine Phase 3 acceptance are separate operator gates.

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
