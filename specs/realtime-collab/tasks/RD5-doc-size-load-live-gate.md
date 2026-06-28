# RD5 — Doc-Size / Load / Live Two-Browser Gate

**Tier:** premier  
**Depends on:** RD3 hosted schema deployment  
**Status:** accepted with cap — hosted two-browser pass complete locally  
**Owner:** Codex  
**Started:** 2026-06-28

## Goal

Close the Stage-1 hard gate that still makes `@convex-dev/prosemirror-sync`
provisional: prove the current Convex + ProseMirror stack can handle large Live
Documents, repeated server-side patch traffic, reactive reads, and a real
two-browser co-editing session on the deployed fork backend.

Failing this gate is an architecture decision, not a bug to paper over: record
the concrete failure and reopen the Yjs/Durable Objects fallback path from
`SPIKE.md`.

## Scope

- Add a repeatable load script that seeds timestamped Live Documents through
  public Convex APIs, measures import/read/patch latency, confirms revision
  advancement, and waits for two reactive Convex subscribers to observe the final
  revision.
- Run the script against a real deployment after `CONVEX_URL` and, for
  authenticated workspaces, `AUTH_TOKEN` are available.
- Run one manual two-browser web session against the same deployment using
  `apps/www` with `?test=1`, two test identities, and one Live Document route.
- Update `SPIKE.md`, `PROGRESS.md`, and this brief with the measured result and
  final adopt/fallback decision.

## Non-Goals

- Offline behavior. RD6 owns that gate.
- Security review. RD8 owns that pass.
- Packaged desktop release work. RD9 waits for this gate.
- Synthetic browser automation that bypasses the Tiptap/prosemirror-sync binding.
  The visual two-browser pass must exercise the real web editor.

## Test Matrix

Use sizes that stay below Convex's 1MB value/document limit while still stressing
the large-doc path:

| Case | Initial Markdown | Patch Count | Purpose |
|---|---:|---:|---|
| small | 64 KiB | 8 | Baseline latency and revision behavior |
| medium | 256 KiB | 12 | Typical long-doc behavior |
| large | 768 KiB | 16 | Near-limit behavior without intentionally exceeding Convex limits |

The script supports overriding these values. If hosted Convex rejects the large
case, re-run with a smaller step-down size to find the practical ceiling and
record both values.

## Commands

```sh
node scripts/prosemirror-doc-size-gate.mjs --help

CONVEX_URL=https://<deployment>.convex.cloud \
AUTH_TOKEN=<optional-jwt> \
node scripts/prosemirror-doc-size-gate.mjs --sizes 64,256,768 --patches 8,12,16
```

Manual two-browser pass:

```sh
pnpm dev:www
```

Open two browser sessions at the web dev URL with `?test=1`, select the seeded
Live Document, use distinct `testUser` identities, type concurrently in separate
paragraphs, then repeat with same-paragraph adjacent inserts. Confirm both
browsers converge, presence/cursors render, no conflict banner/file appears, and
`documents.getForAgent` returns the merged markdown.

## Acceptance

- The load script passes on the hosted dev deployment and records:
  - deployment URL,
  - workspace id,
  - document ids,
  - per-size import/read/patch latency,
  - initial/final revisions,
  - final markdown byte counts,
  - reactive subscriber convergence.
- The manual two-browser pass is dated and recorded with the document id.
- `SPIKE.md` changes doc-size and two-browser from unverified to pass/fail.
- `PROGRESS.md` changelog records the result. If the gate passes, the Stage 1
  decision-gate task can be finalized; if it fails, document the fallback trigger.

## Hosted Results — 2026-06-28

Deployment: `https://strong-setter-709.convex.cloud`  
Workspace: `mn75k6wxszm8dzjmfn1db4546989hxfa`

| Initial Markdown | Patches | Result | Notes |
|---:|---:|---|---|
| 4 KiB | 1 | pass | Smoke document `kn7a1pz45cpbppf69xge0njd9x89g15w`; revision `1 → 2`; both subscribers observed revision 2. |
| 64 KiB | 8 | pass | Document `kn773pgew34ewn3n6rp63ycea989g9wy`; final revision 9; patch latency min/p50/p95/max `426/536/678/678ms`. |
| 256 KiB | 12 | pass | Document `kn72dqcwaywjhen7jjjvf7t55d89g2jt`; final revision 13; patch latency `879/988/1156/1156ms`. |
| 320 KiB | 6 | pass, near limit | Document `kn72arhk0k8rfm5vbsk66c7yts89h7sy`; final revision 7; patch latency `1009/1073/1149/1149ms`; Convex emitted large-document warnings around 895 KiB stored values. |
| 384 KiB | 6 | fail | First patch failed: `Value is too large (1.02 MiB > maximum size 1 MiB)` at `convex/documents.ts:507`. |
| 512 KiB | 8 | fail | Import emitted a 973445-byte large-document warning; first patch failed: `Value is too large (1.37 MiB > maximum size 1 MiB)` at `convex/documents.ts:507`. |
| 768 KiB | 16 | fail | Import timed out on the hosted Convex 1s function limit before patching. |

Additional warnings:

- Every run emitted Tiptap duplicate-extension warnings for `link`; this predates
  the harness but should be cleaned up before using warning volume as an alert.
- The failed patch location is the pre-patch revision materialization path in
  `documents.applyPatch`, so the measured limit includes current revision-history
  storage shape, not only the prosemirror-sync component.

Current RD5 call: **accepted with cap**. Product decision on
2026-06-28: keep Convex/prosemirror-sync for the current production path, enforce
an initial **256 KiB markdown cap** for Live Documents before import/conversion/
mutation, and defer cap removal to a large-document storage/revision redesign. Do
not trigger the Yjs/Durable Objects fallback for this result alone.

Hosted manual two-browser pass completed on 2026-06-28:

- Deployment: `https://strong-setter-709.convex.cloud`
- Workspace: `mn75k6wxszm8dzjmfn1db4546989hxfa`
- Document: `kn7e5a4kwk4mhb207mxnxst9t189h9tj`
- Ada and Ben browser sessions both loaded the real web editor with `?test=1`
  and showed each other in the POC presence list.
- Separate-paragraph edits from both browsers merged and persisted in backend
  markdown at revision 107.
- Same-paragraph adjacent inserts from both browsers converged in both page
  bodies and backend markdown at revision 175.
- Known warning: the duplicate Tiptap `link` extension warning still appears and
  predates this pass.

RD5 is complete only as "accepted with cap"; it does not claim large-doc parity.

Cap enforcement landed locally on 2026-06-28:

- Convex rejects over-256 KiB markdown before Live Document import, patch
  application, markdown conversion, or pre-patch revision materialization.
- Local `importLiveDocuments` preflights all files before mutating cloud documents,
  so one oversized file does not create a partial batch import.
- Verification: targeted Biome on touched files, `@hubble.md/sync` tests and
  typecheck, Convex codegen/typecheck, `pnpm typecheck`, and
  `pnpm build:desktop`. Repo-level `pnpm check` is still blocked by unrelated
  formatting drift in `convex/tsconfig.json`,
  `packages/sync/src/reconcile.test.ts`, and `skills-lock.json`.

## Verification Before Hand-Off

```sh
node --check scripts/prosemirror-doc-size-gate.mjs
pnpm exec biome check scripts/prosemirror-doc-size-gate.mjs specs/realtime-collab/tasks/RD5-doc-size-load-live-gate.md
```

Run `pnpm typecheck` and `pnpm build:desktop` if code outside the script/docs
changes.
