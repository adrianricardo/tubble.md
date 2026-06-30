import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

// Root-level auth surface. Lifted out of AppShell (P2/A1b) so the auth gate can
// live at the router root instead of inside a per-workspace shell.
export function SignInScreen() {
	const { signIn } = useAuthActions();
	const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
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
			setError(err instanceof Error ? err.message : "Sign in failed");
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
				<h1 className="text-base font-semibold text-foreground">
					{mode === "signIn" ? "Sign in to Hubble" : "Create your account"}
				</h1>
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
