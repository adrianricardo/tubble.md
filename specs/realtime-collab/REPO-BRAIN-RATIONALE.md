# Repo-Brain — Rationale, Strategy & Decision Log

> Captured 2026-07-03. Companion to `REPO-BRAIN-VISION.md` (the synthesis) and
> `repo-brain-storyboard.html` (the visual). **This is the "why" document.**
>
> **Who this is for — three audiences, read what you need:**
> 1. **An agent or human picking up the work** → read §1 (framing) + §3 (decisions)
>    to get productive without re-deriving anything.
> 2. **A second-opinion reviewer (human or agent)** → read §3 (each decision with
>    its rejected alternatives), §4 (bets), §5 (risks). §7 lists the sharpest
>    attacks to try — start there.
> 3. **A future marketing pass** → read §1 (framing) + §6 (positioning &
>    language). The story and taglines are raw material, not final copy.

---

## 1. Strategic framing

### The problem / opportunity

Teams increasingly work *through agents*, but agents are only as good as the
context they're pointed at — and today that context is scattered, re-explained
every session, or locked inside a code repo that only engineers can reach.
Meanwhile the people who most need to direct agents (operators, founders, PMs) are
often **non-technical**: they can't clone a repo, open a PR, or resolve a git
conflict. So the shared context that would make everyone's agents effective either
lives in git (invisible/inaccessible to non-coders, and permanent/un-revocable) or
in a doc tool disconnected from the code and the agents.

**The opportunity:** a shared, live, agent-legible context layer — anchored to a
repo, but reachable by anyone with a link and workable by anyone's local agent —
that a non-technical person can use as naturally as a Google Doc.

### The wedge — who we build for first, and why

**The non-technical stakeholder who already runs their day through a local agent
(e.g. Claude Cowork).** Not a PM who only reads, not an engineer who'd clone
anyway — specifically the *agent-native non-coder*.

Why this wedge:
- **It's the hardest collaborator to serve well**, which makes it defensible. The
  product must make a repo legible to someone who will never see the repo. Anyone
  who solves that has solved the easier cases for free.
- **They already feel the pain acutely** — they live in an agent all day and have
  no trustworthy shared context to point it at.
- **They pull in the buyer.** The developer sets up the brain; the non-technical
  teammate's daily reliance on it is what makes the team keep paying.

Everyone else — other engineers, external/cross-org collaborators, pure reviewers,
AI agents as first-class members — is a deliberately **later** path.

### Differentiation (why not just use X)

| Alternative | Why it's not enough |
|---|---|
| **Google Docs / Notion** | Disconnected from the repo and from agents. No repo anchor, no local-agent file access, no CRDT-backed agent-as-collaborator path. |
| **GitHub / git + markdown** | Non-coders can't participate; edits go through clone/PR/merge. History is permanent and un-revocable (wrong for strategy). Line-diffs and merge conflicts are hostile to prose. |
| **Raw agent tools (Cowork/Claude Code alone)** | No shared, durable, multiplayer context. Each agent re-learns the project every session; humans can't co-edit what the agent sees; nothing is authoritative across people. |
| **Hubble v1 as previously specced (web Docs-first)** | Right primitives, wrong front door for this wedge — it starts on the web and treats the repo/desktop as optional, so it doesn't lead with the repo-anchored, agent-native story. |

**The one-sentence edge:** *a shared context layer that lives beside your code,
is safe to keep private, and any teammate's local agent can read and write in real
time — without anyone cloning the repo or touching git.*

### Why now

- Non-technical people using coding/agent tools daily is newly real (local agent
  apps aimed at non-coders).
- CRDT rich-text sync on our stack is proven (`@convex-dev/prosemirror-sync`), so
  agent-as-collaborator is buildable without a backend rewrite.
- The desktop watcher/reconcile path already exists — the universal bridge is a
  sunk asset, not new construction.

### The narrative arc (the "aha")

A developer turns a repo into shared context in one click. They send a link. A
non-technical teammate opens it — no install, no git — and is *in*, editing beside
the dev with live cursors. Then they point their own agent at it, and the agent
starts doing real work against the team's real context, its edits flowing back live
to everyone. **The repo stopped being a wall.**

