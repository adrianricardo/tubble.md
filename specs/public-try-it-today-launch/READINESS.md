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
- Frontend revision `fce0a1eb1250892d5512d5dee24d03a58542dcf6` was the first
  authenticated-branding build, deployed as Worker version
  `7e6d5f82-a52a-4909-9dbf-28306a33094a`.
- Public `main` merge revision `56345cef1097041083d3f35efcff05fec2c6830d` is now
  active as Cloudflare Worker version `87470941-99aa-4077-acba-ddd4fd1c020f` at
  `https://tubble.nopalstudio.com`. Wrangler 4.111.0 reports that version at 100%
  with the existing custom-domain route. The deployed HTML references
  `assets/index-jzJ2yh7Z.js`; the production endpoint is present and the artifact
  contains no development deployment, test-variable, private-key, or signup-control
  marker.
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

## Clean-browser public-link audit — 2026-07-16T19:50Z

The literal every-link browser run used Chrome 150 with a new temporary profile and
the normal macOS resolver. The profile began with **0 cookies** and no saved local app
configuration. Every page rendered signed out; GitHub showed **Sign in**, X used only
guest state, and the hosted trial retained zero cookies/local-storage/session-storage
entries. No account or credential was created or supplied. The managed in-app browser
was attempted first and remains blocked because Apple rejects its bundled
`classic-level.node` signature; no macOS security setting was weakened.

Duplicate occurrences of the same destination are collapsed below. Relative README
targets are recorded as the public `main`-branch destinations a visitor receives from
GitHub.

| Tracked destination | Browser result | Ownership / brand / session result |
| --- | --- | --- |
| Fork repository / public README | **200**, stayed at `github.com/adrianricardo/tubble.md` | Fork-owned and anonymous, but public `main` still renders the old Hubble README/tagline at commit `3b22657`; the current Tubble documentation commit is not public. **Fail.** |
| Original Hubble repository | **200**, no redirect | Correctly upstream-owned and labeled as attribution in the tracked README; anonymous. **Pass.** |
| `twitter.com/bholmesdev` | **200**, redirected to `x.com/bholmesdev` | Correct upstream-author profile and guest-only browser state. **Pass.** |
| Fork `releases/latest` (README + download UI) | **200**, redirected to the fork releases index | Fork-owned, but there is no stable latest release. The visible artifact is the unsigned `desktop-dev-latest` prerelease for `d0a2cc1`, not a launch build. Link resolves, but download metadata is **not launch-ready**. |
| Fork releases index | **200**, no redirect | Fork-owned, visibly titled “Tubble Desktop Dev (latest),” anonymous. **Pass as a destination; release gate remains pending.** |
| `CONTRIBUTING.md` on fork `main` | **200**, no redirect | Fork-owned, but the public file still says “Contributing to Hubble.” Current linked public copy is stale. **Fail brand check.** |
| Original `hubble-skills` repository | **200**, no redirect | Correct upstream-owned functional dependency and attribution; anonymous. **Pass.** |
| `https://tubble.nopalstudio.com` | **200**, normalized to trailing slash | Tubble title, “Sign in to Tubble,” complete trial warning and deploy link; zero browser storage/cookies. **Pass.** |
| Convex | **200**, redirected to `www.convex.dev` | Expected managed-backend provider brand; anonymous. **Pass.** |
| `DEPLOY.md` on fork `main` (README + www copy) | **404**, no redirect | GitHub explicitly reports that `main` lacks the path. **Fail.** |
| Node.js download | **200**, no redirect | Expected Node.js download page; anonymous. **Pass.** |
| pnpm installation | **200**, no redirect | Expected pnpm installation page; anonymous. **Pass.** |
| `apps/desktop/README.md` on fork `main` | **200**, no redirect | Fork-owned, but visible copy still says “Desktop app for Hubble.md” and names the upstream release destination. **Fail brand/ownership check.** |
| `config/compatibility.json` on fork `main` | **404**, no redirect | GitHub explicitly reports that `main` lacks the path. **Fail.** |
| `config/brand.json` on fork `main` | **404**, no redirect | GitHub explicitly reports that `main` lacks the path. **Fail.** |
| `CONTEXT.md` on fork `main` | **200**, no redirect | Fork-owned, but visible title/copy still presents `hubble.md`/Hubble. **Fail brand check.** |
| `CODE_OF_CONDUCT.md` on fork `main` | **200**, no redirect | Fork-owned Contributor Covenant content; anonymous. **Pass.** |
| `SECURITY.md` on fork `main` | **200**, no redirect | Fork-owned, but public copy still says Hubble because the current Tubble security update is not public. **Fail brand check.** |
| `LICENSE` on fork `main` | **200**, no redirect | Fork-owned MIT page with the required upstream notice. **Pass.** |
| Fork private-advisory form | **200**, redirected to GitHub sign-in with the fork advisory URL preserved in `return_to` | Expected authentication boundary for private reporting; no saved GitHub session leaked. **Pass.** |

