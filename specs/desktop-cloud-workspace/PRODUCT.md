# Desktop cloud workspace

> **Direction update (2026-07-15):**
> `../folder-authority-mobility/PRODUCT.md` supersedes this spec's universal-cloud
> premise and its rejection of Git-authoritative folders. The projection safety,
> recovery, sharing, and local-availability behaviors here still govern a folder while
> it is in Hubble Cloud. A companion technical reconciliation is pending.

## Summary

Hubble Desktop presents one cloud context and one folder/document tree. A folder may
be made available on a computer as ordinary writable Markdown, but the cloud document
remains authoritative and Hubble never silently discards local work.

## Problem

The current desktop sidebar exposes organization, document authority, and local
location as simultaneous navigation sections. The same document can appear more than
once, while consequential filesystem operations can silently change cloud access or
delete shared content. The product needs one coherent content model without weakening
the trust required to edit that content from local tools.

## Goals

- Make the cloud folder/document hierarchy the one canonical navigation model.
- Preserve editing through VS Code, vim, Obsidian, Claude Code, Cowork, Finder, and
  other local tools.
- Preserve local changes made while Hubble is offline or completely quit.
- Make access-changing and suspicious destructive operations explicit and reversible.
- Keep healthy synchronization quiet while making local availability and problems
  discoverable.

## Non-goals

- A standalone local-authority Workspace, Plain Folder, or Loose File editing mode.
- Git as document authority or a second collaboration/history system.
- A general-purpose replacement for mature local Markdown editors.
- Public marketing or support copy; those are written after this behavior is shipped
  and verified.

## Behavior

### Context and navigation

1. **NAV-1 — One current context.** Desktop shows exactly one selected content context
   at a time: either a Workspace or a top-level root shared with the user.
2. **NAV-2 — One content tree.** A Workspace renders as one nested folder/document
   hierarchy. A logical document appears once regardless of sharing, collaboration,
   synchronization, or local availability.
3. **NAV-3 — No implementation-axis sections.** The sidebar has no separate
   **Folders**, **Live Documents**, or **On This Computer** content trees.
4. **NAV-4 — Document language.** “Live Document” is not user-facing terminology. A
   document is the same cloud-authoritative object whether edited in Hubble, on the
   web, or through local Markdown.
5. **NAV-5 — Shared roots.** **Shared with me** appears only when populated and lists
   top-most shared roots. A nested share already covered by a listed ancestor does not
   appear again.
6. **NAV-6 — Shared context.** Opening a shared root makes that subtree the current
   context. The header identifies its source Workspace and the user’s role, and the
   tree never exposes inaccessible ancestors or siblings.
7. **NAV-7 — Legacy direct shares.** A directly shared document may remain as a leaf
   shortcut, but opening it does not create another representation of the document.
8. **NAV-8 — Scoped search.** Search is scoped to the current context and opens the
   same document represented in the tree.
9. **NAV-9 — Boundary markers.** Direct external-sharing boundaries and directly
   available local roots may receive subtle markers. Descendants do not repeat
   inherited markers, but effective access and availability remain discoverable.
10. **NAV-10 — Local actions.** A directly available folder exposes its local path and
    actions to reveal it, copy its path, relocate it, or stop local availability.
11. **NAV-11 — Repository versus device.** Repository association is shown separately
    from availability on the current computer. A folder may be associated with a repo
    without being materialized on this device, and a guest may make a shared folder
    available without having that repo.
12. **NAV-12 — Quiet health.** Healthy synchronization has no persistent success badge
    or success toast. Syncing, offline, queued, or needs-attention states surface at the
    affected local root and through a global app/tray entry point.
13. **NAV-13 — No local-authority entry point.** Opening or dropping unrelated local
    Markdown offers import or move into Hubble rather than entering a second authoring
    regime.

### Creation, root access, and import

14. **CREATE-1 — Create in context.** Creating from a folder places the document in
    that folder and opens it for editing.
