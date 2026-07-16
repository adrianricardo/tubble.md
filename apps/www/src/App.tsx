import { ConvexAuthProvider } from "@convex-dev/auth/react";
import {
	Authenticated,
	AuthLoading,
	ConvexReactClient,
	Unauthenticated,
} from "convex/react";
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
import { AuthStatus, SignInScreen } from "./auth/AuthScreens";
import { clearWorkspace, saveWorkspace } from "./connection/connection";
import { DashboardScreen } from "./screens/DashboardScreen";
import { DeviceAuthScreen } from "./screens/DeviceAuthScreen";
import { GuestFolderScreen } from "./screens/GuestFolderScreen";
import { AppShell } from "./shell/AppShell";

export type TestIdentity = {
	userId: string;
	name: string;
};

const TEST_IDENTITY_STORAGE_KEY = "hubble.testIdentity";

// The product app talks to a single, build-time Convex deployment. The old
// "paste your Convex URL" ConnectScreen is gone (A1a). The test bootstrap url is
// a dev fallback so ?test=1 keeps working when only VITE_TEST_CONVEX_URL is set.
const CONVEX_URL =
	import.meta.env.VITE_CONVEX_URL ?? import.meta.env.VITE_TEST_CONVEX_URL ?? "";

const convexClient = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;

export default function App() {
	if (!convexClient) {
		return <AuthStatus message="VITE_CONVEX_URL is not configured." />;
	}
	return (
		<ConvexAuthProvider client={convexClient}>
			<BrowserRouter>
				<AppRoutes />
			</BrowserRouter>
		</ConvexAuthProvider>
	);
}

function AppRoutes() {
	// ?test=1 stays an anonymous bypass for the realtime POC (see A3 — replaced by
	// real signed-in presence in a later phase). Everything else is auth-gated.
	const [testIdentity, setTestIdentity] = useState<TestIdentity | null>(
		readTestIdentity,
	);

	if (isTestBootstrap()) {
		if (!testIdentity) {
			return (
				<TestIdentityGate
					onSelected={(identity) => {
						writeTestIdentity(identity);
						setTestIdentity(identity);
					}}
				/>
			);
		}
		return <RoutedApp testIdentity={testIdentity} />;
	}

	return (
		<>
			<AuthLoading>
				<AuthStatus message="Checking session…" />
			</AuthLoading>
			<Unauthenticated>
				<SignedOutRoute />
			</Unauthenticated>
			<Authenticated>
				<RoutedApp testIdentity={null} />
			</Authenticated>
		</>
	);
}

// Invite-link (RB2) folder join route: `/folder/<folderId>` and its document
// sub-route. Signed-out visitors must NOT be redirected away from this path —
// unlike every other non-root route, it needs to survive the auth gate so a
// guest who opens the link, then signs in/up, lands right back on the folder
// they were invited to (the URL bar already carries the destination, so no
// separate "restore" step is needed once we stop discarding it here).
const JOIN_ROUTE_PATTERN = /^\/folder\/[^/]+/;

function isJoinRoute(pathname: string): boolean {
	return JOIN_ROUTE_PATTERN.test(pathname);
}

function isDeviceAuthRoute(pathname: string): boolean {
	return pathname === "/device";
}

function SignedOutRoute() {
	const location = useLocation();
	if (isJoinRoute(location.pathname)) {
		return (
			<SignInScreen
				defaultMode="signUp"
				heading="Open your shared folder"
				banner="Someone on your team shared a folder of living docs with you — the same context they (and their agents) work from every day. No code, no install required to read or edit here."
			/>
		);
	}
	if (isDeviceAuthRoute(location.pathname)) {
		return (
			<SignInScreen
				heading="Sign in to approve CLI access"
				banner="After sign-in, you will return to the device approval screen."
			/>
		);
	}
	if (location.pathname !== "/") {
		// Avoid carrying a stale workspace/document route into the next account.
		clearWorkspace();
		return <Navigate to="/" replace />;
	}
	return <SignInScreen />;
}

