import { api } from "@hubble.md/sync-backend";
import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { categorizeError, describeError } from "../connection/convex-error";

type TerminalState = "approved" | "denied";

export function DeviceAuthScreen() {
	const [searchParams] = useSearchParams();
	const initialCode = searchParams.get("code") ?? "";
	const [code, setCode] = useState(formatDeviceCode(initialCode));
	const [error, setError] = useState<string | null>(null);
	const [terminalState, setTerminalState] = useState<TerminalState | null>(
		null,
	);
	const normalizedCode = useMemo(() => formatDeviceCode(code), [code]);
	const codeReady = normalizedCode.length === 9;
	const description = useQuery(
		api.deviceAuth.describe,
		codeReady ? { code: normalizedCode } : "skip",
	);
	const approve = useAction(api.deviceAuth.approve);
	const deny = useMutation(api.deviceAuth.deny);
	const [pendingAction, setPendingAction] = useState<TerminalState | null>(
		null,
	);

	const submit = async (action: TerminalState) => {
		if (!codeReady) {
			setError("Enter the 8-character code from your terminal.");
			return;
		}
		setError(null);
		setPendingAction(action);
		try {
			if (action === "approved") {
				await approve({ code: normalizedCode });
			} else {
				await deny({ code: normalizedCode });
			}
			setTerminalState(action);
		} catch (err) {
			setError(describeError(categorizeError(err)));
		} finally {
			setPendingAction(null);
		}
	};

	if (terminalState) {
		return (
			<DeviceAuthFrame>
				<p className="text-xs font-medium uppercase text-muted-foreground">
					Device login
				</p>
				<h1 className="mt-2 text-lg font-semibold text-foreground">
					{terminalState === "approved" ? "Access approved" : "Access denied"}
				</h1>
				<p className="mt-3 text-sm text-muted-foreground">
					You can return to your terminal.
				</p>
			</DeviceAuthFrame>
		);
	}

	const badCode = codeReady && description === null;
	const hostname = description?.hostname ?? "this computer";

	return (
		<DeviceAuthFrame>
			<p className="text-xs font-medium uppercase text-muted-foreground">
				Device login
			</p>
			<h1 className="mt-2 text-lg font-semibold text-foreground">
				Approve CLI access
			</h1>
			<label
				htmlFor="device-code"
				className="mt-4 block text-sm font-medium text-foreground"
			>
				Code
			</label>
			<input
				id="device-code"
				value={code}
				onChange={(event) => {
					setError(null);
					setCode(formatDeviceCode(event.target.value));
				}}
				placeholder="XXXX-XXXX"
				autoCapitalize="characters"
				autoComplete="one-time-code"
				className="mt-2 w-full rounded-sm border border-border bg-background font-mono text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
			/>
			{description && (
				<p className="mt-3 text-sm text-foreground">
					CLI on <span className="font-medium">{hostname}</span> wants access.
				</p>
			)}
			{badCode && (
				<p className="mt-3 text-sm text-destructive">
					This code is invalid, expired, or already approved.
				</p>
			)}
			{error && <p className="mt-3 text-sm text-destructive">{error}</p>}
			<div className="mt-4 grid grid-cols-2 gap-2">
				<button
					type="button"
					disabled={!description || pendingAction !== null}
					onClick={() => void submit("denied")}
					className="rounded-sm border border-border text-sm font-medium text-foreground hover:bg-sidebar-accent disabled:opacity-60 [padding-block:0.5rem] [padding-inline:0.75rem]"
				>
					{pendingAction === "denied" ? "Denying..." : "Deny"}
				</button>
				<button
					type="button"
					disabled={!description || pendingAction !== null}
					onClick={() => void submit("approved")}
					className="rounded-sm bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60 [padding-block:0.5rem] [padding-inline:0.75rem]"
				>
					{pendingAction === "approved" ? "Approving..." : "Approve"}
				</button>
			</div>
		</DeviceAuthFrame>
	);
}

function DeviceAuthFrame({ children }: { children: React.ReactNode }) {
	return (
		<main className="flex h-dvh items-center justify-center bg-background text-foreground [padding-block:1.5rem] [padding-inline:1.5rem]">
			<section className="w-full max-w-sm rounded-sm border border-border bg-card [padding-block:1rem] [padding-inline:1rem]">
				{children}
			</section>
		</main>
	);
}

function formatDeviceCode(value: string): string {
	const compact = value
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, 8);
	if (compact.length <= 4) return compact;
	return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}
