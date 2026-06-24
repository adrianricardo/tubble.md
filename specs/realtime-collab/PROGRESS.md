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
| 1. Realtime editing POC | 🟢 Done | Merged Stage 1 POC: conflict-free two-browser editing, presence cursors, and live agent edits verified. |
| 2. Documents as cloud entities | 🟡 In progress | Stable doc IDs started; doc CRUD, markdown projection next |
| 3. Team permissions | 🔴 Not started | Users, members, per-doc roles, sharing |
| 4. Agent collaboration (Model C) | 🔴 Not started | Doc patch API + MCP/CLI, projection, legacy shim |
| 5. Version history & review | 🔴 Not started | Revisions + restore, comments, suggestions |
| 6. Docs-parity polish | 🔴 Not started | Folders, search, export/import, offline, admin |

---

## Stage 1 — Realtime editing POC 🟢

Goal: two authenticated humans co-edit one document live, conflict-free, with
presence cursors. **Resolves the `prosemirror-sync` decision gate (TECH.md).**

- [x] **Spike `@convex-dev/prosemirror-sync`** against the decision gate. Findings
      in **`SPIKE.md`**: server-side agent edits ✅, versioning hooks ✅, auth hooks
      ✅, Tiptap client ✅; **offline ❌ (not implemented upstream)**.
      Live two-browser editing, presence, and server-side agent edits were
      verified locally before merge.
      Scaffold landed: `convex/convex.config.ts`, `convex/prosemirror.ts` (incl.
      `agentAppendParagraph` server-edit proof), dep added to `package.json`.
      — *Owner: Adrian/agent · Started: 2026-06-24 · Landed: 2026-06-24 · PR:
      https://github.com/adrianricardo/hubble.md/pull/1*
- [x] Decision gate outcome: **ADOPT prosemirror-sync** for the next stages
      (hard gates pass on existing Convex stack). Fallback documented in SPIKE.md
      if a later hard requirement fails. — *Owner: Adrian/Codex · Started:
      2026-06-24 · Landed: 2026-06-24 · PR:
      https://github.com/adrianricardo/hubble.md/pull/1*
- [x] Run `pnpm install` + `convex dev` (interactive login) to generate the
      component API so `prosemirror.ts` typechecks. Local anonymous deployment
      generated; `convex dev --once --typecheck enable` passes. — *Owner:
      Codex · Started: 2026-06-24 · Landed: 2026-06-24 · PR:
      https://github.com/adrianricardo/hubble.md/pull/1*
- [x] Export the editor ProseMirror schema from `packages/editor` and wire the
      `transform()` body in `agentAppendParagraph`. Implemented locally with
      shared schema helper; `agentAppendParagraph` now calls
      `prosemirrorSync.transform`. — *Owner: Codex · Started: 2026-06-24 ·
      Landed: 2026-06-24 · PR:
      https://github.com/adrianricardo/hubble.md/pull/1*
- [x] Add the collaboration binding (`useTiptapSync`) to the Tiptap editor
      (`packages/ui` / `apps/www`). Implemented locally for web POC docs behind
      `ConvexProvider` and scoped to the `?test=1` POC identity path. — *Owner:
      Codex · Started: 2026-06-24 · Landed: 2026-06-24 · PR:
      https://github.com/adrianricardo/hubble.md/pull/1*
- [x] Auth-gate the web app enough to identify two distinct users for the POC.
      Implemented locally as a browser-scoped test identity gate for `?test=1`
      (`?testUser=Ada` or in-app prompt) plus a Convex `livePocUsers` heartbeat
      so two browser sessions can identify themselves on one POC doc. This is
      intentionally not the Stage 3 production auth provider. Verified `pnpm
      check`, `@hubble.md/www` typecheck/build, `pnpm build:desktop`, and
      `convex dev --once --typecheck enable`; in-app browser smoke was blocked by
      browser runtime startup failure. — *Owner: Codex · Started: 2026-06-24 ·
      Landed: 2026-06-24 · PR:
      https://github.com/adrianricardo/hubble.md/pull/1*
