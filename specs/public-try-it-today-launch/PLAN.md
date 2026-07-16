# Public “try it today” launch plan

**Status:** Approved planning baseline. No product implementation is included in this
document pass.

## Milestone goal

A person who sees the announcement can understand what changed from upstream, create
an account and persist a Markdown document in the explicitly best-effort hosted trial,
or independently deploy the supported stack from the fork's instructions, all under a
**Tubble.md** identity. The hosted web app is the instant front door; the public
macOS app supplies the exact local Markdown path needed by local agents.

## Scope rule

An item is launch-critical only when it is required to make a sentence in the public
announcement, landing page, README, or deployment guide true. When an optional feature
cannot pass its focused launch check, prefer removing or narrowing that claim and
filing the feature in backlog over expanding this milestone.

Security or data-loss defects on an advertised path are exceptions: fix them or remove
the path from launch. Copy cannot waive a defect that could expose or destroy user
data.

## Decisions fixed for launch

- **Independent deployment:** operator-owned managed Convex production project plus
  operator-owned web hosting. Fully self-managed infrastructure is backlog.
- **Launch surfaces:** hosted web plus public macOS desktop.
- **Launch name:** Tubble.md, chosen as a playful reference to the Hubble.md fork and
  intentionally allowed to change later.
- **Desktop purpose:** macOS is required for local agent access, not an optional
  packaging extra.
- **Rename depth:** all public-facing surfaces change; intentionally retained internal
  package namespaces, bundle/protocol identifiers, and persisted paths may remain as
  documented compatibility identifiers.
- **Brand architecture:** mutable public brand values have one repo-owned source of
  truth. Surfaces that cannot consume it directly are generated from it or checked
  against it so drift fails validation.
- **Hosted trial:** best effort, no SLA or maintenance-term promise, not for critical,
  sensitive, or irreplaceable work, and users should keep independent copies.

## Launch story and claim boundary

The default announcement makes only these product claims:

1. Tubble.md is a fork of the original Hubble.md Markdown notepad for people and their
   agents.
2. The fork adds account-backed cloud Workspaces that open on web and macOS, including
   realtime editing and sharing.
3. The macOS app can make the exact current cloud scope available as watched local
   Markdown so a local agent can edit it and changes return to web.
4. People can try Adrian's best-effort hosted trial or independently deploy the same
   supported web-plus-macOS stack using their own managed Convex project.

Do not advertise selective Git/cloud authority moves, general offline/quit-time
editing, comments/activity/history, exhaustive recovery, or broad editor polish in the
initial announcement. Their work and evidence remain valuable, but omitting those
claims keeps their unfinished acceptance out of this milestone.

## Phase 1 — Establish the public identity and story

1. Build a rename inventory covering repository metadata, domain and hosted app,
   visible copy/assets, desktop display and release metadata, download/update links,
   issue/contribution/security links, package metadata, protocols, persisted paths,
   and documentation.
2. Divide the inventory into public launch rename, intentional compatibility alias,
   and post-launch internal cleanup. Record a migration rule before changing any
   identity that could strand existing users or files.
3. Define one non-secret brand manifest for mutable public values: display name,
   short name/slug, repository owner/name, public web URL, support/issue/security
   destinations, release destination, and protocol display label. Generate or validate
   manifests and metadata that cannot read it directly. Keep bundle IDs, protocol
   schemes, package namespaces, and persisted directory names in a separate explicit
   compatibility map rather than pretending they are ordinary brand copy.
4. Add a validation check that reports every divergent public value and every
   intentional compatibility value. A future rename should start by editing the brand
   manifest, not by searching and replacing the repository.
5. Update the README front door with: new identity; original-project attribution;
   concise additions; hosted-trial warning; hosted link; independent-deployment link;
   supported platforms; and current screenshots only if they match launch behavior.
6. Audit every public URL from a clean browser. Fork-owned actions must not land at
   `bholmesdev/hubble.md`; upstream links must be labeled as attribution.
7. Verify control of the public repository name and web destination used for
   Tubble.md before publishing them. If `tubble.md` is not the operated domain, keep
   the product name and state the actual public URL consistently in the brand
   manifest.

**Exit:** one public narrative and link map can be reviewed without running the app.

## Phase 2 — Prove independent deployment

1. Write one linear guide for the selected topology, initially targeting the
   operator-owned managed Convex path.
2. Document exact prerequisites, environment variables, backend working directory,
   auth setup, production deployment, frontend build/hosting, first-user flow,
   backup/export expectations, upgrade procedure, and teardown.
3. Add a short architecture/support-boundary section explaining which services the
   operator owns and which remain managed dependencies.
4. Have a fresh operator follow the guide from a clean clone without unpublished
   knowledge. Record every correction and repeat until no hidden step remains.
