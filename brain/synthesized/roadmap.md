# Roadmap / Current State

Build state and current next step. Track strategy lives in
`brain/synthesized/track-strategy.md`.

## ⟳ RESUME HERE — hosted trial infrastructure (2026-07-16)

Implementation of the public "try it today" launch is underway (plan:
`specs/public-try-it-today-launch/PLAN.md`; contract: same dir `PRODUCT.md`). The
Phase 1 identity work is complete and production hosted-trial infrastructure is now
live at `https://tubble.nopalstudio.com`. Production smoke identities now exist; no
desktop release or announcement has occurred.

**Done & verified (Phase 1 steps 1–6, in-repo):**
- Brand boundary built: `config/brand.json` (source of truth), `config/compatibility.json`
  (retained identifiers), `scripts/check-brand.mjs` (`pnpm check:brand`), and
  `specs/public-try-it-today-launch/BRAND-INVENTORY.md`.
- In-repo rename APPLIED across README (full front-door rewrite w/ lineage + trial
  warning), SECURITY.md, both HTML titles, desktop `productName`/`appName`/publish/
  protocol label, www auth+guest copy, and all 13 package.json (repo/bugs/homepage/desc).
- `pnpm check:brand --strict` → **0 divergent and 0 unresolved public values**.
  `pnpm build:desktop` passes. Biome clean.
- Phase 2 guide DRAFTED: `specs/public-try-it-today-launch/DEPLOY.md` (managed-Convex
  clean-clone deployment), linked from README as a draft.
- GitHub repository is `adrianricardo/tubble.md`; local `origin` now targets it, the old
  repository URL redirects, and `desktop-dev-latest` plus its assets resolve. The live
  prerelease title and future workflow presentation use Tubble.
- Public `main` revision `56345ce` now contains the Tubble README, deploy guide, brand
  files, and corrected linked docs. The literal isolated-browser pass succeeds for all
  19 unique README/download/security/www destinations from a 0-cookie profile with no
  auth/session leakage. Existing macOS artifacts are honestly labeled unsigned
  development builds; their separate signed-release gate remains open.
- Phase 3 signup boundary is implemented: account creation now states the best-effort
  trial limits before submission and links to independent deployment. Web tests (6/6),
  www typecheck, and changed-file Biome pass.
- Phase 3 signup operations are implemented locally: signed-out visitors see a reached
  daily-cap or operator-pause state before submission; the backend enforces both; and
  `LAUNCH_SIGNUPS_DISABLED` pauses new accounts without blocking existing sign-in.
  The deployment guide documents pause/reopen. Production deployment evidence remains
  pending. Sync-backend tests pass 89/89, web tests pass 7/7, www typecheck passes,
  `pnpm check:brand --strict` passes, and
  `pnpm build:desktop` passes.
- The milestone's complete evidence and dependency matrix now lives in
  `specs/public-try-it-today-launch/READINESS.md`.
- Production Convex `rugged-mastiff-510` is cleanly separate from dev
  `strong-setter-709`; no fixtures were copied or seeded. Backend commit `c40f963` is
  deployed with schema + `prosemirrorSync`, production Auth has `SITE_URL`,
  `JWT_PRIVATE_KEY`, and `JWKS`, and the first production `users` check is empty.
- The production www artifact builds against `rugged-mastiff-510` and contains no dev
  deployment, test-variable, or private-key markers. Cloudflare static-assets + SPA +
  one-custom-domain configuration is committed in `apps/www/wrangler.jsonc`.
- Cloudflare hosting is live at `https://tubble.nopalstudio.com`: DNS A/AAAA, valid
  wildcard TLS, root + SPA 200 responses, production-backend targeting, and signed-out
  trial-boundary rendering are verified. Frontend commit `fce0a1e` is Worker version
  `7e6d5f82-a52a-4909-9dbf-28306a33094a` at 100%; the bare root converged on its new
  asset in six consecutive checks. Public-main frontend revision `56345ce` supersedes
  that build as Worker version `87470941-99aa-4077-acba-ddd4fd1c020f` at 100%; its
  artifact targets production Convex and contains no dev/test/secret markers.
- Adrian approved and the first production account was created as
  `tubble-smoke-20260716182713@example.com`. Its private starter Space appeared with
  no teams/shares, and `Hosted Trial Persistence 2026-07-16` retained an exact marker
  across reload. The accidental extra Untitled document is soft-deleted, leaving one
  active smoke document.
- The smoke found a stale signed-in `HUBBLE` label. Commit `fce0a1e` fixes dashboard +
  deployment-error copy, extends strict brand coverage, and is live/verified as
  `TUBBLE`. Cloud UI tests pass 10/10, web tests 7/7, www typecheck and
  `pnpm build:desktop` pass.
- The full production persistence boundary now passes with an approved replacement
  identity: private Space, one live document with the exact marker
  `Tubble production persistence boundary 2026-07-16T19:15:21.833Z 028af91fe1fe`,
  cache-bypassing reload, sign-out/private-route denial, same-identity sign-in, and
  exact Space/document/marker recovery. Account B could neither discover account A in
  the dashboard/search nor read account A's direct private-document URL; account B's
  own document remained available. No development fixtures, teams, shares, or unrelated
  production accounts/Spaces appeared in account B's UI. Final signed-out denial passed.
- Normal macOS resolution and a new isolated Chrome profile reverified the public root
  at `2026-07-16T18:52–18:54Z`; no DNS or Cloudflare change was needed. The in-app
  browser plugin remains locally blocked because Apple reports its bundled native
  certificate as revoked, but the isolated Chrome fallback passed the public-root
  signed-out boundary. A second clean profile began with 0 cookies and completed the
  every-link audit at `2026-07-16T19:50Z`, exposing stale public docs. PR #7 landed the
  remediation, and a third 0-cookie isolated profile passed all 19 destinations at
  `2026-07-16T21:30Z`. Exact redirects, ownership/brand checks, and release metadata are
  in `READINESS.md`.

**Immediate open items (pick any; none block the others except where noted):**
1. **Phase 2 DEPLOY-5**: a second operator follows `DEPLOY.md` from a clean clone and
   fills its verification record (needs a real Convex account + web host).
2. **Internal CLEANUP** (non-launch-blocking): agent docs / `CLAUDE.md` / `docs/agents/*`
   / `.agents/skills/*` still reference `bholmesdev/hubble.md` issue tracker.
3. **Phase 3**: production Convex/Auth/hosting, signed-out boundary, first use,
   reload/sign-in persistence, signed-out denial, and private-Space isolation are
   verified; finish sharing, failure-state, and operational gates.

