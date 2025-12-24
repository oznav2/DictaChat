import { randomUUID } from "crypto";
import { logger } from "../../logger";
import type { MessageUpdate } from "$lib/types/MessageUpdate";
import { MessageToolUpdateType, MessageUpdateType } from "$lib/types/MessageUpdate";
import { ToolResultStatus } from "$lib/types/Tool";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { McpToolMapping } from "$lib/server/mcp/tools";
import type { McpServerConfig } from "$lib/server/mcp/httpClient";
import { callMcpTool, type McpToolTextResponse } from "$lib/server/mcp/httpClient";
import {
	getClientEnhanced,
	releaseClientEnhanced,
	invalidateClientEnhanced,
} from "$lib/server/mcp/clientPoolEnhanced";
import { attachFileRefsToArgs, type FileRefResolver } from "./fileRefs";
import { sanitizeToolArguments } from "./toolArgumentSanitizer";
import type { Client } from "@modelcontextprotocol/sdk/client";

export type Primitive = string | number | boolean;

export type ToolRun = {
	name: string;
	parameters: Record<string, Primitive>;
	output: string;
};

export interface NormalizedToolCall {
	id: string;
	name: string;
	arguments: string;
}

export interface ExecuteToolCallsParams {
	calls: NormalizedToolCall[];
	mapping: Record<string, McpToolMapping>;
	servers: McpServerConfig[];
	parseArgs: (raw: unknown) => { value: Record<string, unknown>; error?: string };
	resolveFileRef?: FileRefResolver;
	toPrimitive: (value: unknown) => Primitive | undefined;
	processToolOutput: (text: string) => {
		annotated: string;
		sources: { index: number; link: string }[];
	};
	abortSignal?: AbortSignal;
	toolTimeoutMs?: number;
}

export interface ToolCallExecutionResult {
	toolMessages: ChatCompletionMessageParam[];
	toolRuns: ToolRun[];
	finalAnswer?: { text: string; interrupted: boolean };
}

export type ToolExecutionEvent =
	| { type: "update"; update: MessageUpdate }
	| { type: "complete"; summary: ToolCallExecutionResult };

const serverMap = (servers: McpServerConfig[]): Map<string, McpServerConfig> => {
	const map = new Map<string, McpServerConfig>();
	for (const server of servers) {
		if (server?.name) {
			map.set(server.name, server);
		}
	}
	return map;
};

/**
 * Normalize and sanitize tool arguments based on the tool type.
 * Handles common model mistakes and validates for security.
 */
function normalizeToolArgs(
	toolName: string,
	args: Record<string, unknown>
): Record<string, unknown> {
	// First sanitize the arguments for security
	const sanitizationResult = sanitizeToolArguments(toolName, args);
	if (!sanitizationResult.success) {
		logger.warn(
			{ toolName, error: sanitizationResult.error },
			"[mcp] Tool argument sanitization failed"
		);
		throw new Error(`Tool argument sanitization failed: ${sanitizationResult.error}`);
	}

	// Log warnings if any
	if (sanitizationResult.warnings && sanitizationResult.warnings.length > 0) {
		logger.debug(
			{ toolName, warnings: sanitizationResult.warnings },
			"[mcp] Tool argument sanitization warnings"
		);
	}

	const normalized = { ...sanitizationResult.sanitized! };

	// Perplexity tools (perplexity_ask, perplexity_research, perplexity_reason) require "messages" array
	// but models often send "query" string instead
	if (toolName.startsWith("perplexity_") || toolName.startsWith("perplexity-")) {
		if (normalized.query && !normalized.messages) {
			const query = String(normalized.query);
			normalized.messages = [{ role: "user", content: query }];
			delete normalized.query;
			logger.debug({ toolName, query }, "[mcp] normalized query → messages for perplexity tool");
		}
		// Also handle "prompt" being used instead of "messages"
		if (normalized.prompt && !normalized.messages) {
			const prompt = String(normalized.prompt);
			normalized.messages = [{ role: "user", content: prompt }];
			delete normalized.prompt;
			logger.debug({ toolName, prompt }, "[mcp] normalized prompt → messages for perplexity tool");
		}
	}

	// Tavily tools use "query" which is correct, no transformation needed
	if (toolName.includes("tavily")) {
		// Ensure days is a number (API expects integer, model might send string)
		if (normalized.days !== undefined) {
			const d = parseInt(String(normalized.days), 10);
			if (!isNaN(d)) {
				normalized.days = d;
			} else {
				delete normalized.days;
			}
		}
		// Ensure topic is valid
		if (normalized.topic && typeof normalized.topic === "string") {
			const topic = normalized.topic.toLowerCase();
			if (topic !== "news" && topic !== "general") {
				// Fallback to general if invalid topic
				normalized.topic = "general";
			}
		}
	}

	return normalized;
}

