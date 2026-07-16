---
name: hubble-init
description: Triage a repo's durable prose context into "move → Hubble cloud" vs "keep → git". Dry-run by default (scan + interactive triage proposal, zero writes); apply-mode executes a confirmed split behind a hard safety preflight. Use when the user runs /hubble-init <dir>, asks to triage docs for Hubble, or wants to run/dry-run the brain split.
---

# hubble-init

You are running the front door of Hubble: an **interactive triage session** that splits
a directory's durable context into docs that should live in a repo-linked Hubble cloud
folder vs docs that should stay in git. Design authority:
`specs/hubble-init/DESIGN.md`. The interactivity IS the product — you propose an
opening split, then help the user reason through every contested file. You are a
thinking partner, not a batch classifier.

## Mode guard — read first

**Dry-run is the default mode.** In dry-run you must NOT:

- write, move, delete, or rename any scanned file
- touch `.git/info/exclude`, create workspaces, upload documents, or call any Hubble
  CLI/backend/desktop surface

The only dry-run writes permitted are (a) the run record under
`specs/hubble-init/runs/` and (b) edits to this SKILL.md when the run reveals a
heuristic flaw.

**Apply-mode** (unblocked 2026-07-09 — both Track C gates satisfied) runs only when
the user explicitly asks to apply, and only after the **safety preflight** below
passes. If the preflight fails, fall back to dry-run and report what blocked it.

### Apply-mode safety preflight (all mandatory)

1. **Everything on the remote.** Target repo working tree is clean; every local
   branch is pushed (`git log --branches --not --remotes` is empty); note any
   stashes as unpushable. Record the pre-move HEAD sha in the run record — it IS
   the backup.
2. **A confirmed triage exists** — either a prior run record with the user's final
   calls for this corpus, or a fresh interactive triage completed in this session.
   Never apply an unconfirmed opening proposal.
3. **Workspace target is explicit.** The user has named the workspace or approved
   creating one in their own account.

### Auth for headless runs

Preflight checks that the local CLI is logged in as the user. If
`~/.hubble/credentials.json` is missing or a cloud command reports that the saved login
expired or was revoked, stop and prompt the user to run `hubble login` for the target
deployment. Do not mint throwaway accounts for apply-mode runs.

Workspaces and folders are created as the logged-in user from the first API call.
Workspace names are globally unique per deployment. CLI stdout can carry backend WARN
lines before ids — parse ids from the last line, never the first.

## Apply-mode steps

Uploads first, destruction last — the working tree is not touched until every moved
doc is verified in the cloud.

1. **Create the destination**: `hubble cloud create`/`connect` (workspace), then
   `hubble cloud folder create` mirroring the corpus's directory structure. These
   calls must use the saved `hubble login` identity unless the user explicitly
   supplied a stronger auth override.
2. **Upload the move set**: `hubble cloud document create --title … --file … --folder
   … --path …` for every moved doc, preserving relative paths.
3. **Execute splits** (rule 1 docs): write the git-side half in place, upload the
   cloud-side half; each half links to its counterpart's location.
4. **Verify before deleting**: `hubble cloud folder export --folder … --out <tmp>`
   and diff every uploaded doc against its source (tolerating only trailing-newline
   normalization and deliberate split/asset-link edits). Do not proceed on any
   mismatch.
5. **The move commit**: remove moved originals, update indexes that enumerated them
   (rule 7), rewrite/flag asset links (rule 11), then commit — the commit message
   names the workspace/folder ids and states the honest-scope rule. Push it.
6. **Mount the live folder**: run `hubble mount --workspace … --folder …
   --folder-name … --repo <repo> [--path <mount>]`. This hands the link to the
   desktop app, starts the watched mount with zero clicks, and must not be treated as
   complete until the CLI proves the mount is live.
7. **Seed BRAIN.md** via `hubble cloud document create` — only if the folder has no
   BRAIN.md/brain-titled doc already (seed-once, never regenerate).
8. **Confirm ownership**: because the workspace was created as the logged-in user,
   verify the workspace appears for that account before proceeding to mount/link
   steps.
