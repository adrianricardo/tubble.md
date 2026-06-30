# Hubble v1 — Orchestration Execution Plan

Derived from `V1-RELEASE.plan.md` via `/orchestrate` (2026-06-30). This is the
*execution* plan (route, phases, tiers, sequencing). The release plan is the
*what/why*; this is the *how/when*.

## Route: **Phased** (single orchestrator session, selective delegation)

**Why not Delegated:** the new build surfaces (A1, A3, B1/B1b, A5) all read/write
the same small backend set (`packages/sync-backend/convex/{schema,sync,documents,
pocIdentity}.ts`) and one frontend root (`apps/www/src/App.tsx`). Parallel cold
agents would re-discover the same files; sequential phases read them once. Later
phases conform to earlier phases' schema/API choices → phase gates, not parallelism.

**Delegation rule:** orchestrator (Opus/premier) does schema-, auth-, and
identity-sensitive work directly. Well-specified, file-disjoint standard slices
(e.g. member-management UI, @mention picker, regression suite) may be dispatched
to a Sonnet sub-agent with a path-scoped brief returning a short summary.

## State grounding (verified 2026-06-30)

- Realtime fork is **already on local `main`** (commit `1549309`); not a separate
  branch. D2 "merge to main" = land flag-off state + final gate checks.
- Presence is POC-only: `EditorView.tsx:143–199`, `testIdentity ? {docId} : "skip"`,
  `api.pocIdentity.*`. A real signed-in user sees/broadcasts no cursor. (A3)
- Flag read sites (9): `apps/{www,desktop}/src/realtimeFlag.ts`, `.../vite-env.d.ts`,
  `apps/www/src/{App.tsx,shell/AppShell.tsx,shell/Sidebar.tsx}`, `apps/www/.env*`.
- All scope decisions in the release plan are **locked**. No open product questions.

## Phase table

| Phase | Scope (release-plan IDs) | Tier | Depends on | Output / handoff |
|---|---|---|---|---|
| **P1 Backend foundation** | B1b pending-invite model · B1 member mutations · B2b anon-leak fix | premier (B1b) + standard | — | Schema + exported mutations the member UI/share dialog consume. Handoff: invite/share API shape. |
| **P2 Web auth + routing** | A1a delete ConnectScreen · A1b lift auth to router root · A1d auto-provision personal workspace | premier | P1 | `App.tsx` root = auth gate → dashboard; Convex URL baked in. |
| **P3 Dashboard surface** | A1f aggregate queries (cross-workspace recents + global search) · A1c Home (Recents/Private/Teams/Shared) · A1e Live Doc primary object · A2 share→co-edit polish | standard | P2 | A1f built adjacent to its only consumer (the dashboard) so the query shape matches the UI. |
| **P4 Production presence** | A3 real-viewer presence/cursors (un-gate heartbeat/listActive, stable name/color) | premier | P2 | Headline feature works for signed-in users. Launch-critical. |
| **P5 Completeness** | A5 version auto-snapshot · A5 @mention picker · B1c member-mgmt UI · A4 onboarding | standard (delegable) | P1, P3 | History non-empty in real use; @ picker; member UI. |
| **P6 Hardening** | B2 permission regression suite · B3 session edges · D6 cap-message UX | standard | P3, P4 | Test net (the only safety net post-flag). |
| **P7 Launch gate** | C1/C2 cross-surface QA · D1 delete flag · D2 merge gate · D3/D4 deploy · D5 ops sink · D7 signup cap | premier judgment | P1–P6 green | Production v1. Flag deletion is the **last** step. |

## Sequencing & gates

- **P1 first** — pending-invite model (B1b) is the shared-infra blocking decision
  (used by both team invites and doc sharing). Everything downstream conforms to it.
- P3 and P4 both depend on P2 (auth at root) but are independent of each other;
  done sequentially in-session (shared `EditorView`/shell context).
- **Do not start P7/D1** until P1–P6 acceptance criteria pass — with no flag
  fallback, the QA gates are the only safety net (release plan D1).
- Verify each phase: `pnpm typecheck` + `pnpm --filter @hubble.md/www build`;
  Convex via `npx convex codegen`; `pnpm build:desktop` when desktop touched.
  (`pnpm check` is Biome only — not load-bearing.)

