# Tubble.md

**The Markdown notepad for you and your agents — now with account-backed cloud
Workspaces.** Free, open source, backed by Markdown and HTML.

> **Tubble.md is a fork of [Hubble.md](https://github.com/bholmesdev/hubble.md)** by
> [@bholmesdev](https://twitter.com/bholmesdev). Tubble adds a hosted cloud service and
> account-backed Workspaces on top of Hubble's local Markdown editor. The original
> project does not maintain or endorse this fork. See [lineage](#lineage-and-credits).

<p align="center">
  <a href="https://github.com/adrianricardo/tubble.md/releases/latest">Download for macOS</a>
  ·
  <a href="https://github.com/adrianricardo/tubble.md/releases">Releases</a>
  ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

## What is Tubble?

Tubble is a free, open-source notetaking app for you and your agents, with the same
familiar Markdown writing experience Hubble is known for — plus cloud Workspaces you can
open on the web and on macOS.

- **Feels familiar.** The writing experience you're used to from Notion or Apple Notes,
  but for Markdown. `/` commands, Markdown shortcuts, and file properties / frontmatter
  are supported.
- **Cloud Workspaces.** Create an account and get Workspaces that open on both web and
  macOS, with realtime editing and folder sharing.
- **Agent ready on macOS.** The desktop app can make your exact current cloud scope
  available as watched local Markdown at a path you choose, so a local agent (Claude
  Code, Cowork) can edit those files and the changes flow back to the web document.
- **Build any view.** Beyond Markdown, you can build and view HTML-based apps.
  [Install the skills](https://github.com/bholmesdev/hubble-skills) and tell your coding
  agent what to build — turn a folder of notes into a table, a bookshelf, a map.

## Try it today

There are two ways to use Tubble:

### 1. Hosted trial

<!-- TODO(Phase 3): replace with the operated hosted-trial URL once resolved and control is verified (config/brand.json → web.url). -->
A best-effort hosted service where you can create an account and start writing
immediately — **link coming at launch.**

> ⚠️ **The hosted trial is best effort.** It is a public trial with **no uptime, backup,
> support, security-review, or maintenance guarantee**, and is **not intended for
> critical, sensitive, or irreplaceable work.** Keep your own copies. If you need more
> control, deploy your own instance below.

### 2. Deploy your own

Run Tubble on your own managed [Convex](https://convex.dev) production project and web
host, with a macOS desktop app built against your deployment. See the
[independent-deployment guide](./specs/public-try-it-today-launch/DEPLOY.md).

<!-- TODO(Phase 2): the guide is a draft until the DEPLOY-5 clean-clone verification
     record at the bottom of DEPLOY.md is completed by a second operator. -->
> The deployment guide is a **draft pending a clean-clone verification pass** — see the
> verification record at the bottom of the guide.

## Download (macOS)

Tubble ships as a desktop app. Install the latest build from the
[releases page](https://github.com/adrianricardo/tubble.md/releases/latest).

macOS is supported today. Windows and Linux are not built yet — contributions are
welcome.

## Compile from source

Want to build Tubble directly? First, install the prerequisites:

- [Node.js](https://nodejs.org/en/download)
- [pnpm](https://pnpm.io/installation)
- macOS desktop builds: Xcode Command Line Tools via `xcode-select --install`

Then from the repo root:

```sh
pnpm install
pnpm bundle:desktop
```

This creates a production desktop bundle under `apps/desktop/release/`. For the live dev
flow and packaging detail, see [`apps/desktop/README.md`](./apps/desktop/README.md).

## Repository structure

This repo is a pnpm workspace:

```text
.
├── apps
│   ├── desktop  # Electron desktop app (the main Tubble app)
│   ├── web      # Astro landing page
│   └── www      # React + Convex web app (Tubble in the browser)
└── packages
    ├── editor         # Framework-agnostic Markdown editor core (Tiptap + Markdown conversion)
    ├── ui             # Shared React editor UI built on the editor core
    ├── runtime        # Runtime injected into HTML Apps and Embeds
    ├── sync           # Filesystem sync engine
    ├── convex-client  # Convex client used by the sync engine
    ├── sync-backend   # Convex backend powering Cloud Sync
    └── cli            # `hubble` CLI for syncing a folder from the terminal
```

> **Note on internal names.** The npm package namespace (`@hubble.md/*`), the `hubble`
> CLI command, the `hubble://` deep-link scheme, and the desktop application identifier
> are retained from the upstream project as documented compatibility identifiers — see
> [`config/compatibility.json`](./config/compatibility.json). Mutable public brand values
> live in [`config/brand.json`](./config/brand.json); run `pnpm check:brand` to validate.

## Common commands

From the repo root:

```sh
pnpm install          # install dependencies
pnpm dev:desktop      # run the desktop app in dev
pnpm dev:www          # run the web app in dev
pnpm build            # check, build all packages, and typecheck
pnpm bundle:desktop   # build a production desktop bundle
pnpm check            # run Biome
pnpm check:brand      # validate public brand values against config/brand.json
pnpm typecheck        # typecheck all packages
```

## Documentation

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) covers the contribution flow, local setup, and pre-PR checks.
- [`CONTEXT.md`](./CONTEXT.md) is the shared glossary for project terms (Workspace, HTML App, Embed, and more).
- [`apps/desktop/README.md`](./apps/desktop/README.md) covers desktop build, dev, and packaging.

## Contributing

Contributions of any size are welcome. Open an issue before substantial work so we can
agree on the approach together. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full
flow.

This project follows our [Code of Conduct](./CODE_OF_CONDUCT.md). To report a security
issue, see our [security policy](./SECURITY.md).

## Lineage and credits

Tubble.md is a fork of **[Hubble.md](https://github.com/bholmesdev/hubble.md)**, created
by **[@bholmesdev](https://twitter.com/bholmesdev)** (Ben Holmes). Hubble is the original
local-first Markdown notepad for people and their agents; Tubble builds on it by adding
account-backed cloud Workspaces, a hosted trial, and an independent-deployment path.

The upstream project does not maintain, support, or endorse this fork. The
[`hubble-skills`](https://github.com/bholmesdev/hubble-skills) repository referenced above
is also an upstream project.

## License

Tubble.md is a fork of Hubble.md and is licensed under the [MIT License](./LICENSE). The
original copyright notice (Copyright © 2026 Ben Holmes) is retained in `LICENSE` as
required.
