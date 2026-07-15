# Selective folder authority

## Summary

Hubble keeps repository content in Git by default and lets a user move a selected
folder to Hubble Cloud when it needs realtime collaboration or access boundaries that
should not follow the repository. A cloud folder can move back to Git later. Every
folder has one home at a time, and both directions are explicit, lossless, and
recoverable.

## Problem

The current product direction assumes every production document is cloud-authoritative
and treats local Markdown as a projection. That adds migration, sync, availability,
and recovery concepts even when ordinary Git history and local agent access already
meet the user's needs. The product should introduce cloud authority only at the moment
its distinct value is required, without creating two canonical copies or making the
reverse move feel like an export escape hatch.

## Goals

- Make Git the unsurprising default for content already in a repository.
- Let people choose cloud authority for one folder without moving unrelated content.
- Explain collaboration, access, web visibility, history, and working-tree impact
  before either move.
- Make moving back to Git a first-class, safe journey.
- Preserve one understandable tree even when it contains Git and cloud boundaries.

## Non-goals

- Keeping Git and Hubble Cloud as simultaneous co-authorities for the same folder.
- Automatically moving content because Hubble detects prose or collaboration-like
  material.
- Scrubbing sensitive bytes from prior Git commits, remotes, forks, or clones.
- Asking Hubble to commit, push, rewrite history, or manage repository permissions.
- Moving individual documents independently in the first version; folder selection is
  the authority boundary.

## Behavior

### Mental model and default state

1. **HOME-1 — One home.** Every managed folder is either **Stored in Git** or **In
   Hubble Cloud**. Hubble never describes a local cloud projection as a second home or
   lets two copies appear equally authoritative.
2. **HOME-2 — Git by default.** Opening a repository leaves its folders and files in
   Git. No onboarding, scan result, content type, or agent action uploads them without
   an explicit user move.
3. **HOME-3 — Intent, not architecture.** User-facing explanations lead with the
   outcomes: Git provides repository history and access; Hubble Cloud provides realtime
   collaboration, web access, sharing, and Hubble-managed permissions. “Authority,”
   “projection,” and “CRDT” are not required vocabulary.
4. **HOME-4 — Cloud is not automatically private.** Hubble never equates cloud storage
   with privacy. The move flow names who will have access and explains that privacy
   comes from the selected Hubble audience, not from the storage label alone.
5. **HOME-5 — Prior Git history remains.** When a Git folder has ever been committed,
   moving it to cloud does not claim to remove those bytes from repository history,
   remotes, forks, or clones. If the user's goal is privacy, this limitation appears
   before confirmation.

### One tree with selective boundaries

6. **TREE-1 — One content tree.** Desktop presents Git and cloud folders in one
   navigable hierarchy rather than separate storage sections or duplicate trees.
7. **TREE-2 — Boundary marker.** A subtle **Git** or cloud marker appears only on a
   folder where storage changes from its parent or at a direct authority root.
   Descendants do not repeat inherited markers.
8. **TREE-3 — Details on demand.** Folder details expose its current home, repository
   and path or cloud Space and audience, local availability when relevant, and the
   applicable move action.
9. **TREE-4 — Stable navigation.** A successful move keeps the folder selected and in
   the same understandable place in Desktop whenever that hierarchy still exists.
   Hubble explains any necessary path or context change before moving.
10. **TREE-5 — Nested authority roots.** Moving a folder includes descendants that
    inherit its current home. Any directly managed descendant with a different home is
    excluded by default, named in the preview, and moved only through its own explicit
    journey.
11. **TREE-6 — Surface honesty.** Web shows cloud-authoritative content only. Before a
    cloud folder moves to Git, Hubble states that it will disappear from web and from
    devices that only receive it through Hubble.

### Entry points

12. **ENTRY-1 — Contextual actions.** A Git folder offers **Move to Hubble Cloud…**;
    a cloud folder offers **Move to Git…** when the user has permission to complete
    that move. The actions are available from the folder menu and details surface.
13. **ENTRY-2 — Share as intent.** Choosing **Share** on a Git folder explains that
    realtime sharing requires moving that folder to Hubble Cloud, then enters the same
    move flow with sharing intent preserved. Hubble does not create a hidden copy.
14. **ENTRY-3 — Permission fidelity.** A person who may view or edit a cloud folder but
    cannot remove it from its current audience cannot move it to Git. They may be
    offered a clearly labeled export-copy action, which never masquerades as a move.
15. **ENTRY-4 — No nagging.** Hubble may teach the cloud option when the user asks for
    collaboration, sharing, or web access. It does not repeatedly promote cloud moves
    while the user is successfully working in Git.

### Move from Git to Hubble Cloud

16. **TO-CLOUD-1 — Exact selection.** The flow begins with the selected folder already
    named and shows the number and kinds of items that will move. Unsupported, ignored,
    symlinked, generated, or oversized items are listed as exclusions; Hubble never
    silently leaves behind content required to understand the folder.
17. **TO-CLOUD-2 — Choose destination and audience.** The user chooses a Hubble Space
    and optional parent folder, then reviews the exact people, roles, and link access
    the moved folder will inherit or create.
18. **TO-CLOUD-3 — Purpose-aligned defaults.** A move initiated from **Share** keeps the
    intended recipients in the flow. A move initiated for private separation defaults
    to the narrowest available audience and still requires the user to review it.
19. **TO-CLOUD-4 — Consequence preview.** Before confirmation, Hubble shows the source
    Git path, cloud destination, audience, local path after the move, Git working-tree
    changes, web availability, realtime collaboration, and any excluded items.
