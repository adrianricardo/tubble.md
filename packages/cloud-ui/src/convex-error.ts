export type ConvexErrorKind =
	| { kind: "malformed-url" }
	| { kind: "network"; detail: string }
	| { kind: "live-document-cap" }
	| { kind: "auth-session" }
	| { kind: "missing-function"; functionName: string }
	| { kind: "validator"; functionName: string; detail: string }
	| { kind: "unknown"; detail: string };

export function categorizeError(err: unknown): ConvexErrorKind {
	if (err instanceof TypeError && /url/i.test(err.message)) {
		return { kind: "malformed-url" };
	}
	const message = err instanceof Error ? err.message : String(err);
	const lower = message.toLowerCase();

	if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
		return { kind: "network", detail: message };
	}

	if (
		lower.includes("live document size limit exceeded") ||
		lower.includes("exceeds the 256 kib limit")
	) {
		return { kind: "live-document-cap" };
	}

	if (
		lower.includes("not authenticated") ||
		lower.includes("authentication required") ||
		lower.includes("unauthorized")
	) {
		return { kind: "auth-session" };
	}

	const missingMatch = message.match(
		/could not find public function ['"]?([^'"\s]+)/i,
	);
	if (missingMatch) {
		return { kind: "missing-function", functionName: missingMatch[1] };
	}

	const validatorMatch = message.match(
		/validator error.*function ['"]?([^'"\s]+)/is,
	);
	if (validatorMatch) {
		return {
			kind: "validator",
			functionName: validatorMatch[1],
			detail: message,
		};
	}

	return { kind: "unknown", detail: message };
}

export function describeError(err: ConvexErrorKind): string {
	switch (err.kind) {
		case "malformed-url":
			return "That URL looks invalid. Try a full convex.cloud URL.";
		case "network":
			return "Couldn't reach this deployment. Check the URL and your connection.";
		case "live-document-cap":
			return "This is over the 256 KiB Live Document limit. Keep it as a local markdown file or split it into smaller Live Documents.";
		case "auth-session":
			return "Your session no longer has access. Sign out, sign back in, and try again.";
		case "missing-function":
			return `This deployment doesn't expose ${err.functionName}. It may not be running the hubble.md backend.`;
		case "validator":
			return `${err.functionName} rejected the call. The backend's function signature may differ from what this app expects.`;
		case "unknown":
			return err.detail;
	}
}
