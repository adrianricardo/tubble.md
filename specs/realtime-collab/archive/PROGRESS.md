# Realtime Collaboration — Progress Tracker

**This is the single source of truth for where implementation stands.**
Next agents can start here and continue the first unfinished task in the lowest
numbered incomplete stage.

For the share-back packet around the fork, this folder is self-contained:
`README.md` gives the overview, `PRODUCT.md` gives the product direction,
`TECH.md` gives the architecture, `DECISIONS.md` gives the decision log and
reasoning, and `SPIKE.md` gives the prosemirror-sync spike findings.

---

## 🧭 START HERE — handoff state (verified 2026-06-25)

This block is the authoritative pickup pointer. It was written after verifying
the working tree against the task notes below, because the per-task notes are
honest but easy to misread. **Read this before the protocol section.**

### 📋 Next-phase plans (start here for new work, added 2026-06-26)

Desktop synced-folder **Phases 0–5 are landed (unmerged) and unit-verified**. The
next work is decomposed into model-tiered, dispatch-ready slices:

- **`READY-TO-TEST.plan.md`** — slices to make the synced folder **human-testable**
  end-to-end (deployed fork Convex + real sign-in). **RT1** (auth + main-process
  token plumbing) is the gate; **RT1 + RT2 is enough to smoke-test an empty
  `~/Hubble`**; RT3 (first-run guard) is needed before a non-empty folder. Full
  briefs in `tasks/RT1…RT5`. Peer-reviewed by Codex.
  **RT1 landed locally 2026-06-26**: desktop now has Convex Auth in Settings,
  a renderer-owned JWT string contract over IPC, authenticated main-process
  `SyncBackend` creation, and token-change reconnect for the synced-folder engine.
  **RT2 landed locally 2026-06-26**: Settings now shows synced-folder workspace
  context, create/existing folder pickers, connect/disconnect, live status, manual
  refresh, and toasts for every synced-folder event kind.
  **RT3 landed locally 2026-06-26**: desktop now inspects a picked sync root before
  materializing, allows empty/already-indexed Hubble roots, blocks non-empty
  foreign folders by default, and offers explicit workspace import before enabling
  the mirror. **Human smoke on `strong-setter-709` verified** sign-in, connected
  folder materialization, external TextEdit save → `documents.applyPatch` →
  Convex revision update, and no conflict/backstop file. **UX follow-up fixed
  locally 2026-06-26:** Hubble now skips identical projection rewrites after
  reconcile/materialize, and an already-open synced-folder editor refreshes clean
  documents from disk while preserving dirty in-editor edits. **RT4 landed locally
  2026-06-26**: synced-folder event copy now uses quiet status-line updates for
  high-frequency reconciles, clear success toasts for rename/move/create/remove,
  and non-alarming `.local-edit`/read-only/backstop messages. **RT5 landed locally
  2026-06-26**: `TEST-RUNBOOK.md` now walks the human deployed-backend smoke, and
  `scripts/synced-folder-reconcile-smoke.mjs` provides an authenticated package
  smoke for the base-cache diff → `reconcileProjectionFile` → Convex patch path.
  Deployed package smoke verified on `strong-setter-709` 2026-06-27: imported a
  Live Document, reconciled a projection edit, and advanced revision `1 → 2`.
- **`READY-TO-DEPLOY.plan.md`** — RD1–RD12 roadmap to full production (reactive
  cloud→disk sync, schema migration, the doc-size + offline **gates**, auth audit,
  security review, flag-gated merge-to-main, release, monitoring). Briefs expand at
  phase start. **RD3 expanded and verified on hosted dev 2026-06-27**:
  `tasks/RD3-convex-schema-migration-deployment.md` now captures the deploy slice,
  `strong-setter-709` accepts the widened realtime schema/component, `convex
  codegen` had no generated diffs, and `convex dev --once --typecheck enable`
  passed. No production data backfill was run; production mutation is still gated
  on an operator-confirmed target and legacy-file import policy.
  **RD1 landed locally 2026-06-27**: desktop synced folders now create an
  authenticated Convex subscription client, reactively materialize cloud changes
  across workspace/folder/live-document queries, coalesce update bursts, close
  subscriptions on disconnect, and preserve the documentId-based
  rename/move-vs-access-loss split so cloud echoes do not trash renamed local
  paths. Verified focused desktop/sync tests, `pnpm typecheck`, and
  `pnpm build:desktop`; `pnpm check` remains blocked by pre-existing formatting
  drift outside the RD1 files.
  **RD2 landed locally 2026-06-27**: synced-folder materialization now includes a
  reserved `Shared with me/` area backed by `documents.listSharedWithMe`,
  `SyncBackend.getSharedWithMe()`, and reactive subscription coverage for direct
  shares. Shared files are flat, workspace-prefixed, collision-safe, indexed by
  true `documentId`/`workspaceId`, base-cached for reconcile, and chmodded by
  role. Verified focused sync/desktop tests, `@hubble.md/convex-client`
  typecheck, `pnpm typecheck`, `pnpm build:desktop`, Convex codegen, and Convex
  function typecheck on the configured deployment.
  **RD4 landed locally 2026-06-27**: expanded
  `tasks/RD4-production-auth-hardening.md`, hardened the ProseMirror sync API to
  reject non-Live-Document sync IDs, split commenter authorization from read/write
  authorization, blocked viewers from creating comments or suggestions, and made
  trash listing/restore authorize against deleted-document roles instead of broad
  workspace membership. Verified focused Biome, Convex codegen, `pnpm typecheck`,
  `pnpm build:desktop`, and Convex function typecheck on the configured
  deployment.
- **`ORCHESTRATION-NOTES.md`** — how to run these as an orchestrator + tiered
  sub-agents (review-before-commit, `typecheck` ≠ `check`, disjoint-file
  parallelism, seam-scoping, session-limit recovery).

**Harness-agnostic dispatch.** The briefs reference files + verify commands, not a
specific harness, so they run from **Claude Code or Codex**. Tier mapping:
premier = Opus 4.8 / `gpt-5.5` high effort · standard = Sonnet 4.6 / `gpt-5.5`
medium · economy = Haiku 4.5 / `gpt-5.5` minimal. The orchestrator stays premier and
dispatches one sub-agent per slice. Keep the same discipline either way: sub-agents
**don't commit and don't edit this file** — the orchestrator reviews each diff,
re-runs `pnpm typecheck` + `pnpm build:desktop` + the relevant vitest, then commits
the code + the PROGRESS/changelog edit together.

### What "Unmerged" actually means

Every task below says "Unmerged." That does **not** mean the code is missing.
The code is **committed on this branch** (`spike/prosemirror-sync` is ~25 commits
ahead of `main`). "Unmerged" = not yet merged to `main`. You can read, run, and
build on all of it right now. Spot-checked and confirmed present: the Convex
APIs (`documents.getForAgent`, `applyPatch`, `restoreRevision`, `search`,
`listActivity`, suggestions, trash) and the CLI surface (`hubble cloud document
get/patch/shim/reconcile/export`).

### Tree state you are inheriting

- **Clean tree as of handoff refresh 2026-06-27.** The inherited local changes
  (Convex AI guidance files plus one import-order cleanup) were committed as
  `17c73f8 chore: add convex agent guidance` before any new RD work began.
- No RD1 implementation edits have been made in this session. The next agent is
  starting from committed code, not an abandoned partial diff.
- Last known load-bearing checks from the tracker: `pnpm typecheck`,
  `pnpm build:desktop`, and the focused RT/RD checks described in the changelog.
  Re-run the relevant checks before committing new work; do not rely on this
  handoff as fresh verification.

### Verification commands — what actually proves what

The task notes lean heavily on `pnpm check`. **`pnpm check` is Biome lint/format
only — it does not typecheck or build anything.** Use these instead:

- `pnpm typecheck` — real TS check across the 6 TS packages. **This is the load-bearing check.**
- `pnpm build:desktop` — desktop build + typecheck.
- `pnpm --filter @hubble.md/www typecheck` / `build` — web app.
- Convex backend (`packages/sync-backend`) has **no** typecheck script — it is only
  verified by `npx convex codegen` (or `convex dev --once --typecheck enable`),
  which needs a Convex deployment to be reachable. A clean `pnpm typecheck` does
  **not** cover the Convex functions.

### The foundation is still provisional — do not treat it as settled

Stage 1's decision gate (adopt `prosemirror-sync`) is **accepted with boundaries**,
not a blank check. RD5 found the current large-doc failure; the product decision is
to continue Convex/prosemirror-sync for this release with an initial **256 KiB
Live Document markdown cap**, then revisit large-doc storage/revision design later.
The offline gate is still open (**offline ❌** upstream; durable buffer WIP). The
live co-edit/reconcile passes were human-verified locally, RD5's hosted manual
two-browser editor pass completed on `strong-setter-709` on 2026-06-28, and RD6
closed with an explicit v1 offline boundary. If you hit a wall that looks
foundational, check SPIKE.md and DECISIONS.md before reopening the Yjs/DO fallback.

### What to pick up next (this overrides the "first `[ ]`" rule below)

The RT slices are landed locally, RD3 is expanded/verified, RD1/RD2/RD4 are
landed locally, and RD5 doc-size probing has a product decision: continue with an
initial 256 KiB Live Document markdown cap. **RD5 cap enforcement landed locally
2026-06-28** across Convex import/patch/conversion paths and local Live Document
import preflight. **RD5 hosted manual two-browser pass completed 2026-06-28** on
`strong-setter-709`: Ada/Ben sessions showed presence, separate-paragraph edits
merged, and same-paragraph adjacent inserts converged in both browsers and backend
markdown. **RD6 started locally 2026-06-28**: `tasks/RD6-offline-gate-resolution.md`
is expanded, and the desktop external-file offline queue now persists watcher
events under `.hubble/queue/events.json`, replays them before reconnect
materialization, and retains failed replays to avoid clobbering local offline
edits. **RD6 closed locally 2026-06-28 with an explicit v1 boundary**: external-file
offline queueing is in scope and verified; in-editor transient disconnect remains
covered by `prosemirror-sync`'s in-memory buffer; the thin IndexedDB/sessionStorage
writer is retained and unit-covered; full reload/app-restart while Convex is
unavailable is deferred to a future app-shell offline cache + editor replay slice.
Browser probing confirmed an offline editor edit writes the upstream
`convex-sync-<id>` cache, but also confirmed the current app shell cannot remount
the editor with the whole backend blocked because workspace/document queries fail
first. No Yjs/DO fallback is triggered.
**RD7 landed locally 2026-06-28** as the next standard-tier slice: the
synced-folder `owner.json` heartbeat now refuses to overwrite fresh foreign owners,
stale owners remain reclaimable, and the desktop sync engine stops
watching/materializing if another device takes ownership after connect. Next
unblocked launch gate was **RD8 security review** (premier). **RD8 landed locally
2026-06-28**: removed throwaway public ProseMirror POC mutation endpoints, routed
the reconcile POC script through production `documents.applyPatch`, validated
cloud-sync IPC payloads in Electron main, removed renderer control of the
synced-folder lock identity, and tightened synced-folder path sanitization for
cloud-controlled leading-dot names. **RD10 landed locally 2026-06-28**: merged
`origin/main` into the realtime branch, resolved realtime API conflicts to the
secured RD8/RD5/RD6 branch versions, added a default-off
`VITE_HUBBLE_REALTIME_COLLAB` gate for web Live Documents and desktop Cloud Sync,
and advanced local `main`. **RD9 landed locally 2026-06-28** as the next
standard-tier slice: `pnpm build:desktop` and `pnpm bundle:desktop` produced
macOS artifacts for `@hubble.md/desktop@0.1.13`, `codesign --verify` passed, the
packaged app launch-smoked, and the generated DMG mounted with `Hubble.app`.
Distribution notarization remains operator-gated on GitHub Actions secrets and a
confirmed `desktop-v<version>` release tag. Next launch follow-up is **RD11
monitoring / observability / on-call** (standard). **RD11 landed locally
2026-06-28**: desktop synced-folder status now carries local operational
telemetry for reconciles, backstops, read-only rejects, errors, offline queue
depth, and recent events, and Settings surfaces those diagnostics. External alert
plumbing remains a post-release service-choice follow-up. **RD12 landed locally
2026-06-29** as the post-launch standard-tier MCP follow-up: `@hubble.md/mcp-server`
now exposes stdio tools for Live Document get, patch, and markdown export through
the existing Convex client/backend permission path. **RD11 ops runbook follow-up
landed locally 2026-06-29**: `OPERATIONS.md` now records the vendor-neutral
support workflow, escalation thresholds, safe user actions, and future alert
wiring points for the local synced-folder telemetry.

**Current pickup state:** V1 release execution is continuing from
`V1-EXECUTION.plan.md`. **P7 local launch gate landed locally 2026-06-30**:
signup is capped at 100 new accounts/day through a Convex-backed UTC-day counter,
`VITE_HUBBLE_REALTIME_COLLAB` and the web/desktop flag modules are deleted, and
Live Documents plus desktop Cloud Sync are now default product surfaces when
`VITE_CONVEX_URL` is configured. Local checks are green. Remaining P7 gates are
operator/manual: C1/C2 cross-surface QA, D3 production Convex deploy, D4 web
deploy, D5 external monitoring sink, and release operations.

**Demo follow-up noted 2026-06-30:** share dialog still needs a Google-Docs-style
"visible to anyone with the link" state plus one-click copy link. A same-day
frontend fix also changed unauthorized Live Document opens from a Convex exception
page into an access-denied screen with guidance to share by account or enable link
access.

**Desktop IA follow-up planned 2026-07-01:** `DESKTOP-CLOUD-FIRST-IA.plan.md`
captures the phased route for making desktop cloud-first: Live Documents as the
primary object, with local folders optional for manual file editing, backup, and
agent/tool access. **Implemented locally 2026-07-01:** desktop now shows a
cloud-first Live Documents home/sidebar section when Convex is configured, keeps
local folders as optional synced/local Markdown support, and makes the toolbar
plus Cmd/Ctrl+N create Live Documents for signed-in cloud users while preserving
local Markdown creation elsewhere. Verified focused Biome and `pnpm
build:desktop`; Electron CDP smoke confirmed the primary create action and sidebar
hierarchy in the running desktop renderer.

**Desktop native Live Documents follow-up planned 2026-07-01:**
`DESKTOP-NATIVE-LIVE-DOCUMENTS.plan.md` captures the next phased route: desktop
should open and edit Live Documents directly without requiring a synced folder,
while synced folders remain optional projection infrastructure for external
editors, backup, grep, and agents. The plan explicitly requires desktop to join
the same `document:<id>` presence channel as web so cross-surface collaborators see
shared live presence and remote cursors.

