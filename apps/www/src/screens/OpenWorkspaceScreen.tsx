import { api } from "@hubble.md/sync-backend";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { saveWorkspace } from "../connection/connection";
import { categorizeError, describeError } from "../connection/convex-error";

type Props = {
	onSelected: (id: string) => void;
	onDisconnect?: () => void;
};

// Post-auth workspace picker / first-run create. Auth lives at the router root,
// so this uses the authenticated Convex context client (useQuery/useMutation)
// rather than a standalone unauthenticated HTTP client.
export function OpenWorkspaceScreen({ onSelected, onDisconnect }: Props) {
	const workspaces = useQuery(api.sync.listWorkspaces, {});
	const createWorkspace = useMutation(api.sync.createWorkspace);
	const [error, setError] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);

	const select = (id: string) => {
		saveWorkspace(id);
		onSelected(id);
	};

	// Auto-select when there's exactly one workspace (the common case once a
	// personal workspace is auto-provisioned on signup).
	// biome-ignore lint/correctness/useExhaustiveDependencies: select uses stable saveWorkspace + props
	useEffect(() => {
		if (workspaces && workspaces.length === 1) {
			select(workspaces[0]._id);
		}
	}, [workspaces]);

	const handleCreate = async (event: React.FormEvent) => {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		setBusy(true);
		setError(null);
		try {
			const id = await createWorkspace({ name: trimmed });
			select(id);
		} catch (err) {
			setError(describeError(categorizeError(err)));
			setBusy(false);
		}
	};

	const empty = workspaces !== undefined && workspaces.length === 0;

	return (
		<main className="flex h-dvh items-center justify-center bg-background text-foreground">
			<div className="flex w-full max-w-md flex-col gap-3 rounded-md border border-border bg-sidebar p-6">
				<div className="flex items-start justify-between gap-3">
					<h1 className="m-0 text-base font-semibold">
						{empty ? "Name your Workspace" : "Open a Workspace"}
					</h1>
					{onDisconnect && (
						<button
							type="button"
							onClick={onDisconnect}
							className="text-xs text-muted-foreground underline-offset-2 hover:underline"
						>
							Sign out
						</button>
					)}
				</div>

				{error && (
					<p className="m-0 rounded-sm bg-muted px-2.5 py-1.5 text-xs text-destructive">
						{error}
					</p>
				)}

				{workspaces === undefined && !error && (
					<p className="m-0 text-xs text-muted-foreground">Loading…</p>
				)}

				{workspaces && workspaces.length > 1 && (
					<ul className="m-0 flex flex-col gap-1 p-0">
						{workspaces.map((w) => (
							<li key={w._id} className="list-none">
								<button
									type="button"
									onClick={() => select(w._id)}
									className="block w-full rounded-sm border border-border bg-background px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
								>
									{w.name}
								</button>
							</li>
						))}
					</ul>
				)}

				{(empty || (workspaces && workspaces.length > 1)) && (
					<form onSubmit={handleCreate} className="flex flex-col gap-2">
						{!empty && (
							<p className="m-0 text-xs text-muted-foreground">
								Or create a new one
							</p>
						)}
						<input
							type="text"
							// biome-ignore lint/a11y/noAutofocus: deliberate — fresh-deployment onboarding
							autoFocus={empty}
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Workspace name"
							disabled={busy}
							className="rounded-sm border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring"
						/>
						<button
							type="submit"
							disabled={busy}
							className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
						>
							{busy ? "Creating…" : "Create Workspace"}
						</button>
					</form>
				)}
			</div>
		</main>
	);
}
