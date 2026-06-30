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
| P3 Dashboard surface | next | — | — | Includes A1f aggregate queries (relocated from P1). Depends on P2. |
| P4 Production presence | pending | — | — | A3 launch-critical; un-gate presence from `testIdentity`. Depends on P2. |
| P5 Completeness | pending | — | — | A5 auto-snapshot + @mention picker, B1c member UI, A4 onboarding. Delegable. |
| P6 Hardening | pending | — | — | B2 permission regression suite, B3 session edges, D6 cap UX. |
| P7 Launch gate | pending | — | — | C1/C2 QA, D1 flag delete (LAST), D2 merge, D3/D4 deploy, D5 ops, D7 signup cap. |

## Handoff

**Current state:** P1 committed (`b5a650a`) and P2 implemented on branch
`v1-release`. P2: the web app is now auth-first — a single root
`ConvexReactClient` from `VITE_CONVEX_URL`, `ConvexAuthProvider` + auth gate at the
router root (`App.tsx`), `ConnectScreen` deleted (URL baked in), `SignInScreen`/
`SignOutButton`/`AuthStatus` moved to `apps/www/src/auth/AuthScreens.tsx`, `AppShell`
no longer creates its own provider/client and threads the JWT (`useAuthToken()`)
into the standalone store/subscriber clients (`store/actions.ts`,
`createConvexSubscriber`). A1d: `members.ensurePersonalWorkspace` auto-provisions a
private workspace from the signup callback. `OpenWorkspaceScreen` rewritten to authed
`useQuery`/`useMutation` and is the post-auth landing until P3's dashboard
(auto-selects the single personal workspace). `?test=1` stays an anonymous bypass.

**Next step (ordered — stopped here at user request to document before continuing):**

1. **Set up Convex backend test infra** (does not exist yet — no `convex-test`,
   no vitest config, no `*.test.ts` under `packages/sync-backend`). Add dev deps
   `convex-test`, `vitest`, `@edge-runtime/vm`; add `packages/sync-backend/vitest.config.ts`
   with `environment: "edge-runtime"`; add a `test` script. Pattern: `convexTest(schema,
   import.meta.glob("./**/*.ts"))` per the Convex testing guidelines. NOTE: the auth
   `afterUserCreatedOrUpdated` callback isn't trivially invokable from `convex-test`;
   test the **helpers directly** by exercising the exported mutations and by calling
   the resolution path via a thin test harness, or test `resolveInvitesForUser` /
   `ensurePersonalWorkspace` logic through the public mutations that touch the same
   tables.

2. **Write backend tests (P1/P2 logic):**
   - `resolveInvitesForUser`: workspace invite + doc invite by email → on resolve,
     a `members` row / `docShares` row appears and the `invites` row is consumed.
     Idempotent on repeat.
   - `ensurePersonalWorkspace`: first call creates one `personal` workspace + owner
     membership; second call is a no-op (no duplicate); name collisions get suffixed.
   - `inviteWorkspaceMember`: existing user → `members` row (`status:"added"`);
     unknown email → pending `invites` row (`status:"invited"`). Non-owner/admin →
     Unauthorized. Only owner can grant `owner`.
   - `setWorkspaceMemberRole` / `removeWorkspaceMember`: last-owner demote/remove
     guards throw; admin cannot remove an owner.
   - `setUserShareByEmail`: unknown email creates a document invite (no throw);
     known email creates the `docShares` row.
   - `sync.listWorkspaces`: anonymous caller never sees an owned workspace.

3. **Browser smoke of P2** (human, owed): `pnpm --filter @hubble.md/www dev`, sign up
   a fresh account → personal workspace provisions → you land in it → authed file/doc
   queries return data (confirms JWT threading). Two-account share/invite resolves on
   the invitee's signup.

4. **Then P3 Dashboard:** A1f aggregate queries (cross-workspace recents + global
   search over owned/member workspaces + `docShares`), then the Home surface at `/`
   (Recents · Private [`workspaces.personal`] · Teams · Shared-with-me) replacing the
   `OpenWorkspaceScreen` redirect, and make Live Documents the primary navigable object.

**Files changed (P2, uncommitted until this turn's commit):**
`packages/sync-backend/convex/{schema.ts,members.ts,auth.ts,_generated/api.d.ts}`;
`apps/www/src/{App.tsx,shell/AppShell.tsx,store/actions.ts,connection/connection.ts,
vite-env.d.ts,auth/AuthScreens.tsx(new)}`; `apps/www/src/screens/OpenWorkspaceScreen.tsx`
(rewritten); `apps/www/src/screens/ConnectScreen.tsx` (deleted);
`apps/www/.env.example` (+ `.env.local`, gitignored). The pre-existing
`withTestSearch` App.tsx change is subsumed by the rewrite.

**Checks run:** `npx convex codegen` → exit 0 (schema personal/by_owner + callbacks).
`pnpm --filter @hubble.md/www typecheck` → 0. `pnpm --filter @hubble.md/www build`
→ 0. `pnpm typecheck` (11 packages) → green. No runtime/browser smoke yet.

**Open questions / risks:**
- P2 is type/build-verified only; the auth happy-path + token threading need a
  runtime smoke (above) before being trusted in P3.
- Standalone clients use a static JWT snapshot; token refresh re-runs the AppShell
  effects (reconnect), acceptable for v1.
- Forcing auth at the root now gates the legacy non-realtime file path too; that is
  intended (auth-first; the flag/legacy path is retired in P7/D1).

## Status log
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
