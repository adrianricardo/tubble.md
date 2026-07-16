# Offline Decision — resolving the open FOUNDATION gate

**Status:** Accepted for v1 with explicit boundary.
**Date:** 2026-06-25; closure updated 2026-06-28
**Resolves:** Stage 1 decision-gate open item **"offline ❌ (not implemented
upstream)"** (SPIKE.md), which blocks Stage 6 "Offline edit + merge on reconnect."

## The question

Is `@convex-dev/prosemirror-sync`'s offline story sufficient (possibly with a
buffer/replay layer we build on top), or must we fork the in-editor CRDT to
**Yjs + `y-indexeddb`** (and/or a Cloudflare Durable Object), as SPIKE.md's
fallback contemplates?

Per Decision 6, "offline" is **two different problems** that happen to share a
name. They have **different answers**:

- **In-editor offline** — a human types in the live editor while the network /
  Convex connection is down (or the tab reloads / the app restarts while offline),
  and those edits must merge on reconnect. This is a property of the **editor
  CRDT**.
- **External-file offline** — a human or agent edits the Live Document's markdown
  **file on disk** in any app while offline; the desktop watcher must queue those
  edits and flush them on reconnect. This rides the **reconcile path** and is
  **independent of the editor CRDT**.

---

## What the source actually says (evidence)

I read the installed package at
`node_modules/.pnpm/@convex-dev+prosemirror-sync@0.2.4_.../@convex-dev/prosemirror-sync`
(both `src/` and built `dist/`), plus our wiring.

### Finding 1 — the offline *cache is dead-code-read, never written*

`src/tiptap/index.ts` has a full **read** path for a local cache:

- `useInitialState(syncApi, id, cacheKeyPrefix)` (line 366) calls
  `getCachedState(id, cacheKeyPrefix)` (line 375).
- `getCachedState` (line 416) does `sessionStorage.getItem(...)` and parses
  `{ content, version, steps }`, returning `restoredSteps` (line 431).
- `syncExtension.onCreate` (line 213) replays `initialState.restoredSteps` into
  the editor.

**But nothing in the package ever *writes* that cache.** A grep for
`setItem` / `localStorage` / `sessionStorage` / `indexeddb` across **both `src`
and `dist`** returns **only the single `getItem` read** above — zero writers.
Both halves of the path are also guarded by explicit unfinished-work comments:

- `getCachedState`: `// TODO: Verify that this works` (line 423).
- `onCreate` restore: `// TODO: verify that restoring local steps works` (line 214).

So out of the box, the "offline cache" restores from a cache that is **never
populated**. It is scaffolding, not a feature.

### Finding 2 — upstream itself classifies offline as not-built

`README.md` "Future features … could be added later":

> - **Offline editing support: cache the document and local changes in
>   `sessionStorage` and sync when back online (only for active browser tab).**
>   - Also save snapshots (but not local edits) to `localStorage` so new tabs can
>     see and edit documents offline …

…and under "Missing features that aren't currently planned":

> - Offline support that syncs changes between browser tabs or peer-to-peer.
> - **Syncing Yjs documents instead of ProseMirror steps. That would be done by a
>   different Yjs-specific component.**

This confirms SPIKE.md's "❌ not implemented upstream" and confirms that the Yjs
route is a **different component / a fork**, not a config flag.

### Finding 3 — transient-disconnect offline *already works* (tab stays open)

The editor binding does **not** depend on the dead cache for the common case.
Unsynced edits live in `prosemirror-collab`'s in-memory state via
`collab.sendableSteps(editor.state)` (`doSync`, line 302). `trySync` is re-driven
by `watch = convex.watchQuery(syncApi.latestVersion)` `onUpdate` (line 223) and by
the editor's `onUpdate` (line 240). Convex's reactive client auto-reconnects its
WebSocket and replays its mutation queue, so when the connection returns, the
buffered steps flush and rebase (`needs-rebase` branch, line 331) conflict-free.

The package even ships a `warnOnUnsyncedClose` `beforeunload` guard (line 228) —
proof the authors know that **unsynced in-memory steps are lost on reload**, and
chose a warning rather than persistence. (Our `EditorView.tsx` line 76 currently
sets `warnOnUnsyncedClose: false`.)

**Net:** "offline while the tab stays open" is solved today. "offline across a
reload / tab-close / app-restart" is the only truly missing in-editor case.

