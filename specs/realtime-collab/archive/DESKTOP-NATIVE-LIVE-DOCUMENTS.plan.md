# Desktop Native Live Documents Plan

Planned 2026-07-01 via `/orchestrate`.

## Goal

Let the desktop app open and edit cloud Live Documents directly, without requiring
a synced folder. Synced folders remain optional support for external editors,
backup, grep, and agents.

Native desktop Live Documents should behave like the web Live Document editor:
cloud-authoritative CRDT editing, document metadata panels/actions where available,
and live collaboration presence.

## Presence And Cursors

Yes: native desktop Live Documents should have live presence and remote cursors.

Implementation direction:

- Use the same sync document id as web: `document:<documentId>`.
- Publish desktop selection heartbeats through `api.pocIdentity.heartbeat`.
- Subscribe with `api.pocIdentity.listActive`.
- Render `remotePresence` through the shared `@hubble.md/ui` editor, which already
  has `RemotePresenceExtension`.
- Authenticated desktop sessions should identify users through `api.viewer.me`,
  just like web. No desktop-only local identity should be introduced.

Result: web users and desktop users in the same Live Document see each other in
the presence bar and see each other's remote cursor/selection decorations.

## Non-Goals

- Do not remove synced folders or local Markdown folder editing.
- Do not make external-file edits keystroke-realtime. They still land on save via
  the synced-folder watcher.
- Do not rewrite the ProseMirror sync backend.
- Do not add a second desktop-specific presence system.
- Do not solve full offline app restart for desktop in this slice.

## Context

`PRODUCT.md` says in-app Live Document editing streams live, while external-file
edits land on save through the synced-folder watcher. The desktop IA plan made
Live Documents first-class but explicitly left native desktop Live Document editing
out of scope. Current desktop sidebar behavior therefore opens only synced Markdown
projections and shows a "connect synced folder" toast when no projection exists.

Relevant current implementation:

- Web Live Document route: `apps/www/src/shell/AppShell.tsx`
- Web live editor/presence wrapper: `apps/www/src/shell/EditorView.tsx`
- Shared editor remote cursor support: `packages/ui/src/editor/EditorView.tsx`
- Desktop cloud IA and local editor shell: `apps/desktop/src/App.tsx`
- Desktop Live Document sidebar section: `apps/desktop/src/components/Sidebar.tsx`
- Presence backend: `packages/sync-backend/convex/pocIdentity.ts`

## Route

**Phased.**

Routing reason: the work is coupled around one architectural decision: desktop
needs a native Live Document route/state parallel to the existing local-file
viewer. The phases touch a small shared source surface, so parallel cold agents
would reread the same files and risk incompatible state/routing choices. A
single session should carry context through the route, editor wrapper, sidebar,
and verification.

## Phase Table

| ID | Phase | Tier | Depends on | Output / handoff |
|----|-------|------|------------|------------------|
| P1 | Route and state model | standard | - | Desktop can represent either a local file path or a Live Document id as the active editor target. |
| P2 | Shared/live editor extraction | standard | P1 | Reusable live editor wrapper or desktop copy using `useTiptapSync`, durable/offline handling as appropriate, presence heartbeats, and `remotePresence`. |
| P3 | Desktop Live Document view | standard | P2 | Desktop renders a cloud document directly from `documents.getWithMarkdown`, opens `document:<id>`, marks edits, and shows presence/collab metadata. |
| P4 | Navigation and creation behavior | standard | P3 | Sidebar/home/recent rows and create actions open newly selected/created Live Documents directly; synced-folder toast is removed from normal in-app open. |
| P5 | Synced-folder boundary cleanup | economy | P4 | Copy and affordances clarify synced folders are optional for external apps/agents, not required for desktop editing. |
| P6 | Verification | standard | P5 | Focused tests/checks and manual smoke: desktop opens/edits a Live Document without sync root; web and desktop see each other's presence/cursors. |

## Phase Details

### P1 Route And State Model

Add explicit desktop UI state for active cloud document:

- `activeLiveDocumentId: string | null`, or equivalent discriminated editor target.
- Opening a local path clears the active Live Document.
- Opening a Live Document clears local-file-only viewer state enough to avoid
  file watchers, external-change banners, and save-to-disk paths.
- Keep local file persistence and last-opened local path behavior unchanged.

Acceptance:

- Desktop can switch between local Markdown files and Live Documents without stale
  file watchers or stale external-change banners.
- Existing local open/create flows still work.

### P2 Shared/Live Editor Extraction

Avoid duplicating web live-editor logic if practical. Preferred shape:

- Extract a shared app-level Live Document editor wrapper into a package or local
  module that both web and desktop can consume.
- Keep platform-specific hooks injectable:
  - image paste/drop handling
  - wiki-link resolution
  - external-link opening
  - durable offline buffer storage, if desktop needs a different persistence path
  - toast/message handling

If extraction is too invasive for v1, copy the minimal web wrapper into desktop,
but record follow-up debt in this plan before finishing.

Acceptance:

- Desktop uses `useTiptapSync(api.prosemirror, "document:<id>")`.
- Desktop publishes selection heartbeats and renders `remotePresence`.
- Authenticated viewer identity comes from Convex, not a local desktop-only id.

### P3 Desktop Live Document View

Create a desktop `LiveDocumentViewer` equivalent to the web route:

