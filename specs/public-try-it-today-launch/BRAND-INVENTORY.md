# Rename inventory — Hubble → Tubble.md

**Status:** Phase 1 artifact. This is a reviewable map only; it does **not** perform any
rename or touch external resources. Each row is classified as one of:

- **PUBLIC RENAME** — a mutable public brand value that must change for launch and
  should be driven by the brand manifest (`config/brand.json`).
- **COMPAT ALIAS** — an internal/compatibility-sensitive identifier intentionally
  retained (bundle IDs, protocol schemes, package namespaces, persisted paths). Tracked
  in the compatibility map (`config/compatibility.json`) and documented, not hidden.
- **CLEANUP** — internal, non-public cosmetic references safe to change post-launch.

Migration rule (fixed before any identity change): **no rename may strand an existing
user's account, installed app, on-disk files, or deep links.** Any identifier whose
change would break an installed desktop app (bundle ID, `userData` path, protocol
scheme), a persisted on-disk directory, or an existing account/deployment binding stays
a COMPAT ALIAS until a dedicated, separately-reviewed migration exists. Only display
copy, links, and metadata that can change without breaking installed state are PUBLIC
RENAME.

## Repository & package metadata

| Location | Current value | Class | Notes |
| --- | --- | --- | --- |
| `package.json` `repository.url`, `bugs` (root + all `packages/*` + `apps/*`) | `github.com/bholmesdev/hubble.md` | PUBLIC RENAME | Must point to the fork's owned repo. ~11 package.json files. |
| root `package.json` `name` | `hubble-md` | CLEANUP | Not published; internal monorepo id. |
| `packages/*` `name` | `@hubble.md/*` npm namespace | COMPAT ALIAS | Internal package namespace; unpublished. Retain to avoid churn; document. |
| `apps/desktop/package.json` `name` | `@hubble.md/desktop` | COMPAT ALIAS | Internal. |

## Domain, hosted app & public links

| Location | Current value | Class | Notes |
| --- | --- | --- | --- |
| `README.md` Download / Releases / Contributing / social links | `bholmesdev/hubble.md`, `@bholmesdev` | PUBLIC RENAME | Front door; must resolve to fork-owned destinations + labeled upstream attribution. |
| `CHANGELOG.md` current product introduction | `All notable user-facing changes to Hubble` | PUBLIC RENAME | Release-note front matter names the current fork; historical version entries retain their shipped names. |
| `README.md` skills link | `bholmesdev/hubble-skills` | COMPAT ALIAS or PUBLIC | Skills repo is upstream-owned; keep as attribution unless a fork skills repo exists. |
| `apps/www/index.html` `<title>` | `hubble.md` | PUBLIC RENAME | Hosted web app tab title. |
| `apps/www/src/auth/AuthScreens.tsx` | "Sign in to Hubble" | PUBLIC RENAME | Visible auth copy. |
| `apps/www/src/screens/GuestFolderScreen.tsx` | "Install the Hubble desktop app…"; releases URL `bholmesdev/hubble.md/releases/latest` | PUBLIC RENAME | Visible copy + download link. |
| `apps/desktop/index.html` `<title>` | `Hubble` | PUBLIC RENAME | Desktop window title. |

## Desktop display & release metadata

