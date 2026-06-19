import { Node } from "@tiptap/core";
import {
	NodeViewWrapper,
	type ReactNodeViewProps,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { desktopApi } from "../desktopApi";
import "./EmbedExtension.css";

type EmbedAttrs = {
	kind?: "iframe";
	src?: string;
};

type EmbedExtensionOptions = {
	workspacePath: string | null;
	filePath: string;
};

type IframeRequest = {
	type?: unknown;
	id?: unknown;
	method?: unknown;
	params?: unknown;
	token?: unknown;
};

const MIN_IFRAME_HEIGHT = 80;
const MAX_IFRAME_HEIGHT = 4000;
const IFRAME_PADDING = 2;

export function createEmbedExtension(options: EmbedExtensionOptions) {
	return Node.create({
		name: "embed",
		group: "block",
		atom: true,
		selectable: true,
		draggable: true,

		addAttributes() {
			return {
				kind: { default: "iframe" },
				src: { default: "" },
			};
		},

		renderHTML({ node }) {
			const attrs = node.attrs as EmbedAttrs;
			return ["iframe", { src: attrs.src ?? "" }];
		},

		addNodeView() {
			return ReactNodeViewRenderer((props) => (
				<EmbedNodeView {...props} options={options} />
			));
		},
	});
}

function EmbedNodeView({
	node,
	options,
}: ReactNodeViewProps & { options: EmbedExtensionOptions }) {
	const attrs = node.attrs as EmbedAttrs;

	return (
		<IframeEmbedNodeView
			attrs={attrs}
			filePath={options.filePath}
			workspacePath={options.workspacePath}
		/>
	);
}

function IframeEmbedNodeView({
	attrs,
	filePath,
	workspacePath,
}: {
	attrs: EmbedAttrs;
	filePath: string;
	workspacePath: string | null;
}) {
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const tokenRef = useRef(crypto.randomUUID());
	const [iframeSrc, setIframeSrc] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [height, setHeight] = useState(MIN_IFRAME_HEIGHT);
	const src = attrs.src ?? "";

	useEffect(() => {
		let cancelled = false;
		setIframeSrc("");
		setError(null);
		setHeight(MIN_IFRAME_HEIGHT);

		if (!isValidIframeSrc(src)) {
			setError("Iframe embed src must be a local .html path.");
			return;
		}

		const { path, suffix } = splitIframeSrc(src);
		const htmlPath = joinPath(dirname(filePath), path);
		const rootPath = workspacePath ?? dirname(filePath);
		void desktopApi
			.resolvePath(htmlPath)
			.then(async (absolutePath) => {
				const absoluteRootPath = await desktopApi.resolvePath(rootPath);
				if (!isPathWithin(absoluteRootPath, absolutePath)) {
					throw new Error("Iframe embed src must stay inside the workspace.");
				}
				return `${toAssetUrl(absolutePath)}${suffix}`;
			})
			.then((iframeSrc) => {
				if (!cancelled) setIframeSrc(iframeSrc);
			})
			.catch((error) => {
				if (!cancelled) {
					setError(error instanceof Error ? error.message : String(error));
				}
			});

		return () => {
			cancelled = true;
		};
	}, [filePath, src, workspacePath]);

	useLayoutEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const data = event.data as {
				type?: unknown;
				height?: unknown;
				token?: unknown;
			} | null;
			if (!isMessageForIframe(data, iframeRef.current)) return;
			if (!data || data.type !== "hubble:embed-height") return;
			const height = Number(data.height);
			if (!Number.isFinite(height)) return;
			const clamped = Math.max(
				MIN_IFRAME_HEIGHT,
				Math.min(MAX_IFRAME_HEIGHT, Math.ceil(height) + IFRAME_PADDING),
			);
			setHeight((current) => (current === clamped ? current : clamped));
		};

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	useLayoutEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const request = event.data as IframeRequest | null;
			if (!isMessageForIframe(request, iframeRef.current)) return;
			if (!request || request.type !== "hubble:request") return;
			void handleIframeRequest(request, workspacePath).then((response) => {
				if (!isWindowProxy(event.source)) return;
				event.source.postMessage(
					{ ...response, id: request.id, type: "hubble:response" },
					"*",
				);
			});
		};

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [workspacePath]);

	return (
		<NodeViewWrapper className="hubble-embed">
			{error ? (
				<p className="hubble-embed-error">{error}</p>
			) : (
				<iframe
					ref={iframeRef}
					className="hubble-iframe-embed"
					height={height}
					name={tokenRef.current}
					title={src || "Hubble iframe embed"}
					sandbox="allow-scripts"
					src={iframeSrc}
					style={{ blockSize: `${height}px` }}
					width="100%"
				/>
			)}
		</NodeViewWrapper>
	);
}