## Progress

| ID | Status | Owner/session | Last update | Notes |
|----|--------|---------------|-------------|-------|
| P1 Backend foundation | done | opus / session-1 | 2026-06-30 | Committed `b5a650a` on `v1-release`. invites table, member mutations, B2b leak fix. codegen + typecheck green. |
| P2 Web auth + routing | done (typecheck/build only) | opus / session-1 | 2026-06-30 | Root `ConvexAuthProvider` + auth gate + env-baked URL in `App.tsx`; `ConnectScreen` deleted; auth screens extracted to `auth/AuthScreens.tsx`; JWT threaded into store/subscriber clients; A1d personal-workspace auto-provision. typecheck+build green. **Runtime smoke still owed** (sign-in → provision → land → authed queries). |
| P2-tests Backend test net | done | opus / session-2 | 2026-06-30 | Committed `b7cf458`. convex-test infra (`vitest.config.ts`, `test` script, deps) + 14 passing tests over P1/P2 logic (members.test/documents.test/sync.test). `pnpm dedupe` fixed a vite 7.3.1/7.3.5 split introduced by the install. typecheck+build+codegen green. |
| P2-smoke (server) Auth→provision | done | opus / session-2 | 2026-06-30 | Headless signup smoke vs **dev** deployment: Password `signUp` → `afterUserCreatedOrUpdated` fired → 1 personal workspace provisioned → authed `listWorkspaces` (real JWT) returned it. Closes the callback path convex-test can't trigger. Left a `smoke+<ts>@example.com` user in dev. **Browser JWT-threading smoke still owed.** |
| P3 Dashboard surface | done (visual smoke blocked) | codex / session-3 | 2026-06-30 | A1f aggregate dashboard/search queries + authenticated Home dashboard landed. Tests/type/build green; in-app browser smoke blocked by browser-tool setup error. |
| P4 Production presence | done (browser smoke blocked) | codex / session-4 | 2026-06-30 | A3 launch-critical; signed-in presence derives identity from Convex Auth, read/write authorization follows document/workspace permissions, and `?test=1` anonymous bootstrap remains supported. |
| P5 Completeness | pending | — | — | A5 auto-snapshot + @mention picker, B1c member UI, A4 onboarding. Delegable. |
| P6 Hardening | pending | — | — | B2 permission regression suite, B3 session edges, D6 cap UX. |
| P7 Launch gate | pending | — | — | C1/C2 QA, D1 flag delete (LAST), D2 merge, D3/D4 deploy, D5 ops, D7 signup cap. |

## Handoff

**Current state:** P1/P2/P2-tests/P2-smoke/P3/P4 are complete on `v1-release`.
P4 turns the POC presence path into signed-in production presence: authenticated
heartbeats ignore spoofed client identity and derive `{userId,name}` from Convex
Auth, presence reads/writes authorize against Live Document roles or legacy
workspace membership, `listActive` returns stable colors, editor cursors publish
for signed-in sessions, and Live Document headers show active collaborators. The
`?test=1` anonymous identity path remains available for legacy POC bootstrap.

**Next step:** P5 Completeness: A5 version auto-snapshot + @mention picker, B1c
member-management UI, A4 onboarding. Browser smoke remains owed for P2/P3/P4
because the in-app browser Node REPL failed before execution (`sandboxCwd must be
an absolute file URI`) and Playwright is not installed for a CLI screenshot
fallback. A dev server responded at `http://127.0.0.1:5175/` during the P4 attempt.

**Pending manual tests:** Browser smoke the signed-in web flow once Browser tooling
is available: sign in, confirm personal workspace/dashboard provisioning, create a
Live Document from Home, open it, and verify signed-in collaborator presence/cursors
with a second account/session. Also confirm `?test=1` still reaches the configured
workspace for POC bootstrap.

**Files changed (P3):**
`packages/sync-backend/convex/documents.ts`, `packages/sync-backend/convex/documents.test.ts`,
`packages/sync-backend/convex/members.ts` (removed an unused validator that blocked
`build:desktop`), `apps/www/src/App.tsx`, `apps/www/src/screens/DashboardScreen.tsx`.

