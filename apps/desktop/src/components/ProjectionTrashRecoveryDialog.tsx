import { Button, Modal } from "@hubble.md/ui";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { desktopApi } from "../desktopApi";
import type {
	DeletionReviewOperation,
	TrashUndoOperation,
} from "../desktopApi/types";

const BATCH_SIZE = 25;

export function ProjectionTrashRecoveryDialog({
	deletionReview,
	trashUndo,
	onResolved,
}: {
	deletionReview: DeletionReviewOperation | null;
	trashUndo: TrashUndoOperation | null;
	onResolved: () => void;
}) {
	const [busy, setBusy] = useState<
		"trash" | "restore" | "undo" | "keep" | null
	>(null);
	const safeButtonRef = useRef<HTMLButtonElement>(null);
	const operation = deletionReview ?? trashUndo;

	useEffect(() => {
		if (operation) requestAnimationFrame(() => safeButtonRef.current?.focus());
	}, [operation]);

	if (deletionReview) {
		const count = deletionReview.items.length;
		const canTrash = deletionReview.items.every(
			(item) => item.role === "owner" || item.role === "editor",
		);
		const restore = async () => {
			if (busy) return;
			setBusy("restore");
			try {
				const result = await desktopApi.cancelPendingProjectionDeletion(
					deletionReview.id,
				);
				if (result.remaining === 0) {
					toast("Files restored", {
						description: "Cloud documents were left unchanged.",
					});
				}
				onResolved();
			} catch (error) {
				toast.error("Could not restore the files", {
					description: error instanceof Error ? error.message : String(error),
				});
			} finally {
				setBusy(null);
			}
		};
		const moveToTrash = async () => {
			if (busy || !canTrash) return;
			setBusy("trash");
			try {
				await desktopApi.approvePendingProjectionDeletion(deletionReview.id);
				onResolved();
			} catch (error) {
				toast.error("Could not move the documents to Trash", {
					description: error instanceof Error ? error.message : String(error),
				});
			} finally {
				setBusy(null);
			}
		};

		return (
			<Modal
				open
				onOpenChange={(open) => {
					if (!open) void restore();
				}}
				title={`Review ${count === 1 ? "a deleted document" : `${count} deleted documents`}`}
				description="Hubble held this deletion before changing cloud Trash. Restore the local files, or confirm the deletion."
			>
				<div className="flex flex-col gap-4" aria-live="polite">
					<ul className="max-h-48 overflow-y-auto rounded-md border [padding-block:0.5rem] [padding-inline:0.75rem]">
						{deletionReview.items.slice(0, BATCH_SIZE).map((item) => (
							<li key={item.documentId} className="truncate text-sm">
								{item.path}
							</li>
						))}
					</ul>
					{count > BATCH_SIZE ? (
						<p className="text-muted-foreground text-sm">
							Hubble handles {BATCH_SIZE} at a time to keep recovery bounded.
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						<Button
							ref={safeButtonRef}
							variant="outline"
							disabled={busy !== null}
							onClick={() => void restore()}
						>
							{busy === "restore" ? "Restoring…" : "Restore files"}
						</Button>
						{canTrash ? (
							<Button
								disabled={busy !== null}
								onClick={() => void moveToTrash()}
							>
								{busy === "trash" ? "Moving…" : "Move to Trash"}
							</Button>
						) : null}
					</div>
				</div>
			</Modal>
		);
	}

	if (!trashUndo) return null;
	const undo = async () => {
		if (busy) return;
		setBusy("undo");
		try {
			const result = await desktopApi.undoTrashedProjectionDocument(
				trashUndo.id,
			);
			if (result.status === "collision") {
				toast.warning("Both versions were preserved", {
					description:
						"The original path is occupied. Hubble restored the cloud document and paused local materialization for review.",
				});
			}
			onResolved();
		} catch (error) {
			toast.error("Could not undo the deletion", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(null);
		}
	};
	const keepInTrash = async () => {
		if (busy) return;
		setBusy("keep");
		try {
			await desktopApi.dismissProjectionTrashUndo(trashUndo.id);
			onResolved();
		} catch (error) {
			toast.error("Could not close the recovery item", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(null);
		}
	};

	return (
		<Modal
			open
			onOpenChange={(open) => {
				if (!open) void keepInTrash();
			}}
			title="Document moved to Trash"
			description="Undo is saved on this computer and remains available after a restart. The document also stays recoverable from Hubble Trash."
		>
			<div className="flex flex-col gap-4" aria-live="polite">
				<p className="break-all text-sm">{trashUndo.path}</p>
				<div className="flex justify-end gap-2">
					<Button
						variant="outline"
						disabled={busy !== null}
						onClick={() => void keepInTrash()}
					>
						{busy === "keep" ? "Closing…" : "Keep in Trash"}
					</Button>
					<Button
						ref={safeButtonRef}
						disabled={busy !== null}
						onClick={() => void undo()}
					>
						{busy === "undo" ? "Restoring…" : "Undo"}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
