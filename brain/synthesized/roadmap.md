# Roadmap / Current State

## ➤ NEXT STEP (updated 2026-07-09, post-apply-run)

**Apply-mode is built and has run for real once**: `567-platform/brain` was split into
the "567 Brain" Hubble workspace on dev (Adrian's call to use a real repo instead of a
throwaway corpus; git remote = the safety net). Move commit `567-platform@180eebc`,
run record `/specs/hubble-init/runs/2026-07-09-567-brain-apply-run.md`, skill rules
13–16 extracted. CLI grew auth-token plumbing + `folder create/list/export` +
`document create` (uncommitted → committed this session).

Next session, in order:

1. **Desktop repo-link the "567 Brain" folder** (shared to Adrian's account, editor,
   repo-link metadata set): verify it appears in shared-with-me, mount it over
   `567-platform/brain/cloud/`, and confirm live watch replaces the one-shot CLI
   export. This exercises the RB3 desktop path against an init-created folder.
2. Fix serializer bugs found by the run (DESIGN.md §Gap #8): lone `~` → `~~`
   doubling; decide on frontmatter handling. Gap #9 (workspace ownership
   transfer / `hubble login`) is the auth follow-up.
3. Then the real dogfood target 2: split THIS repo's `brain/` (pre-move commit +
   version-history restore demo first, per Track C).

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

## Parallel tracks (agreed 2026-07-09)

1. **Track A — Brain/doc system** ✅ in place (this directory). Ongoing: file new
   material per `RESOLVER.md`; keep `current-vision.md` honest.
2. **Track B — hubble-init skill.** Design in `/specs/hubble-init/DESIGN.md`. Skill
   drafted 2026-07-09; **apply-mode added and executed for real the same day**
   (567-platform split — see NEXT STEP). Iterate in-repo via dogfood runs (records
   in `/specs/hubble-init/runs/`).
3. **Track C — Dogfood the split.** Target state: this brain splits — mechanics/build
   docs stay in git, strategy/vision moves to Hubble cloud — driven by the interactive
   init flow on `brain/` as the first corpus. **Two gates:** (1) triage logic —
   **✅ satisfied 2026-07-09 by Adrian** after three dry runs (`brain/`, archive
   stress corpus, foreign 567-platform brain; twelve learned defaults, contested
   ratio 50% → ~18%, run records in `/specs/hubble-init/runs/`); (2) no-data-loss — **✅ verified 2026-07-09** live on dev
   (every agent/file write snapshots first; wipe, restore, and trash all recover;
   nothing prunes history). Caveats: ~60s live-typing granularity, prod re-run pending,
   pre-move commit still required. Evidence:
   `/specs/hubble-init/VERIFICATION-version-history.md`.
4. **Track D — Vision extraction (Adrian-gated).** InterviewMe session when ready; then
   revise `current-vision.md` and re-derive UX priorities. Blocks "app matches my
   vision/UX" work at scale.

## Sequence note

A→B→C is the mechanical order; D can land anytime and reshapes C's corpus and the
product priorities. Don't start large app-UX rework before D.
