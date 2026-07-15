# Selective upstream intake

Hubble is a permanent product fork of `bholmesdev/hubble.md`. Upstream remains a useful
source of fixes and tested behavior, but it is not an authority for this fork's product
model. Run `$upstream-intake` for the judgment workflow and `pnpm upstream:audit` for a
deterministic read-only comparison.

## Commands

```sh
pnpm upstream:audit
pnpm upstream:audit -- --json
pnpm upstream:audit -- --no-fetch
```

The audit locates the repository from any descendant directory, validates `state.json`,
fetches `upstream` with pruning by default, and compares the configured target branch to
the remote-tracking ref. `--no-fetch` makes offline and fixture results deterministic.
The script never changes the worktree, index, local branches, or target ref. A normal
fetch may update only remote-tracking refs.

JSON output uses `schemaVersion: 1`. It includes the target ref and cleanliness,
upstream/watermark reachability, merge base and divergence, newly seen commit metadata,
changed-path overlap, synthetic merge conflicts, and the candidate queue. Markdown is a
concise rendering of the same result. Divergence and conflicts are report data, not
errors. Invalid state, missing Git objects/refs, or a failed requested fetch are errors.

## Review policy

Assign exactly one durable disposition to each new commit or coherent dependency cluster:

- `adopt` — compatible isolated behavior can be applied directly.
- `reimplement` — retain the behavior or tests in the fork's current architecture.
- `superseded` — the fork already provides equivalent or stronger behavior.
- `defer-product` — require an explicit roadmap/product decision.
- `skip` — irrelevant, release-only, automation-only, or incompatible work.
- `blocked` — dependencies or product intent are too unclear to decide safely.

Auto-apply only correctness, security, accessibility, portability, performance, or
maintainability improvements with understood dependencies and focused proof. Never
auto-apply changes that restore standalone local authority, upstream sidebar/workspace
assumptions, or upstream sync authority. Report major navigation, new product surfaces,
auth/permissions changes, Convex migrations, new distribution platforms, broad toolchain
migrations, and weaker projection/offline/revocation safeguards as `defer-product`.

The governing product boundary is Git by default with explicit folder moves to or
from Hubble Cloud; writable watched projections remain the cloud-folder interface.
Read `brain/synthesized/current-vision.md`,
`brain/synthesized/product-decisions.md`, and
`specs/desktop-cloud-workspace/PRODUCT.md` before resolving semantic risk. Read
`convex/_generated/ai/guidelines.md` before considering Convex changes.

## State and records

`state.json` is versioned. `screenedThrough` means every upstream commit through that SHA
received a recorded strategy disposition; it does not mean each commit was adopted.
Advance it only after the new range is fully represented in one append-only run record.
Never advance across an unreviewed or unrecorded commit. Remove a queue entry only after
its final disposition appears in a run record.

Write each execution to `runs/YYYY-MM-DD-<upstream-short-sha>.md`. Include:

- starting target branch/ref/HEAD, cleanliness, upstream range, merge base, divergence,
  overlap, and conflict summary;
- one disposition and product-grounded rationale per commit or coherent cluster;
- upstream-to-local commit mappings and whether a port was direct or manual;
- focused and final verification with exact results;
- landing, branch-only, or review-only outcome;
- watermark before/after and all deferred, failed, or blocked items.

Preserve records; never rewrite an older run to hide a deferred or failed result.

## Application and landing

Apply in a temporary worktree on `codex/upstream-intake-YYYY-MM-DD` (with a numeric
suffix when needed), created from the captured target HEAD. Commit and verify one behavior
cluster at a time. Use `cherry-pick -x` only for compatible leaf commits; manual ports use
an `Upstream-commit:` trailer.

Default-mode landing is a guarded fast-forward. Recheck that the original target
branch/ref/HEAD did not move, its original worktree was clean at capture and remains
clean, every required check passed, and no partial conflict remains. When any condition
fails, preserve the intake branch and report the exact next action. Review-only never
ports code. Branch-only never advances the target.

Never merge/rebase all upstream, force-update refs, discard unrelated work, push, open a
PR, deploy, publish, contact people, or mutate upstream without explicit authorization.

## Review cadence

Invoke locally when checking for upstream updates or before a relevant maintenance pass.
Keep scheduling manual until several successful runs demonstrate that unattended
automation would be safe; no GitHub Action owns this judgment workflow.