**Implemented locally 2026-07-01:** desktop now has a native Live Document editor
route that opens from sidebar rows, home recents, toolbar create, sidebar create,
and Cmd/Ctrl+N without requiring a synced folder. The desktop editor uses
`useTiptapSync(api.prosemirror, "document:<id>")`, publishes selection heartbeats
through `api.pocIdentity.heartbeat`, subscribes to `api.pocIdentity.listActive`,
and renders shared remote cursors through the existing shared editor. Synced
folders remain optional local projection infrastructure. Verified focused Biome,
`pnpm --filter @hubble.md/desktop build`, and `pnpm build:desktop`; manual
cross-surface cursor smoke remains to run with signed-in web + desktop sessions.

**User/session + data reset follow-up landed locally 2026-07-01:** web and desktop
now show the signed-in account in the main toolbar with a compact avatar/name/email
badge. The web dashboard no longer auto-creates a "Welcome to Hubble" document so
an empty cloud workspace can stay empty. Hosted dev deployment `strong-setter-709`
was exported to `/tmp/hubble-convex-reset/strong-setter-709-before-reset.zip`,
then reset: Live Documents, legacy files/assets, shares, folders, comments,
revisions, notifications, presence, and ProseMirror component state were cleared;
empty personal spaces were recreated for existing users.

Prior RD pickup state: RD1-RD12 are landed locally. There is no unchecked
ready-to-deploy slice left in this plan. The remaining named follow-ups are
operator/product-choice gated: external monitoring sink selection, packaged MCP
integration publication, production notarization/release tag, production backfill
policy, app-shell offline cache, and large-document storage/revision redesign.

Useful RD5 files to inspect first: `specs/realtime-collab/SPIKE.md`,
`packages/sync-backend/convex/prosemirror.ts`,
`packages/sync-backend/convex/documents.ts`,
`apps/www/src/shell/EditorView.tsx`, and
`apps/www/src/shell/AppShell.tsx`.

Useful RD6 files to inspect first: `specs/realtime-collab/OFFLINE-DECISION.md`,
`specs/realtime-collab/tasks/RD6-offline-gate-resolution.md`,
`apps/desktop/electron/syncedFolderService.ts`,
`apps/desktop/electron/syncedFolderService.test.ts`,
`apps/www/src/shell/durableOfflineBuffer.ts`, and
`apps/www/src/shell/EditorView.tsx`.

Do not restart old Stage 5 UI tasks from this block. Version history, comments,
activity, suggestions, and search UI are already described as locally landed later
in this file.

---

## 🔴🟡🟢 How agents read & update this file

**Before starting work**, read this whole file top to bottom. **Start with the
🧭 START HERE block above** — it names the next task and corrects two things this
rule gets wrong in the current state: (1) almost every task is `[~]`
(built-but-unmerged), not `[ ]`, so "first `[ ]`" points at the two hardest tasks;
(2) "Unmerged" means *not on `main`*, not *not written* — the code is committed and
on this branch. Absent guidance in START HERE, pick up the first `[ ]` task within
the lowest-numbered stage that isn't `🟢 Done` — stages are ordered and later
stages assume earlier ones.

**Status legend** (used on stages and tasks):

- `🔴 Not started` / `[ ]` — no work begun
- `🟡 In progress` / `[~]` — actively being worked or partially landed
- `🟢 Done` / `[x]` — complete, merged, and verified
- `⛔ Blocked` / `[!]` — blocked; the **Blocked on** note says why

**When you START a task:** set it to `[~]`, fill `Owner` and `Started`.

**When you FINISH a task:** set it to `[x]`, fill `Landed` (date) and the
PR/commit link. If it completes a stage, update the stage banner to `🟢 Done`.

**Always append a dated line to the Changelog** at the bottom describing what
changed — this is the human-readable audit trail. Keep checklist edits and the
changelog entry in the **same commit** as the code, so progress never drifts
from reality.

**Do not delete tasks.** If a task becomes obsolete, mark it `[x]` with a note
`(dropped: <reason>)` or `[!]` if it's superseded. Add newly-discovered tasks to
the right stage rather than silently doing extra work.

**Keep it honest:** `[x]` means merged + verified, not "wrote the code." If
tests fail or a step was skipped, say so in the task note.

---

## Stage status overview

| Stage | Status | Summary |
|---|---|---|
| 1. Realtime editing POC | 🟡 In progress | Spike scaffolded; gate provisionally passed (see SPIKE.md). POC identity gate added locally; live two-browser test pending. |
| 2. Documents as cloud entities | 🟡 In progress | Stable doc table, web CRUD, and read projection implemented locally; sync import/export pending |
| 3. Team permissions | 🟡 In progress | Convex Auth password provider wired locally; memberships, shares, and enforcement pending |
| 4. Agent collaboration (Model C) | 🟡 In progress | Agent read API started; patch API + MCP/CLI, projection, legacy shim pending |
| 5. Version history & review | 🟡 In progress | Revisions table and materialization started; restore/comments/review UI pending |
| 6. Docs-parity polish | 🟡 In progress | Folder data/API started; search/export/offline/admin pending |

---

## Stage 1 — Realtime editing POC 🟡

Goal: two authenticated humans co-edit one document live, conflict-free, with
presence cursors. **Resolves the `prosemirror-sync` decision gate (TECH.md).**

- [~] **Spike `@convex-dev/prosemirror-sync`** against the decision gate. Findings
      in **`SPIKE.md`**: server-side agent edits ✅, versioning hooks ✅, auth hooks
      ✅, Tiptap client ✅; **offline ❌ (not implemented upstream)**; doc-size
      accepted with a 256 KiB cap; hosted live two-browser test ✅ passed on
      `strong-setter-709`.
      Scaffold landed: `convex/convex.config.ts`, `convex/prosemirror.ts` (incl.
      `agentAppendParagraph` server-edit proof), dep added to `package.json`.
      — *Owner: Adrian/agent · Started: 2026-06-24 · Landed: _ · PR: spike branch*
