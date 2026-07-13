import { Button, Modal } from "@hubble.md/ui";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { desktopApi } from "../desktopApi";
import type { ConsequentialMoveOperation } from "../desktopApi/types";

export function ProjectionMoveReviewDialog({
	operation,
	onResolved,
}: {
	operation: ConsequentialMoveOperation | null;
	onResolved: () => void;
}) {
	const [busy, setBusy] = useState<"approve" | "cancel" | null>(null);
	const cancelButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (operation)
			requestAnimationFrame(() => cancelButtonRef.current?.focus());
	}, [operation]);

	if (!operation) return null;
	const impact = operation.impact;
	const cancel = async () => {
		if (busy) return;
		setBusy("cancel");
		try {
			const result = await desktopApi.cancelPendingProjectionMove(operation.id);
			if (result.status === "collision") {
				toast.warning("Both versions were preserved", {
					description:
						"The original location is occupied. Review the pending recovery item before changing either file.",
				});
			}
			onResolved();
		} catch (error) {
			toast.error("Could not cancel the move", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(null);
		}
	};
	const approve = async () => {
		if (busy) return;
		setBusy("approve");
		try {
			const result = await desktopApi.approvePendingProjectionMove(
				operation.id,
			);
			if (result.status === "refreshed") {
				toast.info("The move’s impact changed", {
					description:
						"Review the updated access changes before approving again.",
				});
				onResolved();
			} else {
				onResolved();
			}
		} catch (error) {
			toast.error("Could not approve the move", {
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
				if (!open) void cancel();
			}}
			title={`Review move: ${operation.title}`}
			description="This move changes who or what can access the document. The cloud location will not change until you approve."
		>
			<div className="flex flex-col gap-4" aria-live="polite">
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
					<dt className="text-muted-foreground">From</dt>
					<dd className="break-all">{operation.path}</dd>
					<dt className="text-muted-foreground">To</dt>
					<dd className="break-all">{operation.toPath}</dd>
				</dl>
				<ul className="flex list-disc flex-col gap-1 ps-5 text-sm">
					<li>
						{impact.gainingUserCount}{" "}
						{impact.gainingUserCount === 1 ? "person gains" : "people gain"}{" "}
						access
					</li>
					<li>
						{impact.losingUserCount}{" "}
						{impact.losingUserCount === 1 ? "person loses" : "people lose"}{" "}
						access
					</li>
					<li>
						{impact.publicAccessChanged
							? "Public-link access changes"
							: "Public-link access does not change"}
					</li>
					<li>
						{impact.repoExposureChanged
							? "Linked repository exposure changes"
							: "Linked repository exposure does not change"}
					</li>
				</ul>
				<div className="flex justify-end gap-2">
					<Button
						ref={cancelButtonRef}
						variant="outline"
						disabled={busy !== null}
						onClick={() => void cancel()}
					>
						{busy === "cancel" ? "Restoring…" : "Cancel move"}
					</Button>
					<Button disabled={busy !== null} onClick={() => void approve()}>
						{busy === "approve" ? "Checking impact…" : "Approve move"}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
