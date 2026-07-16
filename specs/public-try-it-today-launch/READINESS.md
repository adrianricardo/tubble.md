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
- The hosted-trial URL is resolved through the brand boundary: `config/brand.json`,
  README, and all 13 package homepages use `https://tubble.nopalstudio.com`.

These results still need to be included in the exact revision deployed and released.

## Production infrastructure evidence

- Managed Convex production deployment `rugged-mastiff-510` is separate from the
  development deployment `strong-setter-709`. Before the first production push it
  reported no tables; after deployment its `users` table reported no documents. No
  development fixtures were copied or seeded.
- Backend revision `c40f963ea4abb65b7ede7e74028c59c6b2f118a7` is deployed at
  `https://rugged-mastiff-510.convex.cloud`, including the `prosemirrorSync`
  component. The deploy completed schema validation and installed the component.
- Production Convex Auth has `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS` configured.
  Values were set directly through authenticated CLI flows and were neither printed
  nor committed. `SITE_URL` targets `https://tubble.nopalstudio.com`.
- The production web artifact built successfully against
  `https://rugged-mastiff-510.convex.cloud`; an artifact scan found the production
  URL and no development deployment, test-variable, or private-key markers.
- Frontend revision `fce0a1eb1250892d5512d5dee24d03a58542dcf6` is active as
  Cloudflare Worker version `7e6d5f82-a52a-4909-9dbf-28306a33094a` at
  `https://tubble.nopalstudio.com`. Wrangler reports that version at 100% with one
  custom-domain route. Six consecutive bare-root checks returned the new asset after
  the edge cache converged.
- Public DNS returns Cloudflare A/AAAA addresses. HTTPS returns HTTP/2 200 through
  Cloudflare with a valid `*.nopalstudio.com` certificate; an unknown path also returns
  the SPA document with 200. The page title is `tubble.md`.
- A fresh isolated Chrome profile reached the real URL signed out and rendered “Sign
  in to Tubble,” the complete best-effort/no-guarantee warning, the independent-copy
  recommendation, the self-deployment link, and both sign-in/account-creation paths.
  The production `auth:signupAvailability` query returned `available`.
  The in-app browser plugin remains locally unavailable because its bundled native
  module has an invalid signature; this acceptance used Chrome DevTools from a new
  profile with no saved cookies or local app configuration.
- First-account smoke identity `tubble-smoke-20260716182713@example.com` was created
  after Adrian's action-time approval. Its private starter Space appeared with no
  teams or shares. `Hosted Trial Persistence 2026-07-16` retained the exact marker
  `Hosted trial persistence smoke marker 2026-07-16T18:29:19.146Z` across a
  cache-bypassing reload. One accidental extra Untitled document was soft-deleted;
  production has one active smoke document for this account.
- That signed-in run exposed a stale `HUBBLE` dashboard label. Commit `fce0a1e` fixes
  the dashboard and deployment-error copy, extends strict brand coverage, and is
  deployed/verified as `TUBBLE`. Cloud UI tests pass 10/10, web tests 7/7, www
  typecheck and `pnpm build:desktop` pass.
- Sign-out/sign-in recovery remains unproven for the first identity because its
  generated password was intentionally kept only in volatile browser memory and was
  discarded when the headless renderer had to restart. Creating a replacement
  identity required renewed action-time approval.
- At `2026-07-16T18:52:43Z`, the normal macOS resolver returned Cloudflare A/AAAA
  addresses for `tubble.nopalstudio.com` and an ordinary HTTPS request returned 200.
  No DNS-cache flush or Cloudflare change was needed. At `2026-07-16T18:54:01Z`, a
  new isolated Chrome profile reached the same URL signed out and rendered the Tubble
  auth surface plus the complete best-effort trial warning. The in-app browser plugin
  remains unavailable because Apple reports its bundled native certificate as revoked;
  the clean Chrome fallback used the normal system resolver and no saved profile data.
- With Adrian's action-time approval, a disposable identity was created at
  `2026-07-16T18:58:34Z`; a verifier capitalization error discarded its volatile
  secret immediately after signup. It has one private starter Space and no documents.
  With renewed approval, the replacement identity was created at
  `2026-07-16T19:06:51Z`. Its secret was rotated three times through the authenticated
  production operator path while resuming verifier mismatches against the same approved
  test, never printed or committed, and discarded after final sign-out/profile cleanup.
