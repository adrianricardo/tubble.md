# Desktop Cloud-First IA Plan

Planned 2026-07-01 via `/organize` + `/orchestrate`.

## Goal

Make the desktop app match the web app's cloud-first product hierarchy:

1. Hubble is a workspace/document product first.
2. Live Documents are the primary object.
3. A local folder is optional infrastructure for manual file editing, backup, grep,
   and agent/tool access.
4. Local Markdown files remain useful, but they should not define the whole desktop
   information architecture when cloud collaboration is configured.

## Non-goals

- Do not remove local-only folder editing.
- Do not redesign the editor canvas or rich-text collaboration internals.
- Do not change the synced-folder reconciliation model.
- Do not add new backend document primitives unless implementation discovers a
  missing query/mutation that is already implied by the current web surface.

## Context

The web app already presents Hubble as a cloud workspace and Live Document product:
dashboard header, global Live Document search, recents, private/team workspaces,
and shared documents.

The desktop app still reads as a local folder editor: first-run copy says to pick a
folder, the sidebar is a local file tree, the toolbar title is file-path centered,
and cloud collaboration appears mostly through Settings/Cloud Sync and callouts.

Product direction from `PRODUCT.md` and `TECH.md`: Live Documents are
cloud-authoritative. Local files are editable projections/inputs that support
external editors and agents, not the primary authority for collaborative documents.

## Route: Phased

This is **not** a good delegated split yet.

Routing reasons:

- Shared read/write surface is small and coupled: `apps/desktop/src/App.tsx`,
  desktop sidebar/toolbar/welcome/settings components, desktop state/actions, and
  the existing web dashboard/sidebar patterns.
- One blocking IA decision drives all work: local folder is optional and secondary
  when cloud is available.
- The phases build on each other. Sidebar labels, empty states, toolbar actions,
  and Settings copy should converge on one vocabulary.
- Cold parallel agents would reread the same files and risk creating competing
  hierarchy choices.

Use one orchestrator/session for implementation. Delegate only later if a phase
becomes a clearly independent mechanical pass, such as copy-only label cleanup.

## Target Information Architecture

Desktop should present this hierarchy when `VITE_CONVEX_URL` / desktop Convex is
configured:

```text
Hubble
Workspace
Live documents
Local files / synced folder
System notices
```

Local-only mode keeps the existing folder/file hierarchy, but labels should make it
clear that this is local-only editing rather than the whole Hubble product model.

## Phase Table

| Phase | Scope | Tier | Depends on | Output / handoff |
|---|---|---|---|---|
| P1 IA inventory + state model | Confirm current desktop cloud auth, workspace, synced-folder, and local-folder states. Decide exact mode labels and empty-state matrix. | standard | - | Short implementation notes in this plan's Handoff. |
| P2 Desktop workspace home | Replace the workspace-open/no-document center state with a cloud-first home: Live Documents first, local files second, synced-folder status below. Keep local-only fallback. | standard | P1 | A desktop landing state that mirrors web dashboard hierarchy without adding marketing copy. |
| P3 Sidebar hierarchy | Reorder desktop sidebar to show workspace identity, Live Documents, then Local Files/Synced Folder, with update/product notices in the footer. | standard | P1 | Sidebar makes Live Documents first-class on desktop. |
| P4 Toolbar and primary actions | Make creation/actions context-aware: New Live Document in cloud workspaces, New Markdown File in local-only mode, file path actions in overflow. | standard | P2, P3 | Toolbar no longer over-prioritizes local files in cloud mode. |
| P5 Settings/onboarding label pass | Rename user-facing desktop copy to consistently distinguish Workspace, Live Documents, Synced Folder, and Local Files. | economy | P2-P4 | Copy aligns with the new IA. |
| P6 Verification and polish | Run focused type/build checks and smoke web + desktop hierarchy in running apps. | standard | P2-P5 | Verified plan completion with screenshots/manual notes if browser tooling works. |

## Implementation Notes

- Prefer reusing existing shared UI primitives from `@hubble.md/ui`.
- Reuse web concepts where possible, but do not blindly copy web layout into
  desktop. Desktop still needs native affordances: titlebar drag region, traffic
  light inset, reveal in Finder, copy path, local rename, and local folder actions.
