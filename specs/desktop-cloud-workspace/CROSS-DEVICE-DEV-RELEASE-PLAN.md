# Cross-device desktop dev release and live test

**Status:** in progress — verified dev release published; second-Mac acceptance next  
**Priority:** current checkpoint before Phase 6 recovery completion or broad UX polish  
**Target:** an installable unsigned development build on a second Mac, connected to
the dev Convex deployment, followed by a focused two-device live test

## Objective

Publish the current desktop app through the repeatable `desktop-dev-latest` channel,
install that exact build on another Mac, and use both machines against the same cloud
documents and local projection to learn whether cross-device editing is trustworthy
and understandable.

This checkpoint should produce direct UX evidence. It is not merely a packaging task:
the result should tell us where setup, navigation, collaboration feedback, sync state,
and recovery behavior need improvement before more UI work is prioritized.

## Why this is tracked

The code change should be small, but the acceptance path crosses GitHub publishing,
the dev backend, two CPU architectures, unsigned macOS installation, authentication,
two physical machines, and potentially destructive sync behavior. A short plan and a
run record are warranted; a new feature spec is not.

## Boundaries

In scope:

- make the existing dev-release workflow dispatchable and publish the mutable
  `desktop-dev-latest` channel;
- build arm64 and x64 ZIPs with the intended dev Convex URL;
- verify the release manifest, commit, sizes, and SHA-256 hashes;
- install, launch, and sign in on a second Mac;
- exercise same-document cloud editing and watched Markdown projection edits across
  both devices;
- capture UX friction and correctness findings.

Out of scope:

- a production `desktop-v*` release, version bump, or changelog promotion;
- Developer ID signing, notarization, DMG distribution, auto-update acceptance, or a
  public launch;
- broad Phase 6 recovery implementation;
- fixing every UX issue found during the live test.

## Known starting state — 2026-07-13

- Adrian authorized the external publish checkpoint in the active Codex task on
  2026-07-13: deploy the dev Convex backend, publish the workflow to `main`, push
  `v1-release`, and create or replace `desktop-dev-latest`. This authorization does
  not extend to production release work or test-data removal.

- The preflight candidate was `94b63e6`. The published candidate is `d0a2cc1`, which
  adds only the workflow correction discovered by the first dispatch.
- `.github/workflows/desktop-dev-release.yml` is discoverable from GitHub `main` and
  builds the exact selected `v1-release` ref.
- `desktop-dev-latest` exists in `adrianricardo/hubble.md` and targets `d0a2cc1`.
- The workflow already builds unsigned arm64 and x64 ZIPs, embeds the supplied
  `VITE_CONVEX_URL`, creates `desktop-dev-manifest.json`, and publishes all three
  assets to a stable prerelease tag.
- `hubble ensure-desktop` expects that tag and repository, but the CLI is not yet an
  independently distributed clean-machine prerequisite. Direct ZIP installation is
  therefore the shortest first cross-device path; complete CLI-led installation
  acceptance remains a follow-up.
- The existing Phase 6 import slice remains implemented and verified locally. Its
  authorization-loss/recovery follow-up is paused, not abandoned.

## Execution plan

### 1. Establish a publishable, matching build

- [x] Re-run `pnpm build:desktop` on the exact candidate commit.
- [x] Confirm the candidate contains no unrelated or secret-bearing changes.
- [x] Confirm the intended dev Convex URL and deploy/verify any backend functions
      required by the candidate before distributing it.
- [x] Push the current `v1-release` history without rewriting the remote branch.
- [x] Make `desktop-dev-release.yml` discoverable from GitHub's default branch while
      retaining `v1-release` as the build ref. Prefer the durable workflow path over
      an ad hoc local upload.

Checkpoint: GitHub can accept a manual dispatch for `v1-release`, and the branch SHA
being built is recorded.

Session 9 preflight (2026-07-13): `94b63e6` remains a 27-commit fast-forward of
`origin/v1-release` with no remote divergence. The full desktop build passed; tracked
candidate paths contain no environment files or credential-named files; ignored local
environment files remain outside git; and the desktop/backend dev URLs both match the
workflow default, `https://strong-setter-709.convex.cloud`. The dev deployment exposes
the expected import and relocation function surface, but read-only metadata cannot
prove its deployed implementation matches the candidate. Publishing the workflow to
`main`, pushing `v1-release`, deploying the candidate backend, and creating the mutable
dev release remain behind the plan's explicit operator-confirmation boundary.

