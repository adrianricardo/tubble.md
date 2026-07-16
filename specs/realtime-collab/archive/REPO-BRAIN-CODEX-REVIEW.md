# Repo-Brain — Codex Second Opinion (reference)

> Captured 2026-07-03. Source: a skeptical second-opinion pass by Codex
> (session `019f2900-9361-76a0-a2be-15f709008088`) against `REPO-BRAIN-VISION.md`,
> `REPO-BRAIN-RATIONALE.md`, `README.md`, and `TECH.md`.
>
> **Status: reference, not a blocking checklist.** These are archived for future
> planning / second opinions, not an active work list. The docs themselves were
> **not** changed in response.
>
> **Author dispositions (2026-07-03):**
> - **Finding #1 (Cowork local/folder assumption) — resolved.** Cowork pointing at
>   a folder is confirmed possible. This was Codex's top "blocker"; it no longer
>   blocks. The `RATIONALE §4.2` bet stands as satisfied.
> - Remaining findings are acknowledged but **not prioritized right now.** Revisit
>   at release-planning time. The one worth an eventual doc fix is **#4** (the
>   "absolute revocability" wording is technically overstated — local synced-folder
>   copies exist outside Convex).
> - **Update 2026-07-03 (critique round 2):** **#4 fixed** — revocability wording
>   tightened in `REPO-BRAIN-VISION.md` (Decided #6) and `REPO-BRAIN-RATIONALE.md`
>   (D4/D5). **#7 resolved at the semantics level** — folder sharing now specified
>   as Drive-style inheritance with a folder-scoped guest (D12); implementation
>   design lands in the execution plan. **#8 is stale** — production signed-in
>   presence/cursors landed in `V1-EXECUTION.plan.md` P4 (2026-06-30).

---

## Findings (as delivered, ranked most-severe first)

### 1. "One bridge, no MCP" rests on the Cowork-local assumption — *RESOLVED per author*
Codex severity: **blocker.** The whole simplification assumed Cowork runs locally
and can be pointed at a folder; if false, MCP/cloud-agent access re-enters v1.
**Author note: confirmed possible — no longer a blocker.**

### 2. Wedge persona unvalidated / possibly too narrow
Codex severity: **blocker.** "Non-technical" ∧ "agent-native" ∧ "local desktop
agent user" ∧ "willing to install Hubble" — the plan optimizes nearly every hard
choice around this one persona, and the desktop-install step undercuts the "a link,
not a clone" promise. Rec: validate with real candidates before release planning.

### 3. All-cloud excludes codebase-contract docs
Codex severity: **serious.** README / `CLAUDE.md` / ADRs most naturally belong in
git history; all-cloud excludes them. Rec: define a hard v1 exclusion list; don't
claim "all repo context" until folder-level git-export exists.

### 4. "Absolute revocability" is overstated
Codex severity: **serious.** The synced folder materializes local copies (plus
backups, editor caches, agent transcripts) outside Convex. Avoiding git removes one
permanence vector, not all. Rec: reword to "no git permanence; cloud access is
revocable," and define local-projection revocation behavior. *(Author: the one
finding worth an eventual doc fix.)*

### 5. 256 KiB doc cap vs "all context in the cloud"
Codex severity: **serious.** Real brains include long specs/transcripts/research
dumps. Rec: design the content model around the cap; don't market unlimited context.

### 6. Markdown↔ProseMirror reconcile fidelity is a central risk
Codex severity: **serious.** If conversion corrupts tables/frontmatter/embeds, agent
edits become untrustworthy — attacking the exact v1 demo. Rec: gate v1 on a fidelity
test suite + destructive cases; frequent `*.local-edit` fallback = failed bridge.

### 7. Folder permissions underdesigned
Codex severity: **serious.** Nested shares, moves across subtrees, revocation, link
scopes, selective desktop materialization all need exact semantics or docs leak
across subtrees. Rec: design inheritance/revocation before implementation.

### 8. Presence/cursors gap in the substrate
Codex severity: **serious.** `DECISIONS.md` notes prosemirror-sync exposes "no
obvious presence/cursor API," yet v1 promises live cursors. Rec: resolve before
locking v1 scope, or downgrade the promise to convergence.

### 9. Cutting embedded chat leans on smooth Cowork integration
Codex severity: **minor.** Rec: add a narrow "Open in Cowork" folder-launch flow +
recovery if Cowork isn't detected.

### 10. Repo-first coexistence slightly hand-wavy (but attack mostly doesn't land)
Codex severity: **minor.** Rec: write an explicit old→new (web-first → repo-first)
migration map.

## Overall verdict (Codex)

"Not sound enough to turn into a release plan as-is" — citing the two blockers
(#1, #2) plus tightening #4 revocability, #7 folder permissions, and #6 reconcile
fidelity. **With #1 resolved by the author, the primary remaining pre-planning risk
is #2 (persona validation).**
