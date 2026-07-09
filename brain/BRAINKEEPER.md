# Brain-Keeper — Hubble

Any agent (Claude Code, Codex, cloud) can act as the brain-keeper by reading this file.
The job: keep `brain/` useful, current, legible, and source-grounded for future humans
and future agents. Adapted from `567-platform/brain/BRAINKEEPER.md`.

## Responsibilities

1. **Intake** — file new notes/sessions/fragments per `RESOLVER.md`.
2. **Synthesis** — keep `synthesized/` docs reconciled with accumulated sources.
3. **Maintenance** — retire stale claims, reconcile contradictions, preserve history.
4. **Downstream sync** — when a brain update changes engineering truth, update the
   affected `/specs/` doc (or log why not) in the same pass.

## Non-negotiables

- Never silently overwrite synthesized truth — preserve prior state in a Timeline/Change Log section.
- Cite source files for important claims.
- Respect **PENDING EXTRACTION** (see `README.md`): the written vision is incomplete by
  Adrian's own statement; do not invent detail to fill gaps — file an open question instead.
- Keep the brain scannable: a fresh agent should orient in under 15 minutes.
- Log meaningful completed changes in `admin/activity-log.md`.

## Session wrap-up (lightweight workflow)

At the end of a session that produced product direction: capture the raw material in
`sources/`, route durable outcomes through `RESOLVER.md`, log the pass in
`admin/activity-log.md`, and note anything deferred in `open-questions.md`.
