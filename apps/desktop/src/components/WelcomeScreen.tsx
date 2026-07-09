import { Button } from "@hubble.md/ui";

export function WelcomeScreen({
	cloudEnabled,
	onCreateFolder,
	onOpenFolder,
	onOpenSettings,
}: {
	cloudEnabled?: boolean;
	onCreateFolder: () => void;
	onOpenFolder: () => void;
	onOpenSettings?: () => void;
}) {
	return (
		<div className="flex max-w-md flex-col items-center gap-3 text-center">
			<h2
				className="welcome-rise font-rounded text-3xl font-medium tracking-tight"
				style={{ animationDelay: "0.05s" }}
			>
				Welcome to <span className="font-semibold">hubble</span>
			</h2>
			<p
				className="welcome-rise [margin-block-end:0.5rem] text-sm text-muted-foreground"
				style={{ animationDelay: "0.15s" }}
			>
				{cloudEnabled
					? "Sign in to your space for Live Documents, or add a local folder for file-based editing."
					: "Pick a local folder to start writing."}
			</p>
			<div
				className="welcome-rise flex flex-wrap items-center justify-center gap-2"
				style={{ animationDelay: "0.25s" }}
			>
				{cloudEnabled && onOpenSettings ? (
					<Button onClick={onOpenSettings}>Open settings</Button>
				) : null}
				<Button
					variant={cloudEnabled ? "outline" : "default"}
					onClick={onCreateFolder}
				>
					Create local folder
				</Button>
				<Button variant="outline" onClick={onOpenFolder}>
					Open local folder
				</Button>
			</div>
		</div>
	);
}
