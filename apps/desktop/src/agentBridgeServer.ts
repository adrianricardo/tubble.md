import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	applyCurrentDocumentEdit,
	clearCurrentAgentPresence,
	getCurrentDocumentSnapshot,
	getCurrentDocumentState,
	setCurrentAgentPresence,
} from "./agentBridge";

type BridgeRequest = {
	id: number;
	method: string;
	payload: unknown;
};

async function handleBridgeRequest(request: BridgeRequest): Promise<unknown> {
	switch (request.method) {
		case "get_state":
			return getCurrentDocumentState();

		case "get_snapshot":
			return getCurrentDocumentSnapshot();

		case "apply_edit":
			return applyCurrentDocumentEdit(
				request.payload as Parameters<typeof applyCurrentDocumentEdit>[0],
			);

		case "set_presence":
			return setCurrentAgentPresence(
				request.payload as Parameters<typeof setCurrentAgentPresence>[0],
			);

		case "clear_presence":
			clearCurrentAgentPresence();
			return null;

		default:
			return { error: `unknown bridge method: ${request.method}` };
	}
}

export async function startAgentBridgeListener(): Promise<() => void> {
	const unlisten = await listen<BridgeRequest>(
		"hubble://agent-bridge-request",
		async (event) => {
			const request = event.payload;
			try {
				const result = await handleBridgeRequest(request);
				await invoke("agent_bridge_response", {
					id: request.id,
					result: result ?? null,
				});
			} catch (err) {
				await invoke("agent_bridge_response", {
					id: request.id,
					result: {
						error:
							err instanceof Error ? err.message : String(err),
					},
				});
			}
		},
	);
	return unlisten;
}
