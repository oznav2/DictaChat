import { describe, it, expect, vi } from "vitest";

vi.mock("../../workerPool", () => ({
	runToolParseJob: async () => ({
		source: "xml",
		toolCalls: [],
		repaired: false,
		errors: ["xml-parse-failed"],
	}),
}));

import { decodeToolCallFromStream, decodeToolCallFromStreamViaWorker } from "../../ToolCallCodec";
import type { OpenAiTool } from "$lib/server/mcp/tools";

describe("ToolCallCodec", () => {
	const toolDefinitions: OpenAiTool[] = [
		{
			type: "function",
			function: {
				name: "search",
				description: "Search tool",
				parameters: {
					type: "object",
					properties: {
						query: { type: "string" },
					},
					required: ["query"],
				},
			},
		},
		{
			type: "function",
			function: {
				name: "docling_convert",
				description: "Docling",
				parameters: {
					type: "object",
					properties: {
						file: { type: "string" },
					},
					required: ["file"],
				},
			},
		},
	];

	it("parses XML envelope tool_call", async () => {
		const content = `</think>\n<tool_call>{"name":"docling_convert","arguments":{"file":"a.pdf"}}</tool_call>`;
		const result = await decodeToolCallFromStream(content, {
			allowXml: true,
			allowJson: true,
			prefer: "xml",
			toolDefinitions,
		});
		expect(result?.toolCalls.length).toBe(1);
		expect(result?.source).toBe("xml");
		const args = JSON.parse(result?.toolCalls[0].arguments ?? "{}");
		expect(args.file).toBe("a.pdf");
	});

	it("repairs XML tool_call with unescaped newlines in strings", async () => {
		const content = `</think>\n<tool_call>{"name":"search","arguments":{"query":"line1
line2"}}</tool_call>`;
		const result = await decodeToolCallFromStream(content, {
			allowXml: true,
			allowJson: true,
			prefer: "xml",
			toolDefinitions,
		});
		expect(result?.toolCalls.length).toBe(1);
		expect(result?.source).toBe("xml");
		const args = JSON.parse(result?.toolCalls[0].arguments ?? "{}");
		expect(args.query).toBe("line1\nline2");
	});

	it("repairs XML tool_call with unescaped quotes in strings", async () => {
		const content = `</think>\n<tool_call>{"name":"search","arguments":{"query":"אגודת "אדם, טבע ודין" נ' השר"}}</tool_call>`;
		const result = await decodeToolCallFromStream(content, {
			allowXml: true,
			allowJson: true,
			prefer: "xml",
			toolDefinitions,
		});
		expect(result?.toolCalls.length).toBe(1);
		expect(result?.source).toBe("xml");
		const args = JSON.parse(result?.toolCalls[0].arguments ?? "{}");
		expect(args.query).toBe(`אגודת "אדם, טבע ודין" נ' השר`);
	});

	it("repairs Hebrew bareword JSON tool_calls", async () => {
		const content = `</think>{"tool_calls":[{"name":"search","arguments":{"query":מי השופטים}}]}`;
		const result = await decodeToolCallFromStream(content, {
			allowXml: true,
			allowJson: true,
			prefer: "json",
			toolDefinitions,
		});
		expect(result?.toolCalls.length).toBe(1);
		expect(result?.source).toBe("json");
		const args = JSON.parse(result?.toolCalls[0].arguments ?? "{}");
		expect(args.query).toBe("מי השופטים");
	});

	it("strips bidi controls in payload only", async () => {
		const content = `</think>{"tool_calls":[{"name":"search","arguments":{"query":"\u200Fabc"}}]}`;
		const result = await decodeToolCallFromStream(content, {
			allowXml: false,
			allowJson: true,
			prefer: "json",
			toolDefinitions,
		});
		const args = JSON.parse(result?.toolCalls[0].arguments ?? "{}");
		expect(args.query).toBe("abc");
	});

	it("rejects invalid tool args by schema", async () => {
		const content = `</think>{"tool_calls":[{"name":"search","arguments":{}}]}`;
		const result = await decodeToolCallFromStream(content, {
			allowXml: false,
			allowJson: true,
			prefer: "json",
			toolDefinitions,
		});
		expect(result?.toolCalls.length ?? 0).toBe(0);
	});

	it("prefers XML when both XML and JSON are present", async () => {
		const content = `</think><tool_call>{"name":"docling_convert","arguments":{"file":"b.pdf"}}</tool_call>{"tool_calls":[{"name":"search","arguments":{"query":"fallback"}}]}`;
		const result = await decodeToolCallFromStream(content, {
			allowXml: true,
			allowJson: true,
			prefer: "xml",
			toolDefinitions,
		});
		expect(result?.source).toBe("xml");
		expect(result?.toolCalls.length).toBe(1);
		const args = JSON.parse(result?.toolCalls[0].arguments ?? "{}");
		expect(args.file).toBe("b.pdf");
	});

	it("falls back to inline parse when worker returns xml-parse-failed", async () => {
		const content = `</think>\n<tool_call>{"name":"search","arguments":{"query":"אגודת \"אדם, טבע ודין\" נ' השר"}}</tool_call>`;
		const result = await decodeToolCallFromStreamViaWorker(content, {
			allowXml: true,
			allowJson: true,
			prefer: "xml",
			toolDefinitions,
			fallbackMode: "inline",
		});
		expect(result?.toolCalls.length).toBe(1);
		const args = JSON.parse(result?.toolCalls[0].arguments ?? "{}");
		expect(args.query).toBe(`אגודת "אדם, טבע ודין" נ' השר`);
	});
});
