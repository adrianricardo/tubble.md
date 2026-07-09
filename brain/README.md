# Hubble Product Brain

**Read this first in any fresh session doing product/vision/planning work on hubble.md.**
This directory is the durable product brain for Hubble — vision, decisions, open
questions, roadmap — kept separate from feature specs (`/specs/`) and code docs.

It is deliberately structured like the 567-platform brain (`~/Code/567-platform/brain`),
whose brain-keeper pattern we adopted on 2026-07-09 (see decision log). It is also the
**dogfood corpus**: when the `hubble-init` extraction skill is ready, this directory is
what we run it on (see `/specs/hubble-init/DESIGN.md`).

## ⚠ Status: PENDING EXTRACTION

Adrian has **significantly more vision and UX direction in his head than is written
here** (stated 2026-07-09). `synthesized/current-vision.md` is the best current written
approximation, not the full vision. Do not treat gaps as decisions. Before large
product/UX build-outs, prompt Adrian for an extraction session (InterviewMe-style).
Tracking: `admin/pending-extraction.md`.

## Layout

- `synthesized/` — derived truth. Update these; preserve prior state in each file's Timeline section.
  - `current-vision.md` — the product vision as currently understood (start here)
  - `decision-log.md` — dated decisions with rationale
  - `open-questions.md` — unresolved items
  - `roadmap.md` — current state of the build + what's next, incl. the parallel tracks
- `sources/` — raw, append-only captures (session notes, transcripts, fragments). Never rewrite; file as `YYYY-MM-DD-description.md`.
- `admin/` — brain bookkeeping: `activity-log.md`, `pending-extraction.md`.
- `RESOLVER.md` — where new information belongs (filing decision tree).
- `BRAINKEEPER.md` — the maintenance role and its non-negotiables.

## Relationship to /specs

- `/specs/realtime-collab/` — engineering specs for the realtime-collab/repo-brain build (TECH, SYNCED-FOLDER, runbooks) + `archive/` of executed/superseded plans.
- `/specs/hubble-init/` — design for the agent-run init/extraction skill (the new front door).
- Vision lives **here**, not in specs. Specs describe how; the brain describes what and why.