function RoutedApp({ testIdentity }: { testIdentity: TestIdentity | null }) {
	const navigate = useNavigate();
	return (
		<Routes>
			<Route
				path="/"
				element={
					<HomeRoute
						testIdentity={testIdentity}
						onSelected={(workspaceId) => {
							navigate(withTestSearch(workspaceRoute(workspaceId)));
						}}
						onOpenDocument={(workspaceId, documentId) => {
							navigate(
								withTestSearch(workspaceDocumentRoute(workspaceId, documentId)),
							);
						}}
						onOpenFolder={(folderId) => {
							navigate(`/folder/${encodeURIComponent(folderId)}`);
						}}
					/>
				}
			/>
			<Route
				path="/w/:workspaceId"
				element={<WorkspaceRoute testIdentity={testIdentity} filePath={null} />}
			/>
			<Route
				path="/w/:workspaceId/f/*"
				element={<WorkspaceRoute testIdentity={testIdentity} />}
			/>
			<Route
				path="/w/:workspaceId/d/:documentId"
				element={<WorkspaceRoute testIdentity={testIdentity} filePath={null} />}
			/>
			<Route path="/folder/:folderId" element={<GuestFolderRoute />} />
			<Route
				path="/folder/:folderId/d/:documentId"
				element={<GuestFolderRoute />}
			/>
			<Route path="/device" element={<DeviceAuthScreen />} />
			<Route path="*" element={<Navigate to="/" replace />} />
		</Routes>
	);
}

function GuestFolderRoute() {
	const params = useParams();
	const navigate = useNavigate();
	const folderId = params.folderId;
	const documentId = params.documentId ?? null;
	if (!folderId) return <Navigate to="/" replace />;

	return (
		<GuestFolderScreen
			folderId={folderId}
			documentId={documentId}
			onSelectDocument={(id) => navigate(`/folder/${folderId}/d/${id}`)}
		/>
	);
}

function HomeRoute({
	testIdentity,
	onSelected,
	onOpenDocument,
	onOpenFolder,
}: {
	testIdentity: TestIdentity | null;
	onSelected: (workspaceId: string) => void;
	onOpenDocument: (workspaceId: string, documentId: string) => void;
	onOpenFolder: (folderId: string) => void;
}) {
	// Test bootstrap jumps straight to the configured workspace.
	if (testIdentity) {
		const workspaceId = import.meta.env.VITE_TEST_WORKSPACE_ID;
		if (workspaceId) {
			return (
				<Navigate to={withTestSearch(workspaceRoute(workspaceId))} replace />
			);
		}
	}

	return (
		<DashboardScreen
			onOpenDocument={onOpenDocument}
			onOpenWorkspace={onSelected}
			onOpenFolder={onOpenFolder}
		/>
	);
}

function WorkspaceRoute({
	testIdentity,
	filePath,
}: {
	testIdentity: TestIdentity | null;
	filePath?: string | null;
}) {
	const params = useParams();
	const navigate = useNavigate();
	const workspaceId = params.workspaceId;
	const documentId = params.documentId ?? null;
	const routeFilePath =
		filePath === undefined ? (params["*"] ?? null) : filePath;

	if (!workspaceId) return <Navigate to="/" replace />;

	return (
		<AppShell
			url={CONVEX_URL}
			workspaceId={workspaceId}
			filePath={routeFilePath}
			documentId={documentId}
			testIdentity={testIdentity}
			onSelectFile={(path) => {
				navigate(withTestSearch(workspaceFileRoute(workspaceId, path)));
			}}
			onSelectDocument={(id) => {
				navigate(withTestSearch(workspaceDocumentRoute(workspaceId, id)));
			}}
			onSwitch={(id) => {
				navigate(withTestSearch(workspaceRoute(id)));
			}}
			onWorkspaceLoaded={(id) => {
				saveWorkspace(id);
			}}
			onDisconnect={() => {
				clearWorkspace();
				navigate("/");
			}}
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

function workspaceDocumentRoute(
	workspaceId: string,
	documentId: string,
): string {
	return `${workspaceRoute(workspaceId)}/d/${encodeURIComponent(documentId)}`;
}

function isTestBootstrap(): boolean {
	return new URLSearchParams(window.location.search).get("test") === "1";
}

// In test-bootstrap mode, re-attach the current query string (?test=1&testUser=…)
// to in-app navigation targets so the address-bar URL stays copy-pasteable into
// a second browser/machine. Outside test mode this is a no-op.
function withTestSearch(path: string): string {
	if (!isTestBootstrap()) return path;
	return `${path}${window.location.search}`;
}

function readTestIdentity(): TestIdentity | null {
	const params = new URLSearchParams(window.location.search);
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
