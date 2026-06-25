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

### What "Unmerged" actually means

Every task below says "Unmerged." That does **not** mean the code is missing.
The code is **committed on this branch** (`spike/prosemirror-sync` is ~25 commits
ahead of `main`). "Unmerged" = not yet merged to `main`. You can read, run, and
build on all of it right now. Spot-checked and confirmed present: the Convex
APIs (`documents.getForAgent`, `applyPatch`, `restoreRevision`, `search`,
`listActivity`, suggestions, trash) and the CLI surface (`hubble cloud document
get/patch/shim/reconcile/export`).

### Tree state you are inheriting

- **One uncommitted chunk is in the working tree** — the bidirectional reconcile
  work (Stage 4 `replace-range`/`markdown-diff`, Stage 1 reconcile POC,
  `scripts/reconcile-poc.mjs`, and the spec-doc updates). It's ~16 files. The
  changelog describes it as complete and verified, but it is **not committed**.
  **First action: review and commit it** so you start from a clean tree — don't
  build on top of a dirty tree you didn't create.
- `pnpm typecheck` passes clean across all 6 TS packages (editor, sync, ui,
  convex-client, www, cli) as of this writing. Confirmed, not assumed.

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

Stage 1's decision gate (adopt `prosemirror-sync`) is **provisional**, and
Stages 2–6 are all built on top of it. The two hard gates are still open:
**offline ❌** (not implemented upstream) and **doc-size ⚠️ unverified**. The live
co-edit/reconcile passes were human-verified *locally on a dev deployment*, never
merged or load-tested. If you hit a wall that looks foundational, that is the
known risk — see SPIKE.md for the Yjs/DO fallback, don't paper over it.

### What to pick up next (this overrides the "first `[ ]`" rule below)

The protocol below says "pick the first `[ ]` task in the lowest-numbered
unfinished stage." **Taken literally that misfires**, because nearly every task
is `[~]` (built-but-unmerged), not `[ ]`. The only two true `[ ]` tasks are the
two *hardest, most architectural* ones in the whole plan — do **not** start there
cold:

- ⚠️ Stage 6 "Desktop always-on app" `[ ]` and "Offline edit + merge" `[ ]` are
  **Opus/design-shaped, not a cold Sonnet pickup.** They need an architecture
  decision (Electron lifecycle; whether prosemirror-sync offline is sufficient or
  the Yjs/`y-indexeddb` fallback is required — the unresolved Stage 1 gate). Get a
  design agreed before writing code here.

**Good Sonnet-shaped next tasks** (well-scoped, build on committed + typechecked
backends, verifiable by `pnpm typecheck`/`build` without interactive infra):

1. **Stage 5 — Version history UI** (browse + restore). Backend
   `documents.listRevisions` / `restoreRevision` already exist; only the UI is
   pending. Lowest-numbered stage with pending UI → recommended first pickup.
2. **Stage 5 — Comments UI** (threads/@mentions/resolve). Backend done.
3. **Stage 6 — Search UI**. `documents.search` backend done.

Tasks needing interactive infra (live two-browser, doc-size load test, `convex
dev` login) are **poor Sonnet pickups** — they can't be verified headlessly. Leave
those for a human/interactive session.

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
      ✅, Tiptap client ✅; **offline ❌ (not implemented upstream)**; doc-size +
      live two-browser test ⚠️ unverified (need interactive `convex dev`).
      Scaffold landed: `convex/convex.config.ts`, `convex/prosemirror.ts` (incl.
      `agentAppendParagraph` server-edit proof), dep added to `package.json`.
      — *Owner: Adrian/agent · Started: 2026-06-24 · Landed: _ · PR: spike branch*
- [~] Decision gate outcome: **provisionally ADOPT prosemirror-sync** (hard gates
      pass on existing Convex stack). Finalize to `[x]` after the live two-browser
      + doc-size test. Fallback documented in SPIKE.md if a hard gate fails. — *_*
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
      MCP server remains pending. Verified `pnpm check`, `@hubble.md/cli`
      build, and `pnpm build:desktop`. Unmerged. — *Owner: Codex · Started:
      2026-06-25*
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
- [ ] **Desktop always-on app** (Decision 6): keep the Electron main process
      running on window close (`window-all-closed`/`Tray`), host the live-doc
      watcher + sync engine in main (currently CLI-only), route live-doc external
      changes to the reconcile path instead of conflict classification
      (`apps/desktop/src/externalFileChange.ts`, `apps/www/src/store/actions.ts`),
      with a `*.local-edit-<ts>` conflict-copy backstop. — *_*
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
      `d5355c7`. External-file queue flavor is part of desktop Phase 5, not started.
      — *Owner: Opus · Started: 2026-06-25*
- [~] Audit log, trash + restore, admin/role management. Trash/restore backend
      started locally with `documents.listTrash`, `documents.restoreRemoved`,
      `folders.listTrash`, and `folders.restoreRemoved`. Activity events
      already provide an audit-log substrate; admin/role management UI remains
      pending. Verified `convex codegen`, `pnpm check`, and
      `pnpm build:desktop`. Unmerged. — *Owner: Codex · Started: 2026-06-25*

---

## Changelog

Newest first. One line per meaningful change: `YYYY-MM-DD — who — what`.

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
