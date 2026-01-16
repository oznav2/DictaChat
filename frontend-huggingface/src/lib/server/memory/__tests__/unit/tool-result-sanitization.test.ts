import { describe, expect, it } from "vitest";

import { sanitizeToolOutput } from "$lib/server/memory/services/ToolResultIngestionService";

describe("sanitizeToolOutput", () => {
	it("redacts common secret patterns", () => {
		const input = [
			"Authorization: Bearer abc.def.ghi",
			"Bearer xyz123",
			"x-api-key: supersecret",
			"api_key=shhh",
			"access_token: tokenvalue",
			"cookie: session=abc",
			"https://example.com/?token=mytoken&x=1",
		].join("\n");

		const actual = sanitizeToolOutput(input);

		expect(actual).not.toContain("abc.def.ghi");
		expect(actual).toContain("Bearer [REDACTED]");
		expect(actual).toContain("x-api-key=[REDACTED]");
		expect(actual).toContain("api_key=[REDACTED]");
		expect(actual).toContain("access_token=[REDACTED]");
		expect(actual).toContain("cookie: [REDACTED]");
		expect(actual).toContain("token=[REDACTED]");
	});

	it("redacts emails and phone numbers", () => {
		const input = [
			"Contact: test.user+dev@example.co.il",
			"Phone: +972 50-123-4567",
			"Short: 123-4567",
		].join("\n");

		const actual = sanitizeToolOutput(input);

		expect(actual).toContain("[REDACTED_EMAIL]");
		expect(actual).toContain("[REDACTED_PHONE]");
		expect(actual).toContain("123-4567");
	});

	it("removes embedded base64 blobs", () => {
		const input = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA";
		const actual = sanitizeToolOutput(input);
		expect(actual).toContain("[binary-data-removed]");
	});
});
