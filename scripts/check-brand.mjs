#!/usr/bin/env node
// Brand manifest validator for the Tubble.md launch (Phase 1).
//
// Purpose: report every PUBLIC brand value that still diverges from
// config/brand.json, every INTENTIONAL compatibility identifier retained per
// config/compatibility.json, and any UNRESOLVED manifest value. A future public
// rename edits config/brand.json first, then this check drives the punch list.
//
// Report-only by default (exit 0) so it does not break existing build gates
// while the rename is in progress. Pass --strict to exit non-zero on any
// divergence or unresolved value — that is the intended pre-launch gate.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");

const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));

const brand = readJson("config/brand.json");
const compat = readJson("config/compatibility.json");

const upstreamRepoSlug = "bholmesdev/hubble.md";
const targetRepoSlug = `${brand.repo.owner}/${brand.repo.name}`;

/**
 * Public surfaces that must reflect the brand manifest. `expect` describes what
 * a fully-renamed value looks like; `divergent` matches the current stale value.
 * Attribution occurrences of the upstream slug are allowed and not counted here.
 */
const publicSurfaces = [
	{
		label: "Root package repository/bugs URLs",
		file: "package.json",
		divergent: (t) => t.includes(upstreamRepoSlug),
	},
	{
		label: "Root package homepage",
		file: "package.json",
		divergent: (t) => JSON.parse(t).homepage !== brand.web.url,
	},
	{
		label: "README hosted-trial URL",
		file: "README.md",
		divergent: (t) => !t.includes(`](${brand.web.url})`),
	},
	{
		label: "README front-door links",
		file: "README.md",
		divergent: (t) => t.includes(`${upstreamRepoSlug}/releases`),
	},
	{
		label: "README release destination",
		file: "README.md",
		divergent: (t) => !t.includes(brand.links.download),
	},
	{
		label: "Contributing guide public identity",
		file: "CONTRIBUTING.md",
		divergent: (t) =>
			/^# Contributing to Hubble$/m.test(t) ||
			/interest in Hubble|idea for Hubble/.test(t),
	},
	{
		label: "Context guide public identity",
		file: "CONTEXT.md",
		divergent: (t) =>
			/^# hubble\.md context$/im.test(t) ||
			/Hubble Cloud|that Hubble runs/.test(t),
	},
	{
		label: "Desktop guide public identity + release owner",
		file: "apps/desktop/README.md",
		divergent: (t) =>
			/Desktop app for Hubble\.md/.test(t) ||
			t.includes(`on \`${upstreamRepoSlug}\``),
	},
	{
		label: "Changelog public identity",
		file: "CHANGELOG.md",
		divergent: (t) => /All notable user-facing changes to Hubble/.test(t),
	},
	{
		label: "Hosted web app tab title",
		file: "apps/www/index.html",
		divergent: (t) => /<title>\s*hubble\.md\s*<\/title>/i.test(t),
	},
	{
		label: "Desktop window title",
		file: "apps/desktop/index.html",
		divergent: (t) => /<title>\s*Hubble\s*<\/title>/i.test(t),
	},
	{
		label: "Desktop productName",
		file: "apps/desktop/package.json",
		divergent: (t) => /"productName"\s*:\s*"Hubble"/.test(t),
	},
	{
		label: "Desktop release publish owner",
		file: "apps/desktop/package.json",
		divergent: (t) => /"owner"\s*:\s*"bholmesdev"/.test(t),
	},
	{
		label: "Desktop dev release presentation",
		file: ".github/workflows/desktop-dev-release.yml",
		divergent: (t) => /Hubble Desktop Dev|Hubble-dev-/.test(t),
	},
	{
		label: "Desktop dev release asset names",
		file: "scripts/create-desktop-dev-manifest.mjs",
		divergent: (t) => /Hubble-dev-/.test(t),
	},
	{
		label: "Desktop appName default",
		file: "apps/desktop/electron/main.ts",
		divergent: (t) => /devAppName\s*\?\?\s*"Hubble"/.test(t),
	},
	{
		label: "Protocol display label",
		file: "apps/desktop/package.json",
		divergent: (t) => /"name"\s*:\s*"Hubble URL"/.test(t),
	},
	{
		label: "SECURITY.md advisory link",
		file: "SECURITY.md",
		divergent: (t) => t.includes(`${upstreamRepoSlug}/security`),
	},
	{
		label: "Auth screen heading copy",
		file: "apps/www/src/auth/AuthScreens.tsx",
		divergent: (t) => /Sign in to Hubble/.test(t),
	},
	{
		label: "Authenticated dashboard identity",
		file: "packages/cloud-ui/src/DashboardScreen.tsx",
		divergent: (t) => />\s*Hubble\s*</.test(t),
	},
	{
		label: "Cloud UI deployment error identity",
		file: "packages/cloud-ui/src/convex-error.ts",
		divergent: (t) => /running the hubble\.md backend/i.test(t),
	},
	{
		label: "Hosted web deployment error identity",
		file: "apps/www/src/connection/convex-error.ts",
		divergent: (t) => /running the hubble\.md backend/i.test(t),
	},
	{
		label: "Guest screen desktop copy + download",
		file: "apps/www/src/screens/GuestFolderScreen.tsx",
		divergent: (t) =>
			/Hubble desktop app/.test(t) || !t.includes(`"${brand.links.download}"`),
	},
];

