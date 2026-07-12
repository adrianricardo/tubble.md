import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";

const [releaseDirArg, commit, version] = process.argv.slice(2);
if (!releaseDirArg || !commit || !version) {
	throw new Error(
		"Usage: node scripts/create-desktop-dev-manifest.mjs <release-dir> <commit> <version>",
	);
}

const releaseDir = path.resolve(releaseDirArg);
const entries = await fs.readdir(releaseDir);
const sourceZips = entries.filter(
	(name) =>
		name.endsWith("-mac.zip") &&
		!name.startsWith("Hubble-dev-") &&
		!name.endsWith(".blockmap"),
);

const sourcesByArch = new Map();
for (const name of sourceZips) {
	const arch = name.includes("arm64") ? "arm64" : "x64";
	if (sourcesByArch.has(arch)) {
		throw new Error(`Found multiple ${arch} desktop zip artifacts.`);
	}
	sourcesByArch.set(arch, name);
}

for (const arch of ["arm64", "x64"]) {
	if (!sourcesByArch.has(arch)) {
		throw new Error(`Missing ${arch} desktop zip artifact in ${releaseDir}.`);
	}
}

const assets = [];
for (const arch of ["arm64", "x64"]) {
	const source = path.join(releaseDir, sourcesByArch.get(arch));
	const name = `Hubble-dev-${arch}-mac.zip`;
	const destination = path.join(releaseDir, name);
	await fs.copyFile(source, destination);
	const stat = await fs.stat(destination);
	assets.push({
		arch,
		name,
		size: stat.size,
		sha256: await sha256File(destination),
	});
}

const manifest = {
	schemaVersion: 1,
	tag: "desktop-dev-latest",
	commit,
	version,
	assets,
};
await fs.writeFile(
	path.join(releaseDir, "desktop-dev-manifest.json"),
	`${JSON.stringify(manifest, null, 2)}\n`,
);

async function sha256File(filePath) {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(filePath)) hash.update(chunk);
	return hash.digest("hex");
}
