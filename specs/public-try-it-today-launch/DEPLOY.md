# Deploy your own Tubble.md (independent deployment)

**Status:** Phase 2 draft. This guide is written from the codebase but has **not yet
been followed end-to-end from a clean clone by a second operator** (Phase 2 step 4 /
`PRODUCT.md` DEPLOY-5). Until the verification record at the bottom is filled in, treat
every command as *expected* rather than *proven*. Record every correction as you go.

## What "independent deployment" means here

The launch-supported topology is an **independent deployment**, not a fully self-hosted
stack:

| You own / operate | Managed dependency you rely on |
| --- | --- |
| The Convex **production project** (your account, your data) | Convex's hosted platform runs the backend |
| The **web host** serving the built web app | Your static/CDN host (Vercel, Netlify, Cloudflare Pages, S3+CDN, …) |
| A **desktop build** targeting your deployment, and its release/update destination | Apple notarization (for a signed macOS build) |

**Fully self-hosted** (running Convex's open-source backend, storage, and auth entirely
on infrastructure you control) is explicitly **out of scope** for this launch and is not
verified here. Do not describe this guide as self-hosting.

## Prerequisites

- A [Convex](https://convex.dev) account (free tier is enough to evaluate).
- Node.js ([download](https://nodejs.org/en/download)) and
  [pnpm](https://pnpm.io/installation).
- A static web host you control for the built web app.
- macOS + Xcode Command Line Tools (`xcode-select --install`) **only if** you want to
  build the desktop app. An [Apple Developer](https://developer.apple.com) account is
  needed to sign/notarize a distributable macOS build (an unsigned local build works for
  your own machine).
- Expected cost / limits: Convex free tier for evaluation; static hosting is typically
  free at this scale. There is no other paid dependency for the web-only path. Account
  signups are capped (see [Auth behavior](#auth-behavior)).

## Topology at a glance

```
                    build-time VITE_CONVEX_URL
  apps/www (web)  ─────────────────────────────►  Convex prod deployment
  desktop build   ─────────────────────────────►  (packages/sync-backend)
        ▲                                              │
        │  SITE_URL (points auth/handoff back)         │  JWT_PRIVATE_KEY, JWKS,
        └──────────────────────────────────────────────┘  SITE_URL env vars
```

- **Backend working directory:** `packages/sync-backend` (Convex functions + schema +
  the registered `prosemirror-sync` realtime component).
- **Web app:** `apps/www` (React + Convex). This is the product front door.
- **Landing page (optional):** `apps/web` (Astro). Not required for the app to work.

## Step 1 — Clone and install

```sh
git clone https://github.com/adrianricardo/tubble.md.git
cd tubble.md
pnpm install
```

## Step 2 — Create your Convex project and deploy the backend

From `packages/sync-backend`:

```sh
cd packages/sync-backend
npx convex dev        # first run: log in, create/select a project, links this dir
```

The first `convex dev` run creates `.env.local` with `CONVEX_DEPLOYMENT` and provisions
a **development** deployment. It also pushes the schema and the `prosemirror-sync`
component. Leave it running while you configure auth (next step), then stop it.

When you are ready for the real (production) deployment:

```sh
npx convex deploy     # pushes functions + component to your PRODUCTION deployment
```

Note the two URLs Convex gives you for the production deployment — you'll need both:

- the **`.convex.cloud`** URL → this is `VITE_CONVEX_URL` (client API endpoint);
- the **`.convex.site`** URL → this is the auth domain (`CONVEX_SITE_URL`, provided
  automatically to the deployment).

## Step 3 — Configure authentication

Tubble uses [Convex Auth](https://labs.convex.dev/auth) with an email + password
provider. Convex Auth needs signing keys and a site URL set as **deployment environment
variables**.

Initialize the auth keys (sets `JWT_PRIVATE_KEY` and `JWKS` on the deployment):

```sh
# from packages/sync-backend, targeting your deployment
npx @convex-dev/auth
```

Then set `SITE_URL` on the deployment to the public URL where you will host the web app
(used by the desktop sign-in handoff and auth redirects — the backend throws
`SITE_URL is not configured` without it):

```sh
npx convex env set SITE_URL https://YOUR-WEB-APP-URL        # e.g. https://app.example.com
# optional: override the default session lifetime
# npx convex env set AUTH_SESSION_TOTAL_DURATION_MS 2592000000
```

Required deployment env vars, to confirm with `npx convex env list`:

| Var | Source | Purpose |
| --- | --- | --- |
| `JWT_PRIVATE_KEY` | set by `npx @convex-dev/auth` | signs auth tokens |
| `JWKS` | set by `npx @convex-dev/auth` | public keyset for verification |
| `SITE_URL` | you set it (placeholder above) | public web app URL for redirects/handoff |
| `CONVEX_SITE_URL` | provided automatically by Convex | auth domain (`.convex.site`) |
| `AUTH_SESSION_TOTAL_DURATION_MS` | optional | session lifetime override |
| `LAUNCH_SIGNUPS_DISABLED` | optional; you set it | set to `true` to pause new accounts while preserving sign-in |

> Secrets are represented only by placeholders here. Never commit `.env.local`,
> `JWT_PRIVATE_KEY`, or any deployment secret.

### Auth behavior

- Email + password signup, one private starter Workspace created per account on first
  login (`ensurePersonalWorkspace`).
- **Signups are capped at 100 per UTC day** (`DAILY_SIGNUP_CAP` in
  `packages/sync-backend/convex/auth.ts`). This is a code constant; change and redeploy
  to adjust the capacity. Over the cap, the signed-out app disables signup before
  submission and explains when it reopens. The backend enforces the cap again during
  account creation.
- To pause new accounts without blocking existing users, set
  `LAUNCH_SIGNUPS_DISABLED=true` on the deployment. The signed-out app shows the pause
  before submission and the backend enforces it again. Reopen signups by removing the
  variable:

  ```sh
  npx convex env set LAUNCH_SIGNUPS_DISABLED true
  npx convex env remove LAUNCH_SIGNUPS_DISABLED
  ```
- The desktop app signs in via a short-lived single-use handoff code, not by copying a
  long-lived token.

## Step 4 — Build and host the web app

Bake your production Convex URL into the web build and deploy the static output:

```sh
# from repo root
echo "VITE_CONVEX_URL=https://YOUR-DEPLOYMENT.convex.cloud" > apps/www/.env.local
pnpm --filter @hubble.md/www build       # outputs apps/www/dist
```

Deploy `apps/www/dist` to your static host. Make sure the host serves it as a SPA
(fallback unknown routes to `index.html`). Confirm the hosted URL matches the `SITE_URL`
you set in Step 3.

> `VITE_CONVEX_URL` is baked in at build time and is not a secret (it is a public client
> endpoint). There is no runtime "paste your Convex URL" screen.

## Step 5 — (Optional) Build a desktop app targeting your deployment

The public desktop binary from `adrianricardo/tubble.md` talks to the **public hosted
trial**. To give your users a desktop app that talks to **your** deployment, build your
own, pointed at your Convex URL:

```sh
# from repo root
echo "VITE_CONVEX_URL=https://YOUR-DEPLOYMENT.convex.cloud" > apps/desktop/.env.local
pnpm bundle:desktop        # production bundle under apps/desktop/release/
```

- **Surface parity (DEPLOY-4):** the desktop app must be built against the same
  deployment as your web app so accounts and content match across surfaces.
- **Independent identity (DEPLOY-6):** a desktop build for your deployment must visibly
  identify that deployment and must not silently fall back to the public hosted trial.
  Set `HUBBLE_DESKTOP_UPDATE_URL` to your own release feed rather than the fork's.
- Signing/notarization for distribution requires your Apple Developer identity; an
  unsigned local build is fine for your own testing.

## Data, backups, upgrades, teardown

- **Where your data lives:** entirely in your Convex production deployment (documents,
  folders, membership, ProseMirror sync state, uploaded assets in Convex file storage).
- **Backups / export:** use Convex's export (`npx convex export`) on a cadence you
  choose. There is no built-in scheduled backup — you own this.
- **Upgrades:** `git pull`, `pnpm install`, re-run `npx convex deploy` from
  `packages/sync-backend`, then rebuild/redeploy the web app (and desktop app if you
  ship one). Review schema/migration notes in the changelog before deploying.
- **Teardown:** delete the Convex project from the Convex dashboard and remove the web
  host deployment. That removes all hosted data.

## Verification record (DEPLOY-5 — REQUIRED before this guide is "proven")

To be completed by an operator **other than the guide author**, from a clean clone, with
no unpublished knowledge:

- [ ] Deployed backend + web app from a clean clone following only this guide
- [ ] Deployed URL: `__________`
- [ ] Revision/commit deployed: `__________`
- [ ] Topology (managed Convex prod + which web host): `__________`
- [ ] Web create → edit → reload persistence verified
- [ ] macOS sign-in against this deployment + a local-agent Markdown round trip verified
- [ ] Deviations / corrections needed (list every one; repeat until none remain):
  - `__________`

Until this section is filled, the launch claim "you can deploy your own" is **not yet
supported by evidence** and must be labeled forthcoming.
