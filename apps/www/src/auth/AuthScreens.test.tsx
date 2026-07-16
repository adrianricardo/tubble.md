import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HostedTrialNotice, SignupAvailabilityNotice } from "./AuthScreens";

describe("HostedTrialNotice", () => {
	it("states the trial boundary and links to independent deployment", () => {
		const html = renderToStaticMarkup(<HostedTrialNotice visible />);

		expect(html).toContain("best-effort service");
		expect(html).toContain("no uptime, backup, support,");
		expect(html).toContain("critical, sensitive, or irreplaceable work");
		expect(html).toContain("Keep your own copies");
		expect(html).toContain(
			"https://github.com/adrianricardo/tubble.md/blob/main/specs/public-try-it-today-launch/DEPLOY.md",
		);
	});

	it("removes the collapsed notice link from keyboard navigation", () => {
		const html = renderToStaticMarkup(<HostedTrialNotice visible={false} />);

		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain('tabindex="-1"');
	});
});

describe("SignupAvailabilityNotice", () => {
	it("announces an operator pause without hiding the sign-in path", () => {
		const html = renderToStaticMarkup(
			<SignupAvailabilityNotice message="New signups are temporarily paused. Existing accounts can still sign in." />,
		);

		expect(html).toContain('aria-live="polite"');
		expect(html).toContain("New signups are temporarily paused");
		expect(html).toContain("Existing accounts can still sign in");
	});
});
