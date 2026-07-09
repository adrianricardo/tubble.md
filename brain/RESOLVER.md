# Hubble Brain Resolver

Use this when deciding where new information belongs. (Adapted from
`567-platform/brain/RESOLVER.md`; simplified — hubble.md is a single repo, no tiers.)

1. **Raw source material?** (session notes, transcripts, pasted brainstorms, research)
   → `sources/YYYY-MM-DD-short-description.md`. Append-only; never rewrite existing sources.
2. **Product vision / wedge / UX direction?**
   → `synthesized/current-vision.md` (preserve prior wording in its Timeline).
3. **A choice already made?**
   → `synthesized/decision-log.md` with date, decision, rationale, sources.
4. **Unresolved / needs Adrian / needs validation?**
   → `synthesized/open-questions.md`.
5. **Sequencing, build state, milestones?**
   → `synthesized/roadmap.md`.
6. **Engineering how-to (architecture, protocols, runbooks)?**
   → `/specs/` — not the brain. Feature designs get their own `/specs/<feature>/` folder.
7. **About the brain system itself?**
   → `admin/activity-log.md` or `admin/pending-extraction.md`.

Ambiguity rules: prefer a source capture plus links from synthesized docs; if a write
would restructure multiple files, propose the map first; strategy changes get logged in
the decision log **and** reflected in the relevant synthesis doc.