---

## 2. How we got here (process note)

This vision came out of a structured interview that deliberately **workshopped the
model before any screens**. Several early framings were overturned live: "brain as
a new primitive" collapsed into "a folder"; an embedded agent chat UI was cut; a
git/cloud dual-storage model was simplified to all-cloud. The decisions in §3 are
the *survivors* of that pressure-testing, which is why the rejected alternatives
are worth keeping — they're the paths already walked.

---

## 3. Decision log

Each entry: **context → decision → why → rejected alternatives → tradeoffs/risks →
status.** A reviewer should be able to reopen any one of these.

### D1 — Repo-first is the v1 wedge (web-first is a later door)
- **Decision:** Lead with the repo as the entry point; the web dashboard becomes a
  later front door. Architecture must not preclude web-first.
- **Why:** The differentiated story (repo-anchored, agent-native, no-clone
  collaboration) only lands if you *start at the repo*. Web-first buries it.
- **Rejected:** (a) Web-dashboard-first (the prior `V1-RELEASE.plan.md` framing) —
  valid but doesn't lead with the wedge. (b) Two co-equal front doors now — splits
  focus. (c) Rip up "Google Docs for markdown" entirely — unnecessary; the
  primitives are reused.
- **Tradeoffs/risks:** Reorders a "fully specified" plan late. Reviewer should
  check we're not throwing away shipped web work — we're resequencing, not deleting.
- **Status:** Decided.

### D2 — The model is Workspace ⊃ nested Folders ⊃ cloud Docs; "brain" is informal
- **Decision:** No "brain" schema entity. A repo attaches to a *folder*; folders
  nest; sharing is folder-level. "Brain" = informal word for a repo-linked folder.
- **Why:** "Brain = workspace" was doing two jobs and confused cardinality
  ("can a workspace have multiple brains?"). Collapsing to folders answers it
  natively: multiple repo-linked folders = multiple "brains," no switcher gymnastics.
- **Rejected:** (a) Brain as a distinct mid-level entity between workspace and
  folder — one level too many. (b) Brain = workspace 1:1 — breaks with multiple
  repos. (c) Drop "workspace" too (pure filesystem) — but membership/billing needs
  a stable top container.
- **Tradeoffs/risks:** New schema work (folder nesting, repo-link attribute,
  folder-level sharing). Reviewer should check folder-level permission inheritance
  doesn't get hairy.
- **Status:** Locked.

### D3 — Protagonist = non-technical + agent-native
- **Decision:** Build first for the non-coder who runs their day through a local
  agent. (See §1 wedge rationale.)
