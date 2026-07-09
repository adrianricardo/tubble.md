# Repo-Brain Collaboration — Vision Synthesis

> ⚠ **2026-07-09:** the current vision now lives at `/brain/synthesized/current-vision.md`.
> This doc remains the authoritative detail for Decided #1–15, **except #13** (manual-only
> seeding), which is superseded by the agent-init entry point (`/specs/hubble-init/DESIGN.md`,
> storyboard v1.1 scenes 1–3).

> Captured 2026-07-02, revised 2026-07-03 from a discovery/interview session.
> **Revised again 2026-07-03 (interview round 2):** the five build-blocking gaps
> (repo-link mechanics, guest model, seeding, `BRAIN.md` lifecycle, sequencing)
> are now decided — see "Decided" #11–15. The revocability claim was also
> tightened per Codex finding #4.
> This reframes the *entry point* and *wedge* of the realtime-collab product. It
> does not discard `V1-RELEASE.plan.md` — it reorders it: the **repo-first path
> becomes the v1 wedge**, and the web-dashboard-first path (`A1`…) becomes a later
> front door. Both remain possible; the architecture must not preclude web-first.

## One-line vision

A developer links a repo to a **folder** in Hubble and fills it with the repo's
durable, shared context. They invite a non-technical, agent-native teammate who
joins *without cloning, without git*, points their own local agent (Claude Cowork)
at that context, and co-creates with the dev in real time. One cloud authority,
one universal bridge.

## The wedge (who we build for first)

The **non-technical stakeholder who runs their day through a local agent** (Claude
Cowork). Not a PM who only reads docs, not another engineer who'd clone anyway —
specifically the agent-native non-coder. They are the hardest collaborator to
serve (the product must make a repo legible to someone who will never see the
repo), which is exactly why serving them well is the differentiator.

Every other audience — other engineers, external/cross-org collaborators, pure
reviewers, AI agents as first-class members — is a **later path**, not v1.

## The model (locked)

Three nouns; only one has structure to learn.

```
Workspace   — your top container. Where membership (and billing) live.
└─ Folder            ← nests freely · can be LINKED TO A REPO · can be SHARED
   ├─ Folder         ← infinite nesting
   │  └─ Doc         ← cloud-only, always
   └─ Doc
```

- **"Brain" is informal-only.** It is *not* a schema entity. A "brain" just means
  *a repo-linked folder and everything under it*. We may keep the word in UI/copy;
  there is nothing named "brain" in the data model.
