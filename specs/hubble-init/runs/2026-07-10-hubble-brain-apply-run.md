# hubble-init apply run — 2026-07-10 — hubble.md `brain/` (Track C target 2)

**Mode:** apply. **Target:** this repo's `brain/` (13 files at run time).
**Pre-move HEAD (the backup): `b18e84f59529132c0b6dca05067decaa6094dea4`** — pushed
before any destruction. Move commit: `fa26cc4`.

## Preflight

1. Tree clean; `v1-release` pushed (was unpushed — pushed at run start); no stashes. ✅
2. Confirmed triage: `runs/2026-07-09-brain-first-dry-run.md` (rule 16 — settled files
   not re-opened). Corpus delta since triage: 3 new `sources/` captures → moved whole
   per rule 10, uncontested. ✅
3. Workspace target: Adrian chose **"Hubble Product Brain"** on **dev**
   (strong-setter-709), throwaway account + owner-membership handoff. ✅
4. Apply-time question (rule 12): consolidate RESOLVER+BRAINKEEPER → **yes, one doc**
   (BRAINKEEPER.md survives, carries the resolver tree with post-split paths).

## What moved / stayed

- **Moved whole (8):** synthesized/current-vision.md, synthesized/open-questions.md,
  admin/pending-extraction.md, admin/activity-log.md, sources/ ×4.
- **Split (2, entry-level, lossless-proven by sorted line-diff before upload):**
  - decision-log.md → git keeps engineering/build entries; cloud
    `synthesized/product-decisions.md` gets naming/rename-intent, agent-init entry
    point, brain-keeper-absorption (3 entries).
  - roadmap.md → git keeps NEXT STEP + build state; cloud
    `synthesized/track-strategy.md` gets parallel tracks + sequence note.
- **Kept (git):** README.md (rewritten as split index), BRAINKEEPER.md (consolidated
  governance), decision-log.md + roadmap.md git halves.
- **Deleted:** RESOLVER.md (merged into BRAINKEEPER.md). CLAUDE.md refs updated.

## Cloud artifacts (dev)

- Workspace `mn7amd2bpynf2a2990xsn2r6rh8aahh6` "Hubble Product Brain"
- Folder "Hubble Brain" `kx73kjp5be3196dk53g9ynq5ns8aaysv`
  (synthesized `kx7csf7aqe2hav5p559s39v2qd8ab730`, admin `kx759s2yq0m8hc25zayvbh92ms8abkja`,
  sources `kx75t9mt41e06g3xmftb5h6ben8ab22w`)
- 10 docs + seeded BRAIN.md `kn77988rx3a8shmhrndj1nqygh8aah14` (doc ids in run
  scratch). Adrian invited owner member (status "added",
  user `mh7bw1v5nzb3my247f8kf0817989cz28`).
- Run creds: **deleted 2026-07-11** after Adrian confirmed the workspace + folder
  tree in his desktop UI (handoff complete; he holds owner membership).

## Verification (rule 13 gate)

Export-diff of all 10 uploads, first serializer-idempotent run (post-`68d15eb`):

- **Zero content loss.** Word-stream identical for 9/10 docs.
- **Normalizations accepted + recorded:** (a) list-item continuation lines lose
  leading indentation (lazy-continuation form; stable on re-parse; ugly — filed as a
  serializer follow-up); (b) blank line inserted between heading and first paragraph;
  (c) one mark-order canonicalization in open-questions.md: `~~**x**~~` →
  `**~~x~~**` (same marks, deterministic tie-break order).
- **New gate added this run:** every exported doc verified as a round-trip **fixed
  point** (export∘import(export) == export) — guarantees the mount won't churn.

## Recovery proof

- `git show b18e84f:brain/synthesized/current-vision.md` byte-identical to the
  uploaded source. ✅
- Mounted projection (`brain/cloud/`, one-shot CLI export, git-excluded via
  `.git/info/exclude` anchored `/brain/cloud/`) matches the verified export. ✅

## Process notes / misses

- `hubble cloud folder export --out` resolves relative paths against `--cwd`, not the
  caller's cwd — first mount materialization landed in the scratch dir. Use absolute
  `--out`.
- zsh does not word-split unquoted command variables — a `CLI="node …"` + `$CLI`
  pattern failed silently (empty ids). Use a shell function.
- SKILL.md step 8 still said "folder share, role editor" while the learned policy
  (and this run) uses workspace owner membership — fixed in the same pass.
- Live watch remains a desktop job: Adrian repo-links "Hubble Brain" → mount path
  `<repo>/brain/cloud` (repo root = hubble.md). Until then the projection is static.
- Post-split logging: this run's activity-log entry belongs in the *cloud*
  activity-log; appended to the mounted file (will sync once live watch is on).
