# Local-agent availability Milestone 4 implementation

Date: 2026-07-14
HEAD at revalidation: `9d8cf8d243b695bfbab5692fe1131445ee341556`

## Scope

Milestone 4 moves repository-link creation out of its independent Settings form and
into the selected cloud context's local-agent onboarding. Settings now manages
existing repo-associated availability records through the same generalized lifecycle
API used by standalone projections.

The contextual repo journey now:

- preselects an eligible shared-folder context or lists full folder paths for a member
  Space;
- lets a member create a root cloud folder before choosing a repository;
- resolves a selected repository or child directory to the Git root;
- derives one bounded Markdown destination inside that root;
- previews cloud scope, effective access, Git exclusion, the repository boundary, and
  non-overwriting `BRAIN.md` behavior;
- reports verification/materialization progress from the main process;
- completes through the common path/reveal/copy/agent-instructions surface and shows a
  manual ignore pattern when `.git/info/exclude` could not be written;
- explains why viewer/commenter contexts retain standalone read-only availability but
  cannot create repo associations.

HTML Apps guidance now keys off the selected context's exact healthy availability
record. It no longer uses the unrelated legacy open-folder `workspacePath`, and its
dismissal key is the stable projection scope key.

## Verification

- Changed-file Biome and `git diff --check`: pass.
- Desktop tests: 178/178 pass.
- `pnpm build:desktop`: pass using the repository-pinned pnpm 10.33.2.
- Simplify, comments, and review-readiness passes: complete.

Real development Electron/CDP acceptance used the existing authenticated profile and
made no cloud or filesystem mutations:

- the viewer-only `testshare` context showed the exact shared source/role, kept the
  primary read-only journey available, explained the repo permission restriction, and
  disabled repository selection and completion;
- the member `adrian's space` context showed folder selection plus root-folder
  creation before repository choice and exposed a focusable safe Cancel target;
- HTML Apps guidance was absent for `testshare` before local availability;
- the healthy exact `magic-test` context showed guidance and produced
  `cd ~/magic-test && npx skills add bholmesdev/hubble-skills` rather than using the
  open playground path.

The host kept the Electron document itself unfocused during CDP interaction, so it
could not prove automatic initial focus or literal screen-reader speech. The dialog
uses Base UI's native initial-focus callback with an autofocus fallback, and direct DOM
focus confirmed the safe Cancel target is enabled and focusable.

## Remaining packaged gate

Milestone 4 is implemented but not packaged-accepted. A follow-up host pass must:

1. create or select an expendable member folder and link it to a scratch Git repo by
   selecting a child directory;
2. verify resolved root, derived mount, Git exclusion/manual fallback, non-overwriting
   `BRAIN.md`, connected completion, external Markdown reconciliation, relaunch, and
   Settings management;
3. run both standalone and repo journeys with physical keyboard and VoiceOver,
   recording literal scope, role, path, progress, restriction, error, and completion
   speech;
4. clean up only the fixtures created by that pass.

No backend deployment, packaged build, test-data creation/removal, cloud mutation, or
repository-link mutation occurred in this implementation acceptance.

The cloud brain mount was unavailable, so the required Brain Activity Log entry is
queued here for the next mounted brain-keeper pass.

## 2026-07-15 autopilot revalidation

Fresh-session review preserved the existing working tree and revalidated the
Milestone 4 implementation without cloud, repository-link, or backend mutation.

- All 172 desktop tests that do not bind a Unix socket pass. The six CLI-server tests
  fail only at `server.listen(...)` with the managed sandbox's known `EPERM`.
- The five focused local-agent onboarding/model tests pass.
- Desktop renderer and main-process TypeScript checks, changed-file Biome, and
  `git diff --check` pass.
- A production Electron/Vite build passes. A fresh arm64 directory package was
  produced with ad-hoc signing and passes `codesign --verify --deep --strict`.
- The required simplify, comments, React performance, and review-readiness passes are
  complete. The only resulting adjustment makes the healthy exact-scope handoff
  depend on primitive scope/path values instead of transient object identity.

Packaged acceptance remains unavailable on this host: both the fresh packaged binary
and the development Electron binary exit before a renderer starts (development ends
with `SIGABRT`), and `127.0.0.1:9222` never becomes reachable. No keyboard, VoiceOver,
external-edit, relaunch, Settings-management, or cleanup result is claimed. The
repo-only preload/IPC compatibility adapters therefore remain in place until the
packaged parity gate above is completed.

Queued Brain Activity Log entry (cloud mount unavailable):

> 2026-07-15 — Revalidated local-agent availability Milestone 4 in a fresh autopilot
> session. Automated desktop/type/format/build checks and fresh arm64 packaging pass;
> managed-host Electron launch restrictions still prevent the packaged keyboard and
> VoiceOver gate. No cloud/backend/repo-link fixture mutation occurred. Roadmap and
> run evidence now name the exact remaining host acceptance.
