# hubble-init dry run — 2026-07-09 — `brain/` (first run)

**Skill version:** first draft (`.claude/skills/hubble-init/SKILL.md`, this commit).
**Mode:** dry-run — no writes to cloud or scanned files. **Target:** `brain/` (10 files,
all last committed 2026-07-09).

## Opening proposal

| File | Call | Reason | Confidence |
|---|---|---|---|
| `README.md` | **keep** | Referenced from repo CLAUDE.md; the clone-time orientation doc — post-split it becomes the pointer into the cloud folder | high |
| `synthesized/current-vision.md` | **move** | Evolving strategy/vision, explicitly partial (PENDING EXTRACTION) — exactly the living context non-repo teammates and agents need | high |
| `synthesized/open-questions.md` | **move** | Living strategy context that changes through discussion, not code review | high |
| `sources/2026-07-09-brain-system-and-dogfood-session.md` | **move** | Candid raw capture of Adrian's direction — revocable, never needed at clone/build time | high |
| `admin/pending-extraction.md` | **move** | Tracks the state of the vision itself; belongs next to `current-vision.md` wherever that lives | medium |
| `RESOLVER.md` | **contested** (lean keep) | Referenced from CLAUDE.md (clone-time signal) — but it governs filing of content that would itself live in the cloud | low |
| `BRAINKEEPER.md` | **contested** (lean keep) | Same shape as RESOLVER: agents read it at session start from the repo, yet the corpus it maintains is moving | low |
| `synthesized/decision-log.md` | **contested** (lean move) | Mixed: product-strategy decisions (move-shaped) interleaved with repo/engineering decisions that specs cite (keep-shaped) — split-the-file is a live option | low |
| `synthesized/roadmap.md` | **contested** (lean keep) | Mixed: build state tied to branches/commits/QA gates (keep-shaped) + track strategy (move-shaped) — split is a live option | low |
| `admin/activity-log.md` | **contested** (lean move) | Bookkeeping about the brain corpus — should probably follow its corpus, but it logs repo-side passes too | low |

**Honest-scope rule:** already-committed files keep their git history — moving a file
stops *future* git history only; the pre-move state stays reachable in git forever.

## Interactive triage — Adrian's decisions

Uncontested calls (README keep; current-vision / open-questions / source capture /
pending-extraction move) were not challenged. Contested files:

- **RESOLVER + BRAINKEEPER → keep in git**, with a twist: "can't we just have a single
  file in git that also governs the cloud files?" — i.e. don't keep two process docs,
  and don't duplicate rules into the cloud; **one governance doc, git-side, governing
  both sides**. He asked that this become the skill's default behavior.
- **decision-log.md → split the file** (confirmed in a follow-up after an ambiguous
  first answer): product/strategy decisions move to cloud; engineering decisions stay
  in git next to the specs that cite them. Also to become the generalized default.
- **roadmap.md → split the file**: track strategy/sequencing moves; "where the build
  actually is" stays git-side.
- **activity-log.md → move with corpus** (accepted the lean).

## Heuristic misses

- `decision-log.md`: opening lean was *move whole file*; actual call **split**.
- `roadmap.md`: opening lean was *keep whole file*; actual call **split**.
- Pattern behind both: the heuristic treated "split" as an escape hatch for contested
  files, but for **mixed strategy+build docs, split is the default right answer**, not
  a fallback. The opening proposal should lead with it.
- `RESOLVER`/`BRAINKEEPER`: lean (keep) was right, but the proposal offered a
  "keep + cloud copy" option Adrian rejected on principle — duplication is the wrong
  instinct; a single git-side doc can govern cloud content too.

## New rules extracted (now defaults in SKILL.md)

1. **Mixed docs split by default.** Decision logs, roadmaps, and any doc interleaving
   strategy with build/engineering state get a *split* opening proposal: strategy
   sections → cloud, build/engineering sections → git (or specs).
2. **One governance doc, git-side.** Process/filing/maintenance rules stay in git as a
   single file that governs both the git side and the cloud corpus. Never propose a
   cloud duplicate; consolidation of multiple process docs into one is a valid
   proposal.
3. **Bookkeeping follows its corpus.** Activity/maintenance logs move (or retire) with
   the corpus they describe.

## Author's notes on this run

- 5 of 10 files landed contested — for a corpus this small that's fine (the contested
  conversation is the product), but if the ratio stays this high on bigger corpora the
  opening heuristic isn't earning its keep.
- The strongest keep-signal found: **referenced from CLAUDE.md** (clone-time
  dependency). The strongest move-signal: **PENDING EXTRACTION / candid direction**
  (revocability + non-repo audience). Both were content-derived, not filename-derived.
- Two files (`decision-log`, `roadmap`) surfaced "split the file" as the honest
  proposal — the skill needed a third verb beyond move/keep; added to the draft.
