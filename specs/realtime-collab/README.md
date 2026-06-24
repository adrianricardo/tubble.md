# Realtime Collaboration Fork

This folder is the self-contained context packet for the realtime-collab fork:
what changed, why it changed, what decisions have been made, and how to continue.

For implementation pickup, start with **`PROGRESS.md`**. It is the task tracker
and source of truth for what is done, in flight, blocked, and next.

## Files

- **`PROGRESS.md`** — execution tracker. Read this first when continuing work.
- **`PRODUCT.md`** — product direction and staged user-facing outcomes.
- **`TECH.md`** — architecture, data model, risks, and stage mapping.
- **`DECISIONS.md`** — concise decision log and reasoning for the fork.
- **`SPIKE.md`** — `@convex-dev/prosemirror-sync` spike findings and remaining
  validation.

## Current Direction

Hubble keeps its existing file-authoritative editing modes for local-only
Workspaces, Plain Folders, and Loose Files.

The fork introduces **Live Documents** as a distinct synced document mode. For a
Live Document, the authoritative state is the cloud ProseMirror/OT document stored
through Convex. Markdown becomes a projection/import/export surface for those
documents, not the normal write authority.

That split lets the fork pursue Google-Docs-style realtime collaboration without
breaking Hubble's existing desktop filesystem semantics.

## Share-Back Story

The short version for the original repo creator:

1. The existing system is file-authoritative and whole-file synced, which cannot
   safely merge simultaneous edits.
2. Realtime collaboration needs a stable cloud document identity and operational
   edit stream.
3. We introduced the Live Document concept so cloud-authoritative collaboration is
   scoped to synced realtime documents only.
4. We provisionally adopted Convex `@convex-dev/prosemirror-sync` because it fits
   the existing Convex + Tiptap stack and supports server-side transforms needed
   for future AI collaborators.
5. Remaining Stage 1 proof points are live two-browser merge, presence/cursors,
   POC identity, agent edit demo, and doc-size measurement.

Repo-level architecture decisions still live in `docs/adr/`; the Live Document
authority decision is recorded there as ADR-0009 and summarized in
`DECISIONS.md` for this fork packet.
