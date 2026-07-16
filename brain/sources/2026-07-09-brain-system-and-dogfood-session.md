# Source — 2026-07-09 session: agent-init, brain system, dogfood plan

Raw capture of direction given by Adrian in a Claude Code session (paraphrased close to
his wording; append-only).

- Wants to take a directory like `~/Code/567-platform/brain` and run an **init hubble
command with Claude or Codex** that "walks me through or suggests what files to move
to hubble, and what should stay."
- Confirmed the entry should **start in Codex/Claude Code with an init command**; the
desktop app is required at that point for syncing, so **the skill should ensure it's
installed, then open it to show the new workspace**. Storyboard updated to v1.1
accordingly (scenes 1–3).
- On the specs folder: "kinda crazy… concerned the existing folder is stale and
outdated." Agreed to reorganize with what we have.
- **"There is a LOT more in my head, but I'm not ready to extract it yet"** — organize
now, explicitly note the **pending extraction**.
- Wants a good documentation/brain system referencing the **brain-keeper agent in
~/Code/567-platform**; asked whether to absorb a version of brain-keeper logic into
the hubble logic (answer: yes, twice — as repo practice and as product design input;
see decision log).
- Wants to use the current realtime-collab docs as **brain dogfood** for hubble and run
the extraction/seed/init process we're building — but **wait until we feel good about
the logic, or have a way to modify the logic as we go**.
- Everything should be documented so **future fresh agent sessions can pick this up at
any point**.

## Addendum — same session, after reorg review

- Adrian on brain placement: **split is the eventual vision** (mechanics stay in repo;
strategy/vision lives in Hubble cloud) and "would be interesting to dogfood soon" —
but he doesn't yet trust that **change tracking / version control works well enough
to avoid data loss**. That safety is a gate.
- The init command "should in theory be interactive and help the user decide on the
split, and propose an initial plan based on its default instructions."
- Naming: "huddle" was a typo — the product is **hubble** today, "but I will
eventually rename."
- Asked to commit everything (docs reorg + in-flight app work).
