import { Node } from "@tiptap/core";
import {
	NodeViewWrapper,
	type ReactNodeViewProps,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { useEffect, useRef } from "react";
import { getActionCtx } from "../store/actions";
import { assetsStore } from "../store/state";
import "./WebEmbedExtension.css";

type EmbedAttrs = {
	name: string;
	tagName: string;
	props: Record<string, string>;
};

type EmbedBundle = {
	mount: (
		shadowRoot: ShadowRoot,
		props: Record<string, string>,
		hubble: HubbleEmbedApi,
	) => undefined | (() => void);
};

type HubbleEmbedApi = {
	listFiles(glob: string): Promise<
		{
			name: string;
			path: string;
			modified_at: number;
			size: number;
		}[]
	>;
};

declare global {
	interface Window {
		__hubbleEmbeds?: Record<string, EmbedBundle>;
	}
}

const EMBED_ELEMENT = "hubble-web-embed-host";
const loadedBundles = new Map<string, Promise<EmbedBundle>>();

export function createWebEmbedExtension(workspaceId: string) {
	return Node.create({
		name: "embed",
		group: "block",
		atom: true,
		selectable: true,
		draggable: true,

		addAttributes() {
			return {
				name: { default: "" },
				tagName: { default: "" },
				props: { default: {} },
			};
		},

		renderHTML({ node }) {
			const attrs = node.attrs as EmbedAttrs;
			return [attrs.tagName || `embed-${attrs.name}`, attrs.props ?? {}];
		},

		addNodeView() {
			return ReactNodeViewRenderer((props) => (
				<WebEmbedNodeView {...props} workspaceId={workspaceId} />
			));
		},
	});
}

class HubbleWebEmbedElement extends HTMLElement {
	#cleanup: (() => void) | null = null;
	#renderVersion = 0;

	connectedCallback() {
		if (!this.shadowRoot) {
			this.attachShadow({ mode: "open" });
		}
		void this.renderEmbed();
	}

	disconnectedCallback() {
		this.#cleanup?.();
		this.#cleanup = null;
		this.#renderVersion += 1;
	}

	static get observedAttributes() {
		return ["embed-name", "workspace-id", "props-json"];
	}

	attributeChangedCallback() {
		if (this.isConnected) void this.renderEmbed();
	}

	async renderEmbed() {
		const shadowRoot = this.shadowRoot;
		if (!shadowRoot) return;

		this.#renderVersion += 1;
		const version = this.#renderVersion;
		this.#cleanup?.();
		this.#cleanup = null;
		shadowRoot.replaceChildren();

		const name = this.getAttribute("embed-name") ?? "";
		const workspaceId = this.getAttribute("workspace-id");
		const props = parseProps(this.getAttribute("props-json"));

		if (!workspaceId) {
			renderError(shadowRoot, "Open a workspace to render embeds.");
			return;
		}
		if (!isValidEmbedName(name)) {
			renderError(shadowRoot, `Invalid embed name: ${name || "(empty)"}`);
			return;
		}

		try {
			const bundle = await loadEmbedBundle(workspaceId, name);
			if (version !== this.#renderVersion) return;
			const cleanup = bundle.mount(
				shadowRoot,
				props,
				createHubbleApi(workspaceId),
			);
			this.#cleanup = typeof cleanup === "function" ? cleanup : null;
		} catch (error) {
			if (version !== this.#renderVersion) return;
			renderError(
				shadowRoot,
				error instanceof Error ? error.message : String(error),
			);
		}
	}
}

if (!customElements.get(EMBED_ELEMENT)) {
	customElements.define(EMBED_ELEMENT, HubbleWebEmbedElement);
}

function WebEmbedNodeView({
	node,
	workspaceId,
}: ReactNodeViewProps & { workspaceId: string }) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const attrs = node.attrs as EmbedAttrs;
	const propsJson = JSON.stringify(attrs.props ?? {});

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		const element = document.createElement(EMBED_ELEMENT);
		element.setAttribute("embed-name", attrs.name);
		element.setAttribute("workspace-id", workspaceId);
		element.setAttribute("props-json", propsJson);
		host.replaceChildren(element);
	}, [attrs.name, propsJson, workspaceId]);

	return (
		<NodeViewWrapper className="hubble-embed">
			<div className="hubble-embed-host" ref={hostRef} />
		</NodeViewWrapper>
	);
}

