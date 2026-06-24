import { useState } from "react";
import {
	BrowserRouter,
	Navigate,
	Route,
	Routes,
	useLocation,
	useNavigate,
	useParams,
} from "react-router";
import { disconnect, readConnection } from "./connection/connection";
import { ConnectScreen } from "./screens/ConnectScreen";
import { OpenWorkspaceScreen } from "./screens/OpenWorkspaceScreen";
import { AppShell } from "./shell/AppShell";
import { workspaceStore } from "./store/state";

export type TestIdentity = {
	userId: string;
	name: string;
};

type Connection = {
	url: string;
	workspaceId: string | null;
	testIdentity: TestIdentity | null;
};

const TEST_IDENTITY_STORAGE_KEY = "hubble.testIdentity";

function initialConnection(): Connection | null {
	const testConnection = readTestBootstrap();
	if (testConnection) return testConnection;
	const storedConnection = readConnection();
	return storedConnection ? { ...storedConnection, testIdentity: null } : null;
}

// Agent test bootstrap: navigating to /?test=1 skips the connect + workspace
// screens by reading VITE_TEST_CONVEX_URL / VITE_TEST_WORKSPACE_ID from
// apps/www/.env.local. Without the query param the env vars are inert, so
// human dev sessions are unaffected.
function readTestBootstrap(): Connection | null {
	const params = new URLSearchParams(window.location.search);
	if (params.get("test") !== "1") return null;
	const url = import.meta.env.VITE_TEST_CONVEX_URL;
	const workspaceId = import.meta.env.VITE_TEST_WORKSPACE_ID;
	if (!url || !workspaceId) {
		console.warn(
			"?test=1 set but VITE_TEST_CONVEX_URL / VITE_TEST_WORKSPACE_ID are missing — falling back to normal routing.",
		);
		return null;
	}
	return { url, workspaceId, testIdentity: readTestIdentity(params) };
}

export default function App() {
	return (
		<BrowserRouter>
			<AppRoutes />
		</BrowserRouter>
	);
}

function AppRoutes() {
	const [connection, setConnection] = useState<Connection | null>(
		initialConnection,
	);
	const navigate = useNavigate();
	const location = useLocation();

	const handleDisconnect = () => {
		disconnect();
		setConnection(null);
		navigate("/", { replace: true });
	};

	const handleConnected = (url: string) => {
		setConnection({
			url,
			workspaceId: getWorkspaceIdFromPath(location.pathname),
			testIdentity: null,
		});
	};

	const handleWorkspaceLoaded = (workspaceId: string) => {
		setConnection((current) =>
			current ? { ...current, workspaceId } : current,
		);
	};

	const handleTestIdentitySelected = (identity: TestIdentity) => {
		writeTestIdentity(identity);
		setConnection((current) =>
			current ? { ...current, testIdentity: identity } : current,
		);
	};

	return (
		<Routes>
			<Route
				path="/"
				element={
					<HomeRoute
						connection={connection}
						onConnected={handleConnected}
						onSelected={(workspaceId) => {
							handleWorkspaceLoaded(workspaceId);
							navigate(workspaceRoute(workspaceId));
						}}
						onTestIdentitySelected={handleTestIdentitySelected}
						onDisconnect={handleDisconnect}
					/>
				}
			/>
			<Route
				path="/w/:workspaceId"
				element={
					<WorkspaceRoute
						connection={connection}
						filePath={null}
						onConnected={handleConnected}
						onTestIdentitySelected={handleTestIdentitySelected}
						onWorkspaceLoaded={handleWorkspaceLoaded}
						onDisconnect={handleDisconnect}
					/>
				}
			/>
			<Route
				path="/w/:workspaceId/f/*"
				element={
					<WorkspaceRoute
						connection={connection}
						onConnected={handleConnected}
						onTestIdentitySelected={handleTestIdentitySelected}
						onWorkspaceLoaded={handleWorkspaceLoaded}
						onDisconnect={handleDisconnect}
					/>
				}
			/>
			<Route path="*" element={<Navigate to="/" replace />} />
		</Routes>
	);
}

function HomeRoute({
	connection,
	onConnected,
	onSelected,
	onTestIdentitySelected,
	onDisconnect,
}: {
	connection: Connection | null;
	onConnected: (url: string) => void;
	onSelected: (workspaceId: string) => void;
	onTestIdentitySelected: (identity: TestIdentity) => void;
	onDisconnect: () => void;
}) {
	if (!connection) {
		return <ConnectScreen onConnected={onConnected} />;
	}

	if (connection.workspaceId && !connection.testIdentity && isTestBootstrap()) {
		return <TestIdentityGate onSelected={onTestIdentitySelected} />;
	}

	if (connection.workspaceId) {
		const lastOpenedPath =
			workspaceStore.get().lastOpenedPaths[connection.workspaceId];
		return (
			<Navigate
				to={
					lastOpenedPath
						? workspaceFileRoute(connection.workspaceId, lastOpenedPath)
						: workspaceRoute(connection.workspaceId)
				}
				replace
			/>
		);
	}

	return (
		<OpenWorkspaceScreen
			url={connection.url}
			onSelected={onSelected}
			onDisconnect={onDisconnect}
		/>
	);
}

