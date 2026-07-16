# Open Questions


- **Folder-authority UX validation.** Test whether “Stored in Git” versus “Stored in
Hubble Cloud” is legible at folder boundaries; whether users correctly predict the
collaboration, web-visibility, access, and Git working-tree consequences of each move;
and whether a nested selective move still feels like one tree rather than two content
systems. Contract: `/specs/folder-authority-mobility/PRODUCT.md`.
- **Cloud history after moving to Git.** Is recoverable cloud Trash sufficient, or do
users need an optional durable history archive before Hubble relinquishes authority?
The current UX contract requires recoverability but does not prescribe permanent cloud
retention.
- **The big one — vision extraction (blocking large UX build-outs).** Adrian has
substantially more vision/UX direction in his head than is written (2026-07-09). Needs
an InterviewMe-style extraction session; until then, `current-vision.md` is partial.
Tracked in `../admin/pending-extraction.md`.
- **Cloud-projection UX assumptions to validate.** Within a cloud-authoritative folder,
test whether “available on this computer” is understood as a local projection rather
than Git authority; whether access-changing filesystem confirmation feels causal; and
whether recovery controls are discoverable without permanent healthy-sync chrome.
- **Local empty-folder lifecycle.** Should creating, renaming, moving, or deleting an
empty directory inside a projection create/mutate a cloud folder immediately, or are
folders materialized only when they contain a document? This must be decided before the
filesystem operation planner is implemented.
- **Recovery-control minimum.** Which pending/recovery views are required for v1 beyond
the foreground confirmation modal, root-level status, tray entry, and detached-copy
recovery? Validate through the packaged-app failure matrix rather than adding a generic
sync dashboard pre-emptively.
- **Init-skill triage logic quality gate.** What does "we feel good about the logic"
mean concretely before dogfooding? Proposed: a dry-run mode (propose-only, no writes)
that we run on this repo's `brain/` and iterate on — see `/specs/hubble-init/DESIGN.md`.
- **~~Version-history trust (gates the split dogfood).~~** **Resolved 2026-07-09: yes,
safe to move data** for agent/file paths — verified live (snapshot-before-every-patch,
restore, soft-delete trash, no pruning). Remaining caveats tracked in
`/specs/hubble-init/VERIFICATION-version-history.md`: ~60s live-typing revision
granularity; re-verify on prod once deployed.
- **Headless/authenticated repo-link path.** The CLI is unauthenticated and mount logic
lives only in the Electron main process — required for init (see DESIGN.md §Gaps).
- **Should the Hubble product ship a brain-keeper maintenance agent** (post-init upkeep
of the cloud folder), or is BRAIN.md + human/agent editing enough? Deferred fast-follow.
- Carried from REPO-BRAIN-VISION.md (2026-07-03, still open): Cowork↔folder launch
ergonomics; non-technical desktop onboarding; web-first front door coexistence.