- **A repo attaches to a folder.** Any folder can be linked to a repo, and you can
  have as many repo-linked folders as you like (that is how you get "multiple
  brains" — no switcher gymnastics, just more folders).
- **Sharing is folder-level.** Inviting a collaborator = sharing a folder (and its
  subtree). Scope falls out naturally: share `Orbital` with Priya and she never
  sees `Lander`. Reuses the existing per-doc share model, lifted to folders.
- **Folders are pure organization.** Since everything is cloud-only, folders carry
  no privacy regime — they are just structure + the unit of repo-link and sharing.

## Decided

1. **Repo-first is the v1 wedge.** Web-first is a later front door.
2. **Model = Workspace ⊃ nested Folders ⊃ cloud Docs** (above). "Brain" informal.
3. **Protagonist = non-technical + agent-native** (uses Claude Cowork daily).
4. **Dev's payoff = shared, durable agent context.** One authoritative,
   always-current context every agent draws from, instead of re-explaining the repo.
5. **All-cloud. No git, ever (in v1).** Every doc is cloud-only. There is no
   cloud-vs-git regime, no per-doc/per-folder classification. See "Why all-cloud."
6. **Privacy/revocability: no git permanence; cloud access is revocable.**
   Nothing is ever written to git, so avoiding git removes the *permanence*
   vector — un-share and delete behave like a Google Doc. Honest scope (per
   Codex finding #4): synced-folder projections, editor caches, and agent
   transcripts are local copies outside Convex; revoking a share stops future
   access and removes the collaborator's materialized projection on their next
   desktop sync, but cannot recall bytes already copied. Do not market "absolute."
7. **Brain content is a mix that grows over time** — some seeded from the repo,
   some agent-drafted, some hand-authored. No single origin.
8. **No embedded agent UI in Hubble (for now).** Hubble is the **doc surface**;
   Cowork is the **agent surface**. Separate apps.
9. **Cowork runs locally** (desktop/CLI), like Claude Code — not cloud-hosted.
10. **The desktop app is the single watcher bridge; the web is zero-install human
    editing.** See "The one bridge."
11. **Repo link = mount the brain into the repo (local-path, desktop-side).**
    "Linking a repo" does **not** mean Hubble reads the repo. The dev, in the
    desktop app, picks a folder to link and a location inside their local clone;
    Hubble materializes the folder's synced projection there and adds the path to
    `.git/info/exclude` (local-only ignore — Hubble never edits the committed
    `.gitignore`, never reads repo contents, needs no GitHub integration). The
    cloud stores only display metadata on the folder (repo name/remote URL); the
    local path is per-machine desktop config. The functional payload of "link" is:
    *any agent working in the repo can see and edit the brain as files.* Default
    mount path: `<repo>/<folder-name>/` (sanitized), adjustable at link time.
12. **Folder sharing follows Google Drive semantics (folder-scoped guest, not
    membership).** A folder invite creates an ACL entry (`folderShares`), not a
    workspace membership. A role on a folder inherits down the subtree, resolved
    at authorization time; direct shares can **add** but never subtract relative
    to inherited access; docs created inside a shared folder inherit its shares;
    revoking the folder share removes all inherited access (and the collaborator's
    materialized projection on next sync); "Shared with me" surfaces the top-most
    shared node. Guests with `editor` role can create docs inside the shared
    subtree. Billing/membership stay at Workspace; guests are not members.
13. **Seeding v1 = manual + auto-generated `BRAIN.md`.** No repo import, no
    agent-drafted seed flow in v1. The dev creates/imports docs by hand (the
    existing import-file flow); linking produces a guided empty state plus
    `BRAIN.md`. Import-a-`/docs`-convention is a fast-follow candidate.
14. **`BRAIN.md` is a normal Live Document, seeded once, never regenerated.**
    Created at link time from a template (folder purpose, doc index at creation,
    how-to-work-here instructions for agents). Thereafter it is user/agent-editable
    like any doc — Hubble does not overwrite it, so there is no
    regeneration-vs-edit clobber loop. A "refresh index" action is post-v1.
15. **Sequencing: full pivot; deploy deferred.** The web-first v1's remaining
    operator gates (production deploy, hosting, ops sink, manual QA — P7 in
    `V1-EXECUTION.plan.md`) are **paused**, not run for a web-first launch.
    Repo-brain is built on the branch and everything deploys together as one
    repo-first launch.

### Why all-cloud (the argument we ran, condensed)

1. **Git *breaks* the core bet.** Anything in git has permanent, un-revocable
   history — every git-mirrored doc would be a hole in the revocability promise.
   All-cloud makes the guarantee absolute.
2. **It deletes the biggest source of complexity** — the entire cloud-vs-git axis,
   per-doc classification, two propagation paths, and a "which regime?" question a
   non-technical user should never face.
3. **It's a removal, not a rewrite.** The CRDT is already the authority; git was
   only ever an extra projection target. We drop the target.
4. **Git buys little for *docs*:** cloud version history + named restore beats line
   diffs on prose; inline comments/suggestions beat PRs for prose; agents still get
   file access via a **gitignored** synced-folder projection (on-disk ≠ in-git);
   and keeping docs in git would *reintroduce* the merge conflicts the CRDT exists
   to kill.
5. **Honest counter:** git uniquely serves docs that are genuinely part of the
   *codebase* (README, `CLAUDE.md`, ADRs) — but that is a pure-engineering need and
   **not the wedge**. It returns later as an optional, folder-level **git-export**
   ("sync this folder back into the repo"), where the "folder-level regime" idea
   finds its home.

### The one bridge

The **synced folder + watcher is the single, universal write-path into the CRDT**,
and it is load-bearing forever:

- The watcher watches the *filesystem*, not any app. So **any editor works,
  identically** — TextEdit, Obsidian, vim, hand edits, Cursor, Claude Code, Cowork.
  `PRODUCT.md`: *"The editor can be any app; the watcher is Hubble's."*
- Because a generic app can only *write a file*, the watcher can never be retired
  as long as "edit your brain anywhere" is promised.
- The collaborator's local agent (Cowork) needs **no special integration** — it is
  pointed at the (gitignored) synced folder as its working directory, exactly like
  Claude Code today. Zero new mechanism.
- The synced folder is a **projection for agents/external editors** — never
  committed to git.

### Rejected / deferred

- **Cowork clones the git repo** — breaks privacy (exposes history) and realtime
  (snapshot → conflicts). Rejected.
- **Cloud-hosted watcher / projected filesystem for the collaborator** — only
  needed if Cowork ran in the cloud; it runs locally. Unnecessary.
- **Cloud MCP service with per-collaborator auth** — over-built.
- **Local MCP server in the desktop app** — *deferred, only-if-earned.* Adds
  fidelity (clean attribution, permission-aware) but can never replace the watcher
  (TextEdit can't speak MCP). Build only if diff-based attribution complaints arise.
- **Git-mirroring** — *deferred* to an optional, folder-level export, post-v1.
- **Embedded agent chat UI** — deferred (north star).
- **Web-first front door** — deferred (later path).
- **Other collaborator audiences** — deferred.

## v1 happy path (the one thing we build end-to-end and demo)

**Dev links a repo → seeds a folder of cloud context → shares it → agent-assisted
collaboration.**

1. Dev links their repo to a folder in Hubble (informally: "makes a brain").
2. Dev seeds it — nested folders + docs, a mix (some from the repo, some authored),
   all cloud-only. It grows over time.
3. Dev shares the folder via an invite link — scoped to that subtree. No repo
   access, no git, no clone.
4. Non-technical collaborator opens the link → lands in the **web** workspace,
   **zero install**: reads docs, edits manually, sees live presence/cursors.
5. To bring their agent in, the collaborator **installs the Hubble desktop app** (a
   consumer app — sign in from the same link; *not* a repo clone, no git, no code).
   It materializes a **gitignored** synced folder of just their shared docs.
6. The collaborator points **Cowork** at that folder. Cowork reads/writes the docs
   as files; the watcher reconciles saves → CRDT → the edit propagates live to the
   dev and to the web.
7. The dev sees it round-trip. The dev works the same cloud docs (projected to
   their own gitignored folder so *their* agent can read them too).

**In v1 scope:** repo→folder link (local-path mount, Decided #11); nested folders
(schema already has `folders` with `parentId`); folder-level sharing/invites with
Drive-style inheritance (Decided #12); all-cloud docs (revocable cloud access,
Decided #6); zero-install web editing + presence; desktop app as the local-agent
enabler; in-repo synced-folder mount + watcher round-trip; selective
materialization for guests (only shared subtrees); a once-seeded `BRAIN.md` Live
Document (Decided #13–14) so Cowork understands the folder immediately.

**Explicitly out of v1 (fast-follow):** git-export (folder-level "sync to repo");
local MCP server; cloud-hosted agent support; embedded agent chat UI; web-first as
the primary front door; other collaborator audiences.

## Product bets (wagers, not proven)

- The **non-technical + agent-native** teammate is the right beachhead.
- **All-cloud (no git) is net-positive for docs** — absolute revocability, no merge
  conflicts, richer history/comments than git — and the code-adjacency loss is
  covered by the gitignored projection.
- **One universal bridge** (the local watcher) is enough for v1 — no cloud agent
  infrastructure — *because* Cowork is local.
- A **repo can be made legible** to someone who never sees the repo, via a
  repo-linked folder + a seeded agent-context file.

## Open questions (need input / research)

Resolved 2026-07-03 (interview round 2): ~~seeding~~ → Decided #13;
~~dev-side projection~~ → Decided #11; ~~folder sharing semantics~~ → Decided #12
(implementation detail — subtree resolution mechanics — belongs to the execution
plan, not this doc).

Still open:

1. **Cowork ↔ folder ergonomics.** Can Hubble launch Cowork scoped to the folder
   ("Work in Cowork" button)? What does Cowork require to be pointed at a working
   directory? (Research item; Cowork-is-local + folder-pointable is confirmed.)
2. **Onboarding a non-technical person to the desktop app.** Invite link → account
   → app install → synced folder, no git, no dead ends.
3. **Web-first path (later).** How the web-dashboard front door (`V1-RELEASE.plan.md`
   A1) coexists with repo-first once we get there.
4. **Git-export design (fast-follow).** The folder-level "sync back to the repo"
   feature for the engineering-docs case.

## What remains accurate from the existing folder

This vision is a framing/entry/storage-scope change on the **same technical
foundation** — most of the realtime-collab folder still holds:

- **`TECH.md` — authoritative.** CRDT-via-`@convex-dev/prosemirror-sync`, stable
  document IDs, server-side permission enforcement, version-history-not-git, and the
  watcher → base-cache-diff → scoped-patch reconcile all stand. That reconcile path
  **is** this vision's "one bridge."
- **`DECISIONS.md` #1–6 — hold.** #5 (product history, not git) and #6 (local files
  are editable inputs) are *reinforced* here; #6 is the bridge re-derived.
- **`PRODUCT.md` — mostly holds** as the underlying product; this vision refines the
  wedge, entry point, and (to all-cloud) the storage scope.
- **Reordered:** `V1-RELEASE.plan.md` / `V1-EXECUTION.plan.md` — feature inventory
  valid; web-first front door + "scope fully resolved" claim superseded.

See `README.md` → "Direction update" for the full current-vs-superseded map.

## Implementation implications (signposts, not a plan)

- **Reuses** the existing watcher/reconcile machinery (RD12 patch API,
  `syncedFolderService`, `reconcile.ts`) — the collaborator path is the desktop
  path pointed at a gitignored projection of shared cloud docs.
- **New schema work:** a **folder** entity with nesting, a **repo-link** attribute
  on folders, and **folder-level sharing** (extend `docShares` to subtrees).
- **Needs** selective projection: a member's desktop app materializes only the
  folders shared with them, not the whole workspace.
- **Drops** any git-mirror/commit path from v1 (all-cloud).
- **Needs** `BRAIN.md` (agent-context) generation into the synced folder.
- **Reconciles with** `V1-RELEASE.plan.md`: its web-dashboard-first framing (Track
  A) is not wrong, but it is no longer the *first* wedge — repo first, web later.
