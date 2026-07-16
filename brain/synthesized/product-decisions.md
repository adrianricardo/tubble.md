# Product Decision Log

Newest first. Product and strategy decisions live here; engineering and build
decisions live in `decision-log.md`.

## 2026-07-16 — Nopal Studio subdomain is the temporary hosted-trial front door

**Decision:** Use `https://tubble.nopalstudio.com` as Tubble.md's temporary public
staging and hosted-trial URL. It supersedes the earlier same-day selection of
`https://tubble.adriantavares.com`. A dedicated product domain remains deferred.

**Rationale:** The Nopal Studio Cloudflare account is already authenticated and owns
the zone, allowing the trial to use one controlled hosting, DNS, and TLS boundary
without a purchase or unrelated DNS change.

**Consequences:** The URL is now controlled and operational, so it is the resolved
`config/brand.json` web URL and the checked README/package homepage destination. A
later dedicated-domain move must follow the same brand-boundary validation and should
preserve or redirect this address if it has been published.

**Source:** `../sources/2026-07-16-public-staging-url.md`; live deployment evidence:
`/specs/public-try-it-today-launch/READINESS.md`.

## 2026-07-15 — Tubble.md is the launch name, not a permanent identity constraint

**Decision:** Launch the fork as **Tubble.md**, a playful reference to Hubble.md. Treat
the name as replaceable: all mutable public brand values must originate from one
repo-owned definition or be generated/validated against it, while
compatibility-sensitive identifiers remain separately explicit.

**Rationale:** Tubble.md makes the fork relationship memorable now without forcing a
premature permanent-brand exercise. Designing the rename boundary before applying the
name makes a later change bounded and prevents another uncontrolled repository-wide
replacement.

**Consequences:** The naming interview is complete. The first authorized implementation
slice starts with the brand manifest, compatibility map, and rename inventory, then
applies Tubble.md to public surfaces. Domain/repository control still requires an
operator check before publication but is not an open product-name decision.

**Source:** Name-selection follow-up in
`../sources/2026-07-15-public-launch-milestone.md`.

## 2026-07-15 — Launch uses managed Convex, hosted web, and macOS agent access

**Decision:** The launch-supported independent deployment uses the operator's own
managed Convex production project and web host; fully self-managed infrastructure is
backlog. The public launch includes hosted web for immediate use and macOS desktop for
the exact local Markdown path agents need. Rename public-facing surfaces now, retain
compatibility-sensitive internal identifiers only when intentional, and centralize
mutable public brand values behind one source plus generation or validation so later
renames are bounded.

**Rationale:** Web alone satisfies instant evaluation but cannot give a local agent a
filesystem path. macOS is therefore part of the core launch journey rather than an
optional distribution extra. Managed Convex makes independent operation credible
without absorbing the substantially larger burden of supporting the open-source
backend in production. Centralized brand data keeps this rename from becoming another
future repository-wide hunt.

**Consequences:** Signing/notarization, fork-owned releases, clean-profile Safe
Storage and startup-file behavior, deployment-correct sign-in, independent desktop
build instructions, and a two-device web → desktop → local-agent → web → relaunch
smoke are launch-critical. The initial announcement omits Git/cloud authority moves
and broader offline/recovery claims, so their unfinished acceptance does not block
launch. Tubble.md is fixed by the follow-up decision above.

**Source:** Follow-up to `../sources/2026-07-15-public-launch-milestone.md`; contract
and plan: `/specs/public-try-it-today-launch/{PRODUCT,PLAN}.md`.

## 2026-07-16 — Temporary public staging URL

**Superseded later the same day** by the Nopal Studio subdomain decision above.

**Decision:** Use `https://tubble.adriantavares.com` as the temporary public staging
URL for Tubble.md. It may become the hosted-trial front door while the launch path is
tested. Replace it with a dedicated custom domain later.

**Rationale:** A subdomain Adrian controls unblocks deployment and end-to-end launch
testing without prematurely choosing or purchasing the permanent product domain. The
brand manifest keeps a future URL change bounded.

**Consequences:** Keep `config/brand.json` unresolved until the subdomain's DNS, TLS,
hosting, and Tubble deployment are reachable and control is verified. Once verified,
set the manifest URL and update its checked public surfaces. A later custom-domain
move follows the same manifest-driven rename path and should preserve or redirect the
staging address if it has already been published.

**Source:** `../sources/2026-07-16-public-staging-url.md`.

## 2026-07-15 — A public “try it today” launch is the next milestone

**Decision:** Reprioritize the immediate milestone around a truthful public launch of
the fork: adopt a distinct name, explain its Hubble lineage and meaningful additions,
offer an explicitly best-effort hosted cloud trial with immediate account creation,
and provide a verified independent-deployment guide for people who need more control.
Existing work that does not make a launch claim true moves to backlog or becomes a
claim-conditional gate.

**Rationale:** The desired near-term outcome is no longer another internally complete
feature phase. It is the ability to publish a concrete invitation—what was forked,
what changed, and how to try it today—without implying that the public hosted service
is appropriate for critical work or guaranteed to be maintained indefinitely.

**Consequences:** Production web deployment, honest trial copy, distinct public
identity, fork attribution, clean-clone deployment documentation, and claim-shaped
acceptance are critical. The follow-up decision above makes macOS distribution and
the focused cross-device agent-access path critical while leaving selective-authority
cutovers and broader recovery claim-conditional. The follow-up decisions above resolve
the deployment, surface, rename-depth, and naming gates.

