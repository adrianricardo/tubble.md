# Folder rename is a batch path-prefix rewrite in a single mutation

Folders are inferred from [[Markdown File]] path prefixes — no folder table exists. A "folder rename" is therefore a prefix rewrite across every file and asset whose `path` starts with the old prefix, executed as a single Convex mutation so it either fully succeeds or fully fails (no partial-rename split-brain).

## Mutation

```
renameFolderPrefix(workspaceId, oldPrefix, newPrefix, deviceId)
```

1. **Query** all non-deleted files and assets in `workspaceId` whose `path` starts with `oldPrefix`.
2. **Preflight** — for each candidate, compute `newPath = newPrefix + path.slice(oldPrefix.length)`. If any `newPath` collides with an existing non-deleted record (file or asset), reject the entire mutation with the list of collisions. No partial application.
3. **Rewrite** — patch each candidate's `path` to `newPath`, bump `updatedAt`, and set `deviceId`. This preserves the document `_id`, so sync history sees an update — not a delete/create pair.

The mutation runs in a single Convex transaction. Convex mutations are serializable, so concurrent edits that race with the rename will either complete before the rename reads or queue behind it; the rename's preflight catches any resulting collisions.

## Asset paths

Assets follow the `<file-stem>.assets/<hash>.<ext>` convention relative to the file's folder (see `CONTEXT.md` → [[Asset]]). When a file moves from `oldPrefix/note.md` to `newPrefix/note.md`, any asset whose path starts with `oldPrefix/note.assets/` must also be rewritten to `newPrefix/note.assets/`. The mutation handles files and assets in the same transaction.

Markdown body content (relative image links like `./note.assets/abc.png`) does **not** need rewriting because the relative relationship between a file and its `.assets/` sibling is preserved by the prefix rewrite — both move together.

## Collision policy

Reject-all-on-any-collision, returning the full collision list to the caller. Rationale: silent overwrite risks data loss; per-file conflict resolution belongs in a future interactive UI, not in the batch primitive. The caller (UI or sync engine) can present collisions and let the user resolve them before retrying.

## Scope boundaries

- **In scope (this ADR):** backend batch mutation, atomicity, collision preflight, asset path co-rename, sync identity preservation.
- **Deferred:** sidebar expanded-state key migration, compact-folder-row rename UX, markdown body link rewriting beyond the `.assets/` convention, empty-folder preservation (requires first-class folder records or sentinel files — a separate decision).

## Consequences

- Desktop file-rename (which calls `renameFile` on the filesystem then patches the store) is unaffected; this mutation is backend-only and used by the web surface or by desktop sync when cloud sync is on.
- Because Convex mutations are transactional, large folders (thousands of files) may approach mutation size limits. If this becomes a problem, a chunked approach with a server-side "rename in progress" lock can be introduced later without changing the API shape.
- Sync clients that pull via `getFilesByWorkspace(since)` will see the renamed files as updates with new paths and bumped `updatedAt`. No special sync-protocol change is needed.
