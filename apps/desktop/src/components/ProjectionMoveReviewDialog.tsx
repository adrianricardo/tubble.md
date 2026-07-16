import { Button, Modal } from "@hubble.md/ui";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { desktopApi } from "../desktopApi";
import type { ConsequentialMoveOperation } from "../desktopApi/types";

function roleLabel(role: string | null) {
	return role ? role[0]?.toUpperCase() + role.slice(1) : "No access";
}

function userLabel(change: { name: string | null; email: string | null }) {
	return change.name ?? change.email ?? "Unknown collaborator";
}

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
				<div className="flex flex-col gap-3 text-sm">
					{impact.userChanges?.length ? (
						<section aria-labelledby="move-people-heading">
							<h3 id="move-people-heading" className="font-medium">
								People
							</h3>
							<ul className="mt-1 flex list-disc flex-col gap-1 ps-5">
								{impact.userChanges.map((change) => (
									<li key={change.userId}>
										{userLabel(change)}: {roleLabel(change.fromRole)} →{" "}
										{roleLabel(change.toRole)}
									</li>
								))}
								{impact.userChangesTruncated ? (
									<li>Additional people are affected</li>
								) : null}
							</ul>
						</section>
					) : impact.userChanges === undefined ? (
						<p>
							{impact.gainingUserCount} gain access; {impact.losingUserCount}{" "}
							lose access
						</p>
					) : null}
					{impact.publicAccessChanged ? (
						<p>
							Public link:{" "}
							{roleLabel(impact.publicAccessChange?.fromRole ?? null)} →{" "}
							{roleLabel(impact.publicAccessChange?.toRole ?? null)}
						</p>
					) : null}
					{impact.repositoryChanges?.length ? (
						<section aria-labelledby="move-repositories-heading">
							<h3 id="move-repositories-heading" className="font-medium">
								Linked repositories
							</h3>
							<ul className="mt-1 flex list-disc flex-col gap-1 ps-5">
								{impact.repositoryChanges.map((repository) => (
									<li key={`${repository.change}:${repository.folderId}`}>
										{repository.change === "added"
											? "Added to"
											: "Removed from"}{" "}
										{repository.repoName ??
											repository.repoRemoteUrl ??
											"repository"}{" "}
										<span className="text-muted-foreground">
											({repository.folderPath})
										</span>
									</li>
								))}
							</ul>
						</section>
					) : impact.repoExposureChanged ? (
						<p>Linked repository exposure changes</p>
					) : null}
				</div>
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
