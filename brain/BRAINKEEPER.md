# Brain-Keeper — Hubble

Any agent (Claude Code, Codex, cloud) can act as the brain-keeper by reading this file.
The job is to keep the brain useful, current, legible, and source-grounded for future
humans and agents. It is adapted from `567-platform/brain/BRAINKEEPER.md` and includes
the former `RESOLVER.md` rules.

## Authority and history

The entire active brain lives in Git under `brain/`. A 2026-07-10 dogfood run moved
strategy and vision into a Hubble cloud folder mounted at `brain/cloud/`; the active
documents returned byte-for-byte on 2026-07-15 after the team clarified that this
corpus needs neither realtime collaboration nor separation from repository access.

Git is the default authority for repository context. Cloud authority is an explicit,
folder-level choice for content that needs realtime collaboration or different access
boundaries. See `specs/folder-authority-mobility/PRODUCT.md`.

## Resolver — where new information belongs

1. **Raw source material?** (session notes, transcripts, pasted brainstorms, research)
   → `sources/YYYY-MM-DD-short-description.md`. Append-only; never rewrite existing
   sources.
2. **Product vision / wedge / UX direction?**
   → `synthesized/current-vision.md` (preserve prior wording in its Timeline).
3. **A choice already made?** Product/strategy decisions →
   `synthesized/product-decisions.md`; engineering/build decisions →
   `synthesized/decision-log.md`. Date the decision and record rationale and sources.
4. **Unresolved / needs Adrian / needs validation?**
   → `synthesized/open-questions.md`.
5. **Sequencing, build state, milestones?** Build state + NEXT STEP →
   `synthesized/roadmap.md`; track strategy/sequencing →
   `synthesized/track-strategy.md`.
6. **Engineering how-to (architecture, protocols, runbooks)?**
   → `/specs/` — not the brain. Feature designs get their own `/specs/<feature>/`
   folder.
7. **About the brain system itself?**
   → `admin/activity-log.md` or `admin/pending-extraction.md`.

Ambiguity rules: prefer a source capture plus links from synthesized docs; if a write
would restructure multiple files, propose the map first; strategy changes get logged
in the product decision log **and** reflected in the relevant synthesis doc.

## Responsibilities

1. **Intake** — file new notes, sessions, and fragments per the resolver.
2. **Synthesis** — keep `synthesized/` reconciled with accumulated sources.
3. **Maintenance** — retire stale claims, reconcile contradictions, preserve history.
4. **Downstream sync** — when a brain update changes engineering truth, update the
   affected `/specs/` doc (or log why not) in the same pass.

## Non-negotiables

- Never silently overwrite synthesized truth — preserve prior state in a Timeline or
  Change Log section.
- Cite source files for important claims.
- Respect **PENDING EXTRACTION** (see `BRAIN.md`): the written vision is incomplete by
  Adrian's own statement. Do not invent detail to fill gaps; file an open question.
- Keep the brain scannable: a fresh agent should orient in under 15 minutes.
- Log meaningful completed changes in `admin/activity-log.md`.
- `BRAIN.md` is seeded once, never regenerated; edit it like any document.

## Session wrap-up

At the end of a session that produced product direction, capture the raw material in
`sources/`, route durable outcomes through the resolver, log the pass in
`admin/activity-log.md`, and note anything deferred in
`synthesized/open-questions.md`.
