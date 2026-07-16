# Public “try it today” launch

## Summary

The fork launches as **Tubble.md**, with an honest account of its Hubble lineage and
additions. A visitor can try a clearly labeled, non-critical hosted cloud service
immediately or follow verified repository instructions to operate an independent
deployment. Tubble.md may be renamed later without changing this launch contract.

## Goals

- Make the announcement “I forked this, added these capabilities, and you can try it
  today” literally true.
- Give the fork a distinct public identity while preserving prominent upstream
  attribution.
- Make the hosted service useful for evaluation without implying an uptime,
  durability, support, or indefinite-maintenance guarantee.
- Give operators an independent-deployment path that has actually been followed from
  a clean clone.
- Ship hosted web for immediate use and macOS desktop for local agent access.
- Keep launch scope bounded by the claims made publicly.

## Non-goals

- Presenting the hosted service as suitable for critical, sensitive, regulated, or
  irreplaceable data.
- Promising a service-level agreement, support response time, maintenance term, or
  permanent free tier.
- Shipping every unfinished roadmap item or resolving the broader pending vision
  extraction.
- Claiming fully self-managed infrastructure unless that exact topology is documented
  and verified.
- Removing upstream copyright, license, or provenance.

## Behavior

### Identity and fork story

1. **IDENTITY-1 — Distinct public name.** The product, repository presentation,
   website, hosted app, release presentation, and primary documentation use
   **Tubble.md** consistently before announcement.
2. **IDENTITY-2 — Honest lineage.** The README and public about/credits surface state
   that the project is a fork of Hubble.md, name and link the original repository,
   preserve required license notices, and do not imply that upstream maintains or
   endorses the fork.
3. **IDENTITY-3 — Intentional compatibility.** Any user-visible legacy Hubble name,
   link, application identity, or protocol retained for compatibility is documented
   as such. Accidental stale branding is not shipped.
4. **STORY-1 — Verifiable additions.** The launch page and README use the same short,
   evidence-backed list of meaningful additions since the fork. Each claimed
   capability links to either a usable product path or documentation; commit count is
   not used as a substitute for user value.
5. **STORY-2 — Honest availability.** A capability appears in the announcement only
   if a new visitor can use it through the advertised surface on launch day.

### Hosted trial

6. **TRIAL-1 — Immediate start.** From the public link, a signed-out visitor can
   create an account, enter a private starter Workspace, create or open Markdown, and
   return to it after a reload without operator help.
7. **TRIAL-2 — Clear service status.** Before the visitor puts meaningful content in
   the hosted service, concise copy identifies it as a best-effort public trial and
   says it is not intended for critical or irreplaceable work.
8. **TRIAL-3 — Concrete limits.** The trial explanation makes no uptime, backup,
   support, security-review, or indefinite-maintenance promise. It recommends keeping
   independent copies and points to the independent-deployment path for operators who
   need more control.
9. **TRIAL-4 — No dark pattern.** The limitation is visible in the signup/first-use
   journey and public documentation without becoming a recurring modal during normal
   editing.
10. **TRIAL-5 — Capacity honesty.** If account creation is capped, paused, or closed,
    the visitor sees that state before completing signup and retains access to
    self-deployment instructions.
11. **TRIAL-6 — Failure honesty.** A hosted outage, deployment mismatch, or
    unavailable account path fails with a human-readable status and never directs the
    visitor to treat local browser state as a durable cloud save.

### Independent deployment

12. **DEPLOY-1 — Named support boundary.** The launch-supported route is an
    **independent deployment** using the operator's own managed Convex production
    project and web host. The repository names those managed dependencies and reserves
    **fully self-hosted** for a future verified stack whose backend, storage, auth, and
    frontend all run under the operator's control.
13. **DEPLOY-2 — Clean-clone guide.** A technically competent operator can start from
    a clean clone, create the required service accounts or infrastructure, configure
    secrets and public URLs, deploy the backend and web app, create the first account,
    and verify persistence by following one linear guide.
14. **DEPLOY-3 — Complete inventory.** The guide names prerequisites, supported
    topology, expected costs or third-party limits, environment variables, auth
    behavior, build/deploy commands, data location, backups/exports, upgrades, and
    teardown. Secrets are represented only by placeholders.
15. **DEPLOY-4 — Surface parity.** An independent deployment supports web plus macOS
    desktop. The guide explains how the operator builds a desktop app targeting their
    deployment; the public desktop binary never silently connects to someone else's
    backend.
16. **DEPLOY-5 — Proof, not plausibility.** Before launch, someone other than the guide
    author follows it from a clean clone and records the deployed URL, revision,
    topology, deviations, a web create/edit/reload result, and a macOS sign-in/local
    agent edit result against that independent deployment. Unverified variants are
    labeled experimental or omitted.

### macOS agent access

17. **DESKTOP-1 — Owned download.** The public macOS download is built from the exact
    launch revision, identifies the fork's public name and publisher, and comes from a
    fork-owned release destination with integrity information.
18. **DESKTOP-2 — Expected macOS trust journey.** Installation, first launch,
    signing/notarization, Safe Storage access, sign-in handoff, and updates use the
    fork's identity and explain any unavoidable system prompt before the user must
    decide.
19. **DESKTOP-3 — Same account and content.** A hosted-trial user can sign into the
    macOS app and reach the same Workspace and Markdown they created on web without
    entering a backend URL or repeating account creation.
20. **DESKTOP-4 — Exact local agent path.** From the current cloud Workspace or shared
    folder, a user can make that exact scope available at a named local path, point a
    local agent at it, and see an external Markdown edit synchronize back to the web
    document.
21. **DESKTOP-5 — Relaunch continuity.** After macOS app relaunch and account-session
    refresh, the selected local path reconnects to the same scope without silently
    switching deployments, widening accessible content, or requiring the user to
    recreate it.
22. **DESKTOP-6 — Independent desktop identity.** A desktop app built for an
    independent deployment visibly identifies that deployment during setup or account
    access and cannot silently fall back to the public hosted trial.

### Launch surface and trust

23. **LAUNCH-1 — One front door.** The announcement links to one public landing or
    README location that offers **Try the hosted trial** and **Deploy your own** as
    clearly different paths.
24. **LAUNCH-2 — Claim-shaped acceptance.** Every public claim has a corresponding
    launch check. A failed nonessential check removes or narrows the claim instead of
    automatically expanding the milestone.
25. **LAUNCH-3 — Fresh-user proof.** The final acceptance run begins in a signed-out
    browser with no local configuration and reaches a persisted Markdown document
    through the hosted path.
26. **LAUNCH-4 — Agent-access proof.** The final launch gate continues from the hosted
    web document into the public macOS app, makes its exact cloud scope available
    locally, applies an external Markdown edit, observes that edit on web, and proves
    reconnection after desktop relaunch. Broader Git/cloud movement remains
    claim-conditional.
27. **LAUNCH-5 — Attribution-consistent destinations.** Public links, download
    buttons, update metadata, issue links, and documentation resolve to the fork's
    owned destinations except for clearly labeled upstream attribution links.
