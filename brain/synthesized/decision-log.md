# Decision Log

Newest first. Cite sources; keep entries short.

## 2026-07-09 — Init-triage defaults set by first dry run (skill v1 drafted)
**Decision:** the hubble-init skill exists (`.claude/skills/hubble-init/SKILL.md`,
dry-run only) and its opening-proposal defaults are now: (1) **mixed strategy+build
docs split by default** — strategy → cloud, engineering/build state → git (canonical
cases: decision logs, roadmaps); (2) **one governance doc, git-side** — process/filing
rules stay in git as a single file governing both sides, never duplicated to cloud
(implies RESOLVER+BRAINKEEPER consolidate to one file at apply time); (3) **bookkeeping
follows its corpus** (activity logs move with the brain). Adrian framed these as
defaults for the generalized product, not repo one-offs.
**Source:** `sources/2026-07-09-first-init-dry-run-triage-answers.md`; run record
`/specs/hubble-init/runs/2026-07-09-brain-first-dry-run.md`.

## 2026-07-09 — Brain placement: in-repo now, split via dogfood soon
**Decision:** the brain stays in this repo for now (git IS the change tracking until
Hubble's own version history is trusted). The **eventual arrangement is a split** —
mechanics/build docs in git, strategy/vision in Hubble cloud — and reaching that split
via the init flow is the dogfood goal. **Gate:** verified no-data-loss (cloud version
history + restore demoed) before apply-mode touches real content.
**Decision:** init is **interactive** — proposes an initial split from default
instructions, then helps the user decide file-by-file. Not a batch confirm.
**Source:** `sources/2026-07-09-brain-system-and-dogfood-session.md` (addendum).

## 2026-07-09 — Name: "hubble" today, rename intended eventually
**Decision:** "huddle" in session messages was a typo; the product remains hubble.md
for now, but Adrian intends to rename eventually (name TBD, part of pending
extraction). Keep the name out of hard-to-change surfaces where cheap (deep links,
protocol handlers, published package names) until decided.
**Source:** same source, addendum.

## 2026-07-09 — Adopt the 567 brain-keeper pattern for hubble.md docs
**Decision:** hubble.md gets a repo-root `brain/` (sources / synthesized / admin +
RESOLVER + BRAINKEEPER), a lightweight fork of `567-platform/brain`. Superseded and
executed specs move to `/specs/realtime-collab/archive/`.
**Rationale:** the flat specs folder had three generations of direction docs with
README-footnote supersession; fresh agent sessions were orienting on stale context.
**Deliberately not copied from 567:** tiers/symlinks (single repo), daily reflections,
pending-proposals (overhead not yet earned).
**Source:** `sources/2026-07-09-brain-system-and-dogfood-session.md`.

## 2026-07-09 — Absorb brain-keeper logic into the Hubble *product* (as design input)
**Decision:** the hubble-init skill's triage heuristic adopts the RESOLVER decision-tree
shape, and BRAINKEEPER non-negotiables map to product mechanics (BRAIN.md seeded once,
never regenerated; CRDT version history = the Timeline; source-grounding = attribution).
A post-init "brain-keeper maintenance" skill is a fast-follow candidate, not v1.
**Source:** `/specs/hubble-init/DESIGN.md` §Brain-keeper absorption.

## 2026-07-09 — Agent-init entry point (supersedes REPO-BRAIN-VISION Decided #13)
**Decision:** the v1 front door is `/hubble-init` run inside Claude Code/Codex —
agent-assisted triage of what moves to cloud vs. stays in git, then ensure-desktop +
deep-link handoff. Storyboard revised to v1.1 (scenes 1–3).
**Rationale:** meets the dev where they already work; the desktop UI link flow becomes
the machinery, not the entry.
**Source:** `sources/2026-07-09-brain-system-and-dogfood-session.md`; storyboard footer note.

## 2026-07-09 — Dogfood plan: this brain is the init corpus, but gated
**Decision:** the realtime-collab docs (now organized into `brain/` + archive) will be the
first corpus run through the hubble-init extraction flow — **but only when the triage
logic feels good, and with the skill checked into this repo so it can be modified as we
go** (each dogfood run may edit the skill).
**Source:** `sources/2026-07-09-brain-system-and-dogfood-session.md`.

## Earlier (pre-brain) decisions
Repo-brain pivot decisions #1–15 (2026-07-03): `/specs/realtime-collab/REPO-BRAIN-VISION.md`.
Fork decisions #1–6 (2026-06): `/specs/realtime-collab/DECISIONS.md`; ADR-0009 in `docs/adr/`.