/**
 * Normalize a tool name by trying multiple variants.
 * Models often generate underscore names (tavily_search) but MCP tools use hyphens (tavily-search).
 * Returns the first matching key found in the mapping, or the original name if no match.
 */
function normalizeToolName(name: string, mapping: Record<string, McpToolMapping>): string {
	// Direct match
	if (mapping[name]) return name;

	// Try underscore to hyphen
	const hyphenVariant = name.replace(/_/g, "-");
	if (mapping[hyphenVariant]) {
		logger.debug(
			{ original: name, normalized: hyphenVariant },
			"[mcp] normalized tool name (underscore → hyphen)"
		);
		return hyphenVariant;
	}

	// Try hyphen to underscore
	const underscoreVariant = name.replace(/-/g, "_");
	if (mapping[underscoreVariant]) {
		logger.debug(
			{ original: name, normalized: underscoreVariant },
			"[mcp] normalized tool name (hyphen → underscore)"
		);
		return underscoreVariant;
	}

	// Try case-insensitive match
	const lowerName = name.toLowerCase();
	for (const key of Object.keys(mapping)) {
		if (key.toLowerCase() === lowerName) {
			logger.debug(
				{ original: name, normalized: key },
				"[mcp] normalized tool name (case-insensitive)"
			);
			return key;
		}
	}

	// No match found, return original
	return name;
}

