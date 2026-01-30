import { describe, expect, it } from "vitest";

import { buildToolPreprompt } from "../toolPrompt";

const tools = [
	{
		type: "function",
		function: {
			name: "tavily_search",
			description: "search",
			parameters: { type: "object" },
		},
	},
];

describe("buildToolPreprompt", () => {
	it("emits XML tool_call envelope instructions when format is xml", () => {
		const prompt = buildToolPreprompt(tools, undefined, { toolCallFormat: "xml" });
		expect(prompt).toContain("<tool_call>");
		expect(prompt).toContain("Do NOT output {\"tool_calls\": ...} JSON objects");
	});

	it("emits JSON tool_calls instructions when format is json", () => {
		const prompt = buildToolPreprompt(tools, undefined, { toolCallFormat: "json" });
		expect(prompt).toContain("\"tool_calls\"");
		expect(prompt).toContain("Do NOT wrap tool calls in XML tags");
	});
});