- [x] One shared document renders live for two browsers; concurrent edits merge
      with no conflict file. Locally verified by human test on `realtime-poc.md`
      with two browser identities; no conflict banner/file appeared. — *Owner:
      Adrian/Codex · Started: 2026-06-24 · Landed: 2026-06-24 · PR:
      https://github.com/adrianricardo/hubble.md/pull/1*
- [x] Presence cursors (who's here, where their caret is). Implemented locally as
      a Convex-backed POC cursor layer: `livePocUsers` now stores optional
      ProseMirror `anchor/head`, the web editor publishes throttled selection
      heartbeats, and `packages/ui` renders remote cursor/selection
      decorations. Locally human-verified in two browsers. Verified `pnpm
      check`, UI/www typechecks, `@hubble.md/www` build, and `pnpm
      build:desktop`; Convex one-shot typecheck was skipped because the local
      backend was already running on port 3210. — *Owner: Codex · Started:
      2026-06-24 · Landed: 2026-06-24 · PR:
      https://github.com/adrianricardo/hubble.md/pull/1*
- [x] Confirm agent edit (`agentAppendParagraph` from the Convex dashboard) appears
      live in both browsers. Locally verified via Convex CLI against
      `poc:jd72rs2kfn4gj8yeavk2m05ccs899r3t:realtime-poc.md`; both browser
      sessions updated live. — *Owner: Adrian/Codex · Started: 2026-06-24 ·
      Landed: 2026-06-24 · PR:
      https://github.com/adrianricardo/hubble.md/pull/1*
- [x] **Exit criteria:** two browsers, simultaneous typing, conflict-free, cursors
      visible, agent edit shows live. Locally human-verified on
      `realtime-poc.md`; demoable from local Convex + web dev servers. — *Owner:
      Adrian/Codex · Started: 2026-06-24 · Landed: 2026-06-24 · PR:
      https://github.com/adrianricardo/hubble.md/pull/1*

## Stage 2 — Documents as cloud entities 🟡

- [x] `documents` table with **stable IDs**; path/title become mutable metadata.
      Added Convex `documents` table using Convex `_id` as the stable document ID,
      with mutable `title`, optional `path`, created/updated metadata, soft-delete
      timestamp, and workspace indexes. — *Owner: Codex · Started: 2026-06-24 ·
      Landed: 2026-06-24 · PR:
      https://github.com/adrianricardo/hubble.md/pull/2*
- [x] Document CRUD (list/create/rename/delete) in the web app. Added Convex
      `listDocumentsByWorkspace`, `createDocument`, `renameDocument`, and
      `deleteDocument` functions plus a compact Live Documents sidebar panel for
      web create/rename/delete. — *Owner: Codex · Started: 2026-06-24 · Landed:
      2026-06-24 · PR: https://github.com/adrianricardo/hubble.md/pull/3*
- [x] One-way markdown **projection on read** (doc → markdown). Added
      `prosemirror.getMarkdownProjection(docId)` to read the authoritative
      ProseMirror document via `prosemirror-sync.getDoc` and return markdown from
      Hubble's existing `tiptapDocToMarkdown` converter. Exposed as a read-only
      mutation because the upstream component requires a mutation-capable context.
      — *Owner: Codex · Started: 2026-06-24 · Landed: 2026-06-24 · PR:
      https://github.com/adrianricardo/hubble.md/pull/4*
- [~] Migrate the whole-file sync path (`packages/sync`) to an import/export role.
      Added explicit `importLiveDocumentFromMarkdown` and
      `exportLiveDocumentToMarkdown` package APIs plus Convex-backed Live Document
      import/export methods. The existing `sync()` path remains file-authoritative
      for non-Live-Document workspaces; Live Documents now have named
      import/export bridges instead of ambient whole-file authority. Unmerged. —
      *Owner: Codex · Started: 2026-06-24*
- [ ] "Last edited by / at" on documents. — *_*

## Stage 3 — Team permissions 🔴

- [ ] Auth provider chosen + wired (Convex Auth / Clerk / WorkOS). — *_*
- [ ] `users`, `members` (workspace membership) tables. — *_*
- [ ] `docShares`: per-document roles (owner/editor/commenter/viewer) + link sharing. — *_*
- [ ] **Server-side enforcement on every query/mutation** — a viewer never receives
      editable steps. — *_*
- [ ] Share dialog UI. — *_*

## Stage 4 — Agent collaboration layer (Model C) 🔴

- [ ] `getDocument(id) → { revision, markdown, outline }` (outline enables targeted,
      token-efficient edits). — *_*
- [ ] `applyPatch(id, baseRevision, intent)` → steps → CRDT txn, **attributed to the
      agent**, streamed; rebase/reject if `baseRevision` is stale. — *_*
- [ ] MCP server + `hubble` CLI surface for the patch API. — *_*
- [ ] Read-only markdown projection writer on disk. — *_*
- [ ] Legacy file-only **shim**: staging file → `applyPatch(markdown-patch)`. — *_*
- [ ] Suggestion mode (agent proposes, human accepts). — *_*

## Stage 5 — Version history & review 🔴

- [ ] `revisions` table: `{ documentId, createdAt, actor, label?, pmDoc, markdown,
      crdtMeta }`, materialized on boundaries + before restore. — *_*
- [ ] Version history UI: browse + **restore as a new change** (never mutate history). — *_*
- [ ] Comments + threads anchored to text, @mentions, resolve. — *_*
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

- 2026-06-24 — Codex — Started migrating whole-file sync toward an import/export
  role for Live Documents: added explicit sync package APIs and Convex client
  methods for markdown import/export while leaving ordinary file-authoritative
  workspace sync unchanged. Kept the task `[~]` until this branch is merged and
  verified.
- 2026-06-24 — Codex — Merged Stage 2 markdown projection PR #4 and marked the
  one-way doc-to-markdown projection task complete with PR
  https://github.com/adrianricardo/hubble.md/pull/4.
- 2026-06-24 — Codex — Started Stage 2 markdown projection: added a read-only
  `getMarkdownProjection(docId)` Convex mutation that projects the authoritative
  ProseMirror document to markdown with Hubble's existing converter. Kept the
  task `[~]` until this branch is merged and verified.
- 2026-06-24 — Codex — Merged Stage 2 Document CRUD PR #3 and marked the web
  list/create/rename/delete task complete with PR
  https://github.com/adrianricardo/hubble.md/pull/3.
- 2026-06-24 — Codex — Started Stage 2 Document CRUD: added Convex document
  list/create/rename/delete functions and a web sidebar Live Documents panel.
  Kept the task `[~]` until this branch is merged and verified.
- 2026-06-24 — Codex — Merged Stage 2 documents-table PR #2 and marked the
  stable-ID `documents` table task complete with PR
  https://github.com/adrianricardo/hubble.md/pull/2.
- 2026-06-24 — Codex — Started Stage 2: added the Convex `documents` table with
  stable Convex IDs and mutable title/path metadata. Kept the task `[~]` until
  this branch is merged and verified.
- 2026-06-24 — Codex — Merged Stage 1 PR #1 and marked Realtime editing POC
  complete: all Stage 1 tasks now record Landed `2026-06-24` and PR
  https://github.com/adrianricardo/hubble.md/pull/1.
- 2026-06-24 — Codex — Reviewed Stage 1 PR diff and scoped the live
  `useTiptapSync` editor to the `?test=1` POC identity path, preserving normal
  web file-backed editing outside the spike harness. Verified `pnpm check`,
  `pnpm --filter @hubble.md/www... --if-present build`, and
  `pnpm --filter @hubble.md/www typecheck`.
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
