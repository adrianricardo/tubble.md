# Stage 1 Spike — `@convex-dev/prosemirror-sync`

Validating the realtime backend decision gate (TECH.md). **Provisional outcome:
adopt prosemirror-sync** — it answers the hard gates (server-side agent edits,
versioning hooks) on the existing Convex stack. Hosted doc-size probing is
accepted with a 256 KiB cap; the hosted real two-browser pass completed on
2026-06-28.

## Decision-gate findings

| Gate | Result | Notes |
|---|---|---|
| **Server-side / programmatic agent edits** | ✅ **Supported** | `prosemirrorSync.transform(ctx, id, schema, (doc) => Transform)`, `getDoc(ctx, id, schema)`, `create(ctx, id, content)`. Agent edits stream to all clients like a human's. This is the Model C foundation. |
| **Versioning hooks** | ✅ Supported | Debounced snapshots (~1s idle). `getSnapshot` / `submitSnapshot` / `latestVersion` / `getSteps` / `submitSteps`; `getDoc` returns `{ doc, version }`. Enough to build the Stage 5 `revisions` table on top. |
| **Auth integration** | ✅ Expected | `syncApi({ checkRead, checkWrite })` hooks — where Stage 3 permission enforcement lands. Not yet exercised. |
| **Tiptap client** | ✅ Supported | `useTiptapSync(api.<file>, docId)` → `{ isLoading, initialContent, extension, create() }`. Drops into the existing Tiptap editor. |
| **Offline editing** | ⚠️ **Accepted with v1 boundary** | Upstream durable offline is not implemented. RD6 keeps prosemirror-sync, adds/retains a thin IndexedDB + `sessionStorage` writer for unsynced editor steps, and ships external-file durable queueing. Browser probing confirmed offline in-editor edits populate the upstream `convex-sync-document:<id>` cache, but full reload/app-restart while Convex is unavailable is deferred because the current app shell cannot mount the editor without live workspace/document queries. No Yjs/DO fallback for v1. |
| **Doc-size limits** | ⚠️ **Accepted with cap** | Hosted RD5 probe on `strong-setter-709` passed 64 KiB, 256 KiB, and 320 KiB markdown docs with repeated `documents.applyPatch` edits, but 384 KiB failed on first patch with `Value is too large (1.02 MiB > maximum size 1 MiB)` and 512 KiB failed with `1.37 MiB > maximum size 1 MiB`. Product decision: continue Convex/prosemirror-sync for the current release with an initial 256 KiB Live Document markdown cap; cap enforcement landed locally on 2026-06-28; defer large-doc parity to storage/revision redesign. |
| **Two-browser conflict-free merge** | ✅ **Passed on hosted dev** | RD5 hosted pass on `strong-setter-709` used document `kn7e5a4kwk4mhb207mxnxst9t189h9tj` in workspace `mn75k6wxszm8dzjmfn1db4546989hxfa`. Ada/Ben browser sessions both showed presence, separate-paragraph edits merged into backend revision 107, and same-paragraph adjacent inserts converged in both pages and backend revision 175. |

## What is scaffolded / locally wired

- `packages/sync-backend/convex/convex.config.ts` — registers the component.
- `packages/sync-backend/convex/prosemirror.ts` — exports the sync API and an
  `agentAppendParagraph` mutation using `prosemirrorSync.transform` and the
  shared Hubble editor schema.
- `packages/sync-backend/package.json` — adds `@convex-dev/prosemirror-sync@^0.2.4`.
- `packages/editor/src/schema.ts` — exports the shared base Tiptap extension list
  and ProseMirror schema helper used by the server transform.
- `apps/www/src/shell/EditorView.tsx` — local POC wiring for `useTiptapSync`.

**Done locally (unmerged):**

- `pnpm install` was run and the lockfile is updated.
- `convex dev --once --typecheck enable` configured a local anonymous deployment,
  generated `_generated/api.d.ts` with `components.prosemirrorSync`, installed the
  component, and typechecked successfully.
- `pnpm check`, `pnpm build:desktop`, `@hubble.md/www` typecheck, and Convex
  `dev --once --typecheck enable` pass.

## How to finish the spike

1. Decide presence strategy. The installed `@convex-dev/prosemirror-sync` package
   exposes sync APIs but no obvious presence/cursor API in source.
2. Auth-gate or dev-identify two distinct POC users.
3. Open two browsers on one `docId`, type simultaneously → confirm conflict-free
   merge + presence. Call `agentAppendParagraph` from the Convex dashboard and
   confirm it appears live in both browsers (agent-edit proof).
4. RD5 hosted live two-browser pass is complete. Keep the rollout decision
   recorded as accepted-with-cap rather than large-doc parity.

## Fallback (only if a hard gate fails)

If doc-size/perf or a missing capability blocks adoption: Yjs on Cloudflare
Durable Objects + `y-websocket` (Adrian runs Cloudflare infra), keeping Convex as
the source of truth for documents/permissions/history (realtime layer = transport
only). Do not switch without a concrete failing requirement.
