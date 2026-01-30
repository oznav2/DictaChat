import { describe, expect, it, vi } from "vitest";

describe("single-user admin auth", () => {
	it("returns a stable admin session when SINGLE_USER_ADMIN=true", async () => {
		vi.resetModules();
		process.env.SINGLE_USER_ADMIN = "true";
		process.env.SINGLE_USER_SESSION_SECRET = "single-user-admin";

		const { authenticateRequest } = await import("$lib/server/auth");

		const result = await authenticateRequest(
			{ type: "svelte", value: new Headers() },
			{
				type: "svelte",
				value: {
					get: () => undefined,
				} as unknown as import("@sveltejs/kit").Cookies,
			},
			new URL("http://localhost:8004/")
		);

		expect(result.isAdmin).toBe(true);
		expect(result.secretSessionId).toBe("single-user-admin");
		expect(result.sessionId).toMatch(/^[a-f0-9]{64}$/);
	});
});
