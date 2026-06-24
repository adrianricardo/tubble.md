# Live Documents are cloud-authoritative

Hubble currently has file-authoritative editing modes. Desktop Workspace folders,
Plain Folders, and Loose Files are edited through markdown files on disk. Cloud
Sync, when present, reconciles those files with Convex.

Realtime collaboration needs a different authority model. Two humans typing in
the same document, live agent edits, anchored comments, permissions, and
cloud-hosted version history all need a single operational document state with
stable identity. Treating markdown files as the write authority would keep the
system in whole-file reconciliation, where concurrent writes become conflict
files or lossy diffs.

We choose to introduce **Live Documents** as a distinct synced document mode.
For a Live Document, the authoritative state is the cloud ProseMirror/OT document
stored through Convex. Markdown files and markdown strings are projections for
readability, export/import, backup, and legacy tooling; they are not the normal
write authority.

This does not redefine every Hubble editing mode. Local-only Workspace editing,
Plain Folder editing, and Loose File editing remain file-authoritative. A synced
Workspace may contain or map to Live Documents, but enabling realtime
collaboration means accepting the cloud document as the source of truth for those
documents.

## Consequences

- Realtime collaboration can merge simultaneous human edits without conflict
  files for Live Documents.
- Agent edits can target the same document API as humans and stream into the live
  document state.
- Version history, comments, suggestions, and permissions attach to stable Live
  Document IDs instead of mutable file paths.
- Desktop markdown projections of Live Documents must be treated as
  projections/import-export surfaces, not freely writable source-of-truth files.
- Offline Live Document editing is an explicit future capability, not inherited
  from the existing filesystem sync model.
- Existing local-only, Plain Folder, and Loose File workflows keep their current
  file-authoritative semantics.
