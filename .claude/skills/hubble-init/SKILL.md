---
name: hubble-init
description: Triage a repo's durable prose context into "move → Hubble cloud" vs "keep → git". DRY-RUN ONLY for now — scan + interactive triage proposal, zero writes to cloud or the scanned files. Use when the user runs /hubble-init <dir>, asks to triage docs for Hubble, or wants to dry-run the brain split.
---

# hubble-init (dry-run)

You are running the front door of Hubble: an **interactive triage session** that splits
a directory's durable context into docs that should live in a repo-linked Hubble cloud
folder vs docs that should stay in git. Design authority:
`specs/hubble-init/DESIGN.md`. The interactivity IS the product — you propose an
opening split, then help the user reason through every contested file. You are a
thinking partner, not a batch classifier.

## Mode guard — read first

**This skill is dry-run only.** Apply-mode is blocked until the triage logic feels good
across repeated dry-runs (decision log 2026-07-09) and requires a pre-move git commit.
In this mode you must NOT:

- write, move, delete, or rename any scanned file
- touch `.git/info/exclude`, create workspaces, upload documents, or call any Hubble
  CLI/backend/desktop surface

The only writes permitted are (a) the run record under `specs/hubble-init/runs/` and
(b) edits to this SKILL.md when the run reveals a heuristic flaw. If the user asks you
to actually move files, decline and point at the apply-mode gate in
`brain/synthesized/roadmap.md` Track C.

## Inputs

`/hubble-init <dir>` — triage that directory. `/hubble-init` with no argument — triage
the whole repo's prose surface: `docs/`, `specs/`, `notes/`, `brain/`, plus root-level
`*.md`, skipping code-coupled locations (see Scan).

## Step 1 — Scan

Walk the target for prose-shaped durable context:

- `*.md` (and similar prose: `.mdx`, `.txt` notes) under the target dir
- Skip: `node_modules/`, build output, `_generated/`, code-coupled docs that a tool
  reads mechanically (`.claude/skills/`, `.cursor/`, license files)
- Note file size, last-commit date (`git log -1 --format=%cs -- <file>`), and whether
  the file is referenced from CLAUDE.md/AGENTS.md/README (a clone-time dependency
  signal)

Read every file you will classify — enough to know what it *is*, not skim the filename.
Classification by filename is the failure mode this skill exists to avoid.

## Step 2 — Opening proposal

Classify each file into one of three buckets, each with a **one-line reason grounded in
the file's actual content**:

**Move → cloud** when the doc is:
- opinion/strategy/vision that evolves through discussion rather than code review
- needed by people (or agents) without repo access
- something that should be revocable — sensitive bets, pricing, candid session notes
- living shared context agents should read/write across sessions

**Keep → git** when the doc is:
- needed at clone/build time: README, CLAUDE.md/AGENTS.md, ADRs, runbooks tied to code
- something that wants line-diff review alongside the code it describes
- an operational contract other checked-in files depend on

**Split the file** when a doc interleaves strategy with build/engineering state
(decision logs, roadmaps are the canonical cases): propose strategy sections → cloud,
build/engineering sections → git or specs. **Split is the default opening call for
mixed docs, not a fallback** — say exactly which sections go where.

**Relocate within git** when a doc is alive but misfiled — e.g. live process rules
sitting in an archive folder. Propose the in-git move; don't force it into move/keep.

**Contested** when signals genuinely conflict. Do not force a call — contested files
are the point of the conversation. But apply the learned defaults below before marking
a file contested; only genuinely novel conflicts should land here.

Present the proposal as a table: file, call, one-line reason, confidence. Then state
the **honest-scope rule verbatim**: already-committed files keep their git history —
moving a file stops *future* git history only; the pre-move state stays reachable in
git forever.

## Step 3 — Interactive triage

Never batch-confirm. Work through the contested files (and any file the user pushes
back on) using the **AskUserQuestion tool** — one question per file or per tightly
coupled pair, up to 4 per call. Each question must carry your reasoning: the option
descriptions should say *why* each destination is defensible, so the user is choosing
between arguments, not labels. Offer at minimum: move, keep, and where the file is
mixed, "split the file". The user can override any non-contested call too — treat
every override as data (Step 4).

If the user reasons their way to a new *general* rule ("logs follow their corpus",
"anything cited by CLAUDE.md stays"), reflect it back, confirm it's a rule and not a
one-off, and record it for Step 4.

## Step 4 — Record the run, then improve this skill

After the conversation (or after presenting the proposal, if the user hasn't answered
yet), write `specs/hubble-init/runs/YYYY-MM-DD-<slug>.md` containing:

1. Target + file inventory
2. The opening proposal exactly as presented (so future runs can diff heuristics)
3. The user's decisions and their reasoning
4. **Heuristic misses** — every place the opening call differed from the final call,
   and why
5. New rules extracted from the conversation

Then, in the same pass, edit this SKILL.md so the next run's opening proposal would
have gotten those files right. The skill is checked into the repo precisely so each
dogfood run versions the logic change next to the observation that motivated it.

## Learned rules (grows with each run)

From `specs/hubble-init/runs/2026-07-09-brain-first-dry-run.md` (Adrian's calls):

1. **Mixed docs split by default.** Any doc interleaving strategy with
   build/engineering state (decision logs, roadmaps) gets a *split* opening proposal —
   strategy → cloud, build/engineering → git or specs. Don't propose move-whole or
   keep-whole for these.
2. **One governance doc, git-side.** Process/filing/maintenance rules (RESOLVER,
   BRAINKEEPER, and their equivalents) stay in git as a **single** file that governs
   both the git side and the cloud corpus. Never propose a cloud duplicate of process
   rules; proposing consolidation of several process docs into one is encouraged.
3. **Bookkeeping follows its corpus.** Activity/maintenance logs move (or retire) with
   the corpus they describe — don't keep a log in git for content that left git.
4. **Strong keep-signal:** referenced from CLAUDE.md/AGENTS.md (clone-time dependency).
   **Strong move-signal:** candid/evolving direction, revocable content, non-repo
   audience. Both must be derived from file *content*, never the filename.

From `specs/hubble-init/runs/2026-07-09-archive-stress-run.md` (Adrian's calls):

5. **No archive exemption.** Archived/executed docs follow the same content rules as
   living docs — never propose a corpus-level wholesale call for an archive. "Archive"
   is an organizational property the destination preserves (cloud history section /
   git archive dir), not a triage input. Rule 1 (mixed docs split) applies to dead
   docs too.
6. **The cloud brain holds strategy history.** Superseded vision/strategy docs and
   candid strategy critiques are move-shaped even though no longer living — file them
   as history/timeline material cloud-side. Liveness is not a move/keep signal for
   strategy content. Engineering history (build journals, executed plans, ADR-shaped
   records, task briefs) stays git-side.
7. **Moving out of an indexed folder obligates the index.** If a proposal moves files
   that a local README/index enumerates, the proposal must include updating that index
   at apply time.
