# Public launch readiness

**Updated:** 2026-07-16

This is the claim-shaped evidence index for the public “try it today” milestone. A
gate is complete only when its result comes from the real public production path or
the independent deployment named by the gate. Development and code-level evidence is
recorded as progress, not promoted into launch proof.

## Completed repository work

- Tubble identity, fork attribution, compatibility boundary, public copy, repository
  destinations, release presentation, and brand validation are implemented.
- The independent-deployment guide covers managed Convex, web hosting, auth, desktop
  targeting, data ownership, backup/export expectations, upgrades, and teardown.
- Signup shows the best-effort trial boundary before submission.
- Signup capacity is enforced at 100 accounts per UTC day. Signed-out clients can see
  the reached-cap state before submission, and operators can pause new accounts with
  `LAUNCH_SIGNUPS_DISABLED` without blocking existing sign-in.
- All public links pass the signed-out HTTP audit and all relative repository targets
  exist.

These results still need to be included in the exact revision deployed and released.

## Pending before launch

| Area | Required evidence | Status / dependency |
| --- | --- | --- |
| Public destination | Set the operated HTTPS trial URL in `config/brand.json`, README, and package homepages; verify control. | **Needs Adrian's URL and hosting control.** |
| Fresh-browser links | Open every README, download, security, and www public destination in a clean browser. | **Pending.** HTTP fallback passes; the in-app browser cannot currently start because its native module has an invalid local signature. |
| Independent deployment | A second operator follows `DEPLOY.md` from a clean clone, records corrections, and proves web create/edit/reload plus macOS sign-in/local-agent edit on their deployment. | **Needs a second operator, Convex account, host, and Mac.** |
| Production trial | Create a production Convex project separate from development, configure auth/secrets, deploy the backend, host `apps/www` against it, and record backend/frontend revisions. | **Not started; needs production accounts and destination.** |
| Trial first use | From signed out on the real URL: see the trial boundary and availability, create an account/private Workspace/document, reload, sign out/in, and recover the same content. | **Pending production deployment.** |
| Trial failure states | Verify reached-cap, operator-pause, outage, deployment mismatch, and unavailable-account copy on the production configuration. | **Implementation exists for cap/pause; production evidence pending.** |
| Operational floor | Name deployment ownership; prove secret rotation/revocation, error visibility, pause/reopen signups, backup/export, and a service/retirement notice path. | **Partially documented; operator choices and production drills pending.** |
| Production configuration | Audit production environment, build output, repository history, and release assets for leaked secrets or unintended development/test targets and fixtures. | **Pending production deployment.** |
| Private Workspace isolation | With two production accounts, prove account B cannot discover or read account A's private Workspace/document. | **Pending production deployment and two accounts.** |
| Realtime sharing | With two production accounts, prove share, simultaneous edit, revoke, and post-revocation denial. | **Pending production deployment and two accounts.** |
| Public macOS release | Build the exact tested revision, sign and notarize it under the fork identity, publish it to a fork-owned release, publish integrity information, and verify download/install/update destinations. | **Pending signing credentials, release revision/tag, and publication.** |
| macOS first run | From a clean profile, verify pre-prompt Safe Storage context, expected Tubble identity, sign-in handoff, and no unexplained startup-file prompt. | **Pending signed production build and clean profile.** |
| Hosted agent round trip | Web create → same account/content on macOS → make exact scope locally available → external Markdown edit → observe on web → relaunch desktop → confirm same scope/path reconnects. | **Pending production web, signed desktop, and two-device acceptance.** |
| Independent desktop identity | Build macOS against the second operator's deployment, verify the target is visible, and prove it never falls back to the public trial. | **Pending independent deployment gate.** |
| Launch packet | Finalize README/landing links, proven fork-change summary, trial disclaimer, credits/license, known limitations, and deployment guide status. | **Pending the evidence above and final URL.** |
| Announcement and publication | Draft the announcement only from passing claims; rerun its actual links in a fresh browser; tag the tested revision; record deployed revisions; publish. | **Final gate; no tag, production release, announcement, or launch publication yet.** |

## Explicitly not launch-blocking

Selective Git/cloud authority cutovers, broad offline/quit-time recovery, comments and
history claims, exhaustive recovery, Windows/Linux distribution, general editor
polish, the retained upstream queue, and full vision extraction remain backlog unless
a defect in one of them compromises a retained launch path.
