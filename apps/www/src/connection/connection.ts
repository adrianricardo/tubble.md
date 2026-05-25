const URL_KEY = "hubble.connection.url";
const WORKSPACE_ID_KEY = "hubble.connection.workspaceId";

export type StoredConnection = {
	url: string;
	workspaceId: string | null;
};

export function readConnection(): StoredConnection | null {
	const url = localStorage.getItem(URL_KEY);
	if (!url) return null;
	return {
		url,
		workspaceId: localStorage.getItem(WORKSPACE_ID_KEY),
	};
}

export function saveConnectionUrl(url: string): void {
	localStorage.setItem(URL_KEY, url);
}

export function saveWorkspace(id: string): void {
	localStorage.setItem(WORKSPACE_ID_KEY, id);
}

export function clearWorkspace(): void {
	localStorage.removeItem(WORKSPACE_ID_KEY);
}

export function disconnect(): void {
	localStorage.removeItem(URL_KEY);
	clearWorkspace();
}
