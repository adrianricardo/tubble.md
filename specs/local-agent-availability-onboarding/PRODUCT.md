# Local agent availability onboarding

> **Direction update (2026-07-15):** This journey remains relevant for a folder that
> is already in Hubble Cloud, but cloud availability is no longer a prerequisite for
> repository content or local agents. Git folders use their existing paths. New
> authority and movement behavior lives in
> `../folder-authority-mobility/PRODUCT.md`.

## Summary

Hubble Desktop guides a signed-in user from cloud-only content to a local Markdown
projection that agents on the current Mac can use. The first choice distinguishes a
standalone local folder from a folder linked inside a code repository, and successful
setup ends with a concrete local path rather than an abstract sync status.

This contract supplements the local-availability and projection-safety behavior in
`../desktop-cloud-workspace/PRODUCT.md`; it does not weaken those guarantees.

## Problem

A newly installed desktop app can show a populated cloud Space and immediately promote
Hubble skills, even though no cloud content is available to local agents yet. The
working setup controls are buried in Settings, and the existing broad cloud mirror and
folder-scoped Repo Link represent different scopes without explaining that distinction.

## Goals

- Make the prerequisite for local-agent use understandable from the current Space.
- Offer one short path for general local-agent access and one explicit path for a code
  repository.
- State exactly which cloud content and local path will be connected before writing.
- End with actions that let the user hand the path to an agent immediately.

## Non-goals

- Starting, controlling, or granting permissions to a third-party agent.
- Automatically exposing every accessible Space or shared item.
- Replacing the projection safety, recovery, or permission rules in the parent product
  contract.
- Teaching HTML App creation before local availability exists.

## Behavior

### Entry and guidance

1. **GUIDE-1 — Contextual first-run guidance.** When the selected cloud context has no
   directly available local root on this Mac, Desktop explains that the visible cloud
   content is not yet available as files to local agents.
2. **GUIDE-2 — Two user intents.** The guidance presents **Make available on this
   Mac** as the primary action and **Link to a code repository** as the secondary
   action. It explains the difference without requiring the user to understand mounts,
   projections, or sync engines.
3. **GUIDE-3 — Honest scope.** Every setup screen names the exact Space or shared
   folder that will become available. No action labeled for the current context may
   silently expose other Spaces or shares.
4. **GUIDE-4 — Progressive teaching.** Hubble skills and HTML Apps are introduced only
   after the selected context has a usable local path. Local availability is the
   prerequisite, not an advanced Settings task.
5. **GUIDE-5 — Dismissal without disappearance.** The user may dismiss promotional
   guidance, but local availability remains discoverable from the current context and
   Settings. Dismissal is scoped to the cloud context rather than an unrelated local
   file path.

### Primary journey — make available on this Mac

6. **LOCAL-ONBOARD-1 — Current-context projection.** For a member Space, the primary
   journey makes that Space root available, including root documents and nested
   folders. For a shared-folder context, it makes only that shared subtree available.
7. **LOCAL-ONBOARD-2 — Suggested destination.** Hubble proposes a recognizable local
   destination such as `~/Hubble/<Space name>` and lets the user choose another empty
   folder before continuing.
8. **LOCAL-ONBOARD-3 — Safety preview.** Before writing, Hubble shows the cloud scope,
   local destination, effective read/write capability, and the promise that stopping
   local availability will not delete or unshare cloud content.
9. **LOCAL-ONBOARD-4 — Guarded creation.** Hubble rejects occupied, inaccessible, or
   overlapping destinations without modifying their contents. An existing matching
   Hubble projection is offered as a reconnect rather than overwritten.
10. **LOCAL-ONBOARD-5 — Visible progress.** Setup reports verification,
    materialization, and connection progress in the setup surface. Closing the window
    does not turn an incomplete connection into an apparent success.
11. **LOCAL-ONBOARD-6 — Role fidelity.** Editor-capable content is writable locally;
    viewer or commenter content is visibly read-only. The journey never implies that
    local availability grants additional cloud permissions.
12. **LOCAL-ONBOARD-7 — Existing broad mirror.** If the legacy all-accessible mirror
    is active, Hubble identifies its broader scope and requires the user to keep it or
    stop it before creating an overlapping current-context projection. It is never
    relabeled as a projection of only the selected Space.
