# Realtime Collaboration — Progress Tracker

**This is the single source of truth for where implementation stands.**
Next agents can start here and continue the first unfinished task in the lowest
numbered incomplete stage.

For the share-back packet around the fork, this folder is self-contained:
`README.md` gives the overview, `PRODUCT.md` gives the product direction,
`TECH.md` gives the architecture, `DECISIONS.md` gives the decision log and
reasoning, and `SPIKE.md` gives the prosemirror-sync spike findings.

---

## 🔴🟡🟢 How agents read & update this file

**Before starting work**, read this whole file top to bottom. Pick up the
first task that is `[ ]` (not started) within the lowest-numbered stage that
isn't `🟢 Done` — stages are ordered and later stages assume earlier ones.

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
| 6. Docs-parity polish | 🔴 Not started | Folders, search, export/import, offline, admin |

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
      updates document attribution. Browse/restore UI remains pending. Verified
      `convex codegen`, `pnpm check`, and `pnpm build:desktop`. Unmerged. —
      *Owner: Codex · Started: 2026-06-25*
- [~] Comments + threads anchored to text, @mentions, resolve. Backend
      substrate implemented locally with `commentThreads` and `comments` tables,
      anchored thread creation, replies, listing, and resolve mutation with
      actor attribution. @mention parsing/notifications and UI remain pending.
      Verified `convex codegen`, `pnpm check`, and `pnpm build:desktop`.
      Unmerged. — *Owner: Codex · Started: 2026-06-25*
- [ ] Track-changes / suggestion review UI. — *_*
- [ ] Activity feed + notifications. — *_*

## Stage 6 — Docs-parity polish 🔴

- [ ] Folders / shared drives. — *_*
- [ ] Cross-document search. — *_*
- [ ] Export (md/PDF/docx) + import. — *_*
- [ ] Offline edit + merge on reconnect. — *_*
- [ ] Audit log, trash + restore, admin/role management. — *_*

---

## Changelog

Newest first. One line per meaningful change: `YYYY-MM-DD — who — what`.

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