async function loadEmbedBundle(workspaceId: string, name: string) {
	const bundlePath = `.hubble/embeds/${name}/dist/embed.js`;
	const asset = assetsStore
		.get()
		.find((entry) => entry.path === bundlePath && !entry.deleted);
	if (!asset) throw new Error(`Embed bundle not found: ${bundlePath}`);

	const key = `${workspaceId}\n${name}\n${asset.storageId}\n${asset.contentHash}`;
	const existing = loadedBundles.get(key);
	if (existing) return await existing;

	const loading = loadEmbedBundleUncached(name, asset.storageId);
	loadedBundles.set(key, loading);
	try {
		return await loading;
	} catch (error) {
		loadedBundles.delete(key);
		throw error;
	}
}

async function loadEmbedBundleUncached(name: string, storageId: string) {
	const ctx = getActionCtx();
	if (!ctx) throw new Error("Workspace data source is not ready.");

	const downloadUrl = await ctx.backend.getAssetDownloadUrl(storageId);
	if (!downloadUrl) throw new Error(`Embed bundle blob not found: ${name}`);

	const response = await fetch(downloadUrl);
	if (!response.ok) {
		throw new Error(`Embed bundle failed to load: ${response.status}`);
	}

	const before = window.__hubbleEmbeds?.[name];
	const code = await response.text();
	const url = URL.createObjectURL(
		new Blob([code], { type: "text/javascript" }),
	);
	try {
		await import(/* @vite-ignore */ url);
	} finally {
		URL.revokeObjectURL(url);
	}

	const bundle = window.__hubbleEmbeds?.[name];
	if (!bundle || bundle === before || typeof bundle.mount !== "function") {
		throw new Error(`Embed bundle did not register "${name}".`);
	}
	return bundle;
}

function createHubbleApi(workspaceId: string): HubbleEmbedApi {
	return {
		async listFiles(glob) {
			const ctx = getActionCtx();
			if (!ctx || ctx.workspaceId !== workspaceId) {
				throw new Error("Workspace data source is not ready.");
			}
			const files = await ctx.backend.getFiles(workspaceId);
			return files
				.filter((file) => !file.deleted)
				.filter((file) => !isPrivatePath(file.path))
				.filter((file) => matchesGlob(file.path, glob))
				.map((file) => ({
					name: file.path.split("/").pop() || file.path,
					path: file.path,
					modified_at: Math.floor(file.updatedAt / 1000),
					size: new TextEncoder().encode(file.content).byteLength,
				}))
				.sort((a, b) => a.path.localeCompare(b.path));
		},
	};
}

function renderError(shadowRoot: ShadowRoot, message: string) {
	const error = document.createElement("p");
	error.className = "hubble-embed-error";
	error.textContent = message;
	shadowRoot.append(error);
}

function parseProps(raw: string | null): Record<string, string> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
			return {};
		return Object.fromEntries(
			Object.entries(parsed).map(([key, value]) => [key, String(value)]),
		);
	} catch {
		return {};
	}
}

function isPrivatePath(path: string) {
	return path === ".hubble" || path.startsWith(".hubble/");
}

function matchesGlob(relativePath: string, glob: string): boolean {
	if (glob === "" || glob === "**" || glob === "**/*") return true;
	let source = "";
	for (let index = 0; index < glob.length; index += 1) {
		const char = glob[index];
		const next = glob[index + 1];
		const afterNext = glob[index + 2];
		if (char === "*" && next === "*" && afterNext === "/") {
			source += "(?:.*/)?";
			index += 2;
		} else if (char === "*" && next === "*") {
			source += ".*";
			index += 1;
		} else if (char === "*") {
			source += "[^/]*";
		} else {
			source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
		}
	}
	return new RegExp(`^${source}$`).test(relativePath);
}

function isValidEmbedName(name: string) {
	return /^[a-z0-9][a-z0-9-]*$/.test(name);
}
