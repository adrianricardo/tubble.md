# Desktop navigation IA session

Source: Adrian's 2026-07-11 review of the running desktop sidebar, followed by an
IA pass using the `organize` playbook.

## Trigger

The desktop sidebar simultaneously showed three sections:

- **Folders** — an organizational structure.
- **Live Documents** — a document capability/authority state.
- **On this computer** — a storage/availability location.

The same logical document could appear to belong to all three. In the dogfood
screenshot, `BRAIN` appeared in the cloud folder tree while the mounted/local files
appeared again below, forcing users to understand Hubble's implementation before
they could predict where a document belonged.

## Direction

Desktop navigation should present exactly one current context and one content tree.

- In a cloud workspace, nested folders and documents form one tree. Remove the
**Folders** and **Live Documents** headings. Root documents sit beside root folders.
- A repo-linked local projection is not another navigable tree. It is an availability
property of the linked cloud folder, exposed through contextual status/actions such
as “Available on this computer,” reveal, relocate, and stop syncing.
- Hubble does not offer a standalone local-authority editing mode. Local editing
remains essential through the watched projection of a cloud folder: users and
agents can edit those Markdown files in any local tool while the cloud document
remains authoritative.
- Healthy synchronization recedes. Only transitional or exceptional state becomes
ambient UI: syncing, offline, or needs attention.
- **Shared with me** may remain conditionally because it communicates a genuine access
boundary, not an implementation axis.
- User-facing nouns are **space**, **folder**, and **document**. “Live Document” remains
an internal technical term. Authority, collaboration, sharing, and local availability
are properties of a document/folder, not navigation destinations.

## Target shape

```text
Hubble Product Brain                         +

Search…

⌄ Hubble Brain
    ▸ admin
    ▸ sources
    ▸ synthesized
      BRAIN.md

Shared with me          (only when populated)
    ▸ Acme Brain
```

Local files enter Hubble through import or agent-init triage into a chosen cloud
folder. Hubble leaves the originals untouched; after import, edits intended to
participate in Hubble happen against the folder's watched projection.

## Local editing resolution

Standalone local-authority editing is deliberately excluded. Supporting it would
create a second document type with different collaboration, history, permissions,
cross-device behavior, and failure modes, while competing with mature local editors.
Hubble instead provides local-first ergonomics for cloud documents through the one
universal watcher bridge.

Creation follows location:

- A document created inside a folder inherits that folder's effective access.
- A document created at workspace root receives no direct or guest share by default;
normal workspace-member access still applies. In a personal workspace this is
effectively private to the creator.
- Stronger per-member privacy inside a shared workspace would require an explicit
personal area and is not implied by the word “private.” Do not silently make root
documents invisible to fellow workspace members.

## Governing principle

**Authority and availability are metadata, not navigation.** The user encounters one
document in one predictable tree even when it is cloud-authoritative, realtime,
shared, locally materialized, and offline-capable.

## Follow-up: projection safety and confirmation

An adversarial review exposed the hard part hidden by “healthy sync is invisible”:
filesystem tools can express consequential cloud operations without owning Hubble’s
access and collaboration context. Adrian resolved the intended UX as follows:

- Edits made while Hubble is offline or completely quit are supported. On restart,
Hubble inspects local drift before materializing cloud state and never silently
overwrites unprocessed local work.
- Ordinary content edits, creates, renames, and moves that preserve the effective
access boundary proceed automatically.
- A local move that would change the document’s audience or expose it through a
repo-linked projection becomes pending. Hubble comes to the foreground and shows a
native modal with the proposed destination, exact access impact, and repo exposure.
The user approves or cancels there. The modal contains the information; it does not
merely redirect to another review surface.
- Hubble can show that impact in the modal because the desktop app can request the
authoritative access graph and operation preview from the cloud. The modal is a
presentation surface; authorization and impact revalidation still happen in the
cloud transaction when the user confirms.
- Deleting one watched document moves the cloud document to Trash and offers Undo.
Deleting a folder, deleting many documents, or discovering deletions after Hubble
was quit requires review before the cloud change is applied. Removing the projection
root itself means “stop making available here,” not “delete the cloud folder.”
- Multiple disjoint local projections may coexist in one Workspace. Overlapping local
roots or overlapping cloud subtrees are rejected, and one document has at most one
managed copy per device in the first release.
- Local availability is quiet when healthy but never unknowable: the linked folder
exposes its path and reveal, relocate, and stop-availability actions; queued,
offline, and needs-attention states surface at that root and globally.
- Standalone local-authority editing remains absent from the production UI. Existing
code may survive temporarily behind a time-boxed development-only flag while the
migration is proven, but it is not a supported product mode.

The durable observable contract is
`/specs/desktop-cloud-workspace/PRODUCT.md`. The commit-pinned implementation plan is
`/specs/desktop-cloud-workspace/TECH.md` and must be refreshed against current code
before implementation.