13. **LOCAL-ONBOARD-8 — Cancellation and recovery.** Cancel leaves cloud and local
    content unchanged. Offline, authorization, storage, and collision failures preserve
    all bytes and provide retry or destination-change actions in place.

### Secondary journey — link to a code repository

14. **REPO-ONBOARD-1 — Folder-scoped association.** A Repo Link connects one cloud
    folder subtree to one local Git repository. It does not associate an entire Space
    or silently include root documents.
15. **REPO-ONBOARD-2 — Choose cloud content.** From a Space context, the user selects
    an existing cloud folder or creates one before choosing a repository. From an
    eligible shared-folder context, that folder is preselected.
16. **REPO-ONBOARD-3 — Permission explanation.** If the user can make a shared folder
    available locally but cannot manage its repo association, the primary journey
    remains available and the secondary journey explains the restriction.
17. **REPO-ONBOARD-4 — Resolve the repository.** The user may select a repository or a
    child directory. Hubble displays the resolved Git root before confirmation and
    rejects selections that are not inside a repository.
18. **REPO-ONBOARD-5 — Mount preview.** Confirmation shows the cloud folder, Git root,
    proposed local path, Git-exclusion behavior, effective role, and any `BRAIN.md`
    creation. Hubble never overwrites an existing `BRAIN.md`.
19. **REPO-ONBOARD-6 — Repository boundary.** The journey states that Hubble watches
    the connected Markdown subtree, does not read unrelated repository contents, and
    does not run Git.
20. **REPO-ONBOARD-7 — Safe completion.** The Repo Link is reported as complete only
    after the subtree is materialized, the watcher is connected, and Git exclusion is
    confirmed or a manual exclusion instruction is shown.

### Completion and continuing use

21. **READY-1 — Concrete completion.** Both journeys finish with the connected cloud
    scope and local path, plus **Copy path**, **Reveal in Finder**, and **Show agent
    instructions** actions.
22. **READY-2 — Agent handoff.** Agent instructions contain the exact local path and
    describe it as synchronized Hubble Markdown. Copying instructions does not launch
    an agent or grant new filesystem access.
23. **READY-3 — Context state.** Returning to an available context shows a quiet local
    marker and its current path. Syncing, offline, queued, or needs-attention states
    replace promotional guidance with the relevant status or recovery action.
24. **READY-4 — Skills follow availability.** When a healthy local path exists, Hubble
    may offer skills or HTML App guidance using that path. It must not build commands
    from an unrelated loose file or legacy open-folder path.
25. **READY-5 — Re-entry.** Interrupted setup resumes with the previously selected
    scope and destination when safe. A completed setup never restarts onboarding after
    relaunch or token refresh.
26. **READY-6 — Existing local controls.** Reveal, copy-path, relocate, and stop-local
    actions retain the behavior and safety guarantees of `NAV-10` and `LOCAL-1` through
    `LOCAL-4` in the parent product contract.

### Accessibility

27. **A11Y-ONBOARD-1 — Focus and keyboard.** The guidance, dialogs, destination
    choices, and completion actions are fully keyboard operable. Dialogs announce their
    purpose, initially focus the safest useful control, and return focus to the invoking
    action on cancel or completion.
28. **A11Y-ONBOARD-2 — Named scope and state.** Cloud scope, local path, read/write
    capability, progress, errors, and completion are communicated in text and announced
    to assistive technology; they are not conveyed by icons or color alone.

## UX validation

1. On a clean packaged install, sign in to a populated member Space with no local
   roots. Confirm that local-agent guidance appears before skills promotion and that
   both journeys are understandable without opening Settings.
2. Complete **Make available on this Mac** using the suggested destination. Confirm
   root documents and nested folders appear at the reported path, Copy path and Reveal
   work, and the ready state persists after relaunch.
3. Repeat from an editor-shared folder and a viewer-shared folder. Confirm the exact
   subtree and read/write capability are honest.
4. Link a cloud folder to a repository by selecting a child directory. Confirm the
   resolved root and mount preview, Git exclusion, optional `BRAIN.md`, completion
   actions, and contextual local marker.
5. Exercise occupied destination, overlap, offline setup, denied repo permission, and
   cancellation using keyboard and VoiceOver. Confirm no local bytes or cloud content
   are changed unexpectedly.
