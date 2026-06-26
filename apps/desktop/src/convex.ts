export const desktopConvexUrl =
	typeof import.meta.env.VITE_CONVEX_URL === "string" &&
	import.meta.env.VITE_CONVEX_URL.length > 0
		? import.meta.env.VITE_CONVEX_URL
		: null;
