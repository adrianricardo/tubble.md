# hubble-init dry run — 2026-07-09 — `~/Code/567-platform/brain` (generalization run)

**Skill version:** rules 1–8 active. **Mode:** dry-run, read-only against a foreign
repo (the repo that inspired the brain pattern). **Target:** 50 markdown files + 2 PNG
assets: `synthesized/` (10), `sources/` (28 + assets), `admin/` (4), `workflows/` (3),
`office-hours/` (1), ARCHITECTURE / README / RESOLVER / BRAINKEEPER.

## What this corpus stressed (new signals, none seen in hubble.md runs)

1. **A cross-repo consumer:** the 567 iOS repo *symlinks* this `brain/`; CLAUDE.md
   says "brain edits land here." Moving the brain to cloud breaks a consumer the
   scanned repo can't even see. Init needs a consumer check.
2. **A mixed `sources/` corpus:** append-only captures where ~2/3 are strategy
   sessions (move-shaped) and ~1/3 are engineering handoffs/migration logs
   (keep-shaped per rule 6) — per-file rules would fragment an append-only corpus.
3. **Non-markdown assets** referenced by sources (logo, simulator screenshot).
4. **Heavily sensitive content:** revenue projections, pricing hypotheses, a candid
   disclosure/partnership decision about a named person — the revocability signal at
   full strength.
5. **Tiering already exists:** CLAUDE.md declares Tier-1 (company/finance) lives in an
   Obsidian vault, not the repo — the "what moves out" instinct predates Hubble here.

## Opening proposal

| File(s) | Call | Reason | Confidence |
|---|---|---|---|
| `synthesized/current-strategy.md`, `active-principles.md`, `personas.md`, `onboarding-strategy.md`, `mobile-monetization-lessons.md`, `revenue-candidates.md`, `revenue-share-projections.md`, `open-questions.md` | **move** | Pure evolving strategy; revenue/pricing content is revocable-shaped; non-repo audience (instructors, collaborators) plausible | high |
| `office-hours/2026-05-21-instructor-partnership-and-disclosure.md` | **move** | Candid decision doc about a named third party — the strongest revocability case in the corpus | high |
| `admin/todos.md` | **move** | Product-idea backlog (pre-roadmap strategy), not build state | medium |
| `admin/activity-log.md`, `pending-proposals.md`, `reflections/` | **move** | Bookkeeping follows its corpus (rule 3) | medium |
| `sources/` — strategy/session captures (~19 files) | **move** | Raw strategy material; several carry third-party content (Nicole's playbook, Paul Solt) — revocable | high |
| `sources/` — engineering handoffs (~9: playback-hang, timeline-handoff, phase2-migration, vps-migration, domain-cutover, dedup-overhaul, freshness-token-gap, provenance-dedup, llm-benchmark) | **contested** | Rule 6 says engineering history stays git-side, but these live inside an append-only corpus — fragment it or move it whole? | low |
| `sources/assets/` (2 PNG) | **contested** | Referenced by moving sources; do assets follow their documents, and does the platform even handle non-markdown? | low |
| `synthesized/decision-log.md` (394L), `roadmap.md` | **split** | Rule 1: strategy decisions/track direction → cloud; engineering decisions/build state → git | high |
| `ARCHITECTURE.md` | **keep** | System/agent topology every repo's entry file points at — clone-time contract (rule 4) | high |
| `README.md`, `RESOLVER.md`, `BRAINKEEPER.md`, `workflows/` (3) | **keep, consolidate** | Governance/process docs stay git-side as **one** doc (rule 2) — currently six files saying overlapping things | medium |
| **Corpus-level flag** | **blocker for apply** | iOS repo symlinks `brain/` — apply-mode must detect external consumers and re-point them at the synced projection (or block) | — |

**Honest-scope rule:** already-committed files keep their git history — moving a file
stops *future* git history only; the pre-move state stays reachable in git forever.

**Progress contract check (rule 8):** partially satisfied — CLAUDE.md/AGENTS.md exist
as **twin real files** (drift risk; contract wants a symlink) and point into the brain,
but no single "where the build is + what's next" convention is declared.

## Contested ratio

2 contested of 11 proposal rows (50 files) ≈ 18% of rows, and both reduce to new
policy questions (corpus integrity vs per-file rules; asset handling) plus one
platform gap (cross-repo consumers). Rules 1–8 classified ~85% of files confidently.

## Interactive triage — Adrian's decisions

- **External consumers → detect + re-point** (endorsed the recommendation with "save
  this default behavior (is this obvious or do i need to tell you?)" — meta-answer:
  saving every answered question as a default IS the skill's Step 4; made explicit).
  Multi-repo mount of one brain becomes a named platform requirement.
- **`sources/` → move whole corpus.** Corpus integrity and chronology beat per-file
  rules for append-only source dirs; engineering captures inside are still
  product-history context.
- **Assets → stay in git** (rejected my "follow their docs" recommendation). Cloud is
  prose; apply-mode must rewrite or flag asset links in moved docs.
- **Governance consolidation → propose with tradeoffs, user decides.** Rule 2's
  "consolidation encouraged" softened: init presents a concrete consolidation
  proposal including what's lost (file-level ownership, focused diffs), never
  presumes it.

## Heuristic misses

- `sources/` engineering handoffs: marked contested with a fragmentation lean —
  actual call is a clean default (move whole append-only corpus). Rule 6 needed a
  precedence caveat, not a conversation.
- `sources/assets/`: my recommendation (follow docs) was wrong — assets stay git-side.
- Rule 2's consolidation stance was too strong for mature multi-file process setups —
  now a tradeoff proposal, not a presumption.
- The consumer check wasn't a miss (flagged as corpus-level blocker) but wasn't yet a
  rule; now it is.

## New rules extracted (now defaults in SKILL.md)

9. **External-consumer check.** Scan for consumers of the target outside the repo
   (sibling-repo symlinks, cross-repo references); dry-run reports them; apply-mode
   re-points them at the synced projection. Multi-repo mount = platform requirement
   (DESIGN.md §Gaps).
10. **Corpus integrity beats per-file rules for append-only source dirs** — they move
    (or stay) whole; chronology is the value.
11. **Binary assets stay in git.** Apply-mode rewrites or flags asset links in moved
    docs; no binary hosting required of the platform for v1.
12. **Consolidation is proposed, never presumed** — with explicit tradeoffs, decided
    by the user per-repo.
