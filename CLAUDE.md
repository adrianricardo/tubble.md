<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Orientation — product brain

For any product/vision/planning work, **read `brain/README.md` first**. The `brain/`
directory is the durable product brain (vision, decision log, open questions, roadmap),
maintained per `brain/BRAINKEEPER.md` + `brain/RESOLVER.md`. Note the **PENDING
EXTRACTION** status there before making vision-level assumptions. Engineering specs:
`specs/realtime-collab/` (current) and `specs/hubble-init/` (agent-init front door);
executed/superseded plans are in `specs/realtime-collab/archive/`.
