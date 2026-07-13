import { afterEach, describe, expect, it, vi } from "vitest";

describe("desktop cloud context persistence", () => {
	afterEach(() => {
		vi.resetModules();
		vi.unstubAllGlobals();
	});

	it("migrates the legacy selected space into a workspace context", async () => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn(() =>
				JSON.stringify({ cloud: { selectedSpaceId: "workspace-1" } }),
			),
			setItem: vi.fn(),
		});
		const { appStore } = await import("./state");

		expect(appStore.get().cloud.context).toEqual({
			kind: "workspace",
			workspaceId: "workspace-1",
		});
	});

	it("persists the discriminated context without the legacy field", async () => {
		const setItem = vi.fn();
		vi.stubGlobal("localStorage", {
			getItem: vi.fn(() => null),
			setItem,
		});
		const { cloudContextStore } = await import("./state");
		const context = {
			kind: "shared-folder",
			folderId: "folder-1",
			workspaceId: "workspace-1",
		} as const;
		cloudContextStore.set(context);

		expect(setItem).toHaveBeenCalledOnce();
		const persisted = JSON.parse(setItem.mock.calls[0][1] as string);
		expect(persisted.cloud).toEqual({ context });
		expect(persisted.cloud).not.toHaveProperty("selectedSpaceId");
	});
});
