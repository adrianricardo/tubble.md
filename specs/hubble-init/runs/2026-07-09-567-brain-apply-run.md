# hubble-init APPLY run — 2026-07-09 — `~/Code/567-platform/brain` (first real apply)

**Skill version:** rules 1–12 + new apply-mode section. **Mode: APPLY** — first
apply-mode execution ever, on a real repo with a real (previously triaged) corpus.
Triage authority: `2026-07-09-567-brain-generalization-run.md` (Adrian's confirmed
calls) — no re-triage; this run *executed* that split.

## Preflight (all passed)

- Working tree clean; `main == origin/main`; stray branch `deepseek-extraction-spike`
  pushed during preflight. Stash@{0} ("wip dance style labels") noted as unpushable,
  unrelated to brain. **Pre-move sha: `323e163a`** (the backup).
- Confirmed triage: prior run record. Apply-time user decisions (AskUserQuestion):
  desktop-visible workspace (yes), mount at **`brain/cloud/`** (nested → iOS symlink
  needs no re-point), governance consolidation deferred (keep six files as-is).

## What was executed

- Workspace **"567 Brain"** `mn75enwbcm95sxzp6fvk2q2zz98a9w0x` on dev
  (`strong-setter-709`), top folder `kx79ncx594rmxyvdakebnr2shh8a9ch9`, subfolders
  synthesized / sources / admin / admin/reflections / office-hours.
- **40 docs uploaded** (8 synthesized, 1 office-hours, 4 admin, 27 sources) + 2
  split cloud-halves + seeded BRAIN.md = 43 cloud docs. Doc ids:
  `tmp job dir 567-apply/doc-ids.txt` (ephemeral); recoverable via folder list.
- **Splits** (rule 1, entry-level — no intra-entry surgery): `decision-log.md` →
  7 strategy entries to cloud `synthesized/strategy-decisions.md`, 23 engineering
  entries stay git-side; split verified **lossless line-by-line** before upload.
  `roadmap.md` → phases + validation to cloud `synthesized/strategy-roadmap.md`;
  build-state timeline stays git-side (progress-contract doc). Distinct cloud
  filenames chosen so the mounted projection can't shadow the git files.
- **Move commit `180eebc`** (pushed): 40 deletions, README index rewritten (rule 7),
  AGENTS.md brain-split note + progress-contract block. CLAUDE.md→AGENTS.md symlink
  already satisfied the one-entry-file contract (reverse direction, accepted).
