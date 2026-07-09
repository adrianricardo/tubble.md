# Hubble — Current Vision

> ⚠ **PENDING EXTRACTION** — this is the best *written* approximation of the vision.
> Adrian stated (2026-07-09) there is significantly more in his head, not yet extracted.
> Treat gaps as unknowns, not decisions. See `../admin/pending-extraction.md`.

## One line

A developer runs **init from their coding agent** (Claude Code / Codex) inside a repo;
the agent triages the repo's durable, prose-shaped context into a **repo-linked cloud
folder** ("brain"); a non-technical, agent-native teammate joins via link — no clone, no
git — points their own local agent at the synced projection, and co-creates with the dev
in real time. One cloud authority, one universal watcher bridge, nothing in git.

## The model (locked 2026-07-03, still holds)

`Workspace ⊃ nested Folders ⊃ cloud Docs`. "Brain" is informal for a repo-linked folder —
not a schema entity. Sharing is folder-level with Drive-style inheritance (folder-scoped
guests, not workspace members). Every doc is cloud-only; git-export is a deferred
fast-follow. Full detail: `/specs/realtime-collab/REPO-BRAIN-VISION.md` (Decided #1–15).

## The entry point (revised 2026-07-09 — supersedes Decided #13)

The front door is **not** the desktop app UI; it is an **init skill run inside the
coding agent**:

1. Dev runs `/hubble-init <dir>` (e.g. `brain/`) in Claude Code/Codex from their repo.
2. The agent scans for durable context and proposes a **triage**: *opinion / strategy /
   evolving prose that non-devs need* → moves to the cloud folder; *code-coupled truth*
   (README, CLAUDE.md, ADRs) → stays in git. Dev edits and confirms.
3. The skill ensures the **desktop app** is installed (it is the required sync bridge),
   applies the move, mounts the git-excluded projection, seeds BRAIN.md, and deep-links
   open to the new workspace.

Visual: `/specs/realtime-collab/repo-brain-storyboard.html` (v1.1, scenes 1–3).
Design: `/specs/hubble-init/DESIGN.md`.

## What stands from the earlier vision docs

- Wedge persona: the non-technical, agent-native teammate (Claude Cowork daily driver).
- Dev's payoff: shared, durable agent context — one authority every agent draws from.
- All-cloud for docs (revocability); the watcher is the single universal bridge; the
  desktop app is the local-agent enabler; web is zero-install human editing.

## Timeline

- 2026-07-09 — Agent-init entry point adopted (supersedes REPO-BRAIN-VISION Decided #13
  "no agent-drafted seed flow in v1"); brain system established; extraction pending.
- 2026-07-03 — Repo-brain pivot: repo-first wedge, all-cloud, folder model locked
  (REPO-BRAIN-VISION/RATIONALE, Decided #1–15).
- 2026-06-25..28 — Realtime-collab fork: Live Documents, CRDT authority, synced-folder
  bridge (see `/specs/realtime-collab/archive/`).
