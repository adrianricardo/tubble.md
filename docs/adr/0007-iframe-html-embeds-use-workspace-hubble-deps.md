# Iframe HTML embeds use host-injected dependencies

> **Status: accepted.** This ADR is the source of truth for the current [[Embed]] strategy. It supersedes [ADR-0005](./0005-embeds-render-in-realm-shadow-dom.md)'s in-realm Embed Bundle direction for local, agent-authored mini apps.

Hubble supports a lightweight [[Embed]] form for agent-authored mini apps:

```html
<iframe src="./file-index.html"></iframe>
```

The iframe `src` must be a workspace-local relative `.html` path. Desktop resolves it relative to the Markdown file, serves it through the `hubble-asset://` protocol, and renders it with `sandbox="allow-scripts"` without `allow-same-origin`. The iframe therefore has an opaque origin and cannot reach the host app, Electron preload bridge, local storage, or parent DOM.

## Decisions

- **Load authored HTML by `src`, not `srcdoc`.** Opaque sandboxed `srcdoc` rendered blank in Electron because the child document got a zero layout box on cold start. Loading the workspace file through `hubble-asset://` preserves the opaque sandbox and gives Chromium a normal frame document.
- **Inject dependencies from the host.** Desktop serves workspace `.html` files through `hubble-asset://` after injecting vendorized scripts. Authored HTML should not include dependency `<script>` tags for the Hubble runtime, Tailwind browser, or Alpine.
- **Bundle a canonical dependency set.** The first slice injects Hubble runtime, Tailwind browser v4, and Alpine for every iframe HTML embed. There is no opt-in or opt-out yet.
- **The iframe runtime exposes a small global API.** Today it provides `window.hubble.files.list()` and `window.hubble.files.read()` plus height reporting over `postMessage`.

## Consequences

- HTML embeds are viewable in a normal browser as static HTML, but Hubble-specific APIs and host-injected dependencies only work when served by Hubble.
- Agents do not need an install step or `.hubble/node_modules` before using Alpine, Tailwind browser classes, or `window.hubble`.
- The Desktop app's bundled runtime dependencies are the portable contract.
- The broker remains async and capability-scoped. Future write/create file APIs should extend the runtime broker rather than exposing direct filesystem access.