9. **Progress contract** (rule 8): CLAUDE.md pointer block; AGENTS.md → symlink to
   CLAUDE.md after merging any unique content; roadmap doc seeded if missing.
10. **Re-point external consumers** (rule 9): update sibling-repo symlinks/references
    to resolve against the kept-in-git half plus the mount.
11. **Prove recovery** before declaring success: restore one moved doc's pre-move
    content from git (`git show <pre-move-sha>:<path>`) and read one doc back from
    the cloud (`hubble cloud document get`). Both must round-trip.
12. **Record the run** under `specs/hubble-init/runs/` (same contract as Step 4
    below) including: pre-move sha, workspace/folder/document ids, verification
    results, and anything apply-mode got wrong — then fix this skill in the same
    pass.

If the user asks to move files without the preflight passing, decline and point at
the failing precondition.

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
8. **Apply-mode seeds the progress contract** (decided 2026-07-09, see DESIGN.md
   §Progress contract): CLAUDE.md pointer block naming the roadmap doc as the single
   "where we are + what's next" source (convention-only updates, no command);
   AGENTS.md symlinked to CLAUDE.md (merge unique content first if a real file
   exists); roadmap doc seeded if missing. In dry-run, *report* whether the repo
   already satisfies the contract; write nothing.

From `specs/hubble-init/runs/2026-07-09-567-brain-generalization-run.md` (foreign-repo
run; Adrian's calls — note: every AskUserQuestion answer in a run is ALWAYS folded back
into these rules in the same pass, without being asked to):

9. **External-consumer check.** Scan for consumers of the target outside the repo
   (sibling-repo symlinks to it, cross-repo references in agent files); dry-run
   reports them, apply-mode re-points them at the synced-folder projection.
   Multi-repo mounting of one brain is a named platform requirement.
10. **Corpus integrity beats per-file rules for append-only source dirs.** A
    `sources/`-style append-only capture archive moves (or stays) *whole* — even when
    some captures are engineering-shaped; chronology is the value. Rule 6 yields here.
11. **Binary assets stay in git.** Cloud is prose; apply-mode rewrites or flags asset
    links in moved docs rather than moving binaries.
12. **Consolidation is proposed, never presumed.** When suggesting merging process
    docs (rule 2), present a concrete proposal with tradeoffs (what's lost: file-level
    ownership, focused diffs) and let the user decide per-repo.

From `specs/hubble-init/runs/2026-07-09-567-brain-apply-run.md` (first real apply):

13. **Markdown fidelity is an apply gate — never skip the export-diff.** Diff every
    uploaded doc against its source before deleting anything, and classify:
    byte-identical / normalization-only (accept and record) / real loss (STOP). This
    step caught Live Documents silently dropping GFM tables (fixed 2026-07-09,
    `65c21c6`) and drove the serializer-idempotency work (fixed 2026-07-10,
    `f8048e3` + `68d15eb`: nested emphasis, lone `~`, verbatim frontmatter, autolink
    style, trailing newline). Known remaining normalizations (2026-07-10 run):
    list-item continuation lines lose indentation, a blank line appears between a
    heading and its first paragraph, and mark nesting order canonicalizes
    (`~~**x**~~` → `**~~x~~**`). Also verify every exported doc is a round-trip
    **fixed point** (re-import → re-export is byte-identical) so the mount can't
    churn; `packages/editor` roundTrip test helpers make this a one-liner.
14. **Nest the mount inside the corpus dir when a split leaves a git half**
    (`brain/cloud/` pattern): external consumers that symlink the corpus root keep
    resolving both halves with zero re-pointing; give cloud halves of split docs
    distinct filenames so the projection can't shadow the git files.
15. **Split mixed docs at entry level, and prove the split lossless** (sorted
    line-diff of the two halves + preamble against the original) before uploading.
16. **Executed-triage reuse:** a prior run record with the user's confirmed calls
    IS the confirmed triage (preflight #2) — don't re-open settled files; only
    apply-time choices (workspace, mount path, deferred proposals) get questions.