15. **CREATE-2 — Access inheritance.** A document created inside a folder inherits the
    folder’s effective access without an extra confirmation for routine creation.
16. **CREATE-3 — Guest creation.** A guest with editor access can create documents in
    the shared subtree. Viewer and commenter creation is rejected clearly without
    destroying local work.
17. **CREATE-4 — Global creation.** In a multi-member Workspace, a global create action
    asks for a destination. **Workspace root** remains available and is identified as
    accessible to Workspace members.
18. **CREATE-5 — Personal root.** A personal Workspace may default global creation to
    root. A root document receives no guest or public share by default while retaining
    ordinary Workspace-member access.
19. **CREATE-6 — Local file creation.** Saving a new Markdown file inside a known,
    writable local folder creates exactly one cloud document in the corresponding
    Hubble folder.
20. **CREATE-7 — Unavailable creation.** A creation made offline or while Hubble is
    quit remains intact and visibly pending until it can be published. Permission
    failures, unsupported locations, collisions, and size limits never erase or
    replace the local bytes.
21. **IMPORT-1 — Destination first.** Import begins by choosing a Hubble destination
    and previewing its effective audience.
22. **IMPORT-2 — Import a copy.** **Import a copy** creates the cloud document and
    leaves the source untouched.
23. **IMPORT-3 — Move into Hubble.** **Move into Hubble** removes the source only after
    cloud creation and the watched local copy are verified, with explicit approval.
24. **IMPORT-4 — Connected copy.** Completion identifies which file is connected to
    Hubble and states that any retained original is detached and will not synchronize.
25. **IMPORT-5 — No silent collision.** Import never silently overwrites an existing
    document or local file; both versions remain recoverable.

### Editing while running, offline, or quit

26. **SYNC-1 — Edit anywhere.** In-Hubble edits synchronize continuously. External-tool
    edits synchronize when the Markdown file is saved, without a manual Hubble sync
    action.
27. **SYNC-2 — Quiet success.** Successful external saves and safe cloud-to-disk
    updates do not interrupt or steal focus.
28. **SYNC-3 — Safe merge.** Concurrent local and cloud edits merge automatically when
    they can be reconciled safely.
29. **SYNC-4 — Preserve both sides.** When reconciliation is unsafe, Hubble preserves
    the exact local bytes and the current cloud document and opens a durable recovery
    path. Neither side is silently overwritten.
30. **SYNC-5 — Offline editing.** Projected files remain editable offline. Pending
    work is visible at the affected folder and reconciles automatically when safe after
    reconnection.
31. **SYNC-6 — App-quit guarantee.** On every launch, Hubble checks every managed local
    root for edits, creations, moves, and absences that occurred while it was quit
    before writing cloud content into local files.
32. **SYNC-7 — Offline launch.** If Hubble cannot verify current cloud state or access,
    it leaves local bytes untouched and shows that verification is pending.
33. **SYNC-8 — Durable pending state.** Queued edits, pending moves, deletion reviews,
    and recovery items survive crashes, restarts, and app updates.

### Renames and moves

34. **MOVE-1 — Stable identity.** Renaming or moving a document preserves its identity,
    history, comments, and shares.
35. **MOVE-2 — Safe automatic moves.** A rename or move that changes neither effective
    audience nor repo/agent exposure completes automatically from Hubble or the watched
    filesystem.
36. **MOVE-3 — Cloud moves propagate.** A cloud-initiated rename or move updates every
    affected local copy without creating a duplicate document.
37. **MOVE-4 — Consequential moves wait.** A document or folder move that changes
    effective access or which linked repos/agents receive the content does not change
    the cloud hierarchy until a user confirms the impact.
38. **MOVE-5 — Immediate Hubble confirmation.** When Hubble is running, a consequential
    local move immediately brings a Hubble-owned confirmation dialog to the foreground.
    If the OS prevents that, a notification opens the same review.
39. **MOVE-6 — Complete impact preview.** The review identifies the item, old and new
    locations, people or links gaining or losing access, role changes, and local repo
    paths gaining or losing the content.
