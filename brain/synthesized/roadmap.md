# Roadmap / Current State

## Where the build actually is (2026-07-09)

- Branch `v1-release`. RB1–RB7 repo-brain code phases are **committed** (folder shares,
  guest web experience, desktop repo-link mount + BRAIN.md seeding, guest onboarding,
  launch-gate prep) — see git log 2026-07-03..05.
- **Uncommitted work in the tree** (not yet described by any doc): `SpaceSwitcher.tsx`,
  `packages/cloud-ui/`, edits across desktop + www shells, members backend. Needs a
  fact-check/documentation pass before it drifts.
- Production deploy/QA gates were deferred by the pivot (one repo-first launch) and
  remain not run. QA runbook: `/specs/realtime-collab/TEST-RUNBOOK.md`.

## Parallel tracks (agreed 2026-07-09)

1. **Track A — Brain/doc system** ✅ in place (this directory). Ongoing: file new
   material per `RESOLVER.md`; keep `current-vision.md` honest.
2. **Track B — hubble-init skill.** Design in `/specs/hubble-init/DESIGN.md`. Build the
   skill iteratively *in this repo* so it can be modified as we go; dry-run first.
3. **Track C — Dogfood the split.** Target state: this brain splits — mechanics/build
   docs stay in git, strategy/vision moves to Hubble cloud — driven by the interactive
   init flow on `brain/` as the first corpus. **Two gates:** triage logic feels good
   (dry-runs), and no-data-loss verified (cloud version history + restore demoed;
   pre-move commit as backup). See decision log 2026-07-09.
4. **Track D — Vision extraction (Adrian-gated).** InterviewMe session when ready; then
   revise `current-vision.md` and re-derive UX priorities. Blocks "app matches my
   vision/UX" work at scale.

## Sequence note

A→B→C is the mechanical order; D can land anytime and reshapes C's corpus and the
product priorities. Don't start large app-UX rework before D.