function WorkspaceRoute({
	connection,
	filePath,
	onConnected,
	onTestIdentitySelected,
	onWorkspaceLoaded,
	onDisconnect,
}: {
	connection: Connection | null;
	filePath?: string | null;
	onConnected: (url: string) => void;
	onTestIdentitySelected: (identity: TestIdentity) => void;
	onWorkspaceLoaded: (workspaceId: string) => void;
	onDisconnect: () => void;
}) {
	const params = useParams();
	const navigate = useNavigate();
	const workspaceId = params.workspaceId;
	const routeFilePath =
		filePath === undefined ? (params["*"] ?? null) : filePath;

	if (!workspaceId) return <Navigate to="/" replace />;

	if (!connection) {
		return <ConnectScreen onConnected={onConnected} />;
	}

	if (!connection.testIdentity && isTestBootstrap()) {
		return <TestIdentityGate onSelected={onTestIdentitySelected} />;
	}

	return (
		<AppShell
			url={connection.url}
			workspaceId={workspaceId}
			filePath={routeFilePath}
			testIdentity={connection.testIdentity}
			onSelectFile={(path) => {
				navigate(workspaceFileRoute(workspaceId, path));
			}}
			onSwitch={(id) => {
				navigate(workspaceRoute(id));
			}}
			onWorkspaceLoaded={onWorkspaceLoaded}
			onDisconnect={onDisconnect}
		/>
	);
}

function workspaceRoute(workspaceId: string): string {
	return `/w/${encodeURIComponent(workspaceId)}`;
}

function workspaceFileRoute(workspaceId: string, path: string): string {
	return `${workspaceRoute(workspaceId)}/f/${path
		.split("/")
		.map(encodeURIComponent)
		.join("/")}`;
}

function getWorkspaceIdFromPath(pathname: string): string | null {
	const match = /^\/w\/([^/]+)/.exec(pathname);
	return match ? decodeURIComponent(match[1]) : null;
}

function isTestBootstrap(): boolean {
	return new URLSearchParams(window.location.search).get("test") === "1";
}

function readTestIdentity(params: URLSearchParams): TestIdentity | null {
	const queryName = params.get("testUser")?.trim();
	if (queryName) {
		const identity = identityFromName(queryName);
		writeTestIdentity(identity);
		return identity;
	}

	const raw = window.sessionStorage.getItem(TEST_IDENTITY_STORAGE_KEY);
	if (!raw) return null;

	try {
		const value = JSON.parse(raw) as Partial<TestIdentity>;
		if (!value.userId || !value.name) return null;
		return { userId: value.userId, name: value.name };
	} catch {
		return null;
	}
}

function writeTestIdentity(identity: TestIdentity): void {
	window.sessionStorage.setItem(
		TEST_IDENTITY_STORAGE_KEY,
		JSON.stringify(identity),
	);
}

function identityFromName(name: string): TestIdentity {
	return {
		userId: `poc:${slugify(name)}`,
		name,
	};
}

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "user"
	);
}

function TestIdentityGate({
	onSelected,
}: {
	onSelected: (identity: TestIdentity) => void;
}) {
	const [name, setName] = useState("");

	return (
		<main className="flex h-dvh items-center justify-center bg-background text-foreground [padding-block:1.5rem] [padding-inline:1.5rem]">
			<form
				onSubmit={(event) => {
					event.preventDefault();
					const trimmed = name.trim();
					if (!trimmed) return;
					onSelected(identityFromName(trimmed));
				}}
				className="w-full max-w-sm rounded-sm border border-border bg-card [padding-block:1rem] [padding-inline:1rem]"
			>
				<label
					htmlFor="test-identity"
					className="block text-sm font-medium text-foreground"
				>
					Test collaborator
				</label>
				<input
					id="test-identity"
					type="text"
					required
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Ada"
					className="mt-3 w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
				/>
				<button
					type="submit"
					className="mt-3 w-full rounded-sm bg-primary text-sm font-medium text-primary-foreground [padding-block:0.5rem] [padding-inline:0.75rem]"
				>
					Continue
				</button>
			</form>
		</main>
	);
}
