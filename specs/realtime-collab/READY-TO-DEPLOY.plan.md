# Ready-to-Deploy Plan — Synced Folder + Realtime Collab

> **Peer-reviewed** by Codex (`gpt-5.5`), 2026-06-26 — corrections applied: RD2 now
> depends on RD3 (schema must land on hosted Convex first); RD9 release depends on the
> gates + security + merge (RD5/RD6/RD8/RD10), not just RD1/RD4; RD10 includes RD1+RD2
> since full production ships reactive sync + shared-with-me; RD12 (MCP) re-tiered
> economy→standard (protocol/auth work, not mechanical).

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
| RD5 | **Stage-1 hard gate**: doc-size + load test + live two-browser | **premier** | RD3 | The unresolved gate everything is provisionally built on (TECH.md/SPIKE.md). Large-doc prosemirror-sync behavior, snapshot/step growth, concurrent editors. Fail → Yjs/DO fallback (SPIKE.md). |
| RD6 | **Offline gate** resolution | **premier** | RT done | (a) human-verify the in-editor durable buffer replay (`d5355c7`, `durableOfflineBuffer.ts`); (b) build the external-file offline queue (the `#enqueue`/`#flushQueue` seam in `syncedFolderService.ts`, `.hubble/queue/`) per `OFFLINE-DECISION.md`. No Yjs fork. |
| RD7 | Two-device single-writer lock — real-world hardening | **standard** | RT done | `owner.json` heartbeat/reclaim under iCloud/Dropbox-shared sync roots; detect-and-refuse UX; the §6-case-4 path. |
| RD8 | Security review of the branch | **premier** | RD4 | `/security-review`: auth, file-grant/`assertGranted(Root)`, path traversal in watcher/materializer, the IPC surface, prosemirror step injection, public-link shares. |
| RD9 | Packaged desktop release | **standard** | RD5, RD6, RD8, RD10 | electron-vite production build, sign/notarize, auto-update channel (`UpdatesSection` already exists), install smoke. Must follow the gates (RD5/RD6), security (RD8), and the flag-gated merge (RD10) — never ship ahead of them. |
| RD10 | Rebase/merge `spike/prosemirror-sync` → fork `main` behind a feature flag | **premier** | RD1, RD2, RD3–RD8 | ~30 commits; flag-gate the Live-Document/synced-folder surfaces; CI green; keep legacy file-authoritative paths untouched (ADR-0009). Includes RD1 (reactive sync) + RD2 (shared-with-me) since "full production" ships both. |
| RD11 | Monitoring / observability / on-call | **standard** | RD10 | Convex dashboards, renderer error surfacing, reconcile-failure + backstop-rate alerts. |
| RD12 | MCP server for the patch API (Stage 4 deferred) | **standard** | RD3 | Protocol/auth/security integration (not mechanical) → at least standard. **Optional for deploy** — the `hubble cloud document get/patch/reconcile` CLI already covers headless agents; cut if not needed rather than under-tier it. |

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

**Two hard gates can still fork the architecture** (SPIKE.md): **RD5** (doc-size)
and **RD6** (offline). If either fails on the real stack, that is the
Yjs/Durable-Objects fallback signal — cheaper to learn at RD5/RD6 than after RD10.
Do not start RD9/RD10 until both gates pass.

## Acceptance criteria

- Hosted Convex deployment with migrated schema; `convex` typecheck green (RD3).
- A viewer provably cannot obtain editable steps; auth audited end-to-end (RD4, RD8).
- Doc-size/load and offline gates **passed** on the real stack (RD5, RD6).
- Reactive two-way sync live; `Shared with me/` populated (RD1, RD2).
- Branch merged to fork `main` behind a flag, CI green, legacy paths intact (RD10).
- Signed desktop build installs and smoke-passes; monitoring + alerts live (RD9, RD11).

## Brief-expansion policy

Full `tasks/` briefs for RD slices are written **at phase start**, not now: RD5 and
RD6 are spikes whose decomposition depends on test outcomes, and RD3/RD10 depend on
deployment specifics not yet decided. RT slices (in `READY-TO-TEST.plan.md`) have
full briefs and are dispatch-ready today.
