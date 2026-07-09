# Hubble v1 Release Plan — "Google Docs for markdown, with agents"

> **⚑ REORDERED (2026-07-03) by the repo-brain direction.** A discovery session
> repositioned v1: **repo-first** (not web-dashboard-first), **all-cloud / no
> git-mirroring**, and a **Workspace ⊃ Folders ⊃ Docs** model. The feature
> inventory below (teams, permissions, history, presence, desktop layer) is still
> valid work, but the **web-first front door** and the "all open scope decisions
> resolved / plan fully specified" claim are **superseded**. See
> `REPO-BRAIN-VISION.md` and `REPO-BRAIN-RATIONALE.md` for the current framing.

> **Author intent (2026-06-30).** You can start anywhere. On the **web** you land
> on a dashboard that feels like Google Docs: your documents, your private files,
> shared team folders. Create a doc, share it, a collaborator opens it and you see
> their cursor live. If you install the **optional desktop app**, those same
> documents also live on your local disk and are editable by your agent (Claude
> Code, Hermes, or you by hand in any editor); every edit round-trips to all
> surfaces and collaborators. Same document, one cloud authority, two access
> surfaces. The desktop app is optional; the web is the complete product on its
> own.

## TL;DR — where this actually stands

The realtime-collab fork has built **most** of the v1 feature surface on this
branch (flag-gated behind `VITE_HUBBLE_REALTIME_COLLAB`, ahead of `main`, verified
locally + on hosted dev `strong-setter-709`). It is **mostly** a
**finish / harden / un-gate / ship** plan — but a Codex second-opinion pass
(2026-06-30, verified in code) corrected an over-optimistic framing. There are
**three genuinely-new build surfaces**, not two, plus two completeness gaps in
features I'd called "built":

- **A1 — the Docs-style, auth-first dashboard** (does not exist).
- **B1 — team membership write-path + invite flow** (no exported mutations/UI).
- **A3 — production realtime presence/cursors** (the headline feature is wired to
  a `?test=1` POC identity, *not* signed-in users — see A3). **Launch-critical.**

Completeness gaps: **version history** only snapshots on agent/external patches,
not normal in-app co-editing (near-empty in real use); **@mention autocomplete**
has no UI. See `PROGRESS.md` for the per-task build state this builds on.

## Scope decisions (locked 2026-06-30)

| Decision | v1 | Why / note |
|---|---|---|
| Teams + folders + roles | **In** | Full Stage 3. `workspaces`/`members`/`docShares` + per-doc roles already modeled & enforced (RD4/RD8). |
| Version history + restore | **In (needs auto-snapshot)** | Storage/restore/UI built, but only snapshots on agent patches — **no auto-materialization for in-app edits** (A5). |
| Comments + @mentions | **In (needs @ picker)** | `commentThreads`/`comments` + `notifyMentions` built; **@mention autocomplete UI missing** (A5). |
| Agent integration | **File-reconcile only** | Reuses the proven desktop watcher → base-cache-diff → scoped-patch → CRDT path. Works with *any* agent/editor. |
| Auth provider | **Convex Auth (CONFIRMED 2026-06-30)** | Already wired end-to-end across web + desktop. |
| Offline edit + merge | **Deferred (fast-follow)** | v1 boundary already set in RD6: external-file offline queue is in; full app-restart-while-offline is deferred. |
| Export (PDF/docx) | **Deferred** | Markdown projection exists; rich export is post-v1. |
| MCP / native agent patch API | **Deferred (fast-follow)** | Built (RD12) but not the v1 agent story; ship after launch. |
| Large documents (>256 KiB) | **Deferred** | v1 ships with the 256 KiB Live Document cap (RD5); storage/revision redesign is post-v1. |
| Desktop platforms | **macOS only** | Packaged + codesigned today. Windows/Linux post-v1. |

## Auth recommendation: keep **Convex Auth** for v1

You asked me to decide between Clerk and Convex Auth. **Recommendation: Convex
Auth.** Rationale grounded in the current build:

- It is **already wired end-to-end**: web sign-in *and* sign-up (`AppShell` auth
  screen), desktop **JWT-over-IPC** contract (RT1), authenticated main-process
  `SyncBackend`, and server-side enforcement on every query/mutation (RD4/RD8).
- The **team/membership/sharing model is home-grown in Convex and working**
  (`members`, `docShares`, invite-by-email, link sharing). Clerk's headline win —
  hosted Organizations + invite UI — is largely **redundant** with what's built,
  and adopting it would mean **re-plumbing desktop auth** and mirroring orgs into
  Convex for the per-doc role checks you still have to do in Convex anyway.
