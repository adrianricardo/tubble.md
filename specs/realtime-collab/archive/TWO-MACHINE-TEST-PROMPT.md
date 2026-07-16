# Prompt: Set Up Hubble Two-Machine Realtime Sync Test

You are helping me run a two-machine Hubble synced-folder smoke test. Do not
change application code unless setup is broken. Get this machine onto the pushed
realtime-collab state, configure the desktop test env, launch the app, and then
guide me through the two-machine test checklist.

Repo:

```sh
git@github.com:adrianricardo/hubble.md.git
```

Branch:

```sh
main
```

Deployment:

```sh
https://strong-setter-709.convex.cloud
```

Setup steps:

1. Ensure the repo exists at `/Users/adriantavares/Code/hubble.md`. If it does
   not, clone it from `git@github.com:adrianricardo/hubble.md.git`.
2. Run:

   ```sh
   cd /Users/adriantavares/Code/hubble.md
   git fetch origin
   git checkout main
   git pull --ff-only origin main
   git status --short --branch
   ```

3. Ensure dependencies are installed:

   ```sh
   pnpm install
   ```

4. Create or update `apps/desktop/.env.local` with:

   ```sh
   VITE_HUBBLE_REALTIME_COLLAB=1
   VITE_CONVEX_URL=https://strong-setter-709.convex.cloud
   ```

5. Verify the desktop build if time allows:

   ```sh
   pnpm build:desktop
   ```

6. Launch desktop:

   ```sh
   pnpm dev:desktop
   ```

Two-machine test plan:

Use separate local sync roots first:

- Machine A: `~/Hubble-A-test`
- Machine B: `~/Hubble-B-test`

Checklist:

1. On both machines, open Settings -> Cloud sync.
2. Sign in to the same test account on both machines.
3. Machine A: connect or create the empty root `~/Hubble-A-test`.
4. If there are no cloud docs, import a small markdown file through Cloud sync on
   Machine A.
5. Machine B: connect or create the empty root `~/Hubble-B-test`.
6. Confirm Machine B materializes the same cloud document.
7. Machine A: edit the synced markdown file in an external editor and save.
8. Machine B: confirm the file updates within a few seconds.
9. Machine B: edit the same document in its local synced file and save.
10. Machine A: confirm the update appears within a few seconds.
11. On both machines, run:

    ```sh
    find ~/Hubble-*-test \( -name '*.conflict-*' -o -name '*.local-edit-*' \) -print
    ```

Expected result:

- Both machines stay connected.
- Edits round-trip both directions through Convex.
- Cloud sync status shows recent activity.
- The `find` command prints nothing.

Do not start with the same-root lock test. The same-root test is only meaningful
if both machines point at one shared filesystem root, such as iCloud, Dropbox, or
NFS. Run the separate-root cloud sync smoke first.