function isWindowProxy(source: MessageEventSource | null): source is Window {
	return Boolean(source && "postMessage" in source);
}

function isMessageForIframe(
	data: { token?: unknown } | null,
	iframe: HTMLIFrameElement | null,
): boolean {
	return typeof data?.token === "string" && data.token === iframe?.name;
}

function joinPath(root: string, ...parts: string[]) {
	const normalizedRoot = root.replace(/[\\/]+$/, "");
	return [normalizedRoot, ...parts].join("/");
}

function dirname(filePath: string): string {
	const normalized = filePath.split("\\").join("/");
	const idx = normalized.lastIndexOf("/");
	if (idx <= 0) return normalized;
	return normalized.slice(0, idx);
}

const BLOCKED_IFRAME_SCHEME = /^(file:|data:|javascript:|hubble-asset:)/i;
const LOCAL_IFRAME_SRC = /^(\.{1,2}\/|[^:/\\]+(?:\/|$)).*\.html(?:[?#].*)?$/i;

/**
 * Iframe embeds may point to workspace-local .html files only. Paths resolve
 * relative to the Markdown file; remote URLs, app-internal schemes, inline code,
 * and local absolute paths are rejected.
 */
function isValidIframeSrc(src: string): boolean {
	if (!src.trim()) return false;
	if (BLOCKED_IFRAME_SCHEME.test(src)) {
		return false;
	}
	if (src.startsWith("/") || src.startsWith("\\") || src.startsWith("//")) {
		return false;
	}
	return LOCAL_IFRAME_SRC.test(src);
}

async function handleIframeRequest(
	request: IframeRequest,
	workspacePath: string | null,
) {
	try {
		if (!workspacePath) {
			throw new Error("Open a workspace to query files.");
		}
		const params =
			request.params && typeof request.params === "object"
				? (request.params as Record<string, unknown>)
				: {};
		if (request.method === "files.list") {
			const glob = typeof params.glob === "string" ? params.glob : "**/*";
			return {
				ok: true,
				value: await desktopApi.listEmbedFiles(workspacePath, glob),
			};
		}
		if (request.method === "files.read") {
			const path = typeof params.path === "string" ? params.path : "";
			if (!isSafeWorkspacePath(path)) {
				throw new Error("File path must be workspace-relative.");
			}
			const absolutePath = await desktopApi.resolvePath(
				joinPath(workspacePath, path),
			);
			return {
				ok: true,
				value: await desktopApi.readFileText(absolutePath),
			};
		}
		throw new Error(`Unknown Hubble iframe method: ${String(request.method)}`);
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function isSafeWorkspacePath(path: string): boolean {
	if (
		!path ||
		path.startsWith("/") ||
		path.startsWith("\\") ||
		path.includes(":")
	)
		return false;
	return !path
		.split(/[\\/]+/)
		.some((part) => part === "" || part === "." || part === "..");
}

function splitIframeSrc(src: string): { path: string; suffix: string } {
	const suffixIndex = src.search(/[?#]/);
	if (suffixIndex === -1) return { path: src, suffix: "" };
	return {
		path: src.slice(0, suffixIndex),
		suffix: src.slice(suffixIndex),
	};
}

function isPathWithin(rootPath: string, path: string): boolean {
	const root = normalizePath(rootPath);
	const candidate = normalizePath(path);
	return candidate === root || candidate.startsWith(`${root}/`);
}

function normalizePath(path: string): string {
	const normalized = path.split("\\").join("/").replace(/\/+$/, "");
	return normalized || "/";
}

function toAssetUrl(path: string): string {
	const normalized = path.split("\\").join("/");
	const absolutePath = normalized.startsWith("/")
		? normalized
		: `/${normalized}`;
	const encodedPath = absolutePath
		.split("/")
		.map((part) => encodeURIComponent(part))
		.join("/");
	const pathWithEncodedRoot = encodedPath.startsWith("/")
		? `%2F${encodedPath.slice(1)}`
		: encodedPath;
	return `hubble-asset://local/${pathWithEncodedRoot}`;
}
