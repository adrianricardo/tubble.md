# Open Questions

- **The big one — vision extraction (blocking large UX build-outs).** Adrian has
  substantially more vision/UX direction in his head than is written (2026-07-09). Needs
  an InterviewMe-style extraction session; until then, `current-vision.md` is partial.
  Tracked in `../admin/pending-extraction.md`.
- **Init-skill triage logic quality gate.** What does "we feel good about the logic"
  mean concretely before dogfooding? Proposed: a dry-run mode (propose-only, no writes)
  that we run on this repo's `brain/` and iterate on — see `/specs/hubble-init/DESIGN.md`.
- **Eventual product name.** Resolved that "huddle" was a typo and hubble stands *for
  now* — but Adrian intends to rename eventually (2026-07-09). What's the name, and
  when? Avoid baking "hubble" into expensive-to-change surfaces meanwhile.
- **Version-history trust (gates the split dogfood).** Does Hubble's cloud version
  history + restore actually protect against data loss well enough to move real
  strategy docs out of git? Needs a verification pass (see DESIGN.md §Safety gate).
- **Headless/authenticated repo-link path.** The CLI is unauthenticated and mount logic
  lives only in the Electron main process — required for init (see DESIGN.md §Gaps).
- **Should the Hubble product ship a brain-keeper maintenance agent** (post-init upkeep
  of the cloud folder), or is BRAIN.md + human/agent editing enough? Deferred fast-follow.
- Carried from REPO-BRAIN-VISION.md (2026-07-03, still open): Cowork↔folder launch
  ergonomics; non-technical desktop onboarding; web-first front door coexistence;
  git-export design.
