<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Orientation — product brain

For any product/vision/planning work, **read `brain/README.md` first**. The full brain
is Git-authoritative under `brain/` again as of 2026-07-15; the former
`brain/cloud/` split is retired. Governance: `brain/BRAINKEEPER.md`. Note the
**PENDING EXTRACTION** status before making vision-level assumptions. Current product
authority behavior is in `specs/folder-authority-mobility/PRODUCT.md`; existing
cloud/projection implementation specs remain under `specs/desktop-cloud-workspace/`
and `specs/realtime-collab/`.

## Progress contract

`brain/synthesized/roadmap.md` is the single source of **where the build is and what
the next step is**. Read it when starting work; **before ending any session that
changed the build or direction, update it** and log the pass per `brain/BRAINKEEPER.md`.
There is no separate progress command — this convention is the mechanism. (Do not use
`specs/realtime-collab/archive/PROGRESS.md`; it is a historical record of the web-first
era.)

## Large-phase session boundaries

While implementing a large phase, actively recommend starting a fresh agent session
when doing so will improve token efficiency and reduce stale-context risk. Good
boundaries are: after a cohesive milestone is verified, documented, and committed;
before beginning the next independently understandable phase; or after a long
debugging/acceptance loop leaves substantial no-longer-relevant context. Include the
exact next starting point (roadmap item, issue, or spec section) in the recommendation.
Do not interrupt an atomic change, stop only because a session is long, or leave a
dirty tree solely to create a boundary. If continuing in the current session is still
more efficient, say nothing and keep working.

## Engineering guidance

- Use logical CSS spacing props (`margin/padding` inline/block/start/end), not
  physical left/right/top/bottom.
- Check work: `pnpm build:desktop` (builds packages, runs biome check, tsc, vite
  build, cargo check). For quick iteration use `pnpm check` and desktop tsc.
- Test the web app by appending `?test=1` to the dev server URL — bypasses the
  connect / workspace-picker screens. Requires `VITE_TEST_CONVEX_URL` and
  `VITE_TEST_WORKSPACE_ID` in `apps/www/.env.local` (see `apps/www/.env.example`).
- When asked why you made a decision, answer why. Don't take it as a challenge to
  your approach, or pressure to change your solution.
- Comments aren't evil. Use doc comments on complex functions, or inline comments
  where the "why" behind code isn't immediately clear by the implementation.
  Continue omitting comments for other cases, by your best judgment.

## Agent skills

### Issue tracker

GitHub Issues on `bholmesdev/hubble.md` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Defaults: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Review readiness

Use `.agents/skills/review-readiness` before handing code to a human reviewer.
