import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs, constants as fsConstants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const DEFAULT_RELEASE_REPO = "adrianricardo/hubble.md";
const DEFAULT_RELEASE_TAG = "desktop-dev-latest";
const MANIFEST_ASSET_NAME = "desktop-dev-manifest.json";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type ReleaseAsset = {
	name: string;
	size: number;
	browser_download_url: string;
};

type GitHubRelease = {
	tag_name: string;
	assets: ReleaseAsset[];
};

export type DesktopDevManifest = {
	schemaVersion: 1;
	tag: string;
	commit: string;
	version: string;
	assets: Array<{
		arch: "arm64" | "x64";
		name: string;
		size: number;
		sha256: string;
	}>;
};

export type DesktopReleaseSelection = {
	version: string;
	commit: string;
	asset: ReleaseAsset;
	expectedSha256: string;
};

export async function findInstalledHubbleApp(): Promise<string | null> {
	if (process.platform !== "darwin") return null;
	const roots = ["/Applications", path.join(homedir(), "Applications")];
	for (const root of roots) {
		const match = await findAppInDirectory(root);
		if (match) return match;
	}

	const spotlight = await spawnForOutput("mdfind", [
		"kMDItemContentType == 'com.apple.application-bundle' && kMDItemFSName == 'Hubble*.app'",
	]).catch(() => "");
	return (
		spotlight
			.split("\n")
			.map((entry) => entry.trim())
			.filter(
				(entry) =>
					entry.startsWith("/Applications/") ||
					entry.startsWith(`${path.join(homedir(), "Applications")}/`),
			)
			.find((entry) => entry.endsWith(".app")) ?? null
	);
}

export async function installDesktopDevRelease({
	fetchImpl = fetch,
	releaseRepo = process.env.HUBBLE_DESKTOP_RELEASE_REPO ?? DEFAULT_RELEASE_REPO,
	releaseTag = process.env.HUBBLE_DESKTOP_RELEASE_TAG ?? DEFAULT_RELEASE_TAG,
}: {
	fetchImpl?: FetchLike;
	releaseRepo?: string;
	releaseTag?: string;
} = {}): Promise<{ appPath: string; version: string; commit: string }> {
	if (process.platform !== "darwin") {
		throw new Error(
			"Hubble desktop installation is currently supported on macOS only.",
		);
	}
	const apiUrl = `https://api.github.com/repos/${releaseRepo}/releases/tags/${releaseTag}`;
	const release = await fetchJson<GitHubRelease>(fetchImpl, apiUrl);
	const manifestAsset = release.assets.find(
		(asset) => asset.name === MANIFEST_ASSET_NAME,
	);
	if (!manifestAsset) {
		throw new Error(
			`Release ${releaseTag} has no ${MANIFEST_ASSET_NAME} asset.`,
		);
	}
	const manifest = await fetchJson<DesktopDevManifest>(
		fetchImpl,
		manifestAsset.browser_download_url,
	);
	const selection = selectDesktopRelease(release, manifest, process.arch);
	const tempRoot = await fs.mkdtemp(path.join(tmpdir(), "hubble-desktop-"));
	try {
		const zipPath = path.join(tempRoot, selection.asset.name);
		await downloadVerifiedAsset(fetchImpl, selection, zipPath);
		const extractedDir = path.join(tempRoot, "extracted");
		await fs.mkdir(extractedDir);
		await spawnAndWait("ditto", ["-x", "-k", zipPath, extractedDir]);
		const appBundle = await findAppBundle(extractedDir);
		if (!appBundle)
			throw new Error(
				"Downloaded desktop archive contains no Hubble app bundle.",
			);
		const appPath = path.join("/Applications", path.basename(appBundle));
		await installAppBundle(appBundle, appPath);
		return {
			appPath,
			version: selection.version,
			commit: selection.commit,
		};
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true });
	}
}