// Per-package repository/bugs URLs.
for (const pkg of [
	"apps/desktop",
	"apps/www",
	"apps/web",
	"packages/ui",
	"packages/sync",
	"packages/sync-backend",
	"packages/editor",
	"packages/cli",
	"packages/runtime",
	"packages/convex-client",
	"packages/cloud-ui",
	"packages/mcp-server",
]) {
	publicSurfaces.push({
		label: `${pkg} package repository/bugs URLs`,
		file: `${pkg}/package.json`,
		divergent: (t) => t.includes(upstreamRepoSlug),
	});
	publicSurfaces.push({
		label: `${pkg} package homepage`,
		file: `${pkg}/package.json`,
		divergent: (t) => JSON.parse(t).homepage !== brand.web.url,
	});
}

const divergences = [];
for (const s of publicSurfaces) {
	let text;
	try {
		text = read(s.file);
	} catch {
		continue; // file may not exist in every checkout; skip quietly
	}
	if (s.divergent(text)) divergences.push(s);
}

const unresolved = [];
if (
	brand.web?._status === "UNRESOLVED" ||
	String(brand.web?.url).includes("TODO")
) {
	unresolved.push(`brand.web.url — ${brand.web?._todo ?? "unresolved"}`);
}

// --- Report ---------------------------------------------------------------
const bar = "─".repeat(72);
console.log(bar);
console.log(
	`Brand check — target identity: ${brand.displayName}  (${targetRepoSlug})`,
);
console.log(bar);

console.log(
	`\nPUBLIC values still diverging from the manifest (${divergences.length}):`,
);
if (divergences.length === 0) {
	console.log(
		"  ✓ none — all scanned public surfaces match the brand manifest.",
	);
} else {
	for (const d of divergences) console.log(`  ✗ ${d.label}  [${d.file}]`);
}

console.log(`\nUNRESOLVED manifest values (${unresolved.length}):`);
if (unresolved.length === 0) console.log("  ✓ none.");
else for (const u of unresolved) console.log(`  ! ${u}`);

console.log(
	`\nINTENTIONAL compatibility identifiers retained (${compat.retained.length}):`,
);
for (const c of compat.retained)
	console.log(`  • ${c.id} = ${c.value}\n      ${c.where}`);

console.log(`\n${bar}`);
const problems = divergences.length + unresolved.length;
if (problems === 0) {
	console.log(
		"PASS — no divergent public values and no unresolved manifest values.",
	);
	process.exit(0);
}
console.log(
	`${strict ? "FAIL" : "REPORT"} — ${divergences.length} divergent public value(s), ` +
		`${unresolved.length} unresolved. Edit config/brand.json + the source surfaces to resolve.`,
);
process.exit(strict ? 1 : 0);
