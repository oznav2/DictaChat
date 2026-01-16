import { describe, it, expect } from "vitest";

import { repairXmlStream } from "../../utils/xmlUtils";

describe("repairXmlStream", () => {
	it("closes an unclosed think tag", () => {
		const input = "<think>hello";
		const out = repairXmlStream(input);
		expect(out.endsWith("</think>")).toBe(true);
	});

	it("unwraps fenced tool_calls JSON payloads", () => {
		const input = '```json\n{ "tool_calls": [] }\n```';
		const out = repairXmlStream(input);
		expect(out.trim().startsWith("{")).toBe(true);
		expect(out.includes("```")).toBe(false);
		expect(out.includes("tool_calls")).toBe(true);
	});

	it("does not unwrap non-tool_calls fenced blocks", () => {
		const input = '```json\n{ "x": 1 }\n```';
		const out = repairXmlStream(input);
		expect(out).toBe(input);
	});
});
