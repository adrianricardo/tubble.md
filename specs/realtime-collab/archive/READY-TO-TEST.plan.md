# Ready-to-Test Plan — Synced Folder (Desktop)

> **Peer-reviewed** by Codex (`gpt-5.5`), 2026-06-26 — corrections applied: dropped
> the redundant grant subtask (pickers already `grantRoot`), fixed `SyncedFolderStatus`
> fields (`lastEventAt`/`documentCount`, not `lastReconciledAt`), completed the
> `SyncedFolderEvent` list (`renamed`/`moved`/`created`), corrected the
> `sync.listWorkspaces` auth claim, added the missing `@convex-dev/auth` dep + the
> `useAuthToken()` string-token-over-IPC contract, downscoped RT1 token-refresh to
> RD4, fixed RT3 dependency (IPC/classifier independent of RT2), and clarified the
> earliest hands-on test point.

**Goal:** get a human to a **live end-to-end test** of the synced folder on the
**deployed fork Convex** with **real sign-in**: launch desktop → sign in → pick a
sync root → watch the user's cloud docs materialize to disk → edit a file → see it
reconcile up to the cloud/browser **with no `.conflict` file** → exercise backstop
and rename. This closes the gap between "Phases 0–5 unit-verified" and "a person
can actually drive it."

**Decisions locked (2026-06-26):** deployed fork Convex + real Convex Auth sign-in ·
connect entry point lives in the existing **Settings dialog** · reactive cloud→disk
sync is **deploy-scope** (manual Refresh for the first test).

**Non-goals (deferred to `READY-TO-DEPLOY.plan.md`):** reactive cloud→disk
subscription, `Shared with me/` materialization, packaged release, doc-size/load
gate, offline external-file queue, security review, merge to main.

---

## What already exists (built, unit-verified, unmerged)

- Engine: `apps/desktop/electron/syncedFolderService.ts` + `syncedFolderClassify.ts`
  (materialize → chokidar watch → classify → reconcile/rename/move/create; backstop;
  direction-aware removal; single-writer lock; offline **seam**).
- IPC (`main.ts`/`preload.ts`/`src/desktopApi/types.ts`): `connectSyncedFolder`,
  `disconnectSyncedFolder`, `getSyncedFolderStatus`, `onSyncedFolderEvent`,
  `isSyncedFolderDocument`.
- Packages: `materializeSyncedFolder`, `syncedFolderIndex`, `SyncBackend`
  (`listWorkspaces`/`getFolders`/`getLiveDocuments`/`renameDocument`/`moveDocument`/
  `importLiveDocument`/`removeDocument`).
- Backend: `documents.listWithMarkdown/listSharedWithMe/rename/remove/importMarkdown`,
  `folders.list/moveDocument`, `sync.listWorkspaces`, Convex Auth tables/config.

## The architectural gap this plan closes

The desktop **renderer has no Convex client** and the main-process **`SyncBackend`
is an unauthenticated `ConvexHttpClient`**. `documents.listWithMarkdown` and
`folders.list` call `requireWorkspaceMember`, which needs an authenticated user (the
workspace *list*, `sync.listWorkspaces`, is **not** gated, so it would appear but
every doc inside would be empty). So "real sign-in" requires: (1) a Convex client +
Convex Auth in the renderer (desktop has `convex` but **must add
`@convex-dev/auth`**), and (2) plumbing the auth **token** (string, via
`useAuthToken()` — a fetcher can't cross IPC) through `connectSyncedFolder` into the
main process so `createConvexBackend` can `setAuth(token)`. That contract spans
renderer + main + `convex-client` and is the premier gate (RT1).

---

## Task table

| ID | Task | Tier | Depends-on | Brief |
|----|------|------|-----------|-------|
| RT1 | Desktop Convex client + Convex Auth (+ `@convex-dev/auth` dep) + main-process backend auth-token plumbing | **premier** | — | `tasks/RT1-desktop-auth-and-backend-token.md` |
| RT2 | Settings "Synced Folder" section: workspace context, folder pick, connect/disconnect, status, event handling | **standard** | RT1 | `tasks/RT2-settings-synced-folder-section.md` |
| RT3 | First-run-on-existing-folder safety guard (§6 case 5) — **no grant work** (pickers already grant) | **standard** | RT1 (IPC+classifier); RT2 (UI tail) | `tasks/RT3-root-grant-and-first-run-guard.md` |
| RT4 | User-facing copy pass: toast/status strings for **all** synced-folder events | **economy** | RT2 | `tasks/RT4-event-copy-pass.md` |
| RT5 | Human test runbook + package-level reconcile smoke script | **standard** | — (verify after RT2) | `tasks/RT5-test-runbook-and-smoke.md` |

## Sequencing

```
RT1 (premier, gate)
 ├─► RT3 main-process IPC + classifier (standard) ── can start immediately after RT1
 └─► RT2 (standard)
      ├─► RT3 UI tail (wire guard into connect flow)  ┐ parallel-ish, disjoint:
      └─► RT4 (economy: strings/toasts)               ┘ RT3=guard logic, RT4=copy
RT5 (doc + script) — author in parallel from the start; run/verify after RT2.
```

RT1 is the only true gate. RT3's **main-process guard IPC + classifier are
independent of RT2** and can be built/unit-tested right after RT1; only its UI tail
waits on RT2. RT4 is disjoint from RT3. RT5's runbook can be written immediately; its
smoke script is verified once RT2 makes the flow reachable.

### Earliest hands-on test point (corrected post-review)

- **After RT1 + RT2**, you can already smoke-test on an **empty** `~/Hubble` (the
  picker auto-grants the root; an empty folder is safe to materialize). This is the
  earliest real test.
- **RT3 is required before pointing it at a *non-empty* folder** (the safety guard) —
  do that test after RT3.
- RT4 (copy) and RT5 (runbook/script) are polish/support, not gating.

## Acceptance criteria (the whole plan)

A human can, on the deployed fork Convex:
1. Launch desktop, sign in with a real account (RT1).
2. Open Settings → Synced Folder, pick `~/Hubble`, click Connect (RT2/RT3).
3. See their cloud workspace docs appear on disk in the correct nested folders, with
   viewer/commenter docs read-only (`materializeSyncedFolder`).
4. Edit a writable `.md` in `~/Hubble`; within ~1–2s the change appears in the
   browser/cloud, and **no `*.conflict-<ts>` file is ever written** (Phase 4).
5. Corrupt a base cache (or force a backstop) → a `*.local-edit-<ts>` sibling appears
   and the authoritative version reloads — zero data loss (Phase 5).
6. Rename a file in Finder → the cloud doc renames; move it → it changes folder.
7. Toasts surface reconciled / backstop / read-only-rejected / removed events (RT4).
8. `pnpm typecheck` + `pnpm build:desktop` + desktop vitest stay green throughout.

> Items 3–6 are the **human-gated** proofs; RT1–RT5 make them *reachable*. The
> two-device lock and doc-size gate are explicitly out of scope here (deploy plan).
