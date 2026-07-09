# hubble-init — Design (draft)

The agent-run front door: `/hubble-init <dir>` inside Claude Code / Codex triages a
repo's durable context into a repo-linked Hubble cloud folder, ensures the desktop app
(the sync bridge), and deep-links into the new workspace.
Vision: `/brain/synthesized/current-vision.md`. Visual: the v1.1 storyboard, scenes 1–3.

**Status: design only — not built.** Dogfood is gated on this logic feeling good
(decision log 2026-07-09).

## Flow

1. **Scan** — walk the target dir (and optionally the repo) for prose-shaped, durable
   context: `*.md` outside code-coupled locations, docs/specs/notes/brain conventions.
2. **Triage proposal** — split into *move → cloud* vs *keep → git*, each with a one-line
   reason. Dev edits the list, then confirms. Nothing is written before confirmation.
3. **Apply** — create workspace/folder (authenticated), upload docs as Live Documents,
   remove originals from the working tree, mount the git-excluded projection
   (`.git/info/exclude`), seed `BRAIN.md`.
4. **Handoff** — detect desktop app; install if missing; sign in; open
   `hubble://folder/<id>`.

## Triage heuristic (absorbed from 567's RESOLVER — see decision log)

Move to cloud when: opinion/strategy that evolves; someone without repo access needs it;
it should be revocable (sensitive bets, pricing); agents need it as shared living
context. Keep in git when: the codebase needs it at clone/build time (README, CLAUDE.md/
AGENTS.md, ADRs, runbooks tied to code); it wants line-diff review. Honest-scope rule:
already-committed files keep their git history — moving stops future history only; say so
in the proposal.

Brain-keeper absorption into product mechanics: BRAIN.md is seeded once and never
regenerated (Timeline preservation ≈ CRDT version history; source-grounding ≈ patch
attribution). A post-init maintenance skill ("brain-keeper for your Hubble folder") is a
fast-follow candidate, not v1.

## Interactivity is the product (2026-07-09)

The triage is not a batch heuristic with a confirm button — **the init command is an
interactive session**: it proposes an initial split from its default instructions, then
helps the user reason through each contested file. The heuristic below is the *opening
proposal*, and the conversation is where the value is. The first real dogfood target is
this repo's own `brain/`: mechanics-adjacent docs stay in git, strategy/vision moves to
Hubble cloud (the "split" Adrian described).

## Safety gate: no data loss (blocking dogfood on real content)

Before any apply-mode run on content we care about, verify end-to-end that a moved doc
is recoverable: cloud version history exists and restores correctly, the synced-folder
projection round-trips, and the original file's last git-tracked state is reachable
(the move commit is itself a backup). Concretely: dogfood apply-mode runs must (a) land
in a commit immediately before the move so git holds the pre-move state, and (b) demo a
restore from Hubble's version history first. Until then, dry-run only.

## The "modify as we go" mechanism (how we dogfood safely)

- The skill lives **in this repo** as a checked-in markdown skill
  (`.claude/skills/hubble-init/SKILL.md` when created), so any dogfood run can edit the
  logic and the change is versioned alongside the observations that motivated it.
- Build order: (1) **dry-run mode first** — scan + triage proposal only, zero writes;
  run it repeatedly on `/brain/` and iterate on the heuristic; (2) then apply-mode
  against a scratch workspace; (3) then the real dogfood (Track C in the roadmap).
- Each dry-run's proposal gets saved under `specs/hubble-init/runs/YYYY-MM-DD-*.md` with
  notes on what the heuristic got wrong.

## Progress contract (decided 2026-07-09 — product default)

Init doesn't just triage; apply-mode **installs the progress contract** into any repo
it runs in:

1. A pointer block in the repo's CLAUDE.md (created if missing): the repo's roadmap
   doc is the single source of "where the build is + what's next"; every session that
   changes the build or direction updates it before ending. **Convention-only — no
   separate progress command** (a reconcile command was considered and rejected
   2026-07-09; add one only if drift actually bites).
2. `AGENTS.md` as a **symlink to CLAUDE.md** so Codex and Claude Code read identical
   instructions (if a real AGENTS.md exists, merge its unique content into CLAUDE.md
   first — dogfood on this repo found the existing AGENTS.md pointing at an archived
   progress tracker, exactly the drift this prevents).
3. The roadmap/next-step doc itself, seeded if the repo has none. Post-split, the
   build-state half of a roadmap stays git-side (learned rule 1), so the pointer
   always resolves inside the repo.

## Gaps in the platform this needs (verified against code 2026-07-09)

1. **Authenticated headless path.** `packages/cli` has `cloud create/connect/import/
   document *` but no auth plumbing — workspaces it creates are anonymous (legacy/test
   semantics in `sync.ts listWorkspaces`). Needs `hubble login` (device flow or pasted
   token, like `packages/mcp-server`'s `HUBBLE_AUTH_TOKEN`).
2. **Headless repo-link.** Mount + `.git/info/exclude` + BRAIN.md seeding live only in
   the Electron main process (`desktopApi.linkRepoFolder`). Extract into a shared
   package (most sync machinery is already in `packages/sync`) or expose via the desktop
   app itself (deep-link/IPC), so the skill can invoke it.
3. **Desktop detection + install.** Platform check for the app bundle; install path
   (download URL / brew cask TBD); first-run sign-in handoff.
4. **Deep link.** `hubble://` protocol registration in the desktop app, routing to a
   folder view.
5. **Folder create API from CLI** (`folders.create`) — exists in backend, needs CLI
   surface.
6. **Multi-repo mount of one brain** (from the 567 dry run 2026-07-09): a brain can
   have external consumers (the 567 iOS repo symlinks `567-platform/brain`). Init must
   detect consumers (sibling-repo symlinks, cross-repo references) and apply-mode must
   re-point them at the synced-folder projection — which means the same cloud folder
   mounted into multiple repos.
7. **Asset-link handling**: binary assets stay in git (decided 2026-07-09); apply-mode
   rewrites or flags asset links in moved docs. No binary hosting required for v1.

## Open design questions

- Does the skill talk to the backend directly (CLI) or drive the desktop app (deep
  links/IPC) for apply-mode? Leaning: CLI for create/upload, desktop for mount+watch.
- Cross-agent portability: skill format for Codex (AGENTS.md-referenced script?) vs
  Claude Code skill — keep the logic in one place both can read.
- Whether `init` also offers to *link only* (no moves) for repos with nothing to triage.
