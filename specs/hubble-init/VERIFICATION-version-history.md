# Version-History / Data-Loss Verification — 2026-07-09

Answers the gate in `DESIGN.md` §Safety gate: *can we move real docs into Hubble and
trust we won't lose data?* **Verdict: YES for the agent/file paths, with three caveats
below.** Verified by code audit + live end-to-end test on the dev deployment
(workspace `verify-history-scratch-20260709`, doc `kn717ezs…`).

## What was verified live (all passed)

1. **Every agent/file write snapshots first.** `documents.applyPatch` — the single
   mutation behind the CLI, MCP server, *and* the desktop watcher/reconcile path —
   materializes a full `revisions` row ("Before agent patch": markdown + pmDoc + actor)
   before applying any patch. Confirmed: 3 patches → 3 pre-state snapshots.
2. **Destructive overwrite is recoverable.** A `replace-document` wipe ("rogue agent")
   auto-snapshotted the good content first; `restoreRevision` brought it back exactly.
3. **Restore is itself safe.** Restoring writes a "Before restore" revision first, so a
   wrong restore is also reversible.
4. **Delete is soft.** `documents.remove` sets `deletedAt` (trash); `restoreRemoved`
   brought the doc back with content and full revision history intact. Folders are
   soft-delete too. **No cron purges trash or revisions** (only orphan *assets* after 7
   days). The only hard `ctx.db.delete` calls in the backend are share-ACL rows.
5. **Revisions are never pruned.** No app code calls the prosemirror-sync component's
   `pruneSnapshots`/`deleteSteps`, and the app-level `revisions` table has no TTL.
6. **Oversize fails safe.** The RD5 1 MiB cap is checked *before* writing — an
   oversized patch is rejected; nothing is clobbered.
7. **Human UI exists.** Web app `VersionHistoryButton` (AppShell.tsx) lists revisions
   and restores — recovery doesn't require an engineer.

## Caveats (known, acceptable, tracked)

1. **Live-editor granularity is ~60s.** Tiptap typing goes through CRDT steps;
   `markEdited` materializes "Autosaved" revisions at most once per 60s
   (`AUTO_REVISION_MIN_INTERVAL_MS`). The raw deltas are retained (never pruned) but
   there is no surfaced API to reconstruct between-revision states. Worst case: <60s of
   *live typing* isn't one-click restorable. Agent/file writes are unaffected (always
   snapshot).
2. **Verified on the dev deployment.** Production isn't deployed yet; mutations are
   identical, but re-run this scenario once prod exists. Durability beyond the app
   layer is Convex Cloud's (their backups/replication).
3. **Belt-and-suspenders still applies:** init apply-mode must commit the repo
   immediately before moving files (DESIGN.md), so git holds the pre-move state
   regardless of anything above.

## Repro (from `packages/sync-backend`, dev deployment)

`npx convex run sync:createWorkspace / documents:create / documents:applyPatch
(replace-document ×3, last one garbage) / documents:listRevisions /
documents:restoreRevision / documents:remove / documents:restoreRemoved` — assert the
pre-wipe snapshot exists, restore returns exact content, trash round-trips.
