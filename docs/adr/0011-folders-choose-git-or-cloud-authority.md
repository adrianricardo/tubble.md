# Folders choose Git or cloud authority

## Status

Accepted as the target product architecture on 2026-07-15. A technical migration plan
is still required before changing the current universal-cloud implementation.

## Context

ADR-0010 made every production desktop document cloud-authoritative and treated local
Markdown as a watched projection. The model is appropriate when content needs realtime
collaboration, web access, revocable sharing, or Hubble-managed permissions. The
Hubble-brain dogfood showed that applying it to ordinary repository context adds a
mandatory migration, a sync bridge, availability state, and recovery modes without
providing value when Git already supplies the desired history, access, and local-agent
path.

The product needs both storage models, but it must not let them become competing
authorities for the same folder.

## Decision

Repository content is Git-authoritative by default. A user may explicitly move a
folder to Hubble Cloud when it needs realtime collaboration or access boundaries that
should not follow the repository, and may explicitly move it back to Git later.

Authority is selected at folder boundaries. A folder has one authority at a time and
its descendants inherit that authority unless a descendant is already a direct,
separately managed boundary. Git files are edited directly. Cloud-authoritative files
may retain writable watched local projections, but those projections are not Git
authority.

Crossing the boundary is a verified, recoverable move—not a background sync or an
unlabeled copy. The user must see the collaboration, access, web-visibility, history,
path, and Git working-tree consequences before cutover. Hubble does not commit, push,
rewrite Git history, or claim that moving previously committed content removes it from
remotes or clones.

Observable behavior is governed by
`specs/folder-authority-mobility/PRODUCT.md`.

## Consequences

- ADR-0010 is superseded where it requires universal cloud authority and retires
  Git-authoritative authoring.
- ADR-0010's drift protection, guarded materialization, and recovery rules remain
  required within cloud-authoritative folders.
- ADR-0009 remains valid for Live Documents while they are cloud-authoritative; it no
  longer implies that every repository Markdown file must become a Live Document.
- Desktop needs one navigation model capable of showing authority boundaries without
  duplicate storage trees.
- Web continues to show cloud-authoritative content only.
- The existing mandatory-cloud onboarding and repo-link work must be reconciled with
  this decision before further product polish or removal of Git-authoritative paths.