20. **TO-CLOUD-5 — Git truthfulness.** The preview says that Hubble will change local
    files and exclusions but will not commit, push, alter remotes, or erase prior Git
    history. It gives the user a concrete next step to review and commit the resulting
    Git changes.
21. **TO-CLOUD-6 — Verified cutover.** Git remains authoritative until every supported
    item is present and verified in Hubble Cloud. Only then may Hubble remove the Git
    working files from repository authority and establish an optional ignored local
    projection for continued local-agent use.
22. **TO-CLOUD-7 — Local continuity.** If the user keeps the folder available locally,
    completion names its exact path and makes clear that those files now represent the
    cloud folder and are no longer Git-authoritative.
23. **TO-CLOUD-8 — Completion.** Success keeps the folder selected, states **Now in
    Hubble Cloud**, shows its audience and local availability, and offers **Share**,
    **Reveal in Finder** when local, and **Move back to Git**.

### Move from Hubble Cloud to Git

24. **TO-GIT-1 — Choose repository and path.** The user selects a Git repository and
    destination path. Hubble resolves and displays the repository root, rejects paths
    outside a repository or unsafe collisions, and never assumes a remote's audience.
25. **TO-GIT-2 — Collaboration impact.** The preview names collaborators and links
    that will lose Hubble access, states that realtime and web editing will end, and
    explains that repository access and distribution apply after the move.
26. **TO-GIT-3 — History impact.** The preview explains that the current Markdown and
    assets move to Git while Hubble's realtime version history does not become Git
    commits. It states the available cloud recovery period or archive behavior without
    implying permanent retention.
27. **TO-GIT-4 — Working-tree preview.** Before confirmation, Hubble shows every path
    it will create or change, existing uncommitted changes that affect safety, and the
    fact that the user must review, commit, and push with their normal Git tools.
28. **TO-GIT-5 — Verified cutover.** Cloud remains authoritative until all supported
    content is written and byte-verified at the chosen Git path. Only then may Hubble
    end collaboration and move the cloud folder to its recoverable post-move state.
29. **TO-GIT-6 — Completion.** Success states **Now stored in Git**, shows the exact
    path and working-tree status, offers **Reveal in Finder**, **Copy path**, and
    **Move to Hubble Cloud**, and gives a concise instruction to review and commit.

### Safety, concurrency, and recovery

30. **SAFE-1 — Source survives failure.** Validation, network, storage, permission,
    collision, timeout, and verification failures leave the original authority and
    every source byte intact. The user can retry, change destination, or cancel in
    place.
31. **SAFE-2 — Concurrent edits are revalidated.** If content, audience, repository
    state, or permissions change after preview, Hubble refreshes the impact and asks
    for confirmation again. It never finalizes against a stale preview.
32. **SAFE-3 — No ambiguous overwrite.** Existing destination content is compared and
    explained. The user may choose another path or resolve a review state; Hubble does
    not offer a generic overwrite for a non-identical folder.
33. **SAFE-4 — Cancel is inert.** Cancel before cutover leaves storage, access, local
    files, and Git state unchanged and returns focus to the invoking folder.
34. **SAFE-5 — Offline honesty.** A move that requires cloud access cannot start or
    appear complete while offline. Hubble preserves the user's choices and offers
    retry when connectivity returns.
35. **SAFE-6 — Reversible result.** Completion always exposes the reverse move. A
    one-step **Undo** is offered only while neither side has changed since cutover;
    otherwise Hubble opens the reverse preview so new work cannot be discarded.
36. **SAFE-7 — Interrupted moves resume visibly.** Relaunch returns the folder to an
    explicit validating, moving, needs-attention, or completed state. It never shows
    both sides as finished or silently restarts from the beginning.
37. **SAFE-8 — Destructive aftermath is recoverable.** The relinquished side remains
    recoverable long enough to handle mistaken destinations or immediate regret. Any
    expiration is stated before confirmation and in the completion state.

### Accessibility and interaction

38. **A11Y-1 — Keyboard and focus.** Folder actions, destination selection, audience
    review, impact disclosure, confirmation, cancellation, errors, and completion are
    fully keyboard operable. Focus returns to the folder after cancel and remains on
    the moved folder after success.
39. **A11Y-2 — Text, not color.** Current home, audience, included and excluded items,
    warnings, progress, errors, and completion are available as text and announced to
    assistive technology; icons and color are supplemental.
40. **A11Y-3 — Progressive disclosure.** The first screen answers what is moving and
    why. Detailed file lists, Git consequences, access details, and recovery policy are
    available before confirmation without forcing every user through dense technical
    language.
41. **A11Y-4 — Reduced motion.** Tree continuity and progress do not depend on animated
    movement. Reduced-motion users receive the same state and focus cues without
    spatial animation.

## UX validation

1. Open a repository with nested Markdown folders. Confirm nothing asks to upload and
   Git is understandable as the default without persistent badges on every row.
2. Move one nested folder to a private cloud destination. Confirm the preview names
   prior-Git-history limits, exact audience, working-tree effects, local-agent path,
   and excluded items; verify the rest of the repository stays in Git.
3. Start from **Share** on a Git folder. Confirm the move requirement is explained and
   intended recipients carry into the cloud audience review.
4. Move the cloud folder back to a scratch repository. Confirm the loss of realtime,
   web, links, and Hubble permissions is explicit; completion shows uncommitted Git
   changes and never claims to have committed or pushed.
5. Exercise a nested opposite-authority root, occupied destination, dirty working
   tree, concurrent cloud edit, permission change, offline state, interruption, cancel,
   and reverse-after-new-edit. Confirm the source always survives and stale impact is
   never silently accepted.
6. Repeat both directions by keyboard and screen reader. Confirm the folder remains
   findable, authority is announced in text, progress is legible, and focus returns to
   a predictable control.