- Net: Clerk adds vendor cost + a migration detour for marginal v1 benefit.

**Revisit Clerk/WorkOS only if** enterprise SSO/SAML becomes a launch requirement
(sales-driven). This is the single reversible decision in the plan; the rest of v1
does not depend on it.

---

## Workstreams

Five tracks. Tracks A–C are the v1 critical path; D is the launch gate; E is the
explicit not-in-v1 list so scope stays honest.

### Track A — Web "feels like Google Docs" (critical path)

Goal: the dashboard-first experience your vision leads with. **A1 (dashboard) and
A3 (production presence/cursors) are genuinely new construction**; A5 has real
completeness gaps (version-history auto-snapshot, @mention picker); A2/A4 are
polish over built pieces.

**A1 audit finding (2026-06-30):** the data layer is all there, but the web entry
flow is developer-shaped, not consumer-shaped. Today: `/` → `ConnectScreen` ("paste
your Convex URL") → `OpenWorkspaceScreen` (pick ONE workspace) → `AppShell` →
(only then) `SignInScreen` → land *inside a single workspace*. There is **no
cross-everything home**, auth happens **last** (buried in `AppShell.tsx:232–248`),
and the user is asked for a deployment URL. The Docs-style dashboard must be built.

- **A1a. Bake in the Convex URL + delete `ConnectScreen`** from the consumer web
  flow (env var; never shown to users). `apps/www/src/screens/ConnectScreen.tsx`,
  `App.tsx` routing.
- **A1b. Lift auth to the router root.** `/` unauthenticated → sign-in/sign-up;
  authenticated → dashboard. Move `ConvexAuthProvider` + the auth gate out of
  per-workspace `AppShell` up to the app root (`App.tsx`).
- **A1c. Build the Dashboard/Home surface** composing existing queries:
  **Recents** · **Private** space · **Teams** (your workspaces via
  `sync.listWorkspaces`) · **Shared with me** (`documents.listSharedWithMe` —
  exists, currently only wired to the *desktop* synced folder) · create-doc →
  share · search (`documents.search`).
- **A1d. Auto-provision a personal workspace on signup** — the vision's "files
  private to your account" has no home today (users must manually create a
  workspace in `OpenWorkspaceScreen`).
- **A1e. Make Live Documents the primary navigable object**; retire the legacy
  file-list sidebar for the realtime product (couples to **D1** flag deletion —
  the file-sync UI *is* the non-realtime path).
- **A1f. Backend: add aggregate queries** spanning a user's workspaces + shares for
  cross-everything **recents** and **global search** (most current queries are
  per-workspace). Contained addition, not a rearchitecture.
- **A2. Create → share → co-edit happy path polish.** New doc, share dialog
  (by-email + link), collaborator opens, presence cursors appear. Tighten latency,
  empty states, and the share dialog copy/affordances (`Sidebar.tsx`
  `ShareDocumentDialog`).
- **A3. Production realtime presence/cursors — NEW BUILD, launch-critical.**
  *(Codex finding, verified 2026-06-30.)* Cursors are currently wired to the
  `?test=1` POC identity, not signed-in users: the presence query is
  `testIdentity ? {docId} : "skip"` (`EditorView.tsx:146`), remote cursors render
  only `if (testIdentity)` (`:160`), and the heartbeat publishes only
  `if (testIdentity)` (`:179`). The API is `api.pocIdentity.*` and the UI is
  `LivePocIdentityBar`. **A real signed-in user broadcasts/sees no cursor.** Work:
  source presence identity from the authenticated Convex viewer (not `testIdentity`),
  un-gate heartbeat + `listActive`, and give real users stable name/color. This is
  the headline differentiator and is in the release gate — **must land before D1
  flag deletion.** *(Then the fidelity polish: color stability, labels, selection
  highlights, heartbeat tuning.)*
- **A4. Onboarding/first-run.** Sign-up → first workspace → first doc with zero
  dead ends. (Sign-up mode exists; the *flow* needs a deliberate pass.)
