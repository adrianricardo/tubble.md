# Synced Folder Ready-to-Test Runbook

Use this runbook to verify the first human-testable synced-folder flow on the
deployed fork Convex backend. The package smoke script at the end proves the
shared reconcile core; the desktop watcher, IPC, folder picker, and Settings UI
are proven only by the manual steps.

## Prereqs

- [ ] A deployed fork Convex URL, for example `https://<deployment>.convex.cloud`.
- [ ] Convex Auth is configured on that deployment and a test account can sign in.
- [ ] `apps/desktop/.env.local` or the desktop launch environment sets
      `VITE_CONVEX_URL=<deployed Convex URL>`.
- [ ] The desktop app is built or running from this branch.
- [ ] Use a scratch sync root such as `~/Hubble-test`. Start with an empty folder
      unless you are explicitly testing the import guard.
- [ ] Keep a browser tab open to the same deployment so cloud-side document changes
      can be confirmed.

## 1. Sign In

- [ ] Launch the desktop app.
- [ ] Open Settings -> Cloud sync.
- [ ] Sign in with the test account.

Expected:

- [ ] Settings shows the signed-in Cloud sync section.
- [ ] The Synced Folder status says `Not connected`.
- [ ] The workspace summary loads without an auth error.

## 2. Connect An Empty Sync Root

- [ ] In Settings -> Cloud sync, choose or create an empty folder such as
      `~/Hubble-test`.
- [ ] Click Connect.

Expected:

- [ ] The status changes to `Connected` or `Idle`.
- [ ] `Documents mirrored` is greater than zero if the account has cloud docs.
- [ ] Cloud docs appear under the sync root in their nested workspace/folder paths.
- [ ] No `*.conflict-*` or `*.local-edit-*` files appear during initial materialize:

```sh
find ~/Hubble-test \( -name '*.conflict-*' -o -name '*.local-edit-*' \) -print
```

## 3. Confirm Read-Only Materialization

Use a viewer/commenter document if the account has one.

- [ ] Locate the read-only markdown file under the sync root.
- [ ] Check its mode:

```sh
ls -l ~/Hubble-test/path/to/read-only.md
```

Expected:

- [ ] Viewer/commenter documents are mode `-r--r--r--` (`0444`).
- [ ] Owner/editor documents remain writable.

If there is no viewer/commenter fixture, mark this step skipped and create one
before the deploy gate.

## 4. Edit A Writable Document On Disk

- [ ] Open a writable synced `.md` file in an external editor.
- [ ] Save a small text edit.
- [ ] Watch the browser/cloud copy of the same Live Document.

Expected:

- [ ] The browser/cloud document updates within roughly 1-2 seconds.
- [ ] The desktop status `Last activity` moves to `just now`.
- [ ] No conflict or backstop copy is written:

```sh
find ~/Hubble-test \( -name '*.conflict-*' -o -name '*.local-edit-*' \) -print
```

## 5. Force A Backstop

- [ ] Pick a writable synced document and identify its document ID from
      `.hubble/index/synced-folder.json`.
- [ ] Corrupt or move its base cache:

```sh
mv ~/Hubble-test/.hubble/state/live-documents/<documentId>.base.md \
  ~/Hubble-test/.hubble/state/live-documents/<documentId>.base.md.bak
```

- [ ] Save another local edit to that markdown file.

Expected:

- [ ] A sibling `*.local-edit-<timestamp>.md` file appears beside the document.
- [ ] The visible markdown file reloads to the latest cloud version.
- [ ] The toast explains that the local edit was preserved.
- [ ] The cloud document is not silently overwritten.

Restore the base cache after the check if you need to keep using the same doc.

## 6. Rename And Move From Finder

- [ ] Rename a writable synced markdown file in Finder.
- [ ] Confirm the cloud document title/path changes.
- [ ] Move the same file into another materialized folder.
- [ ] Confirm the cloud folder changes.

Expected:

- [ ] Rename and move toasts are short success messages.
- [ ] The reverse index still maps the new path to the same document ID.
- [ ] Reconnecting the folder does not create a duplicate document.

## 7. Disconnect And Reconnect

- [ ] Click Disconnect.
- [ ] Save a local edit and confirm no watcher event is processed while disconnected.
- [ ] Reconnect the same root.

Expected:

- [ ] The watcher stops after disconnect.
- [ ] Reconnect materializes idempotently.
- [ ] Existing cloud docs are not duplicated.

## Package-Level Reconcile Smoke