**Source:** `../sources/2026-07-15-public-launch-milestone.md`; contract and plan:
`/specs/public-try-it-today-launch/{PRODUCT,PLAN}.md`.

## 2026-07-15 — Git is the default; cloud authority is selected per folder

**Decision:** Repository content remains Git-authoritative by default. A user moves a
specific folder to Hubble Cloud only when it needs realtime collaboration or access
boundaries that should not follow the repository. A cloud folder can move back to Git
when those needs end. Every folder has one authority at a time; local projections do
not become competing canonical copies.

**Rationale:** The Hubble brain dogfood proved the cloud and projection mechanics but
also showed that moving content without a collaboration or repository-independent
privacy need adds authority, availability, and failure-state complexity without user
value. Git already provides the right history and agent-access model for ordinary
repository context. Cloud remains differentiated where realtime and Hubble-managed
access matter.

**Consequences:** The universal-cloud premise in the 2026-07-11 decisions and ADR-0010
is superseded. Their projection safety and unified-navigation lessons remain applicable
inside cloud-authoritative folders. The product must expose explicit, lossless,
reversible folder moves with clear access and collaboration impact.

**Source:** `../sources/2026-07-15-git-default-folder-authority.md`; UX contract:
`/specs/folder-authority-mobility/PRODUCT.md`; architecture decision: ADR-0011.

## 2026-07-11 — Local projections preserve quit-time work and mediate consequential operations

**Decision:** A watched projection is a fully writable local interface to a
cloud-authoritative folder, including while Hubble is offline or completely quit.
Before cloud materialization on restart, Hubble must classify and protect local drift.
Routine content edits, creates, renames, and same-access-boundary moves synchronize
automatically. A filesystem move that would change audience or repo exposure becomes a
durable pending operation and immediately opens a Hubble confirmation modal showing
the exact impact; approval is revalidated atomically in the cloud, while cancel restores
the canonical path without discarding the local edit. One-document deletion maps to
cloud Trash with Undo. Folder, bulk, or quit-time deletion requires review, and deleting
a projection root only stops local availability. Healthy sync remains quiet, but local
path, status, recovery, and stop-availability controls stay discoverable.

**Rationale:** Watched editing only preserves meaningful local-first value if local
tools remain trustworthy when the bridge is not running. Automatic safe operations
keep the filesystem natural; targeted confirmation protects collaboration and access
boundaries that ordinary filesystem commands cannot express. The modal may receive the
authoritative impact data from Hubble’s backend—the backend is the source of truth, not
the only place the information can be presented.

**Source:** `../sources/2026-07-11-desktop-navigation-ia.md`, “Follow-up: projection
safety and confirmation.” Normative contract:
`/specs/desktop-cloud-workspace/PRODUCT.md`.

## 2026-07-11 — Desktop navigation is one context and one content tree

**Decision:** The desktop sidebar presents exactly one current context. In a cloud
workspace, folders and documents render as one hierarchy with no separate **Folders**
or **Live Documents** sections. A repo-linked local projection is an availability
property of its cloud folder, not a second tree. Opening a truly standalone local
folder is not a Hubble editing mode. Local editing is supported only through watched
projections of cloud-authoritative folders. “Live Document” is no longer a user-facing
content category; healthy sync is invisible, with only syncing/offline/error state
surfaced contextually. **Shared with me** may remain when populated because it
represents an access boundary. New documents inherit the effective access of their
folder; root documents receive no direct/guest share by default while retaining normal
workspace-member access.

**Rationale:** The old sidebar made organization, document authority, and storage
location into sibling destinations even though one document could satisfy all three.
The unified model matches the locked `Workspace ⊃ nested Folders ⊃ cloud Docs` domain
model and preserves local-agent file access without exposing the watcher/projection
architecture during ordinary navigation. A standalone local-authority mode would
reintroduce two document regimes with different collaboration, history, permission,
and cross-device semantics while duplicating mature local editors.

**Source:** `../sources/2026-07-11-desktop-navigation-ia.md`.

## 2026-07-09 — Name: "hubble" today, rename intended eventually

**Decision:** "huddle" in session messages was a typo; the product remains hubble.md
for now, but Adrian intends to rename eventually (name TBD, part of pending
extraction). Keep the name out of hard-to-change surfaces where cheap (deep links,
protocol handlers, published package names) until decided.
**Source:** same source, addendum.

## 2026-07-09 — Absorb brain-keeper logic into the Hubble *product* (as design input)

**Decision:** the hubble-init skill's triage heuristic adopts the RESOLVER decision-tree
shape, and BRAINKEEPER non-negotiables map to product mechanics (BRAIN.md seeded once,
never regenerated; CRDT version history = the Timeline; source-grounding = attribution).
A post-init "brain-keeper maintenance" skill is a fast-follow candidate, not v1.
**Source:** `/specs/hubble-init/DESIGN.md` §Brain-keeper absorption.

## 2026-07-09 — Agent-init entry point (supersedes REPO-BRAIN-VISION Decided #13)

**Decision:** the v1 front door is `/hubble-init` run inside Claude Code/Codex —
agent-assisted triage of what moves to cloud vs. stays in git, then ensure-desktop +
deep-link handoff. Storyboard revised to v1.1 (scenes 1–3).
**Rationale:** meets the dev where they already work; the desktop UI link flow becomes
the machinery, not the entry.
**Source:** `sources/2026-07-09-brain-system-and-dogfood-session.md`; storyboard footer note.
