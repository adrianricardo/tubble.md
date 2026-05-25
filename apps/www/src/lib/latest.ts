/**
 * Wraps an async function so only the latest invocation can apply its
 * result. Earlier in-flight calls become "stale" and silently no-op.
 *
 * ```ts
 * const load = latest(async ({ isStale }, path: string) => {
 *   const content = await fetch(path);
 *   if (isStale()) return;
 *   applyContent(content);
 * });
 * load("a"); // starts, then…
 * load("b"); // …makes the first call stale
 * ```
 */
export function latest<Args extends unknown[], Result>(
	fn: (signal: { isStale: () => boolean }, ...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
	let token = 0;

	return async (...args: Args) => {
		const myToken = ++token;
		return fn({ isStale: () => myToken !== token }, ...args);
	};
}
