# RD9 - Packaged Desktop Release

Assigned tier: **standard**.

Status: **landed locally 2026-06-28**.

Why: this slice is production release mechanics for an already-merged,
flag-gated desktop app. The work is mostly packaging verification, release
workflow checks, and small fixes exposed by packaged-app behavior.

## Objective

Prove the macOS desktop app can be built as production release artifacts after
RD5/RD6/RD8/RD10, and document the exact release boundary before a human cuts a
tag. This slice should not ship a release by itself unless the operator provides
signing/notarization secrets and confirms the target tag.

## Scope

- Run the production Electron package path locally.
- Confirm the expected updater artifacts are produced:
  `latest-mac.yml`, arm64 mac zip, arm64 dmg, and blockmaps.
- Smoke the generated `.app` enough to catch launch-time packaging errors.
- Confirm the GitHub Actions release workflow matches the package version/tag
  contract and publishes non-draft releases.
- Record any signing/notarization limitation explicitly instead of treating an
  unsigned local package as a signed release.

## Acceptance

- `pnpm build:desktop` passes. ✅
- `pnpm bundle:desktop` produces macOS artifacts under `apps/desktop/release/`. ✅
- The packaged `.app` launches without an immediate main-process crash. ✅
- Release workflow still enforces `desktop-v<version>` tag matching
  `apps/desktop/package.json`.
- Any missing operator-only inputs, such as Apple signing credentials or the
  release tag, are documented as release-cut prerequisites. ✅

## Results

- Produced local artifacts for `@hubble.md/desktop@0.1.13`:
  - `apps/desktop/release/latest-mac.yml`
  - `apps/desktop/release/Hubble-0.1.13-arm64-mac.zip`
  - `apps/desktop/release/Hubble-0.1.13-arm64.dmg`
  - matching `.blockmap` files
- Local package signing used the available Apple Development identity
  `Apple Development: next.ten@gmail.com (KURHDF496U)`.
- Local notarization was skipped by electron-builder because notarize options
  could not be generated in this environment.
- `codesign --verify --deep --strict --verbose=2` passed for
  `release/mac-arm64/Hubble.app`.
- Packaged `.app` launched and stayed up for the smoke; the remaining background
  process after AppleScript quit matched the always-on tray lifecycle and was
  stopped after the test.
- The generated DMG mounted successfully and contained `Hubble.app` plus the
  `/Applications` symlink.

## Release-Cut Prerequisites

- Confirm the target release version and bump `apps/desktop/package.json`.
- Promote the matching `CHANGELOG.md` section.
- Tag the release as `desktop-v<version>` so
  `.github/workflows/desktop-release.yml` passes its version check.
- Ensure GitHub Actions secrets are configured for distribution signing and
  notarization: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.

## Verification

```sh
pnpm build:desktop
pnpm bundle:desktop
codesign --verify --deep --strict --verbose=2 apps/desktop/release/mac-arm64/Hubble.app
open -n apps/desktop/release/mac-arm64/Hubble.app
hdiutil attach apps/desktop/release/Hubble-0.1.13-arm64.dmg
```

For a real release cut, follow the release skill:

1. Bump `apps/desktop/package.json`.
2. Promote `CHANGELOG.md`.
3. Commit, tag `desktop-v<version>`, and push branch + tag.
4. Let `.github/workflows/desktop-release.yml` build, sign/notarize when secrets
   are present, publish GitHub artifacts, and attach the matching changelog
   section.
