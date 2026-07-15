# Desktop uses cloud authority with writable projections

## Status

Superseded by ADR-0011 on 2026-07-15. The projection-safety requirements remain valid
for cloud-authoritative folders; universal cloud authority does not.

## Context

ADR-0009 established cloud authority for realtime documents but retained separate
file-authoritative desktop modes and treated Markdown projections as read/export
surfaces. That split now produces duplicate navigation, ambiguous authority, and an
unsafe startup path: files edited while Hubble is quit can be overwritten when cloud
state materializes before local drift is inspected.

The product contract in `specs/desktop-cloud-workspace/PRODUCT.md` requires one cloud
folder/document model while preserving editing through ordinary local Markdown tools.

## Decision

Desktop documents are cloud-authoritative objects with stable cloud IDs. A managed
Markdown file is a writable local projection of that object, not a second authority.
Hubble must classify and protect local drift before any cloud-to-disk write, reconcile
safe edits automatically, and preserve both local bytes and cloud state whenever the
result is ambiguous or unauthorized.

The production desktop navigation will expose one selected cloud context and one
folder/document tree. Plain Folder, Loose File, and local-only Workspace authoring are
retired as production modes; unrelated local content enters through explicit import or
move flows. A managed document has at most one active local projection per device.

## Consequences

- Local editing remains a first-class interface, including offline and app-quit work,
  without making the filesystem a competing source of truth.
- Startup drift classification and guarded materialization are release blockers for
  the unified desktop experience.
- Unsafe moves, deletions, collisions, and authorization changes become durable review
  or recovery operations rather than implicit cloud mutations.
- Cloud IDs drive navigation and identity; paths remain mutable projection metadata.
- ADR-0009 is superseded where it retains parallel local-authority modes or restricts
  projections to read/export use. Its cloud-authority rationale remains valid.
- ADR-0008 remains useful for unmanaged-file discovery/import performance, but its
  local filesystem sidebar is not part of the target navigation model.
