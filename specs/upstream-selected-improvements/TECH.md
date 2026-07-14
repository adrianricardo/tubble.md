# Upstream-selected editor and sidebar improvements — technical plan

## Context

This plan records the improvements selected during the 2026-07-14 upstream intake.
It is planning-only: no product code was ported in the intake run that created this
document.

The implementation base inspected for this plan is
`a544bc1b43b23202596de36a8ebeaa0de7428b3c`. Upstream was fetched at
`72c9e808cb32bb9c451b6694ced4a8ea6775906f`.

The selected work has three goals:

1. bring over approved editor, persistence, save, and sync correctness behavior;
2. make editor block spacing less crowded, using upstream's latest spacing as the
   visual starting point; and
3. bring the useful interaction shape of upstream's sidebar into Hubble's current
   cloud-authoritative tree: clear create buttons and an actions menu on each folder
   and document row.

The governing product behavior is already specified by
`specs/desktop-cloud-workspace/PRODUCT.md`, especially NAV-1 through NAV-13,
CREATE-1 through CREATE-7, MOVE-1 through MOVE-11, DELETE-1 through DELETE-10, and
A11Y-1 through A11Y-6. ADR-0010 keeps cloud IDs and cloud authority canonical while
ordinary Markdown remains a writable projection. The sidebar work must extend
`packages/cloud-ui/src/CloudContentTree.tsx`; it must not port upstream's
filesystem-path tree or restore a local-authority navigation mode.

Relevant current modules:

- `packages/cloud-ui/src/CloudContentTree.tsx` assembles the current-context folder and
  document tree from Convex queries, implements scoped title search and keyboard tree
  navigation, and exposes local-availability actions only where a direct projection
  exists.
- `apps/desktop/src/components/Sidebar.tsx` owns desktop context selection,
  permission-derived create capability, local-availability actions, and document
  opening.
- `apps/desktop/src/components/CloudDocumentCreateButton.tsx` already implements the
  destination/audience step required for global creation.
- `packages/sync-backend/convex/folders.ts` provides permission-checked folder CRUD,
  document relocation preparation/confirmation, and exact audience/repository impact.
- `packages/sync-backend/convex/documents.ts` provides permission-checked document
  creation, rename, soft removal (Trash), and restore.
- `packages/ui/src/editor/EditorView.css` owns shared editor block rhythm for desktop
  and web.
- `packages/editor` owns Markdown parsing/serialization and editor extensions.
- The legacy `packages/ui/src/components/Sidebar.tsx` remains useful as an interaction
  reference only; it is not the target component for the cloud sidebar.

Upstream behavior references:

