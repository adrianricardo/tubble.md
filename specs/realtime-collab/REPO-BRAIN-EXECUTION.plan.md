# Repo-Brain v1 — Orchestration Execution Plan

> Written 2026-07-03 via `/orchestrate`. Executes the repo-brain pivot decided in
> `REPO-BRAIN-VISION.md` (Decided #1–15) and `REPO-BRAIN-RATIONALE.md` (D1–D15).
> Those docs are the *what/why*; this is the *how/when*. Per D15 this plan also
> absorbs the deferred `V1-EXECUTION.plan.md` P7 operator gates into its final
> phase — there is **one** launch, and it is repo-first.
>
> **Dispatch-ready:** each phase section is a self-contained brief (objective,
> exact files, work items, acceptance, verify commands). Session shape: **four
> implementation sessions**, not one per phase — RB1 alone (the gate), then RB2
> in one session parallel with RB3→RB4→RB5 carried in a single session (they
> share the desktop sync surface), then RB6, then RB7. Tier mapping:
> **premier** = Opus 4.8 / `gpt-5.5` high effort · **standard** = Sonnet 4.6 /
> `gpt-5.5` medium · **economy** = Haiku 4.5 / `gpt-5.5` minimal.
>
> **Session discipline** (same as `ORCHESTRATION-NOTES.md`): implementers do not
> edit this file's Progress/Handoff except their own row + handoff block at
> completion; run the verify commands before marking done; **read
> `packages/sync-backend/convex/_generated/ai/guidelines.md` before touching any
> Convex code** (repo CLAUDE.md requirement); `pnpm check` is known-red on
> pre-existing formatting drift — it is not a gate, the listed commands are.

## Goal

Ship the v1 happy path in `REPO-BRAIN-VISION.md`: a dev links a repo to a Hubble
folder (local-path mount, D11), seeds it manually + auto `BRAIN.md` (D13/D14),
shares the folder via invite link (Drive-style guest, D12); the guest joins on
web with zero install, then installs the desktop app, gets a synced projection of
just their shared subtree, points their local agent at it, and edits round-trip
live to everyone. Then deploy everything as one repo-first launch (D15).

## Non-goals (explicitly out, per VISION "Rejected / deferred")

Git-export; local MCP server; cloud-hosted agent support; embedded agent chat;
repo imports or agent-drafted seeding; GitHub/OAuth integration of any kind;
`BRAIN.md` regeneration/refresh; web-first front door work; Windows/Linux
desktop; >256 KiB docs.

## State grounding (verified in code 2026-07-03)

- **Branch:** `v1-release`. Web-first P1–P7 code-complete (`V1-EXECUTION.plan.md`);
  P7 operator gates (deploy/QA/ops) deferred into RB7 here (D15). Production
  signed-in presence/cursors landed. Uncommitted working-tree changes exist from
  the desktop-native-live-documents slice — commit or stash before starting RB1.
- **Folders exist:** `schema.ts:87` `folders` table with `parentId` nesting +
  `by_workspace_parent` index; CRUD in `convex/folders.ts` (list/create/rename/
  move/delete); `documents.folderId` optional field + `by_workspace_folder` index.
- **Authorization has one seam:** `convex/permissions.ts` — `documentRole()`
  (`permissions.ts:59`) is the single resolution point every
  query/mutation/prosemirror hook uses (additive role-max pattern already there).
  Folder inheritance plugs in here and nowhere else.
- **Sharing today is per-doc:** `docShares` (userId XOR linkScope
  `workspace|public`). No folder shares, no repo-link metadata.
- **Invites:** `invites` table + `members.ts` helpers
  (`upsertWorkspaceInvite`/`upsertDocumentInvite`/`resolveInvitesForUser`),
  resolved in `auth.ts` `afterUserCreatedOrUpdated`. **No invite-link route
  exists in the web app** — email invites resolve only at signup.
- **Guest blockers:** `documents.create` requires workspace membership
  (`documents.ts:1516`); `folders.list` and friends are workspace-gated; a
  folder-share guest can currently reach nothing.
- **Desktop materialization (RD2):** `SyncBackend.getSharedWithMe()` feeds a
  **flat** reserved `Shared with me/` dir of individually-shared docs
  (`packages/sync/src/syncedFolder*.ts`). No subtree materialization.
- **Sync engine assumes one root:** `packages/sync/src/sync.ts` is keyed to a
  single `syncRoot` (base cache at `liveDocumentBaseCacheRoot(syncRoot)`). The
  in-repo mount (D11) needs either multi-root support or one engine instance per
  mount.

## Route: **Phased**, with two parallel tracks after the RB1 gate

**Why not Delegated from the start:** RB1 makes the blocking decision (the
`folderShares` shape + inheritance semantics) that every other phase conforms
to, and the backend phases all write the same small file set
(`schema.ts`, `permissions.ts`, `folders.ts`, `documents.ts`, `members.ts`).
**Why not one long Direct session:** after RB1 lands, the web track (RB2) and
the desktop track (RB3→RB4→RB5) are file-disjoint (`apps/www` vs
`apps/desktop`+`packages/sync`) and separately testable — true parallel payoff
for two sessions. Cap parallelism at those two tracks.

## Phase table

| ID | Phase | Tier | Depends on | Output / handoff |
|----|-------|------|------------|------------------|
| **RB1** | Folder-share backend foundation: `folderShares` schema, Drive-style subtree resolution in `permissions.ts`, share/invite mutations, guest read+create paths | premier | — | The locked API shape (names/args/return types listed in Handoff) that RB2 and RB4 consume. |
| **RB2** | Web guest experience: folder share dialog + copy-link, invite-link join route, guest dashboard/subtree nav, guest doc-create | standard | RB1 | Guest can join by link and work on web, zero install. Runs **parallel** to RB3–RB5. |
| **RB3** | Desktop repo-link mount (D11): multi-root architecture decision, pick folder + local repo path, materialize projection in-repo, `.git/info/exclude`, per-machine config, cloud display metadata | **premier** | RB1 | Dev's brain lives inside the repo tree; watcher round-trip works from the mount. |
| **RB4** | Guest subtree materialization + revocation cleanup: upgrade flat `Shared with me/` to shared-folder subtrees; remove projections on revoke | standard | RB1, RB3 | Guest desktop mirrors exactly their shared subtree. |
| **RB5** | `BRAIN.md` seed-once (D13/D14): template + create-at-link-time as a normal Live Document | economy | RB3 | Agent-context file in every new brain. |
| **RB6** | Guest onboarding path + wedge copy: link → web landing → sign-up → shared folder; "bring your agent" desktop prompt; empty states; revocability copy audit (D4/D5 wording) | standard | RB2, RB4 | No dead ends for the non-technical persona. |
| **RB7** | Launch gate: guest-scenario QA + permission regression extension, owed browser smokes, then the deferred V1-EXECUTION P7 gates (D3 prod Convex, D4 web deploy, D5 ops sink, C3 notarization, release ops) | premier judgment + operator | RB1–RB6 | Production repo-first v1. |

---

## Phase details (dispatch briefs)

### RB1 — Folder-share backend foundation *(premier)*

**Objective:** implement D12 exactly: a folder invite creates an ACL entry, not
a membership; roles inherit down the subtree, resolved at authorization time;
direct shares add, never subtract; docs created inside inherit; revocation is
share-row removal (materialization cleanup is RB4's job).

**Files:** `packages/sync-backend/convex/{schema,permissions,folders,documents,members,auth,prosemirror}.ts`
+ tests (`documents.test.ts`, new `folders.test.ts`), regenerate via codegen.
Also **`packages/convex-client/src/index.ts`** and
**`packages/sync/src/backend.ts`**: `createConvexBackend()` adapts
`api.documents.listSharedWithMe` / `api.folders.list` for desktop
(`index.ts:97,276`) — changing the `listSharedWithMe` shape without updating
the adapter + `SyncBackend` types breaks the desktop build. Update them
mechanically here so every phase inherits a green build; RB4 consumes.

**Work items:**

1. **Schema.** `folderShares` table mirroring `docShares`: `folderId`,
   `userId?` XOR `linkScope?` (`"public"` only — workspace-scope adds nothing a
   member doesn't have), `role`, timestamps; indexes `by_folder`,
   `by_folder_user`, `by_folder_link`, `by_user`. Roles: user shares may be
   owner/editor/commenter/viewer; **link shares are capped at
   viewer/commenter/editor — never owner** (an inherited folder owner can manage
   shares, so a public owner link would be a leaked management capability;
   matches the existing doc link-share UI in `Sidebar.tsx:88`). Add
   repo-link **display metadata** to `folders`: `repoName?`, `repoRemoteUrl?`
   (strings; the local path is per-machine desktop config, never in the cloud —
   D11). Extend `invites` for folder invites (`folderId?` target, mirroring the
   document-invite shape in `members.ts`).
2. **Resolution.** In `permissions.ts`, add `folderRole(ctx, folderId)`: walk
   `parentId` ancestors (cycle guard + depth cap ~64), take role-max across
   `folderShares` rows for the user + public link shares, using the existing
   `roleRank`/`setRole` additive pattern. Extend `documentRole()`
   (`permissions.ts:59`): if `document.folderId`, fold in
   `folderRole(document.folderId)`. Additive only — inherited access is never
   subtracted (D12). Keep it one seam: no per-callsite folder checks anywhere
   else — but verify the prosemirror read/write hooks (`prosemirror.ts:25`)
   flow through it and cover them in tests. Read-amplification: the walk runs
   on the authorize hot path; Convex ctx has no request-local cache, so use a
   local `Map` inside list-shaped helpers (or a small resolver object threaded
   through one query execution) and keep the depth cap documented.
3. **Mutations** in `folders.ts` (enforced: workspace owner/admin or an
   inherited folder `owner`): `setFolderUserShare`, `setFolderUserShareByEmail`
   (unknown email → pending folder invite via a new `upsertFolderInvite` in
   `members.ts`, resolved in `auth.ts` `afterUserCreatedOrUpdated` — extend
   `resolveInvitesForUser`), `removeFolderUserShare`, `setFolderLinkShare` /
   `clearFolderLinkShare`, `listFolderShares`, and `setFolderRepoLink`
   (display metadata; any folder-editor may set).
4. **Guest read path — exact API list** (all workspace-gated today; each gains
   a folder-role path or a guest-safe variant):
   - `documents.listSharedWithMe` → returns **top-most shared folder nodes**
     (plus existing per-doc shares), each with the subtree's folders + docs,
     resolved role, and relative path — one shape serving both the web
     dashboard (RB2) and desktop materialization (RB4).
   - New `folders.listSubtree(folderId)` authorized by `folderRole` (replaces
     guest use of workspace-gated `folders.list`, `folders.ts:12`).
   - `documents.listWithMarkdown` (`documents.ts:1240`) and `documents.search`
     (`documents.ts:1368`): accept a folder-scoped guest path or add scoped
     variants — a guest search must cover exactly their shared subtrees.
   - `folders.rename/move/remove/restore`: allow inherited `editor`+ within the
     subtree; **moves that would escape the shared subtree are denied for
     guests** (they have no destination rights).
5. **Guest + folder-aware create.** `documents.create` (`documents.ts:1508`)
   today accepts only `workspaceId`/`title`/`path`/`actor` and creates no
   content. Extend it (or add a sibling mutation): accept `folderId` and
   optional initial markdown (converted through the existing import path) —
   authorized by workspace membership **or** inherited `editor`+ on
   `folderId`. This is also the seam RB5's `BRAIN.md` seeding calls, so it
   lands here, not in the economy phase. Same for `folders.create` under a
   shared parent. Created docs/folders get no extra share rows — they inherit
   (D12).
6. **Tests** (convex-test, patterns in `documents.test.ts`): inheritance depth,
   additive-never-subtract (direct viewer + inherited editor ⇒ editor),
   revocation removes subtree access, public folder link, guest create inside /
   denied outside, cycle guard, non-member sees nothing un-shared, and extend the
   existing permission regression suite so prosemirror sync + comments + trash
   honor inherited roles.

**Acceptance:** all tests green; a user with zero memberships but one
`folderShares` row can list/read/edit (per role) every doc in the subtree,
create docs inside it, and nothing outside it.

**Verify:** `npx convex codegen` · `pnpm --filter @hubble.md/sync-backend test`
· `pnpm typecheck` · `pnpm --filter @hubble.md/www build` · `pnpm build:desktop`.

**Handoff for RB2/RB4 (completed 2026-07-03):**

*Roles:* `DocumentRole = "owner" | "editor" | "commenter" | "viewer"`. User
folder shares may use any of the four; **link shares are capped at
editor/commenter/viewer** (never owner).

*Permissions seam (`convex/permissions.ts`):*
- `folderRole(ctx, folderId, options?: { cache?: FolderRoleCache }) → Promise<DocumentRole|null>`
  — Drive-style ancestor walk (additive role-max, cycle guard, depth cap
  `FOLDER_INHERITANCE_DEPTH_CAP = 64`). `FolderRoleCache = Map<Id<"folders">, DocumentRole|null>`.
- `documentRole(ctx, documentId, options?: { includeDeleted?; folderCache? })` now folds in
  `folderRole(document.folderId)` for every identity (incl. anonymous public-folder-link visitors).
  This is the ONLY seam — `prosemirror.ts` read/write hooks, comments, trash all flow through it.

*Folder share + repo-link mutations (`convex/folders.ts`); auth = workspace
owner/admin OR inherited folder `owner`, except `setFolderRepoLink` = any folder editor:*
- `setFolderUserShare({ folderId, userId, role: DocumentRole }) → null`
- `setFolderUserShareByEmail({ folderId, email, role: DocumentRole }) → { status: "shared"; userId } | { status: "invited"; userId: null }` (unknown email → pending folder invite, resolved at signup)
- `removeFolderUserShare({ folderId, userId }) → null`
- `setFolderLinkShare({ folderId, role: "editor"|"commenter"|"viewer" }) → null` (linkScope is always `"public"`)
- `clearFolderLinkShare({ folderId }) → null`
- `listFolderShares({ folderId }) → Array<folderShares row & { user: Doc<"users">|null }>`
- `setFolderRepoLink({ folderId, repoName?, repoRemoteUrl? }) → null` (display metadata only; local path never stored)

*Guest-safe folder CRUD (`convex/folders.ts`); guests need inherited `editor`+, moves that escape the shared subtree are denied:*
- `create({ workspaceId, parentId?, name, actor? }) → Id<"folders">`
- `rename({ folderId, name }) → null`
- `move({ folderId, parentId? }) → null` (new; cycle-safe; guest → root denied)
- `remove({ folderId }) → null`, `restoreRemoved({ folderId }) → null`
- `moveDocument({ documentId, folderId? }) → null` (guest → root/foreign-folder denied)

*Guest read paths:*
- `folders.listSubtree({ folderId }) → { folder: { _id, name, workspaceId, parentId, repoName, repoRemoteUrl }, role, canWrite, folders: Array<{ _id, name, parentId, relativePath }>, documents: Array<{ _id, title, path, folderId, updatedAt, updatedBy, relativePath }> } | null` (authorized by `folderRole`)
- `documents.listFolderWithMarkdown({ folderId }) → SharedSubtreeDocument[]` (subtree docs with markdown, authorized by `folderRole`)
- `documents.searchFolder({ folderId, query, limit? }) → Array<{ documentId, folderId, title, path, updatedAt, updatedBy, revision, snippet }>`

*`documents.create` (folder-aware + optional content — RB5's `BRAIN.md` seam):*
- `create({ workspaceId, folderId?, title, path?, markdown?, actor? }) → Id<"documents">`
  — auth = workspace member OR inherited `editor`+ on `folderId`; folder-scoped
  creates get NO extra share row (inherit, D12); `markdown` seeded via the Live
  Document import path.

*`documents.listSharedWithMe()` — NEW subtree return shape* (was a flat doc array):
```
{
  folders: Array<{                    // top-most folders shared directly to the user
    folderId: Id<"folders">, name, workspaceId, workspaceName,
    parentId: Id<"folders">|null, role: DocumentRole,
    repoName: string|null, repoRemoteUrl: string|null,
    folders:  Array<{ _id, name, parentId: Id|null, relativePath }>,   // descendants
    documents: SharedSubtreeDocument[],
  }>,
  documents: SharedSubtreeDocument[], // legacy per-document shares (relativePath "")
}
// SharedSubtreeDocument = {
//   _id, workspaceId, workspaceName, folderId: Id<"folders">|null, title,
//   path: string|null, markdown, version: number|null, role: DocumentRole|null,
//   canWrite: boolean, updatedAt, deletedAt?, relativePath: string
// }
```
`relativePath` is the doc's containing-folder path relative to the shared root
("" for a root-level or per-doc share). RB4 materializes each `folders[]` node as
a nested subtree; RB2 renders top-most folders in "Shared with me".

*Desktop adapter kept green (no RB4 work done here):*
`packages/convex-client/src/index.ts` `getSharedWithMe()` flattens
`{ documents, folders[].documents }` back into the existing flat
`SharedLiveDocumentProjection[]`; `packages/sync/src/backend.ts` interface is
UNCHANGED (still returns the flat projection) — RB4 upgrades both to consume the
nested shape.

*Schema (`convex/schema.ts`):* new `folderShares` table (`by_folder`,
`by_folder_user`, `by_folder_link`, `by_user`); `folders.repoName?/repoRemoteUrl?`;
`invites.folderId?/folderRole?` + `by_folder_email` index. Folder invites resolve
in `auth.ts` → `members.resolveInvitesForUser` (helpers `upsertFolderInvite`,
`applyFolderShareRole`).

### RB2 — Web guest experience *(standard; parallel with RB3–RB5)*

**Objective:** a non-technical guest can open an invite link, sign up, land in
the shared folder, read/edit with presence, and create docs — zero install.

**Files:** `apps/www/src/{App.tsx, screens/DashboardScreen.tsx, shell/AppShell.tsx, shell/Sidebar.tsx, shell/WorkspaceSwitcher.tsx, auth/AuthScreens.tsx, store/actions.ts, connection/*}`
(+ small new components beside them). Known traps: signed-out non-root routes
are **discarded** at `App.tsx:87` — the join route must survive the auth-gate
redirect and restore its destination after sign-in/up; `AppShell` loads a
workspace snapshot by `workspaceId` (`AppShell.tsx:109`) and the live-doc
sidebar/search call workspace-gated APIs (`Sidebar.tsx:100`) — the guest path
must render from RB1's guest-safe queries instead, not the workspace snapshot.

**Work items:**

1. **Folder share dialog** on folder rows (lift the `ShareDocumentDialog`
   pattern in `Sidebar.tsx`): people-by-email with role, link sharing with an
   explicit "anyone with the link" state and a one-click **copy link**. While
   here, close the outstanding V1-EXECUTION "Demo TODO": the *document* share
   dialog gets the same visible link-state + copy-link affordance.
2. **Invite-link join route.** A shareable URL for a folder (e.g.
   `/folder/<folderId>`): signed-out visitors hit a minimal join screen →
   existing auth screens → land in the folder. Public-link folders resolve by
   `folderShares` linkScope; email-invited users resolve via signup invite
   resolution (RB1). No dead ends for an already-signed-in visitor either.
3. **Guest dashboard.** "Shared with me" shows top-most shared **folders** (not
   a flat doc list), navigable subtree in the sidebar, doc-create inside the
   subtree when role allows, and no rendering of workspace chrome a guest lacks
   (member management, workspace switcher entries they're not in).
4. **Role-honest UI:** viewer/commenter guests get read-only/comment affordances
   (server already enforces; the UI must not offer dead buttons).

**Acceptance:** two-account manual smoke — owner shares folder by link; guest
account opens link signed-out, signs up, lands in folder, edits a doc with live
presence, creates a doc; owner revokes; guest loses access (clean error state,
not a crash).

**Verify:** `pnpm --filter @hubble.md/www typecheck` ·
`pnpm --filter @hubble.md/www build` · `pnpm typecheck` · touched-file
`pnpm exec biome check` · browser smoke of the flow above (use `?test=1` only
for bootstrap, the flow itself must run signed-in).

### RB3 — Desktop repo-link mount (D11) *(premier)*

**Objective:** "link a repo" = mount the brain into the repo working directory.
Desktop-side only; Hubble never reads repo contents; cloud stores display
metadata only. **Premier because of work item 1:** the multi-root decision is
architectural, not local.

**Files:** `apps/desktop/electron/{syncedFolderService.ts, main.ts}`,
`apps/desktop/src/desktopApi/types.ts`,
`apps/desktop/src/{App.tsx, components/CloudSyncSection.tsx}`,
`packages/sync/src/{sync.ts, config.ts, backend.ts}`, desktop config store.

**Work items:**

1. **Multi-root support — the phase's architectural decision.** Single-root is
   baked in end-to-end, not just in `sync.ts:406–519`: the electron service has
   one `#syncRoot`, one index, one lock, one watcher, one queue/base-cache root
   (`syncedFolderService.ts:126,206`), and the IPC surface + status UI assume
   one root (`desktopApi/types.ts:104`, `main.ts:1498`). Decide engine-instance-
   per-mount vs true multi-root **first** — it drives IPC shape, service state,
   lock scoping, watcher routing, status UI, and reconnect behavior. A mount =
   `{folderId, localRoot}`; the existing whole-workspace sync root remains
   unchanged. Record the choice + why in Handoff before building on it.
2. **Link flow UI.** From a cloud folder (sidebar context or Settings): pick a
   local directory that is a git repo (detect `.git` dir or gitfile), default
   mount path `<repo>/<sanitized-folder-name>/` (editable), materialize the
   folder subtree there via the existing projection machinery, register with the
   watcher/reconcile engine.
3. **Ignore mechanics.** Append the mount path to `.git/info/exclude` —
   resolving the gitfile indirection for worktrees/submodules (`.git` may be a
   file pointing at the real gitdir; exclude lives in the **common** gitdir's
   `info/exclude`). On any failure, don't block: show the exact `.gitignore`
   line to add manually. Never edit tracked files; never run `git`.
4. **Config + metadata.** Persist `{folderId → localRoot}` per machine in the
   desktop config. Read `remote "origin"` URL from `.git/config` (plain file
   parse, read-only, best-effort) and call `folders.setFolderRepoLink` so web
   shows what the folder is anchored to. Unlink action: deregister mount, leave
   files on disk (say so in the UI), clear config entry.
5. **Round-trip check in-product:** after mount, an external save inside the
   mount reconciles → CRDT → web sees it (existing watcher path; just wired to
   the new root).

**Acceptance:** link a real repo clone; files appear at the mount path;
`git status` in that repo shows **nothing** (exclude worked); TextEdit save
inside the mount propagates to web; unlink leaves the tree clean and untracked.

**Verify:** focused `packages/sync` vitest · `pnpm typecheck` ·
`pnpm build:desktop` · touched-file biome · the manual acceptance above on a
scratch git repo (init one in a temp dir; include a worktree case).

### RB4 — Guest subtree materialization + revocation cleanup *(standard)*

**Objective:** a guest's desktop materializes exactly the shared subtrees —
nested paths, not RD2's flat doc list — and revocation removes the projection
on next sync (the honest-revocability behavior promised in VISION Decided #6).

**Files:** `packages/sync/src/{sync.ts, syncedFolderIndex.ts, backend.ts,
syncedFolder.test.ts}`, `packages/convex-client/src/index.ts` (consume RB1's
adapter shape), `apps/desktop/electron/syncedFolderService.ts`.

**Work items:**

1. Consume RB1's `listSharedWithMe` subtree shape: materialize each top-most
   shared folder as `Shared with me/<Workspace> - <Folder>/…` with real nested
   structure; keep the reserved-dir collision rules from RD2.
2. Index by `documentId`/`folderId` (as RD2 does) so renames/moves in the cloud
   don't trash local paths; base-cache each doc for reconcile; chmod by role
   (viewer → read-only, as RD2 did).
3. **Revocation cleanup — extend the existing access-loss handling, don't
   invent a new mechanism.** The service already handles cloud access loss by
   moving the projection to `.hubble/trash`, dropping index/base cache, and
   emitting `removed-access` (`syncedFolderService.ts:781`). Extend that path
   to whole shared subtrees; keep the trash-not-delete behavior and never touch
   `*.local-edit-*` / conflict backstop files (user data). Tests assert the
   existing semantics extended, or explicitly record a behavior change.
4. New docs created in the shared subtree (by anyone) appear on next
   refresh/subscription tick; guest's local saves inside the subtree reconcile
   through the existing path.

**Acceptance:** extend `syncedFolder.test.ts`: subtree layout, nested rename,
revoke-removes-projection-but-keeps-backstops, role chmod. Manual: guest
desktop shows the subtree; owner revokes; files disappear on next sync while a
`.local-edit` backstop (if any) survives.

**Verify:** `pnpm --filter @hubble.md/sync test` (or focused vitest path) ·
`pnpm typecheck` · `pnpm build:desktop`.

### RB5 — `BRAIN.md` seed-once *(economy)*

**Objective:** D13/D14 — at link time (RB3 flow), if the folder has no
`BRAIN.md` doc at its root, create one **as a normal Live Document** from a
template. Hubble never regenerates or overwrites it.

**Files:** template constant + a call from RB3's link flow. The backend seam
(folder-aware `documents.create` with initial markdown content) is **built in
RB1 work item 5** — do not add a new mutation here; this phase is template
content + wiring, which is why it stays economy.

**Work items:** template content = folder purpose line (from folder name +
repo display metadata), a snapshot doc index (names/paths at creation time,
clearly labeled as "at creation"), and how-to-work-here instructions for agents
("these files are live shared context; edit and save normally; saves sync to
the whole team; don't commit this folder to git"). Idempotent: existing
`BRAIN.md` (any case) ⇒ no-op. One convex-test.

**Acceptance:** linking a fresh folder yields `BRAIN.md` in cloud + mount;
linking again (or a second machine) does not duplicate or overwrite it.

**Verify:** `pnpm --filter @hubble.md/sync-backend test` · `npx convex codegen`
· `pnpm typecheck`.

### RB6 — Guest onboarding + wedge copy *(standard)*

**Objective:** the invite-link → web → desktop → agent path has no dead ends
for a non-technical person (VISION open question #2), and product copy matches
the tightened claims.

**Files:** `apps/www/src` (join/landing/empty states),
`apps/desktop/src` (first-run for guests, post-sign-in state), copy strings.

**Work items:**

1. Signed-out join screen (RB2's route) that sells the context, not the tool.
2. In-web "bring your agent" prompt on shared folders: download desktop → sign
   in with the same account → your shared folders appear as files → point your
   agent (Cowork/Claude Code) at the folder. Desktop first-run for a
   guest-only account must land in that state without workspace-creation
   detours.
3. Empty/error states: revoked-while-viewing, expired link, signed-in-but-no-
   access, guest with no shares yet.
4. **Copy audit:** no "absolute revocability" anywhere; use "no git permanence;
   access is revocable" (D4/D5). Check marketing surfaces in `apps/web` if
   touched.

**Acceptance:** a fresh account created from an invite link reaches "my agent
is editing shared context" with zero instructions from the inviter, on a clean
machine (or clean user profile).

**Verify:** `pnpm typecheck` · `pnpm --filter @hubble.md/www build` ·
`pnpm build:desktop` · manual walkthrough of the full path.

### RB7 — Launch gate *(mixed tier + operator-gated)*

**Objective:** one repo-first launch, absorbing the deferred V1-EXECUTION P7
operator gates (D15). **Tier split:** items 1–3 (regression coverage, QA
triage, smoke-debt judgment) are premier; items 4–5 (deploy, env wiring,
notarization, release tag, copy sweep) are operator-driven checklists a
standard/economy session can execute.

**Work items:**

1. **Permission regression extension** (if not fully covered in RB1): folder
   inheritance cases in the B2 suite; run the whole backend test set.
2. **Guest-scenario QA runbook:** extend `TWO-MACHINE-TEST-PROMPT.md` /
   `TEST-RUNBOOK.md` with: dev links repo + seeds → guest joins by link on web
   → guest installs desktop → guest agent file-edit round-trips to dev's web +
   dev's in-repo mount → owner revokes → guest projection disappears. Run it on
   two machines.
3. **Owed browser smokes** from V1-EXECUTION sessions 2–7 (signed-in dashboard,
   presence, mentions, history restore, member mgmt) — pay this debt now; it
   compounds into the same QA pass.
4. **Deploy:** D3 production Convex (greenfield, per 2026-06-30 decision), D4
   web hosting + production `VITE_CONVEX_URL`, D5 external ops/alert sink, C3
   desktop notarization + release tag, D7 signup cap already landed.
5. **Launch copy check:** repo-first story, taglines from RATIONALE §6, no
   overstated revocability.

**Acceptance:** the VISION "v1 happy path" (7 steps) executes end-to-end on
production infrastructure by two humans on two machines.

---

## Sequencing & parallelism

```
RB1 (gate: schema + auth semantics — nothing starts before it lands)
 ├── RB2 (web track)                    ← parallel session A
 └── RB3 → RB4 → RB5 (desktop track)    ← parallel session B
RB6 (needs RB2 + RB4)
RB7 (needs everything; operator-gated pieces last)
```

- RB2 ∥ RB3–RB5 is safe: disjoint files (`apps/www` vs
  `apps/desktop`+`packages/sync`), both consume only RB1's committed API.
  Do **not** start either track until RB1's Handoff lists the API shape.
- RB3→RB4→RB5 stay sequential in one session: they share
  `packages/sync/src/sync.ts` and the mount/materialization model RB3 decides.
- Commit per phase (orchestrator/user reviews diffs); implementers update only
  their Progress row + Handoff block, per session discipline above.

## Acceptance criteria (whole effort)

1. Dev links a local repo clone to a folder; the projection lives inside the
   repo, invisible to `git status`; `BRAIN.md` exists.
2. Guest (fresh account, no memberships) joins via link on web, co-edits with
   live presence, creates a doc — zero install.
3. Guest installs desktop, gets exactly the shared subtree as files, points a
   local agent at it; agent save propagates live to dev's web and in-repo mount.
4. Revoke removes the guest's cloud access and their materialized projection on
   next sync (backstop files preserved).
5. All RB1/RB4 test suites green; owed browser smokes paid; production deploy +
   ops sink live; the 7-step happy path demoed on production.

## Progress

| ID | Status | Owner/session | Last update | Notes |
|----|--------|---------------|-------------|-------|
| RB1 | done | opus sub-agent (orchestrator: fable) | 2026-07-03 | Gate phase. API shape locked in Handoff below. All verify commands green; 52 backend tests pass. |
| RB2 | pending | - | - | Starts after RB1. Parallel track A. |
| RB3 | pending | - | - | Starts after RB1. Parallel track B. |
| RB4 | pending | - | - | Same session/track as RB3. |
| RB5 | pending | - | - | Same session/track as RB3. |
| RB6 | pending | - | - | Needs RB2 + RB4. |
| RB7 | pending | - | - | Operator-gated pieces (deploy, two-machine QA) last. |

Status values: pending, in-progress, blocked, done.

## Handoff

Current state: plan written 2026-07-03; no implementation started. Working tree
has uncommitted desktop-native-live-documents changes — commit/stash before RB1.
Next step: dispatch RB1 (premier tier) with this file + `REPO-BRAIN-VISION.md`
+ `REPO-BRAIN-RATIONALE.md` D11–D15 as context.
Files changed: —
Checks run: —
Open questions: RB3 multi-root choice (engine-per-mount vs true multi-root) is
decided in-phase by the premier RB3 session, first, with a record-why
requirement; Cowork "Work in Cowork" launch button (VISION open Q1) stays out
of scope unless RB6 finds it trivial.

> Peer-reviewed 2026-07-03 (Codex second opinion, 11 findings); corrections
> merged: session shape clarified, RB3 → premier (single-root is baked into the
> electron service/IPC, not just the engine), `packages/convex-client` adapter
> added to RB1/RB4, folder-aware create-with-content moved into RB1 (RB5 is
> wiring only), guest-safe API list made explicit, folder link shares capped
> below owner, RB2 file list widened (auth-gate route trap), RB4 reuses the
> existing `.hubble/trash` access-loss path, RB7 tier split.