40. **MOVE-7 — Pending local intent.** While review is pending, the local item may
    remain at the intended destination and continue receiving edits, but Hubble does
    not publish the cloud move.
41. **MOVE-8 — Approve or cancel.** Approval commits the cloud move. Cancel, dismissal,
    or Escape restores the prior location with all edits made during review intact.
42. **MOVE-9 — Current authorization.** Hubble revalidates access at confirmation time.
    Changed impact requires a new confirmation; stale or unavailable permission data
    can never authorize the move.
43. **MOVE-10 — Safe restoration.** If the prior path now contains another file or the
    user cannot perform the move, Hubble preserves both versions and routes the local
    work to recovery.
44. **MOVE-11 — Batch review.** Folder moves and scripted batches produce one review
    with totals and expandable details rather than a modal storm.

### Deletion and Trash

45. **DELETE-1 — Trash is durable.** Deleting from Hubble moves the document or folder
    to Hubble Trash. Trash remains available after any transient Undo notice expires.
46. **DELETE-2 — Watched single deletion.** One unambiguous document deletion observed
    while Hubble is actively watching moves the cloud document to Trash and provides
    Undo through the app and, where supported, the system notification.
47. **DELETE-3 — Offline deletion.** A single deletion observed while offline remains a
    visible pending Trash action until reconnection. Undo remains available.
48. **DELETE-4 — Quit-time deletion.** A deletion discovered after Hubble was quit
    always requires review, even when only one file is missing.
49. **DELETE-5 — Suspicious deletion.** A folder deletion, rapid/bulk deletion, or
    disappearance of many files does not immediately delete cloud content. Hubble
    presents one review with item counts and collaborator impact, offering cloud Trash
    or local restoration.
50. **DELETE-6 — Projection-root deletion.** Deleting a managed root is interpreted as
    a local-availability problem, not deletion of its cloud folder. Hubble offers to
    restore the local root or stop making it available on this computer.
51. **DELETE-7 — Missing storage.** An unavailable drive, missing repo, disconnected
    volume, or inaccessible parent directory is never interpreted as cloud deletion.
52. **DELETE-8 — Read-only protection.** Deleting a read-only local copy does not delete
    the cloud document. Hubble restores the copy and explains the access restriction.
53. **DELETE-9 — Copy versus move out.** Copying a projected file elsewhere has no
    cloud effect. Moving it outside the managed root follows the single-delete behavior
    and leaves the external file as a detached copy.
54. **DELETE-10 — Remote Trash.** Trashing from another Hubble surface removes clean
    managed copies; restoring from Trash rematerializes the current cloud document.

### Revocation, recovery, and stopping local availability

55. **RECOVERY-1 — Revocation preserves work.** When access is revoked, clean managed
    files are removed, but unsynchronized work is preserved as an explicitly detached
    recovery copy before removal.
56. **RECOVERY-2 — Role downgrade.** An editor-to-viewer downgrade makes the managed
    copy read-only. Work that can no longer be published is preserved with an
    explanation.
57. **RECOVERY-3 — No publication after revocation.** Work done offline is preserved but
    is not published after Hubble learns that access was revoked.
58. **RECOVERY-4 — Honest revocation.** Hubble states that revocation stops future
    synchronized access but cannot recall detached copies, caches, or agent transcripts
    already produced.
59. **RECOVERY-5 — Restored access.** Restored access materializes current cloud content
    afresh and never silently reattaches or overwrites an older recovery copy.
60. **LOCAL-1 — Device-only stop.** **Stop making available on this computer** affects
    only the current device; it never deletes, moves, or unshares cloud content.
61. **LOCAL-2 — Clean stop.** For a clean local root, Hubble offers removal of the
    managed files or retention of a clearly detached copy.
62. **LOCAL-3 — Dirty stop.** Pending or unsynchronized work must be reconciled,
    recovered, or explicitly exported before local availability can stop.