- **A5. Comments + version history — completeness, not just polish.**
  *(Codex finding, verified 2026-06-30.)* Two gaps in features I'd called "built":
  - **Version history auto-materialization is missing.** Revisions only snapshot on
    `applyPatch` (agent/file-reconcile) and pre-`restoreRevision`
    (`documents.ts:564, 884`); normal in-app co-editing only calls `markEdited`
    (metadata). So the history panel is near-empty in real human use. Add automatic
    snapshotting (debounced trigger or cron materializing the prosemirror doc as a
    `revisions` row) before claiming history as a release gate — or cut it from v1.
  - **@mention autocomplete has no UI** — the comment input is a bare textarea
    placeholder; mentions only fire on exact email/name typed manually (backend
    parse + notify works). Add a mention picker, or document the limitation.
  - Then the usability pass: comment panel, version-history browse/restore.

### Track B — Teams & permissions completeness (critical path)

**B audit finding (2026-06-30):** per-*document* sharing is complete, but per-*team*
(workspace) membership has **no write path and no UI**. The `members` table + roles
+ `listWorkspaceMembers` exist, but `ensureWorkspaceMember` is internal-only — there
is no exported invite/add/remove/set-role mutation, `listWorkspaceMembers` is never
called by the web app, and `WorkspaceSwitcher` only switches/creates. This is the
second genuinely-new build surface (smaller than A1, mostly backend).

- **B1. Workspace-member mutations.** Add exported, enforced mutations:
  invite/add member, set-role, remove member (`sync.ts`). Make
  `ensureWorkspaceMember`'s capability reachable from the product.
- **B1b. Pending-invite-by-email + accept-on-signup.** *Shared infrastructure.*
  Today `setUserShareByEmail` **throws if the invitee has no account**
  (`documents.ts:1398`) and `members` requires an existing `userId` — so you can
  only share/invite *existing* users. Build a pending-invite model keyed by email,
  resolved on signup, used by **both** team invites and doc sharing. *(This is the
  meaty piece of Track B.)*
- **B1c. Member-management UI** reachable from the dashboard/workspace
  (list members, change roles, remove, invite) — wires the unused
  `listWorkspaceMembers` query.
- **B2. Permission-enforcement regression suite.** RD4/RD8 hardened the server;
  lock it with tests asserting a viewer never receives editable steps, commenter
  can't edit, link scopes behave, trash authorizes per deleted-doc role.
- **B2b. Fix `listWorkspaces` anon leak.** `sync.ts:132` returns *all* workspaces
  to unauthenticated callers — return `[]` (or require auth). *(Minor adjacent:
  `setUserShareByEmail` full-scans `users`; add an email index later.)*
- **B3. Sign-out / multi-account / session edge cases** across web + desktop.

### Track C — Desktop optional layer + agent file-reconcile (critical path)

- **C1. Two-machine cross-surface QA as a release gate.** Run
  `TWO-MACHINE-TEST-PROMPT.md` end-to-end **plus** the missing half: open the
  *same* `documentId` in the in-app realtime editor on one machine while the other
  edits the synced file on disk; confirm round-trip + that cursors show in-app and
  the file updates on disk. This is the test that proves "same document, two
  surfaces."
- **C2. Agent file-reconcile acceptance.** Drive Claude Code editing a synced
  `.md`; confirm watcher → `reconcileProjectionFile` → `documents.applyPatch` →
  live propagation to web collaborators, with conflict-copy fallback on stale
  base. (`packages/sync/src/reconcile.ts`, `syncedFolderService.ts`.)
- **C3. Desktop release artifact.** RD9 produced a codesigned macOS DMG;
  finish **notarization** (operator-gated on GitHub Actions secrets) and cut the
  `desktop-v<version>` release tag.

### Track D — Production launch gate

- **D1. Delete the flag — realtime IS the product (decided 2026-06-30).** Remove
  `VITE_HUBBLE_REALTIME_COLLAB` entirely (no kill-switch): delete
  `apps/www/src/realtimeFlag.ts` and every gate/branch that reads it across web +
  desktop env, and drop any now-dead non-realtime code path. **Prerequisite (Codex
  finding):** the flag currently *hides* the POC presence (A3) and the
  developer-shaped entry flow (A1). Do **not** delete it until **A1, A3, and B1
  have landed** — removing it sooner exposes broken cursors and a dev entry flow
  with no rollback. Flag deletion is the **last** launch step. Implication: with no
  feature-flag fallback, **the QA gates (Tracks A/B/C green) are the only safety
  net** — they must pass before D2 merge and D4 deploy. (RD10 added the gate; v1
  removes it.)
- **D2. Merge to `main`.** The branch is ~ahead of `main`; land it behind the
  decided flag state. Re-run `pnpm typecheck` + `pnpm build:desktop` + web
  build + Convex codegen/typecheck as the merge gate.
