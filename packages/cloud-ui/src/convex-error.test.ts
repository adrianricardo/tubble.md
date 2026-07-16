import { describe, expect, it } from "vitest";
import { categorizeError, describeError } from "./convex-error";

describe("convex error helpers", () => {
	it("describes live document cap errors", () => {
		const message = describeError(
			categorizeError(new Error("Live Document size limit exceeded")),
		);

		expect(message).toContain("256 KiB");
	});
});
