# Ready-to-Deploy Plan — Synced Folder + Realtime Collab

> **Peer-reviewed** by Codex (`gpt-5.5`), 2026-06-26 — corrections applied: RD2 now
> depends on RD3 (schema must land on hosted Convex first); RD9 release depends on the
> gates + security + merge (RD5/RD6/RD8/RD10), not just RD1/RD4; RD10 includes RD1+RD2
> since full production ships reactive sync + shared-with-me; RD12 (MCP) moved to
> post-launch follow-up and remains standard-tier work if/when picked up.

**Goal (locked 2026-06-26): full production** — hosted Convex deployment, real auth,
merged onto fork `main` behind a flag, the open Stage-1 gates closed (offline +
doc-size), security-reviewed, monitored, and a packaged desktop release.

**Precondition:** `READY-TO-TEST.plan.md` slices landed and the human end-to-end
test passed. Several slices below are **gated on what that test reveals** — treat
this as a tiered roadmap; expand a slice's brief to a full `tasks/` file when its
phase starts (some are spikes whose decomposition isn't knowable yet).

This plan covers the realtime-collab feature as a whole (not just synced folder),
because deploying the synced folder means deploying the Live-Document stack it sits
on.

---

## Task table

| ID | Task | Tier | Depends-on | Notes |
|----|------|------|-----------|-------|
| RD1 | Reactive cloud→disk Convex subscription (live materialize on cloud change) + fix the latent rename-vs-materialize access-loss interaction | **premier** | RT done | Replaces the `refresh()` seam in `syncedFolderService.ts`; reactive `ConvexClient.onUpdate` over `listWithMarkdown`/`folders.list`/`listWorkspaces`; debounced incremental materialize via `diffSyncedFolderIndex`. |
| RD2 | `Shared with me/` materialization | **standard** | RT1, **RD3** | Thread `documents.listSharedWithMe` → `convex-client` `getSharedWithMe` → `materializeSyncedFolder`; backend + `by_user` index already exist in branch but must be **applied to hosted Convex (RD3)** before this is testable there. |
| RD3 | Convex schema migration + deployment | **premier** | — | All new tables/indexes (documents, folders, revisions, comments, suggestions, activity, notifications, members, docShares incl. `by_user`, prosemirror-sync component) applied to a real deployment; `convex codegen`/`convex dev --once --typecheck` green; migration/backfill plan for existing data. |
| RD4 | Production auth hardening + enforcement audit | **premier** | RD3 | Convex Auth password (WorkOS/SSO later); audit `requireWorkspaceMember`/`requireDocument(Read\|Write)`/`checkRead`/`checkWrite` across **every** query/mutation; verify a viewer never receives editable steps; token refresh in the desktop main-process backend. |
| RD5 | **Stage-1 hard gate**: doc-size + load test + live two-browser | **premier** | RD3 | Hosted doc-size probe found the current large-doc failure. Decision: continue Convex/prosemirror-sync with an initial 256 KiB Live Document markdown cap, enforce the cap before deploy, and defer cap removal to a storage/revision redesign. Hosted manual live two-browser pass completed on `strong-setter-709` 2026-06-28. |
| RD6 | **Offline gate** resolution | **premier** | RT done | **Closed locally with v1 boundary.** External-file queue landed locally: watcher events persist under `.hubble/queue/events.json`, replay before reconnect materialization, and stay queued on failed replay. In-editor transient disconnect remains on prosemirror-sync's in-memory buffer; the thin IndexedDB/sessionStorage writer is retained and unit-covered, but full reload/app-restart while Convex is unavailable is deferred to a future app-shell offline cache + editor replay slice. No Yjs fork. |
| RD7 | Two-device single-writer lock — real-world hardening | **standard** | RT done | **Landed locally 2026-06-28.** `owner.json` acquire/heartbeat now refuses fresh foreign owners, reclaims stale owners, and stops the desktop sync engine if ownership is lost after connect; true multi-device-same-root remains out of scope. |
| RD8 | Security review of the branch | **premier** | RD4 | **Landed locally 2026-06-28.** Removed public throwaway ProseMirror POC mutation endpoints, hardened cloud-sync IPC validation and lock identity ownership, and tightened synced-folder path sanitization. Residual public-link token policy should be confirmed during RD10 flag-gated merge. |
| RD9 | Packaged desktop release | **standard** | RD5, RD6, RD8, RD10 | electron-vite production build, sign/notarize, auto-update channel (`UpdatesSection` already exists), install smoke. Must follow the gates (RD5/RD6), security (RD8), and the flag-gated merge (RD10) — never ship ahead of them. |
| RD10 | Rebase/merge `spike/prosemirror-sync` → fork `main` behind a feature flag | **premier** | RD1, RD2, RD3–RD8 | ~30 commits; flag-gate the Live-Document/synced-folder surfaces; CI green; keep legacy file-authoritative paths untouched (ADR-0009). Includes RD1 (reactive sync) + RD2 (shared-with-me) since "full production" ships both. |
| RD11 | Monitoring / observability / on-call | **standard** | RD10 | Convex dashboards, renderer error surfacing, reconcile-failure + backstop-rate alerts. |
| RD12 | MCP server for the patch API (Stage 4 deferred) | **standard** | Post-launch | **Landed locally 2026-06-29.** `@hubble.md/mcp-server` exposes stdio tools for Live Document get, patch, and markdown export through the existing Convex client/backend path. The `hubble cloud document get/patch/reconcile` CLI remains available for headless agents. |

## Sequencing & gates

```
RD3 (schema+deploy, premier) ─┬─► RD4 (auth audit) ─► RD8 (security review) ─┐
                              ├─► RD5 (doc-size/load GATE)                    │
                              └─► RD2 (shared-with-me)                        │
RD1 (reactive sync) ──────────────────────────────────────────────┐         │
RD6 (offline GATE) ────────────────────────────────────────────────┤         │
RD7 (two-device lock) ──────────────────────────────────────────────┤         │
                                                                     ▼         ▼
                                              RD9 (release) ◄── RD10 (merge to main, flag-gated)
                                                                     │
                                                                     ▼
                                                              RD11 (monitoring)
```

**The two hard gates are now accepted with boundaries** (SPIKE.md): **RD5**
(doc-size) ships with a conservative 256 KiB Live Document markdown cap, and
**RD6** (offline) ships with external-file durable queueing plus transient
in-editor disconnect support. Full reload/app-restart while Convex is unavailable
is deferred to a future app-shell offline cache + editor replay slice. Neither
gate currently triggers a Yjs/Durable-Objects fallback.

## Acceptance criteria

- Hosted Convex deployment with migrated schema; `convex` typecheck green (RD3).
- A viewer provably cannot obtain editable steps; auth audited end-to-end (RD4, RD8).
- Doc-size/load gate accepted with a cap and live two-browser pass complete (RD5);
  offline gate has an explicit accepted v1 boundary (RD6).
- Reactive two-way sync live; `Shared with me/` populated (RD1, RD2).
- Branch merged to fork `main` behind a flag, CI green, legacy paths intact (RD10).
- Signed desktop build installs and smoke-passes; monitoring + alerts live (RD9, RD11).

## RD3 deployment notes

Verified 2026-06-27 against `dev:strong-setter-709` (`adrian-tavares10/dubble-md`):

- `pnpm --filter @hubble.md/sync-backend exec convex codegen` completed without
  generated-file diffs.
- `pnpm --filter @hubble.md/sync-backend exec convex dev --once --typecheck enable`
  completed successfully.
- The hosted schema now accepts the widened realtime-collab shape: Convex Auth
  tables, optional `workspaces.ownerId`, `members`, `documents`, `folders`,
  `docShares` including `by_user`, `documentSuggestions`, `revisions`,
  `commentThreads`, `comments`, `activityEvents`, `notifications`, and the
  `@convex-dev/prosemirror-sync` component.

Zero-downtime rollout plan:

1. Deploy the widened schema and functions first. This is safe with existing data
   because legacy `workspaces.ownerId` remains optional, legacy `files` rows are
   still valid, and all realtime-collab data lives in new tables or new optional
   fields.
2. Keep legacy sync clients on `files`/`assets` during rollout. New authenticated
   clients create `users`, `members`, `documents`, and `docShares`; permission code
   intentionally treats `ownerId === undefined` workspaces as legacy-accessible.
3. Do not bulk-migrate legacy `files` rows to Live Documents as part of RD3. Import
   to `documents`/ProseMirror state should be an operator-triggered follow-up with
   dry-run counts, idempotent batching, and owner/share assignment rules.
4. Only after the import/backfill is verified should any later slice narrow legacy
   compatibility or require `ownerId`/membership on old workspaces.

Blocker before production data mutation: no operator-confirmed production target or
legacy-file import policy has been supplied. RD3 therefore validates deployability
and the safe schema widen only; it does not run data backfills.

## Brief-expansion policy

Full `tasks/` briefs for RD slices are written **at phase start**, not all up
front: RD10 depends on merge/release specifics not yet decided. RD3, RD5, and RD6
now have phase-start briefs in `tasks/`; RT slices (in `READY-TO-TEST.plan.md`)
have full briefs and are dispatch-ready today.