export async function* executeToolCalls({
	calls,
	mapping,
	servers,
	parseArgs,
	resolveFileRef,
	toPrimitive,
	processToolOutput,
	abortSignal,
	toolTimeoutMs = 30_000,
}: ExecuteToolCallsParams): AsyncGenerator<ToolExecutionEvent, void, undefined> {
	// Check abort signal at the beginning
	if (abortSignal?.aborted) {
		throw new Error("Tool execution aborted before starting");
	}
	const toolMessages: ChatCompletionMessageParam[] = [];
	const toolRuns: ToolRun[] = [];
	const serverLookup = serverMap(servers);
	// Pre-emit call + ETA updates and prepare tasks
	type TaskResult = {
		index: number;
		output?: string;
		structured?: unknown;
		blocks?: unknown[];
		error?: string;
		uuid: string;
		paramsClean: Record<string, Primitive>;
	};

	const prepared = calls.map((call) => {
		const parsedArgs = parseArgs(call.arguments);
		const argsObj = normalizeToolArgs(call.name, parsedArgs.value);
		const paramsClean: Record<string, Primitive> = {};
		for (const [k, v] of Object.entries(argsObj ?? {})) {
			const prim = toPrimitive(v);
			if (prim !== undefined) paramsClean[k] = prim;
		}
		// Attach any resolved image payloads _after_ computing paramsClean so that
		// logging / status updates continue to show only the lightweight primitive
		// arguments (e.g. "image_1") while the full data: URLs or image blobs are
		// only sent to the MCP tool server.
		attachFileRefsToArgs(argsObj, resolveFileRef);
		return { call, argsObj, paramsClean, uuid: randomUUID(), parseError: parsedArgs.error };
	});

	for (const p of prepared) {
		yield {
			type: "update",
			update: {
				type: MessageUpdateType.Tool,
				subtype: MessageToolUpdateType.Call,
				uuid: p.uuid,
				call: { name: p.call.name, parameters: p.paramsClean },
			},
		};
		yield {
			type: "update",
			update: {
				type: MessageUpdateType.Tool,
				subtype: MessageToolUpdateType.ETA,
				uuid: p.uuid,
				eta: 10,
			},
		};
	}

	// Preload clients per distinct server used in this batch
	// Use normalized names to handle underscore/hyphen mismatches
	const distinctServerNames = Array.from(
		new Set(
			prepared
				.map((p) => {
					const normalizedName = normalizeToolName(p.call.name, mapping);
					return mapping[normalizedName]?.server;
				})
				.filter(Boolean) as string[]
		)
	);
	const clientMap = new Map<string, Client>();
	await Promise.all(
		distinctServerNames.map(async (name) => {
			const cfg = serverLookup.get(name);
			if (!cfg) return;
			try {
				const client = await getClientEnhanced(cfg, abortSignal);
				clientMap.set(name, client);
			} catch (e) {
				logger.warn({ server: name, err: String(e) }, "[mcp] failed to connect client");
			}
		})
	);

	// Async queue to stream results in finish order
	function createQueue<T>() {
		const items: T[] = [];
		const waiters: Array<(v: IteratorResult<T>) => void> = [];
		let closed = false;
		return {
			push(item: T) {
				const waiter = waiters.shift();
				if (waiter) waiter({ value: item, done: false });
				else items.push(item);
			},
			close() {
				closed = true;
				let waiter: ((v: IteratorResult<T>) => void) | undefined;
				while ((waiter = waiters.shift())) {
					waiter({ value: undefined as unknown as T, done: true });
				}
			},
			async *iterator() {
				for (;;) {
					if (items.length) {
						const first = items.shift();
						if (first !== undefined) yield first as T;
						continue;
					}
					if (closed) return;
					const value: IteratorResult<T> = await new Promise((res) => waiters.push(res));
					if (value.done) return;
					yield value.value as T;
				}
			},
		};
	}

	const q = createQueue<TaskResult>();

	const tasks = prepared.map(async (p, index) => {
		// Check abort signal before processing each task
		if (abortSignal?.aborted) {
			q.push({
				index,
				error: "Tool execution aborted",
				uuid: p.uuid,
				paramsClean: p.paramsClean,
			});
			return;
		}

		if (p.parseError) {
			q.push({
				index,
				error: `Invalid tool arguments: ${p.parseError}`,
				uuid: p.uuid,
				paramsClean: p.paramsClean,
			});
			return;
		}

		// Normalize tool name to handle underscore/hyphen mismatches
		const normalizedName = normalizeToolName(p.call.name, mapping);
		const mappingEntry = mapping[normalizedName];
		if (!mappingEntry) {
			q.push({
				index,
				error: `Unknown MCP function: ${p.call.name} (tried: ${normalizedName})`,
				uuid: p.uuid,
				paramsClean: p.paramsClean,
			});
			return;
		}
		const serverCfg = serverLookup.get(mappingEntry.server);
		if (!serverCfg) {
			q.push({
				index,
				error: `Unknown MCP server: ${mappingEntry.server}`,
				uuid: p.uuid,
				paramsClean: p.paramsClean,
			});
			return;
		}
		let client = clientMap.get(mappingEntry.server);

		// Helper to execute tool call with retry logic for connection issues
		const executeCall = async (
			currentClient: Client | undefined,
			isRetry = false
		): Promise<void> => {
			if (!currentClient) {
				throw new Error(`No client available for server ${mappingEntry.server}`);
			}

			try {
				if (!isRetry) {
					logger.debug(
						{ server: mappingEntry.server, tool: mappingEntry.tool, parameters: p.paramsClean },
						"[mcp] invoking tool"
					);
				} else {
					logger.warn(
						{ server: mappingEntry.server, tool: mappingEntry.tool },
						"[mcp] retrying tool invocation after connection error"
					);
				}

				const toolResponse: McpToolTextResponse = await callMcpTool(
					serverCfg,
					mappingEntry.tool,
					p.argsObj,
					{
						client: currentClient,
						signal: abortSignal,
						timeoutMs: toolTimeoutMs,
					}
				);
				const { annotated } = processToolOutput(toolResponse.text ?? "");
				logger.debug(
					{ server: mappingEntry.server, tool: mappingEntry.tool },
					"[mcp] tool call completed"
				);
				q.push({
					index,
					output: annotated,
					structured: toolResponse.structured,
					blocks: toolResponse.content,
					uuid: p.uuid,
					paramsClean: p.paramsClean,
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);

				// Check for "Not connected" error and retry once if we haven't already
				if (
					!isRetry &&
					(message.includes("Not connected") || message.includes("Connection closed"))
				) {
					logger.warn(
						{ server: mappingEntry.server, tool: mappingEntry.tool, err: message },
						"[mcp] tool call failed with connection error, invalidating client and retrying"
					);

					// Invalidate the bad client
					invalidateClientEnhanced(serverCfg, currentClient);

					// Get a new client
					try {
						const newClient = await getClientEnhanced(serverCfg, abortSignal);
						// Update the map for subsequent calls in this batch (though unlikely to share)
						clientMap.set(mappingEntry.server, newClient);
						// Retry with new client
						await executeCall(newClient, true);
						return;
					} catch (retryErr) {
						// If retry fails, fall through to normal error handling
						logger.error(
							{ server: mappingEntry.server, tool: mappingEntry.tool, err: String(retryErr) },
							"[mcp] retry failed"
						);
					}
				}

				logger.error(
					{
						server: mappingEntry.server,
						tool: mappingEntry.tool,
						err: message,
						toolName: p.call.name,
					},
					"[mcp] tool call failed with error"
				);

				// Enhanced error information for better debugging
				const enhancedError = {
					message,
					toolName: p.call.name,
					server: mappingEntry.server,
					tool: mappingEntry.tool,
					timestamp: new Date().toISOString(),
				};

				q.push({
					index,
					error: JSON.stringify(enhancedError),
					uuid: p.uuid,
					paramsClean: p.paramsClean,
				});
			}
		};

		await executeCall(client);
	});

	// kick off and stream as they finish
	Promise.allSettled(tasks).then(() => q.close());

	const results: TaskResult[] = [];
	for await (const r of q.iterator()) {
		// Check abort signal during iteration
		if (abortSignal?.aborted) {
			logger.warn("[mcp] tool execution aborted during result processing");
			break;
		}

		results.push(r);
		if (r.error) {
			yield {
				type: "update",
				update: {
					type: MessageUpdateType.Tool,
					subtype: MessageToolUpdateType.Error,
					uuid: r.uuid,
					message: r.error,
				},
			};
		} else {
			yield {
				type: "update",
				update: {
					type: MessageUpdateType.Tool,
					subtype: MessageToolUpdateType.Result,
					uuid: r.uuid,
					result: {
						status: ToolResultStatus.Success,
						call: { name: prepared[r.index].call.name, parameters: r.paramsClean },
						outputs: [
							{
								text: r.output ?? "",
								structured: r.structured,
								content: r.blocks,
							} as unknown as Record<string, unknown>,
						],
						display: true,
					},
				},
			};
		}
	}

	// Collate outputs in original call order
	results.sort((a, b) => a.index - b.index);

	// Check for critical errors that should abort the entire flow
	const criticalErrors = results.filter((r) => r.error);
	if (criticalErrors.length > 0 && criticalErrors.length === results.length) {
		// All tool calls failed - this is a critical failure
		const errorSummary = criticalErrors.map((r) => ({
			toolName: prepared[r.index].call.name,
			error: r.error,
		}));

		logger.error(
			{ errorCount: criticalErrors.length, errorSummary },
			"[mcp] all tool calls failed - critical error"
		);

		// Throw error to abort the MCP flow
		throw new Error(`All tool calls failed: ${JSON.stringify(errorSummary)}`);
	}

	for (const r of results) {
		const name = prepared[r.index].call.name;
		const id = prepared[r.index].call.id;
		if (!r.error) {
			const output = r.output ?? "";
			toolRuns.push({ name, parameters: r.paramsClean, output });
			// For the LLM follow-up call, we keep only the textual output
			toolMessages.push({ role: "tool", tool_call_id: id, content: output });
		} else {
			// Log individual tool failures but continue with successful ones
			logger.warn(
				{ toolName: name, error: r.error },
				"[mcp] individual tool call failed but continuing with successful tools"
			);
		}
	}

	yield { type: "complete", summary: { toolMessages, toolRuns } };

	// Release clients back to the pool
	const clientEntries = Array.from(clientMap.entries());
	for (const [serverName, client] of clientEntries) {
		const serverConfig = serverLookup.get(serverName);
		if (serverConfig) {
			releaseClientEnhanced(serverConfig, client);
		}
	}
}
