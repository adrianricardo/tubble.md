/** The exact cloud content represented by one local projection root. */
export type ProjectionScope =
	| { kind: "all-accessible" }
	| { kind: "workspace"; workspaceId: string }
	| { kind: "folder"; workspaceId: string; folderId: string };

/** Stable device-local identity used by managers, persistence, and status joins. */
export function projectionScopeKey(scope: ProjectionScope): string {
	switch (scope.kind) {
		case "all-accessible":
			return "all-accessible";
		case "workspace":
			return `workspace:${scope.workspaceId}`;
		case "folder":
			return `folder:${scope.folderId}`;
	}
}