### Finding 4 — the external-file reconcile substrate is already built and is CRDT-agnostic

The reconcile path submits **rebasable ProseMirror steps**, not whole-file
overwrites:

- `convex/prosemirror.ts` `reconcileMarkdownRangePoc` (line 234) diffs a changed
  range and submits it through `prosemirrorSync.transform` (rebasable).
- `convex/documents.ts` `applyPatch` adds `replace-range` / `markdown-diff`
  intents over the same transform path (Stage 4, PROGRESS lines 395–410).
- The watcher (`hubble cloud document reconcile … --watch`) diffs the projection
  file vs. a per-doc base cache in `.hubble/state/live-documents` and emits a
  scoped patch.

None of this cares *how* the realtime layer stores state — it speaks markdown
ranges → steps. An offline file edit just needs to be **queued on disk and
retried** when the server is reachable. TECH.md already states the intended shape:
"External-file offline edits queue in the watcher and flush on reconnect via the
same reconcile flow."

---

## Options

| # | Option | In-editor durable offline? | Cost | Risk | Blast radius |
|---|---|---|---|---|---|
| a | **prosemirror-sync as-is** | No (reload/restart loses unsynced steps) | $0 | Data-loss on offline reload; fails Stage 6 in-editor task | None |
| b | **Buffer/replay layer on top of prosemirror-sync** (persist `sendableSteps`+snapshot to IndexedDB; reuse the package's own `restoredSteps`/`cacheKeyPrefix` read path) | Yes | Low–moderate | Must validate the two TODO-gated paths; rebase/vacuum edge cases | **Small** — additive wrapper; no change to backend, agent, history, permissions |
| c | **Fork in-editor CRDT to Yjs + `y-indexeddb`** (+ DO/`y-websocket`) | Yes (battle-tested) | High | Second backend authority; large rewrite | **Large** — see below |
| d | **Hybrid** (prosemirror-sync online, Yjs only as the offline buffer) | Yes | Very high | Two CRDTs + a translation layer between step-model and Y.Doc | Large + bespoke glue nobody else runs |

### Blast radius of a fork (option c)

Stages 1–5 are **all** built on prosemirror-sync's step/snapshot model. A Yjs fork
invalidates or rewrites:

- **Realtime API** (`prosemirror.ts`): `syncApi` (`getSnapshot`/`submitSnapshot`/
  `getSteps`/`submitSteps`/`latestVersion`) and the `checkRead`/`checkWrite`
  permission hooks (Stage 3) — replaced by a Yjs provider.
- **Agent edits** (`prosemirror.ts` `transform`, `documents.applyPatch`): today
  produce ProseMirror **steps** via `prosemirrorSync.transform`. ProseMirror steps
  do not apply to a Y.Doc — agent edits would be rewritten against a server-side
  `y-prosemirror` binding.
- **Reconcile / Decision-6 path** (`reconcileMarkdownRangePoc`, `applyPatch`
  `replace-range`/`markdown-diff`): rebuilt as Y.Doc transactions.
- **Version history** (Stage 5 `revisions`): stores `pmDoc` (ProseMirror JSON) +
  `crdtMeta` + step-derived snapshots — re-modeled around Y.Doc state
  vectors/snapshots.
- **Backend authority**: Convex stops being the realtime authority; a DO +
  `y-websocket` becomes a **second backend**, the exact "second-backend creep /
  two authorities" risk TECH.md warns about (lines 209, 194–210). Mitigation
  exists (Convex stays source-of-truth, DO transport-only) but it is real new
  infra and ops.

What **survives** a fork: the custom presence layer (`livePocUsers`) and the
markdown converter are CRDT-agnostic. Everything else in the realtime substrate is
not. This is roughly Stages 1, 4, 5 of realtime work plus the reconcile spike.

---

## Recommendation

**Adopt-with-buffer. Do NOT fork.** Keep `@convex-dev/prosemirror-sync` as the
in-editor CRDT and the Convex step model as the single realtime authority. Resolve
offline in two independent tracks, neither of which is a fork:

### External-file offline → **option (b), trivial** (do first)

Already architected and CRDT-agnostic. Add a **persistent on-disk queue +
retry/backoff** to the desktop reconcile watcher: when a save can't reach the
server, append the scoped patch (or the post-save file snapshot + base) to a
durable queue under `.hubble/state/…`; on reconnect, replay through the existing
`applyPatch(replace-range|markdown-diff)` / reconcile path, which already merges as
rebasable operations. This delivers Hubble's "edit your markdown anywhere, even
offline" identity with **near-zero architectural risk** because it rides paths
already built and human-verified (PROGRESS Stage 1 reconcile POC, Stage 4).

### In-editor offline → **option (b), thin layer** (do second)

Transient disconnect already works (Finding 3). For durable offline (reload /
restart while offline), build a **small persistence/replay wrapper** that reuses
the package's *own* primitives rather than forking:

1. On each editor transaction, serialize `collab.sendableSteps` + the latest
   snapshot + version to **IndexedDB** (more durable than `sessionStorage`).
2. On load, feed that cache in as `restoredSteps` via the exported
   `useInitialState(..., cacheKeyPrefix)` + `syncExtension(...)` primitives — the
   read path already exists; we are supplying the writer upstream left as a TODO.
3. First, **validate the two TODO-gated paths** (`getCachedState`, `restoredSteps`
   replay) actually round-trip — this is the one genuine unknown, and it is cheap
   to test headlessly.

If, and only if, step 3 shows the replay is unreliable under rebase/step-vacuum
edge cases (README flags "old clients with local changes … steps since vacuumed"
as unhandled), escalate to the contingency below.

**2026-06-28 closure result:** RD6 closes with a v1 product boundary rather than a
Yjs fork. The thin buffer is retained and unit-covered, and browser probing
confirmed that an offline edit writes the upstream `convex-sync-<id>` cache while
visible in the editor. A full reload while the entire Convex backend is
unavailable is deferred: the current app shell still requires live
workspace/document Convex queries before the editor mounts, so the ProseMirror
cache cannot be consumed in that state. Closing that gap requires an app-shell
offline cache plus editor replay verification, not a different realtime CRDT.

### Contingency (option c, pre-stated trigger — not now)

If durable in-editor offline replay proves unreliable, fork **only the in-editor
CRDT** to Yjs + `y-indexeddb` behind the same Tiptap binding, keeping **Convex as
the source of truth** for documents/permissions/history and a DO/`y-websocket` as
**transport only** (TECH.md's stated fallback shape). Defer this until a concrete
failing test exists — exactly the discipline SPIKE.md mandates ("Do not switch
without a concrete failing requirement").

### Phased path

- **Phase 0 (now):** Flip the gate from "❌ blocking-unknown" to "resolved:
  adopt-with-buffer, no fork." No code.
- **Phase 1:** External-file offline queue + retry in the reconcile watcher. Low
  risk; unblocks the realistic Hubble offline story.
- **Phase 2:** In-editor IndexedDB persistence/replay wrapper; validate the
  TODO-gated restore paths; add a `localStorage` snapshot so a new tab can open a
  doc offline read/edit.
- **Phase 3 (contingency only):** Yjs in-editor fork behind the trigger above.

### Why this over a fork

- **Smallest blast radius:** Stages 1–5 stand; the fork would rewrite the realtime
  substrate under agent edits, history, permissions, and reconcile.
- **The hard case is already covered:** transient disconnect works today;
  external-file offline rides a built, verified path.
- **Upstream is moving the same direction:** offline-via-cache is on their roadmap;
  we are front-running a documented feature with a thin wrapper, not inventing a
  parallel architecture.
- **Avoids two authorities:** no DO/Yjs second backend, the explicit TECH.md risk.

---

## What genuinely needs the human's call

1. **v1 offline scope / SLA.** Is "transient-disconnect-with-tab-open" +
   "external-file offline queue" sufficient for the first shippable version, with
   **durable in-editor offline (browser reload while offline)** deferred to Phase
   2? If durable in-editor offline is a hard v1 requirement, Phase 2 moves up and
   we should time-box the TODO-path validation before committing.
2. **Doc-size interaction (the other open gate).** README lists ">1 MB documents"
   as explicitly unsupported. Offline persistence and large docs intersect (we'd be
   caching step logs locally). The doc-size ⚠️ gate should be measured alongside
   Phase 2 — flagging so they aren't resolved in isolation.
3. **Build vs. wait.** Adding our own IndexedDB writer means maintaining a wrapper
   that upstream may later ship natively (possibly differently). Acceptable, or
   prefer to contribute the writer upstream so it isn't a private fork-by-another-name?
