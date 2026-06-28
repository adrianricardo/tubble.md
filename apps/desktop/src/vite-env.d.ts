/// <reference types="vite/client" />
/// <reference types="unplugin-icons/types/react" />

import type { DesktopApi } from "./desktopApi/types";

declare global {
	interface ImportMetaEnv {
		/** Enables Live Documents and synced-folder realtime collaboration surfaces. */
		readonly VITE_HUBBLE_REALTIME_COLLAB?: string;
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