- The replacement's private `Tubble Disposable QA's space 2` showed no teams, shared
  content, development target, account-A content, or other production account/Space.
  It created one active `Untitled` document containing the exact marker
  `Tubble production persistence boundary 2026-07-16T19:15:21.833Z 028af91fe1fe`.
  The marker survived a cache-bypassing reload at `2026-07-16T19:15:32Z`.
- The replacement signed out, its private document URL redirected to the signed-out
  root without exposing the marker, and the same identity signed back in. The same
  private Space and document returned, and the exact marker was recovered at
  `2026-07-16T19:16:39Z`. A direct request for account A's private document returned
  only the production denial error—no editor or account-A marker—while account B's own
  document remained readable. A final sign-out and private-route denial passed at
  `2026-07-16T19:18:08Z`.

## Pending before launch

| Area | Required evidence | Status / dependency |
| --- | --- | --- |
| Public destination | Configure DNS/TLS/hosting for the selected temporary URL, deploy Tubble there, verify control, then set it in `config/brand.json`, README, and package homepages. A dedicated custom domain comes later. | **Complete at `https://tubble.nopalstudio.com`; DNS, TLS, SPA hosting, app control, and brand boundary verified.** |
| Fresh-browser links | Open every README, download, security, and www public destination in a clean browser. | **Pending full every-link pass.** HTTP fallback and a clean isolated-Chrome public-root pass succeed; the in-app browser cannot start because Apple reports its bundled native certificate as revoked. |
| Independent deployment | A second operator follows `DEPLOY.md` from a clean clone, records corrections, and proves web create/edit/reload plus macOS sign-in/local-agent edit on their deployment. | **Needs a second operator, Convex account, host, and Mac.** |
| Production trial | Create a production Convex project separate from development, configure auth/secrets, deploy the backend, host `apps/www` against it, and record backend/frontend revisions. | **Infrastructure complete: backend `c40f963`, frontend `fce0a1e`, auth and real URL verified; approved smoke identities now exist.** |
| Trial first use | From signed out on the real URL: see the trial boundary and availability, create an account/private Workspace/document, reload, sign out/in, and recover the same content. | **Complete on production.** The replacement disposable identity passed signup, private Space, create/edit, cache-bypassing reload, sign-out denial, same-identity sign-in, and exact marker recovery. |
| Trial failure states | Verify reached-cap, operator-pause, outage, deployment mismatch, and unavailable-account copy on the production configuration. | **Implementation exists for cap/pause; production evidence pending.** |
| Operational floor | Name deployment ownership; prove secret rotation/revocation, error visibility, pause/reopen signups, backup/export, and a service/retirement notice path. | **Partially documented; operator choices and production drills pending.** |
| Production configuration | Audit production environment, build output, repository history, and release assets for leaked secrets or unintended development/test targets and fixtures. | **Backend/frontend environment and web artifact pass: production endpoint present; no dev deployment, test-variable, private-key markers, or development fixtures appeared. Production now contains approved smoke/user data. Desktop release assets remain a later gate.** |
| Private Workspace isolation | With two production accounts, prove account B cannot discover or read account A's private Workspace/document. | **Complete on production.** Account B's dashboard/search exposed no account-A or unrelated content; account A's direct private-document URL returned no document/editor/marker; account B's own document remained readable afterward. |
| Realtime sharing | With two production accounts, prove share, simultaneous edit, revoke, and post-revocation denial. | **Pending the production two-account share/edit/revoke smoke; infrastructure and accounts exist.** |
| Public macOS release | Build the exact tested revision, sign and notarize it under the fork identity, publish it to a fork-owned release, publish integrity information, and verify download/install/update destinations. | **Pending signing credentials, release revision/tag, and publication.** |
| macOS first run | From a clean profile, verify pre-prompt Safe Storage context, expected Tubble identity, sign-in handoff, and no unexplained startup-file prompt. | **Pending signed production build and clean profile.** |
| Hosted agent round trip | Web create → same account/content on macOS → make exact scope locally available → external Markdown edit → observe on web → relaunch desktop → confirm same scope/path reconnects. | **Pending production web, signed desktop, and two-device acceptance.** |
| Independent desktop identity | Build macOS against the second operator's deployment, verify the target is visible, and prove it never falls back to the public trial. | **Pending independent deployment gate.** |
| Launch packet | Finalize README/landing links, proven fork-change summary, trial disclaimer, credits/license, known limitations, and deployment guide status. | **URL, README trial link, disclaimer, credits, and deployment-guide status are current; remaining claim evidence still gates finalization.** |
| Announcement and publication | Draft the announcement only from passing claims; rerun its actual links in a fresh browser; tag the tested revision; record deployed revisions; publish. | **Final gate; no tag, production release, announcement, or launch publication yet.** |

## Explicitly not launch-blocking

Selective Git/cloud authority cutovers, broad offline/quit-time recovery, comments and
history claims, exhaustive recovery, Windows/Linux distribution, general editor
polish, the retained upstream queue, and full vision extraction remain backlog unless
a defect in one of them compromises a retained launch path.
