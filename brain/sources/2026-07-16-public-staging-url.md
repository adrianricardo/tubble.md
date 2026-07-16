# Public staging URL selection

Date: 2026-07-16

Adrian selected `https://tubble.adriantavares.com` as Tubble.md's temporary public
staging URL for the “try it today” milestone. It may serve as the hosted trial front
door while the launch path is tested. A dedicated custom domain will replace it later.

Selecting the URL does not by itself prove DNS, hosting, TLS, or application control.
Those remain acceptance gates before the repository publishes the URL as operational.

## Same-day replacement and control proof

Adrian replaced the staging selection with `https://tubble.nopalstudio.com` and asked
to refresh Cloudflare authentication. Wrangler authenticated as `adrian@nopalstudio.com`
to the Nopal Studio account. The hosted trial was then deployed on a Cloudflare Worker
custom domain and verified before the repository URL boundary was resolved.
