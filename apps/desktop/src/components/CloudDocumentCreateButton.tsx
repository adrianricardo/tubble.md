import { api } from "@hubble.md/sync-backend";
import type { Id } from "@hubble.md/sync-backend/types";
import { Button } from "@hubble.md/ui";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import MingcuteAddLine from "~icons/mingcute/add-line";
import type { CloudContext } from "../store/persistence";

export function CloudDocumentCreateButton({
	context,
	canCreate,
	onOpenDocument,
	size = "icon-xs",
	primary = false,
}: {
	context: CloudContext | null;
	canCreate: boolean;
	onOpenDocument: (documentId: string) => void;
	size?: "icon-xs" | "icon-sm";
	primary?: boolean;
}) {
	const createDocument = useMutation(api.documents.create);
	const [creating, setCreating] = useState(false);

	const create = async () => {
		if (!context || !canCreate || creating) return;
		setCreating(true);
		try {
			const documentId = await createDocument({
				workspaceId: context.workspaceId as Id<"workspaces">,
				folderId:
					context.kind === "shared-folder"
						? (context.folderId as Id<"folders">)
						: undefined,
				title: "Untitled",
			});
			onOpenDocument(documentId);
			toast.success("Document created");
		} catch (error) {
			toast.error("Failed to create document", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setCreating(false);
		}
	};

	return (
		<Button
			variant="ghost"
			size={size}
			data-desktop-create-action={primary ? "primary" : undefined}
			onClick={() => void create()}
			disabled={!context || !canCreate || creating}
			aria-label="New document"
			title={
				canCreate ? "New document (⌘N)" : "You can’t create in this context"
			}
		>
			<MingcuteAddLine className={size === "icon-sm" ? "size-4" : "size-3.5"} />
		</Button>
	);
}