63. **LOCAL-4 — Relocation.** Relocating local availability preserves identity and
    pending work and never leaves two active managed copies.
64. **RECOVERY-6 — Durable recovery.** Every recovery item preserves exact bytes and
    identifies the document, reason, time, and former local path. It can be inspected,
    deferred, retried, or kept as a detached copy until explicitly resolved.
65. **RECOVERY-7 — Collision safety.** Restore, cancellation, rematerialization, and
    recovery never overwrite a colliding file; both versions are preserved.

### Multiple local roots

66. **MOUNT-1 — Disjoint folders.** Multiple disjoint repo-linked folders in one
    Workspace are supported.
67. **MOUNT-2 — Independent state.** Each directly available folder has its own path,
    health, and actions. A failure in one local root does not disable healthy roots.
68. **MOUNT-3 — No overlapping authority.** Parent/child linked-folder overlap,
    overlapping local paths, and any other arrangement that would manage one document
    twice on one device are rejected with an explanation.
69. **MOUNT-4 — Per-device relation.** V1 permits at most one active managed copy per
    document per device. The same cloud folder may use a different path on another
    user’s device.
70. **MOUNT-5 — Shared local roots.** An accessible shared root can be made available
    locally without a repo. Its files are writable or read-only according to the
    user’s effective role.

### Accessibility and focus

71. **A11Y-1 — Tree interaction.** The unified tree supports standard keyboard
    navigation, expansion, opening, visible focus, and stable selection after refresh
    or move.
72. **A11Y-2 — Named states.** Sharing, local availability, syncing, offline, pending,
    and error states are never communicated by color or icon alone.
73. **A11Y-3 — Safe dialog focus.** Confirmation and recovery dialogs announce their
    title and impact, trap focus, initially focus the safest non-destructive action,
    and treat Escape as cancellation.
74. **A11Y-4 — No routine interruption.** Healthy synchronization, safe merges, and
    remote materialization never steal focus. System-initiated review appears only when
    human authorization or recovery is required.
75. **A11Y-5 — Durable alternatives.** Undo and error notices are announced to
    assistive technology and always have a durable in-app equivalent.
76. **A11Y-6 — Reduced motion.** Tree, status, and dialog transitions respect reduced
    motion preferences.

## UX validation

Validate on the packaged desktop app with a member Workspace and an editor-shared
folder:

1. Confirm the sidebar shows one tree, root folders and documents together, no legacy
   headings, and no duplicate local tree.
2. Select a shared root and confirm the header, search scope, role, and visible subtree
   all change together.
3. Make two disjoint folders locally available and confirm each exposes only one local
   marker, path, and independent health state.
4. Edit a projected document in a local editor, then repeat while offline and while
   Hubble is completely quit. Confirm every byte survives and reconciles safely.
5. Move a document into a folder with different guests. Confirm Hubble immediately
   presents the exact impact; approval publishes the move and cancellation restores it.
6. Delete one file, undo it, then simulate a directory/bulk deletion. Confirm the first
   uses Trash and Undo while the second changes no cloud content before review.
7. Import a copy and move a file into Hubble. Confirm the original-retention behavior
   and the identity of the connected copy are unambiguous.
8. Revoke editor access with unsynchronized local work. Confirm the cloud rejects the
   edit while Hubble preserves a clearly detached recovery copy.
9. Exercise the tree and every confirmation/recovery path using only the keyboard and a
   screen reader.

## Open questions

- **Local folder lifecycle:** Should creating an empty directory locally create a
  Hubble folder, and should local folder rename/move follow the same automatic versus
  consequential-review rules? Recommendation: yes, once the document safety path is
  proven; otherwise the local tree will feel selectively writable.
- **Recovery controls:** V1 must support inspecting local and cloud content, keeping a
  detached copy, retrying, and deferring. A full side-by-side merge editor can remain a
  later capability.
- **Import breadth:** This contract covers Markdown documents. Folder hierarchy,
  non-Markdown files, and binary assets should remain out of scope unless required by
  the init flow.
