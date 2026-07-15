# Product Decision Log

Newest first. Product and strategy decisions live here; engineering and build
decisions live in `decision-log.md`.

## 2026-07-15 — Git is the default; cloud authority is selected per folder

**Decision:** Repository content remains Git-authoritative by default. A user moves a
specific folder to Hubble Cloud only when it needs realtime collaboration or access
boundaries that should not follow the repository. A cloud folder can move back to Git
when those needs end. Every folder has one authority at a time; local projections do
not become competing canonical copies.

**Rationale:** The Hubble brain dogfood proved the cloud and projection mechanics but
also showed that moving content without a collaboration or repository-independent
privacy need adds authority, availability, and failure-state complexity without user
value. Git already provides the right history and agent-access model for ordinary
repository context. Cloud remains differentiated where realtime and Hubble-managed
access matter.

**Consequences:** The universal-cloud premise in the 2026-07-11 decisions and ADR-0010
is superseded. Their projection safety and unified-navigation lessons remain applicable
inside cloud-authoritative folders. The product must expose explicit, lossless,
reversible folder moves with clear access and collaboration impact.

**Source:** `../sources/2026-07-15-git-default-folder-authority.md`; UX contract:
`/specs/folder-authority-mobility/PRODUCT.md`; architecture decision: ADR-0011.

## 2026-07-11 — Local projections preserve quit-time work and mediate consequential operations

**Decision:** A watched projection is a fully writable local interface to a
cloud-authoritative folder, including while Hubble is offline or completely quit.
Before cloud materialization on restart, Hubble must classify and protect local drift.
Routine content edits, creates, renames, and same-access-boundary moves synchronize
automatically. A filesystem move that would change audience or repo exposure becomes a
durable pending operation and immediately opens a Hubble confirmation modal showing
the exact impact; approval is revalidated atomically in the cloud, while cancel restores
the canonical path without discarding the local edit. One-document deletion maps to
cloud Trash with Undo. Folder, bulk, or quit-time deletion requires review, and deleting
a projection root only stops local availability. Healthy sync remains quiet, but local
path, status, recovery, and stop-availability controls stay discoverable.

**Rationale:** Watched editing only preserves meaningful local-first value if local
tools remain trustworthy when the bridge is not running. Automatic safe operations
keep the filesystem natural; targeted confirmation protects collaboration and access
boundaries that ordinary filesystem commands cannot express. The modal may receive the
authoritative impact data from Hubble’s backend—the backend is the source of truth, not
the only place the information can be presented.

**Source:** `../sources/2026-07-11-desktop-navigation-ia.md`, “Follow-up: projection
safety and confirmation.” Normative contract:
`/specs/desktop-cloud-workspace/PRODUCT.md`.

## 2026-07-11 — Desktop navigation is one context and one content tree

**Decision:** The desktop sidebar presents exactly one current context. In a cloud
workspace, folders and documents render as one hierarchy with no separate **Folders**
or **Live Documents** sections. A repo-linked local projection is an availability
property of its cloud folder, not a second tree. Opening a truly standalone local
folder is not a Hubble editing mode. Local editing is supported only through watched
projections of cloud-authoritative folders. “Live Document” is no longer a user-facing
content category; healthy sync is invisible, with only syncing/offline/error state
surfaced contextually. **Shared with me** may remain when populated because it
represents an access boundary. New documents inherit the effective access of their
folder; root documents receive no direct/guest share by default while retaining normal
workspace-member access.

**Rationale:** The old sidebar made organization, document authority, and storage
location into sibling destinations even though one document could satisfy all three.
The unified model matches the locked `Workspace ⊃ nested Folders ⊃ cloud Docs` domain
model and preserves local-agent file access without exposing the watcher/projection
architecture during ordinary navigation. A standalone local-authority mode would
reintroduce two document regimes with different collaboration, history, permission,
and cross-device semantics while duplicating mature local editors.

**Source:** `../sources/2026-07-11-desktop-navigation-ia.md`.

## 2026-07-09 — Name: "hubble" today, rename intended eventually

**Decision:** "huddle" in session messages was a typo; the product remains hubble.md
for now, but Adrian intends to rename eventually (name TBD, part of pending
extraction). Keep the name out of hard-to-change surfaces where cheap (deep links,
protocol handlers, published package names) until decided.
**Source:** same source, addendum.

## 2026-07-09 — Absorb brain-keeper logic into the Hubble *product* (as design input)

**Decision:** the hubble-init skill's triage heuristic adopts the RESOLVER decision-tree
shape, and BRAINKEEPER non-negotiables map to product mechanics (BRAIN.md seeded once,
never regenerated; CRDT version history = the Timeline; source-grounding = attribution).
A post-init "brain-keeper maintenance" skill is a fast-follow candidate, not v1.
**Source:** `/specs/hubble-init/DESIGN.md` §Brain-keeper absorption.

## 2026-07-09 — Agent-init entry point (supersedes REPO-BRAIN-VISION Decided #13)

**Decision:** the v1 front door is `/hubble-init` run inside Claude Code/Codex —
agent-assisted triage of what moves to cloud vs. stays in git, then ensure-desktop +
deep-link handoff. Storyboard revised to v1.1 (scenes 1–3).
**Rationale:** meets the dev where they already work; the desktop UI link flow becomes
the machinery, not the entry.
**Source:** `sources/2026-07-09-brain-system-and-dogfood-session.md`; storyboard footer note.
