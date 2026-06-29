# RD12 - MCP Server for the Patch API

Assigned tier: **standard**.

Status: **landed locally 2026-06-29**.

## Objective

Expose the existing Live Document agent read/patch API through a local stdio MCP
server so AI agents can inspect and edit Hubble Live Documents without shelling
out to `hubble cloud document ...`.

## Implementation

- Added `@hubble.md/mcp-server` with a `hubble-mcp` bin.
- The server uses `@modelcontextprotocol/sdk` over stdio and calls the existing
  `@hubble.md/convex-client` backend wrapper.
- Connection configuration comes from `--url`, `HUBBLE_CONVEX_URL`, or
  `CONVEX_URL`; auth comes from `--auth-token`, `HUBBLE_AUTH_TOKEN`, or
  `CONVEX_AUTH_TOKEN`.
- Exposed tools:
  - `hubble_get_document` returns revision, markdown, path, role, and `canWrite`.
  - `hubble_patch_document` supports replace-document, append-markdown,
    insert-after-heading, and replace-range patch modes.
  - `hubble_export_markdown` returns only the current markdown projection.
- Broadened the shared `SyncBackend.applyDocumentPatch` type from the reconciler's
  `replace-range` intent to the full agent patch-intent union already accepted by
  Convex.
- Added `scripts/mcp-server-smoke.mjs`, an authenticated hosted smoke that launches
  `packages/mcp-server/dist/index.js` over MCP stdio, imports a timestamped Live
  Document, calls get/patch/export tools, and verifies the patch advances the
  revision.
- Hardened MCP stdio by routing process console output to stderr, keeping stdout
  reserved for protocol messages even when Convex/Tiptap emits warnings.

## Acceptance

- Agents can discover a local MCP tool surface for Live Document reads and edits.
- Patch calls still go through the same Convex `documents.applyPatch` permission,
  revision, markdown-cap, and attribution checks as the CLI.
- The server does not add a new public Convex function or bypass existing auth.

## Verification

```sh
pnpm --filter @hubble.md/sync build
pnpm --filter @hubble.md/mcp-server typecheck
pnpm --filter @hubble.md/mcp-server build
CONVEX_URL=<url> AUTH_TOKEN=<jwt> node scripts/mcp-server-smoke.mjs
pnpm typecheck
pnpm build:desktop
```

Hosted smoke passed on `strong-setter-709` 2026-06-29 using a freshly signed-up
password-auth smoke account: document `kn756w6xs8147tp4ahzb4se6js89jxmv`
advanced revision `1 -> 2` through `hubble_patch_document`, and
`hubble_export_markdown` returned the patch marker.

Auth repeatability note: do not save smoke JWTs or passwords. The passing run
minted a fresh password-auth account through `auth.signIn` with
`flow: "signUp"`, used the returned JWT only in memory, and discarded it. Cached
desktop JWTs in local app storage were expired and should not be treated as a
reusable smoke-test credential. Future agents should either sign in through the
app and pass the current JWT as `AUTH_TOKEN`, or create a new throwaway
password-auth smoke account and pipe the returned token directly into
`scripts/mcp-server-smoke.mjs`.

## Follow-Up

- Add a packaged MCP config once the release owner decides where Hubble should
  publish agent-facing integrations.