- [~] Decision gate outcome: **provisionally ADOPT prosemirror-sync** (hard gates
      previously looked viable on existing Convex stack, but RD5 doc-size probing
      on 2026-06-28 found a large-doc failure in the current storage/revision shape:
      64/256/320 KiB markdown docs passed repeated patch + reactive-subscriber
      checks on `strong-setter-709`, while 384 KiB and 512 KiB failed on first
      patch with Convex values over 1 MiB and 768 KiB import timed out. Product
      decision: continue Convex/prosemirror-sync with an initial 256 KiB Live
      Document markdown cap; do **not** trigger Yjs/DO for this result alone. Do
      not claim large-doc parity without a follow-up storage/revision redesign.
      Hosted Ada/Ben two-browser editor pass completed on 2026-06-28. — *_*
- [~] **RD5 ready-to-deploy hard gate: doc-size + load + live two-browser.**
      Phase-start brief added at `tasks/RD5-doc-size-load-live-gate.md`; runnable
      load harness added at `scripts/prosemirror-doc-size-gate.mjs` to seed
      timestamped Live Documents, measure import/read/patch latency, confirm
      revision advancement, and wait for two reactive subscribers to observe the
      final revision. Hosted measurements on `strong-setter-709` show pass at
      64/256/320 KiB, hard Convex 1 MiB value failures at 384/512 KiB, and a 768
      KiB import timeout. Decision is to ship current path with an initial 256 KiB
      Live Document markdown cap. Cap enforcement landed locally across
      `documents.importMarkdown`, `documents.applyPatch`, markdown conversion
      helpers, and local `importLiveDocuments` preflight, with focused cap tests.
      Manual hosted two-browser web pass completed on 2026-06-28 using document
      `kn7e5a4kwk4mhb207mxnxst9t189h9tj`: Ada/Ben presence appeared in both
      sessions, separate-paragraph edits persisted in backend revision 107, and
      same-paragraph adjacent inserts converged in both browser pages and backend
      revision 175. RD5 is accepted with cap, not large-doc parity. — *Owner:
      Codex · Started: 2026-06-28*
- [~] Run `pnpm install` + `convex dev` (interactive login) to generate the
      component API so `prosemirror.ts` typechecks. Local anonymous deployment
      generated; `convex dev --once --typecheck enable` passes. Unmerged. —
      *Owner: Codex · Started: 2026-06-24*
- [~] Export the editor ProseMirror schema from `packages/editor` and wire the
      `transform()` body in `agentAppendParagraph`. Implemented locally with
      shared schema helper; `agentAppendParagraph` now calls
      `prosemirrorSync.transform`. Unmerged. — *Owner: Codex · Started: 2026-06-24*
- [~] Add the collaboration binding (`useTiptapSync`) to the Tiptap editor
      (`packages/ui` / `apps/www`). Implemented locally for web POC docs behind
      `ConvexProvider`; live two-browser test pending. Unmerged. —
      *Owner: Codex · Started: 2026-06-24*
- [~] Auth-gate the web app enough to identify two distinct users for the POC.
      Implemented locally as a browser-scoped test identity gate for `?test=1`
      (`?testUser=Ada` or in-app prompt) plus a Convex `livePocUsers` heartbeat
      so two browser sessions can identify themselves on one POC doc. This is
      intentionally not the Stage 3 production auth provider. Verified `pnpm
      check`, `@hubble.md/www` typecheck/build, `pnpm build:desktop`, and
      `convex dev --once --typecheck enable`; in-app browser smoke was blocked by
      browser runtime startup failure. Unmerged. — *Owner: Codex · Started:
      2026-06-24*
- [~] One shared document renders live for two browsers; concurrent edits merge
      with no conflict file. Locally verified by human test on `realtime-poc.md`
      with two browser identities; no conflict banner/file appeared. Unmerged. —
      *Owner: Adrian/Codex · Started: 2026-06-24*
- [~] Presence cursors (who's here, where their caret is). Implemented locally as
      a Convex-backed POC cursor layer: `livePocUsers` now stores optional
      ProseMirror `anchor/head`, the web editor publishes throttled selection
      heartbeats, and `packages/ui` renders remote cursor/selection
      decorations. Locally human-verified in two browsers. Verified `pnpm
      check`, UI/www typechecks, `@hubble.md/www` build, and `pnpm
      build:desktop`; Convex one-shot typecheck was skipped because the local
      backend was already running on port 3210. Unmerged. — *Owner: Codex ·
      Started: 2026-06-24*
- [~] Confirm agent edit (`agentAppendParagraph` from the Convex dashboard) appears
      live in both browsers. Locally verified via Convex CLI against
      `poc:jd72rs2kfn4gj8yeavk2m05ccs899r3t:realtime-poc.md`; both browser
      sessions updated live. Unmerged. — *Owner: Adrian/Codex · Started:
      2026-06-24*
- [~] **Exit criteria:** two browsers, simultaneous typing, conflict-free, cursors
      visible, agent edit shows live. Locally human-verified on
      `realtime-poc.md`; demoable from local Convex + web dev servers. Keep `[~]`
      until merged. — *Owner: Adrian/Codex · Started: 2026-06-24*
- [~] **File-reconcile thesis POC (Decision 6) — gates Stage 4/6 reconcile work.**
      Prove that an external edit to a Live Document's markdown file reconciles into
      the live CRDT and **merges with a concurrent in-app edit** — conflict-free,
      automatic, near-real-time — on the real Convex + prosemirror-sync + Tiptap
      stack. The Stage 1 co-edit thesis is already proven; this proves the *new*
      edit-anywhere half.
      **Unknowns to stress:** (A) conflict-free merge — submit the reconciled change
      as **rebasable steps** via `prosemirror.transform`, not `applyPatch`'s
      reject-on-stale path; (B) markdown→ProseMirror diff fidelity; (C) latency
      (save → visible ≈1–2s).
      **Vehicle:** throwaway `scripts/reconcile-poc.mjs` (chokidar on ONE hardcoded
      file, in-memory base text, minimal changed-range diff, submit via transform).
      Needs a small server-side rebasable-transform entry in `convex/prosemirror.ts`.
      **Fidelity approach:** prove merge with plain paragraphs/headings/lists first
      (isolates unknown A), then ONE table probe to measure unknown B — don't build a
      full converter.
      **Deliberately cut (plumbing, not thesis):** Electron tray/background app,
      permissions/`checkWrite`, conflict-copy backstop, scoped-intent API design,
      on-disk-path decision, multi-doc, persisted base-cache format, CLI ergonomics.
      **Exit criteria:** (1) vim save → browser shows it in ≈2s; (2) typing in the
      browser while saving an external edit to a *different* paragraph → both
      survive, no conflict file, no crash *(the real proof)*; (3) same-paragraph
      concurrent edit → a sane CRDT merge, not a clobber; (4) no-op external save of
      a doc with a table/frontmatter → doc unchanged (fidelity ceiling).
      **Fail signal:** if (2) can't be done (no rebasable-steps path), that's a
      fork-the-architecture moment — same signal that points toward the Yjs/DO
      fallback. Cheaper to learn here than after building the tray app + permissions.
      Implemented locally with `prosemirror.reconcileMarkdownRangePoc` plus
      `scripts/reconcile-poc.mjs`; automated Convex smoke proved different-paragraph
      merge, same-position insertion merge, and no-op table/frontmatter stability.
      Live two-browser pass on document
      `jn7784v3ndrpzjdyd685bwqrhd89b1tx` with watched file
      `/tmp/hubble-reconcile-browser-poc.md` verified a browser edit and external
      file save both appeared in Ada/Ben browser sessions with no crash, conflict
      banner, or lost text; browser polling observed the reconciled file edit in
      95ms after the save, and the watcher logged `reconciled 14 base chars -> 30
      new chars in 42ms`. This pass also found and fixed a watcher-side
      `fast-diff` overreach that could fail range mapping after browser edits; the
      watcher now emits a minimal prefix/suffix changed range. Same-paragraph live
      browser typing remains limited by browser automation focus issues; rely on the
      existing automated same-position insertion smoke until a human repeats it.
      Human-assisted follow-up on document `jn70mta09x5cfzxqbrdmb2743n89bp3b`
      showed a separate editor/collab cursor-placement issue: typing intended for
      `Shared paragraph starts here.` jumped into content above the title and a
      trailing paragraph (`orworb` / `fb`). A file-side edit to that target
      paragraph still reconciled into both Ada/Ben browser tabs and preserved the
      misplaced browser text (`Shared paragraph file-human starts here.`), with the
      watcher logging `reconciled 0 base chars -> 11 new chars in 63ms`. Treat the
      same-paragraph manual proof as blocked on the cursor-placement issue, not on a
      data-loss reconcile failure. Follow-up fix: Live Documents now disable
      projection-driven `setContent` resets in the shared editor so the Convex
      markdown projection cannot overwrite the active prosemirror-sync document
      under the user's cursor; local file-backed editing still syncs external
      `initialMarkdown` changes as before. Verified `pnpm check`, focused UI/www
      typechecks after rebuilding UI declarations, and `pnpm build:desktop`.
      Same-paragraph human retry after the fix passed on document
      `jn729fmj5ew46ygvykmst9vneh89b0a2`: human typed `browser-human` into
      `Target paragraph starts here.`, the text stayed in place, a watched-file edit
      changed the same paragraph to `Target paragraph file-human starts here.
      browser-human`, Convex and the browser both showed both markers, and the
      watcher logged `reconciled 0 base chars -> 11 new chars in 35ms`.
      — *Owner: Codex ·
      Started: 2026-06-25*

## Stage 2 — Documents as cloud entities 🟡

- [~] `documents` table with **stable IDs**; path/title become mutable metadata.
      Implemented locally in Convex schema with mutable title/path metadata and
      audit fields; verified `convex codegen`, `pnpm check`, and
      `pnpm build:desktop`. Unmerged. — *Owner: Codex · Started: 2026-06-24*
- [~] Document CRUD (list/create/rename/delete) in the web app. Implemented
      locally with Convex document queries/mutations, stable `/d/:documentId`
      routes, a Live Documents sidebar section, and document-mode editor loading.
      Verified `convex codegen`, `@hubble.md/www` typecheck/build, `pnpm check`,
      `pnpm build:desktop`, and Vite served `?test=1`; interactive browser smoke
      was skipped because no Browser tool/Playwright dependency was available.
      Unmerged. — *Owner: Codex · Started: 2026-06-24*
- [~] One-way markdown **projection on read** (doc → markdown). Implemented
      locally as `documents.getWithMarkdown`, which reads the stable live
      ProseMirror doc (`document:<id>`) and serializes it with the existing
      Hubble markdown converter. Web document routes now use the projected read
      query. Verified `convex codegen`, a local Convex HTTP smoke returning
      projected markdown, `@hubble.md/www` build, `pnpm check`, and
      `pnpm build:desktop`. Unmerged. — *Owner: Codex · Started: 2026-06-24*
- [~] Migrate the whole-file sync path (`packages/sync`) to an import/export role.
      Implemented locally as explicit Live Document import/export APIs:
      `packages/sync` now exposes `importLiveDocuments` and
      `exportLiveDocuments`, Convex imports write markdown into the live
      ProseMirror document (`document:<id>`) instead of the legacy `files` table,
      and the CLI exposes `hubble cloud import` / `hubble cloud export`. Legacy
      `cloud sync` / `cloud watch` remain available for non-live whole-file
      workspaces. Verified `convex codegen`, focused package typechecks/builds,
      `pnpm check`, and `pnpm build:desktop`. Unmerged. — *Owner: Codex ·
      Started: 2026-06-25*
- [~] "Last edited by / at" on documents. Implemented locally with document
      metadata display in the Live Documents sidebar and live document editor
      header, a POC edit marker that records the current test identity (or local
      collaborator) during live edits, import/rename/delete actor propagation, and
      agent edit attribution as `Agent`. Verified `convex codegen`,
      `@hubble.md/www` typecheck/build, Convex backend typecheck, `pnpm check`,
      `pnpm build:desktop`, and Vite serving `?test=1`; interactive browser smoke
      was blocked by in-app browser startup failure and no local Playwright
      package. Unmerged. — *Owner: Codex · Started: 2026-06-25*

## Stage 3 — Team permissions 🟡

- [~] Auth provider chosen + wired (Convex Auth / Clerk / WorkOS). Chosen:
      Convex Auth with the password provider for the Vite/React + Convex stack,
      keeping WorkOS/SSO as a later enterprise option. Implemented locally with
      Convex Auth tables/config/http routes, `ConvexAuthProvider`, a web
      sign-in/sign-up gate plus toolbar sign-out for non-`?test=1` sessions,
      and server-side Live Document actor resolution from the authenticated
      Convex user. The Stage 1 `?test=1` identity gate remains as an explicit
      POC bypass. Verified
      `convex codegen`, `@hubble.md/www` typecheck/build, `pnpm check`,
      `pnpm build:desktop`, and Vite serving `/?test=1` on port 5174; direct
      `convex dev --once --typecheck enable` was blocked by an existing local
      backend on port 3210, but `convex codegen` ran TypeScript successfully.
      Unmerged. — *Owner: Codex · Started: 2026-06-25*
- [~] `users`, `members` (workspace membership) tables. Convex Auth's `users`
      table is now part of the schema, `workspaces` have optional `ownerId`,
      and a new `members` table records workspace roles. Authenticated workspace
      creation inserts the creator as owner while legacy unauthenticated
      workspace creation remains available for CLI/test flows. Verified
      `convex codegen`, `pnpm check`, and `pnpm build:desktop`. Unmerged. — *Owner: Codex ·
      Started: 2026-06-25*
- [~] `docShares`: per-document roles (owner/editor/commenter/viewer) + link
      sharing. Implemented locally with a `docShares` table for user-specific
      roles and workspace/public link-share roles, owner-share seeding on
      authenticated document create/import, plus backend share list/set/clear
      APIs for the upcoming share dialog and enforcement pass. Verified
      `convex codegen`, `pnpm check`, and `pnpm build:desktop`. Unmerged. — *Owner: Codex ·
      Started: 2026-06-25*
- [~] **Server-side enforcement on every query/mutation** — a viewer never receives
      editable steps. Implemented locally with shared workspace/document
      permission helpers, role-filtered Live Document list/read queries,
      owner-only share APIs, editor-only document mutations, ProseMirror
      `checkRead`/`checkWrite` hooks so viewers can read but not submit live
      steps/snapshots, and workspace membership guards on legacy sync/assets
      including upload/download URL generation. Verified `convex codegen`;
      `pnpm check`, and `pnpm build:desktop`. Unmerged. — *Owner: Codex ·
      Started: 2026-06-25*
- [~] Share dialog UI. Implemented locally from the Live Documents row: owners
      can open a modal, invite an existing Hubble user by email with a role,
      remove direct user shares, and set/clear public-link access as
      viewer/commenter/editor. Verified `convex codegen`, `pnpm check`, and
      `@hubble.md/www` typecheck/build, and `pnpm build:desktop`; browser smoke
      skipped because Browser plugin discovery exposed no browser-control tool.
      Unmerged. — *Owner: Codex · Started: 2026-06-25*

## Stage 4 — Agent collaboration layer (Model C) 🟡

- [~] `getDocument(id) → { revision, markdown, outline }` (outline enables targeted,
      token-efficient edits). Implemented locally as `documents.getForAgent`,
      returning the live markdown projection, ProseMirror version as revision,
      document metadata, and a heading outline with level/text/line/slug.
      Verified `convex codegen`, `pnpm check`, and `pnpm build:desktop`.
      Unmerged. — *Owner: Codex · Started: 2026-06-25*
- [~] `applyPatch(id, baseRevision, intent)` → steps → CRDT txn, **attributed to the
      agent**, streamed; rebase/reject if `baseRevision` is stale. Implemented
      locally as `documents.applyPatch` with stale-revision rejection and
      `replace-document`, `append-markdown`, and `insert-after-heading` intents.
      The mutation converts markdown through the existing editor schema and
      writes through `prosemirrorSync.transform`, updating document attribution
      as `Agent` or the supplied actor. Verified `convex codegen`,
      `pnpm check`, and `pnpm build:desktop`. Unmerged. — *Owner: Codex ·
      Started: 2026-06-25*
- [~] MCP server + `hubble` CLI surface for the patch API. CLI surface
      implemented locally as `hubble cloud document get --id <documentId>` and
      `hubble cloud document patch --id <documentId> --base-revision <n>` with
      `--replace`, `--append`, or `--after-heading ... --markdown ...` intents.
      MCP server implemented locally in `@hubble.md/mcp-server` as the
      post-launch RD12 standard-tier follow-up, with stdio tools for document get,
      patch, and markdown export over the same Convex client/backend API. Verified
      `@hubble.md/mcp-server` typecheck/build, `pnpm typecheck`, and
      `pnpm build:desktop`. Unmerged. — *Owner: Codex · Started:
      2026-06-25 · MCP Landed: 2026-06-29*
- [~] Read-only markdown projection writer on disk. Implemented locally as
      `writeLiveDocumentProjections`, writing live document markdown into
      `.hubble/projections/live-documents` so agents can read projected files
      without treating normal workspace files as the live authority. Exposed via
      `hubble cloud project`. Verified `@hubble.md/sync` build,
      `@hubble.md/cli` build, `pnpm check`, and `pnpm build:desktop`.
      Unmerged. — *Owner: Codex · Started: 2026-06-25*
- [~] Legacy file-only **shim**: staging file → `applyPatch(markdown-patch)`.
      Implemented locally as `hubble cloud document shim --id <documentId>
      --file <staging.md> [--watch]`, which reads a staging markdown file,
      fetches the current live revision, and applies a replace-document patch
      through `documents.applyPatch` with `file-shim` attribution by default.
      Verified `@hubble.md/cli` typecheck/build, `pnpm check`, and
      `pnpm build:desktop`. Unmerged. — *Owner: Codex · Started: 2026-06-25*
- [~] Suggestion mode (agent proposes, human accepts). Backend substrate
      implemented locally with `documentSuggestions`, `proposeSuggestion`,
      `listSuggestions`, `acceptSuggestion`, and `rejectSuggestion`. Accepting a
      suggestion reuses the same stale-revision checked `applyPatch` path, while
      rejecting records resolution metadata. UI review flow remains for Stage 5.
      Verified `convex codegen`, `pnpm check`, and `pnpm build:desktop`.
      Unmerged. — *Owner: Codex · Started: 2026-06-25*
- [~] **Revise projection → bidirectional reconcile** (Decision 6; supersedes the
      read-only-projection assumption). Add a scoped diff intent to `applyPatch`
      (`replace-range`/`markdown-diff`); generalize the staging-file shim into a
      watcher that diffs the projection vs. a per-doc base cache and emits a scoped
      patch; write the base cache (text + revision) from
      `writeLiveDocumentProjections`. Keep whole-file `replace-document` for explicit
      import only, and the CLI shim for headless agents. Implemented locally with
      `replace-range` / `markdown-diff` patch intents that submit rebasable
      ProseMirror transforms, projection base-cache files under
      `.hubble/state/live-documents`, and `hubble cloud document reconcile --id
      <documentId> --file <projection.md> [--watch]` for projection-file saves.
      The legacy staging-file shim now diffs against current live markdown and
      submits `replace-range` instead of whole-document replacement.
      Verified `pnpm convex codegen` from `packages/sync-backend`, focused
      `@hubble.md/sync` and `@hubble.md/cli` builds, `pnpm check`, and
      `pnpm build:desktop`. Unmerged. — *Owner: Codex · Started: 2026-06-25*
- [~] Enforce `checkWrite` on the reconcile/inbound path; materialize **read-only**
      projections for viewers so external file edits can't be attempted.
      Implemented locally by returning each caller's document `role`/`canWrite`
      from Live Document projection queries, carrying that through the Convex
      sync backend, chmodding non-writable projection files read-only when the
      filesystem supports it, recording `canWrite` in the projection base-cache
      metadata, and making `hubble cloud document shim` / `reconcile` refuse to
      submit local file edits for read-only documents before the server-side
      `requireDocumentWrite` check. Verified `pnpm convex codegen` from
      `packages/sync-backend`, focused `@hubble.md/sync`,
      `@hubble.md/convex-client`, and `@hubble.md/cli` builds, `pnpm check`, and
      `pnpm build:desktop`. Unmerged. — *Owner: Codex · Started: 2026-06-25*

## Stage 5 — Version history & review 🟡

- [~] `revisions` table: `{ documentId, createdAt, actor, label?, pmDoc, markdown,
      crdtMeta }`, materialized on boundaries + before restore. Implemented
      locally with a `revisions` table, `documents.materializeRevision`,
      `documents.listRevisions`, and automatic pre-patch snapshots before agent
      `applyPatch` changes. Revision rows store projected markdown,
      ProseMirror JSON, revision number, and CRDT metadata. Verified
      `convex codegen`, `pnpm check`, and `pnpm build:desktop`. Unmerged. —
      *Owner: Codex · Started: 2026-06-25*
- [~] Version history UI: browse + **restore as a new change** (never mutate history).
      Backend restore path implemented locally with `documents.restoreRevision`:
      it materializes the current document as "Before restore", applies the
      selected revision markdown through the live ProseMirror document, and
      updates document attribution. Web UI implemented: a "History" button in
      the Live Document header opens a modal listing all revisions (newest first)
      with date, actor/label, revision number, markdown preview, and a Restore
      button per entry. Restore calls `restoreRevision` and closes the modal on
      success. Verified `pnpm typecheck` clean across all 6 TS packages and
      `pnpm --filter @hubble.md/www build` clean. Interactive Convex verification
      (live two-browser, `convex dev` login) skipped — not available in this
      session. Unmerged. — *Owner: Sonnet · Started: 2026-06-25 · Landed: 2026-06-25*
- [~] Comments + threads anchored to text, @mentions, resolve. Backend
      substrate implemented locally with `commentThreads` and `comments` tables,
      anchored thread creation, replies, listing, and resolve mutation with
      actor attribution. @mention parsing now creates backend notifications for
      matching users. Web UI implemented: a "Comments" button in the Live
      Document header opens a modal with a new-comment composer (captures the
      current editor selection as the anchor via a ref lifted into
      `LiveDocumentView`), a thread list (newest-first) with per-comment
      author/body/time, inline reply input (Enter to submit), and a Resolve
      button that hides the thread; resolved threads show a collapsed count.
      Editor-decoration and @mention autocomplete are deferred as stretch items.
      Verified `pnpm typecheck` clean across all 6 TS packages and
      `pnpm --filter @hubble.md/www build` clean. Visual browser pass pending
      human. Unmerged. — *Owner: Sonnet · Started: 2026-06-25 · Landed: 2026-06-25*
- [~] Track-changes / suggestion review UI. Implemented locally as a Live
      Document header Suggestions control that opens a review modal for pending
      agent suggestions and lets users accept or reject them through the
      backend suggestion APIs. This is an initial review surface, not full
      inline track-changes rendering. Verified `@hubble.md/www` typecheck/build,
      `pnpm check`, and `pnpm build:desktop`. Unmerged. — *Owner: Codex ·
      Started: 2026-06-25*
- [~] Activity feed + notifications. Backend activity feed implemented locally
      with `activityEvents`, `documents.listActivity`, and event logging for
      document patches, restores, comment threads/replies/resolution, and
      suggestion propose/accept/reject. Backend mention notifications are now
      created from comment bodies, with list/mark-read APIs. Web UI implemented:
      an "Activity" button in the Live Document header opens a modal listing
      events newest-first (message, actor, formatted time). Notification bell
      requires an authenticated Convex user and returns [] in ?test=1 mode —
      noted in the UI and deferred per the brief's honest caveat. Verified
      `pnpm typecheck` clean across all 6 TS packages and
      `pnpm --filter @hubble.md/www build` clean. Visual browser pass pending
      human. Unmerged. — *Owner: Sonnet · Started: 2026-06-25 · Landed: 2026-06-25*

## Stage 6 — Docs-parity polish 🟡

- [~] Folders / shared drives. Folder data/API started locally with a `folders`
      table, optional `documents.folderId`, folder list/create/rename/delete,
      and document move mutation. Shared-drive semantics and UI remain pending.
      Verified `convex codegen`, `pnpm check`, and `pnpm build:desktop`.
      Unmerged. — *Owner: Codex · Started: 2026-06-25*
- [~] Cross-document search. Backend search query implemented locally as
      `documents.search`, scanning readable Live Documents in a workspace across
      title/path/projected markdown and returning snippets with document
      metadata. Web UI implemented: a search input at the top of the Live
      Documents sidebar section; debounces input 200ms then queries
      `documents.search` via `useQuery(..., "skip")` for empty input; results
      show title, optional path, and snippet; clicking a result calls
      `onSelectDocument` and clears the input. Verified `pnpm typecheck` clean
      across all 6 TS packages and `pnpm --filter @hubble.md/www build` clean.
      Visual browser pass pending human. Unmerged. —
      *Owner: Sonnet · Started: 2026-06-25 · Landed: 2026-06-25*
- [~] Export (md/PDF/docx) + import. Markdown import/export is available via
      workspace-level `hubble cloud import` / `export`, and targeted markdown
      document export is implemented locally as `hubble cloud document export
      --id <documentId> [--format md] [--out file]`. PDF/DOCX export and UI
      remain pending. Verified `@hubble.md/cli` typecheck/build, `pnpm check`,
      and `pnpm build:desktop`. Unmerged. — *Owner: Codex · Started:
      2026-06-25*
- [~] **Desktop always-on app** (Decision 6): keep the Electron main process
      running on window close (`window-all-closed`/`Tray`), host the live-doc
      watcher + sync engine in main (currently CLI-only), route live-doc external
      changes to the reconcile path instead of conflict classification
      (`apps/desktop/src/externalFileChange.ts`, `apps/www/src/store/actions.ts`),
      with a `*.local-edit-<ts>` conflict-copy backstop. **Phases 0–5 all landed
      (unmerged) and unit-verified** — see the sub-items below. **Remaining before
      `[x]`:** (1) a renderer **connect UI** to actually pick a sync root and call
      `connectSyncedFolder` (deferred throughout — no cloud-workspace flow exists
      in the renderer yet; the IPC is the entry point); (2) the reactive cloud→disk
      Convex subscription (currently a `refresh()` seam); (3) human end-to-end
      verification (live chokidar watch, two-device lock, Electron+Convex
      round-trip, conflict-file proof). — *Owner: Opus (orchestrated) · 2026-06-25*
  - [x] **Phase 0** (no behavior change): extracted the CLI reconcile core into
        a reusable `@hubble.md/sync` export (`reconcileProjectionFile`,
        `changedRange`, `readReconcileBase`/`writeReconcileBase`,
        `toLocalEditName`) + new `getDocumentForAgent`/`applyDocumentPatch` on
        `SyncBackend` (impl in `@hubble.md/convex-client`). The CLI
        `hubble cloud document reconcile` now delegates to the shared module;
        same I/O, base-cache, read-only, and `--watch` semantics. Unit tests in
        `packages/sync/src/reconcile.test.ts`. Phases 1–6 (tray, watcher-in-main,
        routing, backstop wiring) remain gated on pending human decisions.
  - [x] **Phase 1** (Tray + always-on lifecycle, Decision C): added an
        `isQuitting` flag, a `Tray` (`apps/desktop/electron/tray.ts`), and a
        `backgroundActive` gate in `main.ts`. While background mode is active
        (engaged via `desktop:set-background-active` IPC), closing the window
        hides it and `window-all-closed` is a no-op so the main process stays
        alive behind the tray; when inactive, today's quit-on-close behavior is
        preserved. Tray menu ("Open Hubble"/"Quit Hubble") and the `activate`/
        `second-instance` paths reopen via a shared `showMainWindow()`; the
        single-instance lock is respected. No sync/watcher yet. Tray appearance +
        close/hide/quit behavior are **human-verification-pending** (can't run
        Electron headlessly).
  - [~] **Phase 2** (host reconcile engine in main, manual trigger) — engine +
        IPC complete and unit-tested; one renderer call deferred to Phase 3.
        `LiveSyncService` (`apps/desktop/electron/liveSync.ts`) hosts
        `reconcileProjectionFile` with injectable backend/fs; IPC handlers
        `desktop:live-sync:connect|disconnect|status|reconcile` are wired in
        `main.ts` and bridged in `preload.ts`/`src/desktopApi/types.ts`. New
        `electron/liveSync.test.ts` (7 tests) proves the service round-trips
        headlessly: connect/idle/throw-before-connect, reconciled outcome updates
        `lastReconciledAt`, backstop surfaced (not swallowed), backend error →
        `error` state + re-throw, disconnect reset. **The renderer caller is
        genuinely deferred to Phase 3**: there is no cloud-workspace connect/
        disconnect flow in the renderer today (the renderer only knows local
        folder-picker workspaces — no `deploymentUrl`/`workspaceId`), so
        `desktopApi.connectLiveSync` (already bridged) has no honest call site
        until Phase 3's synced-folder store action exists. Verified
        `pnpm build:desktop` green, `pnpm typecheck` clean across all 6 TS
        packages, desktop vitest 42/42 (was 35/35). Live Electron+Convex
        round-trip and tray behavior remain **human-gated** (can't run Electron
        headlessly). Stays `[~]` until merged. Phases 3–5 follow per
        `SYNCED-FOLDER.md`. — *Owner: Sonnet (orchestrated) · 2026-06-25*
  - [~] **Phase 3a** (synced-folder packages core, no desktop) — landed in the
        working tree. Threaded `LiveDocumentProjection.folderId` through
        `@hubble.md/convex-client` `getLiveDocuments`; added
        `SyncBackend.listWorkspaces`/`getFolders` (over existing
        `api.sync.listWorkspaces` / `api.folders.list`); new
        `packages/sync/src/syncedFolderIndex.ts` (`.hubble/index/synced-folder.json`
        load/save/`diff`/re-key, `absPath→{documentId,workspaceId,folderId,inode,
        hash,role}`); new `materializeSyncedFolder(backend, fs, { syncRoot })` in
        `sync.ts` that builds the nested `workspace → folderTree(parentId) →
        sanitize(title).md` mirror (NOT `document.path`), writes reconcile base
        caches at `liveDocumentBaseCacheRoot(syncRoot)` so `reconcileProjectionFile`
        finds them, writes the reverse index, applies role-based read-only chmod,
        and ` (2)`-suffixes sibling-title collisions. 7 new unit tests
        (`syncedFolder.test.ts`), `pnpm --filter @hubble.md/sync test` 21/21,
        `pnpm typecheck` clean across all 6 TS packages. **Deferred to follow-ups:**
        `Shared with me/` materialization (backend `listSharedWithMe` + `by_user`
        index already exist; just needs a `convex-client` thread); `inode` capture
        (needs FS `stat` — Phase 3b stats real files); base-cache `canWrite`/`role`
        carry-through (read-only still enforced by 0444 chmod + server-side
        `getDocumentForAgent` re-check); incremental removal of files that left the
        cloud set (Phase 3b watcher uses `diffSyncedFolderIndex`). —
        *Owner: Opus (orchestrated) · 2026-06-25*
  - [~] **Phase 3b** (desktop watcher + IPC) — landed in the working tree.
        New `apps/desktop/electron/syncedFolderClassify.ts` (pure classifier:
        ignore-globs/self-write → `change`→reconcile, `unlink`→hold,
        correlated unlink+add→`rename`/`move` by inode-or-hash within 750ms,
        uncorrelated add in a workspace folder→`create`, else ignore; plus
        `flushExpiredUnlinks`→`delete`, and the single-writer `owner.json`
        lock acquire/heartbeat/release) and `syncedFolderService.ts`
        (composes `materializeSyncedFolder` on connect → injected chokidar
        watcher → classify → route to `reconcileProjectionFile`/`renameDocument`/
        `moveDocument`/`importLiveDocument`, with `recentlyWrittenByUs` self-write
        suppression and stat-populated inodes). Added `SyncBackend.renameDocument`/
        `moveDocument`/`importLiveDocument` (over `api.documents.rename` /
        `api.folders.moveDocument` / `api.documents.importMarkdown`) + convex-client
        impls. IPC `desktop:live-sync:connect-folder|disconnect-folder|status-folder`
        in `main.ts` (real chokidar factory injected, stat→inode/hash,
        `assertGrantedRoot`, engages background mode) + `preload.ts`/`types.ts`
        bridge incl. `onSyncedFolderEvent`. 12 classifier + 5 service unit tests;
        desktop vitest **59/59**, `pnpm build:desktop` + `pnpm typecheck` clean.
        **Two bugs found & fixed in orchestrator review:** (1) `AcquireLockResult`
        was a discriminated union, which the non-strict electron `tsconfig.node.json`
        won't narrow on a boolean discriminant — flattened to optional fields so
        the `.reason`/`.current` access sites typecheck; (2) `isSelfWrite` blanket-
        suppressed any hash-less event on a recently-materialized path, which
        swallowed the leading `unlink` of a rename right after materialize — now
        `unlink` is never treated as a self-write (the engine only ever writes
        files), fixing rename/move correlation. **Scoped as seams (not half-built):**
        the reactive cloud→disk Convex subscription (initial full materialize on
        connect + a `refresh()` re-materialize stand in; reactive `ConvexClient`
        is the follow-up); direction-aware **delete** (local `unlink`→`documents.
        remove`) is logged/emitted only — the access-loss-vs-delete split is Phase 5;
        no renderer connect UI yet (consistent with Phase 2: no cloud-workspace
        flow exists in the renderer — the IPC is the entry point). **Human-gated:**
        live chokidar watch, real two-machine single-writer lock, full Electron+
        Convex round-trip. — *Owner: Opus (orchestrated, reviewed) · 2026-06-25*
  - [~] **Phase 4** (routing isolation) — landed in the working tree. The renderer
        and web now defer to the synced-folder engine for Live Documents so the
        legacy whole-file conflict classifier never runs on a synced doc (and can
        never write a spurious `*.conflict-<ts>`). New IPC
        `desktop:live-sync:is-live-document(absPath)` answered from the engine's
        reverse index via new `SyncedFolderService.isLiveDocument`/`lookup`;
        new pure `apps/desktop/src/syncedDocumentGuard.ts`
        (`resolveExternalFileChange` → `"skip"` for synced docs else the unchanged
        `classifyFileChange`; `isSyncedLiveDocument` defaults safe-`false` when the
        bridge/method is missing or IPC throws). `savePathContent` probes the IPC
        **only on a real divergence** (`action !== "none"`, preserving the
        newer-editor-content timing test and avoiding a round-trip per clean save);
        `handleExternalFileChange` is now async and skips classification for synced
        docs (`App.tsx` awaits it). Web `apps/www/src/shell/AppShell.tsx`
        `onRemoteFilesChanged` returns early when `documentId` is set (the existing
        Live-Document signal). `externalFileChange.ts` logic untouched — only its
        call sites. 8 guard + 1 service unit tests; **desktop vitest 68/68**,
        `pnpm typecheck` / `pnpm build:desktop` / `@hubble.md/www build` clean.
        **Latent until the connect UI exists** (Phase 3b deferral): the renderer
        can't open a synced-root doc yet, so the guard is structurally in place but
        not routinely exercised. **Human-gated:** end-to-end "synced doc never
        writes a conflict file, legacy doc still does" (needs connect UI + live
        cloud). — *Owner: Opus (orchestrated, reviewed) · 2026-06-25*
  - [~] **Phase 5** (backstop + access-loss + read-only + offline seam) — landed
        in the working tree, completing the synced-folder safety nets. **Backstop
        host** (`#backstop` in `syncedFolderService.ts`): on a `backstop` reconcile
        outcome, preserve the user's on-disk bytes to a `toLocalEditName` sibling →
        re-materialize the authoritative cloud markdown over the projection (re-
        applying read-only chmod) → refresh base cache + index → emit. Never a
        silent clobber. **Direction-aware removal** (the data-loss-critical split):
        a watcher **local-delete** (`#route` `case "delete"`) is the ONLY caller of
        the new `SyncBackend.removeDocument` (soft-delete over `api.documents.remove`)
        and drops its own index entry before any materialize; **access-loss**
        (detected in `#materialize` via `diffSyncedFolderIndex(result.index,
        previous).removed`) moves the local file to `.hubble/trash/` and **never**
        calls cloud remove. The two paths share no inputs, so a local delete can
        never resurface as a false access-loss. **Read-only** edits surface as
        `read-only-rejected` (the reconciler rejects before `applyPatch`).
        **Offline queue = seam only** (`#enqueue`/`#flushQueue` no-ops, `.hubble/
        queue/` reserved, `#offline` hard-`false`) — durable queueing/replay is
        owned by the offline decision, not built here. New events `removed-local`/
        `removed-access`/`read-only-rejected`. 4 new tests; **desktop vitest 72/72**,
        `pnpm typecheck` + `pnpm build:desktop` clean. **Known latent interaction**
        (record for the reactive-subscription follow-up): a local rename immediately
        followed by a materialize that computes the *old* title-path before
        `renameDocument` propagates could read as access-loss → trash; harmless in
        this slice because materialize runs only on connect/`refresh()` (no reactive
        push yet), but must be handled when the cloud→disk subscription lands.
        **Human-gated:** live two-device lock, real chokidar, full Electron+Convex
        round-trip, a real revoked-share access-loss. —
        *Owner: Opus (orchestrated, reviewed) · 2026-06-25*
- [~] **RD7 two-device single-writer lock hardening.** Standard-tier slice landed
      locally in `tasks/RD7-two-device-single-writer-lock.md`: heartbeat now checks
      `owner.json` before writing, refuses to overwrite a fresh foreign owner,
      still reclaims stale owners, and the desktop engine stops watcher,
      subscriptions, timers, and backend materialization if lock ownership is lost
      after connect. Verified focused lock/service tests and Biome on touched
      desktop files; true multi-device-same-root remains out of scope for v1.
      — *Owner: Codex · Started: 2026-06-28*
- [~] **RD8 security review.** Premier-tier slice landed locally in
      `tasks/RD8-security-review.md`: removed public throwaway ProseMirror POC
      mutation endpoints from the production Convex API, rerouted
      `scripts/reconcile-poc.mjs` through `documents.applyPatch`, added
      main-process zod validation for cloud-sync IPC payloads, removed renderer
      control of the synced-folder single-writer lock identity, and tightened
      synced-folder materializer sanitization for cloud-controlled leading-dot
      path segments. Added a traversal-looking materialization regression test.
      Verified focused Biome, focused sync/desktop tests, Convex codegen,
      `node --check`, and `pnpm typecheck` plus `pnpm build:desktop`.
      — *Owner: Codex · Started: 2026-06-28*
- [~] **RD10 flag-gated merge to fork `main`.** Premier-tier slice landed locally
      in `tasks/RD10-flag-gated-main-merge.md`: `origin/main` is merged into
      `spike/prosemirror-sync`, realtime API conflicts resolved to the secured
      branch versions, older upstream public document CRUD stayed out of
      `sync.ts`, and web Live Documents / desktop Cloud Sync are guarded by
      default-off `VITE_HUBBLE_REALTIME_COLLAB`. Verified `pnpm typecheck` and
      `pnpm build:desktop`; local `main` advanced to the merge commit.
      — *Owner: Codex · Started: 2026-06-28 · Landed: 2026-06-28*
- [~] **RD9 packaged desktop release.** Standard-tier slice landed locally in
      `tasks/RD9-packaged-desktop-release.md`: `pnpm build:desktop` and
      `pnpm bundle:desktop` produced `latest-mac.yml`, arm64 zip, arm64 dmg, and
      blockmaps for desktop `0.1.13`; `codesign --verify --deep --strict` passed;
      the packaged `.app` launch-smoked; and the DMG mounted with `Hubble.app`.
      Local notarization was skipped because notarize options were unavailable;
      production signing/notarization remains a release-cut prerequisite through
      GitHub Actions secrets plus the `desktop-v<version>` tag.
      — *Owner: Codex · Started: 2026-06-28 · Landed: 2026-06-28*
- [~] **RD11 monitoring / observability / on-call.** Standard-tier slice landed
      locally in `tasks/RD11-monitoring-observability.md`: `SyncedFolderService`
      now records local telemetry counters for reconciles, backstops, read-only
      rejects, sync errors, and queued offline watcher events; synced-folder
      status includes recent event timestamps/reasons; and the desktop Cloud Sync
      settings panel surfaces the diagnostics. Follow-up added `OPERATIONS.md`
      with vendor-neutral triage steps, escalation thresholds, safe user actions,
      and the alert signals to wire once a release owner chooses the external
      monitoring sink. External monitoring/alert vendor wiring is still deferred
      until that sink is chosen.
      — *Owner: Codex · Started: 2026-06-28 · Landed: 2026-06-28*
- [~] **RD12 MCP server for the patch API.** Post-launch standard-tier slice landed
      locally in `tasks/RD12-mcp-server-for-patch-api.md`: added
      `@hubble.md/mcp-server` with a `hubble-mcp` stdio server exposing
      `hubble_get_document`, `hubble_patch_document`, and
      `hubble_export_markdown`; the tools reuse the existing Convex
      client/backend document API so permission, revision, markdown-cap, and
      attribution checks remain server-side. Follow-up added
      `scripts/mcp-server-smoke.mjs` to launch the built MCP server over stdio
      against a hosted authenticated deployment, call get/patch/export tools, and
      verify the patch advances the revision. Hosted smoke passed on
      `strong-setter-709` 2026-06-29 with document
      `kn756w6xs8147tp4ahzb4se6js89jxmv` advancing revision `1 -> 2`; MCP server
      stdout was hardened so Convex/Tiptap warnings go to stderr instead of
      corrupting stdio protocol messages. Verified focused sync/mcp builds, script
      syntax, `pnpm typecheck`, and `pnpm build:desktop`.
      — *Owner: Codex · Started: 2026-06-29 · Landed: 2026-06-29*
- [~] Offline edit + merge on reconnect — two flavors (Decision 6): in-editor (CRDT
      local buffer/replay) and external-file (watcher queues edits, flushes on
      reconnect via the reconcile path). Decision: **no Yjs fork** — keep
      prosemirror-sync + a thin durable layer (see `OFFLINE-DECISION.md`).
      In-editor flavor `[WIP]` (interrupted by session limit): IndexedDB step
      buffer + extension persist unsynced ProseMirror steps and replay after a
      reload-while-offline (`apps/www/src/shell/durableOfflineBuffer.ts`,
      `DurableOfflineExtension.ts`, wired in `EditorView.tsx`). **Compiles**
      (`pnpm typecheck` green) but offline-reload replay is **not yet
      behavior-verified** (needs a human browser pass). Checkpointed at commit
      `d5355c7`. External-file queue flavor `[local]` now has
      `tasks/RD6-offline-gate-resolution.md` and durable desktop queueing:
      watcher events persist to `.hubble/queue/events.json` while offline or after
      a route failure, queued events replay before reconnect materialization, and a
      failed replay stays queued so cloud materialization cannot overwrite the
      unsynced local edit. Verified focused desktop service tests and
      `pnpm typecheck`. In-editor durable buffer follow-up fixed same-tab
      sessionStorage hydration to seed the persister from the exact upstream
      restore payload instead of a possibly stale/missing IndexedDB copy; added
      focused web unit coverage. Verified
      `pnpm --filter @hubble.md/www test -- durableOfflineBuffer.test.ts`.
      Browser probe on `strong-setter-709` confirmed an offline editor edit writes
      the upstream cache, but full reload with the whole backend blocked cannot
      remount the editor because app-shell workspace/document queries fail before
      the sync extension can consume the cache. **RD6 is closed for v1 with that
      explicit boundary**: full reload/app-restart while Convex is unavailable is
      deferred to a future app-shell offline cache + editor replay slice.
      — *Owner: Opus/Codex · Started: 2026-06-25 · RD6 resumed: 2026-06-28*
- [~] Audit log, trash + restore, admin/role management. Trash/restore backend
      started locally with `documents.listTrash`, `documents.restoreRemoved`,
      `folders.listTrash`, and `folders.restoreRemoved`. Activity events
      already provide an audit-log substrate; admin/role management UI remains
      pending. Verified `convex codegen`, `pnpm check`, and
      `pnpm build:desktop`. Unmerged. — *Owner: Codex · Started: 2026-06-25*

---

## Changelog

Newest first. One line per meaningful change: `YYYY-MM-DD — who — what`.

- 2026-07-01 — Codex — Added a shared toolbar user badge and wired it into web
  and desktop so the active account is visible from both surfaces. Removed the
  web dashboard's automatic "Welcome to Hubble" document creation so fresh
  workspaces can remain empty. Reset hosted dev deployment `strong-setter-709`
  after exporting a snapshot backup: cleared Live Documents, connected workspace
  content, shares, comments, revisions, presence, legacy sync rows, and
  ProseMirror component state; recreated empty personal spaces for existing users.
- 2026-07-01 — Codex — Implemented the desktop cloud-first IA plan: added
  Live Documents home/sidebar hierarchy in Convex-enabled desktop builds, kept
  local folders as optional synced/local Markdown support, made toolbar/Cmd+N
  create Live Documents for signed-in cloud users, and updated desktop copy. Verified
  focused Biome, `pnpm build:desktop`, and an Electron CDP smoke of the primary
  create action/sidebar hierarchy.
- 2026-07-01 — Codex — Added `DESKTOP-CLOUD-FIRST-IA.plan.md`, a phased
  desktop IA plan that makes Live Documents the primary desktop object and treats
  local folders as optional support for external editors and agents.
- 2026-07-01 — Adrian/Codex — Completed a v1 demo UX pass on
  `strong-setter-709`: signed-in two-profile web flow, workspace-member copied URL
  access, desktop Cloud Sync reconnect to
  `/Users/adriantavares/Hubble-A-test/jul1test/Untitled`, disk -> cloud ->
  disk round trip on `Desktop Test/UX Smoke 2026-07-01.md`, clean synced-folder
  telemetry, no conflict/backstop files, and duplicate backend check still at
  `activeMatches: 0` / `deletedMatches: 188`. Detailed log recorded in
  `TEST-RUNBOOK.md`.
- 2026-06-30 — Codex — Investigated v1 demo duplicate Live Documents and
  member-link access failures on `strong-setter-709`. Found real backend rows
  created by the desktop synced-folder import path, not a sidebar render duplicate:
  materialization ignored stable document paths while watcher-created imports
  stored sync-root-relative paths. Fixed synced-folder materialization to prefer
  stable workspace-relative document paths, normalize legacy duplicated workspace
  prefixes, and import new local files without the top-level workspace directory.
  Also fixed document permissions so regular workspace members can open documents
  in that workspace from a copied URL. Added regression coverage in sync,
  desktop, and sync-backend tests.
- 2026-06-30 — Codex — Added the v1 demo TODO for explicit "visible to anyone
  with the link" plus copy-link sharing UI, and guarded Live Document routes with
  an access-error boundary so unresolved/unauthorized shared links show product
  copy instead of crashing on `documents.getWithMarkdown`.
- 2026-06-30 — Codex — Continued V1 release P7 local launch gate: added a
  Convex-backed UTC-day signup counter capped at 100 new accounts/day with focused
  backend tests and web/desktop signup copy; deleted `VITE_HUBBLE_REALTIME_COLLAB`
  plus the web/desktop flag modules so the dashboard, Live Document route/sidebar,
  member management, and desktop Cloud Sync settings are default product surfaces
  when `VITE_CONVEX_URL` is configured. Verified codegen, sync-backend tests (27),
  web typecheck/build, repo typecheck, desktop build, touched-file Biome, and Vite
  HTTP 200 for `?test=1`; browser visual smoke remains blocked by the in-app
  Browser setup error. Remaining P7 gates are operator/manual: C1/C2 QA, D3/D4
  deploy, D5 external ops sink, and release ops.
- 2026-06-30 — Codex — Continued V1 release P6 hardening: added permission
  regression coverage for viewer/commenter write denial, comment boundaries,
  public viewer links, deleted-document trash visibility, and oversized Live
  Document import copy; changed trash listing to filter by deleted-document roles
  without first requiring workspace membership; normalized auth/session and 256 KiB
  cap errors into user-facing web copy; reset signed-out stale workspace routes to
  `/` before the next login to avoid multi-account route bleed. Verified codegen,
  sync-backend tests (25), web typecheck/build, repo typecheck, desktop build,
  touched-file Biome, and Vite HTTP 200 for `?test=1`; browser visual smoke remains
  blocked by the in-app browser setup error.
- 2026-06-30 — Codex — Continued V1 release P5 completeness: normal in-app
  editing now autosaves materialized History revisions through `markEdited` with a
  stale guard; comment composers/replies now have a document-scoped @mention
  picker backed by accessible workspace members and direct doc shares; workspace
  member management is available from the workspace toolbar for invite, role
  changes, removal, and invite revocation; empty first-run private workspaces now
  auto-create and open a "Welcome to Hubble" Live Document. Added focused backend
  tests for autosave throttling and mention candidates. Verified codegen,
  sync-backend tests, web typecheck/build, repo typecheck, desktop build,
  touched-file Biome, and Vite HTTP 200 for `?test=1`; browser visual smoke remains
  blocked by the in-app browser tool initialization error.
- 2026-06-30 — Codex — Continued V1 release P4 production presence: authenticated
  presence heartbeats now derive the viewer identity server-side, authorize Live
  Document presence through document roles and POC presence through workspace
  membership, return stable collaborator colors, and reject anonymous spoofing for
  owned documents. The web editor now publishes signed-in cursor heartbeats,
  filters the local viewer through `viewer.me`, and shows live collaborators in
  the Live Document header while preserving `?test=1` identity bootstrap. Added
  focused presence regression tests. Verified codegen, sync-backend tests, web
  typecheck/build, repo typecheck, desktop build, and touched-file Biome; browser
  visual smoke remains blocked by the in-app browser tool initialization error.
- 2026-06-30 — Codex — Continued V1 release P3 dashboard: added
  `documents.dashboard` and `documents.searchAll` aggregate queries spanning
  accessible personal/team workspaces plus direct document shares; added the
  authenticated Home dashboard with Recents, Private, Teams, Shared with me,
  global search, and primary Live Document creation. Added a backend dashboard
  aggregation regression test and removed an unused `members.ts` validator that
  blocked `pnpm build:desktop`. Verified codegen, backend tests, web
  typecheck/build, repo typecheck, desktop build, and touched-file Biome; browser
  visual smoke remains owed because the in-app browser tool failed to initialize.
- 2026-06-29 — Codex — Fixed a desktop Cloud Sync connection blocker found during
  the two-machine smoke setup: authenticated `sync.listWorkspaces` results now
  exclude legacy anonymous workspaces that downstream workspace-member checks
  reject, preventing the app from listing a workspace and then failing
  materialization with `folders.list` `Unauthorized`. Verified focused synced
  folder tests, `@hubble.md/convex-client` typecheck, and `pnpm build:desktop`.
- 2026-06-29 — Codex — Added the RD11 operations runbook follow-up:
  `OPERATIONS.md` documents the v1 synced-folder support workflow around local
  telemetry, including first triage, escalation thresholds, safe user actions,
  things not to delete, and future external-alert wiring points. Updated the
  README and START HERE pickup state to make clear RD1-RD12 are landed locally
  and the remaining named follow-ups require operator/product choices.
- 2026-06-29 — Codex — Added the RD12 hosted MCP client smoke:
  `scripts/mcp-server-smoke.mjs` launches the built `hubble-mcp` server over MCP
  stdio, imports a timestamped Live Document through the existing Convex client,
  calls `hubble_get_document`, `hubble_patch_document`, and
  `hubble_export_markdown`, then fails unless the MCP patch advances the revision
  and the exported markdown contains the patch marker. Hosted verification passed
  on `strong-setter-709` with document `kn756w6xs8147tp4ahzb4se6js89jxmv`
  advancing revision `1 -> 2`; the MCP server now routes console output to stderr
  so backend warnings do not corrupt stdout protocol frames. Reuse note: no smoke
  tokens/passwords were saved; future runs should sign in through the app or mint a
  fresh throwaway password-auth account and pass the current JWT as `AUTH_TOKEN`.
- 2026-06-29 — Codex — Landed RD12 post-launch standard-tier MCP server:
  added `@hubble.md/mcp-server` with a `hubble-mcp` stdio entrypoint and tools
  for Live Document get, patch, and markdown export. The server reuses the
  existing Convex client/backend API and optional auth-token configuration, so
  document permission, revision, markdown-cap, and attribution checks stay on the
  production `documents.applyPatch` path. Verified focused sync/mcp builds,
  `pnpm typecheck`, and `pnpm build:desktop`.
- 2026-06-28 — Codex — Landed RD11 standard-tier monitoring /
  observability: added local synced-folder telemetry to `getSyncedFolderStatus`
  for reconciles, backstops, read-only rejects, errors, queued offline events, and
  recent event timestamps/reasons, then surfaced those diagnostics in the desktop
  Cloud Sync settings card. Added focused service coverage for telemetry updates
  and queue depth. Verified `pnpm --filter @hubble.md/desktop test --
  syncedFolderService.test.ts` and `pnpm typecheck`.
- 2026-06-28 — Codex — Landed RD9 standard-tier packaged desktop release:
  verified `pnpm build:desktop` and `pnpm bundle:desktop`, produced
  `latest-mac.yml`, `Hubble-0.1.13-arm64-mac.zip`,
  `Hubble-0.1.13-arm64.dmg`, and blockmaps, confirmed strict codesign
  verification, launch-smoked the packaged `.app`, and mounted the DMG to confirm
  it contains `Hubble.app`. Local notarization was skipped without notarize
  options; production release cut still requires the configured GitHub Actions
  signing/notarization secrets and a confirmed `desktop-v<version>` tag.
- 2026-06-28 — Codex — Started RD9 standard-tier packaged desktop release:
  added the phase-start brief for local production packaging, updater artifact
  checks, packaged `.app` launch smoke, release workflow tag/version validation,
  and explicit operator prerequisites for signing/notarization before cutting a
  `desktop-v<version>` release.
- 2026-06-28 — Codex — Landed RD10 premier-tier flag-gated merge: merged
  `origin/main` into the realtime branch, kept RD8-secured Live Document APIs over
  older upstream public document CRUD, and added default-off
  `VITE_HUBBLE_REALTIME_COLLAB` gating for web Live Documents/routes/auth shell
  and desktop Cloud Sync settings/Auth setup. Verified `pnpm typecheck` and
  `pnpm build:desktop`; local `main` was advanced to the merge commit.
- 2026-06-28 — Codex — Implemented RD8 premier-tier security review: removed the
  public throwaway ProseMirror POC mutation endpoints, routed
  `scripts/reconcile-poc.mjs` through production `documents.applyPatch`, added
  main-process validation for cloud-sync IPC payloads, made the Electron main
  process own the synced-folder lock identity instead of accepting a renderer
  override, and hardened synced-folder materialization against cloud-controlled
  leading-dot path segments with a regression test. Verified focused sync and
  desktop tests, focused Biome, Convex codegen, `node --check
  scripts/reconcile-poc.mjs`, and `pnpm typecheck` plus `pnpm build:desktop`.
- 2026-06-28 — Codex — Implemented RD7 standard-tier two-device lock hardening:
  `heartbeatSingleWriterLock` now refuses to overwrite a fresh foreign
  `owner.json`, stale owners remain reclaimable, and `SyncedFolderService` stops
  subscriptions/watchers/timers plus drops the backend if ownership is lost after
  connect. Added focused classifier and service tests. Verified focused Biome,
  `pnpm --filter @hubble.md/desktop test -- syncedFolderClassify.test.ts
  syncedFolderService.test.ts`, `pnpm typecheck`, and `pnpm build:desktop`.
- 2026-06-28 — Codex — Wrapped RD6 offline gate with an explicit v1 boundary:
  browser probing against `strong-setter-709` confirmed offline in-editor edits
  populate the upstream `convex-sync-document:<id>` cache, but also confirmed a
  full reload while the whole Convex backend is unavailable cannot remount the
  editor because app-shell workspace/document queries fail first. RD6 now ships
  external-file durable queueing plus transient in-editor disconnect support; full
  reload/app-restart while Convex is unavailable is deferred to a future
  app-shell offline cache + editor replay slice. No Yjs/DO fallback is triggered.
  Verified Convex function deployment/typecheck with
  `pnpm --filter @hubble.md/sync-backend exec convex dev --once --typecheck enable`.
- 2026-06-28 — Codex — Continued RD6 in-editor durable offline work: fixed
  same-tab sessionStorage hydration so the durable persister seeds from the exact
  `convex-sync-<id>` payload that `prosemirror-sync` restores, rather than a
  possibly stale/missing IndexedDB copy after reload. Added a focused
  `@hubble.md/www` Vitest harness and unit coverage for the session bridge and
  durable-store hydration path. Verified
  `pnpm --filter @hubble.md/www test -- durableOfflineBuffer.test.ts`,
  `pnpm --filter @hubble.md/desktop test -- syncedFolderService.test.ts`,
  `pnpm typecheck`, and `pnpm build:desktop`; `pnpm check` remains blocked only
  by pre-existing formatting drift in `convex/tsconfig.json`,
  `packages/sync/src/reconcile.test.ts`, and `skills-lock.json`. RD6 remains open
  pending browser offline-reload verification or an explicit product boundary.
- 2026-06-28 — Codex — Started RD6 offline resolution as the next premier gate:
  expanded `tasks/RD6-offline-gate-resolution.md` and implemented the desktop
  external-file offline queue in `syncedFolderService`. Watcher events now persist
  under `.hubble/queue/events.json` while offline or after route failure, replay
  before reconnect materialization, and stay queued on failed replay so local
  offline edits are not overwritten by cloud materialization. Verified
  `pnpm --filter @hubble.md/desktop test -- syncedFolderService.test.ts` and
  `pnpm typecheck`. RD6 remains open pending the in-editor durable offline browser
  verification.
- 2026-06-28 — Codex — Completed the remaining RD5 hosted manual two-browser web
  pass against `strong-setter-709` using document
  `kn7e5a4kwk4mhb207mxnxst9t189h9tj`: Ada/Ben `?test=1` browser sessions both
  showed presence, separate-paragraph edits merged into backend revision 107, and
  same-paragraph adjacent inserts converged in both browser pages and backend
  revision 175. RD5 is accepted with the 256 KiB Live Document cap; this does not
  claim large-doc parity. The next unblocked premier gate is RD6 offline
  resolution.
- 2026-06-28 — Codex — Continued RD5 cap enforcement: added a 256 KiB byte cap to
  Convex Live Document import/patch/conversion paths before revision
  materialization, added local `importLiveDocuments` preflight so oversized
  batches fail before partial cloud writes, exported the sync cap helper, and
  covered the preflight with focused tests. Verified targeted Biome on touched
  files, `@hubble.md/sync` tests/typecheck, Convex codegen/typecheck,
  `pnpm typecheck`, and `pnpm build:desktop`; `pnpm check` remains blocked by
  pre-existing formatting drift in `convex/tsconfig.json`,
  `packages/sync/src/reconcile.test.ts`, and `skills-lock.json`.
- 2026-06-28 — Adrian/Codex — Marked RD12 MCP server as a post-launch follow-up
  rather than a launch gate. The CLI `hubble cloud document get/patch/reconcile`
  path remains the launch agent surface; MCP can be picked up later as
  standard-tier protocol/auth/security work.
- 2026-06-28 — Adrian/Codex — RD5 doc-size decision: keep Convex/
  `@convex-dev/prosemirror-sync` for the current production path, enforce an
  initial **256 KiB Live Document markdown cap**, and defer large-doc parity to a
  storage/revision redesign. Do not trigger the Yjs/Durable Objects fallback for
  the RD5 large-doc result alone. Remaining RD5 work: cap enforcement and hosted
  manual two-browser editor pass.
- 2026-06-28 — Codex — Started RD5 as the next premier ready-to-deploy gate:
  expanded `tasks/RD5-doc-size-load-live-gate.md`, added
  `scripts/prosemirror-doc-size-gate.mjs`, and ran hosted measurements against
  `strong-setter-709`. The harness passed 64 KiB, 256 KiB, and 320 KiB markdown
  Live Documents with repeated `documents.applyPatch` edits and two reactive
  subscribers observing the final revision, but exposed a current-stack doc-size
  failure: 384 KiB and 512 KiB fail on first patch with Convex values over 1 MiB,
  and 768 KiB import times out. RD5 is not passed; manual two-browser editor pass
  and an architecture/product decision on large docs remain pending.
- 2026-06-27 — Codex — Implemented RD4 production auth hardening: expanded the
  phase-start brief, audited the Convex Auth/password wiring and public Convex
  function gates, hardened ProseMirror sync to reject non-`document:` sync IDs,
  added commenter-specific authorization, blocked viewers from comments and
  suggestions, and made trash list/restore evaluate deleted-document roles
  instead of broad workspace membership. Verified focused Biome, Convex codegen,
  `pnpm typecheck`, `pnpm build:desktop`, and `convex dev --once --typecheck
  enable`.
- 2026-06-27 — Codex — Implemented RD2 `Shared with me/` materialization for
  synced folders: expanded the phase-start brief, added `workspaceName` to
  `documents.listSharedWithMe`, threaded `SyncBackend.getSharedWithMe()` through
  `@hubble.md/convex-client`, subscribed to `documents.listSharedWithMe` in the
  synced-folder Convex subscriber, and materialized direct non-member shares under
  a reserved flat `Shared with me/` directory with workspace-prefixed filenames,
  reconcile base caches, reverse-index entries, role-based read-only chmod, and
  collision handling. Verified `pnpm --filter @hubble.md/sync test syncedFolder`,
  `pnpm --filter @hubble.md/desktop test syncedFolderService`,
  `pnpm --filter @hubble.md/convex-client typecheck`, `pnpm typecheck`,
  `pnpm build:desktop`, `pnpm --filter @hubble.md/sync-backend exec convex
  codegen`, and `pnpm --filter @hubble.md/sync-backend exec convex dev --once
  --typecheck enable`.
- 2026-06-27 — Codex — Implemented RD1 reactive cloud-to-disk sync for synced
  folders: added authenticated Convex subscriber support for workspace/folder/live
  document query updates, wired `SyncedFolderService` to debounce subscription
  callbacks into materialize passes, close subscriptions on disconnect, surface
  subscription errors, and clean cloud path changes by `documentId` without
  treating local rename/move echoes as access loss. Verified
  `pnpm --filter @hubble.md/desktop test syncedFolderService`,
  `pnpm --filter @hubble.md/sync test syncedFolder`,
  `pnpm --filter @hubble.md/convex-client typecheck`, `pnpm typecheck`, and
  `pnpm build:desktop`. `pnpm check` still reports pre-existing formatting drift
  in unrelated files (`convex/tsconfig.json`, `skills-lock.json`,
  `packages/sync/src/reconcile.test.ts`, `packages/sync/src/sync.ts`).
- 2026-06-27 — Codex — Expanded the next RD phase-start brief at
  `tasks/RD1-reactive-cloud-disk-sync.md`: scoped reactive cloud-to-disk
  subscriptions as a premier slice, captured the rename-vs-access-loss
  data-loss hazard, listed exact files/tests/checks, and summarized the remaining
  RD model-tier routing. No RD1 implementation edits were made.
- 2026-06-27 — Codex — Handoff refresh before switching agents: committed the
  inherited local Convex AI guidance/import-order changes as `17c73f8`, confirmed
  the working tree was clean before any RD1 implementation edits, corrected the
  START HERE block to stop recommending already-landed Stage 5 UI tasks, and
  pointed the next agent at RD1 with `/orchestrate` discipline. RD plan is
  tiered, but only RD3 has a full phase-start brief; RD1 still needs brief
  expansion before implementation.
- 2026-06-27 — Codex — Started RD3 ready-to-deploy validation: expanded the
  Convex schema migration/deployment brief, verified `strong-setter-709`
  accepts the widened realtime-collab schema and prosemirror-sync component,
  confirmed `convex codegen` produced no generated diffs, and confirmed
  `convex dev --once --typecheck enable` plus `pnpm build:desktop` pass. Recorded
  the zero-downtime rollout plan in `READY-TO-DEPLOY.plan.md`; no production data
  backfill was run pending an operator-confirmed target and legacy import policy.
- 2026-06-27 — Codex — Verified the RT5 package-level synced-folder reconcile
  smoke against deployed Convex `strong-setter-709` using the signed-in desktop
  Convex Auth JWT. The smoke imported a Live Document, wrote the local projection
  and base cache, reconciled a disk edit through `documents.applyPatch`, and
  confirmed the cloud markdown advanced from revision `1 → 2`. Manual desktop
  watcher/IPC/folder-picker runbook steps remain human-gated.
- 2026-06-26 — Codex — RT5 ready-to-test runbook/smoke support landed:
  documented the manual deployed-backend synced-folder test path in
  `TEST-RUNBOOK.md` and added `scripts/synced-folder-reconcile-smoke.mjs`, an
  authenticated package-level smoke that seeds a Live Document, writes the base
  cache, edits the projection, runs `reconcileProjectionFile`, and asserts the
  cloud markdown advanced. Verified targeted Biome, `node --check`, and script
  `--help`; full deployed execution still requires a real `CONVEX_URL` +
  `AUTH_TOKEN`.
- 2026-06-26 — Codex — RT4 ready-to-test copy pass landed: synced-folder
  reconciles now update the status line without toast spam, rename/move/create and
  removal events use final human-facing messages, read-only/backstop events explain
  the `.local-edit` safety copy, and status errors include a refresh/reconnect
  hint. Verified `pnpm typecheck`, `pnpm --filter @hubble.md/desktop test -- --run`,
  and `pnpm build:desktop`.
- 2026-06-26 — Codex (orchestrated, reviewed) — Fixed the two ready-to-test
  synced-folder UX gaps found during human smoke: `reconcileProjectionFile` and
  `materializeSyncedFolder` now avoid rewriting projection files when the
  authoritative markdown is byte-identical to disk, preventing external-editor
  changed-by-another-app warnings on ordinary saves/reconnects; the desktop
  synced-document guard now refreshes clean open editors from reconciled disk
  content and only advances the saved baseline for dirty open editors. Verified
  `pnpm --filter @hubble.md/sync test -- reconcile syncedFolder` and
  `pnpm --filter @hubble.md/desktop test -- syncedDocumentGuard`.
- 2026-06-26 — Adrian/Codex — Human-smoked the ready-to-test synced folder on
  deployed Convex `strong-setter-709`: after setting Convex Auth `JWT_PRIVATE_KEY`
  / `JWKS`, desktop sign-in worked, a seeded `Desktop Test/test-note.md`
  materialized into `/Users/adriantavares/Documents/dubble-test`, an external
  TextEdit save reconciled through `documents.applyPatch` to Convex revision 2,
  and no `*.conflict-*` / `*.local-edit-*` file was written. Follow-up required:
  suppress Hubble's own projection echo so TextEdit does not warn on ordinary
  local edits, and refresh/patch an already-open Hubble editor view when the
  synced-folder engine reconciles the currently open file.
- 2026-06-26 — Codex (orchestrated, reviewed) — RT3 ready-to-test first-run guard
  landed: added synced-folder root inspection IPC, pure root classification for
  empty / existing Hubble / non-empty foreign roots, Settings guard UI that refuses
  non-empty foreign folders by default, and explicit workspace import before mirror
  connect. Verified the focused desktop synced-folder classifier test,
  `pnpm typecheck`, and `pnpm build:desktop`.
- 2026-06-26 — Codex — RT2 ready-to-test settings flow landed: the desktop
  Settings cloud-sync section now shows signed-in workspace context, deployment,
  sync-root path, connection state, mirrored document count, relative last
  activity, create-folder and choose-existing folder actions, disconnect, manual
  status refresh, and event-driven status refreshes. Added placeholder toasts for
  every synced-folder event kind (`reconciled`, `renamed`, `moved`, `created`,
  `removed-local`, `removed-access`, `read-only-rejected`, `backstop`, `error`).
  Verified `pnpm check`, `pnpm typecheck`, `pnpm --filter @hubble.md/desktop
  test` (74/74), and `pnpm build:desktop`. Human deployed-Convex sign-in and
  empty-folder materialization remain gated on a manual Electron run; keep
  non-empty-folder testing blocked until RT3.

- 2026-06-26 — Codex (orchestrated, reviewed) — RT1 ready-to-test gate landed:
  desktop renderer now wraps the app in Convex Auth when `VITE_CONVEX_URL` is set,
  exposes a Settings cloud-sync section with password sign-in/sign-up, queries the
  authenticated workspace list, and sends the renderer JWT string from
  `useAuthToken()` over IPC to both `connectSyncedFolder` and `connectLiveSync`.
  `createConvexBackend(url, authToken?)` now authenticates the `ConvexHttpClient`;
  the synced-folder renderer reconnects the main-process backend when the token
  changes. Added token-forwarding tests for `LiveSyncService` and
  `SyncedFolderService`; desktop vitest 74/74, `pnpm typecheck`, and
  `pnpm build:desktop` pass. Actual deployed Convex sign-in/materialize remains
  human-gated; use an empty sync folder until RT3's existing-folder guard lands.

- 2026-06-25 — Opus (orchestrated, reviewed) — Synced-folder Phase 5 (safety
  nets): synced folder now protects local edits — a conflicting or read-only save
  is preserved as a `*.local-edit-<ts>` copy beside the doc (backstop host: write
  sibling → re-materialize authoritative → refresh base+index), and losing access
  to a shared doc moves the local copy to `.hubble/trash/` rather than deleting it.
  Direction-aware removal kept unambiguous: watcher local-delete → new
  `SyncBackend.removeDocument` (soft-delete); materialize-detected access-loss →
  trash, never cloud-delete. Read-only edits surface as `read-only-rejected`.
  Offline queue reserved as a no-op seam (owned by the offline decision). 4 new
  tests; desktop 72/72; typecheck + build:desktop clean. Noted one latent
  rename-vs-materialize interaction for the future reactive subscription. Unmerged.

- 2026-06-25 — Opus (orchestrated, reviewed) — Synced-folder Phase 4 (routing
  isolation): synced-folder Live Documents now bypass the legacy whole-file
  conflict classifier entirely, so a reconciled live doc can never produce a
  spurious `.conflict` file. New IPC `desktop:live-sync:is-live-document` +
  `SyncedFolderService.isLiveDocument/lookup`; pure `syncedDocumentGuard.ts`;
  `savePathContent`/`handleExternalFileChange` (desktop) and `onRemoteFilesChanged`
  (web, via the existing `documentId` signal) skip classification for synced/live
  docs. `externalFileChange.ts` logic untouched. 8 guard + 1 service tests; desktop
  68/68; typecheck + build:desktop + www build clean. Latent until the connect UI
  exists; end-to-end conflict-file proof human-gated. Unmerged.

- 2026-06-25 — Opus (orchestrated, reviewed) — Synced-folder Phase 3b (desktop
  watcher + IPC): new `syncedFolderClassify.ts` (pure classifier + single-writer
  lock) and `syncedFolderService.ts` (materialize→chokidar→classify→route:
  reconcile/rename/move/create) in the Electron main process; added
  `SyncBackend.renameDocument`/`moveDocument`/`importLiveDocument` + convex-client
  impls; IPC `desktop:live-sync:connect-folder|disconnect-folder|status-folder`
  + preload bridge. 12 classifier + 5 service tests; desktop vitest 59/59,
  `pnpm build:desktop` + `pnpm typecheck` clean. The subagent was cut off by a
  session limit before reporting; orchestrator review found & fixed two real bugs:
  a discriminated-union `AcquireLockResult` the non-strict electron tsconfig won't
  narrow (flattened), and `isSelfWrite` wrongly suppressing the `unlink` half of a
  post-materialize rename (unlink is never a self-write). Seams left explicit:
  reactive cloud→disk subscription, direction-aware delete (Phase 5), renderer
  connect UI. Live watch / two-machine lock / Electron round-trip human-gated.
  Unmerged.

- 2026-06-25 — Opus (orchestrated) — Synced-folder Phase 3a (packages core):
  threaded `folderId` through the `LiveDocumentProjection` + `convex-client`
  mapper; added `SyncBackend.listWorkspaces`/`getFolders`; new `syncedFolderIndex`
  module (`.hubble/index/synced-folder.json` load/save/diff/re-key); new
  `materializeSyncedFolder(backend, fs, { syncRoot })` building the nested
  workspace→folder→title mirror with reconcile base caches at
  `liveDocumentBaseCacheRoot(syncRoot)`, the reverse index, role-based read-only
  chmod, and ` (2)` collision suffixing. 7 new unit tests, sync vitest 21/21,
  `pnpm typecheck` clean. No desktop/backend files touched. Deferred:
  `Shared with me/` materialize, inode capture (Phase 3b), base-cache role carry,
  incremental removal (Phase 3b). Unmerged.

- 2026-06-25 — Sonnet (orchestrated) — Desktop Phase 2 finished: added
  `LiveSyncService` unit tests (`apps/desktop/electron/liveSync.test.ts`, 7 tests
  — connect/idle/throw-before-connect, reconciled, backstop-surfaced, error+rethrow,
  disconnect-reset). `pnpm build:desktop` + `pnpm typecheck` clean, desktop vitest
  42/42 (was 35/35). The renderer `connectLiveSync` call is genuinely deferred to
  Phase 3 — no cloud-workspace connect flow exists in the renderer yet (it only
  knows local folder-picker workspaces); the `desktopApi.connectLiveSync` bridge is
  already live in `preload.ts`. Live Electron+Convex round-trip remains human-gated.
  Unmerged.

- 2026-06-25 — Sonnet (orchestrated) — Stage 6 fast-follow: added the
  `docShares.by_user` index (`schema.ts`) and the `documents.listSharedWithMe`
  query, returning the same projection shape as `listWithMarkdown`
  (markdown/version/role/canWrite/folderId via `...document`), filtered to docs
  shared directly with the auth user in workspaces they are **not** a member of
  (skips any workspace where `workspaceRole !== null` to avoid double-listing with
  `listWithMarkdown`; drops trashed docs). Unblocks the synced-folder
  `Shared with me/` area (SYNCED-FOLDER.md §1 gap 3 / §8). Reviewed for internal
  consistency against `listWithMarkdown`; `convex codegen` is deployment-gated and
  was **not** run. Unmerged.

- 2026-06-25 — Opus (orchestrated) — Stage 6 foundation push. Settled three
  decisions (`STAGE6-BUILD-DECISIONS.md`): both offline flavors, **no Yjs fork**;
  **designated synced-folder** on-disk model; always-on **only when a cloud
  workspace is connected**. Design docs landed: `OFFLINE-DECISION.md`,
  `DESKTOP-ALWAYS-ON.md`, `SYNCED-FOLDER.md`. Code landed: desktop reconciler
  extraction Phase 0 (`c0d6ddf`) and tray/lifecycle Phase 1 (`83ee35a`).
  Checkpointed two `[WIP]` (compiles, behavior-unverified, interrupted by a
  session limit): in-editor durable offline (`d5355c7`) and desktop Phase 2
  host-reconcile (`d3c46d9`). **Next pickup:** finish Phase 2 IPC trigger, then
  Phase 3 synced-folder watcher per `SYNCED-FOLDER.md`; verify the offline-reload
  replay in a browser. One backend fast-follow noted: `Shared with me/` needs
  `documents.listSharedWithMe` + a `by_user` index on `docShares` (v1 ships
  workspace-folders-only).

- 2026-06-25 — Opus — Desktop always-on Phase 1: added tray + always-on
  lifecycle (Decision C). New `apps/desktop/electron/tray.ts`; `main.ts` gains an
  `isQuitting` flag, a `backgroundActive` gate, and a `desktop:set-background-active`
  IPC. While background mode is active, closing the window hides it and
  `window-all-closed` is a no-op (process survives behind the tray); otherwise
  today's quit-on-close is preserved. Tray menu + `activate`/`second-instance`
  reopen via a shared `showMainWindow()`; single-instance lock respected. No sync
  yet. `pnpm build:desktop` + `pnpm typecheck` clean across all 6 TS packages,
  desktop tests pass (35), `pnpm check` clean. Tray/lifecycle behavior is
  human-verification-pending (Electron can't run headlessly here).
- 2026-06-25 — Opus — Desktop always-on Phase 0: extracted the CLI reconcile
  loop into a reusable `@hubble.md/sync` reconciler (`reconcileProjectionFile`
  + helpers, `toLocalEditName`) and added `getDocumentForAgent`/
  `applyDocumentPatch` to `SyncBackend` (Convex impl). CLI `cloud document
  reconcile` now delegates with no behavior change. New
  `packages/sync/src/reconcile.test.ts` (14 tests). Verified sync+cli builds,
  `pnpm typecheck` clean across all 6 TS packages, tests pass, `pnpm check` clean.
- 2026-06-25 — Sonnet — Stage 6 cross-document search UI (Task A): added a
  debounced search input to the Live Documents sidebar section in `Sidebar.tsx`.
  Uses `useQuery(api.documents.search, ..., "skip")` — no query on empty input.
  Results show title, path, and snippet; clicking navigates to the document and
  clears the input. Verified `pnpm typecheck` clean across all 6 TS packages,
  `pnpm --filter @hubble.md/www build` clean, and `pnpm check` clean. Visual
  browser pass pending human.
- 2026-06-25 — Sonnet — Stage 5 comments UI (Task B): added `CommentsButton` to
  the Live Document header in `AppShell.tsx`. Opens a modal with a new-comment
  composer (captures ProseMirror selection via a ref in `LiveDocumentView`,
  anchored as `{ from, to }`), a thread list with per-comment author/body/time,
  inline reply input (Enter to submit), and a Resolve button. Resolved threads
  show a collapsed count. Also added optional `onSelectionChange` prop to
  `EditorView.tsx` (called before the existing cursor heartbeat throttle, so
  auth-less calls still work). Editor-decoration and @mention autocomplete are
  deferred stretch items. Verified `pnpm typecheck` + www build + `pnpm check`
  clean. Visual browser pass pending human.
- 2026-06-25 — Sonnet — Stage 5 activity feed UI (Task C): added `ActivityButton`
  to the Live Document header in `AppShell.tsx`. Opens a modal listing
  `documents.listActivity` events newest-first (message, actor, time). Activity
  is lazy-loaded only when the modal is open. Notification bell (`listNotifications`)
  requires an authenticated Convex user and returns [] in ?test=1 — noted in the
  UI footer and recorded here per the brief's honest caveat; the bell is deferred
  to an authenticated session. Verified `pnpm typecheck` + www build + `pnpm check`
  clean. Visual browser pass pending human.
- 2026-06-25 — Sonnet — Stage 5 version history UI: added `VersionHistoryButton`
  to the Live Document header in `apps/www`; opens a modal listing all revisions
  (newest first) with date, actor/label, revision number, and markdown preview.
  Restore calls `documents.restoreRevision` (materializes "Before restore" first,
  never mutates history) and closes the modal on success. Verified `pnpm typecheck`
  clean across all 6 TS packages and `pnpm --filter @hubble.md/www build` clean.
  Interactive verification skipped (no live `convex dev` login available).
- 2026-06-25 — Adrian/Claude — Added the **🧭 START HERE handoff block** after
  verifying the tree against the task notes: confirmed the branch is ~25 commits
  ahead of `main` (so "Unmerged" = not-on-`main`, code IS committed), confirmed the
  claimed Convex/CLI APIs exist, ran `pnpm typecheck` clean across all 6 TS
  packages, and documented that `pnpm check` is Biome-only (not a real check).
  Flagged the one uncommitted reconcile chunk as commit-first, the two `[ ]` Stage 6
  tasks (desktop always-on, offline) as Opus/design-shaped not cold pickups, and
  recommended Stage 5 version-history UI as the Sonnet-shaped next task. Corrected
  the "first `[ ]`" pickup rule so it can't misfire. Spec-doc only; no code changed.
- 2026-06-25 — Codex — Continued Stage 4 reconcile permissions: Live Document
  projection queries now include the caller's `role` and `canWrite`, the Convex
  sync backend carries that metadata into projected documents, projection writes
  chmod viewer/commenter files read-only where supported and persist `canWrite` in
  the base cache, and the CLI shim/reconcile commands refuse read-only local-file
  edits before submitting to the server-side `requireDocumentWrite` guard.
  Verified Convex codegen, focused sync/convex-client/CLI builds, `pnpm check`,
  and `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 4 bidirectional reconcile: added scoped
  `replace-range` / `markdown-diff` intents to `documents.applyPatch` that write
  through rebasable ProseMirror transforms, made `writeLiveDocumentProjections`
  persist per-document base markdown + revision metadata in
  `.hubble/state/live-documents`, and added `hubble cloud document reconcile --id
  <documentId> --file <projection.md> [--watch]` to diff projection saves against
  that base cache and update the cache from the merged live result. The staging
  shim now submits scoped `replace-range` patches instead of whole-document
  replacement. Verified
  Convex codegen, focused sync/CLI builds, `pnpm check`, and `pnpm build:desktop`.
- 2026-06-25 — Adrian/Codex — Completed the same-paragraph human retry after the
  cursor fix on document `jn729fmj5ew46ygvykmst9vneh89b0a2`: human typed
  `browser-human` into the target paragraph, a watched-file edit changed that same
  paragraph to `Target paragraph file-human starts here. browser-human`, and both
  Convex plus the browser showed both markers. Watcher logged `reconciled 0 base
  chars -> 11 new chars in 35ms`.
- 2026-06-25 — Codex — Fixed the Live Document cursor-placement/reset issue by
  preventing the shared editor from applying projection-driven `initialMarkdown`
  `setContent` updates when mounted with prosemirror-sync content. Live Documents
  now keep the sync document authoritative under the user's cursor; file-backed
  editor views keep the old external-markdown sync behavior. Verified `pnpm check`,
  focused UI/www typechecks after rebuilding UI declarations, and
  `pnpm build:desktop`.
- 2026-06-25 — Adrian/Codex — Ran a human-assisted same-paragraph check on document
  `jn70mta09x5cfzxqbrdmb2743n89bp3b`. Human typing intended for the shared paragraph
  jumped above the title and to a trailing paragraph, exposing a cursor-placement
  issue in the live editor; a watched-file edit to the intended paragraph still
  reconciled into both Ada/Ben browser tabs and preserved the browser text. Watcher
  logged `reconciled 0 base chars -> 11 new chars in 63ms`.
- 2026-06-25 — Codex — Continued the Stage 1 file-reconcile thesis POC live pass:
  fixed the watcher to emit a minimal changed range after a real browser edit exposed
  `fast-diff` overreach, removed the unused `fast-diff` dependency, and verified two
  browser sessions (`Ada`/`Ben`) on document `jn7784v3ndrpzjdyd685bwqrhd89b1tx`
  observed a watched-file edit from `/tmp/hubble-reconcile-browser-poc.md` while a
  browser edit survived. Browser polling saw the file edit in 95ms after save; the
  watcher logged `reconciled 14 base chars -> 30 new chars in 42ms`. Same-paragraph
  live automation was blocked by editor focus, so the automated same-position smoke
  remains the current evidence there.
- 2026-06-25 — Codex — Built the Stage 1 file-reconcile thesis POC: added
  `prosemirror.reconcileMarkdownRangePoc` to submit external markdown range edits
  through `prosemirrorSync.transform`, added `scripts/reconcile-poc.mjs` using
  `chokidar` against one watched markdown file, and added root POC deps. Automated
  local Convex smoke proved a different-paragraph external edit preserves a
  concurrent live append, same-position insertions merge as `Beta browser file`,
  no-op frontmatter/table content stays unchanged, and the watcher reconciled a real
  file save in 22ms. Browser-visible latency + real in-browser typing while saving
  still need the final two-session pass.
- 2026-06-25 — Adrian — Scoped a **file-reconcile thesis POC** (Decision 6) as a
  gated Stage 1 task: throwaway `scripts/reconcile-poc.mjs` (chokidar + `fast-diff`
  + diff→steps via `prosemirror.transform`), prove conflict-free merge with
  plain text first then one table probe, with explicit cut-list and exit criteria.
  Gates the Stage 4/6 reconcile work; fail-on-merge signals the Yjs/DO fallback.
  Not built yet.
- 2026-06-25 — Adrian — Decided Live Document files are **editable inputs**
  (bidirectional projection, Decision 6): external saves in any app are reconciled
  into the CRDT via base-cache diff → scoped patch, watched by the always-on desktop
  app (tray/background). Revises Model C's read-only projection. Updated PRODUCT.md
  ("Local files as editable inputs"), TECH.md (reconciliation flow + Electron
  lifecycle + "Code changes required"), and DECISIONS.md (Decision 6). Added tasks
  to revise already-written Stage 4/6 + desktop code: scoped diff intent on
  `applyPatch`, generalize the shim into a base-cache reconcile watcher, write a base
  cache from the projection writer, desktop tray/background + main-process watcher,
  and route live-doc external changes to reconcile instead of conflict
  classification. On-disk projection path deferred. No code changed yet.
- 2026-06-25 — Codex — Continued Stage 5 notifications: added backend
  `notifications`, comment-body @mention extraction, mention notification
  creation for matching users, and list/mark-read APIs. Notification delivery UI
  remains pending. Verified `convex codegen`, `pnpm check`, and
  `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 6 docs-parity polish: added trash
  list/restore backend APIs for Live Documents and folders, building on existing
  soft-delete fields. Activity events provide the audit-log substrate;
  admin/role management UI remains pending. Verified `convex codegen`,
  `pnpm check`, and `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 6 docs-parity polish: added targeted
  markdown Live Document export via `hubble cloud document export --id
  <documentId> [--format md] [--out file]`, building on the existing
  workspace-level markdown import/export. PDF/DOCX export and UI remain
  pending. Verified `@hubble.md/cli` typecheck/build, `pnpm check`, and
  `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 6 docs-parity polish: added
  permission-filtered backend cross-document search over Live Document
  title/path/projected markdown with snippets and metadata. Search indexing and
  UI remain pending. Verified `convex codegen`, `pnpm check`, and
  `pnpm build:desktop`.
- 2026-06-25 — Codex — Started Stage 6 docs-parity polish: added folder data
  modeling with optional `documents.folderId`, a `folders` table, and backend
  folder list/create/rename/delete plus document move APIs. Shared-drive
  semantics and UI remain pending. Verified `convex codegen`, `pnpm check`,
  and `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 5 activity feed: added
  `activityEvents`, a `documents.listActivity` query, and activity logging for
  document patches, restores, comments, and suggestion lifecycle events.
  Notification delivery remains pending. Verified `convex codegen`,
  `pnpm check`, and `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 5 review workflow: added an initial
  suggestion review UI in the Live Document header, showing pending suggestions
  in a modal with accept/reject actions backed by the suggestion APIs. Full
  inline track-changes rendering remains pending. Verified `@hubble.md/www`
  typecheck/build, `pnpm check`, and `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 5 review workflow: added backend
  comment thread support with anchored `commentThreads`, `comments`, create,
  reply, list, and resolve APIs with actor attribution. @mention parsing,
  notifications, and UI remain pending. Verified `convex codegen`,
  `pnpm check`, and `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 5 version history: added backend
  `documents.restoreRevision`, restoring a selected revision as a new live
  change after first materializing the current document as "Before restore".
  Browse/restore UI remains pending. Verified `convex codegen`, `pnpm check`,
  and `pnpm build:desktop`.
- 2026-06-25 — Codex — Started Stage 5 version history: added the `revisions`
  table plus manual/list revision APIs and automatic pre-agent-patch snapshots
  storing markdown projection, ProseMirror JSON, revision number, and CRDT
  metadata. Verified `convex codegen`, `pnpm check`, and `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 4 agent collaboration: added backend
  suggestion mode with `documentSuggestions` plus propose/list/accept/reject
  mutations. Accepting suggestions reuses the stale-revision checked
  `applyPatch` transform path; UI review remains for Stage 5. Verified
  `convex codegen`, `pnpm check`, and `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 4 agent collaboration: added a legacy
  file-only shim command, `hubble cloud document shim --id <documentId> --file
  <staging.md> [--watch]`, that converts staging-file writes into
  `documents.applyPatch` replace-document calls against the current live
  revision with `file-shim` attribution. Verified `@hubble.md/cli`
  typecheck/build, `pnpm check`, and `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 4 agent collaboration: added a
  read-only markdown projection writer that materializes Live Documents under
  `.hubble/projections/live-documents` for agent reads, plus `hubble cloud
  project` to refresh the projection tree. Verified `@hubble.md/sync` build,
  `@hubble.md/cli` build, `pnpm check`, and `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 4 agent collaboration: added a `hubble`
  CLI surface for the agent document API with `cloud document get` and
  `cloud document patch` commands supporting replace, append, and
  insert-after-heading intents against a base revision. MCP server remains
  pending. Verified `pnpm check`, `@hubble.md/cli` build, and
  `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 4 agent collaboration: added
  `documents.applyPatch` with stale base-revision rejection and initial
  markdown intents (`replace-document`, `append-markdown`,
  `insert-after-heading`) that convert through the Hubble editor schema and
  stream via `prosemirrorSync.transform` with agent attribution. Verified
  `convex codegen`, `pnpm check`, and `pnpm build:desktop`.
- 2026-06-25 — Codex — Started Stage 4 agent collaboration: added
  `documents.getForAgent` to return a permission-checked live document read
  packet with revision, markdown projection, metadata, and heading outline for
  targeted agent edits. Verified `convex codegen`, `pnpm check`, and
  `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 3 team permissions: added the Live
  Document share dialog with invite-by-email role assignment, direct share
  removal, and public link access controls for viewer/commenter/editor roles.
  Added the supporting `setUserShareByEmail` backend mutation. Verified
  `convex codegen`, `pnpm check`, `@hubble.md/www` typecheck/build, and
  `pnpm build:desktop`; browser smoke skipped because Browser plugin discovery
  exposed no browser-control tool.
- 2026-06-25 — Codex — Continued Stage 3 team permissions: added shared
  workspace/document permission helpers, filtered Live Document reads by role,
  made share APIs owner-only, blocked non-editors from document mutations and
  ProseMirror step/snapshot submission, and guarded legacy sync/assets by
  workspace membership including asset upload/download URL paths. Verified
  `convex codegen`, `pnpm check`, and `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 3 team permissions: added `docShares`
  for per-document user roles and workspace/public link-share roles, seeded
  owner shares on authenticated document create/import, and exposed backend
  share list/set/clear APIs for the upcoming share dialog and enforcement pass.
  Verified `convex codegen`, `pnpm check`, and `pnpm build:desktop`.
- 2026-06-25 — Codex — Continued Stage 3 team permissions: added workspace
  membership data modeling with Convex Auth `users`, workspace `ownerId`, and a
  `members` table keyed by workspace/user. Authenticated workspace creation now
  records the creator as owner while preserving anonymous legacy CLI/test
  workspace creation. Verified `convex codegen`, `pnpm check`, and
  `pnpm build:desktop`.
- 2026-06-25 — Codex — Started Stage 3 team permissions: chose Convex Auth for
  the current Vite/React + Convex stack, added Convex Auth backend setup and
  tables, wired the web app through `ConvexAuthProvider` with an email/password
  sign-in/sign-up gate and toolbar sign-out, resolved Live Document edit actors
  from the authenticated Convex user, and added the missing direct
  `@base-ui/react` app dependency needed when building against rebuilt shared UI
  output. Preserved the `?test=1` POC identity bypass. Verified
  `convex codegen`, `@hubble.md/www` typecheck/build, `pnpm check`,
  `pnpm build:desktop`, and Vite serving `/?test=1`; direct Convex one-shot
  typecheck was blocked by an existing local backend on port 3210.
- 2026-06-25 — Codex — Continued Stage 2 cloud document entities: added
  "Last edited by / at" metadata for Live Documents in the sidebar and live
  editor header, updated metadata from live POC edits/imports/metadata mutations,
  and attributed server-side agent edits as `Agent`. Verified `convex codegen`,
  `@hubble.md/www` typecheck/build, Convex backend typecheck, `pnpm check`,
  `pnpm build:desktop`, and Vite serving `?test=1`; interactive browser smoke was
  blocked by in-app browser startup failure and no local Playwright package.
- 2026-06-25 — Codex — Continued Stage 2 cloud document entities: added explicit
  Live Document import/export APIs in `packages/sync`, wired Convex document
  imports to update the authoritative ProseMirror document rather than the
  legacy `files` table, exposed projected exports, and added `hubble cloud
  import` / `hubble cloud export` CLI commands while leaving legacy whole-file
  sync/watch for non-live workspaces. Verified `convex codegen`, focused package
  typechecks/builds, `pnpm check`, and `pnpm build:desktop`.
- 2026-06-24 — Codex — Continued Stage 2 cloud document entities: added
  one-way markdown projection on read via `documents.getWithMarkdown`, using the
  stable live ProseMirror document ID (`document:<id>`) and the existing Hubble
  markdown serializer. Web document routes now consume the projected read query.
  Verified `convex codegen`, a local Convex HTTP smoke returning projected
  markdown, `@hubble.md/www` build, `pnpm check`, and `pnpm build:desktop`.
- 2026-06-24 — Codex — Continued Stage 2 cloud document entities: added Convex
  document CRUD functions, stable web document routes, a Live Documents sidebar
  section for list/create/rename/delete, and document-mode editor loading using a
  stable ProseMirror sync ID. Verified `convex codegen`, `@hubble.md/www`
  typecheck/build, `pnpm check`, `pnpm build:desktop`, and Vite serving `?test=1`;
  interactive browser smoke was skipped because no Browser tool/Playwright
  dependency was available.
- 2026-06-24 — Codex — Started Stage 2 cloud document entities: added a Convex
  `documents` table with stable `_id`, mutable title/path metadata, audit fields,
  and workspace indexes. Verified `convex codegen`, `pnpm check`, and
  `pnpm build:desktop`.
- 2026-06-24 — Codex — Continued Stage 1 local implementation: added a `?test=1`
  POC collaborator identity gate (`?testUser=...` or prompt), Convex-backed
  `livePocUsers` heartbeat/listing, and a live editor identity bar. Verified
  `pnpm check`, `@hubble.md/www` typecheck/build, `pnpm build:desktop`, and
  Convex `dev --once --typecheck enable`. Browser smoke via the in-app browser
  was blocked by a `node_repl` startup error; HTTP route served from Vite.
- 2026-06-24 — Adrian/Codex — Locally verified Stage 1 two-browser realtime
  editing on `realtime-poc.md` with no conflict banner/file, and verified
  `agentAppendParagraph` streams an agent paragraph live into both browsers.
  Remaining Stage 1 blocker: presence cursors.
- 2026-06-24 — Codex — Implemented the Stage 1 POC presence cursor layer:
  selection heartbeats now write `anchor/head` to Convex, active collaborators are
  rendered as remote caret/selection decorations in the shared editor, and builds
  pass. Remaining: human two-browser visual confirmation.
- 2026-06-24 — Adrian/Codex — Human-verified Stage 1 exit criteria locally:
  simultaneous two-browser editing merged without conflict files, presence cursors
  rendered across browsers, and `agentAppendParagraph` appeared live. Stage stays
  `[~]` until merged.
- 2026-06-24 — Codex — Added realtime-collab `README.md` and `DECISIONS.md` so
  the fork has a self-contained context packet for share-back. `PROGRESS.md`
  remains the implementation pickup source of truth.
- 2026-06-24 — Codex — Documented the authority-model decision: Live Documents
  are cloud-authoritative, while local-only Workspace editing, Plain Folder
  editing, and Loose File editing remain file-authoritative. Added ADR-0009 and
  glossary/spec language.
- 2026-06-24 — Codex — Continued Stage 1 local implementation: ran `pnpm install`,
  generated Convex component API on a local anonymous deployment, added shared
  editor schema export, wired `agentAppendParagraph` transform, and added web
  `useTiptapSync` POC binding. Verified `pnpm check`, `pnpm build:desktop`,
  `@hubble.md/www` typecheck, and Convex `dev --once --typecheck enable`.
  Remaining: live two-browser test, presence strategy, auth identity, and agent
  dashboard proof.
- 2026-06-24 — spike — Stage 1 `prosemirror-sync` spike: gate findings recorded in
  SPIKE.md (server-side agent edits ✅, versioning ✅, auth hooks ✅, Tiptap ✅;
  offline ❌; doc-size + 2-browser ⚠️ unverified). Provisional decision: ADOPT.
  Scaffolded `convex.config.ts`, `prosemirror.ts`, dep in `package.json`. Did NOT
  run `pnpm install`/`convex dev` (interactive) — `prosemirror.ts` won't typecheck
  until then (expected). Next: `pnpm install` + `convex dev`, then wire schema +
  `useTiptapSync`.
- 2026-06-24 — setup — Spec + progress tracker created; fork at
  `adrianricardo/hubble.md` (`origin`), `upstream` → `bholmesdev/hubble.md`.
  Nothing built yet; Stage 1 is next.
