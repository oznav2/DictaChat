import { describe, it, expect } from "vitest";

import type { OpenAiTool } from "$lib/server/mcp/tools";
import { decodeToolCallFromStreamViaWorker } from "../../ToolCallCodec";

describe("workerPool fallback", () => {
	const toolDefinitions: OpenAiTool[] = [
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

	it("falls back to inline parse when worker pool is disabled", async () => {
		process.env.MCP_TOOL_PARSE_WORKERS = "0";
		const content = `</think><tool_call>{"name":"docling_convert","arguments":{"file":"c.pdf"}}</tool_call>`;
		const result = await decodeToolCallFromStreamViaWorker(content, {
			allowXml: true,
			allowJson: false,
			prefer: "xml",
			toolDefinitions,
			fallbackMode: "inline",
		});
		expect(result?.toolCalls.length).toBe(1);
		expect(result?.source).toBe("xml");
	});

	it("returns null when worker pool disabled and no inline fallback", async () => {
		process.env.MCP_TOOL_PARSE_WORKERS = "0";
		const content = `</think><tool_call>{"name":"docling_convert","arguments":{"file":"d.pdf"}}</tool_call>`;
		const result = await decodeToolCallFromStreamViaWorker(content, {
			allowXml: true,
			allowJson: false,
			prefer: "xml",
			toolDefinitions,
			fallbackMode: "none",
		});
		expect(result).toBeNull();
	});
});
