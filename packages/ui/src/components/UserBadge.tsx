type UserBadgeUser = {
	name?: string | null;
	email?: string | null;
	image?: string | null;
};

export function UserBadge({ user }: { user: UserBadgeUser }) {
	const label = displayName(user);
	const secondary =
		user.email && user.email !== label ? user.email : "Signed in";
	const initials = initialsFor(label);

	return (
		<div
			className="flex min-w-0 max-w-44 items-center gap-2 rounded-sm border border-border bg-background/80 text-foreground shadow-xs [padding-block:0.1875rem] [padding-inline:0.25rem_0.5rem]"
			title={user.email ?? label}
		>
			<span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
				{user.image ? (
					<img
						src={user.image}
						alt=""
						className="size-full object-cover"
						referrerPolicy="no-referrer"
					/>
				) : (
					initials
				)}
			</span>
			<span className="min-w-0 leading-none">
				<span className="block truncate text-[11px] font-medium">{label}</span>
				<span className="block truncate text-[10px] text-muted-foreground">
					{secondary}
				</span>
			</span>
		</div>
	);
}

function displayName(user: UserBadgeUser): string {
	return user.name?.trim() || user.email?.trim() || "Signed in";
}

function initialsFor(label: string): string {
	const parts = label
		.replace(/@.*/, "")
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean);
	const letters =
		parts.length >= 2
			? `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`
			: (parts[0]?.slice(0, 2) ?? "U");
	return letters.toUpperCase();
}
