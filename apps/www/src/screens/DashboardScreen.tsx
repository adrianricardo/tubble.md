import { DashboardScreen as SharedDashboardScreen } from "@hubble.md/cloud-ui";
import { SignOutButton } from "../auth/AuthScreens";

type Props = {
	onOpenDocument: (workspaceId: string, documentId: string) => void;
	onOpenWorkspace: (workspaceId: string) => void;
	onOpenFolder: (folderId: string) => void;
};

export function DashboardScreen({
	onOpenDocument,
	onOpenWorkspace,
	onOpenFolder,
}: Props) {
	return (
		<main className="min-h-dvh bg-background text-foreground">
			<SharedDashboardScreen
				onOpenDocument={onOpenDocument}
				onOpenWorkspace={onOpenWorkspace}
				onOpenFolder={onOpenFolder}
				headerActions={<SignOutButton />}
			/>
		</main>
	);
}
