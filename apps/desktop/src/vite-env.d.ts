/// <reference types="vite/client" />
/// <reference types="unplugin-icons/types/react" />

import type { DesktopApi } from "./desktopApi/types";

declare global {
	interface ImportMetaEnv {
		/** Deployed fork Convex URL used by desktop Convex Auth and synced-folder sync. */
		readonly VITE_CONVEX_URL?: string;
	}

	interface ImportMeta {
		readonly env: ImportMetaEnv;
	}

	interface Window {
		desktopApi: DesktopApi;
	}
}
