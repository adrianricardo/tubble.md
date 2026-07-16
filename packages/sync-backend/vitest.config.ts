import { defineConfig } from "vitest/config";

// convex-test runs Convex functions in-process; the edge-runtime environment
// matches the Convex runtime (no Node globals). See guidelines.md "Testing".
export default defineConfig({
	test: {
		environment: "edge-runtime",
		server: { deps: { inline: ["convex-test"] } },
		include: ["convex/**/*.test.ts"],
	},
});
