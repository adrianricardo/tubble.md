import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { categorizeError, describeError } from "../connection/convex-error";

const DEPLOY_GUIDE_URL =
	"https://github.com/adrianricardo/tubble.md/blob/main/specs/public-try-it-today-launch/DEPLOY.md";

// Root-level auth surface. Lifted out of AppShell (P2/A1b) so the auth gate can
// live at the router root instead of inside a per-workspace shell.
export function SignInScreen({
	banner,
	heading,
	defaultMode = "signIn",
}: {
	// Shown above the form. Used by the invite-link join route (RB2/RB6) so a
	// signed-out visitor understands why they landed here before signing in/up.
	banner?: string;
	// Overrides the default "Sign in to Tubble" / "Create your account" heading —
	// the invite-link join route (RB6) uses this to sell the destination
	// ("Open your shared folder"), not the product.
	heading?: string;
	defaultMode?: "signIn" | "signUp";
}) {
	const { signIn } = useAuthActions();
	const [mode, setMode] = useState<"signIn" | "signUp">(defaultMode);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const submit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		setPending(true);
		const formData = new FormData(event.currentTarget);
		formData.set("flow", mode);
		try {
			await signIn("password", formData);
		} catch (err) {
			setError(describeAuthError(err, mode));
		} finally {
			setPending(false);
		}
	};

	return (
		<main className="flex h-dvh items-center justify-center bg-background text-foreground [padding-block:1.5rem] [padding-inline:1.5rem]">
			<form
				onSubmit={submit}
				className="w-full max-w-sm rounded-sm border border-border bg-card [padding-block:1rem] [padding-inline:1rem]"
			>
				{banner && (
					<p className="mb-3 rounded-sm bg-muted/60 text-sm text-foreground [padding-block:0.625rem] [padding-inline:0.75rem]">
						{banner}
					</p>
				)}
				<h1 className="text-base font-semibold text-foreground">
					{heading ??
						(mode === "signIn" ? "Sign in to Tubble" : "Create your account")}
				</h1>
				<HostedTrialNotice visible={mode === "signUp"} />
				<label
					htmlFor="auth-email"
					className="mt-4 block text-sm font-medium text-foreground"
				>
					Email
				</label>
				<input
					id="auth-email"
					name="email"
					type="email"
					required
					autoComplete="email"
					className="mt-2 w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
				/>
				{mode === "signUp" && (
					<>
						<label
							htmlFor="auth-name"
							className="mt-3 block text-sm font-medium text-foreground"
						>
							Name
						</label>
						<input
							id="auth-name"
							name="name"
							type="text"
							required
							autoComplete="name"
							className="mt-2 w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
						/>
					</>
				)}
				<label
					htmlFor="auth-password"
					className="mt-3 block text-sm font-medium text-foreground"
				>
					Password
				</label>
				<input
					id="auth-password"
					name="password"
					type="password"
					required
					autoComplete={mode === "signIn" ? "current-password" : "new-password"}
					className="mt-2 w-full rounded-sm border border-border bg-background text-sm outline-none focus:border-ring [padding-block:0.5rem] [padding-inline:0.625rem]"
				/>
				{error && <p className="mt-3 text-sm text-destructive">{error}</p>}
				<button
					type="submit"
					disabled={pending}
					className="mt-4 w-full rounded-sm bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60 [padding-block:0.5rem] [padding-inline:0.75rem]"
				>
					{pending ? "Working…" : mode === "signIn" ? "Sign in" : "Sign up"}
				</button>
				<button
					type="button"
					onClick={() => {
						setError(null);
						setMode(mode === "signIn" ? "signUp" : "signIn");
					}}
					className="mt-3 w-full rounded-sm text-sm text-muted-foreground hover:bg-sidebar-accent [padding-block:0.5rem] [padding-inline:0.75rem]"
				>
					{mode === "signIn" ? "Create an account" : "Sign in instead"}
				</button>
			</form>
		</main>
	);
}

export function HostedTrialNotice({ visible }: { visible: boolean }) {
	// Keep the notice mounted for the mode transition; collapse it out of both the
	// accessibility tree and keyboard order while sign-in is active.
	return (
		<div
			aria-hidden={!visible}
			className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
				visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
			}`}
		>
			<div className="overflow-hidden">
				<div className="mt-3 rounded-sm border border-border bg-muted/50 text-xs leading-relaxed text-muted-foreground [padding-block:0.625rem] [padding-inline:0.75rem]">
					<p className="font-medium text-foreground">About this public trial</p>
					<p className="mt-1">
						This is a best-effort service with no uptime, backup, support,
						security-review, or maintenance guarantee. Don&apos;t use it for
						critical, sensitive, or irreplaceable work. Keep your own copies.
					</p>
					<a
						href={DEPLOY_GUIDE_URL}
						tabIndex={visible ? undefined : -1}
						className="mt-1 inline-block font-medium text-foreground underline decoration-border underline-offset-2 transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:decoration-foreground"
					>
						Deploy your own for more control
					</a>
				</div>
			</div>
		</div>
	);
}

function describeAuthError(err: unknown, mode: "signIn" | "signUp"): string {
	const message = err instanceof Error ? err.message : String(err);
	const lower = message.toLowerCase();
	if (lower.includes("invalid") || lower.includes("password")) {
		return mode === "signIn"
			? "Email or password didn't match."
			: "Use a valid email and a stronger password.";
	}
	if (lower.includes("already") || lower.includes("exists")) {
		return "An account with that email already exists. Sign in instead.";
	}
	if (lower.includes("daily signup limit")) {
		return "Daily signup limit reached. Signups reopen tomorrow.";
	}
	return describeError(categorizeError(err));
}

export function SignOutButton() {
	const { signOut } = useAuthActions();
	return (
		<button
			type="button"
			onClick={() => void signOut()}
			className="rounded-sm text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground [padding-block:0.25rem] [padding-inline:0.5rem]"
		>
			Sign out
		</button>
	);
}

export function AuthStatus({ message }: { message: string }) {
	return (
		<main className="flex h-dvh items-center justify-center bg-background text-foreground">
			<p className="text-sm text-muted-foreground">{message}</p>
		</main>
	);
}