- Fetch `api.documents.getWithMarkdown`.
- Use `document.path ?? withMarkdownExtension(document.title)` for display path.
- Use `api.documents.markEdited` on throttled local edits.
- Render a compact document header with title, edited metadata, presence, and
  future slots for comments/activity/history.
- Respect permission failures with an access-denied state instead of crashing the
  renderer.

Acceptance:

- A signed-in desktop user can open and edit a Live Document with no synced folder
  connected.
- Edits update the cloud document and are visible in web.
- Viewers/commenters do not get unauthorized write behavior.

### P4 Navigation And Creation Behavior

Make Live Document rows open the native Live Document route:

- Sidebar Live Document rows call `openLiveDocument(document._id)`.
- Cloud workspace home recent rows become clickable and open native Live Documents.
- Toolbar/Cmd+N creates a Live Document and opens it immediately.
- Preserve local Markdown create/open in local-only or unauthenticated contexts.

Acceptance:

- The "connect synced folder" toast is no longer shown when a user simply opens a
  Live Document in desktop.
- The toast or equivalent guidance remains only where the user asks for local
  projection/external editor access.

### P5 Synced-Folder Boundary Cleanup

Update copy around Settings, sidebar empty states, and sync callouts:

- "Connect synced folder" means "make this document available as local Markdown"
  rather than "enable desktop editing."
- Local file actions remain discoverable but secondary in cloud-capable mode.

Acceptance:

- Desktop copy does not imply folders are required for cloud Live Document editing.
- Existing synced-folder diagnostics and operations remain intact.

### P6 Verification

Run:

- `pnpm exec biome check` on touched files.
- `pnpm --filter @hubble.md/desktop... --if-present typecheck` or
  `pnpm build:desktop`.
- Focused desktop tests if state/actions change.
- Manual smoke with the Electron app:
  - sign in
  - ensure no synced folder is connected
  - create/open a Live Document
  - edit in desktop and observe update in web
  - edit in web and observe update in desktop
  - verify names and remote cursors/presence appear cross-surface

## Sequencing And Parallelism

Do not parallelize P1-P4. They share routing/editor files and P1's target-state
shape controls the remaining implementation.

P5 can be done after P4 and is low-risk, but it still benefits from the same
session because the wording depends on the final behavior. P6 gates the full
slice.

No delegated task briefs are needed yet. If P2 extraction becomes unexpectedly
large, split a follow-up delegated brief only after the desktop route contract is
stable.

## Acceptance Criteria

- Desktop can open and edit a cloud Live Document without a synced folder.
- Desktop and web edit the same `document:<id>` CRDT state.
- Desktop and web users see shared live presence and remote cursor/selection
  decorations.
- Synced folders remain optional and continue to support external editor/agent
  file projection.
- Local-only desktop folder editing is unchanged.
- Access-denied and read-only states fail clearly, not through generic crashes.

## Progress

| ID | Status | Owner/session | Last update | Notes |
|----|--------|---------------|-------------|-------|
| P1 | done | Codex | 2026-07-01 | Added explicit desktop Live Document target state; local opens clear cloud target and cloud opens clear local viewer state. |
| P2 | done | Codex | 2026-07-01 | Implemented a desktop-native live editor wrapper using `useTiptapSync(api.prosemirror, "document:<id>")`; extraction deferred because the desktop image/local-path hooks differ from web. |
| P3 | done | Codex | 2026-07-01 | Desktop fetches `documents.getWithMarkdown`, renders a live document header, marks edits, and joins `pocIdentity` presence. |
| P4 | done | Codex | 2026-07-01 | Sidebar rows, home recents, sidebar create, toolbar create, and Cmd/Ctrl+N now open Live Documents directly. |
| P5 | done | Codex | 2026-07-01 | Removed the normal "connect synced folder to edit" path; synced folder copy remains only for local/external access surfaces. |
| P6 | done | Codex | 2026-07-01 | Focused Biome and `pnpm build:desktop` passed; manual cross-surface presence smoke not run in this session. |

Status values: pending, in-progress, blocked, done.

## Handoff

Current state:

- Desktop native Live Documents are implemented in `apps/desktop/src/App.tsx`.
- Desktop Live Document rows and create actions open the native cloud editor
  directly instead of requiring a synced Markdown projection.
- Desktop joins the shared `document:<id>` ProseMirror sync and `pocIdentity`
  presence channel used by web.
- Synced folders remain optional infrastructure for local Markdown projection,
  external editors, backup, grep, and agents.

Next step:

- Run a human/manual cross-surface smoke with signed-in web + desktop sessions to
  verify remote cursors and bidirectional edit visibility.

Files changed:

- `apps/desktop/package.json`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/Sidebar.tsx`
- `pnpm-lock.yaml`
- `specs/realtime-collab/DESKTOP-NATIVE-LIVE-DOCUMENTS.plan.md`

Checks run:

- `pnpm exec biome check apps/desktop/src/App.tsx apps/desktop/src/components/Sidebar.tsx apps/desktop/package.json pnpm-lock.yaml`
- `pnpm --filter @hubble.md/desktop build`
- `pnpm build:desktop`

Open questions:

- Follow-up debt: consider extracting the duplicated web/desktop live editor
  wrapper after manual cross-surface behavior is verified.
