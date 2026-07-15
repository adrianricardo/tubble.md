# Hubble — Current Vision

> ⚠ **PENDING EXTRACTION** — this is the best *written* approximation of the vision.
> Adrian stated (2026-07-09) there is significantly more in his head, not yet extracted.
> Treat gaps as unknowns, not decisions. See `../admin/pending-extraction.md`.

## One line

A developer and their agents work directly with durable Markdown in Git. When one
folder needs realtime collaboration or access boundaries that should not follow the
repository, they move only that folder to Hubble Cloud; they can move it back to Git
when those needs end.

## The model (revised 2026-07-15)

Every folder has one current authority: **Git** or **Hubble Cloud**. Repository content
stays in Git by default. Moving a folder to cloud authority enables realtime editing,
web access, sharing, and Hubble-managed access; moving it to Git authority returns it
to repository history and repository access. A move never creates two canonical
copies.

Within cloud authority, the existing `Workspace ⊃ nested Folders ⊃ cloud Docs` and
Drive-style sharing model still applies. Within Git authority, ordinary files, paths,
branches, commits, and repository permissions apply. Normative movement behavior:
`/specs/folder-authority-mobility/PRODUCT.md`.

## The entry point (revised 2026-07-15)

The repository is already a valid starting point. Opening it in Hubble does not require
an init run or a move to the cloud. Git folders remain ordinary local Markdown and
agents can use them at their existing paths.

When the user chooses **Move to Hubble Cloud** on a folder, Hubble previews the exact
content, cloud destination, audience, repository changes, and local projection before
changing authority. **Move to Git** provides the reverse journey with equally explicit
collaboration, web-visibility, access, path, and working-tree consequences.

Sharing a Git folder is an intent-based shortcut into the same move-to-cloud journey;
Hubble never uploads repository content merely because it looks collaborative.

## What stands from the earlier vision docs

- Wedge persona: the non-technical, agent-native teammate (Claude Cowork daily driver).
- Dev's payoff: durable agent context stays in the tool already suited to its current
  need, without an unnecessary migration.
- Cloud folders retain realtime collaboration, revocability, folder-level sharing,
  web editing, and watched local projections.
- Git folders retain native repository history, branching, review, cloning, and local
  agent access without a sync bridge.

## Local projection contract (resolved 2026-07-11)

The watched Markdown projection is not a backup export or read-only cache. It is the
normal local editing interface for people and agents, and it remains trustworthy while
Hubble is offline or completely quit. On restart Hubble protects local drift before
materializing cloud state. Safe edits synchronize automatically; an operation that
would change audience or repo exposure is held pending and confirmed in a Hubble modal
with an exact impact preview. Ordinary deletion uses cloud Trash and Undo, while bulk,
folder, and quit-time deletion require review. Healthy sync is quiet, but local path,
availability controls, and exceptional state remain discoverable.

This contract applies only while a folder is cloud-authoritative. Git-authoritative
folders use their files directly. The 2026-07-11 projection safety work remains
valuable, but its universal-cloud premise is superseded.

## Timeline

- 2026-07-15 — Git restored as the default authority for repository content. Cloud
authority becomes a selective folder-level choice for realtime collaboration or
repository-independent access/privacy, with an explicit reversible movement journey.
The Hubble brain returned byte-for-byte to tracked paths. Source:
`../sources/2026-07-15-git-default-folder-authority.md`.
- 2026-07-11 — Desktop IA unified around one cloud-authoritative folder/document
tree. Local projections became folder availability rather than a parallel navigation
section; standalone local-authority editing was removed from the product direction
while watched local editing remains load-bearing. Source:
`../sources/2026-07-11-desktop-navigation-ia.md`.
- 2026-07-09 — Agent-init entry point adopted (supersedes REPO-BRAIN-VISION Decided #13
"no agent-drafted seed flow in v1"); brain system established; extraction pending.
- 2026-07-03 — Repo-brain pivot: repo-first wedge, all-cloud, folder model locked
(REPO-BRAIN-VISION/RATIONALE, Decided #1–15).
- 2026-06-25..28 — Realtime-collab fork: Live Documents, CRDT authority, synced-folder
bridge (see `/specs/realtime-collab/archive/`).
