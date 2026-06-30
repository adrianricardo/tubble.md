import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";
import { ensurePersonalWorkspace, resolveInvitesForUser } from "./members";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		Password({
			profile(params) {
				const email = String(params.email ?? "")
					.trim()
					.toLowerCase();
				if (!email) throw new Error("Email is required");
				const name = String(params.name ?? "").trim() || email;
				return { email, name };
			},
		}),
	],
	callbacks: {
		// Apply any pending email-keyed invites and guarantee a private home
		// workspace once the account exists.
		async afterUserCreatedOrUpdated(ctx, { userId }) {
			const mutationCtx = ctx as unknown as MutationCtx;
			await resolveInvitesForUser(mutationCtx, userId);
			await ensurePersonalWorkspace(mutationCtx, userId);
		},
	},
});