export function selectDesktopRelease(
	release: GitHubRelease,
	manifest: DesktopDevManifest,
	arch: string,
): DesktopReleaseSelection {
	if (manifest.schemaVersion !== 1) {
		throw new Error(
			`Unsupported desktop release manifest schema ${manifest.schemaVersion}.`,
		);
	}
	if (manifest.tag !== release.tag_name) {
		throw new Error(
			`Desktop manifest tag ${manifest.tag} does not match release ${release.tag_name}.`,
		);
	}
	if (arch !== "arm64" && arch !== "x64") {
		throw new Error(
			`No Hubble desktop build is available for architecture ${arch}.`,
		);
	}
	const manifestAsset = manifest.assets.find((asset) => asset.arch === arch);
	if (!manifestAsset) {
		throw new Error(`Desktop manifest has no ${arch} artifact.`);
	}
	const releaseAsset = release.assets.find(
		(asset) => asset.name === manifestAsset.name,
	);
	if (!releaseAsset) {
		throw new Error(`Release has no ${manifestAsset.name} asset.`);
	}
	if (releaseAsset.size !== manifestAsset.size) {
		throw new Error(
			`Release metadata size for ${releaseAsset.name} does not match its manifest.`,
		);
	}
	if (!/^[a-f0-9]{64}$/.test(manifestAsset.sha256)) {
		throw new Error(
			`Desktop manifest has an invalid SHA-256 for ${releaseAsset.name}.`,
		);
	}
	return {
		version: manifest.version,
		commit: manifest.commit,
		asset: releaseAsset,
		expectedSha256: manifestAsset.sha256,
	};
}

export async function downloadVerifiedAsset(
	fetchImpl: FetchLike,
	selection: DesktopReleaseSelection,
	destination: string,
) {
	const response = await fetchImpl(selection.asset.browser_download_url, {
		headers: { Accept: "application/octet-stream" },
	});
	if (!response.ok) {
		throw new Error(
			`Desktop download failed (${response.status} ${response.statusText}).`,
		);
	}
	if (!response.body)
		throw new Error("Desktop download returned no response body.");
	const output = await fs.open(destination, "w", 0o600);
	const hash = createHash("sha256");
	let downloadedSize = 0;
	try {
		const reader = response.body.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			downloadedSize += value.byteLength;
			hash.update(value);
			let offset = 0;
			while (offset < value.byteLength) {
				const { bytesWritten } = await output.write(
					value,
					offset,
					value.byteLength - offset,
				);
				if (bytesWritten === 0) {
					throw new Error(
						"Desktop download stopped writing before completion.",
					);
				}
				offset += bytesWritten;
			}
		}
	} finally {
		await output.close();
	}
	if (downloadedSize !== selection.asset.size) {
		throw new Error(
			`Desktop download size mismatch: expected ${selection.asset.size}, received ${downloadedSize}.`,
		);
	}
	const sha256 = hash.digest("hex");
	if (sha256 !== selection.expectedSha256) {
		throw new Error("Desktop download failed SHA-256 verification.");
	}
}

async function fetchJson<T>(fetchImpl: FetchLike, url: string): Promise<T> {
	const response = await fetchImpl(url, {
		headers: { Accept: "application/vnd.github+json" },
	});
	if (!response.ok) {
		throw new Error(
			`GitHub release request failed (${response.status} ${response.statusText}).`,
		);
	}
	return (await response.json()) as T;
}

async function findAppInDirectory(root: string): Promise<string | null> {
	try {
		const entries = await fs.readdir(root, { withFileTypes: true });
		const app = entries
			.filter(
				(entry) => entry.isDirectory() && /^Hubble.*\.app$/.test(entry.name),
			)
			.sort((left, right) => {
				if (left.name === "Hubble.app") return -1;
				if (right.name === "Hubble.app") return 1;
				return left.name.localeCompare(right.name);
			})[0];
		return app ? path.join(root, app.name) : null;
	} catch {
		return null;
	}
}

async function findAppBundle(root: string): Promise<string | null> {
	const direct = await findAppInDirectory(root);
	if (direct) return direct;
	const entries = await fs.readdir(root, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const nested = await findAppInDirectory(path.join(root, entry.name));
		if (nested) return nested;
	}
	return null;
}

async function installAppBundle(source: string, destination: string) {
	const canWriteApplications = await fs
		.access("/Applications", fsConstants.W_OK)
		.then(() => true)
		.catch(() => false);
	if (canWriteApplications) {
		await fs.rm(destination, { recursive: true, force: true });
		await spawnAndWait("ditto", [source, destination]);
		return;
	}
	await spawnAndWait("osascript", [
		"-e",
		"on run argv",
		"-e",
		'do shell script "/bin/rm -rf " & quoted form of item 2 of argv & "; /usr/bin/ditto " & quoted form of item 1 of argv & " " & quoted form of item 2 of argv with administrator privileges',
		"-e",
		"end run",
		source,
		destination,
	]);
}

function spawnAndWait(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: "ignore" });
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${command} exited ${code}`));
		});
	});
}

function spawnForOutput(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
		let output = "";
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			output += chunk;
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolve(output);
			else reject(new Error(`${command} exited ${code}`));
		});
	});
}
