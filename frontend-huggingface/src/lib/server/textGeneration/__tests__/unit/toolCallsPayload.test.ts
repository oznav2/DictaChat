import { describe, it, expect } from "vitest";

import {
	findToolCallsPayloadStartIndex,
	stripLeadingToolCallsPayload,
} from "../../mcp/toolCallsPayload";

describe("toolCallsPayload", () => {
	it("finds tool_calls JSON in a fenced block after </think>", () => {
		const text = '<think>t</think>\n```json\n{ "tool_calls": [{"name":"t","parameters":{}}] }\n```';
		const idx = findToolCallsPayloadStartIndex(text);
		expect(idx).toBeGreaterThanOrEqual(0);
		expect(text[idx]).toBe("{");
	});

	it("strips leading tool_calls payload and keeps remaining content", () => {
		const text = '<think>t</think>\n{ "tool_calls": [] }\nAnswer text.';
		const res = stripLeadingToolCallsPayload(text);
		expect(res.removed).toBe(true);
		expect(res.text.includes("tool_calls")).toBe(false);
		expect(res.text.includes("Answer text.")).toBe(true);
	});
});