| Location | Current value | Class | Notes |
| --- | --- | --- | --- |
| `apps/desktop/package.json` `build.productName` | `Hubble` | PUBLIC RENAME (with migration) | Sets `.app` name, menu bar, and the macOS **"<name> Safe Storage"** Keychain prompt. Renaming changes the installed app name AND the `userData`/Safe Storage identity → **needs a migration note** so existing dev installs don't orphan their Keychain entry / userData. For a fresh public launch with no prior public installs, this is a clean PUBLIC RENAME. |
| `apps/desktop/electron/main.ts` `appName = "Hubble"` | `Hubble` | PUBLIC RENAME | Must derive from brand manifest; drives `app.setName`, tray, dialog titles. |
| `apps/desktop/package.json` `build.appId` | `com.benholmes.hubblemd.desktop` | COMPAT ALIAS | Changing appId makes macOS treat it as a different app (breaks auto-update continuity for any installed build). Retain; document. |
| `apps/desktop/package.json` `build.publish.owner/repo` | `bholmesdev` / `hubble.md` | PUBLIC RENAME | Auto-update + release feed must be fork-owned. |
| `.github/workflows/desktop-dev-release.yml` release title + uploaded asset names; `scripts/create-desktop-dev-manifest.mjs` generated asset names | `Hubble Desktop Dev`, `Hubble-dev-*` | PUBLIC RENAME | Public prerelease presentation must use the fork name. Already-published legacy binaries keep their immutable bytes; future channel publications use Tubble names. |
| Desktop copyright / attribution | (via LICENSE) | PUBLIC RENAME | Add fork identity while preserving upstream MIT notice. |

## Protocol & file associations

| Location | Current value | Class | Notes |
| --- | --- | --- | --- |
| `apps/desktop/package.json` `protocols.schemes` + `main.ts setAsDefaultProtocolClient("hubble")` + `main.ts` `hubble://` parsing | `hubble` scheme | COMPAT ALIAS | Deep links use `hubble://`. Changing the scheme breaks any issued/bookmarked deep link. Retain scheme; the protocol **display name** ("Hubble URL") is PUBLIC RENAME. |
| `protocols.name` | `Hubble URL` | PUBLIC RENAME | Display label only. |
| `fileAssociations` | Markdown assoc | KEEP | Not brand-specific. |

## Persisted paths & storage identity

| Location | Current value | Class | Notes |
| --- | --- | --- | --- |
| `userData` path (derived from app name) | `Hubble` (prod) | COMPAT ALIAS via appId | Tied to identity; do not silently relocate installed state. |
| Default projection root suggestion `~/Hubble/<context>` | `~/Hubble/` | COMPAT ALIAS / CLEANUP | On-disk user-visible dir. Changing default only affects NEW projections; existing ones keep their path. Safe to update default for launch, but not to move existing dirs. |
| Skills source `bholmesdev/hubble-skills` (`hubbleSkills.ts`, `HtmlAppsCallout.tsx`) | upstream skills repo | COMPAT ALIAS | Functional dependency on upstream skills; keep unless a fork skills repo is stood up. |

## Docs, agents & internal references

| Location | Current value | Class | Notes |
| --- | --- | --- | --- |
| `SECURITY.md` advisory link | `bholmesdev/hubble.md/security` | PUBLIC RENAME | Security destination must be fork-owned. |
| `CLAUDE.md`, `docs/agents/*`, `.agents/skills/*` | `bholmesdev/hubble.md` issue tracker | CLEANUP | Internal agent docs; point at fork repo but non-launch-blocking. |
| `specs/**`, `brain/**`, `apps/desktop/README.md` | mixed Hubble refs | CLEANUP | Internal history; not public-facing. |

## Explicitly-retained upstream references (attribution, NOT rename)

- Upstream repo `bholmesdev/hubble.md` links used as **attribution** (README lineage,
  upstream-intake specs, commit references in `specs/upstream-*`).
- `@bholmesdev` as the original author credit.
- Upstream `hubble-skills` repo (functional dependency + attribution).
- LICENSE "Copyright (c) 2026 Ben Holmes" — **must be preserved** (MIT requirement);
  fork adds its own notice alongside, never replaces.

## Open values needed to make the manifest concrete

These are the only values that block writing `config/brand.json`. Captured separately
via decision; see the manifest once filled:

1. Public web URL (hosted-trial front door).
2. Fork-owned public GitHub `owner/repo` (drives download, releases, issues, security,
   auto-update feed).
3. Public social/support handle (or none) to replace/augment `@bholmesdev`.