- **Mount**: `/brain/cloud/` appended to `.git/info/exclude`; projection
  materialized via `hubble cloud folder export` (43 docs; git status stays clean).
  Live watch remains desktop-app work (gap #2) — one-shot export for now.
- **Handoff**: folder shared to adrian.tavares10@gmail.com (editor,
  status "shared" — account exists on dev); `setFolderRepoLink` metadata set.
- **Consumer** (rule 9): `567-ios` symlink resolves unchanged (nested mount);
  its AGENTS.md updated + committed (`15d245a`, only that file — tree had
  unrelated dirty iOS work).
- **Assets** (rule 11): only asset reference in the corpus is a prose path mention
  in a moved source doc; path stays valid repo-side. No rewrite needed.
- **Recovery proof**: `git show 323e163a:…/current-strategy.md` ✓;
  `cloud document get` returns the doc at revision ≥1 ✓.

## The big finding: markdown fidelity is a first-class apply gate

Pre-deletion verification (folder export → diff all 42 docs) caught the Live
Document pipeline **silently dropping GFM tables** — real data loss in 8 docs
(up to 74 table lines in one doc). Run halted at the decision point (nothing had
been deleted from git). Adrian shipped GFM table support in a parallel session
(hubble.md `65c21c6`), backend redeployed to dev, the 8 docs re-pushed via
`cloud document shim`, and verification re-run: all 8 became normalization-only.

Verified fidelity classes across 42 docs (final):
1. **byte-identical** — 0 (the serializer always normalizes something)
2. **normalization-only, accepted** — 35: whitespace/list reflow, nested-emphasis
   re-serialization (`**…*x*…**` → `*****x*****`), bare-URL/email autolinking,
   YAML frontmatter flattened to text (fences dropped, `## title:` artifact)
3. **real, accepted-with-flag** — 7 docs in class 2 plus one genuine bug confined
   to one doc: lone `~` doubles into `~~` (strikethrough serializer),
   e.g. `~$5,000` → `**~~**$5,000`. Original recoverable from git forever.

## Platform gaps (updates to DESIGN.md)

- **#1 partially closed:** CLI now takes `--auth-token`/`HUBBLE_AUTH_TOKEN`/
  `CONVEX_AUTH_TOKEN`. Working headless pattern: mint throwaway password account
  (`auth:signIn`, flow signUp), run apply, share folder to the user's email
  (`folders:setFolderUserShareByEmail`) → lands in their desktop shared-with-me.
  Real `hubble login` still needed.
- **#5 closed:** `cloud folder create/list/export`, `cloud document create`.
- **#8 NEW — markdown fidelity:** tables were dropped (fixed `65c21c6`); still
  open: `~` doubling, frontmatter flattening, autolink rewriting. Apply-mode must
  keep the export-diff verification step forever; it caught this.
- **#9 NEW — workspace ownership transfer:** the throwaway account owns the
  workspace; Adrian holds folder-editor access only. Need claim/transfer (or
  hubble login) so users own what init creates. Run creds deleted per policy.

## Process notes / misses

- JWTs live 1h: the first minted token expired while the run waited ~5h at a
  permission prompt. Skill now says mint at run start, re-mint on signIn flow.
- zsh: a loop variable named `path` clobbers `$PATH` (13 uploads succeeded, 27
  "command not found" failures, zero partial writes). Parse CLI ids from the
  *last* stdout line — backend WARN lines precede ids.
- Smoke-test residue on dev: workspace "hubble-init-cli-smoke" with
  "smoke-folder" shared to Adrian (editor). Ignorable/leavable in-product;
  its creds were not kept.
- Desktop repo-link/watch of the shared folder was NOT exercised (projection is
  a one-shot CLI export). That's the next milestone.

## Addendum — handoff failure and redo (same day)

The folder-share handoff failed in practice: the desktop sidebar renders only
per-document shares and the repo-link picker lists member workspaces only, so
Adrian (signed in correctly, right deployment) could not see the folder at all
(DESIGN.md gap #10). Worse, the run creds had been deleted per the then-current
skill policy, so the original workspace `mn75enwbcm…` could not be re-shared or
fixed — it is now orphaned junk on dev (also orphaned: two smoke accounts, the
"hubble-init-cli-smoke" workspace, and a folder+workspace share noise on Adrian's
account).

Redo: new throwaway (`hubble-init-run2-…`), workspace **"567 Product Brain"**
`mn707vx0fhbecyjvvgh915gh6h8a8vs6` (name "567 Brain" was taken — workspace names
are globally unique), top folder "567 Brain" `kx7bgt6h7acs862t67ygnhd0rd8a82wb`,
43 docs re-uploaded from the verified mount, export-diff re-verified, and Adrian
added via `members:inviteWorkspaceMember` role **owner** (status "added"). Mount
re-materialized from workspace 2; 567-platform README/AGENTS updated (`6787174`).

New finding while re-verifying: the emphasis serializer is **divergent** — each
import/export cycle adds 4 asterisks to nested emphasis (5 → 9 observed). Gap #8
upgraded from "non-canonical" to "must be idempotent".

Policy fixes folded into SKILL.md: handoff = workspace owner membership (not
folder share); keep throwaway creds until the user confirms visibility in their
UI; creds for this run retained pending Adrian's confirmation.
