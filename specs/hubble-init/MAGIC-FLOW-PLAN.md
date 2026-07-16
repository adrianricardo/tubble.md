# Magic Flow Plan — always-live mounts, zero-config init

**Written 2026-07-11** from Adrian's decisions (interview in session; see decision
notes at bottom). **Goal:** static export ceases to exist as an end state — every
init/apply run ends with a **live watched mount**, and the whole flow feels like magic:
the only manual acts are *approving a login once per machine* and *granting install
permission if the desktop app is missing*.

**Execute with:** `/codex-first` routing — Codex implements from these specs, Claude
designs/reviews/verifies. Phases are independently shippable, in value order. Run the
acceptance check at the end of each phase before starting the next.

**Design authority:** `DESIGN.md` (gaps #1–4, #9 are all addressed here). Update the
gap entries as phases land.

---

## Phase 1 — `hubble login` (identity foundation; closes gaps #1 + #9)

Kills the throwaway-account dance (mint → create → invite → transfer → creds
retention) that made the 2026-07-10 run feel complicated. After this phase, init acts
AS the user from the first API call; workspaces are user-owned at creation.

**Backend (packages/sync-backend):** device-flow on top of convex-auth:
- `deviceAuthRequests` table: `{ code (8-char, unguessable), status: pending|approved|denied|expired, requestedAt, approvedBy?, refreshToken? }`, TTL ~10 min.
- `deviceAuth:request` (public mutation) → creates row, returns `{ code, approveUrl }`.
- `deviceAuth:approve` (authed mutation, called from www) → marks approved, mints a
  refresh token for the approving user (reuse convex-auth session machinery).
- `deviceAuth:poll` (public query by code) → returns refresh token once approved,
  then burns the row (single read).
- Threat notes: code displayed to the user in both surfaces (verify-match, RFC 8628
  style); rows single-use; rate-limit request.

**Web (apps/www):** `/device` route — signed-in user pastes/confirms the code, sees
"CLI on <hostname> wants access", one Approve button. (Desktop app can reuse the same
web route via its shell; no separate surface needed.)

**CLI (packages/cli):**
- `hubble login [--url]` → calls `deviceAuth:request`, opens `approveUrl` in the
  browser (prints it too), polls, stores `{ deploymentUrl, refreshToken }` in
  `~/.hubble/credentials.json` (chmod 600). `hubble logout` deletes it.
- Token plumbing: every command resolves auth as `--auth-token` > env >
  refresh-token-exchange (auto-refresh JWTs; convex-auth refresh flow). Kills the
  1-hour-JWT-expiry failure mode from the run records.

**Skill (hubble-init SKILL.md):** replace the whole "Auth for headless runs" section:
preflight checks `hubble login` state (prompt the user to run it if missing);
workspace created as the user; delete the throwaway/invite/creds-retention machinery.

**Acceptance:** on a machine with no prior state: `hubble login` → browser approve →
`hubble cloud create --name x && hubble cloud folder list` works; still works 2h
later (refresh proven); `specs` run records no longer mention throwaways.

---

## Phase 2 — zero-click live link (kills static export; closes gap #2 + #4)

**Desktop (apps/desktop):**
- Register `hubble://` protocol (electron `setAsDefaultProtocolClient` + macOS
  Info.plist) — routes into the main process (gap #4).
- Local command endpoint: main process listens on a unix socket
  (`~/Library/Application Support/Hubble*/cli.sock`, 0600) accepting JSON commands
  from same-user processes. First command: `link-repo`
  `{ workspaceId, folderId, folderName, repoDir, mountPath }` → runs the existing
  `linkRepoFolder` handler immediately (no form).
- UX on receipt: perform the link, then toast: **"<folder> mounted at <relative
  mount path> — Undo"**. Undo = unlink + remove the materialized mount dir iff no
  local edits landed since materialization (reconcile state clean); otherwise keep
  files and just unlink, saying so. Zero-click was Adrian's explicit call; undo is
  the safety.
- Also expose `status` over the socket (signed-in user, deployment, mounts + last
  reconcile times) — the CLI's detection primitive.

**CLI:** `hubble mount --workspace … --folder … --repo <dir> --path <mountPath>`:
1. App running (socket answers)? → send `link-repo`, wait for success.
2. Installed but not running? → launch (`open -a`), wait for socket, then (1).
3. Not installed? → Phase 3's ensure-desktop; until Phase 3 lands: fail with install
   instructions (never silently export).
4. Exit 0 **only after the watch is proven live**: request `status`, confirm the
   mount exists and its watcher is attached; then write a canary edit to a scratch
   doc? No — cheaper: confirm `.hubble/state` materialized under the mount and the
   app reports the folderId watched.

**Skill:** apply-mode step 6 becomes `hubble mount …`; "Live watch stays a desktop-app
job (gap #2)" note deleted; the run is not complete until the mount is live. `hubble
cloud folder export` remains as a utility but writes a `.hubble-export.json` marker
(`{ static: true, exportedAt, folderId }`) so a directory can never masquerade as a
live mount — and the desktop app's link flow deletes that marker when it takes over
a directory.

**Migration:** relink this repo's `brain/cloud/` (currently a static projection from
the 2026-07-10 run) via the new path as the phase's dogfood acceptance.

**Acceptance:** with the app running: an apply run on a scratch repo ends with a live
mount and zero clicks (toast observed); file edit reconciles ≤10s; `hubble mount` from
a cold app-not-running state also succeeds (auto-launch). `brain/cloud/` is live.

---

## Phase 3 — ensure-desktop: install magic (closes gap #3)

**Packaging:** electron-builder dev artifact (dmg or zip, unsigned/ad-hoc), built by a
repo script (`pnpm build:desktop:dist`), uploaded to a **GitHub Release** on
`adrianricardo/hubble.md` under a stable tag (e.g. `desktop-dev-latest`); the download
URL is derived from the tag, not hardcoded per release. Proper signing/notarization/
brew cask stays a launch task (out of scope here — Adrian's call: unsigned dev build).

**CLI `hubble ensure-desktop`** (also invoked by `hubble mount` step 3):
1. Detect: app bundle present? (`/Applications/Hubble*.app`, `mdfind` fallback) —
   socket answering?
2. Missing → **ask permission** (the skill surfaces this via AskUserQuestion; raw CLI
   prompts y/N — Adrian: confirm first, then everything magical in background):
   download, verify size/hash from release metadata, install to /Applications, open.
3. First-run sign-in handoff: app boots signed-out → CLI sends `login-with-token`
   over the socket carrying a **fresh single-use refresh token minted via the CLI's
   Phase-1 credentials** (same user, same machine, 0600 socket — acceptable for the
   dev build; revisit for public launch). App stores it and is signed in as the user
   with zero typing.
4. Continue into `hubble mount`.

**Acceptance:** on a machine (or fresh macOS user account) without the app: apply run
→ one permission prompt → app installs, opens, signed in, mount live — no other
manual steps, no visits to a sign-in form.

---

## Phase 4 — repo-link form fixes (the manual fallback stops being a trap)

From the 2026-07-10 verification session (Adrian hit both, twice):
1. **Repo picker walks up to the git root.** Picking any directory inside a repo
   resolves to the repo root (show the resolved root in the UI); only error when
   there's genuinely no enclosing repo. (`resolveGitRepo` already finds the root —
   stop erroring on subdirs at the picker level.)
2. **Mount path derives fresh.** Recompute default mount path whenever the folder or
   repo selection changes; never carry a stale value from a previous link attempt;
   visually distinguish user-edited vs derived state.
3. **Mount list shows liveness** — last-reconcile time per mount, so "is this
   actually syncing?" is answerable at a glance (the static-vs-live ambiguity that
   burned the 567 test edit).

**Acceptance:** link via the form picking a repo *subdir* and an old folder — correct
root + fresh path with no manual fixing; mounts list shows recent reconcile times.

---

## Sequencing & session shape

- **Next session: Phase 1 + Phase 2** — that's the "never static again" core. Phase 2
  depends on 1 only for the no-cross-account guarantee; they can be built in parallel
  by Codex (separate packages) and integrated at the end.
- Phase 3 next (packaging is fiddly; isolate it), Phase 4 anytime (small, pure
  desktop UI — good Codex warm-up task).
- Each phase: update `DESIGN.md` gap entries + roadmap NEXT STEP + run/verification
  notes per the progress contract before ending the session.

## Decision notes (Adrian, 2026-07-11)

1. Static export must never be an end state — always live watch.
2. `hubble login` in scope, first (device flow; approve in browser).
3. App running + signed in → **zero-click** link with undo toast.
4. App missing → ask permission once, then install/open/sign-in/link magically.
5. Distribution for this plan: **unsigned dev build at a stable download URL**;
   signing/notarization/brew deferred to launch.
6. Fix the manual form's traps too (git-root walk-up, fresh mount path).