Session 10 publication (2026-07-13): the backend was deployed and its import plus
relocation functions verified on `strong-setter-709`. The first deploy invocation
was accidentally run from the monorepo root, temporarily removing the app indexes
and ProseMirror component; the correct `packages/sync-backend` deployment immediately
restored every reported index and remounted the component before branch publication.
The first Actions run (`29297310247`) then found a redundant pnpm version in the
workflow. Workflow-only commits `d0a2cc1` (`v1-release`) and `3b22657` (`main`) fixed
it by deferring to `package.json#packageManager`.

### 2. Publish and verify `desktop-dev-latest`

- [x] Dispatch **Desktop Dev Release** with the verified dev Convex URL and
      `v1-release` ref.
- [x] Confirm dependency install and both architecture builds pass.
- [x] Confirm the prerelease contains exactly the expected channel assets:
      `Hubble-dev-arm64-mac.zip`, `Hubble-dev-x64-mac.zip`, and
      `desktop-dev-manifest.json`.
- [x] Confirm the manifest commit equals the candidate SHA and each asset's size and
      SHA-256 hash match the uploaded file.
- [x] Record the Actions run and GitHub Release URLs in the run record.

Checkpoint: a second Mac can obtain a commit-identified, integrity-verifiable build
without cloning the repository.

### 3. Install on the second Mac

- [ ] Record the second Mac's architecture and macOS version.
- [ ] Download the matching ZIP from `desktop-dev-latest` and verify it against the
      manifest before opening it.
- [ ] Install `Hubble.app` in `/Applications` and explicitly approve the expected
      unsigned-development Gatekeeper warning. Do not mistake this for production
      signing acceptance.
- [ ] Launch the app, sign in, select the intended Workspace/shared folder, and verify
      the build reaches the same dev deployment as the first Mac.
- [ ] Prefer running the same packaged commit on the first Mac too. If the first Mac
      uses a development process instead, record that difference.

Checkpoint: both Macs show the same known test document without filesystem or sync
errors.

### 4. Run the focused cross-device matrix

Use disposable documents/folders with recognizable names. Preserve any surprising
bytes before retrying a failed operation.

- [ ] Mac A editor change appears on Mac B; then repeat B → A.
- [ ] Make non-overlapping simultaneous edits and confirm both survive on both Macs.
- [ ] Confirm presence/cursor behavior using two accounts. If the same account is used
      on both Macs, label this as sync-only evidence, not collaborator-presence proof.
- [ ] Make a Markdown filesystem edit inside Mac B's managed projection and confirm it
      reaches Mac A and the cloud document.
- [ ] Fully quit Hubble on Mac B, edit a managed file, relaunch, and confirm startup
      protects and reconciles the local change before materialization.
- [ ] Take Mac B offline, edit a managed file, reconnect, and confirm the queued work
      reconciles without losing either side.
- [ ] Observe whether healthy sync stays quiet and whether syncing, offline, queued,
      and error states are understandable at the affected folder.
- [ ] Record perceived latency, confusing terminology, missing feedback, visual
      hierarchy problems, and any moment where either person is unsure which version
      is authoritative.

Stop immediately and preserve evidence if either side loses content, a build connects
to an unexpected deployment, permissions are inconsistent, or a recovery path would
overwrite existing bytes.

### 5. Close the checkpoint

- [ ] Create
      `specs/desktop-cloud-workspace/runs/YYYY-MM-DD-cross-device-live-test.md` with
      the candidate SHA, release/run links, machines/accounts used, completed matrix,
      exact failures, screenshots where useful, and retained test-data locations.
- [ ] Classify findings into release blockers, UX/UI follow-ups, and later hardening.
- [ ] Update `brain/synthesized/roadmap.md` with the outcome and the newly justified
      next step.
- [ ] Log the completed pass in `brain/admin/activity-log.md`.
- [ ] Decide whether to prioritize the UX/UI findings, finish Phase 6 recovery safety,
      or prepare production distribution. Do not decide that ordering in advance of
      the evidence.

## Acceptance

This checkpoint passes when:

1. `desktop-dev-latest` reproducibly identifies and distributes the intended commit
   for both Mac architectures.
2. A second Mac installs, launches, authenticates, and opens the same dev cloud
   content without a repository clone.
3. Cloud editor changes work in both directions between machines.
4. At least one real watched-filesystem edit travels Mac B → cloud → Mac A.
5. Quit-time and offline edits are either safely reconciled or produce a preserved,
   actionable failure with no lost bytes.
6. The run record makes the most valuable UX/UI follow-ups explicit.

## Operator boundaries

The execution agent must ask before pushing branches, changing GitHub's default-branch
workflow state, publishing/replacing release assets, deploying Convex code, or removing
test data. Signing/notarization credentials are not required for this dev checkpoint.