5. Document and prove how the operator builds the macOS app against their own Convex
   deployment, how that target is visible during setup/account access, and how the app
   remains distinguishable from the public hosted build.

**Exit:** a clean-clone deployment record proves account creation and persisted web
create/edit/reload behavior plus macOS sign-in and a local-agent Markdown round trip
against the operator's deployment.

## Phase 3 — Prepare the best-effort hosted trial

1. Create a production deployment separate from development data and wire the hosted
   web build to it.
2. Put the trial limitation in public documentation and the signup/first-use path.
3. Verify signup-cap behavior, account creation, private starter Workspace creation,
   sign-out/sign-in, create/edit/reload, and understandable outage/error states.
4. Establish the minimum operational floor needed for an honest public trial:
   deployment ownership, secret rotation/revocation, error visibility, a manual
   disable-signups path, data export/backup procedure, and a way to publish service or
   retirement notices. This is not an SLA.
5. Do not seed the public environment with development fixtures or claim that prior
   development acceptance covered production.

**Exit:** a signed-out user reaches a persisted private document on the real public
URL and has already seen the trial boundary.

## Phase 4 — Run only claim-shaped product gates

Always run:

- public-link and attribution audit;
- new-account hosted web smoke;
- independent-deployment clean-clone smoke;
- production configuration and secret-leak audit;
- focused permission check proving a new user's private Workspace is not visible to
  another account;
- two-account realtime share/edit/revoke smoke;
- signed/notarized macOS download and integrity check from a fork-owned release;
- Safe Storage pre-prompt context, sign-in handoff, and unexplained startup-file
  regression check from a clean macOS profile;
- two-device web/desktop/local-file round trip: create on web, open on macOS, make the
  exact scope locally available, apply an external Markdown edit, observe it on web,
  relaunch desktop, and confirm scope/path reconnection;
- independent-deployment macOS build targeting the operator's Convex deployment.

Run only if claimed:

- real Git-to-cloud and cloud-to-Git cutovers using expendable fixtures;
- broader offline/quit-time projection recovery beyond the relaunch continuity needed
  by agent access.

**Exit:** the evidence table has one current production result for every retained
announcement claim and no result is inferred from a development build.

## Phase 5 — Assemble and publish the launch packet

1. Produce the final landing page/README, hosted link, deployment guide, fork-change
   summary, trial disclaimer, license/credits, and known-limitations/backlog link.
2. Draft the tweet from the proven claim list: origin, meaningful additions, hosted
   trial, trial boundary, and independent-deployment link.
3. Complete one final fresh-browser path from the actual tweet links.
4. Tag the exact tested revision and record the deployed backend/frontend revisions.
5. Publish only after every link and retained claim maps to recorded evidence.

## Explicit backlog

These items do not block the recommended minimum launch unless a public claim depends
on them:

- fully self-managed Convex backend/infrastructure support;
- Windows and Linux desktop distribution;
- broad UX polish or redesign beyond the hosted first-use path;
- literal VoiceOver phrase capture and broad reduced-motion review outside claimed
  paths;
- generic recovery dashboards or recovery work beyond the advertised journey;
- unresolved local empty-folder semantics that the launch path does not exercise;
- full vision extraction and agent-init/brain-keeper expansion;
- the retained upstream candidate queue and routine upstream intake;
- internal package namespace cleanup and compatibility-sensitive protocol/app-ID
  changes when they are not publicly visible;
- exhaustive selective-authority acceptance if the launch story omits that feature;
- exhaustive projection recovery beyond the advertised agent-access journey.

## Existing roadmap disposition

| Existing pending work | Disposition for this milestone |
| --- | --- |
| Production-packaged selective folder-authority cutovers | Backlog; the initial launch story explicitly omits Git/cloud movement. |
| Second-Mac cloud/filesystem/quit/offline matrix | Narrow to the web → macOS → local agent edit → web → relaunch path and make that critical; backlog unrelated matrix branches. |
| Safe Storage prompt and unexplained startup-file prompt | Critical for the public macOS first-run journey. |
| Phase 6 recovery completion | Backlog except for defects on a retained launch claim. |
| Production Convex + hosted web deployment | Critical. |
| Signup-cap verification and honest capacity state | Critical. |
| External ops/alerting | Reduce to the best-effort operational floor; no enterprise observability program. |
| Desktop signing/notarization, fork-owned release, and tested revision | Critical. |
| General product polish, full vision extraction, further upstream work | Backlog. |

## Planning references

- Observable contract: `PRODUCT.md`
- Current product authority behavior: `../folder-authority-mobility/PRODUCT.md`
- Current build state: `../../brain/synthesized/roadmap.md`
- Convex managed production overview:
  <https://docs.convex.dev/production/overview>
- Convex self-hosting overview: <https://docs.convex.dev/self-hosting>
