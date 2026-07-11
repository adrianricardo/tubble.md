# Hubble Product Brain

**Read this first in any fresh session doing product/vision/planning work on hubble.md.**
The brain was **split 2026-07-10** by the hubble-init apply run (Track C dogfood):
mechanics/build docs stay here in git; strategy/vision lives in the Hubble cloud folder
"Hubble Brain" (workspace "Hubble Product Brain", dev deployment), which mounts into
this repo at `brain/cloud/` via the desktop app's repo-link.

## Git half (this directory)

- `synthesized/decision-log.md` — engineering/build decisions (product decisions moved
  to cloud `synthesized/Product Decision Log.md`)
- `synthesized/roadmap.md` — **where the build is + what's next** (the progress
  contract's single source; track strategy moved to cloud `synthesized/Track Strategy.md`)
- `BRAINKEEPER.md` — the one governance doc: filing rules (resolver), maintenance
  non-negotiables, session wrap-up. Governs both halves.
- `cloud/` — the mounted cloud half (git-excluded; absent until the desktop repo-link
  mount is set up on this machine).

## Cloud half (`brain/cloud/` when mounted)

`BRAIN.md` (index + **PENDING EXTRACTION** status), `synthesized/Current Vision.md`,
`synthesized/Product Decision Log.md`, `synthesized/Track Strategy.md`,
`synthesized/Open Questions.md`, `admin/Brain Activity Log.md`, `admin/Pending Extraction.md`,
`sources/` (append-only session captures).

**No mount on this machine?** The pre-split state of every moved doc is reachable in
git history (pre-move commit noted in the move commit message), and the cloud is
canonical going forward. The **PENDING EXTRACTION** caveat still applies: Adrian has
more vision in his head than is written; don't treat gaps as decisions.

## Relationship to /specs

- `/specs/realtime-collab/` — engineering specs for the realtime-collab/repo-brain build (TECH, SYNCED-FOLDER, runbooks) + `archive/` of executed/superseded plans.
- `/specs/hubble-init/` — design for the agent-run init/extraction skill (the new front door); run records in `runs/`.
- Vision lives in the **cloud half**, not in specs. Specs describe how; the brain describes what and why.
