# Run record — magic-flow Phases 3+4 implementation verification (2026-07-11)

Scope: audit the uncommitted implementation against
`specs/hubble-init/MAGIC-FLOW-PLAN.md` rather than relying on its session handoff.
Branch: `v1-release`, starting at `3b437d3`.

## Phase 3 — `hubble ensure-desktop`

Implemented:

- macOS app detection in `/Applications`, the user Applications directory, and a
  constrained Spotlight fallback;
- explicit interactive install confirmation, with `--yes` for an already-authorized
  non-interactive run;
- architecture-specific GitHub Release selection through the stable
  `desktop-dev-latest` tag;
- release-size and SHA-256 verification before extraction and installation;
- unsigned zip builds for arm64 and x64 through a manually dispatched dev-release
  workflow;
- first-run sign-in through a 256-bit, two-minute, single-use Convex Auth handoff code,
  avoiding transfer of the CLI's durable refresh token;
- continuation into the existing `hubble mount` path after the app is ready.

The audit fixed one additional installer issue: downloaded chunks now retry partial
filesystem writes instead of assuming one write consumes the whole chunk.

## Phase 4 — repo-link form

Implemented:

- repository resolution walks upward from a selected child directory and preserves
  worktree git-directory handling;
- the renderer shows the resolved repository root;
- suggested mount paths are derived state and reset after a repository, Workspace, or
  folder change; a custom path is visibly labeled and can be reset;
- socket-driven links use the same resolved root;
- mount liveness (`lastReconcileAt`) remains supplied by Phase 2.

## Independent verification

- CLI: 4 tests passed.
- Sync backend: 64 tests passed, including authenticated, expired, and single-use
  desktop handoff cases.
- Desktop: 115 tests passed, including nested plain-repo and worktree selections.
- Total: 183 tests passed.
- `pnpm build:desktop` passed.
- `pnpm --filter @hubble.md/cli build` passed.
- `git diff --check` passed before the documentation update.

## Acceptance still owed

- Publish the manually dispatched dev release to `adrianricardo/hubble.md`.
- On a clean macOS machine or user account with no installed app, verify the complete
  prompt → download → verify → install → open → sign-in → mount flow.
- Visually confirm the manual repo-link form in the packaged app.

An earlier session handoff reported a same-machine sign-out/sign-in smoke and CDP root
resolution check. This audit did not treat those claims as proof and did not repeat
them because no app socket or installed Hubble bundle was present.
