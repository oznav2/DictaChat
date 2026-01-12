import { Client } from "@modelcontextprotocol/sdk/client";
import { getClientEnhanced } from "./clientPoolEnhanced";

export interface McpServerConfig {
	name: string;
	url: string;
	headers?: Record<string, string>;
}

// Default timeout for most tools (60 seconds)
const DEFAULT_TIMEOUT_MS = 60_000;

// Extended timeouts for research-intensive tools (5 minutes)
// perplexity_research can take 2-5 minutes for deep research queries
const EXTENDED_TIMEOUT_TOOLS = [
	"perplexity_research",
	"perplexity_ask",
	"perplexity-research",
	"perplexity-ask",
	"perplexity_reason",
	"perplexity-reason",
	"perplexity_search",
	"perplexity-search",
];
const EXTENDED_TIMEOUT_MS = 300_000; // 5 minutes

export type McpToolTextResponse = {
	text: string;
	/** If the server returned structuredContent, include it raw */
	structured?: unknown;
	/** Raw content blocks returned by the server, if any */
	content?: unknown[];
};

export async function callMcpTool(
	server: McpServerConfig,
	tool: string,
	args: unknown = {},
	{ timeoutMs, signal, client }: { timeoutMs?: number; signal?: AbortSignal; client?: Client } = {}
): Promise<McpToolTextResponse> {
	// Determine appropriate timeout based on tool type
	// Research-intensive tools (perplexity) get extended timeout
	// Use the larger of: passed timeout OR smart timeout for research tools
	const isExtendedTool = EXTENDED_TIMEOUT_TOOLS.some((t) =>
		tool.toLowerCase().includes(t.toLowerCase())
	);
	const smartTimeout = isExtendedTool ? EXTENDED_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
	const effectiveTimeout = Math.max(timeoutMs ?? 0, smartTimeout);

	const normalizedArgs =
		typeof args === "object" && args !== null && !Array.isArray(args)
			? (args as Record<string, unknown>)
			: undefined;

	// Get a (possibly pooled) client. The client itself was connected with a signal
	// that already composes outer cancellation. We still enforce a per-call timeout here.
	const activeClient = client ?? (await getClientEnhanced(server, signal));

	// Prefer the SDK's built-in request controls (timeout, signal)
	const response = await activeClient.callTool(
		{ name: tool, arguments: normalizedArgs },
		undefined,
		{
			signal,
			timeout: effectiveTimeout,
			// Enable progress tokens so long-running tools keep extending the timeout.
			onprogress: () => {},
			resetTimeoutOnProgress: true,
		}
	);

	const parts = Array.isArray(response?.content) ? (response.content as Array<unknown>) : [];
	const textParts = parts
		.filter((part): part is { type: "text"; text: string } => {
			if (typeof part !== "object" || part === null) return false;
			const obj = part as Record<string, unknown>;
			return obj["type"] === "text" && typeof obj["text"] === "string";
		})
		.map((p) => p.text);

	const text = textParts.join("\n");
	const structured = (response as unknown as { structuredContent?: unknown })?.structuredContent;
	const contentBlocks = Array.isArray(response?.content)
		? (response.content as unknown[])
		: undefined;
	return { text, structured, content: contentBlocks };
}
