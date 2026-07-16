# Decision Log

Newest first. Cite sources; keep entries short.

Engineering and build decisions live here. Product and strategy decisions live in
`product-decisions.md`. Both are Git-authoritative again as of 2026-07-15.

## 2026-07-09 — Track C gate 1 SATISFIED: triage logic approved
**Decision:** Adrian declared the init triage logic good after three dry runs — gate 1
of the dogfood is closed. With the no-data-loss gate already verified, **apply-mode
work is unblocked**, in this order: apply-mode against a scratch workspace first, then
the real `brain/` split (pre-move commit + version-history restore demo required).
Also decided: no handoff docs between sessions — the roadmap's NEXT STEP block is the
handoff (dogfooding the progress contract).
**Source:** Adrian in the 2026-07-09 init-iteration session.

## 2026-07-09 — Generalization-run defaults (third dry run, foreign repo: 567 brain)
**Decision:** four more init defaults: (7) **external-consumer check** — init detects
cross-repo consumers of a brain (the 567 iOS repo symlinks it) and apply-mode re-points
them at the synced projection; multi-repo mount is now platform gap #6 in DESIGN.md;
(8) **append-only source dirs move whole** — corpus integrity beats per-file rules;
(9) **binary assets stay in git**, links rewritten/flagged at apply (gap #7);
(10) **consolidation proposed never presumed** — with tradeoffs, user decides.
Rules 1–8 classified ~85% of a 50-file foreign corpus confidently; contested items
were all new policy, not classification errors.
**Source:** `sources/2026-07-09-567-generalization-run-answers.md`; run record
`/specs/hubble-init/runs/2026-07-09-567-brain-generalization-run.md`.

## 2026-07-09 — Progress contract: roadmap.md, convention-only, AGENTS.md symlink; init installs it
**Decision:** `brain/synthesized/roadmap.md` is the single source of "where the build
is + what's next" (post-split its build-state half stays git-side per the mixed-docs
rule). Updates are **convention-only** — every session that changes build/direction
updates it before ending; a reconcile command was considered and rejected (add only if
drift bites). `AGENTS.md` is now a **symlink to CLAUDE.md** (its unique content merged
in; its old pointer to archived PROGRESS.md was live drift — the bug this fixes).
**Product default:** hubble-init apply-mode seeds this contract in any repo
(CLAUDE.md block + AGENTS.md symlink + roadmap if missing) — see DESIGN.md §Progress
contract.
**Source:** AskUserQuestion answers in the 2026-07-09 init-iteration session.

## 2026-07-09 — Archive triage defaults (second dry run, stress corpus)
**Decision:** three more init defaults from the archive run: (4) **no archive
exemption** — archived/executed docs follow the same content split rules; "archive"
is an organizational property the destination preserves, never a triage input, and
mixed docs split even when dead; (5) **the cloud brain holds strategy history** —
superseded vision/strategy and candid critiques move (engineering history stays
git-side); (6) **relocate-within-git is a valid triage verb** for misfiled-but-live
docs. Contested ratio fell 50% → ~19% with run-1 defaults active.
**Source:** `sources/2026-07-09-archive-stress-run-answers.md`; run record
`/specs/hubble-init/runs/2026-07-09-archive-stress-run.md`.

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

## 2026-07-09 — Adopt the 567 brain-keeper pattern for hubble.md docs
**Decision:** hubble.md gets a repo-root `brain/` (sources / synthesized / admin +
RESOLVER + BRAINKEEPER), a lightweight fork of `567-platform/brain`. Superseded and
executed specs move to `/specs/realtime-collab/archive/`.
**Rationale:** the flat specs folder had three generations of direction docs with
README-footnote supersession; fresh agent sessions were orienting on stale context.
**Deliberately not copied from 567:** tiers/symlinks (single repo), daily reflections,
pending-proposals (overhead not yet earned).
**Source:** `sources/2026-07-09-brain-system-and-dogfood-session.md`.

## 2026-07-09 — Dogfood plan: this brain is the init corpus, but gated
**Decision:** the realtime-collab docs (now organized into `brain/` + archive) will be the
first corpus run through the hubble-init extraction flow — **but only when the triage
logic feels good, and with the skill checked into this repo so it can be modified as we
go** (each dogfood run may edit the skill).
**Source:** `sources/2026-07-09-brain-system-and-dogfood-session.md`.

## Earlier (pre-brain) decisions
Repo-brain pivot decisions #1–15 (2026-07-03): `/specs/realtime-collab/REPO-BRAIN-VISION.md`.
Fork decisions #1–6 (2026-06): `/specs/realtime-collab/DECISIONS.md`; ADR-0009 in `docs/adr/`.