**Files changed (P4):**
`packages/sync-backend/convex/pocIdentity.ts`,
`packages/sync-backend/convex/pocIdentity.test.ts`,
`apps/www/src/shell/EditorView.tsx`, `apps/www/src/shell/AppShell.tsx`,
`specs/realtime-collab/PROGRESS.md`, `specs/realtime-collab/V1-EXECUTION.plan.md`.

**Checks run:** `npx convex codegen` → 0. `pnpm --filter @hubble.md/sync-backend
test` → 18 passing. `pnpm --filter @hubble.md/www typecheck` → 0.
`pnpm --filter @hubble.md/www build` → 0. `pnpm typecheck` → green.
`pnpm build:desktop` → green. `pnpm exec biome check <touched files>` → green.
Full `pnpm check` was not rerun; it previously failed on unrelated existing
formatting/import drift outside this work.

**Open questions / risks:**
- P2/P3/P4 browser smoke is still owed because the browser tool was unavailable in
  this session.
- Standalone clients use a static JWT snapshot; token refresh re-runs the AppShell
  effects (reconnect), acceptable for v1.
- Forcing auth at the root now gates the legacy non-realtime file path too; that is
  intended (auth-first; the flag/legacy path is retired in P7/D1).

## Status log
- 2026-06-30 (session-4): **P4 Production presence landed (uncommitted).** Updated
  `pocIdentity` so authenticated heartbeats derive user id/name server-side,
  authorize Live Document presence against document roles, authorize POC doc ids
  against workspace membership, and return stable colors. Preserved anonymous
  `?test=1` presence only where legacy/public access allows it. The web editor now
  always subscribes/publishes presence for signed-in sessions, filters the local
  viewer through `viewer.me`, shows signed-in collaborators in the Live Document
  header, and leaves test identity as an override only for bootstrap mode. Added
  focused presence tests (18 backend tests total). Checks: codegen, sync-backend
  tests, www typecheck/build, repo typecheck, `build:desktop`, and touched-file
  Biome all green. Browser visual smoke blocked by the in-app browser setup error.
- 2026-06-30 (session-3): **P3 Dashboard surface landed (uncommitted).** Added
  `documents.dashboard` and `documents.searchAll` aggregate queries spanning owned
  personal/team workspaces plus direct `docShares`; refactored shared-with-me
  collection through the same helper; added a dashboard regression test (15 total
  backend tests passing). Added `DashboardScreen` and routed authenticated realtime
  `/` to Recents / Private / Teams / Shared-with-me with global search and a primary
  New live document action. Removed the unused `documentRoleValidator` in
  `members.ts` because it blocked `pnpm build:desktop`. Checks: codegen, backend
  tests, www typecheck/build, repo typecheck, `build:desktop`, and touched-file
  Biome all green. Full `pnpm check` still fails on unrelated existing formatting
  drift. Browser visual smoke blocked by in-app browser setup error and missing
  Playwright CLI.