This smoke bypasses the desktop watcher, Settings UI, IPC, and folder picker. It
only proves that the package-level base-cache diff -> `reconcileProjectionFile` ->
Convex `documents.applyPatch` path works with an authenticated backend.

Build the packages first:

```sh
pnpm --filter @hubble.md/sync --filter @hubble.md/convex-client build
```

Run against the deployed backend with a real Convex Auth token:

```sh
CONVEX_URL=https://<deployment>.convex.cloud \
AUTH_TOKEN=<jwt from the signed-in desktop/web session> \
node scripts/synced-folder-reconcile-smoke.mjs
```

Optional inputs:

```sh
WORKSPACE_ID=<id> WORKSPACE_NAME="Synced Folder Smoke" SYNC_ROOT=/tmp/hubble-smoke
```

Expected:

- [ ] The script creates or reuses a test workspace.
- [ ] It imports one timestamped Live Document.
- [ ] It writes the projection and base cache under `SYNC_ROOT`.
- [ ] It edits the projection, runs `reconcileProjectionFile`, and reports a newer
      revision.
- [ ] A final cloud read contains the local edit marker.

## Manual Test Log

### 2026-07-01 — V1 demo UX pass on `strong-setter-709`

Scope:

- Signed-in web create/share/open flow.
- Workspace-member access to copied document URLs.
- Desktop Cloud Sync reconnect against an existing indexed root.
- File round trip: disk -> cloud -> disk.
- Duplicate-document regression check for the prior `Untitled (2) (N)` runaway.

Environment:

- Web dev server: `http://localhost:5174/` (`5173` was occupied).
- Convex deployment: `https://strong-setter-709.convex.cloud`.
- Desktop dev app: `@hubble.md/desktop@0.1.13`.
- Sync root: `/Users/adriantavares/Hubble-A-test/jul1test/Untitled`.
- Workspace: `Desktop Test`.
- Test document: `Desktop Test/UX Smoke 2026-07-01.md`.

Results:

- Two separate Chrome profiles signed in successfully for owner/member testing.
- The web document opened and saved edits through `documents:markEdited`.
- Desktop Cloud Sync was already connected to the sync root as an
  `existing-hubble` folder.
- Desktop status after reconnect/use:
  - `connected: true`
  - `documentCount: 6`
  - `lastError: null`
  - `reconciledCount: 1`
  - `backstopCount: 0`
  - `readOnlyRejectedCount: 0`
  - `errorCount: 0`
  - `queuedEventCount: 0`
- Disk -> cloud passed: editing
  `Desktop Test/UX Smoke 2026-07-01.md` added `disk smoke jjul 1` and triggered
  `documents:applyPatch`.
- Cloud -> disk passed: adding `web smoke 14:31` in the web editor appeared in
  the disk file.
- No `*.conflict-*` or `*.local-edit-*` files were created under the sync root.
- Duplicate backend check stayed clean:
  - `activeMatches: 0`
  - `deletedMatches: 188`

Notes:

- The local sync folder contains one existing
  `Desktop Test/Untitled (2) (2).md`, but not the runaway generated sequence.
- Dev logs still show repeated Tiptap warnings:
  `Duplicate extension names found: ['link']`.
- During web dev, Vite briefly logged
  `Can't resolve '@hubble.md/ui/tailwind.css'`; the UI recovered after the UI
  package watcher rebuilt.
- The in-app Browser automation path remained blocked by
  `sandboxCwd must be an absolute file URI`, so the pass used human browser
  interaction plus server/CDP/log inspection.
- Web and desktop dev servers were stopped after the pass; no matching dev
  processes remained.

---

# RB7 — Repo-First Launch QA (single human checklist)

This is the one QA checklist for the repo-first v1 launch. It supersedes the
scattered "left for RB7 manual QA" notes in the RB2/RB3/RB6 handoffs (folded in
below). Run the two-machine guest scenario first; it exercises the whole VISION
happy path. Then pay the owed browser smokes. Deploy/notarization steps are in
`# LAUNCH-CHECKLIST` at the end — operator only, do not run during QA.

Roles for this pass:

- **Dev machine** — the repo owner. Signed into account A. Has a local git repo
  clone and the desktop app from this branch.
- **Guest machine** — a fresh person. Account B (created from the invite link,
  no prior workspace/membership). Clean user profile if possible.

## RB7.1 — Two-Machine Repo-First Guest Scenario (VISION happy path)

Prereqs: both machines built from `v1-release`; `apps/desktop/.env.local` on
both sets `VITE_CONVEX_URL=<deployed Convex URL>`; account A and account B exist
or B is created live from the link in step 4.

