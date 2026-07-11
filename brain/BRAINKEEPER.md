# Brain-Keeper — Hubble

Any agent (Claude Code, Codex, cloud) can act as the brain-keeper by reading this file.
The job: keep the brain useful, current, legible, and source-grounded for future humans
and future agents. Adapted from `567-platform/brain/BRAINKEEPER.md`; consolidated with
the former `RESOLVER.md` at the 2026-07-10 split (one governance doc, git-side, governs
both halves).

## The split (2026-07-10)

The brain lives in two halves:

- **Git half (`brain/`)**: this file, `README.md`, `synthesized/decision-log.md`
  (engineering/build decisions), `synthesized/roadmap.md` (build state + NEXT STEP).
- **Cloud half (`brain/cloud/` when mounted)**: the "Hubble Brain" folder in the
  "Hubble Product Brain" workspace — `synthesized/` (current-vision,
  product-decisions, track-strategy, open-questions), `admin/` (activity-log,
  pending-extraction), `sources/`. Cloud files are ordinary markdown under the mount;
  edit them like any file. Without the mount (fresh clone, cloud agent), see
  `README.md` for what lives there.

## Resolver — where new information belongs

1. **Raw source material?** (session notes, transcripts, pasted brainstorms, research)
   → cloud `sources/YYYY-MM-DD-short-description.md`. Append-only; never rewrite
   existing sources.
2. **Product vision / wedge / UX direction?**
   → cloud `synthesized/Current Vision.md` (preserve prior wording in its Timeline).
3. **A choice already made?** Product/strategy decisions → cloud
   `synthesized/Product Decision Log.md`; engineering/build decisions → git
   `synthesized/decision-log.md`. Date, decision, rationale, sources.
4. **Unresolved / needs Adrian / needs validation?**
   → cloud `synthesized/Open Questions.md`.
5. **Sequencing, build state, milestones?** Build state + NEXT STEP → git
   `synthesized/roadmap.md`; track strategy/sequencing → cloud
   `synthesized/Track Strategy.md`.
6. **Engineering how-to (architecture, protocols, runbooks)?**
   → `/specs/` — not the brain. Feature designs get their own `/specs/<feature>/` folder.
7. **About the brain system itself?**
   → cloud `admin/Brain Activity Log.md` or `admin/Pending Extraction.md`.

Ambiguity rules: prefer a source capture plus links from synthesized docs; if a write
would restructure multiple files, propose the map first; strategy changes get logged in
the product decision log **and** reflected in the relevant synthesis doc.

## Responsibilities

1. **Intake** — file new notes/sessions/fragments per the resolver above.
2. **Synthesis** — keep `synthesized/` docs (both halves) reconciled with accumulated sources.
3. **Maintenance** — retire stale claims, reconcile contradictions, preserve history.
4. **Downstream sync** — when a brain update changes engineering truth, update the
   affected `/specs/` doc (or log why not) in the same pass.

## Non-negotiables

- Never silently overwrite synthesized truth — preserve prior state in a Timeline/Change Log section.
- Cite source files for important claims.
- Respect **PENDING EXTRACTION** (see cloud `BRAIN.md`): the written vision is incomplete by
  Adrian's own statement; do not invent detail to fill gaps — file an open question instead.
- Keep the brain scannable: a fresh agent should orient in under 15 minutes.
- Log meaningful completed changes in cloud `admin/Brain Activity Log.md`.
- Cloud `BRAIN.md` is seeded once, never regenerated — edit it like any doc.

## Session wrap-up (lightweight workflow)

At the end of a session that produced product direction: capture the raw material in
cloud `sources/`, route durable outcomes through the resolver, log the pass in cloud
`admin/Brain Activity Log.md`, and note anything deferred in `open-questions.md`. If the
mount isn't available, queue the entries in the commit message / run record and file
them when it is.