- **Rejected:** Leading with engineers (they'd clone anyway) or read-only
  stakeholders (too passive to prove the agent loop).
- **Tradeoffs/risks:** Hardest persona to serve; onboarding friction (esp. the
  desktop-app install, D6) is most dangerous here.
- **Status:** Decided.

### D4 / D5 — All-cloud: no git, ever (v1); no git permanence, cloud access revocable

*(Wording tightened 2026-07-03 per Codex finding #4: avoiding git removes the
**permanence** vector; local synced-folder copies, editor caches, and agent
transcripts still exist outside Convex. Revocation stops future access and
removes materialized projections on next sync; it cannot recall copied bytes.
Do not market "absolute revocability.")*
- **Decision:** Every doc is cloud-only. No git-mirroring in v1. Git-export returns
  later as an optional, folder-level "sync back to the repo."
- **Why (the argument we ran):**
  1. **Git breaks the core bet** — anything in git has permanent, un-revocable
     history; every mirrored doc is a hole in the revocability promise.
  2. **It deletes the biggest complexity source** — the whole cloud-vs-git axis,
     per-doc classification, dual propagation paths, and a "which regime?" question
     a non-technical user should never face.
  3. **It's a removal, not a rewrite** — the CRDT is already the authority; git was
     only ever an extra projection target.
  4. **Git buys little for docs** — cloud version history + named restore beats
     line-diffs; comments/suggestions beat PRs for prose; agents still get file
     access via a *gitignored* projection (on-disk ≠ in-git); and git would
     *reintroduce* the merge conflicts the CRDT exists to kill.
- **Rejected:** (a) Cloud-vs-git per-doc/per-folder regime — the complexity we
  removed. (b) Three states (cloud-only/git-only/mirrored) — even more concepts.
- **Honest counter (kept on purpose):** git uniquely serves docs that are genuinely
  part of the *codebase* (README, `CLAUDE.md`, ADRs), versioned in the same commit
  as the behavior they describe. That's a pure-engineering need and *not the
  wedge*; it's the deferred git-export.
- **Tradeoffs/risks:** Engineers who expect docs in-repo will feel the absence.
  Convex/cloud lock-in for all context. Reviewer should probe: does any v1 doc
  *need* to be in git? We bet no.
- **Status:** Locked.

### D6 — The one bridge: the desktop watcher/synced folder (MCP deferred)
- **Decision:** The synced folder + watcher is the single, universal write-path
  into the CRDT for all local file editing (human apps + local agents). Web is
  zero-install human editing. A local MCP server is deferred, "only-if-earned."
- **Why:** The watcher watches the *filesystem*, not any app, so TextEdit, vim,
  Cursor, Claude Code and Cowork are all identical to it — and it's already built.
  Because a generic app can only *write a file*, the watcher can **never be
  retired**; any other mechanism (MCP) can only sit on top for one client class.
- **Rejected:** (a) **Cowork clones the git repo** — breaks privacy (exposes
  history, can't even see cloud-only docs) and realtime (snapshot → conflicts).
  (b) **Cloud-hosted watcher / projected filesystem for the collaborator** — only
  needed if Cowork ran in the cloud; it runs locally. (c) **Cloud MCP service with
  per-collaborator auth** — over-built. (d) **Local MCP now** — real fidelity win
  (clean attribution, permission-aware) but a *second* path that can't replace the
  watcher; build only if diff-based attribution becomes a complaint.
- **Key enabling fact:** Cowork runs **locally** (desktop/CLI), so "install the
  desktop app" is sufficient to give the agent file access. If that fact were
  false (cloud Cowork), we'd need MCP/cloud-mount.
- **Tradeoffs/risks:** On-save granularity → coarser attribution than a semantic
  patch API. The install step (below) is friction. Reviewer should verify the
  Cowork-is-local assumption and Cowork's "point at a folder" ergonomics.
- **Status:** Decided (v1 = folder; MCP deferred).

### D7 — No embedded agent UI; Hubble is the doc surface, Cowork the agent surface
- **Decision:** Cut the in-Hubble agent chat for v1. Hubble = docs; Cowork =
  agent; separate apps that meet at the synced folder.
- **Why:** Collapses a five-surface design to a clean division of labor and avoids
  building a chat product. The screenshot-inspired embedded chat is a north star.
- **Rejected:** Embedded chat in v1 (scope explosion); minimal embedded chat over
  cloud docs (still a new surface).
- **Status:** Decided (north star retained).

### D8 — Folder-level sharing / invites
- **Decision:** Inviting = sharing a folder and its subtree. Reuses the per-doc
  share model lifted to folders.
- **Why:** Scope falls out for free (share `Orbital`, not `Lander`); matches the
  collapsed model (D2).
- **Tradeoffs/risks:** Inheritance & revocation semantics down a tree need care.
- **Status:** Decided (semantics = open question).

### D9 — Content seeding is a mix that grows
- **Decision:** No single origin — some imported from the repo, some agent-drafted,
  some hand-authored; grows over time.
- **Status:** Decided (default vs manual = open question).

### D10 — Auto-seeded `BRAIN.md` agent-context file
- **Decision:** Hubble generates a `BRAIN.md` in the synced folder so a local agent
  immediately understands the context.
- **Why:** Direct hit on the dev's payoff — *shared, durable agent context* —
  with near-zero cost.
- **Status:** Decided; lifecycle resolved in D14.

---

*D11–D15 added 2026-07-03 (interview round 2), closing the build-blocking gaps a
critique pass identified: the repo link and seeding — the two things that make
this "repo-brain" rather than "folders + sharing" — were the least designed parts
of the plan, and the guest model was a schema hole.*

### D11 — Repo link = mount the brain into the repo (local-path, desktop-side)
- **Decision:** Linking is a desktop action: pick the folder, pick a location in
  the local clone; Hubble materializes the projection there and adds the path to
  `.git/info/exclude`. Cloud stores display metadata only (repo name/remote); the
  local path is per-machine desktop config. Hubble never reads repo contents.
- **Why:** The point of the link is *making the brain available to agents while
  they work in the repo* — not Hubble understanding the repo. `.git/info/exclude`
  keeps the promise of never touching the user's committed files. Rides entirely
  on the shipped watcher/projection machinery.
- **Rejected:** (a) GitHub OAuth integration — a whole new surface (app, private-repo
  auth, cloud repo reads) buying nothing the wedge needs in v1. (b) Metadata-only
  link — cheapest, but makes "lives beside your code" a slogan instead of a path
  on disk.
- **Tradeoffs/risks:** Link requires the desktop app (fine — the dev is the setup
  persona and already installs it). Per-machine paths mean a second machine
  re-links locally. `.git/info/exclude` write can fail (worktrees, odd setups) —
  fall back to instructing a `.gitignore` entry.
- **Status:** Decided.

### D12 — Folder sharing = Google Drive semantics; invitee is a folder-scoped guest
- **Decision:** A folder invite creates a `folderShares` ACL entry, **not** a
  workspace membership. Role inherits down the subtree, resolved at authorization
  time; direct shares add, never subtract; docs created inside inherit; revocation
  removes inherited access and the guest's materialized projection on next sync;
  "Shared with me" surfaces the top-most shared node; `editor` guests can create
  docs inside the subtree. Billing/membership stay at Workspace.
- **Why:** "Do whatever Google Docs does" — the semantics every target user
  already knows, and the only model that keeps membership=billing clean while
  letting a non-member co-create.
- **Rejected:** (a) Limited workspace membership — bends membership=billing,
  risks scope leaks. (b) Fan-out to per-doc `docShares` — zero new auth path but
  goes stale on moves/doc-adds; a known consistency trap.
- **Tradeoffs/risks:** New authorization path (subtree walk) touches the hot path
  of every document authorize; needs indexes + tests (the permission regression
  suite exists to extend). Selective desktop materialization must be upgraded from
  RD2's flat per-doc "Shared with me" to subtree materialization.
- **Status:** Decided.

### D13 — Seeding v1 = manual + `BRAIN.md` only
- **Decision:** No repo import, no agent-drafted seed flow in v1. Dev
  creates/imports docs by hand; link produces a guided empty state + `BRAIN.md`.
- **Why:** Smallest scope that makes the demo work; the existing import-file flow
  already covers "bring my markdown."
- **Rejected (for v1):** import-a-`/docs`-convention (fast-follow candidate);
  agent-drafted seeding (dogfoods the bridge but makes the demo depend on an
  agent run).
- **Tradeoffs/risks:** The "one click" demo beat becomes "link + a guided empty
  state" — the marketing copy must not overpromise the click.
- **Status:** Decided.

### D14 — `BRAIN.md` is a normal Live Document, seeded once, never regenerated
- **Decision:** Created at link time from a template; thereafter user/agent-editable
  like any doc. Hubble never overwrites it. "Refresh index" is post-v1.
- **Why:** It lives inside a watched folder whose watcher reconciles every save
  into the CRDT — auto-regeneration would create a clobber loop against human and
  agent edits. Seed-once has no loop.
- **Status:** Decided.

### D15 — Sequencing: full pivot; deploy deferred to one repo-first launch
- **Decision:** Pause the web-first v1's remaining operator gates
  (`V1-EXECUTION.plan.md` P7: production deploy, hosting, ops sink, manual QA).
  Build repo-brain on the branch; deploy everything together as a single
  repo-first launch.
- **Why:** One public launch with the differentiated story; avoids launching the
  front door the pivot just declared superseded.
- **Rejected:** (a) Ship web-first publicly first — faster to market but launches
  the superseded framing. (b) Deploy infra now, hold marketing — viable, but the
  author chose the clean single story.
- **Tradeoffs/risks:** The finished web-first work sits unvalidated in production
  longer; the P7 browser/manual QA debt (still owed from sessions 2–7) compounds
  and must be paid at repo-brain launch time.
- **Status:** Decided.

---

## 4. Key bets & assumptions (what a reviewer should pressure-test)

1. **The non-technical + agent-native persona exists in useful numbers** and is
   worth optimizing the whole entry flow around.
2. **Cowork (and peers) run locally and can be pointed at a folder.** The entire
   "one bridge, no MCP" simplification rests on this. If false, MCP re-enters v1.
3. **All-cloud is net-positive for docs.** We bet no v1 doc *needs* git, and that
   the code-adjacency loss is fully covered by the gitignored projection.
4. **A non-technical person will install a desktop app** to unlock their agent.
   This is the friction cliff.
5. **CRDT + file-reconcile fidelity is good enough** that agent/file edits merge
   cleanly with live human edits at demo quality.
6. **Repo-first doesn't strand the shipped web work** — resequencing, not waste.

## 5. Risks & known weaknesses (stated honestly)

- **Onboarding cliff (D3+D6):** "open a link" (great) vs "now install an app to use
  your agent" (friction) — worst for the exact persona we target.
- **Attribution coarseness:** file-reconcile gives "edited via file," not
  per-agent-clean edits, until (if) local MCP lands.
- **Cloud lock-in:** all context in Convex/cloud; no git fallback by design.
- **Dependency on an external agent product** (Cowork) whose runtime/extensibility
  we don't control.
- **Scope drift** already observed (embedded chat, dual storage) — the plan needs
  to hold its cuts.
- **Discovery-stage confidence:** these are interview conclusions, not validated
  with real target users yet.

## 6. For marketing (positioning & language — raw, not final)

**Positioning statement:** *Hubble turns a repo into shared, living context your
whole team — and their agents — can work in. No clone. No git. No conflicts.*

**Taglines to test:**
- "Your code lives in git. Your brain lives in Hubble."
- "Give everyone's agent the same context."
- "A link, not a clone."
- "The repo stopped being a wall."

**Value props by audience:**
- *Developer:* stop being the bottleneck; one durable context every agent shares.
- *Non-technical teammate:* direct your agent against the team's real context —
  open a link, no engineering setup.
- *Team/org:* strategy that's private and revocable (never trapped in git forever),
  yet anchored to the code it's about.

**The three "magic" beats** (for demo/landing): (1) repo → shared context in one
click; (2) a link → a non-coder co-editing live with cursors; (3) their local
agent editing the team's real context, live to everyone.

## 7. For a second-opinion reviewer — attack these first

1. **Is the wedge real?** Does the "non-technical + agent-native" persona exist at
   scale, or are we designing for a rare user? (Biggest risk.)
2. **Kill the "one bridge" bet:** is Cowork actually local and folder-pointable? If
   not, the whole D6 simplification collapses.
3. **Is the install cliff (D3+D6) fatal** for a non-technical user? What softens it?
4. **Is all-cloud (D4) too absolute?** Name a v1 doc that genuinely must be in git.
5. **Does repo-first (D1) waste the shipped web-first work,** or resequence it?
6. **Folder-level permissions (D8):** does inheritance/revocation get hairy enough
   to need its own design before v1?
7. **What did cutting the embedded chat (D7) cost** the agent-native experience the
   wedge depends on?

---

## Related docs

- `REPO-BRAIN-VISION.md` — the decided vision, v1 scope, open questions.
- `repo-brain-storyboard.html` — visual walkthrough of the v1 happy path.
- `V1-RELEASE.plan.md` — the prior (web-first) release plan this reorders.
- `PRODUCT.md`, `TECH.md`, `DECISIONS.md` — the underlying realtime-collab product,
  architecture, and prior decision log this vision builds on.
