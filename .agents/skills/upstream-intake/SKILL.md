---
name: upstream-intake
description: This skill should be used when the user asks to "run upstream intake", "review the original remote", "sync safe upstream changes", "check for upstream updates", or selectively review and port changes from bholmesdev/hubble.md without merging the upstream branch wholesale.
---

# Upstream Intake

Treat this repository as a permanent product fork with a curated intake channel. Review
upstream behavior against Hubble's current cloud-authority and projection contracts;
never optimize for wholesale mergeability. Use `specs/upstream-intake/README.md` as the
durable policy and `specs/upstream-intake/state.json` as the review watermark and
candidate queue.

## Select a mode

Use **default mode** for “Run `$upstream-intake`” or “review upstream and apply the
recommended changes.” Review, port, verify, commit, and fast-forward the captured target
branch only when every landing gate passes.

Use **review-only mode** when explicitly requested. Fetch, audit, classify, and write a
run record. Do not port product code or move the target branch. Permit a documentation
commit on the intake branch, but never auto-land it when the original tree started dirty.

Use **branch-only mode** when asked to leave the result on a branch. Review, port, verify,
and commit there. Never move the target branch.

## Run the intake

1. Read `AGENTS.md`, `brain/README.md`, `brain/BRAINKEEPER.md`,
   `brain/synthesized/roadmap.md`, the state file, this policy, and the latest run record.
   Read the current product contracts cited by the policy before judging semantic risk.
   Read `convex/_generated/ai/guidelines.md` before considering or changing Convex code.
2. Run `pnpm upstream:audit -- --json`. Retain the complete JSON. Pass `--no-fetch` only
   when explicitly performing offline inspection; normal intake fetches and prunes the
   configured remote.
3. Capture the configured target branch name, target ref, target HEAD, checked-out HEAD,
   and starting cleanliness from the audit. Announce the upstream range, selected mode,
   target, and whether a dirty starting tree forbids automatic landing.
4. Group newly seen commits and queued candidates by behavior and dependency. Do not
   process merge commits blindly. Assign every reviewed commit or coherent cluster
   exactly one disposition: `adopt`, `reimplement`, `superseded`, `defer-product`,
   `skip`, or `blocked`.
5. Create `specs/upstream-intake/runs/YYYY-MM-DD-<upstream-short-sha>.md` and update it
   incrementally. Record rationale, upstream SHAs, paths and product boundaries,
   mappings to local commits, verification, disposition, and unresolved work.
6. Inspect upstream tests and current fork behavior before applying an eligible cluster.
   Prefer behavior and regression tests over patch similarity. Require focused tests
   capable of proving the intended change.
7. Create an isolated branch from the captured target HEAD named
   `codex/upstream-intake-YYYY-MM-DD`, adding `-2`, `-3`, and so on when occupied. Add a
   temporary worktree for that branch. Never apply candidate code in the user's original
   worktree, even when it is clean.
8. Port one dependency-sized cluster at a time. Prefer `git cherry-pick -x` only for an
   isolated leaf commit that applies cleanly and carries no upstream product assumption.
   Otherwise reimplement the tested behavior in current abstractions and add an
   `Upstream-commit: <sha>` trailer. Commit and run focused verification after each
   cluster. If it fails, remove or revert only that cluster inside the intake worktree,
   record `blocked`, and preserve all user work.
9. Run changed-file Biome checks, relevant package tests/typechecks, and every acceptance
   gate named by the affected spec. Run `pnpm build:desktop` for desktop, editor, sync,
   backend, or shared product-code changes. Do not claim adoption when required tests are
   unavailable or blocked.
10. Run the repository `simplify` skill, then `review-readiness`. Address actionable
    findings and rerun affected verification.
11. Finalize the run record first. Advance `screenedThrough` only when every commit from
    the old watermark through the proposed watermark has a durable disposition in that
    record. Remove a queued candidate only after recording its final disposition. Never
    equate screening with adoption, erase deferred/failed history, or advance past an
    unreviewed commit.
12. Update `brain/synthesized/roadmap.md` and the cloud brain activity log when build
    state or direction changed. Commit intentional intake and process records on the
    intake branch.
13. Leave the result on the branch in branch-only mode. In review-only mode, leave the
    record branch unlanded when the starting tree was dirty.
14. In default mode, re-read the original target ref and original worktree state. Land
    only by fast-forward when the target branch/ref/HEAD still equal the captured values,
    the original worktree was clean at start and remains clean, all verification passed,
    and the intake branch has no unresolved conflict or partial commit. Otherwise leave
    the verified branch and report the exact next action. Never force-update a ref.
15. Report the reviewed range, every disposition, applied/local commit mappings,
    verification, state watermark before/after, resulting branch/HEAD, landing outcome,
    unresolved items, and the next review point.

## Mandatory safety gates

- Never merge all of `upstream/main` or run `git rebase upstream/main`.
- Never run `git reset --hard`, discard unrelated changes, or reuse the user's dirty
  worktree for application.
- Never push, open a pull request, deploy, publish, contact people, or mutate upstream
  unless the user explicitly asks.
- Treat textual cleanliness as insufficient for shared editor, sync, desktop shell,
  authorization, persistence, filesystem, or projection changes. Review document
  identity, authority, permissions, filesystem writes, projection lifecycle,
  serialization, access revocation, and offline recovery semantics explicitly.
- Never auto-apply major navigation/product surfaces, auth or permission model changes,
  Convex migrations, platform/distribution expansion, broad toolchain migrations, or
  anything that weakens cloud authority and projection safety. Record `defer-product`
  unless explicit direction changes the roadmap.
- Preserve upstream attribution with `-x` or an `Upstream-commit:` trailer.

When any gate fails, keep the branch and append-only run record intact and stop with an
exact recovery or decision request.
