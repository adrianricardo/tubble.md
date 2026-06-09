# Technical spec: Desktop Shadow DOM embed spike

## Context

Issue #35 validates the desktop-only render spine for trusted Embeds. The product behavior is in `specs/gh-35/PRODUCT.md`; this plan maps to Behavior 1-10.

Current commit researched: `e352538fcac0826efc4518ad8cdc479df9ea2a61`.

Relevant architecture:

- `CONTEXT.md` defines an Embed as an in-realm, CSS-isolated interactive component that uses Workspace-scoped capabilities later.
- `docs/adr/0005-embeds-render-in-realm-shadow-dom.md` makes in-realm Web Component + Shadow DOM provisional and requires a spike decision.
- `packages/editor/src/markdownToProsemirror.ts` parses standalone `embed-*` HTML into an atom `embed` node.
- `packages/editor/src/prosemirrorToMarkdown.ts` serializes `embed` nodes back to custom element HTML.
- `apps/desktop/src/editor/EmbedExtension.tsx` owns the Tiptap extension, NodeView, Web Component host, bundle loading, Shadow DOM mount, and error rendering.
- `packages/cli/src/embedBuild.ts` already describes the eventual bundle contract: IIFE `embed.js`, injected CSS string, and `window.__hubbleEmbeds[name].mount(shadowRoot, props, hubble)`.

## Affected apps and packages

- `apps/desktop`: mounts the Embed extension in the desktop editor, loads trusted local bundles, exposes the NodeView host, and validates popover overflow manually.
- `packages/editor`: owns Markdown parse/serialize round-trip behavior for `embed-*` custom elements.
- `packages/cli`: only referenced for the host/bundle contract and fixture shape. No production build pipeline is required for this spike unless a fixture uses the existing builder.

## Module architecture

- `packages/editor/src/markdownToProsemirror.ts`
  - Keep parsing limited to a single standalone custom element whose tag matches `embed-[a-z0-9][a-z0-9-]*`.
  - Store `{ name, tagName, props }` on an atom `embed` node.
  - Reject nested content and sibling HTML for this spike, matching Product Behavior 8.
- `packages/editor/src/prosemirrorToMarkdown.ts`
  - Serialize valid `embed` nodes as `<embed-name key="value"></embed-name>`.
  - Escape attributes and drop invalid tag names or invalid attribute names.
- `apps/desktop/src/editor/EmbedExtension.tsx`
  - `createEmbedExtension(workspacePath)` registers the Tiptap atom and renders a React NodeView.
  - `EmbedNodeView` creates a `hubble-embed-host` custom element with `embed-name`, `workspace-path`, and serialized props.
  - `HubbleEmbedElement` attaches an open ShadowRoot, loads the bundle once per workspace/name, calls `mount`, stores cleanup, and ignores stale async loads.
  - Bundle loading reads `.hubble/embeds/<name>/dist/embed.js`, imports it from a Blob URL, and expects registration on `window.__hubbleEmbeds`.
  - Error rendering stays inside the ShadowRoot so broken Embeds are visible but non-destructive.
- `apps/desktop/src/editor/EmbedExtension.css`
  - Keep host block spacing in logical CSS properties.
  - Avoid clipping on the host path; do not add overflow-hidden around the Embed block.
- `docs/adr/0005-embeds-render-in-realm-shadow-dom.md`
  - Add or keep the spike decision: Shadow DOM is good enough for the next slices; nested children are deferred.

## Detailed plan

1. Parse/serialize
   - Add focused tests in `packages/editor/src/EmbedMarkdown.test.ts` for standalone parse, invalid nested content, sibling HTML rejection, and serialization.
   - Keep parsing generic for `embed-*`, but use `<embed-kanban>` as the validated spike fixture.
2. Desktop NodeView
   - Register `createEmbedExtension(workspace.workspacePath)` with `EditorView` in `apps/desktop/src/App.tsx`.
   - Render the Embed as an atom block so editor selection and document editing remain predictable.
3. Web Component host
   - Define one stable internal custom element name, `hubble-embed-host`, to avoid colliding with user-authored `embed-*` tags.
   - Attach Shadow DOM in `connectedCallback`.
   - Re-render on `embed-name`, `workspace-path`, or `props-json` changes, with cleanup before each render.
4. Static Kanban fixture
   - Provide a trusted local bundle for `kanban` that registers `window.__hubbleEmbeds.kanban`.
   - Mount a React root into the provided ShadowRoot.
   - Inject built CSS by appending a `<style>` element to the ShadowRoot before the React mount point.
   - Include a dropdown/popover fixture whose popup is positioned so desktop QA can prove it is not clipped.
5. Error handling
   - Show inline errors for no workspace path, invalid names, missing files, failed imports, and missing registration.
   - Keep errors visible in the editor without modifying Markdown.
6. ADR decision
   - Update ADR-0005 after the manual desktop pass. For the current issue scope, the decision should explicitly defer slot/content-hole children.

## Testing and validation

- Behavior 1, 8: unit test `packages/editor/src/EmbedMarkdown.test.ts`.
- Behavior 2, 6, 7: add component-level coverage if practical around `EmbedExtension`; otherwise validate manually in desktop.
- Behavior 3-5: manual desktop QA is required because Shadow DOM, Electron Blob imports, and popover overflow are integration behavior.
- Run `pnpm check` for quick validation.
- Run `pnpm build:desktop` before final implementation confidence if code changes accompany the spec.
- Computer Use flow:
  - Start desktop with `pnpm dev:desktop`.
  - Open a Workspace Folder containing a Markdown File with `<embed-kanban board="roadmap"></embed-kanban>`.
  - Confirm render, selected-node outline, save/reopen round-trip, and popover overflow.
  - Temporarily remove `.hubble/embeds/kanban/dist/embed.js` and confirm inline error behavior.

## Risks and mitigations

- Same-realm execution is unsafe for future shared/foreign documents. Keep this spike desktop-only and trusted; ADR-0005 still requires document-level sandboxing before sharing.
- Blob `import()` can cache stale code or race with node updates. Key bundle promises by workspace/name and drop cache entries on failed loads.
- Shadow DOM styling may make popover libraries portal to the wrong root. Validate a real dropdown/popover before accepting the spike.
- Nested children are deliberately out of scope; avoid adding partial content-hole behavior that creates unsupported editing semantics.

## Parallelization

Not useful for this spike. Parse/serialize, NodeView host, fixture, and ADR decision are tightly coupled and small enough for one agent to implement and validate sequentially.