- Keep local folder actions available, but group them under "Local files" or
  "Synced folder" so users understand why they are there.
- If cloud auth is unavailable or `desktopConvexUrl` is unset, desktop should fall
  back to local-only hierarchy without showing broken Live Document affordances.
- Avoid a large dashboard clone inside desktop. The first milestone should be
  hierarchy parity, not feature parity with every web dashboard card.

## Acceptance Criteria

- Desktop first-run and empty-workspace states do not imply that choosing a local
  folder is required for normal cloud document editing.
- In cloud-capable desktop mode, Live Documents appear before local files in the
  main navigation hierarchy.
- Local folder/synced-folder UI is described as optional support for external
  editors, manual file access, and agents.
- Primary creation action creates a Live Document in cloud workspace context.
- Local-only users can still open folders, browse files, create Markdown files, and
  use file actions.
- Web app hierarchy remains unchanged unless a shared UI change requires a small
  alignment fix.
- Checks: `pnpm --filter @hubble.md/desktop typecheck` if available, otherwise
  relevant desktop `tsc`; `pnpm build:desktop`; and a manual desktop/web smoke.

## Progress

| ID | Status | Owner/session | Last update | Notes |
|----|--------|---------------|-------------|-------|
| P1 | done | Codex | 2026-07-01 | Desktop renderer shell is local-state based; cloud APIs can support IA without backend changes. |
| P2 | done | Codex | 2026-07-01 | Empty desktop shell now shows cloud-first Live Documents home when Convex is configured. |
| P3 | done | Codex | 2026-07-01 | Sidebar now puts Live Documents above local file/synced-folder browsing in cloud-capable builds. |
| P4 | done | Codex | 2026-07-01 | Toolbar and Cmd/Ctrl+N create Live Documents for signed-in cloud users, Markdown files otherwise. |
| P5 | done | Codex | 2026-07-01 | Desktop first-run/sidebar copy distinguishes Live Documents, local folders, and synced-folder support. |
| P6 | done | Codex | 2026-07-01 | `pnpm build:desktop`, focused Biome, and Electron CDP smoke passed. |

Status values: pending, in-progress, blocked, done.

## Handoff

Current state:

- Implemented. Desktop now presents a cloud-first Live Documents home and sidebar
  section when `VITE_CONVEX_URL` is configured. Local folders remain available and
  are described as local Markdown/synced-folder support for external editors,
  backup, grep, and agents.
- The toolbar `+` and Cmd/Ctrl+N create a Live Document for authenticated cloud
  users. In unauthenticated/local-only contexts they continue to create local
  Markdown files.
- Selecting a Live Document in the desktop sidebar opens a matching local
  projection when a synced folder has materialized it; otherwise the UI prompts
  the user to connect a synced folder. Native desktop live-CRDT editing remains
  out of scope for this IA slice.

Next step:

- Optional follow-up: add a dedicated desktop Live Document route/editor if product
  decides desktop should edit cloud documents directly instead of through synced
  Markdown projections.

Files changed:

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/Sidebar.tsx`
- `apps/desktop/src/components/Toolbar.tsx`
- `apps/desktop/src/components/WelcomeScreen.tsx`
- `packages/ui/src/components/Sidebar.tsx`
- `specs/realtime-collab/DESKTOP-CLOUD-FIRST-IA.plan.md`

Checks run:

- `pnpm exec biome check apps/desktop/src/App.tsx apps/desktop/src/components/Sidebar.tsx apps/desktop/src/components/Toolbar.tsx apps/desktop/src/components/WelcomeScreen.tsx packages/ui/src/components/Sidebar.tsx specs/realtime-collab/DESKTOP-CLOUD-FIRST-IA.plan.md`
- `pnpm build:desktop`
- `HUBBLE_DESKTOP_ENABLE_CDP=1 pnpm dev:desktop`; CDP inspection confirmed the
  renderer exposed `New Live Document` as the primary create action and showed the
  Live Documents sidebar section above the local playground file tree. Dev process
  was stopped afterward.

Open questions:

- Desktop still does not have a native live-CRDT document route; this pass exposes
  Live Documents as primary IA and creation objects, with local synced projections
  as the edit path.
