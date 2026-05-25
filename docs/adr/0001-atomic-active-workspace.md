# Workspaces load and switch as atomic Workspace Snapshots

Switching workspaces previously mounted the app shell immediately and let stores fill in piecemeal — the workspace name, file list, and editor content each settled at different times, producing a sequence of loading-flash states. We chose instead to model a [[Workspace Snapshot]] (see `CONTEXT.md`) as an atomically-loaded bundle: name + files + last-opened content fetched together, committed to the store in a single update. The app shell only renders when a Workspace Snapshot exists, so a "partially loaded" workspace is unrepresentable.

## Consequences

- Cold start and first-pick show a loading curtain until the snapshot is ready; the app shell never mounts empty.
- In-app switching keeps the previous Workspace Snapshot fully visible and interactive until the next snapshot is ready, then swaps in one render. Latest-wins cancellation: clicking a new target supersedes any in-flight switch.
- Load failures surface as a banner; the previous Workspace Snapshot (or the loading screen on cold start) stays put.
- The Convex `filesChanged` subscription is not part of the snapshot — it reconnects after the swap. A brief window with no live subscription is acceptable because the snapshot itself is freshly loaded.
