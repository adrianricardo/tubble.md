# Cross-device desktop dev release and live test

Date: 2026-07-13
Status: in progress — release published and verified; second-Mac acceptance pending

## Candidate and deployment

- Preflight candidate: `94b63e6bb4670417900d5d566691f1ef9bf3b8b8`.
- Published candidate: `d0a2cc16bf29d943d9074c1942e7ef600d548844`.
  The only delta is the workflow fix described below.
- Dev Convex deployment: `https://strong-setter-709.convex.cloud`.
- Workflow publication commit on `main`: `3b22657ec1f050eb4f12c0bd5738f87d13c05d2a`.
- Successful Actions run:
  https://github.com/adrianricardo/hubble.md/actions/runs/29297362856
- Stable prerelease:
  https://github.com/adrianricardo/hubble.md/releases/tag/desktop-dev-latest

The backend was deployed from `packages/sync-backend`. Deployed function metadata
contains `documents.js:importMarkdown`, `folders.js:prepareDocumentRelocation`, and
`folders.js:confirmDocumentRelocation`.

## Publication findings

The first Convex command was mistakenly invoked from the monorepo root rather than
the backend package. It temporarily removed the application's indexes and unmounted
the ProseMirror component. The correct package-level deployment immediately restored
every reported index and remounted the component before any branch or app publication.

The first workflow dispatch, run `29297310247`, stopped during pnpm setup because both
the action and `package.json#packageManager` specified a pnpm version. Candidate
commit `d0a2cc1` removes the redundant action input; the corrected run passed install,
both-architecture build, manifest generation, and stable-channel publication in
3m21s. GitHub emitted non-blocking notices about Node 20 action runtime deprecation
and the future `macos-latest` migration to macOS 26.

## Artifact verification

The prerelease is marked as a prerelease, targets `d0a2cc1`, and contains exactly:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Hubble-dev-arm64-mac.zip` | 138,830,397 | `60efbc81b6e2b400f5960bcf566122b6ca5a3609c325489edeb31d6b397dc469` |
| `Hubble-dev-x64-mac.zip` | 144,625,561 | `47b3aca943c793dcf06170fc05e8f4cb6f4545f86ab39d1c8c3bda7048c59e86` |
| `desktop-dev-manifest.json` | 538 | `4cbc5c2ed9e326fa885aea3ca41c992c522cb2bbc6c8bb37b5171e5da0072df4` |

Both ZIPs were downloaded independently to `/tmp/hubble-desktop-dev-release-verify`.
Their local byte sizes and SHA-256 hashes match the manifest, whose commit is the full
published candidate SHA and whose version is `0.1.13-dev.d0a2cc16bf29`.

## Second-Mac installation — pending

- [ ] Record architecture and macOS version.
- [ ] Download the matching ZIP and verify size/hash against the manifest.
- [ ] Install to `/Applications` and approve the expected unsigned-development warning.
- [ ] Sign in and confirm the app is connected to dev.
- [ ] Confirm both Macs show the same known test document.

### Installation UX findings — in progress

- The unsigned app triggered macOS's **Hubble Safe Storage** Keychain prompt with the
  alarming system wording that Hubble wanted confidential information. The prompt
  offered no Hubble-auth context or explanation that Electron uses this item to
  encrypt local session storage. Adrian accidentally chose **Deny**. Treat this as a
  clean-machine onboarding finding: development installation guidance should explain
  the prompt before sign-in, recommend one-time **Allow** for the unsigned checkpoint,
  and give a safe retry/reset path after denial. Re-test the experience with a signed
  production build rather than assuming the dev prompt represents shipped behavior.
- Immediately after sign-in, Hubble displayed **Bring “README.md” into Hubble** over
  Settings even though Adrian had not knowingly initiated an import. The current
  startup path accepts the first existing file argument or macOS `open-file` event,
  queues it as `importSourcePath`, and renders the dialog only inside
  `<Authenticated>`. A file event received while signed out can therefore surface
  after authentication with its cause hidden. The exact source of this `README.md`
  event is not yet proven. Follow-up UX/correctness work should show the full source
  path and why the prompt appeared, avoid carrying an unexplained import across the
  auth boundary, and test packaged Finder launch, file association, Open With, and
  sign-in sequencing for spurious launch arguments.
- After sign-in, the populated `testspace2` cloud context showed an HTML Apps/skills
  promotion but no explanation that the Space was still cloud-only or how to expose
  it as Markdown to local agents. The working controls were hidden in Settings and
  represented two different scopes: a legacy all-accessible mirror and a folder-only
  Repo Link. Adrian selected this as the next implementation follow-up. The approved
  primary journey makes only the current Space/shared context available on the Mac;
  the secondary journey links one cloud folder to one Git repository. Product and
  implementation plans: `specs/local-agent-availability-onboarding/PRODUCT.md` and
  `specs/local-agent-availability-onboarding/TECH.md`.

## Focused two-device matrix — pending

- [ ] Cloud editor A → B and B → A.
- [ ] Non-overlapping simultaneous edits survive on both Macs.
- [ ] Presence behavior recorded with account distinction.
- [ ] Managed Markdown edit on Mac B reaches cloud and Mac A.
- [ ] Quit-time local edit is protected and reconciled on relaunch.
- [ ] Offline local edit reconciles safely after reconnect.
- [ ] Healthy, syncing, queued, offline, and error feedback assessed.
- [ ] Findings classified into blockers, UX/UI follow-ups, and later hardening.

Do not infer a pass from publication alone. The checkpoint remains open until the
physical second-Mac and two-device evidence is recorded.
