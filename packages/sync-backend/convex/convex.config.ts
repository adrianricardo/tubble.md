// SPIKE (Stage 1, realtime-collab): register the prosemirror-sync component.
// See specs/realtime-collab/SPIKE.md. Requires `convex dev` to regenerate
// `_generated/api` so `components.prosemirrorSync` becomes available.

import prosemirrorSync from "@convex-dev/prosemirror-sync/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(prosemirrorSync);

export default app;
