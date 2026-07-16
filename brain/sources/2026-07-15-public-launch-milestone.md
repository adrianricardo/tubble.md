# Public “try it today” launch direction — 2026-07-15

## Source

Adrian set a new near-term milestone in a Codex planning session on 2026-07-15.
This capture records the direction before synthesis; it does not fill unresolved
choices with inferred decisions.

## Direction

- The next milestone should make a truthful public announcement possible: this
  project was forked from the original Hubble repository, these are the meaningful
  additions, and people can try it today.
- A hosted cloud environment should let a visitor create an account and start using
  the product immediately.
- The hosted environment is not promised as a permanently maintained or
  production-grade service. People should not rely on it for critical work.
- People who want greater production confidence should deploy their own instance,
  and the GitHub repository must contain credible instructions for doing so.
- The fork needs a distinct product name before the announcement.
- The purpose of this pass is planning and prioritization, not implementation.
- Existing roadmap work that does not directly support this announcement should be
  pushed to backlog rather than allowed to delay the milestone.

## Planning questions still awaiting Adrian

1. Does the supported self-deployment promise mean using the operator's own managed
   Convex project and web host, or running every infrastructure component on servers
   the operator controls?
2. Does “try it today” promise only the hosted web app, or also a public macOS desktop
   download for local files and agents?
3. How deep must the pre-launch rename go beyond public-facing product, repository,
   website, release, and documentation surfaces?
4. What is the new product name?

## Follow-up decisions

Adrian accepted the recommended defaults:

- The supported independent-deployment path uses the operator's own managed Convex
  production project rather than promising fully self-managed infrastructure.
- Launch includes both the hosted web app and a public macOS desktop app because the
  desktop app provides the local filesystem path agents need.
- The launch rename targets public-facing surfaces. Compatibility-sensitive internal
  identifiers may remain when they are intentionally documented and not presented as
  the public brand.
- Brand values should be centralized so another public rename does not require an
  unstructured repository-wide replacement.

## Name selection

Adrian selected **Tubble.md** as the launch name: a playful reference to the original
Hubble.md fork. It is intentionally allowed to be transitional, so the centralized
brand boundary remains a launch requirement rather than cleanup for a hypothetical
future.

## Evidence available to planning

- The current repository already contains email/password signup, a per-day signup
  cap, a browser app, desktop release workflows, cloud collaboration, local
  projections, and selective Git/cloud folder-authority work.
- The current public metadata, download links, application identity, protocol, and
  package namespaces still contain Hubble or point to the original repository.
- Convex documents two distinct operator paths: a managed production deployment and
  a self-hosted open-source backend. The latter should not be implied by generic
  “self-host” copy unless this project verifies and supports it explicitly.
