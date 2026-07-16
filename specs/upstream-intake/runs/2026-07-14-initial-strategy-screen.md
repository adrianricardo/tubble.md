# Initial upstream strategy screen — 2026-07-14

## Outcome

Established `selective-downstream` as the fork's intake strategy and screened the
existing upstream-only range at product-strategy level. This was a review-only planning
screen: no fetch, cherry-pick, merge, rebase, product-code port, branch landing, push, PR,
or deployment occurred as part of implementing the process.

The fork remains cloud-authoritative with writable watched projections. Textual
mergeability does not override document identity, authority, access, projection,
serialization, revocation, or offline-recovery contracts.

## Starting evidence

- Target branch: `v1-release`
- Target HEAD: `890cb2dbdedccd532c7d354002d25155c16e5860`
- Starting tree: clean
- Upstream: `upstream/main` at `72c9e808cb32bb9c451b6694ced4a8ea6775906f`
- Strategy-screen range: `2a9983b2e94bf8d1596285925dfcee7429f77df7..72c9e808cb32bb9c451b6694ced4a8ea6775906f`
- Merge base: `2a9983b2e94bf8d1596285925dfcee7429f77df7`
- Divergence: 155 fork-only / 243 upstream-only commits
- Paths changed on both sides since the merge base: 35
- Synthetic merge conflicts: 27 conflict events affecting 28 reported paths (the
  `AGENTS.md` distinct-type conflict records both names)

Conflict paths:

- `AGENTS.md`
- `AGENTS.md~upstream_main`
- `apps/desktop/electron/main.ts`
- `apps/desktop/electron/preload.ts`
- `apps/desktop/package.json`
- `apps/desktop/scripts/dev.mjs`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/Sidebar.tsx`
- `apps/desktop/src/components/Toolbar.tsx`
- `apps/desktop/src/desktopApi/types.ts`
- `apps/desktop/src/store/actions.ts`
- `apps/desktop/src/store/persistence.ts`
- `apps/desktop/src/store/state.ts`
- `apps/www/src/screens/ConnectScreen.tsx`
- `apps/www/src/screens/OpenWorkspaceScreen.tsx`
- `apps/www/src/shell/AppShell.tsx`
- `package.json`
- `packages/cli/package.json`
- `packages/editor/src/Link.ts`
- `packages/editor/src/markdownToProsemirror.ts`
- `packages/editor/src/prosemirrorToMarkdown.ts`
- `packages/ui/src/editor/EditorView.css`
- `packages/ui/src/editor/EditorView.tsx`
- `packages/ui/src/editor/SlashCommandMenu.tsx`
- `packages/ui/src/editor/slashCommandActions.ts`
- `packages/ui/src/index.ts`
- `pnpm-lock.yaml`
- `skills-lock.json`

## Strategy-level dispositions

The initial screen grouped the 243-commit range by behavior rather than treating merge
commits as independent features.

| Cluster | Disposition | Rationale |
| --- | --- | --- |
| Release notes, changelog-only work, upstream CI/automation, and repository housekeeping with no fork value | `skip` | Does not improve fork behavior; upstream automation is not this fork's release process. |
| Terminal/chat and other large new product surfaces | `skip` | Outside the selected product direction and unsuitable for automatic intake. |
| Local-workspace sidebar and standalone local-authority behavior | `skip` | Conflicts with NAV-13 and the one-cloud-authority model. |
| Behavior already covered by the fork's cloud collaboration, projection safety, or serializer work | `superseded` | Preserve the fork's stronger semantics; import only a missing focused regression when proven. |
| Major product candidates listed below | `defer-product` | Require an explicit roadmap decision and remain queued for visibility. |
| Correctness/portability/accessibility candidates listed below | `blocked` | Worth behavior-level evaluation, but dependencies and current fork equivalence must be inspected before adoption or reimplementation. |

This strategy screen is the durable disposition for the historical range. The queue
retains the only clusters requiring a later behavior-level decision so the watermark can
start at upstream HEAD without losing them.

## Seeded candidate queue

| Candidate | Upstream commit(s) | Strategy disposition | Next review |
| --- | --- | --- | --- |
| UTF-8 desktop save safety | `c99e80df037868514270ca8a7286b0569c125d61` | `blocked` | Compare tests and reimplement in current save paths if missing. |
| Editor and sync edge hardening | `60905b68dd3f0a144ad4f7cbf6f8649b1e1024ae` | `blocked` | Split into individual behaviors; never cherry-pick the mixed commit. |
| Mixed image/text Markdown preservation | `fed659c5bc93828b7ce2b90ff92cd558e72b86da` | `blocked` | Compare current round-trip coverage before selecting reimplementation. |
| Rich-text link clipboard serialization | `66a1787424e754531541a72cf15d7da1cd320c8a` | `blocked` | Evaluate behavior and focused tests in current editor abstractions. |
| macOS native text context menu and caret spellcheck | `9732d4b30e04a81db3bfaea40bc090e8d0faa248`, `7fa5dffe04fa08b5fa9ea27e91a10bc6bdcc81c2` | `blocked` | Evaluate as one accessibility/native-shell cluster. |
| Cloud-sync asset failure handling | `df7560f85f3497045c47dfded4e37c6203a85e46` | `blocked` | High semantic risk; compare projection/asset recovery before reimplementing or declaring superseded. |
| Editor block spacing | `f6c44a2436df6e3eeed55636cca85bec885d1da0` | `blocked` | Small visual candidate; inspect current UI and focused visual coverage. |
| Emphasis/Markdown serializer consolidation | `7d290971ad08634448ebfaa6bd71c16dd1925ddd` | `blocked` | Likely superseded; import only missing regression tests. |
| Global search | `f445c32e69476539019a4a37e142f4c655193917` | `defer-product` | Report-only until the roadmap selects it. |
| Back/forward navigation | `51447b7371a56af9a158f5a517a93c271784ac3a` | `defer-product` | Report-only until the roadmap selects it. |
| Source mode | `e361781bf4c5772a60763c5573090079621f058f` | `defer-product` | Report-only until the roadmap selects it. |
| System-follow dark mode | `2a812ae93529100affdd94855b99a12c99f9fbde` | `defer-product` | Report-only until the roadmap selects it. |
| Editor find bar | `03b7de86474bcba07c349fcec1f84e63dd852201` | `defer-product` | Report-only until the roadmap selects it. |

## Application and verification

- Applied/manual-port mappings: none
- Product-code tests/builds: not applicable; no product code changed
- Result: review-only strategy record
- Landed: no intake result existed to land
- Unresolved: every candidate above remains in `state.json` until a later run records a
  final behavior-level disposition

## State watermark

- Before: no repo-owned upstream intake state
- After: `72c9e808cb32bb9c451b6694ced4a8ea6775906f` (`2026-07-14`)

The watermark means the historical range received this strategy-level screen. It does
not claim adoption of any upstream commit.
