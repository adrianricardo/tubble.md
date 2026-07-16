# hubble-init dry run — 2026-07-09 — `specs/realtime-collab/archive/` (stress run)

**Skill version:** post-first-run (learned rules 1–4 active). **Mode:** dry-run.
**Target:** 35 files (~6.8k lines): 18 top-level docs + 17 `tasks/` briefs, all
archived 2026-07-09 during the docs reorg, all explicitly "not load-bearing" per the
archive README.

## What this corpus stressed

The move/keep criteria assume *living* docs. An archive is neither: not living shared
context (move-shaped), not a clone-time dependency (keep-shaped). The honest opening
call is a **corpus-level default** plus per-file exceptions — a granularity the skill
didn't have before this run.

## Opening proposal

**Corpus default: keep → git, wholesale.** Reason: these docs are historical record;
git *is* the history mechanism, the archive README indexes them in place, and nothing
here needs a non-repo audience day-to-day. Exceptions and contested files below.

| File | Call | Reason | Confidence |
|---|---|---|---|
| `README.md` | **keep** | The archive's own index — meaningless apart from its siblings | high |
| `PROGRESS.md` | **keep** | 1,734-line append-only build journal citing commits/stages; git-native history, no cloud audience | high |
| `tasks/` (17 files, RD1–RD12 + RT1–RT5) | **keep** | Executed dispatch briefs full of file paths, tiers, verify commands — code-coupled through and through | high |
| `SPIKE.md` | **keep** | Spike record with package-level findings and gate table; ADR-shaped engineering evidence | high |
| `OFFLINE-DECISION.md` | **keep** | Decision record grounded in line-level source reading of the sync package; ADR-shaped | high |
| `DESKTOP-ALWAYS-ON.md` | **keep** | Implementation design citing `main.ts` line numbers — wants to sit next to the code it describes | high |
| `STAGE6-BUILD-DECISIONS.md` | **keep** | Settled engineering build decisions; ADR-shaped | high |
| `DESKTOP-CLOUD-FIRST-IA.plan.md`, `DESKTOP-NATIVE-LIVE-DOCUMENTS.plan.md`, `READY-TO-TEST.plan.md`, `READY-TO-DEPLOY.plan.md`, `REPO-BRAIN-EXECUTION.plan.md`, `V1-EXECUTION.plan.md`, `SONNET-TASKS.md`, `TWO-MACHINE-TEST-PROMPT.md` | **keep** | Executed engineering plans/briefs — dispatch mechanics, acceptance criteria, commands | high |
| `PRODUCT.md` | **contested** (lean move) | Superseded *product strategy* — if the cloud brain should hold vision **history** (not just current vision), this is its first entry; otherwise it's just a dead doc git already keeps | low |
| `REPO-BRAIN-CODEX-REVIEW.md` | **contested** (lean move) | Candid second-opinion critique of the strategy with author dispositions — revocable-shaped, non-repo-audience-shaped, but historical | low |
| `V1-RELEASE.plan.md` | **contested** (lean keep) | Mixed strategy+engineering — rule 1 says split, but splitting a *dead* doc seems wrong; raises whether learned rules apply to archives at all | low |
| `ORCHESTRATION-NOTES.md` | **contested** (lean keep, un-archive) | Self-described "process doc, not a status doc" with live agent-orchestration rules — looks **misfiled in the archive**, wants to be git-side governance (rule 2), not moved to cloud | medium |

**Honest-scope rule:** already-committed files keep their git history — moving a file
stops *future* git history only; the pre-move state stays reachable in git forever.

## Contested ratio

4 contested of 21 proposal rows (35 files) ≈ 19%, vs 50% on the first run — the
learned defaults plus the corpus-level default did most of the work. All four
contested items reduce to two genuinely new policy questions: (1) does the cloud brain
hold strategy *history* or only living strategy? (2) do per-file rules apply inside an
archive, or does the corpus default win?

## Interactive triage — Adrian's decisions

- **Archive rule — rejected the wholesale default.** "Should follow the same split
  rules, but organize as archive accordingly (train the skill with this default)."
  I.e. archived docs get per-file content triage like everything else; whichever side
  a doc lands on, it's filed as archive/history there (cloud gets a history section,
  git keeps its archive dir).
- **Strategy history → move both.** `PRODUCT.md` and `REPO-BRAIN-CODEX-REVIEW.md`
  move: the cloud brain holds strategy *history*, not only living strategy.
- **`V1-RELEASE.plan.md` → split anyway.** Rule 1 (mixed docs split) applies to dead
  docs too: superseded product framing → cloud history; executed engineering plan →
  stays git-side archive.
- **`ORCHESTRATION-NOTES.md` → un-archive in git** (accepted the lean). Establishes a
  fourth verb: *relocate within git* for misfiled-but-live docs.

Net final calls: all engineering-content docs (PROGRESS, tasks/, SPIKE,
OFFLINE-DECISION, DESKTOP-ALWAYS-ON, STAGE6, executed plans/briefs, archive README)
**keep**, by content not by archive status; PRODUCT + CODEX-REVIEW **move** (as cloud
history); V1-RELEASE **split**; ORCHESTRATION-NOTES **relocate within git**. Apply-mode
note: the archive README's index must be updated when siblings move.

## Heuristic misses

- **The corpus-level "keep wholesale" default was the wrong concept**, not just the
  wrong call. There is no archive exemption — content rules always apply per-file;
  "archive" is an *organizational property the destination preserves*, not a triage
  input.
- `V1-RELEASE.plan.md`: lean keep-whole → actual **split**. "Dead docs don't split"
  was my invention; liveness doesn't gate the split rule.
- `PRODUCT.md` / `REPO-BRAIN-CODEX-REVIEW.md`: leans (move) were right — confirming
  that the cloud brain is also the home of strategy history.
- `ORCHESTRATION-NOTES.md`: lean confirmed.

## New rules extracted (now defaults in SKILL.md)

5. **No archive exemption.** Archived/executed docs follow the same content rules as
   living docs. Being archived never forces keep; the destination organizes arrivals
   as history (cloud history section / git archive dir). Corpus-level wholesale calls
   are not offered.
6. **The cloud brain holds strategy history.** Superseded vision/strategy docs and
   candid strategy critiques move, filed as history/timeline material — liveness is
   not a move/keep signal for strategy content.
7. **Relocate-within-git is a fourth verb.** Docs that are alive but misfiled (e.g.
   live process rules inside an archive) get an un-archive/relocate proposal, not a
   move/keep coin flip.
