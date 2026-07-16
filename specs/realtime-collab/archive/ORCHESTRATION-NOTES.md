# Orchestration Workflow Notes

How the Stage-6 synced-folder + offline work was (and should keep being) driven by
a thin premier orchestrator dispatching tiered sub-agents. Captured from the
2026-06-25/26 session that landed Phases 2–5 (commits `8517af6`→`fb680eb`).

This is a **process** doc, not a status doc — for where the work stands, read
`PROGRESS.md`; for what's next, read `READY-TO-TEST.plan.md` /
`READY-TO-DEPLOY.plan.md`.

---

## The operating model

The top session stays **premier (Opus)** and does **no implementation itself**. It
plans, dispatches one sub-agent per slice at the slice's tier, reviews what comes
back, and integrates. Sub-agents are cheap and cold; the orchestrator is the only
thing that holds the whole picture.

### Model tiers (Claude Code)

| Tier | Model | Use for |
|------|-------|---------|
| Premier | `claude-opus-4-8` | Architectural, cross-cutting, auth/security, anything where a wrong call is expensive or the spec is ambiguous |
| Standard | `claude-sonnet-4-6` | Well-specified feature work, clear acceptance criteria, bounded blast radius |
| Economy | `claude-haiku-4-5` | Mechanical: copy passes, string/label edits, test scaffolding, find-replace |

The orchestrator routes by **file path + short summary**, never by pasting diffs
into its own context. That is what keeps a long multi-slice run affordable.

---

## Rules that made this run work (keep these)

1. **Review before commit — always.** Every sub-agent ran with *do not commit, do
   not edit `PROGRESS.md`*; the orchestrator read the diff, re-ran the load-bearing
   checks **itself**, and only then committed. This caught real bugs an agent's own
   report missed (see "Session-limit recovery"). An agent's "all green" is a claim,
   not evidence.

2. **`pnpm typecheck` is the load-bearing check, not `pnpm check`.** `pnpm check`
   is Biome lint/format only — it does **not** typecheck or build. The real gates:
   - `pnpm typecheck` — all 6 TS packages (build `@hubble.md/sync` first if a slice
     adds new `@hubble.md/sync` exports that `convex-client`/desktop consume via
     `dist`).
   - `pnpm build:desktop` — desktop tsc + electron-vite.
   - `pnpm --filter @hubble.md/desktop test` / `--filter @hubble.md/sync test`.
   - Convex (`packages/sync-backend`) has **no** typecheck script — only
     `convex codegen` against a live deployment verifies it. Treat all Convex
     function changes as **deployment-gated** and say so.

3. **Parallelize only on disjoint files.** Two sub-agents ran in parallel when —
   and only when — their file sets didn't overlap (e.g. `convex/` backend vs
   `apps/desktop`). Anything touching the same files (the desktop phases) was
   strictly serialized to avoid git-index races and `.tsbuildinfo` corruption.

4. **Scope seams explicitly; don't half-build.** Large, hard-to-verify pieces (the
   reactive cloud→disk subscription, the offline queue) were left as **named no-op
   seams** with a comment naming their owner, rather than a half-working
   implementation. A seam is honest; a half-build is a trap for the next agent.

5. **Briefs carry the gotchas.** Each brief named the exact files, the verify
   commands, what to defer, and the known traps (non-strict electron tsconfig;
   `pnpm check` ≠ typecheck; convex codegen is deployment-gated). A good brief means
   the cold sub-agent never re-derives context — and never "verifies" with the
   wrong command.

6. **One changelog + checklist edit per code commit.** Progress never drifts from
   reality because the `PROGRESS.md` task-note + changelog line land in the **same
   commit** as the code — written by the orchestrator after review, not the agent.

---

## Session-limit recovery (the Phase 3b save)

A sub-agent hit its session limit mid-slice and returned **no report** — but had
left ~1500 lines across 9 files. The recovery procedure that worked:

1. `git status --short` + `git diff --stat` to see the real blast radius.
2. Check for surprise deps (`grep chokidar apps/desktop/package.json`) and confirm
   `package.json`/lockfile weren't dirtied.
3. Run the **build**, not just tests — the build surfaced a type error the tests
   didn't (a non-strict-tsconfig narrowing failure).
4. Read the failing code and **fix forward** rather than reset; the work was sound,
   only the last mile was missing.

Two real bugs the interrupted agent never reported, found in review:
- **`AcquireLockResult` discriminated union** didn't narrow under the desktop
  electron `tsconfig.node.json` (which is **non-strict** — no `strictNullChecks`,
  extends no base). A boolean-discriminant union won't narrow there. Fix: flatten to
  optional fields. *General lesson: electron-tier code is non-strict; discriminated
  unions on boolean discriminants silently don't narrow.*
- **`isSelfWrite` swallowed renames** — it blanket-suppressed any hash-less event on
  a freshly-materialized path, dropping the `unlink` half of a post-materialize
  rename. Fix: an `unlink` is never our own write (the engine only writes files), so
  it must never be self-write-suppressed.

---

## Dispatch checklist (per slice)

- [ ] Brief exists at `specs/realtime-collab/tasks/<ID>-<slug>.md`, self-contained.
- [ ] Tier assigned honestly (don't send architectural work to Sonnet, don't burn
      Opus on a copy pass).
- [ ] Dependencies satisfied (or running disjoint-in-parallel).
- [ ] Brief says: exact files, verify commands, what to defer, `do not commit / do
      not edit PROGRESS.md`, return a short summary.
- [ ] On return: read diff → re-run typecheck/build/tests → fix-forward if needed →
      write PROGRESS note + changelog → commit → confirm clean tree.

---

## When to escalate a tier

Re-dispatch at a higher tier if a standard/economy agent comes back blocked, makes
an architectural choice it shouldn't have, or its diff reveals the task was
mis-scoped. The Phase 3b recovery is the canonical case: the slice was genuinely
premier (cross-process auth-adjacent state machine) and the orchestrator had to do
the integration fix itself rather than re-dispatch.
