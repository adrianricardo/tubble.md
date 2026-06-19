# One CLI package; version the host↔bundle contract, not the CLI

> **Status: superseded by [ADR-0007](./0007-iframe-html-embeds-use-workspace-hubble-deps.md).** Hubble no longer ships an Embed Bundle builder or host↔bundle runtime path. Current embeds are workspace-local iframe HTML files served through `hubble-asset://`.

The Embed bundler ships as part of the existing Hubble **CLI** — which already runs the headless sync service — distributed via **npm** *and* **bundled inside the desktop app** (so installing desktop gives you the toolchain for free). Keeping the npm CLI and the desktop-bundled CLI at *matching versions* is unenforceable (they have separate release/version schemes), so instead we make the **host↔[[Embed Bundle]] runtime contract** the versioned stability boundary. A built bundle targets a contract version (broker API + Web Component mount contract); hosts (desktop, web) support a backward-compatible range. CLI and app versions may drift beneath it without breaking rendering.

## Decisions

- **One CLI package** (sync service + Embed bundler), two distributions: npm and bundled-in-desktop. No separate "engine" package.
- **Desktop installs a PATH shim that prefers the bundled CLI** (VS Code model). `hubble --version` reports the bundled version and any global on PATH, so split-brain is never silent.
- **npm CLI and desktop are built from the same commit**; each declares a **contract version**. CI needs a CLI whose contract range *overlaps* the target host — not version equality.
- **Embed Bundles record `builderVersion` in metadata now.** Deterministic-rebuild verification keyed on it (`src → dist` hash match) is **deferred** — the field is recorded but not yet enforced, so the data exists when verification lands.

## Considered Options

- **Version-lock CLI to app** — either Obsidian-style thin remote-control, or forced version equality. Rejected: remote-control isn't headless (no CI/agent builds), and equality across two release schemes can't be guaranteed.
- **Separate bundler-engine package** distinct from the CLI. Rejected: the CLI already is the headless service; a separate engine is needless indirection.

## Consequences

- The host↔bundle contract must be **explicitly versioned and kept backward-compatible**. Breaking it is the expensive, deliberate act — not bumping the CLI.
- Split-brain (two installed CLI versions) shrinks to *deliberate* global installs and is made **benign for rendering** by the contract. Only build-output determinism is affected, and that's deferred.
- `builderVersion` is recorded but not enforced; until then, verification is not available.
