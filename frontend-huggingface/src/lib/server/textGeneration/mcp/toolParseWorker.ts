import { parentPort } from "node:worker_threads";

import type { OpenAiTool } from "$lib/server/mcp/tools";
import type { ToolCallDecodeOptions, ToolCallDecodeResult } from "./ToolCallCodec";

import { decodeToolCallFromStream } from "./ToolCallCodec";

interface WorkerRequest {
	id: string;
	text: string;
	options: Omit<ToolCallDecodeOptions, "logger">;
	toolDefinitions?: OpenAiTool[];
}

interface WorkerResponse {
	id: string;
	result?: ToolCallDecodeResult | null;
	error?: string;
}

if (!parentPort) {
	throw new Error("toolParseWorker must be run as a worker thread");
}

parentPort.on("message", async (payload: WorkerRequest) => {
	const response: WorkerResponse = { id: payload.id };
	try {
		const options: ToolCallDecodeOptions = {
			...payload.options,
			toolDefinitions: payload.toolDefinitions ?? payload.options.toolDefinitions,
		};
		const result = await decodeToolCallFromStream(payload.text, options);
		response.result = result ?? null;
	} catch (err) {
		response.error = err instanceof Error ? err.message : String(err);
	}
	parentPort?.postMessage(response);
});