- **D3. Production Convex deployment (greenfield).** Promote the widened
  schema/component (RD3 verified on hosted dev) to the production deployment.
  **No backfill / migration needed — there is no real production data yet
  (confirmed 2026-06-30).** Production is a clean start; skip the legacy-file
  import policy.
- **D4. Web hosting/deploy.** Deploy `apps/www` (the product app) and confirm the
  marketing `apps/web` ↔ product handoff. Set production `VITE_CONVEX_URL`.
- **D5. Monitoring/on-call.** RD11 ships local telemetry + `OPERATIONS.md`
  runbook; **select the external alert sink** (the named post-release follow-up)
  and wire error reporting before broad signups.
- **D6. Doc-size cap UX.** Confirm the 256 KiB Live Document cap fails gracefully
  with a clear user message at every entry (import/patch/conversion — RD5 landed
  enforcement; verify the *message* is humane).
- **D7. Open signups, throttled to 100/day (decided 2026-06-30).** Launch with
  **open** sign-up (no invite gate), but enforce a **100 new accounts/day** cap so
  growth stays inside the monitoring + cost envelope. Implement as a server-side
  daily counter on the sign-up path (Convex Auth) with a friendly "we're at
  capacity today, try tomorrow" message past the cap.

### Track E — Explicitly NOT in v1 (fast-follow backlog)

1. **MCP / native agent patch API** as the agent story (RD12 exists; promote
   post-launch). v1 agents go through the file.
2. **Full offline** (app-restart while Convex unreachable; app-shell offline cache
   + editor replay).
3. **Large-document support** (>256 KiB; storage/revision redesign).
4. **Export to PDF/docx**; advanced import.
5. **Windows/Linux desktop**.
6. **Admin/audit/DLP, suggestion-mode-for-trusted-agents auto-apply** beyond
   what's already wired.

---

## Release gates (definition of "v1 done")

v1 ships when **all** of these pass on the production deployment:

1. **Web-only path:** sign up → land on a Docs-like dashboard → create doc →
   share by email + link → second account sees live cursors and co-edits
   conflict-free. No desktop required.
2. **Teams:** create/join a team workspace, assign roles, a viewer provably
   cannot edit.
3. **History + comments:** restore a prior revision; comment with an @mention that
   notifies the mentioned user.
4. **Desktop optional layer:** install → sign in → synced folder materializes →
   external editor save round-trips to a web collaborator within seconds → an
   agent edit on disk propagates live → `find` for `.conflict-*`/`.local-edit-*`
   returns nothing (the two-machine test, extended with the in-app editor).
5. **Boundaries hold gracefully:** 256 KiB cap message is clear; offline behaves
   to the RD6 boundary without data loss.
6. **Ops:** error/alert sink live; `OPERATIONS.md` runbook current.

## Suggested sequencing

1. **Confirm auth = Convex Auth** (1 decision) → unblocks everything.
2. **Track A1 dashboard audit + Track B1 team UX audit in parallel** — these size
   the only real remaining UX work; everything else is polish.
3. Polish passes (A2–A5, B2–B3) alongside **C1/C2 cross-surface QA**.
4. **Track D launch gate** once A/B/C are green: flip flag → merge → deploy →
   notarize → monitor.

## Open items needing your input

- ~~**Auth**~~ → **Resolved: Convex Auth** (2026-06-30).
- ~~**Backfill policy (D3)**~~ → **Resolved: greenfield, no real data yet** — no
  migration (2026-06-30).
- ~~**Launch audience**~~ → **Resolved: open signups, capped at 100/day** (D7,
  2026-06-30).
- ~~**Flag state (D1)**~~ → **Resolved: delete the flag, realtime is the product**
  (2026-06-30). No kill-switch — QA gates are the safety net.

**All open scope decisions are now resolved.** The plan is fully specified.

## Considered & rejected for v1

- **lunora / self-hosted Cloudflare sync engine** (anolilab/lunora, eval
  2026-06-30). A row/record-level sync engine ("Convex DX on your own Cloudflare,"
  shapes + custom mutators + poke diff protocol, **explicitly no CRDT**). Rejected
  for v1: (1) it does **not** solve in-document rich-text merge — our hard center,
  which `@convex-dev/prosemirror-sync` already covers; (2) it is **alpha /
  bootstrap-quality** ("APIs WILL break"); (3) adopting it means **abandoning the
  validated Convex stack**. The one idea worth revisiting **post-v1**: its
  "own-your-infra instead of a SaaS sync vendor" stance (Convex lock-in / cost /
  data-residency) and the elegant "a shape doubles as a read-permission" pattern.