### A. Dev links a repo + seeds (desktop, account A)

- [ ] Desktop → Settings → Repo links → link a **real git repo clone** to a
      cloud folder. Accept or edit the default mount path `<repo>/<folder>/`.
- [ ] Confirm files materialize at the mount path.
- [ ] `git status` in that repo shows **nothing** (the mount was added to the
      common gitdir's `info/exclude`). If exclude failed, the UI shows an exact
      `.gitignore` line — add it, then re-check `git status`.
- [ ] Confirm `BRAIN.md` exists at the folder root (RB5 seed-once), on disk and
      in the cloud. Re-linking (or a second machine) must **not** duplicate or
      overwrite it.
- [ ] Web (account A) shows the folder anchored to the repo (display metadata:
      repo name / origin URL). No local path is ever shown to other users.
- [ ] Seed a couple of docs in the folder (manual create is the v1 path).

### B. Guest joins by link on web (Guest machine, account B — zero install)

- [ ] Dev shares the folder by link: folder row → share dialog → "anyone with
      the link" → **copy link** (role editor for the round-trip test).
- [ ] Open the link on the Guest machine **signed out**. The join screen sells
      the context, not the tool; the URL survives the auth gate.
- [ ] Sign up as account B (new account, no memberships). Land **inside the
      shared folder**, not a workspace-creation detour.
- [ ] Guest sees only the shared subtree in the sidebar — no member management,
      no workspace switcher entries they are not in, no dead role buttons.
- [ ] Guest edits a doc; dev (account A, web) sees the edit live with presence /
      cursors. Guest creates a doc inside the subtree; it appears for the dev.
- [ ] The "bring your agent" banner is visible on the shared folder.

### C. Guest installs desktop + agent round-trip

- [ ] Guest installs the desktop app (link from the banner / releases page),
      signs in as account B. First-run detects a **guest-only** account (folder
      shares, zero own docs) and lands in the "Bring your agent in" state with a
      "Connect synced folder" CTA — not the default new-doc prompt.
- [ ] Guest connects a synced folder; the shared subtree materializes as nested
      `Shared with me/<Workspace> - <Folder>/…` (not a flat doc list). Viewer/
      commenter docs are read-only (`0444`); editor docs writable.
- [ ] Guest points a local agent (Cowork / Claude Code) at the folder and has it
      edit a file. The save round-trips to **dev's web** AND **dev's in-repo
      mount** within ~1–2s. No `*.conflict-*` / `*.local-edit-*` files:

      ```sh
      find "$SHARED_ROOT" \( -name '*.conflict-*' -o -name '*.local-edit-*' \) -print
      ```

### D. Owner revokes — projection disappears, backstops survive

- [ ] Dev revokes the guest's folder share (remove person, or clear the link
      share if that was the grant).
- [ ] Guest **web**: on next interaction, a clean access-lost screen (revoked-
      while-viewing copy), not a crash.
- [ ] Guest **desktop**: on next sync, the materialized subtree is removed
      (moved to `.hubble/trash`, honest revocability). Any `*.local-edit-*`
      backstop the guest created **survives** — never deleted (user data).
- [ ] Dev's in-repo mount and web are unaffected.

Pass condition: all four blocks green on real hardware, two humans, production
(or a deployed staging) Convex.

## RB7.2 — Folded-in manual smokes from RB2 / RB3 / RB6

These were deferred by the earlier phases to this pass. Most are subsumed by
RB7.1; run any not covered above.

- [ ] **RB2 two-account guest flow** (owner shares by link → guest signs up →
      edits with presence → creates a doc → owner revokes → clean error state).
      Covered by RB7.1 B+D.
- [ ] **RB2 doc-share dialog** now has the visible "anyone with the link" state
      + one-click copy-link (the old V1 "Demo TODO"). Verify on a **document**
      share (not only folder).
- [ ] **RB3 repo-link acceptance** on a scratch repo, including a **git worktree
      case** (`.git` is a gitfile → exclude must land in the common gitdir).
      Covered by RB7.1 A for the plain case; add a worktree clone.
- [ ] **RB6 guest-only desktop first-run** renders the guest branch, not the
      create-doc prompt. Covered by RB7.1 C.
- [ ] **RB6 empty/error states**: expired/dead link, signed-in-but-no-access,
      guest with no shares yet, revoked-while-viewing vs never-had-access copy.

## RB7.3 — Owed browser smokes (signed-in web) — STILL OWED

