import { describe, it, expect } from "vitest";

import { shouldAttemptToolCallParse } from "../../runMcpFlow";

describe("tool call streaming guard", () => {
	it("waits for closing XML tag before parsing", () => {
		const shouldParse = shouldAttemptToolCallParse({
			buffer: `<tool_call>{"name":"search","arguments":{"query":"abc"}}`,
			bufferMin: 100,
			hasXmlToolCall: true,
		});
		expect(shouldParse).toBe(false);
	});

	it("parses XML once closing tag is present", () => {
		const shouldParse = shouldAttemptToolCallParse({
			buffer: `<tool_call>{"name":"search","arguments":{"query":"abc"}}</tool_call>`,
			bufferMin: 100,
			hasXmlToolCall: true,
		});
		expect(shouldParse).toBe(true);
	});

	it("allows JSON tool calls once buffer threshold reached", () => {
		const shouldParse = shouldAttemptToolCallParse({
			buffer: `{"tool_calls":[{"name":"search","arguments":{"query":"abc"}}]}`,
			bufferMin: 50,
			hasXmlToolCall: false,
		});
		expect(shouldParse).toBe(true);
	});
});
