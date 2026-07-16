# Local agent availability onboarding

> **Architecture snapshot:** planned against `v1-release` at
> [`d0a2cc1`](https://github.com/adrianricardo/hubble.md/tree/d0a2cc16bf29d943d9074c1942e7ef600d548844)
> on 2026-07-13. Re-run the revalidation gate immediately before implementation.

> **Milestone 4 revalidation:** revalidated against
> `9d8cf8d243b695bfbab5692fe1131445ee341556` on 2026-07-14. The generalized
> scope/registry/manager/IPC architecture below remains current. Renderer ownership
> moved to the contextual onboarding, while Settings became management-only; see
> [`runs/2026-07-14-milestone-4-implementation.md`](./runs/2026-07-14-milestone-4-implementation.md).

## Context

The observable contract is [PRODUCT.md](./PRODUCT.md). It supplements the cloud
authority, local availability, and safety guarantees in
[`../desktop-cloud-workspace/PRODUCT.md`](../desktop-cloud-workspace/PRODUCT.md) and
ADR-0010. The feature fixes a clean-install gap: Desktop can render a populated cloud
Space while the only sidebar guidance promotes agent skills using an unrelated legacy
`workspacePath`; the controls that actually create local projections live in Settings.

The relevant architecture at the pinned commit is split across three shapes:

- [`App.tsx`](https://github.com/adrianricardo/hubble.md/blob/d0a2cc16bf29d943d9074c1942e7ef600d548844/apps/desktop/src/App.tsx#L243-L267)
  gates the HTML Apps callout from the legacy open-folder path, and
  [renders it in the sidebar footer](https://github.com/adrianricardo/hubble.md/blob/d0a2cc16bf29d943d9074c1942e7ef600d548844/apps/desktop/src/App.tsx#L604-L625)
  even when the selected cloud context has no local projection.
- [`CloudSyncSection`](https://github.com/adrianricardo/hubble.md/blob/d0a2cc16bf29d943d9074c1942e7ef600d548844/apps/desktop/src/components/CloudSyncSection.tsx#L28-L35)
  connects the legacy `all-accessible` mirror. Its materializer intentionally writes
  every member Workspace plus **Shared with me** beneath one local root, so it cannot
  honestly back a **Make this Space available** CTA.
- [`RepoLinkSection`](https://github.com/adrianricardo/hubble.md/blob/d0a2cc16bf29d943d9074c1942e7ef600d548844/apps/desktop/src/components/RepoLinkSection.tsx#L14-L24)
  and the unified tree operate on one folder ID. They already provide safe folder
  projection, repo-root resolution, Git exclusion, `BRAIN.md` seeding, reconnect,
  relocation, and stop-local behavior, but their persisted record assumes every
  folder projection belongs to a repository.

The projection engine is close to the required general shape. `ProjectionManager`
already owns one legacy whole mirror plus multiple folder engines, and
`SyncedFolderService` selects either `planSyncedFolder`/`materializeSyncedFolder` or
`planMountFolder`/`materializeMountFolder` from one optional `mountFolderId`. The
missing scope is a direct Workspace-root projection: root documents and nested folders
at one local root, with a Workspace-scoped subscription and no wrapper directory.

No Convex schema or new public function is expected. Existing authenticated queries
already provide Workspace folders/documents, folder subtrees, roles, and folder
creation. The change is client projection scope, per-device persistence, Electron IPC,
and renderer onboarding.

### Revalidation gate

Before editing product code, the implementing agent must:

```sh
git rev-parse HEAD
git diff --name-only d0a2cc16bf29d943d9074c1942e7ef600d548844...HEAD -- \
  apps/desktop packages/cloud-ui packages/convex-client packages/sync \
  packages/sync-backend specs/local-agent-availability-onboarding \
  specs/desktop-cloud-workspace docs/adr/0010-desktop-uses-cloud-authority-with-writable-projections.md
```

Re-read every changed boundary named below and update this snapshot/module map before
implementation. Read `convex/_generated/ai/guidelines.md` before any Convex-facing
edit. Preserve unrelated working-tree changes.

## Affected apps and packages

| Area | Responsibility |
| --- | --- |
| `apps/desktop` | Context-aware onboarding, dialogs and completion state; generalized local-availability persistence and IPC; projection-manager lifecycle; folder pickers, repo resolution, reconnect, relocate, stop, and agent handoff. |
| `packages/cloud-ui` | Present selected-context availability and local state without introducing a second content tree. |
| `packages/sync` | Add Workspace-root planning/materialization and a Workspace mount identity while retaining drift, collision, recovery, and one-copy guarantees. |
| `packages/convex-client` | Add a Workspace-scoped projection subscription using existing Workspace folder/document queries. |

`packages/sync-backend`, `packages/cli`, `apps/www`, `packages/editor`, and
`packages/ui` should not require behavior changes. `packages/sync-backend` types may be
regenerated only if implementation proves an existing query contract insufficient;
that would require updating this plan first.

## End-to-end flow

1. The renderer derives the selected `CloudContext` and joins it with Electron's
   persisted local-availability registry.
2. No matching root produces the onboarding card. The primary action requests a
   standalone projection for the exact Workspace or shared folder; the secondary
   action requests a folder-scoped repo association.
3. Electron resolves the local destination, validates local/cloud overlap before
   creating a directory or metadata, persists a versioned mount record, and asks the
   `ProjectionManager` to connect the scoped engine.
4. `SyncedFolderService` runs the existing startup drift, pending-operation,
   collision, guarded-materialization, and watcher pipeline using the new scope.
5. The renderer reports success only from a connected scoped status and exposes the
   exact path. Subsequent launches reconnect the same mount by stable scope identity.

## Module architecture

### 1. One projection-scope model

Replace the binary `mountFolderId` distinction with a discriminated scope shared by
sync, subscriber, Electron, IPC, and persisted state:

```ts
type ProjectionScope =
  | { kind: "all-accessible" }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "folder"; workspaceId: string; folderId: string };
```

`all-accessible` is legacy compatibility only. New user-facing setup creates
`workspace` or `folder` scopes. Derive a stable key (`workspace:<id>` or
`folder:<id>`) for manager lookup, persistence, status joins, and renderer actions.

Extend `SyncedFolderMountIdentity` with `{ kind: "workspace"; workspaceId }`. Keep the
existing index mismatch guard: a root indexed for one scope must pause rather than be
silently rebound to another. Existing folder and legacy mirror indexes remain readable
without content migration.

### 2. Workspace-root projection in `packages/sync`

Add `planWorkspaceRoot` and `materializeWorkspaceRoot` beside the existing whole
mirror and folder-subtree functions. They must:

- query only `getFolders(workspaceId)` and `getLiveDocuments(workspaceId)`;
- place Workspace root documents directly under `syncRoot` and nested documents under
  their folder-relative paths, without a `<Workspace name>/` wrapper;
- persist explicit folder topology, including empty folders and root parent identity;
- reuse canonical document paths, collision allocation, reconcile bases, roles,
  reverse-index entries, and guarded filesystem application;
- exclude unrelated Workspaces and **Shared with me** completely.

Refactor only enough shared path/materialization code to prevent the three modes from
drifting. Do not route Workspace-root setup through the broad mirror and delete the
wrapper afterward; that would make plan/apply and startup safety disagree.

### 3. Scoped service and subscriptions

Change `SyncedFolderServiceOptions` from `mountFolderId?: string` to an explicit
`scope: ProjectionScope`. Scope selects:

- mount identity;
- plan/materialize function;
- cloud document path normalization (`all-accessible` strips its top-level Workspace
  wrapper; `workspace` and `folder` are already scope-relative);
- subscriber scope.

Extend `SyncedFolderSubscriptionScope` with `{ kind: "workspace"; workspaceId }`.
Implement it with the existing `api.folders.list` and
`api.documents.listWithMarkdown` subscriptions for that one Workspace. Keep
`all-accessible` and `folder` subscriptions unchanged for compatibility. Add focused
tests proving updates in another Workspace do not rematerialize a Workspace-scoped
root.

### 4. Generalized per-device availability registry

Replace the repo-only `repo-mounts.json` assumption with a versioned
`local-availability.json` envelope. A record owns:

- stable scope key and `ProjectionScope`;
- display name and local root;
- association: `standalone` or `repo`;
- optional repo root/name/remote and Git-exclusion result;
- timestamps needed for reconnect and UX status.

On first read, migrate every valid legacy `repo-mounts.json` entry to a folder-scoped
`repo` record, write the new envelope atomically, and leave the old file untouched
until the new file is durably written. Migration is idempotent and never reconnects or
rewrites managed files by itself.

Keep the legacy all-accessible mirror in its existing storage and Settings management
path. It is intentionally not folded into a current-context record because its scope
cannot be represented honestly. Block overlapping new roots with an explanation and a
link to stop the legacy mirror.

### 5. Projection manager and validation

Generalize `ProjectionManager.#mounts` from `folderId` keys to stable scope keys and
create engines from `ProjectionScope`. Preserve operation routing through the journal
that owns the operation ID.

Extend `ProjectionRootScope` and agent status with `kind: "workspace"`. All status,
event, managed-document, refresh, stop, and relocate calls identify the mount by scope
key rather than assuming a folder ID.

Generalize `ProjectionMount` validation:

- local roots remain canonicalized and must be pairwise disjoint;
- a Workspace root overlaps every folder root in that Workspace;
- two roots for the same Workspace are duplicates;
- folder roots retain ancestor/descendant checks;
- validation completes before creating directories, Git exclusions, repo metadata,
  `BRAIN.md`, or persisted configuration.

### 6. Typed Electron API

Introduce scope-based APIs while keeping temporary adapters for existing contextual
actions during the migration:

- `listLocalAvailability()`;
- `createLocalAvailability({ scope, localRoot, association, ...auth })`;
- `inspectLocalAvailability(scopeKey)`;
- `relocateLocalAvailability({ scopeKey, localRoot, ...auth })`;
- `stopLocalAvailability({ scopeKey, keepFiles, ...auth })`;
- `reconnectLocalAvailability({ deploymentUrl, authToken })`.

Return one typed record containing scope, local path, association, state, last sync,
and bounded pending/recovery counts. Do not expose auth tokens in stored records,
events, logs, or agent status.

Extend `createFolderPicker` to accept a default path and contextual title so the
primary journey can propose `~/Hubble/<sanitized Space name>` without bypassing the
native chooser. Continue granting only the selected root.

### 7. Renderer onboarding and completion

Add a context-owned component, for example
`LocalAgentAvailabilityOnboarding`, beside `AuthenticatedCloudSidebar`. It receives
the selected `CloudContext`, context label/role, and joined availability records.

State selection is deterministic:

- no matching root → `GUIDE-1` card;
- creating/verifying/materializing → progress in the dialog/card;
- connected → quiet marker plus completion/path actions;
- offline/pending/error → status and recovery action, never skills promotion;
- legacy broad mirror overlap → honest migration/stop explanation.

Primary flow:

1. Derive `workspace` scope for a member Space or `folder` scope for a shared context.
2. Open a focused dialog with suggested destination, role, and scope preview.
3. Run Electron preflight, then connect. Keep the dialog open through terminal status.
4. Show Copy path, Reveal in Finder, and agent-instruction actions from the returned
   connected record.

Secondary flow:

1. Reuse the existing folder query and create mutation. A Workspace context requires
   folder selection/creation; an eligible shared-folder context is preselected.
2. Reuse native repo selection and resolved-root preview.
3. Reuse repo metadata, Git exclusion, and `BRAIN.md` behavior, but disclose each in
   the confirmation preview before mutation.
4. Persist the result through the generalized registry and render the same completion
   component as the primary flow.

Refactor `RepoLinkSection` to manage generalized records instead of owning a separate
creation model. Settings remains the durable management/recovery surface, not the only
discovery path.

### 8. Skills sequencing

Replace `App.tsx`'s legacy `workspacePath` callout gate with the selected context's
healthy local-availability record. Build skill install commands from that record's
local path. If multiple direct roots could represent a selected context, use the exact
direct scope match; never guess from a descendant or legacy loose-file path.

Key dismissal by scope key. The update callout may retain higher footer priority, but
after it is dismissed the local-availability prerequisite must take priority over HTML
Apps promotion.

## Detailed implementation plan

### Milestone 1 — Freeze scopes and projection behavior

1. Add shared projection-scope and mount-identity types.
2. Implement Workspace-root plan/materialize functions and focused path/topology tests.
3. Generalize `SyncedFolderService` selection and Workspace subscriptions.
4. Prove the legacy all-accessible and existing folder paths remain byte/path stable.

Checkpoint: a unit/integration harness connects exactly one Workspace to a root, root
documents and nested folders materialize without a wrapper, another Workspace is
absent, and local edits reconcile through the existing safety pipeline.

### Milestone 2 — Generalize lifecycle and persistence

1. Add the versioned local-availability registry and repo-mount migration.
2. Generalize `ProjectionManager`, scope statuses, overlap validation, reconnect,
   relocation, stop, and operation routing.
3. Add typed IPC/preload/renderer APIs and retain thin folder-ID adapters only until
   the renderer migration lands.
4. Surface the legacy mirror as a distinct incompatible scope; do not auto-migrate it.

Checkpoint: existing repo links reconnect unchanged, one standalone Workspace root and
one disjoint folder root can run independently, and every duplicate/overlap case is
rejected before filesystem or cloud metadata mutation.

### Milestone 3 — Ship the primary journey vertically

1. Add context-derived onboarding state and the native destination dialog.
2. Connect member Workspace and shared-folder scopes end to end.
3. Add progress, cancel, offline/error retry, completion, path actions, persistence,
   and accessible focus/announcements.
4. Replace broad Settings discovery with a contextual entry while retaining Settings
   management.

Checkpoint: a clean packaged install reaches a usable local path from the selected
Space without Settings, and an external Markdown edit reaches cloud with no unrelated
Space content on disk.

### Milestone 4 — Integrate the repo journey and progressive teaching

1. Move Repo Link creation into the contextual secondary journey and refactor Settings
   to the same underlying APIs.
2. Add folder selection/create, repo-root resolution, mount/Git/`BRAIN.md` preview,
   permission explanation, and common completion state.
3. Gate skills/HTML Apps guidance on healthy selected-context availability and use its
   exact path.
4. Remove obsolete repo-only renderer state and legacy open-folder callout gating after
   acceptance; do not leave two creation paths with different semantics.

Checkpoint: both journeys pass packaged keyboard/VoiceOver acceptance and the old
cloud-only screenshot state no longer promotes skills before a path exists.

## Testing and validation

### Automated coverage

| PRODUCT behavior | Required checks |
| --- | --- |
| `GUIDE-1`–`GUIDE-5` | Renderer state tests for no root, dismissed guidance, current-context changes, legacy mirror overlap, update-callout priority, and skills suppression. |
| `LOCAL-ONBOARD-1`–`LOCAL-ONBOARD-8` | Workspace/shared scope materialization, root documents, nested and empty folders, roles, suggested destination, occupied/matching/overlapping roots, offline/cancel/retry, reconnect, and proof that unrelated Spaces are absent. |
| `REPO-ONBOARD-1`–`REPO-ONBOARD-7` | Folder select/create, shared-folder preselection, permission denial, child-directory repo resolution, preview, Git exclusion/manual fallback, `BRAIN.md` non-overwrite, and terminal connected status. |
| `READY-1`–`READY-6` | Copy/reveal/instruction actions, exact-path skills command, relaunch/token reconnect, quiet healthy state, exception state, relocate, and clean/dirty stop. |
| `A11Y-ONBOARD-1`–`A11Y-ONBOARD-2` | Keyboard-only dialog flow, initial/return focus, live progress/error/completion announcements, named scope/role/path, and VoiceOver-visible completion. |

Add focused tests in:

- `packages/sync/src` for Workspace planning/materialization and mount identity;
- `packages/convex-client/src` for Workspace subscription isolation;
- `apps/desktop/electron` for registry migration, projection manager, overlap,
  lifecycle, and IPC behavior;
- `apps/desktop/src` and `packages/cloud-ui/src` for contextual journey state,
  permission variants, and accessibility.

Use during implementation:

```sh
pnpm check
pnpm --filter @hubble.md/sync test
pnpm --filter @hubble.md/desktop test
pnpm build:desktop
```

Run `pnpm build:desktop` before every milestone acceptance, not only at the end.

### Packaged desktop acceptance

Use the desktop-app testing workflow with a clean user-data directory and real dev
data:

1. Sign in to a populated member Space with no roots. Verify the prerequisite card,
   complete primary setup, inspect the exact disk scope, edit a file externally, and
   confirm cloud reconciliation.
2. Relaunch and refresh the auth token. Verify the root reconnects and onboarding does
   not restart.
3. Repeat primary setup for editor- and viewer-shared roots; verify writable/read-only
   filesystem behavior and no inaccessible ancestors/siblings.
4. Attempt occupied, overlapping, offline, cancelled, and interrupted setup. Confirm
   every pre-existing byte remains and the UI offers an accurate next action.
5. From a member Space, choose/create a folder, select a child of a Git repo, verify the
   resolved root and preview, link it, inspect `.git/info/exclude` and `BRAIN.md`, then
   edit through an agent-facing local tool.
6. Run both journeys using only keyboard and VoiceOver. Record literal scope, path,
   role, progress, error, and completion announcements.
7. Confirm the skills/HTML Apps card is absent before availability and uses the exact
   connected path afterward.

## Parallelization

Do not parallelize Milestone 1: projection scope, mount identity, materialization, and
subscription must land as one coherent contract. After that checkpoint, two agents can
work safely:

1. **Lifecycle owner** — Electron registry, manager, validation, IPC, and engine tests.
2. **Journey owner** — renderer/cloud-ui components and tests against the frozen typed
   APIs.

`apps/desktop/electron/main.ts`, `apps/desktop/src/App.tsx`,
`apps/desktop/src/components/Sidebar.tsx`, and `apps/desktop/src/desktopApi/types.ts`
are integration hotspots. Assign one merge owner; do not let both agents edit them
concurrently. Integrate lifecycle first, then activate the renderer path and run the
packaged acceptance as one session.

## Risks and mitigations

- **Scope overexposure:** never back the primary CTA with `all-accessible`; assert
  Workspace isolation in plan, subscription, disk, and renderer tests.
- **Two engines manage one document:** validate local and cloud overlap before any
  directory, registry, repo metadata, Git exclude, or `BRAIN.md` mutation.
- **Persisted repo-link regression:** use an idempotent versioned migration and test
  reconnect, stop, relocation, and pending journals from real legacy fixtures.
- **Root-document path drift:** Workspace-root plan and apply must share one allocator;
  do not strip a wrapper after materialization.
- **Misleading completion:** derive success from a connected scoped engine, not from a
  saved config or a transient toast.
- **Permission confusion:** display effective role before setup and keep read-only
  filesystem enforcement. Repo association denial must leave the primary path usable.
- **Marketing before capability:** selected-context availability is the only source for
  agent/skills guidance; legacy `workspacePath` is not a fallback.
- **Spec drift:** update this PRODUCT/TECH pair when scope, permission, persistence, or
  journey sequencing changes.

## Follow-ups

- Consider a one-click “Open in…” handoff only after specific agent integrations and
  their permission models are validated. The first release copies a path/instruction.
- Retire the legacy all-accessible mirror after existing users have an explicit,
  lossless migration choice; do not make its removal a prerequisite for this journey.
- Generalize local availability to non-repo project folders only if evidence shows the
  standalone Space path and repo path leave a meaningful third intent uncovered.
