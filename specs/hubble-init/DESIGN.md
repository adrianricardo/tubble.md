# hubble-init — Design (draft)

The agent-run front door: `/hubble-init <dir>` inside Claude Code / Codex triages a
repo's durable context into a repo-linked Hubble cloud folder, ensures the desktop app
(the sync bridge), and deep-links into the new workspace.
Vision: `/brain/synthesized/current-vision.md`. Visual: the v1.1 storyboard, scenes 1–3.

**Status: apply-mode built and executed once for real** — first apply run split
`567-platform/brain` into the "567 Brain" workspace on dev (2026-07-09, run record
`runs/2026-07-09-567-brain-apply-run.md`). Magic-flow Phases 1+2 landed AND were
live-verified 2026-07-11 (`runs/2026-07-11-magic-flow-live-acceptance.md`):
`hubble login` device-flow auth and the zero-click live link (`hubble mount` →
desktop CLI socket); this repo's `brain/cloud/` is a live mount. Phases 3–4 open;
new gaps #11–12 from the acceptance run.

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

1. **Authenticated headless path.** *Closed 2026-07-11:* the CLI keeps the existing
   `--auth-token` / `HUBBLE_AUTH_TOKEN` / `CONVEX_AUTH_TOKEN` override path, and now
   supports `hubble login` device-flow auth. The CLI stores a Convex Auth refresh
   token in `~/.hubble/credentials.json`, exchanges it through `auth:signIn` for fresh
   JWTs, and rotates the refresh token on each command. Apply-mode creates workspaces
   as the user instead of minting temporary accounts.
2. **Headless repo-link.** *Closed 2026-07-11 (magic-flow Phase 2):* the desktop app
   exposes a 0600 Unix command socket (`<userData>/cli.sock`, NDJSON `status` +
   `link-repo`) that runs the same repo-link path as the settings form, and `hubble
   mount` drives it end-to-end — auto-launching the app, guarding
   deployment/account mismatch, and exiting 0 only after the app reports the mount
   connected and the sync index is materialized. `hubble cloud folder export` now
   writes a `.hubble-export.json` marker so a static projection can never
   masquerade as a live mount; the link flow deletes the marker on takeover.
3. **Desktop detection + install.** *Implemented 2026-07-11; packaged acceptance
   pending:* `hubble ensure-desktop` detects or opens the macOS app, asks before an
   install, downloads the architecture-specific artifact and verifies its release
   size plus SHA-256 manifest, installs into `/Applications`, and signs the app in
   through a two-minute single-use Convex Auth handoff code. A manually dispatched
   GitHub workflow owns the mutable `desktop-dev-latest` release channel. The code,
   unit tests, and desktop/CLI builds pass; publishing that channel and exercising the
   complete path on a machine without Hubble remain operator acceptance gates.
4. **Deep link.** *Registration closed 2026-07-11:* the desktop app registers
   `hubble://` (electron-builder protocols entry + `open-url`/second-instance
   routing into `handleProtocolUrl`). Routing to a folder view remains open — the
   dispatcher currently focuses the window and logs unrecognized routes.
5. **Folder create API from CLI** — *closed 2026-07-09:* `hubble cloud folder
   create/list/export` and `cloud document create` shipped.
6. **Multi-repo mount of one brain** (from the 567 dry run 2026-07-09): a brain can
   have external consumers (the 567 iOS repo symlinks `567-platform/brain`). Init must
   detect consumers (sibling-repo symlinks, cross-repo references) and apply-mode must
   re-point them at the synced-folder projection — which means the same cloud folder
   mounted into multiple repos.
7. **Asset-link handling**: binary assets stay in git (decided 2026-07-09); apply-mode
   rewrites or flags asset links in moved docs. No binary hosting required for v1.
8. **Markdown fidelity** (found by the first apply run's export-diff): Live Documents
   silently dropped GFM tables — fixed (`65c21c6`, editor schema + round-trip).
   *Closed 2026-07-10:* serializer is now idempotent — nested-emphasis divergence
   (mark-run serialization replaces per-text-node wrapping), lone `~` doubling
   (`singleTilde: false`), YAML frontmatter round-trips verbatim (opaque
   `frontMatter` node; frozen decision: no structured editing v1), bare
   URLs/emails keep their source style. `packages/editor/src/roundTrip.test.ts`
   is the regression corpus. Residual: four app call sites pre-strip frontmatter
   and should adopt the new path (`packages/ui` EditorView ×2, desktop
   `App.tsx`, www EditorView); escaping normalizes some equivalent syntax
   (`_x_` → `*x*`) — idempotent but not byte-identical on first cycle.
   Apply-mode's verify-before-delete diff remains the permanent guard.
9. **Workspace ownership transfer.** *Closed for init 2026-07-11:* `hubble login`
   lets init create the workspace as the user directly, so the apply flow no longer
   needs temporary-account handoff. Single-ownership transfer/claim semantics remain a
   broader account-management question, not an init blocker.
10. **Folder shares are invisible in the desktop app.** The sidebar's shared-with-me
    section renders only legacy per-document shares (`Sidebar.tsx` uses
    `sharedWithMe.documents`, ignores `.folders`), and RepoLinkSection's workspace
    picker lists member workspaces only — a folder-shared user can neither see nor
    mount the folder. Found during the apply run's handoff.
11. **Projection naming split.** *Closed at code/test level 2026-07-11:* document
    `path` is now the canonical projection filename for both the desktop
    materializer and `hubble cloud folder export`, with title fallback for legacy
    pathless documents. Existing mounts migrate through the document-ID rekey path;
    live dogfood verification remains part of the next acceptance pass.
12. **Materialize↔ingest duplication loop.** *Closed at code/test level
    2026-07-11:* watcher events now wait for an in-flight materialize pass to install
    its reverse index and self-write hashes before classification. A regression test
    pauses the materializer mid-write and proves the resulting `add` is not imported.
    Original failure (found 2026-07-11 live acceptance):
    creating a cloud doc whose title differs from its path-derived filename, in a
    live-mounted folder, made the mount engine ingest its own materialized
    title-named file as a new local doc, re-materialize under "(2)", and repeat —
    6 cloud copies before stabilizing.

## Open design questions

- Does the skill talk to the backend directly (CLI) or drive the desktop app (deep
  links/IPC) for apply-mode? Leaning: CLI for create/upload, desktop for mount+watch.
- Cross-agent portability: skill format for Codex (AGENTS.md-referenced script?) vs
  Claude Code skill — keep the logic in one place both can read.
- Whether `init` also offers to *link only* (no moves) for repos with nothing to triage.