Other previously-pending work (selective-authority acceptance, Phase 6 recovery,
cross-device matrix, Adrian's todos 1–5) remains tracked in its own sections below and
is untouched.

Detail for the above is in the two dated sub-sections further down
("Phase 1 in-repo rename APPLIED" and "Phase 2 independent-deployment guide DRAFTED").

## ➔ CURRENT NEXT STEP (updated 2026-07-15, public launch prioritized)

Plan and execute the public “try it today” milestone in
`/specs/public-try-it-today-launch/PLAN.md`. The milestone is: launch the fork under a
distinct name; explain its upstream lineage and meaningful additions; let a visitor
create an account and persist a Markdown document in an explicitly best-effort hosted
trial; and prove an independent deployment from a clean clone. This planning pass does
not authorize implementation, deployment, push, PR, release, or cloud-fixture changes.

Adrian selected **Tubble.md** as an intentionally replaceable launch name, the
managed-Convex independent-deployment path, hosted web plus public macOS, and a
public-surface rename with intentional compatibility identifiers. Mutable public
brand values must have one repo-owned source plus generation or validation so a future
rename is bounded. No product decision remains gated. The hosted-service warning
promises no SLA or maintenance term and rejects critical, sensitive, or irreplaceable
use.

The scope rule is claim-shaped: work is critical only when required to make a public
sentence true. Production web deployment, signup/private-workspace persistence,
trial-boundary copy, fork attribution, owned public links, a fresh-operator deploy
record, and a permission smoke are unconditional. Because macOS is the agent-access
bridge, signing/notarization, fork-owned releases, Safe Storage/startup-file fixes,
independent-deployment targeting, and a focused web → desktop → local-agent edit → web
→ relaunch acceptance path are also unconditional. The initial story does not claim
selective-authority moves, broad offline editing, comments/history, exhaustive
recovery, or editor polish, so their pending work is backlog for this milestone. If an
optional feature misses its focused gate, omit or narrow the claim and return the work
to backlog unless the failure risks data loss or exposure.

**Implementation is now underway** — see the **⟳ RESUME HERE** block at the top of this
file for the current pickup point. Phase 1 planning items (brand manifest, compatibility
map, rename inventory) are built and the in-repo rename is applied in the working tree.
The GitHub rename is authorized and authentication is healthy. Adrian replaced the
initial staging selection with `https://tubble.nopalstudio.com`; DNS, TLS, hosting,
application control, and the manifest-driven public URL boundary are verified.

Source: `brain/sources/2026-07-15-public-launch-milestone.md`. Observable contract:
`/specs/public-try-it-today-launch/PRODUCT.md`.

### Phase 1 identity and hosted URL applied; full link audit passed (2026-07-16)

The brand boundary is in place AND the in-repo rename is applied. `pnpm check:brand`
now reports **0 divergent and 0 unresolved public values** (down from 24 + 1).
`pnpm build:desktop` passes; biome clean; all touched package.json valid. The hosted
trial is controlled and live at `https://tubble.nopalstudio.com`.

Applied this pass (Phase 1 steps 5–6, in-repo): all 13 package.json `repository`/`bugs`
URLs, `homepage` (→ fork repo as honest interim until web URL resolves), and
descriptions; desktop `productName`/`appName` → **Tubble**, publish owner/repo →
`adrianricardo/tubble.md`, protocol display label → **Tubble URL**; both HTML `<title>`s;
`SECURITY.md`; www auth + guest-screen copy and download link; and a full README front-door
rewrite (Tubble identity, upstream lineage/credits with `@bholmesdev` attribution,
two-path "Try it today" with the best-effort trial warning, macOS platform, compat-note
box). Compatibility map corrected: `productName`/`appName`/userData follow the rename
(no public installs to migrate); appId + `hubble://` scheme + `@hubble.md/*` namespace +
`hubble` CLI bin + upstream `hubble-skills` remain retained/documented.

**Phase 1 step 6 complete:**

- PR #7 merged the release branch and link remediation into public `main` as `56345ce`.
  The matching www build is Worker version
  `87470941-99aa-4077-acba-ddd4fd1c020f`. A fresh Chrome profile began with 0 cookies
  and passed all 19 unique tracked destinations, including the formerly missing deploy
  guide and brand files. Expected provider/auth redirects and unsigned-development
  release metadata are recorded in `READINESS.md`; no session leakage appeared. The
  in-app browser remains independently blocked by its revoked bundled native
  certificate, and no macOS security setting was weakened.

Internal CLEANUP still stale (non-launch-blocking): agent docs / `CLAUDE.md` /
`docs/agents/*` / `.agents/skills/*` still say `bholmesdev/hubble.md` for the issue
tracker; `specs/**` and `brain/**` history retain Hubble references. Not public-facing.

**GitHub repo rename — complete (2026-07-16):** GitHub reports
`adrianricardo/tubble.md`, the old URL redirects, local `origin` targets the renamed
repository, and the existing `desktop-dev-latest` release/assets resolve. The public
prerelease title is now “Tubble Desktop Dev (latest).” A missed public surface in the
workflow generated `Hubble-dev-*` names; future assets now use `Tubble-dev-*`, and
`pnpm check:brand` covers the workflow and manifest generator. Existing published
binary bytes were not relabeled or replaced.

### Phase 2 independent-deployment guide DRAFTED — verification pending (2026-07-15)

`specs/public-try-it-today-launch/DEPLOY.md` is a complete linear clean-clone guide for
the managed-Convex topology: prerequisites/costs, backend deploy from
`packages/sync-backend` (`npx convex deploy`, prosemirror-sync component), Convex Auth
env (`JWT_PRIVATE_KEY`/`JWKS` via `npx @convex-dev/auth`, operator-set `SITE_URL`;
`CONVEX_SITE_URL` auto), the **100/day `DAILY_SIGNUP_CAP` code constant**, web build/host
(`VITE_CONVEX_URL` baked into `apps/www` build → static SPA host), optional desktop build
targeting the operator deployment with visible-identity/no-silent-fallback notes
(DEPLOY-4/6), and data/backup/upgrade/teardown. The README "Deploy your own" path links
it, labeled a draft. **DEPLOY-5 gate NOT met:** a second operator must follow it from a
clean clone and fill the verification record before the "deploy your own" launch claim is
evidence-backed — this needs a real Convex account + host and is external, so it was not
executed here.

Older detail retained below for reference.

---

The reviewable brand boundary (built earlier this session):

- **Rename inventory + migration rule:** `specs/public-try-it-today-launch/BRAND-INVENTORY.md`
  classifies every Hubble/`bholmesdev` surface as PUBLIC RENAME, COMPAT ALIAS, or
  CLEANUP, with the fixed migration rule (no rename may strand an existing account,
  installed app, on-disk files, or deep links).
- **Brand manifest (single source of truth):** `config/brand.json` — mutable public
  values for `Tubble.md` / product `Tubble` / repo `adrianricardo/tubble.md`. At this
  earlier stage the hosted URL was deliberately unresolved pending Phase 1 step 7;
  it is now resolved above. `@bholmesdev` and the upstream repo are retained under
  `attribution` as labeled original-author credit.
- **Compatibility map:** `config/compatibility.json` — 5 intentionally-retained
  identifiers (appId `com.benholmes.hubblemd.desktop`, `hubble://` scheme, `@hubble.md/*`
  npm namespace, `Hubble` userData/Safe Storage identity, upstream `hubble-skills`).
  Note: `productName`/`appName` ARE public-rename; the first public packaged release
  ships the new name so no public user ever migrates Keychain/userData.
- **Validation check:** `scripts/check-brand.mjs` (`pnpm check:brand`). Report-only by
  default (exit 0); `--strict` gates. The initial punch list was **24 divergent public values**
  (11 package.json link pairs, README, both HTML titles, desktop productName/appName/
  publish owner/protocol label, SECURITY.md, two www copy surfaces) + **1 unresolved**
  (web URL). Not yet wired into `pnpm check`/`build:desktop` so it doesn't fail existing
  gates mid-rename.

**Decisions captured this session (Adrian, 2026-07-15):** public repo →
`adrianricardo/tubble.md` (completed 2026-07-16); hosted web URL
→ placeholder for now, confirm real hosting domain before publishing; social handle →
keep `@bholmesdev` as clearly-labeled upstream attribution ("fork of" language), no
separate fork social account.

**Next:** review/approve the inventory classification + migration boundary above. Once
approved, execute Phase 1 steps 5–7 as the mechanical rename driven by the manifest:
update the 24 in-repo public surfaces (README front door with lineage/attribution +
trial warning, package.json links, titles, desktop metadata, SECURITY.md, www copy),
then the external steps (rename the GitHub repo to `adrianricardo/tubble.md`, resolve
the web URL, clean-browser link audit). Re-run `pnpm check:brand` to confirm the punch
list clears. Do not rename the GitHub repo or set the web URL until the boundary is
approved.

## Deferred launch input — selective folder-authority acceptance (2026-07-15)

Run the remaining production-packaged and real-cutover portions of the selective
folder-authority acceptance gate only with fresh authorization. The local Electron
renderer now passes the non-mutating Git-boundary/menu, Move/Share preview,
live-region, unsafe-confirmation, cancel, and focus-return checks against the generated
scratch playground. A production-configured packaged profile, literal VoiceOver
speech, reduced-motion observation, and real move/share/export cutovers still require
separate acceptance. Real cutovers require explicitly expendable non-production cloud
fixtures; this task prohibited cloud fixture mutation, so that evidence is not
claimed.

The code/test milestone now names and excludes nested opposite-authority roots,
fingerprints and atomically applies carried Share recipients, separates manage-only
authority moves from reader-safe detached Git exports, resumes non-draft interrupted
moves/exports after relaunch, disables retry offline, distinguishes retained archives
from still-active cloud copies, hardens literal announcements/focus/reduced motion,
and removes the obsolete automatic single-file cloud-import prompt so every external
Markdown entry point opens directly in the Git context.
Automated validation passes sync-backend 86/86, sync 58/58, Convex-client 3/3, cloud
UI 10/10, desktop 216/216, changed-file Biome, diff checks, and
`pnpm build:desktop`. Repository-wide `pnpm check` continues to report only unrelated
pre-existing formatting diagnostics and storyboard warnings. The final recovery pass
keeps completed archive/recovery status visible after relaunch and prioritizes any
interrupted operation over that history. The prescribed `pnpm dev:desktop` acceptance
command also started the workspace `convex dev` child and synchronized functions to
the configured development deployment before it was stopped. That deployment was
outside the task's no-deploy constraint; no fixture data was mutated by the acceptance
steps. Do not deploy again, push, open a PR, or mutate cloud fixtures without new
scope.

Milestone 4 adds authoritative cloud Markdown/asset manifests, inherited access and
public-link consequences, Hubble revision counts, archive fingerprints, active-only
archived recovery, and unchanged-only restore. Desktop exports bounded batches into a
guarded repository-adjacent temp tree, verifies the exact path/hash/size set, rechecks
cloud and Git immediately before cutover, atomically places Git bytes, and archives
cloud authority only afterward. Failures before archive return bytes to recovery;
failures after archive resume forward so two editable authorities cannot appear.

Automated failure injection covers exact Markdown/assets, stale cloud content,
destination collision, cancellation, archive rollback, post-archive resume, unchanged
Undo, and changed-byte Undo refusal. Sync-backend tests pass 85/85, Convex-client tests
3/3, desktop tests 211/211, and `pnpm build:desktop` passes. The direct Electron wrapper
exited before exposing CDP on this host, so real-renderer and expendable-cloud cutover
acceptance remain explicitly deferred to Milestone 5; no cloud fixture mutation,
deployment, push, or PR occurred.

## Desktop share-role selector stacking fixed (2026-07-14)

Folder/document share-dialog role and link-access selectors now place their Base UI
positioner portals above the shared modal layer, so the menu remains visible and
interactive instead of opening behind the dialog. Real Electron/CDP acceptance on the
reported `testshare` folder confirmed the viewer option was the topmost hit target and
changed the role while the dialog stayed open. Cloud UI tests pass 10/10, changed-file
Biome and diff checks pass, and `pnpm build:desktop` passes after
simplify/comments/review-readiness. This focused fix does not change the current next
step or require a backend deployment.

## Upstream intake process completed (2026-07-14)

The fork now has a repo-owned selective upstream channel. Run `$upstream-intake` for
the judgment workflow or `pnpm upstream:audit` for the deterministic audit. The skill
supports default, review-only, and branch-only modes; all application happens on an
isolated `codex/upstream-intake-YYYY-MM-DD` worktree branch, and default landing is a
guarded fast-forward only when the captured target ref and clean original worktree are
unchanged and verification passes. Wholesale upstream merge/rebase, unattended
automation, pushes, PRs, deployments, and upstream mutation remain prohibited.

State starts screened through upstream `72c9e808` with 13 retained behavior/product
candidates and an append-only initial strategy record under `specs/upstream-intake/`.
The no-fetch audit finds zero newly seen commits, 156/243 divergence, 36 overlapping
paths, and 27 synthetic conflict events affecting 28 reported paths. Implementation
fixtures pass 12/12, including clean/dirty trees, fetch isolation, missing/unreachable
watermarks, real conflicts, paths with spaces, and isolated guarded fast-forward
landing. Workspace forwarding makes the exact `pnpm upstream:audit` command available
from every package directory. Required Markdown/JSON audits, changed-file Biome, diff
checks, and `pnpm build:desktop` pass after simplify/comments/review-readiness. No real
upstream intake, fetch, or candidate code port occurred. Invoke the skill manually for
the next review; this internal process does not replace the current product next step
below.

**First real intake planning pass (2026-07-14):** a fetched audit found upstream still
at the existing `72c9e808` watermark. Adrian approved later reimplementation of the
retained correctness/native-editor candidates and selected the upstream editor's
roomier block spacing plus its compact sidebar create controls and row-menu interaction.
The sidebar behavior must be rebuilt on Hubble's cloud-ID current-context tree; the
upstream filesystem authority, path identity, and direct-delete assumptions remain
rejected. The commit-pinned implementation sequence, test matrix, safety boundaries,
and deferred product candidates are recorded in
`specs/upstream-selected-improvements/TECH.md`. No product code was ported, and the
candidate queue remains intact until implementation is verified and landed.

**Selected improvements Milestones 1–5 completed
(implementation sessions 1–7, 2026-07-14):** commits `6d95b76` through `2bb2e5d`
land every selected correctness,
native-text, persistence/sync, editor-rhythm, and cloud-context creation slice as
coherent local commits with the required `Upstream-commit` trailers. The correctness
boundary now covers UTF-8
Electron saves and delayed watcher echoes, storage exceptions, complete adjacent-link
identity, accumulated list changes, schema-valid mixed image/text projections, rich
clipboard anchors, caret spellcheck/native text actions, retained failed asset
transfers, retired save timers, and emphasis-boundary whitespace. A visual recovery
pass also added the image node to the reusable projection schema after a real mixed
image fixture exposed that missing backend contract.

The shared editor now uses a `0.75em` block rhythm with larger heading separation,
restored nested flow in quotes/lists/table cells, clearer h5/h6 hierarchy, muted
markers, theme-safe quotes/rules/code, and preserved table, task, presence, and node
view behavior. Common dark tokens moved from the desktop shell into the shared theme
so the same stylesheet is valid on desktop and web. Detached, non-persistent visual
fixtures passed at 560, 900, and 1440 pixels in light and dark on both surfaces; the
test cloud document touched while discovering the schema gap was restored and
verified before acceptance continued.

The cloud-authoritative current-context header now pairs its existing document action
with a capability-gated New folder control. Writable folder rows expose compact New
document and New folder callbacks without introducing a filesystem tree or bypassing
the existing multi-member document destination dialog. Shared-root creation targets
the invisible cloud folder root, viewer/commenter contexts remain gated, backend
authorization stays authoritative, and successful folder creation clears search,
expands ancestors, scrolls the reactive row into view, and restores tree focus. A
non-mutating real Electron/CDP pass confirmed the root and row controls, accessible
names/tooltips, focused name dialog, parent expansion, and coexistence with direct
local-availability actions in the populated Hubble Product Brain context.

Every actionable cloud row now has one capability-derived menu. Document actions
provide title-only Rename, current-context Move through the fingerprinted
prepare/confirm relocation boundary, and soft Move to Trash with Undo. Folder menus
combine create, rename, owner-only Share, Trash, and direct-only local availability
actions without adding folder move or another navigation representation. A new
permission-checked context capability query returns uniform member capabilities or
per-node shared-subtree capabilities, so a read-only root can still expose a stronger
direct descendant grant without leaking inaccessible actions. Pointer context menus
select/focus the invoked row, Shift+F10 and the Context Menu key reuse the same action
model, menu dismissal restores the origin, and stable cloud IDs preserve or recover
roving focus across reactive rename, move, Trash, and restore.

Milestone 5's populated member, editor-shared-root, and direct-availability run passed
create/rename/safe move/Trash/Undo, subtree isolation, every menu invocation path, and
real external Markdown reconciliation. The run found that row-created documents
opened but did not receive tree focus; `5ddb7f5` now hands their stable cloud ID back
to the existing focus/ancestor-expansion path, and repeated member/editor flows passed.
Full evidence and the backend safety incident are recorded in
`specs/upstream-selected-improvements/runs/2026-07-14-milestone-5-acceptance.md`.

The current package matrix passes editor 79/79, UI 20/20, cloud UI 10/10, sync 53/53,
sync-backend 75/75, and desktop 177/177. Web tests pass 4/4 from the prior editor-rhythm milestone;
changed-file Biome and diff checks pass, and `pnpm build:desktop` passes after
simplify/comments/review-readiness. Repository-wide `pnpm check`
still reports only pre-existing/mounted formatting diagnostics under
`brain/cloud/.hubble/**`, `convex/tsconfig.json`, and `skills-lock.json`, plus existing
storyboard CSS specificity warnings. A fresh arm64 package also builds and opens. Its
now-authenticated packaged profile completed member menu/create, signed-in desktop/web
reactive Trash/Undo, representative rich-document comparison in light/dark, and the
macOS spelling/text-service menu. The temporary fixtures were removed or soft-trashed,
and no backend deployment occurred. A final packaged `file://` pass selected the
viewer-only `testshare` root and confirmed disabled context creation, zero rendered
tree rows/action triggers/menus, and no inaccessible Workspace ancestor or sibling.
The separate read-only exact-scope local-agent onboarding card remained outside the
cloud tree. No fixture mutation or backend deployment occurred in that final pass.
The selected-upstream-improvements plan is complete; resume from the independently
prioritized repository next step below.

## ➤ NEXT STEP (updated 2026-07-13, cross-device checkpoint prioritized)

**Pause Phase 6 recovery implementation long enough to publish and exercise an
installable development desktop build on a second Mac.** Adrian wants cross-device
live evidence before choosing the next UX/UI improvements. Follow
`specs/desktop-cloud-workspace/CROSS-DEVICE-DEV-RELEASE-PLAN.md`: make the existing
`desktop-dev-latest` workflow dispatchable, push and build the exact `v1-release`
candidate against dev Convex, verify the arm64/x64 artifacts and manifest, install on
the second Mac, then run the focused cloud-editor + watched-filesystem + quit/offline
matrix. Record the run and use its findings to choose between UX/UI follow-ups, Phase
6 recovery completion, and production distribution.

Known release starting point: local `v1-release` is clean at `94b63e6`, 27 commits
ahead of `origin/v1-release`; the dev-release workflow exists locally but is not yet
present on GitHub's default branch or remote `v1-release`; and
`adrianricardo/hubble.md` has no `desktop-dev-latest` release. This is an unsigned dev
checkpoint, not a production version/tag/notarization pass.

**Session 9 preflight (2026-07-13):** fetched remotes confirm `94b63e6` is still an
undiverged 27-commit fast-forward candidate, its ignored environment files are not in
the candidate, and desktop/backend configuration agrees on the intended
`strong-setter-709` dev deployment. `pnpm build:desktop` passes. Read-only GitHub checks
confirm the workflow is still absent from default branch `main` and the dev release is
still absent. Dev function metadata includes the import/relocation surface but cannot
prove the deployed code matches the candidate, so checkpoint execution now waits for
the plan-required operator confirmation to publish the workflow, push `v1-release`,
deploy the dev backend, and dispatch/replace `desktop-dev-latest`.

**Operator confirmation (2026-07-13):** Adrian authorized those four external
mutations in the active Codex task. Resume the checkpoint at the dev deployment and
GitHub publication steps; production release work and test-data removal remain out of
scope.

**Session 10 publication (2026-07-13):** the dev backend is deployed, `main` contains
the dispatchable workflow, `origin/v1-release` is at the published candidate
`d0a2cc1`, and
[`desktop-dev-latest`](https://github.com/adrianricardo/hubble.md/releases/tag/desktop-dev-latest)
contains exactly the arm64/x64 ZIPs plus manifest. The successful
[Actions run](https://github.com/adrianricardo/hubble.md/actions/runs/29297362856)
built both architectures; independent downloads matched manifest commit, sizes, and
SHA-256 hashes. The first dispatch exposed and the candidate now fixes a redundant
pnpm-version workflow input. A mistaken root-level Convex invocation temporarily
removed indexes/component registration; the correct `packages/sync-backend` deploy
restored every reported index and remounted ProseMirror before publication, and
function metadata confirms the candidate import/relocation surface.

**Next:** on the second Mac, record architecture/macOS, download its matching ZIP and
verify it against the published manifest, install/approve the expected unsigned app,
sign in to dev, and confirm the same known cloud document. Then run the two-device
editor/filesystem/quit/offline matrix. This is now a physical-device gate; do not
resume Phase 6 recovery or production distribution before recording its evidence.

**Second-Mac onboarding findings (2026-07-13, acceptance still in progress):** the
unsigned build's unexplained **Hubble Safe Storage** Keychain prompt led Adrian to
choose Deny accidentally, so dev-install guidance needs pre-prompt context and a safe
retry path. After sign-in, an unrequested **Bring “README.md” into Hubble** dialog
appeared over Settings. Code inspection shows that a startup file argument or macOS
`open-file` event can be queued while signed out and revealed only by the authenticated
tree after login, severing the visible cause from the prompt; the event's exact source
is not yet proven. Record this as both an onboarding UX problem and a packaged-launch
correctness investigation. Do not treat the import as user intent without confirming
its source path and trigger.

**Next implementation step selected (2026-07-13): local-agent availability
onboarding.** The clean install exposed a more fundamental gap: a user can see a
populated cloud Space and an HTML Apps/skills promotion without learning that local
agents still have no filesystem path. Implement
`specs/local-agent-availability-onboarding/TECH.md` against the observable contract in
its sibling `PRODUCT.md`. The primary journey must create an exact current-Space or
shared-root standalone projection; it must not relabel the legacy all-accessible
mirror. The secondary journey links one cloud folder into one Git repository. Both end
with a verified path, agent handoff actions, and skills guidance only after local
availability exists. Finish recording the physical cross-device matrix in parallel
with planning/implementation evidence; its safety failures can still preempt this UX
slice.

**Local-agent availability Milestone 1 completed (2026-07-13):** projection scope
and materialization behavior are frozen at code/test level. Sync, Convex subscriber,
and desktop service now share explicit `all-accessible`, `workspace`, and `folder`
scopes with stable keys. A Workspace root plans and materializes only its root
documents, nested topology, and empty folders directly at the selected local root;
it excludes every unrelated Workspace and shared item. Workspace subscriptions watch
only that Workspace's folder/document queries. Existing all-accessible and folder
projection paths remain covered by the compatibility suites, and Workspace mount
identity mismatch pauses instead of rebinding an indexed root. Revalidation on the
pinned `d0a2cc1` base restored dependencies from the local pnpm store; sync tests pass
51/51, Convex-client tests 1/1, desktop tests 156/156, changed-file Biome passes, and
`pnpm build:desktop` passes.

**Local-agent availability Milestone 2 completed (2026-07-13):** direct local
availability now persists in an atomically written, versioned
`local-availability.json` registry. First read migrates every valid legacy
`repo-mounts.json` entry once without rewriting the legacy file or reconnecting an
engine. Projection lifecycle, status/events, operation routing, overlap validation,
reconnect, relocation, and stop now use stable Workspace/folder scope keys. Workspace
roots conflict with every root in the same Workspace, folder ancestry conflicts remain
guarded, and all local-root checks canonicalize missing/symlinked paths before any
setup mutation. Existing folder APIs are thin adapters over typed scope-based
IPC/preload/renderer APIs; the legacy all-accessible mirror remains separate, is
reported as incompatible, and must be stopped in Settings rather than being relabeled
or migrated. Desktop tests pass 160/160, changed-file Biome and diff checks pass, and
`pnpm build:desktop` passes after simplify/comments/review-readiness.

**Local-agent availability Milestone 3 implementation completed; packaged acceptance
pending (2026-07-13):** the selected member Workspace or shared-folder context now
owns a discoverable standalone onboarding card and exact-scope state join. The native
destination chooser proposes `~/Hubble/<context>`, returns a prospective path without
creating it, and leaves guarded validation/mutation to the Milestone 2 lifecycle. The
dialog names scope, role/capability, destination, and stop-local safety; real scoped
Electron events announce verification/materialization progress; cancellation before
creation is inert; and offline/error/review states offer accurate retry or Settings
recovery. Connected completion exposes the exact path, reveal/copy, and agent
instructions, while relaunch/token refresh reconnects all generalized records. The
legacy broad mirror remains explicitly incompatible, dismissed guidance leaves a
compact contextual entry, and the dashboard-only Settings discovery was removed.
The existing Settings repo-link workflow remains unchanged for Milestone 4.

Focused onboarding tests pass 4/4, sync tests pass 51/51, changed-file Biome and diff
checks pass, and `pnpm build:desktop` passes after simplify/comments/review-readiness.
The desktop suite passes 158 non-socket tests; its six CLI server tests cannot bind a
Unix socket in the managed sandbox (`EPERM`). Repository-wide `pnpm check` still sees
pre-existing formatting diagnostics in mounted `.hubble` metadata and unrelated
files. The required real Electron workflow was attempted, but the sandbox denied
process inspection and localhost binding, so no packaged/UI acceptance is claimed.

**Local-agent availability Milestone 3 packaged acceptance completed
(2026-07-14):** a clean isolated packaged profile reached populated dev data and
completed the contextual `testspace2` member journey by keyboard. The chooser left its
prospective path absent, live regions announced verification/materialization/
completion, the connected path persisted across relaunch and a real CLI-backed auth
token rotation, and an external Markdown marker reconciled into the cloud editor (then
was removed again). Supplemental packaged lifecycle calls proved exact root/nested
materialization for `Phase 3 Acceptance 2026-07-13`, including a temporary empty cloud
folder, with one Workspace ID throughout the index; the editor-shared `smoke-folder`
materialized as one exact subtree. Cancellation returned focus to the invoking action
and changed neither disk nor registry, and overlapping roots were rejected before
mutation.

The first occupied-root attempt exposed a Milestone 3 safety defect: standalone setup
accepted a foreign sentinel file and materialized around it. Direct availability
preflight now permits only an empty destination or a matching version-2 Hubble index;
foreign content and differently scoped indexes are rejected before setup writes. The
desktop suite passes 166/166, changed-file Biome passes, `pnpm build:desktop` passes,
and the rebuilt package preserved the fixed-case sentinel as the destination's only
file while creating no registry record.

The remaining matrix passed on 2026-07-14 with a temporary viewer-shared dev root.
The contextual preview named the source Workspace, `viewer` role, read-only access,
and exact destination. Offline setup persisted only the scoped recovery record and
Hubble metadata, announced verification/materialization/error, and offered an
accurate retry. Terminating at that state and relaunching online recovered without
restarting onboarding: exactly one shared Markdown document materialized, the v2
index named only that folder and Workspace, the file was mode `0444`, and an external
append failed without changing its hash. CDP's packaged accessibility tree exposed
the literal dialog, scope, role, path, progress, error, completion, and action labels.
VoiceOver itself launched, but this host denied Apple-event reads of its last phrase,
cursor, and caption window, so literal synthesized speech could not be captured; the
AX/live-region evidence is the maximum this host permits.

Both temporary cloud folders (`M3 Empty Acceptance 2026-07-13` and the viewer fixture),
the isolated profile, and every registry-named acceptance root were removed after all
projection processes stopped. Desktop tests pass 166/166 and `pnpm build:desktop`
passes.

**Local-agent availability Milestone 4 implementation completed; packaged acceptance
pending (2026-07-14):** repository-link creation now lives in the selected cloud
context instead of a second Settings form. Member Spaces select or create one cloud
folder before choosing a Git repository; eligible shared-folder contexts are
preselected. The flow resolves a selected child to its Git root, derives a bounded
Markdown destination inside it, previews scope/access/Git exclusion/repository
boundary/non-overwriting `BRAIN.md` behavior, reports verification/materialization,
and ends in the shared path/reveal/copy/agent-instructions completion. Read-only
contexts preserve standalone availability while explaining why repo association needs
edit access. Settings now manages existing generalized repo availability records.

HTML Apps guidance is gated by the selected context's exact healthy scope and uses
that record's path; the legacy open-folder path no longer qualifies. Non-mutating real
Electron/CDP acceptance passed viewer restriction, member folder choice/create,
contextual visibility, safe focus-target availability, and an exact `~/magic-test`
skills command. Desktop tests pass 178/178, changed-file Biome and diff checks pass,
and `pnpm build:desktop` passes after simplify/comments/review-readiness. Run record:
`specs/local-agent-availability-onboarding/runs/2026-07-14-milestone-4-implementation.md`.

**Next local-agent availability step:** run the remaining packaged Milestone 4 gate
with an expendable cloud folder and scratch Git repo, including child-directory root
resolution, real materialization/external edit/relaunch/Settings management, cleanup,
and physical keyboard + VoiceOver speech for both journeys. No backend deployment or
fixture mutation occurred in the implementation pass. After that gate, the feature is
complete and the roadmap can return to the cross-device findings and Phase 6 recovery
priority decision.

**Autopilot revalidation (2026-07-15):** the current working tree still passes all 172
desktop tests that do not require a Unix socket; the six CLI-server cases remain
blocked by the managed sandbox's `listen EPERM`. Focused onboarding tests, desktop
TypeScript, changed-file Biome, `git diff --check`, and a production Electron/Vite
build pass. A fresh ad-hoc-signed arm64 `.app` was produced and passes strict codesign
verification. This host aborts both packaged and development Electron before a
renderer starts, so CDP cannot bind and no new keyboard/VoiceOver or mutating fixture
acceptance is claimed. The remaining packaged gate above is unchanged, and the
repo-only renderer IPC compatibility shims remain until that parity is proven.

## ➤ NEXT STEP (updated 2026-07-09, post-apply-run)

**Apply-mode is built and has run for real once**: `567-platform/brain` was split into
the "567 Brain" Hubble workspace on dev (Adrian's call to use a real repo instead of a
throwaway corpus; git remote = the safety net). Move commit `567-platform@180eebc`,
run record `/specs/hubble-init/runs/2026-07-09-567-brain-apply-run.md`, skill rules
13–16 extracted. CLI grew auth-token plumbing + `folder create/list/export` +
`document create` (uncommitted → committed this session).

Next session, in order:

1. ~~Desktop repo-link the "567 Brain" folder~~ **✅ verified 2026-07-10** live with
   Adrian: workspace "567 Product Brain" appears via owner membership in the
   repo-link picker (gap #10 fix not needed for this path), mounted over
   `567-platform/brain/cloud/` (repo root = 567-platform), git exclude + BRAIN.md
   confirmed, and live watch verified BOTH directions — app edit → file, and file
   append → cloud reconcile in ~5s. Stale CLI export archived and replaced by the
   live mount. UX learnings: the repo picker wants the git root (users try the
   mount dir — "not a repo" error), and the mount-path field silently keeps stale
   values across relinks.
2. ~~Fix serializer bugs (DESIGN.md §Gap #8)~~ **✅ done 2026-07-10** (working
   tree, uncommitted): all four bugs fixed in `packages/editor` — nested-emphasis
   divergence, lone `~` doubling, verbatim frontmatter round-trip (frozen
   decision: opaque block, no structured editing), bare-URL/autolink
   preservation. `roundTrip.test.ts` is the idempotency guard. Follow-up: four
   call sites pre-strip frontmatter and should adopt the new path
   (`packages/ui` EditorView ×2, desktop `App.tsx`, www EditorView). Gap #9
   (workspace ownership transfer / `hubble login`) is the auth follow-up.
3. ~~Split THIS repo's `brain/`~~ **✅ done 2026-07-10** — Track C target 2 executed
   by the hubble-init apply run: 10 docs (8 whole + cloud halves of decision-log and
   roadmap) → "Hubble Brain" folder, workspace "Hubble Product Brain" (dev), Adrian
   owner member. Export-diff gate passed (whitespace normalization + one mark-order
   canonicalization; zero content loss; all exports are round-trip fixed points).
   RESOLVER+BRAINKEEPER consolidated into one governance doc. Run record:
   `/specs/hubble-init/runs/2026-07-10-hubble-brain-apply-run.md`.

## ➤ NEXT STEP (updated 2026-07-11, Phases 3+4 IMPLEMENTED)

**Magic-flow Phases 1+2 are implemented AND live-verified** (commits `f51023a`,
`79f6024`; run record `specs/hubble-init/runs/2026-07-11-magic-flow-live-acceptance.md`):
`hubble login` device flow proven end-to-end on dev (approve became an action —
nested mutations lose built-in env vars); `hubble mount` proven zero-click on a
scratch repo (both sync directions ≤12s) and **`brain/cloud/` here is now a live
mount** (11 docs; local 2026-07-11 entries merged up; slug-era files removed;
git-side refs updated to the title-based projection names).

**Magic-flow Phases 3+4 are implemented and independently rechecked at the code,
test, and build levels** (run record
`specs/hubble-init/runs/2026-07-11-magic-flow-phase-3-4-verification.md`).
`hubble ensure-desktop` now detects, confirms, downloads, size/hash-verifies,
installs, opens, and signs in the macOS development app using a two-minute,
single-use handoff code rather than copying the CLI refresh token. The manual repo-link
form accepts a selected child directory, shows the resolved git root, and derives a
fresh suggested mount path after either selection changes. The stable dev release has
not been published and the complete install path still needs a clean-machine operator
acceptance pass; do not describe Phase 3 as packaged-live-verified yet.

**Projection correctness guards are implemented at code/test level** (working tree,
2026-07-11): document `path` is the canonical filename for desktop materialization
and CLI folder export (title fallback for pathless legacy docs), watcher events wait
for an in-flight materialize pass to install its index/self-write hashes before
classification, and startup now computes the exact desired cloud projection through
a no-write planner before materialization. New Markdown is classified separately from
untracked files that collide with a desired cloud path; collisions pause startup and
preserve local bytes. Existing mounts migrate by document-ID rekey. Focused sync +
desktop suites and `pnpm build:desktop` pass. Live dogfood acceptance is not yet
recorded.

**Desktop cloud-workspace Phase 0 revalidation and documentation supersession are
complete** (working tree, 2026-07-11): TECH was revalidated against `8f2fb06` plus the
projection guards; its ownership/module map remains current. ADR-0010 now supersedes
the legacy dual-authority model, with `CONTEXT.md`, ADR-0009, and active synced-folder
guidance reconciled.

**Phase 2 startup safety is complete at code/test/build level** (working tree, 2026-07-11):
tracked quit-time edits reconcile against their saved base before materialization;
missing tracked files, unsafe backstops, and untracked desired-path collisions pause
without touching local bytes. Missing-file and collision blockers now persist in a
versioned device-local operations journal with stable IDs/timestamps, are counted in
service status, and clear durably after resolution. Quit-time missing/add pairs now
correlate by inode first and exact content hash second; unique moves and ambiguous
candidate sets are journaled without applying cloud changes or touching local bytes.
Materialization now captures the reviewed destination hashes and compare-checks each
cloud document write; a late local change stops the pass, preserves its bytes, and
persists a typed guard conflict. The index is now a v2 mount-identified envelope with
observed topology and lossless v1 migration; mount mismatches pause for review.
Offline launch and access-verification failures persist pending verification, preserve
every local byte, and surface `verifying`, `offline`, and `pending-review` status.
Sync tests pass 43/43, desktop tests pass 123/123, and the desktop production build
passes. Packaged live acceptance remains outstanding.

**Next build step:** Phase 3's code-level and isolated-Electron acceptance gates are
complete. Begin the desktop cloud-workspace implementation from
`specs/desktop-cloud-workspace/TECH.md` by rerunning its HEAD revalidation gate and
updating the module map before editing code. Keep `cloud create` in a scratch cwd
because it connects its cwd as the workspace path. Publishing `desktop-dev-latest`
and clean-machine Phase 3 acceptance remain separate operator gates.

**Phase 3 topology slice is implemented** (working tree, 2026-07-11): whole-workspace
materialization now persists explicit folder topology from the cloud folder tree,
including empty folders and parent identity. Watcher creates and correlated moves use
that topology before the legacy sibling-document fallback, so an empty destination is
no longer mistaken for the Workspace root. Sync tests pass 43/43, desktop tests pass
124/124, and `pnpm build:desktop` passes. Next: replace composed cross-folder mutations
with the atomic prepare/confirm relocation contract and persist consequential moves.

**Phase 3 atomic relocation prepare seam is implemented** (working tree, 2026-07-11):
the sync backend and Convex adapter expose `prepareDocumentRelocation`; one transaction
authorizes source and destination, compares bounded inherited user/public-link and
repo-link exposure, atomically applies neutral folder/title/path changes, or returns a
current fingerprint and aggregate impact without moving the document. Backend tests
pass 66/66 and sync/client typechecks pass. Next: add confirmation-time fingerprint
revalidation, then route watcher moves through prepare and persist review-required
results before any cloud hierarchy change.

**Phase 3 implementation queue published 2026-07-11:** GitHub issues
[#168](https://github.com/bholmesdev/hubble.md/issues/168) through
[#173](https://github.com/bholmesdev/hubble.md/issues/173) cover atomic confirmation,
watcher relocation policy, durable consequential moves, desktop review/cancellation,
deletion classification, and Trash/Undo recovery. Dependency chain:
`#168 → #169 → #170 → #171` and `#170 → #172 → #173`. The authenticated GitHub
user can create issues but cannot apply repository labels; the queue therefore still
needs a maintainer to apply `ready-to-implement` and remove any automated
`needs-triage` labels.

**Atomic relocation confirmation is implemented** (commit `7377eec`, issue #168
closed): confirmation re-authorizes and recomputes exposure in one Convex transaction,
commits only an exact current fingerprint, and returns refreshed impact without moving
when the review is stale. Shared backend/client contracts are wired; backend tests pass
68/68 and sync plus Convex-client typechecks pass. Next implementation slice: #169,
route watched moves through relocation prepare before building durable review state.

**Watched relocation policy and durable consequential moves are implemented** (commit
`775b739`, issues #169–#170 closed): watcher rename/move events use the atomic prepare
contract; neutral changes complete and re-key by document ID, while consequential moves
are journaled before review with stable identity, impact, paths, and current content
hash. Pending destination edits keep syncing content and refresh the journal; startup
verification retains the operation, status remains `pending-review`, and cloud
materialization pauses rather than recreating or overwriting either path. Sync tests
pass 44/44, desktop tests pass 125/125, and `pnpm build:desktop` passes. Next: #171,
the coordinator/IPC review path with approval, stale-impact refresh, cancellation, and
collision recovery.

**Desktop consequential-move review is accepted** (2026-07-13; issue #171): typed
coordinator and IPC APIs list, approve,
and cancel durable moves. Confirmation revalidates the fingerprint and refreshes stale
impact without moving; cancellation restores the latest destination bytes to the
source, while an occupied source preserves both files and leaves a durable recovery
item. Hubble foregrounds an accessible review dialog with the safe action focused,
Escape/dismissal as cancellation, and an OS notification fallback. Desktop tests pass
128/128 and the desktop production build passes. The richer impact contract landed at
code/test/build level on 2026-07-13: it detects inherited role upgrades/downgrades as
consequential, returns exact gain/loss counts plus up to 25 named role changes, shows
public-link before/after roles, and identifies added/removed repo-linked folders by
cloud path and repository metadata. Older device journals remain readable. Dev
deployment plus isolated Electron acceptance passed for the rendered preview, stale
refresh without a move, approval, and Escape cancellation with an intervening edit.
The run found and fixed canonical relocation paths incorrectly retaining the mirror's
top-level workspace directory; whole-workspace moves now store workspace-relative
paths while repo mounts preserve subtree-relative paths. Desktop tests pass 137/137
and `pnpm build:desktop` passes after simplify/review-readiness. Run record:
`specs/realtime-collab/runs/2026-07-13-phase-3-consequential-move-acceptance.md`.

**Deletion classification safety is implemented at code/test/build level** (working
tree, 2026-07-11; issue #172): the existing move-correlation window is now the bounded
deletion aggregation gate. Exactly one online writable document unlink may reach cloud
Trash; rapid/bulk bursts, read-only copies, offline deletions, a missing projection
root, and inaccessible storage/parents become durable deletion-review operations
without cloud mutation. Offline bursts coalesce into one bounded item list, startup
refresh retains deletion intent, and pending work contributes to `pending-review`
status. Existing launch-time missing-file guards remain the distinct quit-time path;
moving a file outside the root naturally enters the safe single-unlink policy while
leaving the external copy detached. Desktop tests pass 133/133, sync tests pass 45/45,
and `pnpm build:desktop` passes. Packaged filesystem-event acceptance remains. Next:
#173, cloud Trash plus durable Undo/local restoration over these classified operations.

**Trash, durable Undo, and deletion recovery are implemented at code/test/build
level** (working tree, 2026-07-13; issue #173): watcher deletes journal stable intent
before the cloud mutation, resume idempotently after a crash/reconnect, and retain a
non-blocking Undo item across restart. Offline and bulk reviews can restore local files
without cloud mutation or approve Trash in bounded 25-document coordinator calls.
Desktop IPC/UI foregrounds the safe recovery action and uses an OS notification when
backgrounded. Cloud Trash is now distinguished from access loss so remote Trash removes
a clean managed copy, while remote restore rematerializes after a no-write collision
preflight; occupied paths preserve both versions as durable recovery work. Sync tests
pass 46/46, desktop tests pass 135/135, backend tests pass 69/69, and
`pnpm build:desktop` passes after the required simplify/review-readiness pass.
Isolated Electron real-filesystem acceptance passed on 2026-07-13 for single-delete
Undo across restart, offline/restart review, bulk recovery, quit-time review, remote
Trash, and collision-safe remote restore. That run also wired the production offline
predicate and fixed restart-only pending-count/startup-resume gaps; see
`specs/realtime-collab/runs/2026-07-13-phase-3-trash-undo-acceptance.md`. Issue #173 is
accepted. Issue #171's richer impact preview is implemented at code/test/build level;
its deployed isolated-Electron acceptance is the final Phase 3 bundle gate.

**Desktop cloud-workspace HEAD revalidation and the first Phase 4 multi-root slice
are complete** (working tree, 2026-07-13): TECH was revalidated against `51f0ee9`
after the accepted Phase 3 bundle. New mount validation rejects identical,
ancestor/descendant, and symlink-resolved local roots plus overlapping cloud folder
subtrees before creating a directory or changing repo/cloud metadata. The legacy
whole-workspace mirror and folder mounts are now mutually exclusive, and managed-path
classification checks every active engine. Desktop tests pass 141/141 and
`pnpm build:desktop` passes. Next: introduce the projection manager to own all engine
lifecycle, pending-operation routing, and aggregate status, then replace
workspace-global repo mount subscriptions with folder-scoped subscriptions.

**Phase 4 projection-manager ownership is implemented** (working tree, 2026-07-13):
one coordinator now owns the whole-workspace engine and every folder engine, cleans up
failed mount starts, aggregates per-root status and pending journals, resolves managed
paths across all roots, and routes move/deletion/Trash review actions to the journal
that owns each operation. Repo-linked folder reviews now use the same foreground
dialog and OS notification path as the legacy mirror. Desktop tests pass 144/144.

**Phase 4 multi-root correctness and agent status are complete at code/test/build
level** (working tree, 2026-07-13): every renderer event and agent-facing status record
now carries local-root, Workspace, and folder scope; the legacy multi-Workspace mirror
uses null cloud IDs. Repo mounts subscribe only to their folder-subtree query instead
of every accessible Workspace and shared root. `hubble status --json`, backed by the
desktop socket, reports per-root health, queued edits, pending review, recovery, Undo,
and bounded operation-kind counts without document content or credentials. Desktop
tests pass 145/145, CLI and Convex-client typechecks pass, `pnpm build:desktop` passes,
and both JSON and human-readable status output passed a real Unix-socket acceptance.

**Phase 5 unified-context foundation is implemented** (working tree, 2026-07-13):
persisted desktop state migrates the legacy selected Workspace into a discriminated
Workspace/shared-folder `CloudContext`; stale selections fall back safely and
guest-only accounts default to an accessible top-most shared root. Behind
`VITE_UNIFIED_CLOUD_TREE=1`, the context switcher includes member Workspaces and shared
roots, and the new cloud-ID tree renders root folders and documents once in one
alphabetical hierarchy with stable expansion/selection and keyboard tree navigation.
Contextual creation supports Workspace root and writable shared-root contexts. Focused
tree/context/persistence tests pass. The next flagged slice now scopes search to the
current tree, joins repo-mount availability/status by folder ID, and removes the local
filesystem tree plus local create/open entry points from the unified shell. Healthy
mounts stay quiet; exception states are named. Desktop tests pass 150/150, cloud UI
tests pass 4/4, and `pnpm build:desktop` passes. A real flagged Electron smoke pass
confirmed the local-authority labels/actions are absent while an already-open local
document remains editable; populated-cloud interaction was blocked by a transient dev
Convex push 500. The contextual controls and destination prompt left by this foundation
are completed below; populated-tree acceptance remains.

**Phase 5 contextual controls and destination prompting are implemented at
code/test/build level** (working tree, 2026-07-13): directly available folder roots in
the unified tree expose reveal, copy-path, relocate, and stop-local actions, with
Shift+F10/ContextMenu access from keyboard-focused tree rows. Relocate and stop require
a connected byte-clean engine, re-check after the watcher closes, and preserve local
bytes when status or content cannot be proven clean. Relocation rejects occupied or
overlapping roots and re-keys legacy/v2 absolute-path indexes before reconnecting.
Clean stop offers removal or a detached Markdown copy; cloud content and sharing stay
unchanged. Global create in a multi-member Workspace now prompts for Workspace root or
a labeled folder path and names root access explicitly. Focused desktop tests pass
7/7, cloud UI tests pass 4/4, and `pnpm build:desktop` passes after
simplify/review-readiness. **Acceptance remains:** use the desktop-app testing workflow
with the unified flag and populated dev data to run keyboard + screen-reader acceptance for
tree navigation, local action menus, the multi-member destination dialog, relocation,
and clean/dirty stop. Record real-filesystem results, fix any findings, then decide
whether the internal flag can be removed. Phase 6 import, revocation, and minimal
recovery completion remain after that gate.

**Phase 5 populated-tree acceptance preflight is complete** (working tree,
2026-07-13): static accessibility review found and fixed unstable tree-item accessible
names caused by nested action controls, added explicit named local state/menu semantics,
and made the selected Workspace-root destination the create dialog's initial focus.
Cloud UI tests pass 5/5, focused cleanliness/destination tests pass 7/7, changed-file
Biome and `git diff --check` pass, and the flagged production desktop build passes.
The managed session could not run the interactive Electron gate: macOS process
inspection, localhost/Unix-socket listeners, and direct Electron startup were denied
before app interaction. The internal flag remains. Run record and exact host checklist:
`specs/desktop-cloud-workspace/runs/2026-07-13-phase-5-acceptance-preflight.md`.
**Next:** run that checklist in a host session with Electron/CDP and populated dev data,
fix any finding, then remove the flag if the gate passes. Do not begin Phase 6 ahead of
this gate.

**Phase 5 populated-tree host acceptance is mostly complete** (working tree,
2026-07-13): real Electron/CDP and populated dev data passed hierarchical keyboard/AX
semantics, multi-member root+nested creation, native scratch-root relocation with v2
index rewrite/reconnect/post-move sync, dirty stop+relocate byte preservation, and the
detached-copy clean stop. The run found and fixed three live-only gaps: unified mode
did not reconnect persisted mounts unless Settings mounted, ContextMenu opening did
not explicitly focus the first action, and the destination dialog used an effect
instead of Base UI's native initial-focus contract. Focused tests, dependency builds,
desktop typecheck, changed-file Biome/diff checks, and the flagged production desktop
build pass. Run record:
`specs/desktop-cloud-workspace/runs/2026-07-13-phase-5-populated-tree-acceptance.md`.
**Next:** obtain action-time confirmation and exercise **Remove local files** on the
clean `/tmp/scratch-repo/Scratch-remove` test projection, then record literal
VoiceOver speech and a physical Shift+F10 pass. If both pass, remove the internal flag
and legacy production branch; only then begin Phase 6.

**Implementation session 5 + authorized cleanup follow-up (2026-07-13):** the flagged
app relaunched with populated dev data, and the Scratch mount reconnected `connected`
and inspected `clean`. After Adrian's action-time confirmation, the real Hubble
**Remove local files** path removed `/tmp/scratch-repo/Scratch-remove`, reported local
availability stopped, and left the Scratch cloud folder visible without a local
marker. Exactly three documents created by this acceptance run (Workspace root,
`Hubble Brain/admin`, and the accidental `adrian's space` document) were moved to
Hubble Trash; older `Untitled` documents were preserved. Adrian then completed the
human-only gate: physical Fn+Shift+F10 opened the local actions menu and VoiceOver
announced **Reveal in file browser**, item 1 of 4, the local path, and the four-item
menu; Cmd+N announced the destination dialog with **Workspace root** selected/focused,
**Available to Workspace members**, and its position in the destination group. Phase
5 acceptance passes. **Next:** remove the internal flag and legacy production branch,
rerun focused checks/build, then begin Phase 6 import, revocation, and minimal recovery
completion.

**Phase 5 is complete and ungated** (working tree, 2026-07-13):
`VITE_UNIFIED_CLOUD_TREE`, its feature-flag module, and the legacy signed-in cloud
sidebar/create/dashboard branches are removed. Every cloud-enabled desktop build now
uses the accepted unified context/tree; the no-cloud development fallback keeps the
reusable local editor and filesystem primitives needed for import. Desktop tests pass
154/154, changed-file Biome and `git diff --check` pass, and `pnpm build:desktop`
passes after simplify/comments/review-readiness. Run record:
`specs/desktop-cloud-workspace/runs/2026-07-13-phase-5-flag-removal.md`.
**Next:** begin Phase 6 at import destination-first semantics. Replace the existing
workspace-root-only `importLiveDocuments`/`importSyncedFolderMarkdown` seam with a
folder-aware, idempotent import contract, then route file-open/drop entry points to an
Import a copy / Move into Hubble flow. Source deletion must wait for verified cloud
creation and managed materialization.

**Phase 6 destination-first import is implemented at code/test/build level**
(working tree, 2026-07-13): opening or dropping unrelated Markdown in the cloud shell
now prompts for a Workspace-root/folder/shared-subtree destination, previews its
audience, and offers **Import a copy** or **Move into Hubble**. Folder editors can
import through an idempotency-keyed backend mutation; retries reuse the created
document, while a distinct operation at an occupied folder/path preserves the
existing document. Copy leaves the source detached. Move requires a connected owning
projection before creation, refreshes it afterward, verifies the indexed document's
materialized bytes against cloud Markdown, and only then removes the source. Backend
tests pass 72/72, desktop tests pass 155/155, and the desktop production build passes
after simplify/comments/review-readiness. Run record:
`specs/desktop-cloud-workspace/runs/2026-07-13-phase-6-import.md`.
**Next:** implement authorization-loss/role-downgrade recovery so rejected queued
writes become a clearly detached preserved copy and can never republish after access
is removed, then add inspect/retry/defer/keep-detached controls. The import slice also
needs an authorized dev deploy plus real-file keyboard/VoiceOver acceptance before
packaged completion.

Desktop IA follow-up (direction settled 2026-07-11): replace the simultaneous
**Folders** / **Live Documents** / **On this computer** sidebar with one current
context and one folder/document tree. Repo-linked projections become contextual
folder availability; remove standalone local-authority editing while preserving local
editing through watched projections of cloud folders. New documents inherit folder
access, and root documents have no direct/guest shares by default while retaining
normal workspace-member access.
The observable contract is now
`specs/desktop-cloud-workspace/PRODUCT.md`; the architecture handoff is the
commit-pinned `specs/desktop-cloud-workspace/TECH.md`. A future implementing agent must
run TECH's revalidation gate and update its module map against HEAD before editing code.
The first safety gate is startup drift: no cloud materialization may overwrite edits
made while Hubble was quit. Source:
`brain/sources/2026-07-11-desktop-navigation-ia.md`. Keep this behind the
projection correctness guards above unless explicitly reprioritized.

Documentation gate for this feature: preserve PRODUCT.md as the product-intent source
while code changes. Do not maintain public marketing/support prose in parallel with an
unstable implementation. After packaged acceptance passes, derive those docs from the
product contract plus the shipped UI and live failure-mode QA; do not infer intended
behavior from code alone.

Backlog (non-blocking): serializer continuation-indent preservation
(`packages/editor`, whitespace-only normalization from the split run); frontmatter
call-site adoption (4 sites); Track D vision extraction (Adrian-gated); production
deploy/QA gates still not run.

Adrian's todos (added 2026-07-13, for Adrian to work in parallel with agent
implementation — not yet started):

1. Agent-led UX/UI audit: have an agent review the desktop app's current UX/UI
   (unified cloud tree, onboarding flows, local-agent availability surfaces) and
   surface findings/recommendations.
2. Get Codex's opinion on upstream sync strategy: this repo was forked from an
   original remote; ask Codex whether it's still possible to pull in the latest
   changes from that original upstream, and whether continuing to track it is
   reasonable long-term or whether it's better to formally break off and diverge
   as an independent project.

Todos to flesh out with an agent and plan before ready to implement (added
2026-07-13, not yet planned):

3. Simplify the local-agent-availability onboarding card into a single CTA.
   Current state (screenshot, desktop sidebar "Use this content with local
   agents" card): two competing top-level actions are shown side by side —
   "Make available on this Mac" (primary button) and "Link to a code
   repository" (secondary text link) — plus a "Dismiss" affordance, all in one
   compact card. This reads as confusing/ambiguous about which path to take.
   Direction: collapse to a single top-level CTA on the card; clicking it opens
   a modal that presents the two real options (standalone local availability vs.
   linking a code repository) as clearly labeled choices with plain-language
   explainer text for each, so the tradeoff is legible before committing. Needs
   a design pass (copy + modal layout) and a look at how this interacts with the
   existing `specs/local-agent-availability-onboarding/` spec before scoping
   implementation.

4. Let the "Make available" destination dialog accept its default path directly.
   Current state (screenshot, "Make 'magic-test' available" dialog): the
   Destination field already shows a proposed default path
   (`/Users/adriantavares/Hubble/magic-test`), but the primary "Make available"
   button appears disabled/unconfirmed until the user clicks "Choose this or
   another folder..." first. Adrian should be able to accept the shown default
   and confirm immediately without being forced through the folder picker.
   Direction: treat the prospective default path as already selected on dialog
   open so "Make available" is actionable right away; "Choose this or another
   folder..." remains available for overriding it. Needs a look at the
   destination-chooser flow in
   `specs/local-agent-availability-onboarding/` before scoping implementation.

5. Investigate "Local files are not connected" state — likely a bug, not just
   copy. Current state (screenshot, `testspace2` sidebar card): a local,
   already-materialized folder (`/Users/adriantavares/testspace2`) shows "Local
   files are not connected" with a "Retry connection" CTA. Adrian's flag: local
   files on disk shouldn't conceptually depend on a "connection" at all — they
   already exist on the Mac's filesystem. This suggests either (a) the label is
   wrong and this is actually a projection-engine/watcher/sync-connection state
   being mislabeled as a local-file-availability problem, or (b) there's a real
   bug where local file access is being gated on something (e.g. cloud auth,
   the sync engine) that it shouldn't need. Needs investigation into what
   "not connected" actually means here (engine status vs. filesystem reality)
   before deciding whether this is a copy fix, a status-model fix, or a real
   correctness bug, per the projection/engine status work in
   `specs/desktop-cloud-workspace/`.

## Where the build actually is (2026-07-09)

- Branch `v1-release`. RB1–RB7 repo-brain code phases are **committed** (folder shares,
  guest web experience, desktop repo-link mount + BRAIN.md seeding, guest onboarding,
  launch-gate prep) — see git log 2026-07-03..05.
- GFM table support **committed** (`65c21c6`): shared Tiptap table schema, markdown
  round-trip, slash-command insertion, floating table controls. Shipped mid-apply-run
  after the run's verification caught tables being silently dropped (the exact
  data-loss bug the safety gate exists for); dev backend redeployed with it.
- **Uncommitted work in the tree** (not yet described by any doc): `SpaceSwitcher.tsx`,
  `packages/cloud-ui/`, edits across desktop + www shells, members backend. Needs a
  fact-check/documentation pass before it drifts.
- Production deploy/QA gates were deferred by the pivot (one repo-first launch) and
  remain not run. QA runbook: `/specs/realtime-collab/TEST-RUNBOOK.md`.