- [`f6c44a2` editor block spacing](https://github.com/bholmesdev/hubble.md/commit/f6c44a2436df6e3eeed55636cca85bec885d1da0)
- [`416564a` inline folder creation](https://github.com/bholmesdev/hubble.md/commit/416564a48e1edd122dc62b91441a094a115475cd)
- [`3023212` keep a new folder visible while naming](https://github.com/bholmesdev/hubble.md/commit/3023212f58fc0c38ea60277af254fd9207e11714)
- [`9d5f42c` selection-aware row menus](https://github.com/bholmesdev/hubble.md/commit/9d5f42c6e8d963d0480f832b5228605077fbb50f)
- [`e38be95` sidebar group actions](https://github.com/bholmesdev/hubble.md/commit/e38be95144a4f44c7bc365989d61f71062eafce2)

Preserve upstream attribution with an `Upstream-commit:` trailer on every manual port.
Do not cherry-pick these commits: their local-path identity and deletion assumptions do
not fit the fork.

## Affected apps and packages

### `packages/editor`

Add or adapt regression coverage and small editor extensions for mixed image/text
Markdown, adjacent link ranges, rich-text clipboard links, nested emphasis properties,
and macOS caret spellcheck. Export only reusable editor behavior; keep Electron shell
code out of this package.

### `packages/ui`

Apply the selected editor rhythm in `EditorView.css`, register approved editor
extensions in `EditorView.tsx`, and add focused rendering/clipboard tests. Preserve
the fork's frontmatter, bare-link/autolink, table, embed, and remote-presence behavior.

### `packages/cloud-ui`

Own the cloud-tree action model and presentation. Add capability-aware create controls,
row action menus, rename/name dialogs, and destination selection. Keep this package
surface-agnostic by accepting callbacks or using existing Convex mutations consistently;
do not introduce Electron APIs here.

### `apps/desktop`

Wire desktop-only native text services and shell context menus. Pass current-context
roles/capabilities and local-availability actions into the cloud tree. Reuse existing
dialogs for relocation/Trash where their contracts match.

### `packages/sync`

Harden the retained legacy asset-sync path so failed HTTP responses never become
successful sync state. Report per-asset failure without discarding local bytes. This
does not broaden binary-asset support in direct cloud projections.

### `packages/cli`

Surface the asset failure result from `packages/sync` without terminating the scheduler
or claiming success. No new command or configuration is required.

## Module architecture

### Correctness boundary

Keep each behavior as a dependency-sized change with its own regression test:

- Electron preload encodes text to UTF-8 bytes; main validates and writes those bytes.
- Renderer save classification recognizes its own in-flight writes without overwriting
  newer editor content.
- Markdown parsing splits mixed image/text paragraphs into schema-valid block nodes
  without losing the image or surrounding text.
- Link range expansion compares the complete link identity, including the fork's
  `markdownStyle`, so adjacent different links never merge.
- A clipboard serializer emits ordinary `<a>` elements for external consumers while
  retaining Hubble wiki-link metadata for Hubble-to-Hubble paste.
- List conversion accumulates whether any list item changed instead of overwriting the
  result on every iteration.
- local-storage reads and writes treat browser quota/security exceptions as a failed
  persistence side effect, not a failed in-memory state change.
- Asset fetch helpers check `Response.ok`; failed paths remain out of the advanced sync
  baseline and are reported explicitly.
- Electron owns the macOS menu and spelling suggestions; an editor extension expands a
  secondary-click at the caret to the adjacent Unicode word.

Do not replace the fork's serializer wholesale. First run upstream's emphasis and
seeded round-trip cases against the current serializer. Retain the current implementation
when they pass; port only missing regression cases or the smallest failing behavior.

### Cloud sidebar action model

Introduce a typed action model derived from node kind, current context, effective role,
and direct local availability. A suitable shape is:

```ts
type CloudTreeCapabilities = {
  canCreate: boolean;
  canWriteDocument(documentId: string): boolean;
  canWriteFolder(folderId: string): boolean;
  canShareFolder(folderId: string): boolean;
};

type CloudTreeAction =
  | "create-document"
  | "create-folder"
  | "rename"
  | "move"
  | "trash"
  | "share"
  | "reveal-local"
  | "copy-local-path"
  | "relocate-local"
  | "stop-local";
```

The exact representation may change during implementation, but availability must be
computed once and consumed by both pointer menus and keyboard behavior. Hidden or
disabled actions must match backend authorization; the backend remains authoritative.

`CloudContentTree` should expose one menu trigger per actionable row. Folder local-
availability actions become one group inside the folder menu rather than a separate,
competing ellipsis. The trigger appears on hover and focus-within, remains reachable by
keyboard, and opens through Shift+F10 or the Context Menu key. Menu focus returns to the
origin row after dismissal.

### Mutation flows

- **Create document in folder:** call `api.documents.create` with the folder's ID and
  open the returned document. This inherits access and satisfies CREATE-1 through
  CREATE-3.
- **Create folder:** call `api.folders.create` with the current Workspace and optional
  parent folder. Shared-folder guests may create only where the backend confirms
  editor/owner capability. Expand the parent and focus the created folder.
- **Rename:** use `api.documents.rename` or `api.folders.rename`. Preserve document
  path semantics: if changing title should also change the projected filename, use the
  existing path validation/collision rules rather than silently coupling title and
  path.
- **Move document:** use `api.folders.prepareDocumentRelocation`. Complete immediately
  only on `completed`; on `confirmation-required`, show the exact people/public/repo
  impact and call the confirmation mutation with its fingerprint. Never call the
  lower-level `moveDocument` mutation directly from the new menu.
- **Trash:** use the existing soft-remove mutations and label the action **Move to
  Trash**, not Delete. Provide the existing durable Trash/restore path and an announced
  Undo where already supported. Do not add folder/bulk destructive shortcuts in this
  slice.
- **Local availability:** preserve the existing reveal/copy/relocate/stop flows and
  show them only for the directly available folder/root, never inherited descendants.

## Detailed plan

### Milestone 1 — Land the approved correctness batch

1. Add failing tests for the fork's current behavior before changing implementation.
2. Reimplement UTF-8 byte transfer and in-flight self-save classification from
   `c99e80df037868514270ca8a7286b0569c125d61`. Include multibyte text (accented Latin,
   CJK, and emoji) and a delayed-write/newer-draft race.
3. Split `60905b68dd3f0a144ad4f7cbf6f8649b1e1024ae` into independent fixes: local-storage
   exceptions, adjacent link attributes, list change accumulation, asset HTTP status,
   and any editor debounce regression not already fixed. Do not port its source-mode
   dependency.
4. Reimplement mixed image/text block preservation from
   `fed659c5bc93828b7ce2b90ff92cd558e72b86da`. Cover image-before-text,
   text-before-image, text on both sides, and multiple images.
5. Adapt the rich-text clipboard behavior from
   `66a1787424e754531541a72cf15d7da1cd320c8a`. Preserve `kind`, `target`, and
   `markdownStyle` on internal round trips while producing interoperable anchors.
6. Reimplement macOS native text context menus and caret spellcheck from
   `9732d4b30e04a81db3bfaea40bc090e8d0faa248` and
   `7fa5dffe04fa08b5fa9ea27e91a10bc6bdcc81c2`. Gate platform-specific menu behavior
   where Electron requires it; keep Unicode word-range tests platform-independent.
7. Adapt asset failure reporting from
   `df7560f85f3497045c47dfded4e37c6203a85e46` without recording a failed transfer in
   sync state or weakening projection recovery.
8. Run the upstream emphasis/property tests against the fork. Classify
   `7d290971ad08634448ebfaa6bd71c16dd1925ddd` as superseded if all invariants pass;
   otherwise port only the failing invariant and test.

Commit each coherent behavior separately with its upstream trailer and focused test
result. This makes later regression bisection and selective reversal possible.

### Milestone 2 — Adopt the roomier editor rhythm

1. Start from upstream `f6c44a2` rather than tuning arbitrary numbers from scratch:
   use a `0.75em` default block gap and a larger gap before headings.
2. Preserve current fork additions omitted upstream, especially `.tableWrapper`,
   realtime presence, file properties, task controls, and embed/code-block node views.
3. Restore rhythm inside blockquotes, list items, and table cells after the global
   margin reset. Use logical CSS properties only.
4. Carry over the clearer h5/h6 hierarchy, muted list markers, theme-safe blockquote
   color, and horizontal-rule treatment if they hold up in both themes.
5. Verify the same stylesheet in desktop and web at narrow, default, and wide editor
   widths. Treat visual acceptance—not textual patch similarity—as the gate.

### Milestone 3 — Add cloud-context create controls

1. Keep the existing top-level new-document button and add a sibling **New folder**
   button when the effective role can create at the current context root.
2. Add folder-row actions for **New document** and **New folder**. Creating inside a
   folder bypasses the global destination chooser because the row already supplies the
   destination and inherited audience.
3. Reuse the existing destination/audience dialog for global document creation in a
   multi-member Workspace. Do not regress shared-root creation semantics.
4. Use a small reusable name dialog (or inline naming only if it preserves focus and
   error recovery more cleanly) for folder creation. After success, expand ancestors,
   focus the new row, and keep it visible while naming.
5. Keep buttons compact and discoverable through tooltip, accessible name, hover, and
   focus. Do not add a second section header or separate folder tree.

### Milestone 4 — Add per-row cloud action menus

1. Refactor the existing availability-only menu into a general `CloudTreeActionsMenu`
   with folder, document, and local-availability groups.
2. Document menu, initial slice: **Rename**, **Move…**, and **Move to Trash**. Add local
   path actions only if the document can be resolved to a directly managed projection;
   otherwise do not invent a filesystem path.
3. Folder menu, initial slice: **New document**, **New folder**, **Rename**, **Share**
   where already supported, **Move to Trash**, followed by local-availability actions
   for a directly available folder.
4. Use the safe relocation preparation/confirmation flow for document moves. Defer
   folder move UI until it can provide the same exact audience/repository impact; the
   current low-level folder move mutation is not sufficient for MOVE-4 through MOVE-10.
5. Translate permission failures and stale context into accurate toasts/dialog states,
   then let reactive queries refresh the tree. Never optimistically remove cloud nodes
   before mutation success.
6. Preserve roving tree focus and selection across rename, creation, reactive reorder,
   menu close, Trash, and move. Right-click should select/focus the invoked row before
   opening its menu.

### Milestone 5 — Integrate and polish

1. Test all actions in a member Workspace, editor-shared root, viewer-shared root, and
   directly locally available folder.
2. Confirm no menu exposes inaccessible ancestors/siblings in a shared context.
3. Confirm healthy projection sync remains quiet and menu operations do not create a
   second local navigation representation.
4. Run simplify, comments review, and review-readiness before handoff.

## Testing and validation

### Unit and package tests

- `packages/editor`: UTF-8 fixtures where applicable, mixed image/text Markdown,
  adjacent differing link attributes, rich clipboard HTML/wiki metadata, Unicode
  caret word ranges, list conversion, and seeded emphasis round trips.
- `packages/sync`: rejected upload/download HTTP responses, partial asset success,
  unchanged baseline for failed assets, and retry on the next sync.
- `packages/cloud-ui`: capability-to-action mapping, current-context root behavior,
  create destination, row menu contents, direct-only local actions, focus restoration,
  keyboard menu invocation, and reactive tree updates.
- `packages/sync-backend`: retain/create focused permission tests for folder creation,
  rename, Trash, and relocation prepare/confirm. No Convex migration is expected.
- `apps/desktop`: preload byte encoding, main-process byte validation, self-save race,
  native context-menu template, and sidebar callback wiring.

### Repository checks

During each milestone:

```sh
pnpm --filter @hubble.md/editor test
pnpm --filter @hubble.md/ui test
pnpm --filter @hubble.md/cloud-ui test
pnpm --filter @hubble.md/sync test
pnpm --filter @hubble.md/desktop test
pnpm check
```

Before final confidence:

```sh
pnpm build:desktop
```

Use changed-file Biome checks when repository-wide `pnpm check` is blocked by known,
unrelated mounted metadata; record the exact blocker rather than claiming a clean full
check.

### Packaged UI acceptance

1. Open a populated member Workspace in packaged desktop. Confirm the top row has
   compact New document and New folder controls without adding another content tree.
2. Create a root folder, a nested folder, and documents in both. Confirm the intended
   parent expands, the new item is visible/focused, and exactly one cloud object exists.
3. Open folder and document menus by pointer, Shift+F10, and the Context Menu key.
   Confirm labels, focus, Escape behavior, and role-based action availability.
4. Rename a document and folder. Confirm stable IDs, live editor continuity, projected
   path behavior, and no duplicate tree row.
5. Move a document within the same audience boundary, then across an audience or repo
   boundary. Confirm the first completes quietly and the second shows exact impact and
   waits for approval.
6. Move a document to Trash, use Undo/restore, and confirm reactive removal/restoration
   on both desktop and web.
7. Repeat creation/menu inspection as a shared-folder editor and viewer. The editor is
   limited to the visible subtree; the viewer receives no write controls.
8. In a directly available folder, verify folder local actions remain present and an
   external Markdown edit still reconciles after sidebar mutations.
9. Open a document containing headings, paragraphs, lists, nested lists, blockquotes,
   tables, horizontal rules, code blocks, images, frontmatter, and remote presence.
   Compare desktop and web in light and dark themes and confirm the rhythm is roomier
   without breaking nested layout.
10. On macOS, right-click a misspelled word at and away from the caret. Confirm spelling
    suggestions, replacement, Add to Dictionary, Writing Tools/text services, and
    ordinary edit actions.

## Risks and mitigations

- **Local-sidebar assumptions leak into cloud navigation.** Reimplement in
  `CloudContentTree` using cloud IDs and existing Convex mutations; do not import path
  keys, filesystem deletes, multi-select bulk deletes, or local folder authority.
- **Menus bypass consequential-move safety.** Route document moves exclusively through
  prepare/confirm relocation; defer folder moves until equivalent impact support exists.
- **Rename changes projected filenames unexpectedly.** Decide title/path behavior at
  the existing collision-safe document API boundary and test both cloud-only and
  directly projected documents.
- **Reactive updates lose keyboard focus.** Track focus by stable cloud ID and explicitly
  restore/fallback after mutation-driven reorder or removal.
- **Clipboard serialization drops fork metadata.** Extend upstream tests with
  `markdownStyle`, bare URLs, autolinks, and wiki links before enabling the extension.
- **Asset failure handling reports success.** Never advance failed asset state; expose
  failed paths and verify retry behavior.
- **Spacing fixes one surface but regresses another.** The shared stylesheet requires
  desktop and web visual acceptance, both themes, nested blocks, and node views.

## Parallelization

This plan can be implemented by three isolated workers after Milestone 1's test matrix
is agreed:

- editor correctness and native text behavior (`packages/editor`, editor portions of
  `packages/ui`, Electron context-menu code);
- sync/persistence/save hardening (`packages/sync`, `packages/cli`, desktop preload/main
  and store tests); and
- cloud sidebar controls (`packages/cloud-ui`, desktop sidebar wiring, focused Convex
  tests).

The spacing pass should follow editor correctness because it shares `EditorView.css` and
packaged-editor acceptance. Integrate by dependency-sized commits onto one implementation
branch; do not merge broad worker branches wholesale when their files overlap.

## Deferred product candidates

The intake did not select global search palette, back/forward navigation, source mode,
system-follow dark mode, or the editor Find bar. Current-context title search already
exists. Keep those candidates deferred until their priority is explicitly ranked; do
not let this plan's sidebar work silently expand into them.
