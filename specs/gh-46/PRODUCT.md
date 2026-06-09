# Add Workspace dialog with Cloud Sync setup

Issue: https://github.com/bholmesdev/hubble.md/issues/46

## Summary

Desktop users add folders through an Add Workspace dialog instead of a bare folder picker. The default path remains non-invasive, while optional Agent Instructions and Cloud Sync setup create support files only after the user opts into them.

## Problem

The desktop app currently treats opening a folder and adding a Workspace as the same direct picker action. Users need a clear setup surface where they can choose a folder, decide whether to add Workspace capabilities, and connect Cloud Sync without surprise writes.

## Behavior

1. The workspace switcher action says `Add Workspace...`, not `Add folder...`.
2. The empty desktop sidebar primary action says `Add Workspace` and opens the same dialog.
3. Opening the dialog does not start a folder picker immediately. The dialog presents a folder field with a `Choose...` button.
4. Choosing a folder shows the selected path and uses the folder basename as the default Workspace name wherever a new remote Workspace name is needed.
5. Canceling the folder picker returns to the dialog without changing any selections.
6. Canceling the dialog leaves the current open folder, recent Workspace list, and filesystem unchanged.
7. Confirming with only a folder selected opens that folder in the editor and does not create `.hubble/`, `.hubble/config.json`, or `.hubble/state.json`.
8. The dialog includes an `Add agent instructions` option. Its helper copy says these are lightweight agent skills for coding agents to use Hubble features inside this workspace, like embedding custom UIs.
9. If `Add agent instructions` is selected, confirm creates the required instruction files and then opens the folder. If writing those files fails, the folder does not silently become partially configured; the user sees an error and can retry or cancel.
10. The dialog includes `Connect Cloud Sync` or `Enable Cloud Sync`. Cloud Sync fields stay hidden until the user selects it.
11. When Cloud Sync is enabled, the user enters a Convex deployment URL. The URL validates on blur and shows pending, valid, and error states inline.
12. A valid deployment URL fetches available remote Workspaces. While loading, the remote Workspace chooser is disabled and shows a loading state.
13. Fetch failure keeps the typed URL, explains the failure, and exposes retry without closing the dialog.
14. The user can select an existing remote Workspace or choose `Create new`.
15. `Create new` shows a Workspace name input defaulting to the folder basename. Empty names block connect with inline validation.
16. `Auto sync` defaults on. Its tooltip explains files can still be synced manually with the Hubble CLI.
17. The final primary action is `Connect` when Cloud Sync is enabled, and it is disabled until required fields are valid.
18. Pressing `Connect` writes Cloud Sync configuration, creates sync state if missing, runs initial sync, and opens the folder when setup succeeds.
19. Initial sync uses the existing reconciliation behavior: local-only files push, remote-only files pull, unchanged files remain unchanged, conflicts preserve both, and assets follow current asset sync rules.
20. If daemon registration fails after Cloud Sync connects, the folder still opens as connected. The user sees an error with retry for background sync registration.
21. Turning `Auto sync` off during setup still connects Cloud Sync and allows manual sync through the Hubble CLI.
22. Workspace settings expose Cloud Sync details for a connected Workspace: deployment URL, remote Workspace, background sync state, retry, disconnect, and advanced read-only ids with copy actions.
23. Workspace settings show no Cloud Sync controls for a Plain Folder beyond an action to start Cloud Sync setup.
24. Disconnecting Cloud Sync removes Cloud Sync linkage while preserving local files and leaves a clear local-only state.
25. Relinking to a different deployment URL or remote Workspace requires a confirmation because it may merge different remote files into the same local folder.
26. Keyboard users can complete setup without a mouse: focus starts at the first actionable field, Tab order follows the visual order, Escape closes after confirmation when setup is dirty, and Enter submits only when valid.
27. Reduced-motion users do not see animated state changes beyond instant show/hide transitions.

## Design context

Use existing Hubble desktop patterns: the workspace switcher menu remains the entry point, shared modal/button/input primitives shape the dialog, inline validation stays close to the related field, and destructive or relink actions use explicit confirmation.

## UX validation

Open desktop with no folder selected, choose Add Workspace, cancel at each step, then add a Plain Folder and verify no `.hubble/` directory appears. Repeat with Cloud Sync enabled against a test Convex deployment: validate URL states, existing versus new remote Workspace selection, disabled Connect states, initial sync result, daemon failure retry messaging, and settings visibility.
