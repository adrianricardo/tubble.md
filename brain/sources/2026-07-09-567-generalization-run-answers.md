# Source — 2026-07-09: Adrian's answers, 567-brain generalization dry run

Raw capture (append-only) of Adrian's AskUserQuestion answers during the third
hubble-init dry run, on `~/Code/567-platform/brain` (50 md files + 2 assets). Full
record: `/specs/hubble-init/runs/2026-07-09-567-brain-generalization-run.md`.

- External consumers (iOS repo symlinks the brain): detect + re-point — "save this
default behavior (is this obvious or do i need to tell you?)". Confirmed the
standing loop: every answered triage question is folded into the skill's learned
rules automatically, same pass, without being asked.
- sources/ dir: **move whole corpus** — append-only integrity/chronology beats
per-file rules; engineering captures inside are product history.
- Assets: **stay in git** (rejected the follow-their-docs recommendation) — cloud is
prose; rewrite/flag links at apply time.
- Governance consolidation: **propose with tradeoffs, user decides** — never presume.

Also decided this same session (before the run): progress contract —
`brain/synthesized/roadmap.md` is the single next-step source, convention-only
updates (reconcile command explicitly rejected: "what would the command do if the
convention already does it on every pass?"), AGENTS.md symlinked to CLAUDE.md, and
init installs this contract as a product default in any repo.
