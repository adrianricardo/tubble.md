# Realtime Collab / Repo-Brain — Engineering Specs

**Orientation for fresh sessions: start at `/brain/README.md`** — the product brain
(vision, decisions, open questions, roadmap) lives there as of 2026-07-09, not here.
This folder holds the **engineering specs** for the realtime-collab → repo-brain build.

## Current files

- `TECH.md` — architecture: CRDT authority (`@convex-dev/prosemirror-sync`), Live
  Documents, watcher → diff → scoped-patch reconcile ("the one bridge"), permissions.
- `SYNCED-FOLDER.md` — the synced-folder projection/watcher design.
- `DECISIONS.md` — fork-era engineering decision log (#1–6; ADR-0009 in `docs/adr/`).
- `REPO-BRAIN-VISION.md` / `REPO-BRAIN-RATIONALE.md` — the 2026-07-03 pivot: locked
  model (Workspace ⊃ Folders ⊃ cloud Docs), Decided #1–15, strategy and bets.
  **Note:** Decided #13 (manual-only seeding) is superseded by the agent-init entry —
  see `/brain/synthesized/current-vision.md`.
- `repo-brain-storyboard.html` — v1.1 visual walkthrough (agent-init scenes 1–3).
- `TEST-RUNBOOK.md` — QA runbook for the repo-first launch gates.
- `OPERATIONS.md` — support/telemetry runbook.
- `archive/` — executed plans and superseded direction docs (indexed in its README).
  Includes the old `PROGRESS.md` journal — **not** a current tracker.

## Build state

RB1–RB7 code phases committed on `v1-release` (2026-07-03..05): folder shares, guest
web experience, desktop repo-link mount + BRAIN.md seeding, guest onboarding, launch
prep. Deploy/QA gates not yet run. Current state + next steps:
`/brain/synthesized/roadmap.md`.
