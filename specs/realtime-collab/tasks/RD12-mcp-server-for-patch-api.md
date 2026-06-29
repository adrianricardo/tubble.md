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
pnpm typecheck
pnpm build:desktop
```

## Follow-Up

- Add a packaged MCP config once the release owner decides where Hubble should
  publish agent-facing integrations.
- Add an end-to-end MCP client smoke against a hosted deployment with an
  authenticated token.
