# Track Strategy / Sequencing

Strategy and sequencing for the Git-authoritative product brain. Build state and the
NEXT STEP block live in `roadmap.md`.

## Public-launch focus (2026-07-15)

The next milestone is now a public “try it today” launch, not completion of every
open product or acceptance thread. The launch must use a distinct name, explain the
fork and its additions, provide an explicitly best-effort hosted account path, and
prove an independent-deployment guide from a clean clone.

Sequence work by public promise: freeze the name, launch surfaces, trial boundary,
and supported deployment topology; establish identity/story; prove independent
deployment; prepare the hosted trial; then run only the acceptance gates required by
retained public claims. Adrian fixed the topology as operator-owned managed Convex and
the surfaces as hosted web plus macOS. Because macOS provides local agent access, its
distribution, first-run trust, independent-deployment targeting, and focused
cross-device round trip are universal launch gates. Selective-authority cutovers and
deep recovery are outside the initial announcement and do not block it. The launch
name is Tubble.md, intentionally replaceable; mutable public brand values must be
centralized. The full scope filter and backlog are in
`/specs/public-try-it-today-launch/PLAN.md`.

## Direction correction (2026-07-15)

The split dogfood is complete and reversed for this corpus. It proved cloud import,
projection, version history, and local-agent access, but also falsified the assumption
that evolving prose should move to cloud authority by default. Git is now the default;
Hubble Cloud is selected per folder for realtime collaboration or access/privacy that
must not follow the repository.

The next product-planning slice is the technical plan for
`/specs/folder-authority-mobility/PRODUCT.md`, including reconciliation with the
already-implemented universal-cloud UI and projection work. Do not continue polishing
the mandatory-cloud onboarding journey as if the authority decision were unchanged.

## Parallel tracks (agreed 2026-07-09)

1. **Track A — Brain/doc system** ✅ in place (this directory). Ongoing: file new
material per `brain/BRAINKEEPER.md`; keep `current-vision.md` honest.
2. **Track B — hubble-init skill.** Design in `/specs/hubble-init/DESIGN.md`. Skill
drafted 2026-07-09; **apply-mode added and executed for real the same day**
(567-platform split — see NEXT STEP). Iterate in-repo via dogfood runs (records
in `/specs/hubble-init/runs/`).
3. **Track C — Dogfood the split.** ✅ Completed and reversed by product choice. The
interactive init flow moved mechanics/build docs to Git and strategy/vision to Hubble
Cloud. **Two gates:** (1) triage logic —
**✅ satisfied 2026-07-09 by Adrian** after three dry runs (`brain/`, archive
stress corpus, foreign 567-platform brain; twelve learned defaults, contested
ratio 50% → ~18%, run records in `/specs/hubble-init/runs/`); (2) no-data-loss — **✅ verified 2026-07-09** live on dev
(every agent/file write snapshots first; wipe, restore, and trash all recover;
nothing prunes history). Caveats: ~60s live-typing granularity, prod re-run pending,
pre-move commit still required. Evidence:
`/specs/hubble-init/VERIFICATION-version-history.md`. On 2026-07-15 the full active
brain returned to Git because it needs neither realtime collaboration nor separate
access boundaries; the run remains valuable dogfood evidence, not the default model.
4. **Track D — Vision extraction (Adrian-gated).** InterviewMe session when ready; then
revise `current-vision.md` and re-derive UX priorities. Blocks "app matches my
vision/UX" work at scale.

## Sequence note

A→B→C was the mechanical dogfood order. D can land anytime and still reshapes
product priorities. The folder-authority slice is explicitly extracted and may proceed
without treating the broader pending vision as settled.

### Extracted-slice correction (2026-07-15)

The Git-default, selective folder-authority rule supersedes the 2026-07-11 assumption
that every production document is cloud-authoritative. The projection safety contract
still governs cloud folders; the new movement contract governs crossing the boundary.

### Extracted-slice exception (2026-07-11)

The desktop cloud-workspace IA and local-projection safety contract were explicitly
extracted with Adrian and may proceed without waiting for the broader Track D vision
session. Their scope is bounded by
`/specs/desktop-cloud-workspace/{PRODUCT,TECH}.md`. The warning above still applies to
unrelated or broader app-UX rework. The implementation remains sequenced behind the
current magic-flow Phase 3/4 work unless Adrian deliberately reprioritizes it.

### Cross-device evidence checkpoint (2026-07-13)

Adrian reprioritized the immediate next step from Phase 6 recovery completion to an
installable development build and a two-Mac live test. The purpose is to collect real
cross-device sync and UX evidence before choosing broader UI improvements. This does
not remove Phase 6 from the release-safety path; it pauses that work until the focused
test identifies whether UX findings or recovery completion should come next. Execution
and acceptance are tracked in
`/specs/desktop-cloud-workspace/CROSS-DEVICE-DEV-RELEASE-PLAN.md`.
