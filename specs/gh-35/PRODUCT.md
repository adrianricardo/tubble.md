# Product spec: Desktop Shadow DOM embed spike

## Summary

Validate the thinnest desktop-only Embed render spine with a hardcoded `<embed-kanban>` block. A user can keep that custom element in Markdown, open it in the desktop editor, and see a trusted same-realm React Embed render with scoped styles and unclipped overlay UI.

## Problem

ADR-0005 makes Shadow DOM + built CSS the provisional first Embed mechanism. Before building the full Embed platform, Hubble needs proof that the editor can parse, mount, style, and compose a simple Embed without iframe clipping.

## Goals / non-goals

- Goal: prove desktop render mechanics for trusted local Workspace content.
- Goal: record whether Shadow DOM remains viable for the next Embed slices.
- Non-goal: build authoring UI, bundle discovery, data access, permissions, web support, or cross-person untrusted isolation.
- Non-goal: support nested children/content-holes in this spike. The issue update defers that behavior.

## Behavior

1. In desktop, a Markdown File containing `<embed-kanban></embed-kanban>` or `<embed-kanban board="roadmap"></embed-kanban>` keeps that exact Embed block when opened, edited around, saved, and reopened.
2. The Embed appears as one selectable block in the editor. Selecting it shows the normal ProseMirror selected-node affordance and does not expose editable inner text.
3. The rendered Embed is a static Kanban-style React experience. It does not fetch Workspace data, mutate files, or depend on user-provided parameters beyond preserving parsed attributes.
4. The Embed's styles are scoped to the Embed. Its visual treatment does not leak into surrounding Markdown, and surrounding editor styles do not break the Embed's internal layout.
5. A dropdown or popover inside the Embed can open past the Embed's visual box and remain visible, clickable, and uncut by the host block.
6. If the Embed bundle is missing, invalid, or fails to register, the block shows an inline error in place of the Embed without corrupting the Markdown File.
7. If the editor cannot resolve a Workspace path, the block shows an inline "open a workspace" style error instead of silently disappearing.
8. Unsupported custom element shapes are conservative: nested `<embed-kanban>` content and Embed HTML with sibling HTML are not converted into an Embed block in this spike.
9. This feature is desktop-only. Web behavior is unchanged.
10. The spike ends with ADR-0005 updated or confirmed with the decision to keep Shadow DOM for the next Embed slices, or to revisit the approach before additional Embed work.

## UX validation

- Desktop: open a Workspace Folder with a Markdown File containing `<embed-kanban board="roadmap"></embed-kanban>`.
- Confirm the block renders as a static Kanban Embed, can be selected as a block, and survives save/reopen.
- Open the Embed dropdown/popover and confirm it overflows visibly outside the block.
- Rename/remove the bundle and reopen the file; confirm an inline error appears and the source Markdown remains intact.
