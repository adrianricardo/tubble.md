import { useState } from "react";
import { disconnect, readConnection } from "./connection/connection";
import { ConnectScreen } from "./screens/ConnectScreen";
import { OpenWorkspaceScreen } from "./screens/OpenWorkspaceScreen";
import { AppShell } from "./shell/AppShell";

type Route =
	| { kind: "connect" }
	| { kind: "open-workspace"; url: string }
	| { kind: "shell"; url: string; workspaceId: string };

function initialRoute(): Route {
	const stored = readConnection();
	if (!stored) return { kind: "connect" };
	if (!stored.workspaceId) {
		return { kind: "open-workspace", url: stored.url };
	}
	return {
		kind: "shell",
		url: stored.url,
		workspaceId: stored.workspaceId,
	};
}

export default function App() {
	const [route, setRoute] = useState<Route>(initialRoute);

	const handleDisconnect = () => {
		disconnect();
		setRoute({ kind: "connect" });
	};

	if (route.kind === "connect") {
		return (
			<ConnectScreen
				onConnected={(url) => setRoute({ kind: "open-workspace", url })}
			/>
		);
	}

	if (route.kind === "open-workspace") {
		return (
			<OpenWorkspaceScreen
				url={route.url}
				onSelected={(workspaceId) =>
					setRoute({ kind: "shell", url: route.url, workspaceId })
				}
				onDisconnect={handleDisconnect}
			/>
		);
	}

	return (
		<AppShell
			url={route.url}
			workspaceId={route.workspaceId}
			onSwitch={(id) => {
				setRoute({ kind: "shell", url: route.url, workspaceId: id });
			}}
			onDisconnect={handleDisconnect}
		/>
	);
}
