# Hubble Product Brain

**Read this first in any fresh session doing product, vision, or planning work on
hubble.md.** The full brain is Git-authoritative again as of 2026-07-15.

The brain was split on 2026-07-10 as a Hubble dogfood run: build material stayed in
Git while strategy and vision moved to a cloud folder mounted at `brain/cloud/`. That
split proved the cloud workflow, but it was unnecessary for this corpus because it
does not currently need realtime collaboration or separation from repository access.
The active cloud documents were restored byte-for-byte to tracked paths on 2026-07-15.

## Documents

- `BRAIN.md` — agent-facing index and vision-extraction status.
- `synthesized/current-vision.md` — the current product vision.
- `synthesized/product-decisions.md` — product and strategy decisions.
- `synthesized/decision-log.md` — engineering and build decisions.
- `synthesized/track-strategy.md` — parallel tracks and sequencing.
- `synthesized/roadmap.md` — **where the build is + what's next**; the progress
  contract's single source.
- `synthesized/open-questions.md` — unresolved product questions.
- `admin/activity-log.md` — brain bookkeeping log.
- `admin/pending-extraction.md` — vision still known to be missing.
- `sources/` — append-only source captures.
- `BRAINKEEPER.md` — filing rules, maintenance non-negotiables, and session wrap-up.

## Authority rule

Git is the default home for repository context. A folder should move to Hubble Cloud
only when it needs realtime collaboration or access/privacy boundaries that should not
follow the repository. Each folder has one authority at a time; moving it changes that
authority rather than creating two canonical copies. Product behavior is specified in
`/specs/folder-authority-mobility/PRODUCT.md`.

The former `brain/cloud/` mount and its local reconnect record are retired. The cloud
copy may remain temporarily as a recovery backstop, but it is no longer canonical and
must not be used as the current brain.

## Relationship to `/specs`

- `/specs/folder-authority-mobility/PRODUCT.md` — current UX contract for Git-default,
  selectively cloud-authoritative folders.
- `/specs/desktop-cloud-workspace/` — implemented cloud tree and projection behavior;
  its universal cloud-authority premise is superseded by the folder-authority spec.
- `/specs/realtime-collab/` — engineering specs for the realtime collaboration and
  projection system, plus an archive of executed/superseded plans.
- `/specs/hubble-init/` — the prior agent-init/cloud-triage front door and run records;
  its mandatory move-to-cloud premise is superseded.

Vision remains **PENDING EXTRACTION**: Adrian has more product direction in his head
than is written. Do not turn gaps into inferred decisions.