Owed since V1-EXECUTION sessions 2–7; the in-app Browser tool was blocked
(`sandboxCwd must be an absolute file URI`) and no browser automation was
available in the RB7 automated pass either. Builds are green as a boot
substitute (`pnpm --filter @hubble.md/www build`, `pnpm build:desktop` both
pass on `v1-release`), but these must be run by hand against a live signed-in
stack before the launch gate closes:

- [ ] **Dashboard provisioning**: sign in on a fresh empty account → personal
      workspace + dashboard provision; first-run "Welcome to Hubble" auto-doc.
- [ ] **Create/open Live Document** from Home; edits save via `documents:markEdited`.
- [ ] **Presence + cursors**: second account/session on the same doc shows
      collaborator presence and editor cursors.
- [ ] **Mentions**: add a comment with an `@mention`; verify notification
      delivery to the mentioned user.
- [ ] **History restore**: edit long enough to produce an autosaved History
      revision, then restore it; confirm content reverts.
- [ ] **Member management**: invite/manage/revoke workspace members and invites.
- [ ] **POC bootstrap**: `?test=1` still reaches the configured workspace.
- [ ] **RB2 guest two-account flow** in a browser (paired with RB7.1 B).

Mark each `[x]` with the deployment URL + date when run.

---

# LAUNCH-CHECKLIST (operator only — deploy / notarize / release)

Do **not** run during QA. These absorb the deferred V1-EXECUTION P7 operator
gates (D3/D4/D5/C3/D7, per REPO-BRAIN-EXECUTION RB7 items 4–5). Run in order.

1. **D3 — Production Convex (greenfield deploy).** Per the 2026-06-30 decision,
   a fresh production deployment (not a fork of dev data).
   - [ ] Provision the prod Convex deployment; run `npx convex deploy` against it
         from `packages/sync-backend`.
   - [ ] Configure **Convex Auth** on prod (providers + env/secrets) so a real
         account can sign in. Confirm `npx convex codegen` is clean.
   - [ ] Smoke a sign-in against the prod URL before wiring the web app.
2. **D4 — Web hosting + production `VITE_CONVEX_URL`.**
   - [ ] Set `VITE_CONVEX_URL=<prod Convex URL>` in the web build env
         (`apps/www/.env` / hosting env — `.env.example` has the key).
   - [ ] `pnpm --filter @hubble.md/www build`; deploy `apps/www/dist` to the host.
   - [ ] Verify the deployed site loads and reaches prod Convex (dashboard
         provisions on a fresh account).
3. **D5 — External ops / alert sink.** (See `OPERATIONS.md` → "External Alert
   Follow-Up".)
   - [ ] Choose a monitoring sink and wire alerts from the synced-folder status
         shape: sustained `errorCount` growth, sustained `queuedEventCount > 0`,
         non-zero `backstopCount`, repeated lock-loss, and Convex failures on
         `documents.applyPatch` / `importMarkdown` / `listWithMarkdown` /
         `listSharedWithMe`.
   - [ ] Confirm the sink **never** receives document markdown, titles, local
         filesystem paths, or auth tokens.
4. **C3 — Desktop notarization + release tag.**
   - [ ] Codesign with a Developer ID cert and notarize the `.dmg`
         (`notarytool` + staple); confirm Gatekeeper passes on a clean Mac.
   - [ ] Cut the release tag and publish the `.dmg` to GitHub Releases.
   - [ ] **Fix the download URL:** the in-app link is
         `github.com/bholmesdev/hubble.md/releases/latest`
         (`apps/www/src/screens/GuestFolderScreen.tsx` `DESKTOP_DOWNLOAD_URL`),
         but the canonical repo is `adrianricardo/hubble.md`. Point it at the
         **actual** releases page before launch or the guest "get the desktop
         app" button 404s.
5. **D7 — Signup cap sanity check.**
   - [ ] `DAILY_SIGNUP_CAP = 100` (`convex/auth.ts`); confirm the UTC-day counter
         is active on prod and the copy "Daily signup limit reached. Signups
         reopen tomorrow." shows when exceeded. (Landed in P7; verify only.)
6. **Launch copy check.**
   - [ ] Repo-first story + RATIONALE §6 taglines ("Your code lives in git. Your
         brain lives in Hubble."; "A link, not a clone."). Positioning: *turns a
         repo into shared, living context … No clone. No git. No conflicts.*
   - [ ] **No overstated revocability.** Approved framing only: "no git
         permanence; access is revocable" / "never trapped in git forever."
         Audited 2026-07-05 across `apps/www/src` + `apps/desktop/src`: no
         "absolute revocability" / "permanent" / "forever" violations found; app
         copy ("no clone, no git") is consistent. No wording changes needed.
