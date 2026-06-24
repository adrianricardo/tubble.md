# Stage 1 Spike — `@convex-dev/prosemirror-sync`

Validating the realtime backend decision gate (TECH.md). **Provisional outcome:
adopt prosemirror-sync** — it answers the hard gates (server-side agent edits,
versioning hooks) on the existing Convex stack. Live validation of doc-size and a
real two-browser test still pending (needs an interactive `convex dev`).

## Decision-gate findings

| Gate | Result | Notes |
|---|---|---|
| **Server-side / programmatic agent edits** | ✅ **Supported** | `prosemirrorSync.transform(ctx, id, schema, (doc) => Transform)`, `getDoc(ctx, id, schema)`, `create(ctx, id, content)`. Agent edits stream to all clients like a human's. This is the Model C foundation. |
| **Versioning hooks** | ✅ Supported | Debounced snapshots (~1s idle). `getSnapshot` / `submitSnapshot` / `latestVersion` / `getSteps` / `submitSteps`; `getDoc` returns `{ doc, version }`. Enough to build the Stage 5 `revisions` table on top. |
| **Auth integration** | ✅ Expected | `syncApi({ checkRead, checkWrite })` hooks — where Stage 3 permission enforcement lands. Not yet exercised. |
| **Tiptap client** | ✅ Supported | `useTiptapSync(api.<file>, docId)` → `{ isLoading, initialContent, extension, create() }`. Drops into the existing Tiptap editor. |
| **Offline editing** | ❌ **Not implemented** | Listed as planned (session/localStorage caching). **Stage 6 "offline edit + merge" cannot rely on this today** — flag as a gap; revisit upstream or implement separately. |
| **Doc-size limits** | ⚠️ Unverified | Needs a live test with a large doc. Convex per-document/step size limits apply; measure before committing to very large docs. |
| **Two-browser conflict-free merge** | ⚠️ Unverified | Needs a running deployment + the editor wired. The component is OT-based and designed for this; confirm empirically in the POC. |

## What was scaffolded (this branch)

- `packages/sync-backend/convex/convex.config.ts` — registers the component.
- `packages/sync-backend/convex/prosemirror.ts` — exports the sync API and an
  `agentAppendParagraph` mutation stub proving the server-side agent edit path.
- `packages/sync-backend/package.json` — adds `@convex-dev/prosemirror-sync@^0.2.4`.

**Not yet done / blocked on interactive steps:**

- `pnpm install` was **not** run (avoids triggering the Electron postinstall and a
  lockfile churn in this session). Lockfile is therefore out of sync on this branch.
- `convex dev` was **not** run — it requires interactive Convex login. Until it
  runs once, `components.prosemirrorSync` and the typed `_generated/api` don't
  exist, so `prosemirror.ts` will not typecheck. **This is expected.**

## How to finish the spike (next session)

1. `pnpm install` at the repo root (installs the component).
2. From `packages/sync-backend`: run `pnpm dev` (`convex dev`) and complete the
   interactive Convex login. This regenerates `_generated/api` with the component.
3. Export the editor's ProseMirror schema from `packages/editor`
   (`getSchema(extensions)`) and wire it into `prosemirror.ts`; uncomment the
   `transform()` body in `agentAppendParagraph`.
4. Add `useTiptapSync` to the Tiptap editor in `packages/ui` / `apps/www`.
5. Open two browsers on one `docId`, type simultaneously → confirm conflict-free
   merge + presence. Call `agentAppendParagraph` from the Convex dashboard and
   confirm it appears live in both browsers (agent-edit proof).
6. Measure a large doc for size/perf. Record results in the table above and flip
   the PROGRESS.md decision-gate task to `[x]` with the final adopt/fallback call.

## Fallback (only if a hard gate fails)

If doc-size/perf or a missing capability blocks adoption: Yjs on Cloudflare
Durable Objects + `y-websocket` (Adrian runs Cloudflare infra), keeping Convex as
the source of truth for documents/permissions/history (realtime layer = transport
only). Do not switch without a concrete failing requirement.
