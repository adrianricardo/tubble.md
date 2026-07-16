import { isAbsolute } from "node:path";
import { fileURLToPath, URL } from "node:url";
import icons from "unplugin-icons/vite";
import { defineConfig } from "vite";

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const isExternal = (id: string) =>
	!id.startsWith(".") &&
	!id.startsWith("\0") &&
	!id.startsWith("~icons/") &&
	!isAbsolute(id);

export default defineConfig({
	plugins: [
		icons({
			compiler: "jsx",
			jsx: "react",
		}),
	],
	build: {
		lib: {
			entry: {
				index: resolve("./src/index.ts"),
			},
			formats: ["es"],
			fileName: (_format, entryName) => `${entryName}.js`,
		},
		rollupOptions: {
			external: isExternal,
		},
		sourcemap: true,
	},
});