Release metadata was inspected without downloading or replacing assets. The existing
prerelease is `desktop-dev-latest`, published `2026-07-14T01:01:29Z`, targeting
`d0a2cc16bf29d943d9074c1942e7ef600d548844`. Its manifest is 538 bytes with SHA-256
`4cbc5c2ed9e326fa885aea3ca41c992c522cb2bbc6c8bb37b5171e5da0072df4`; its existing
ZIPs are still named `Hubble-dev-arm64-mac.zip` (138,830,397 bytes, SHA-256
`60efbc81b6e2b400f5960bcf566122b6ca5a3609c325489edeb31d6b397dc469`) and
`Hubble-dev-x64-mac.zip` (144,625,561 bytes, SHA-256
`47b3aca943c793dcf06170fc05e8f4cb6f4545f86ab39d1c8c3bda7048c59e86`). These
immutable development assets were not downloaded, relabeled, or replaced.

**Gate result: fail, with complete browser evidence.** The exact next gate is to land
the current Tubble documentation/brand files on the public repository, correct the
tracked linked documents that still expose stale Hubble ownership/brand, redeploy the
www build containing the final public links, and rerun this isolated-browser table.
No push or deployment is authorized by this record. DEPLOY-5 becomes the next major
gate only after this link audit passes.

## Clean-browser remediation and passing rerun — 2026-07-16T21:30Z

PR [#7](https://github.com/adrianricardo/tubble.md/pull/7) merged the release branch
into public `main` as `56345cef1097041083d3f35efcff05fec2c6830d`. The remediation
corrected the public contribution, desktop, and context identity;
published `DEPLOY.md` plus both brand JSON files; expanded strict brand coverage; and
replaced the misleading `releases/latest` download claim with an honestly labeled
fork-owned releases index. The existing unsigned development assets were not changed.

The www build from that exact merge revision targeted production Convex
`rugged-mastiff-510` and was deployed to Worker version
`87470941-99aa-4077-acba-ddd4fd1c020f`, confirmed at 100%. A new Chrome 150 profile
then began with **0 cookies** and opened every unique tracked destination. GitHub
rendered anonymous **Sign in** state, X used guest-only state, and the hosted trial
retained zero cookies/local-storage/session-storage entries. No account or credential
was supplied. The temporary profile was deleted after the run.

| Tracked destination | Passing browser result |
| --- | --- |
| Fork repository / public README | **200**, fork-owned Tubble README and “Try it today” copy |
| Original Hubble repository | **200**, correctly labeled upstream attribution |
| Upstream author | **200**, redirected `twitter.com` → `x.com/bholmesdev` |
| Fork releases index (README + download UI) | **200**, fork-owned “Tubble Desktop Dev (latest)” with visible unsigned-development metadata |
| `CONTRIBUTING.md` | **200**, “Contributing to Tubble” |
| Original `hubble-skills` repository | **200**, correctly labeled upstream dependency |
| `https://tubble.nopalstudio.com` | **200**, trailing-slash normalization, Tubble auth/trial/deploy copy, zero browser storage |
| Convex | **200**, redirected to `www.convex.dev` with expected provider brand |
| `DEPLOY.md` (README + www copy) | **200**, “Deploy your own Tubble.md” and independent-deployment warning |
| Node.js download | **200**, expected Node.js download page |
| pnpm installation | **200**, expected pnpm installation page |
| `apps/desktop/README.md` | **200**, Tubble identity and fork-owned release destination |
| `config/compatibility.json` | **200**, intentional compatibility identifiers including retained app ID |
| `config/brand.json` | **200**, Tubble identity and production URL |
| `CONTEXT.md` | **200**, Tubble context and cloud terminology |
| `CODE_OF_CONDUCT.md` | **200**, fork-owned Contributor Covenant content |
| `SECURITY.md` | **200**, Tubble identity and fork-owned private advisory destination |
| `LICENSE` | **200**, fork-owned MIT page with required upstream notice |
| Private-advisory form | **200**, expected redirect to GitHub sign-in with the fork advisory URL preserved in `return_to` |

**Gate result: pass.** Phase 1 step 6 is complete. This does not complete the separate
signed/notarized public macOS release gate: current public copy explicitly labels the
existing artifacts as unsigned development builds. The exact next major launch gate is
Phase 2 DEPLOY-5, which requires a second operator using their own Convex account,
host, and Mac.

## Pending before launch

| Area | Required evidence | Status / dependency |
| --- | --- | --- |
| Public destination | Configure DNS/TLS/hosting for the selected temporary URL, deploy Tubble there, verify control, then set it in `config/brand.json`, README, and package homepages. A dedicated custom domain comes later. | **Complete at `https://tubble.nopalstudio.com`; DNS, TLS, SPA hosting, app control, and brand boundary verified.** |
| Fresh-browser links | Open every README, download, security, and www public destination in a clean browser. | **Complete.** Public `main` revision `56345ce` and Worker version `87470941-99aa-4077-acba-ddd4fd1c020f` passed all 19 unique tracked destinations from a 0-cookie isolated profile. Expected Twitter/Convex/GitHub-auth redirects were recorded; no auth/session leakage appeared. Existing macOS artifacts remain explicitly labeled unsigned development builds. |
| Independent deployment | A second operator follows `DEPLOY.md` from a clean clone, records corrections, and proves web create/edit/reload plus macOS sign-in/local-agent edit on their deployment. | **Needs a second operator, Convex account, host, and Mac.** |
| Production trial | Create a production Convex project separate from development, configure auth/secrets, deploy the backend, host `apps/www` against it, and record backend/frontend revisions. | **Infrastructure complete: backend `c40f963`, public-main frontend `56345ce` / Worker `87470941-99aa-4077-acba-ddd4fd1c020f`, auth and real URL verified; approved smoke identities now exist.** |
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