- 2026-06-30 (session-2): **Backend test net landed (uncommitted).** Next-step #1+#2
  from the prior handoff are done. Added `convex-test`/`vitest`/`@edge-runtime/vm`
  dev deps + `packages/sync-backend/vitest.config.ts` (`environment: "edge-runtime"`)
  + `test` script; excluded `*.test.ts` from `convex/tsconfig.json` (codegen typechecks
  the dir; vite-client globals aren't in the Convex env). **14 tests, all green:**
  `members.test.ts` (ensurePersonalWorkspace once+suffix; resolveInvitesForUser
  apply+consume+idempotent; inviteWorkspaceMember added/invited/unauthorized/owner-grant;
  setWorkspaceMemberRole + removeWorkspaceMember last-owner & admin-vs-owner guards),
  `documents.test.ts` (setUserShareByEmail known→share / unknown→invite),
  `sync.test.ts` (listWorkspaces anon never sees owned). Pattern: call exported helpers
  directly in `t.run(...)`; authenticate mutations via `t.withIdentity({subject: "<userId>|session"})`
  (what `getAuthUserId` parses). The `pnpm add` pulled a 2nd vite (7.3.1 via @vitest/mocker
  vs 7.3.5 elsewhere) which broke `apps/www` tsc; `pnpm dedupe` collapsed it to one.
  Checks: sync-backend `test`=14✓, `npx convex codegen`=0, `pnpm typecheck` (all pkgs)=✓,
  `pnpm --filter @hubble.md/www build`=✓. Committed `b7cf458`.
  Then ran a **headless server-side smoke** vs the dev deployment (`convex dev --once`
  to deploy current code, then a one-shot ConvexHttpClient script — not committed):
  Password `signUp` issued a JWT → the `afterUserCreatedOrUpdated` callback ran →
  exactly one personal workspace was provisioned → authed `listWorkspaces` returned
  it. This is the first end-to-end exercise of the callback (convex-test can't fire it).
  **Still owed (browser-only):** confirm the signed-in JWT threads into the *standalone*
  store/subscriber `ConvexReactClient`s (`store/actions.ts`, `createConvexSubscriber`)
  — i.e. authed file/doc sync works in the running web app. Needs a browser; no
  permitted browser tool in this session (`/browse` unavailable, chrome MCP disallowed).
  Resume in a new session at P3 (or run the browser smoke first).
- 2026-06-30: **Paused after P2 at user request.** P1 (`b5a650a`) + P2 (`39895d8`)
  committed on `v1-release`; all build/typecheck/codegen green; P2 runtime smoke +
  backend tests owed (see Handoff → Next step). Resume at Next-step #1.
- 2026-06-30: plan written, route = Phased. Starting **P1**.
- 2026-06-30: **P1 backend foundation landed (uncommitted, on `main`).**
  - B2b: `sync.listWorkspaces` no longer leaks owned workspaces to anonymous
    callers (returns only legacy `ownerId===undefined` workspaces). `sync.ts`.
  - B1b: new `invites` table (`schema.ts`) + `members.ts` shared helpers
    (`upsertWorkspaceInvite`/`upsertDocumentInvite`/`resolveInvitesForUser`);
    Convex Auth `afterUserCreatedOrUpdated` callback resolves pending invites on
    signup (`auth.ts`). `documents.setUserShareByEmail` now records a pending
    invite instead of throwing when the invitee has no account (return shape →
    `{status: "shared"|"invited", userId}`; sole caller ignores it).
  - B1: `members.ts` exports `inviteWorkspaceMember`, `setWorkspaceMemberRole`,
    `removeWorkspaceMember`, `listWorkspaceInvites`, `revokeWorkspaceInvite` —
    all owner/admin-enforced, with last-owner demote/remove guards.
  - A1f relocated to P3 (couples to dashboard consumer, not the invite foundation).
  - Verified: `npx convex codegen` (typechecks Convex fns) exit 0; `pnpm typecheck`
    across all packages green.
  - **Not committed** (on default branch `main` — branch before committing).
- Next: **P2 Web auth + routing** (premier) — depends only on landed P1.
- 2026-06-30: **P2 blast-radius finding (verified in code).** The release plan's
  A1b ("move ConvexAuthProvider up to root") undersizes P2. `url` is threaded past
  the React provider into standalone clients: `AppShell` builds
  `new ConvexReactClient(url)` (`:68`) AND the store/subscriber layer builds its own
  `createConvexBackend(url)` / `createConvexSubscriber(url, authToken?)` /
  `ConvexHttpClient(url)` (`store/actions.ts:30,66,68`) — all called **without an
  auth token today**. They work now only against legacy/anonymous workspaces. Auth-
  first owned workspaces require the signed-in Convex Auth JWT threaded into those
  standalone clients (`createConvexBackend`/`createConvexSubscriber` already accept
  `authToken`; the web app just never supplies it). So P2 scope = root provider lift
  **+ auth-token threading into the store/subscriber layer** + ConnectScreen removal
  + A1d personal-workspace auto-provision. Files: `App.tsx`, `main.tsx`,
  `shell/AppShell.tsx`, `store/actions.ts`, `connection/connection.ts`, possibly
  `packages/convex-client`. Recommended token source: `useAuthToken()` from
  `@convex-dev/auth/react` (root provider owns the session) passed into store init.
