# RT3 — First-run-on-existing-folder guard

**Tier:** standard (Sonnet) — bounded, but safety-critical (don't blast user files).
**Depends-on:** RT1 for the main-process IPC + classifier (can run **parallel with
RT2**); the small UI-integration tail depends on RT2. **Parallel-with:** RT4.

> **Scope note (corrected):** there is **no grant work** here — both folder pickers
> (`desktop:open-folder-picker` / `desktop:create-folder-picker`) already call
> `grantRoot()` on their result (`main.ts` L1281/L1295), so a picked root is granted
> automatically. This slice is **only** the first-run safety guard.

## Objective

Implement the **first-run safety guard** so connecting an existing non-empty folder
never auto-materializes over the user's files (SYNCED-FOLDER §6 case 5). The
main-process IPC + classifier is independent of the Settings UI and can be built and
unit-tested right after RT1; the UI branch that surfaces the two choices is the only
RT2-dependent part.

## Read first

- `apps/desktop/electron/main.ts` — `assertGrantedRoot` / `assertGranted`, the
  `grantedRoots`/`grantedFiles` sets and how a path becomes granted (the existing
  folder-open path grants its root). Find the grant entry point and reuse it.
- `apps/desktop/electron/syncedFolderService.ts` — `connect()` runs
  `materializeSyncedFolder` immediately; the guard must run **before** that.
- `packages/sync/src/sync.ts` — `materializeSyncedFolder` (what would be written) and
  `importLiveDocuments` (the idempotent-by-path import path offered as option b).
- SYNCED-FOLDER.md §6 case 5 (the exact policy) and §2 (the `.hubble/index` marker
  that identifies an already-Hubble root).

## Scope

1. **First-run guard IPC + classifier** (independent of RT2; build right after RT1):
   `desktop:live-sync:inspect-root(syncRoot)` →
   `{ state: "empty" | "existing-hubble" | "non-empty-foreign" }`:
   - `existing-hubble` (has `.hubble/index/synced-folder.json`) → safe to connect.
   - `empty` → safe to connect (fresh mirror).
   - `non-empty-foreign` → **refuse by default** (the UI offers the two choices below).
   Classification is a pure function over a directory listing → unit-test it with an
   in-memory FS, no Electron.
2. **UI branch (RT2-dependent tail).** Wire the guard result into RT2's connect flow:
   block Connect on `non-empty-foreign` until the user picks (a) pick/create an empty
   subfolder, or (b) **import** the existing `.md` into the cloud via
   `importLiveDocuments` *before* turning on the mirror. Never auto-materialize over
   unknown files.
3. **Import requires a target workspace.** `importLiveDocuments()` takes a
   **`workspaceId`** — option (b) must make the user pick an explicit target workspace
   (from the authed `sync.listWorkspaces`) before importing; never import to an
   inferred/default workspace.

## Out of scope

The Settings layout itself (RT2 — you add the guard branch + the two choices it
surfaces). Reactive sync, two-device lock (RD7).

## Gotchas

- Electron `tsconfig.node.json` is non-strict — flat optional fields for any union
  you add on the main side.
- Do **not** add grant logic — the pickers already grant. If you support manual path
  entry (not via a picker), that path would need a grant, but the picker flow doesn't.
- The `.hubble/index` marker is the source of truth for "already a Hubble root" — not
  the folder name.

## Verify

- `pnpm typecheck`, `pnpm build:desktop`, `pnpm --filter @hubble.md/desktop test`.
- Add unit tests for `inspect-root` classification (empty / existing-hubble /
  non-empty-foreign) with an in-memory FS.
- Human-gated: the real Finder folder-pick + refuse/import flow.

## Constraints & done

No commit; no `PROGRESS.md` edit. Return: files touched, the grant mechanism reused,
the guard states + how RT2 consumes them, verify results, suggested PROGRESS note +
changelog line.
