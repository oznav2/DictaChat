import { config } from "$lib/server/config";
import {
	MessageUpdateType,
	type MessageUpdate,
	MessageToolUpdateType,
} from "$lib/types/MessageUpdate";
import { getMcpServers } from "$lib/server/mcp/registry";
import { validateMcpServerUrlCached } from "$lib/server/urlValidationCache";
import { resetMcpToolsCache } from "$lib/server/mcp/tools";
import { getOpenAiToolsForMcp } from "$lib/server/mcp/tools";
import type {
	ChatCompletionChunk,
	ChatCompletionCreateParamsStreaming,
	ChatCompletionMessageParam,
	ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";
import { buildToolPreprompt } from "../utils/toolPrompt";
import { registerMcpServices } from "./serviceRegistration";
import { getToolFilterService, getLoopDetectorService } from "./serviceContainer";
import { extractUserQuery } from "./toolFilter";
import type { EndpointMessage } from "../../endpoints/endpoints";
import { resolveRouterTarget } from "./routerResolution";
import { executeToolCalls, type NormalizedToolCall } from "./toolInvocation";
import { drainPoolEnhanced } from "$lib/server/mcp/clientPoolEnhanced";
import type { TextGenerationContext } from "../types";
import { hasAuthHeader, isStrictHfMcpLogin, hasNonEmptyToken } from "$lib/server/mcp/hf";
import { buildImageRefResolver } from "./fileRefs";
import { prepareMessagesWithFilesMemoized } from "$lib/server/textGeneration/utils/prepareFilesMemoized";
import { makeImageProcessor } from "$lib/server/endpoints/images";
import { extractJsonObjectSlice } from "$lib/server/textGeneration/utils/jsonExtractor";
import { repairXmlTags } from "$lib/server/textGeneration/utils/xmlUtils";
import { detectHebrewIntent } from "$lib/server/textGeneration/utils/hebrewIntentDetector";
import { StructuredLoggingService, LogLevel } from "./loggingService";
import { startTimer, timeAsync, logPerformanceSummary } from "./performanceMonitor";
import { executeWithCircuitBreaker } from "./circuitBreaker";
import { randomUUID } from "crypto";
import JSON5 from "json5";
import {
	hasDocumentAttachments,
	detectQueryLanguage,
	type RAGContextResult
} from "./ragIntegration";
import {
	prefetchMemoryContext,
	formatMemoryPromptSections,
	getUserIdFromConversation,
	recordResponseOutcome,
	storeWorkingMemory,
	extractExplicitToolRequest,
	type MemoryContextResult,
	type SearchPositionMap,
} from "./memoryIntegration";

/**
 * Clean string to ensure valid UTF-8 and remove invalid characters
 */
function cleanString(str: string): string {
	if (!str) return "";
	// Remove invalid surrogate pairs (lone surrogates)
	const valid = str.replace(
		/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
		""
	);
	// Remove replacement characters and null bytes
	return valid.replace(/[\uFFFD\0]/g, "");
}

function isInThinkBlock(text: string): boolean {
	const open = text.lastIndexOf("<think>");
	const close = text.lastIndexOf("</think>");
	return open !== -1 && open > close;
}

function findToolCallsPayloadStartIndex(text: string): number {
	const thinkClose = text.lastIndexOf("</think>");
	const base = thinkClose === -1 ? 0 : thinkClose + "</think>".length;
	const after = text.slice(base);
	const firstNonWs = after.search(/\S/);
	if (firstNonWs === -1) return -1;
	const start = base + firstNonWs;
	if (text[start] !== "{") return -1;
	const prefix = text.slice(start, Math.min(text.length, start + 200));
	if (!/^\{\s*(?:"tool_calls"|'tool_calls'|tool_calls)\s*:/.test(prefix)) return -1;
	const fenceCount = (text.slice(0, start).match(/```/g) ?? []).length;
	if (fenceCount % 2 === 1) return -1;
	return start;
}

function stripLeadingToolCallsPayload(text: string): { text: string; removed: boolean } {
	const start = findToolCallsPayloadStartIndex(text);
	if (start === -1) return { text, removed: false };
	const slice = extractJsonObjectSlice(text, start);
	if (!slice.success || !slice.json || slice.endIndex === undefined) {
		return { text, removed: false };
	}
	const before = text.slice(0, start).trimEnd();
	const after = text.slice(slice.endIndex).trimStart();
	const rebuilt = (before ? before + "\n" : "") + after;
	return { text: rebuilt.trim(), removed: rebuilt !== text };
}

export type RunMcpFlowContext = Pick<
	TextGenerationContext,
	"model" | "conv" | "assistant" | "forceMultimodal" | "forceTools" | "locals"
> & { messages: EndpointMessage[] };

export async function* runMcpFlow({
	model,
	conv,
	messages,
	assistant,
	forceMultimodal,
	forceTools,
	locals,
	preprompt,
	abortSignal,
}: RunMcpFlowContext & { preprompt?: string; abortSignal?: AbortSignal }): AsyncGenerator<
	MessageUpdate,
	boolean,
	undefined
> {
	// Initialize enhanced logging with correlation ID
	const correlationId = (conv._id?.toString() || randomUUID()).slice(0, 8);
	const logger = new StructuredLoggingService(correlationId, {
		minLevel: LogLevel.DEBUG,
		enableConsole: true,
	});

	logger.debug("[mcp] runMcpFlow started", {
		model: model.id || model.name,
		messageCount: messages.length,
		hasAbortSignal: !!abortSignal,
	});
	// Start from env-configured servers
	let servers = getMcpServers();
	try {
		console.debug(
			{ baseServers: servers.map((s) => ({ name: s.name, url: s.url })), count: servers.length },
			"[mcp] base servers loaded"
		);
	} catch {}

	// Merge in request-provided custom servers (if any)
	try {
		const reqMcp = (
			locals as unknown as {
				mcp?: {
					selectedServers?: Array<{ name: string; url: string; headers?: Record<string, string> }>;
					selectedServerNames?: string[];
				};
			}
		)?.mcp;
		const custom = Array.isArray(reqMcp?.selectedServers) ? reqMcp?.selectedServers : [];
		if (custom.length > 0) {
			// Invalidate cached tool list when the set of servers changes at request-time
			resetMcpToolsCache();
			// Deduplicate by server name (request takes precedence)
			const byName = new Map<
				string,
				{ name: string; url: string; headers?: Record<string, string> }
			>();
			for (const s of servers) byName.set(s.name, s);
			for (const s of custom) byName.set(s.name, s);
			servers = Array.from(byName.values());
			try {
				console.debug(
					{
						customProvidedCount: custom.length,
						mergedServers: servers.map((s) => ({
							name: s.name,
							url: s.url,
							hasAuth: !!s.headers?.Authorization,
						})),
					},
					"[mcp] merged request-provided servers"
				);
			} catch {}
		}

		// If the client specified a selection by name, filter to those
		const names = Array.isArray(reqMcp?.selectedServerNames)
			? reqMcp?.selectedServerNames
			: undefined;
		if (Array.isArray(names)) {
			const before = servers.map((s) => s.name);
			servers = servers.filter((s) => names.includes(s.name));
			try {
				console.debug(
					{ selectedNames: names, before, after: servers.map((s) => s.name) },
					"[mcp] applied name selection"
				);
			} catch {}
		}
	} catch {
		// ignore selection merge errors and proceed with env servers
	}

	// If selection/merge yielded no servers, bail early with clearer log
	if (servers.length === 0) {
		logger.warn("[mcp] no MCP servers selected after merge/name filter");
		return false;
	}

	// Enforce server-side safety (public HTTPS only, no private ranges)
	// Relaxed for local MCP integration
	{
		const before = servers.slice();
		servers = servers.filter((s) => {
			try {
				// Use cached URL validation to reduce redundancy and improve performance
				return validateMcpServerUrlCached(s.url).isValid;
			} catch {
				return false;
			}
		});
		try {
			const rejected = before.filter((b) => !servers.includes(b));
			if (rejected.length > 0) {
				const rejectedWithReasons = rejected.map((r) => {
					const res = validateMcpServerUrlCached(r.url);
					return {
						name: r.name,
						url: r.url,
						error: res.error,
						details: res.details,
					};
				});
				logger.warn("[mcp] rejected servers by URL safety", { rejected: rejectedWithReasons });
			}
		} catch {}
	}
	if (servers.length === 0) {
		logger.warn("[mcp] all selected MCP servers rejected by URL safety guard");
		return false;
	}

	// Optionally attach the logged-in user's HF token to the official HF MCP server only.
	// Never override an explicit Authorization header, and require token to look like an HF token.
	try {
		const shouldForward = config.MCP_FORWARD_HF_USER_TOKEN === "true";
		const userToken =
			(locals as unknown as { hfAccessToken?: string } | undefined)?.hfAccessToken ??
			(locals as unknown as { token?: string } | undefined)?.token;

		if (shouldForward && hasNonEmptyToken(userToken)) {
			const overlayApplied: string[] = [];
			servers = servers.map((s) => {
				try {
					if (isStrictHfMcpLogin(s.url) && !hasAuthHeader(s.headers)) {
						overlayApplied.push(s.name);
						return {
							...s,
							headers: { ...(s.headers ?? {}), Authorization: `Bearer ${userToken}` },
						};
					}
				} catch {
					// ignore URL parse errors and leave server unchanged
				}
				return s;
			});
			if (overlayApplied.length > 0) {
				try {
					console.debug({ overlayApplied }, "[mcp] forwarded HF token to servers");
				} catch {}
			}
		}
	} catch {
		// best-effort overlay; continue if anything goes wrong
	}
	console.debug(
		{ count: servers.length, servers: servers.map((s) => s.name) },
		"[mcp] servers configured"
	);
	if (servers.length === 0) {
		return false;
	}

	// Gate MCP flow based on model tool support (aggregated) with user override
	try {
		const supportsTools = Boolean((model as unknown as { supportsTools?: boolean }).supportsTools);
		const toolsEnabled = Boolean(forceTools) || supportsTools;
		console.debug(
			{
				model: model.id ?? model.name,
				supportsTools,
				forceTools: Boolean(forceTools),
				toolsEnabled,
			},
			"[mcp] tools gate evaluation"
		);
		if (!toolsEnabled) {
			console.info(
				{ model: model.id ?? model.name },
				"[mcp] tools disabled for model; skipping MCP flow"
			);
			return false;
		}
	} catch {
		// If anything goes wrong reading the flag, proceed (previous behavior)
	}

	const resolveFileRef = buildImageRefResolver(messages);
	const imageProcessor = makeImageProcessor({
		supportedMimeTypes: ["image/png", "image/jpeg"],
		preferredMimeType: "image/jpeg",
		maxSizeInMB: 1,
		maxWidth: 1024,
		maxHeight: 1024,
	});

	const hasImageInput = messages.some((msg) =>
		(msg.files ?? []).some(
			(file) => typeof file?.mime === "string" && file.mime.startsWith("image/")
		)
	);

	const { runMcp, targetModel, candidateModelId, resolvedRoute } = await resolveRouterTarget({
		model,
		messages,
		conversationId: conv._id.toString(),
		hasImageInput,
		locals,
	});

	if (!runMcp) {
		console.info(
			{ model: targetModel.id ?? targetModel.name, resolvedRoute },
			"[mcp] runMcp=false (routing chose non-tools candidate)"
		);
		return false;
	}

	const { tools: oaTools, mapping } = await getOpenAiToolsForMcp(servers, { signal: abortSignal });

	// Register services
	registerMcpServices();

	// ============================================
	// CRITICAL: Check for document attachments BEFORE filtering
	// ============================================
	// If documents are attached, we MUST include docling tools
	// regardless of the user's query wording.
	// ============================================
	const hasDocuments = hasDocumentAttachments(messages);
	if (hasDocuments) {
		logger.debug("[mcp] Documents detected - docling tools will be included", {
			messageCount: messages.length,
		});
	}

	// Filter tools by user intent to reduce grammar complexity
	// Pass hasDocuments flag to ensure docling tools are available when needed
	const userQuery = extractUserQuery(messages);
	const filterTimer = startTimer("tool_filtering");
	const { filtered: filteredTools, categories: matchedCategories } =
		getToolFilterService().filterToolsByIntent(oaTools, userQuery, { hasDocuments });
	filterTimer();

	console.info(
		{
			originalToolCount: oaTools.length,
			filteredToolCount: filteredTools.length,
			matchedCategories,
			filteredToolNames: filteredTools.map((t) => t.function.name),
			userQueryPreview: userQuery.slice(0, 100),
			hasDocuments,
		},
		"[mcp] tool filtering applied"
	);

	// Use filtered tools for the rest of the flow
	const toolsToUse = filteredTools;

	if (toolsToUse.length === 0) {
		console.warn("[mcp] zero tools available after filtering; skipping MCP flow");
		return false;
	}

	// ============================================
	// ENTERPRISE UX: NO BLOCKING RAG PIPELINE
	// ============================================
	// Reasoning MUST stream immediately when user submits.
	// Document processing happens through real tool calls (docling_convert).
	// The trace panel shows progress when tools actually execute.
	// ============================================
	const ragContext: RAGContextResult | null = null;

	try {
		const { OpenAI } = await import("openai");

		// Capture provider header (x-inference-provider) from the upstream OpenAI-compatible server.
		let providerHeader: string | undefined;
		const captureProviderFetch = async (
			input: RequestInfo | URL,
			init?: RequestInit
		): Promise<Response> => {
			const res = await fetch(input, init);
			const p = res.headers.get("x-inference-provider");
			if (p && !providerHeader) providerHeader = p;
			return res;
		};

		const openai = new OpenAI({
			apiKey: config.OPENAI_API_KEY || config.HF_TOKEN || "sk-",
			baseURL: config.OPENAI_BASE_URL || "http://localhost:8002/v1",
			fetch: captureProviderFetch,
			defaultHeaders: {
				// Bill to organization if configured (HuggingChat only)
				...(config.isHuggingChat && locals?.billingOrganization
					? { "X-HF-Bill-To": locals.billingOrganization }
					: {}),
			},
		});

		const mmEnabled = (forceMultimodal ?? false) || targetModel.multimodal;
		console.info(
			{
				targetModel: targetModel.id ?? targetModel.name,
				mmEnabled,
				route: resolvedRoute,
				candidateModelId,
				toolCount: toolsToUse.length,
				hasUserToken: Boolean((locals as unknown as { token?: string })?.token),
			},
			"[mcp] starting completion with tools"
		);
		let messagesOpenAI: ChatCompletionMessageParam[] = await prepareMessagesWithFilesMemoized(
			messages,
			imageProcessor,
			mmEnabled
		);

		// Note: We do NOT modify user messages to remove docling prompts.
		// Instead, the RAG context injection in preprompt tells the model
		// that the document is already processed. This is safer and preserves
		// the original message structure.

		// Check if we should use native OpenAI tools API (experimental)
		const useNativeTools = process.env.MCP_USE_NATIVE_TOOLS === "true";

		// Tool prompt injection - either XML format (for llama.cpp) or simple list (for native tools)
		const prepromptPieces: string[] = [];

		// ============================================
		// MEMORY SYSTEM INTEGRATION (Section 9 from rompal_implementation_plan.md)
		// Point A: Prefetch context before inference
		// Point B: Confidence-based tool gating
		// Point C: Inject personality (Section 1) + memory context (Section 2)
		// ============================================
		const userId = getUserIdFromConversation(conv as { sessionId?: string; userId?: string });
		const conversationId = conv._id?.toString() ?? "";
		let memoryResult: MemoryContextResult | null = null;
		let searchPositionMap: SearchPositionMap = {};
		const explicitToolRequest = extractExplicitToolRequest(userQuery);

		try {
			// Build recent messages for context-aware retrieval
			const recentMessages = messages.slice(-5).map((m) => ({
				role: m.from ?? "user",
				content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
			}));

			memoryResult = await prefetchMemoryContext(userId, userQuery, {
				conversationId,
				recentMessages,
				hasDocuments,
				signal: abortSignal,
			});

			// Store searchPositionMap for outcome tracking
			searchPositionMap = memoryResult.searchPositionMap;

			// Prepend memory sections (personality first, then memory context with confidence hint)
			const memorySections = formatMemoryPromptSections(memoryResult);
			for (const section of memorySections) {
				prepromptPieces.push(section);
			}

			if (memoryResult.timing.personalityMs > 0 || memoryResult.timing.memoryMs > 0) {
				logger.debug("[mcp] Memory context prefetched", {
					hasPersonality: !!memoryResult.personalityPrompt,
					hasMemoryContext: !!memoryResult.memoryContext,
					isOperational: memoryResult.isOperational,
					retrievalConfidence: memoryResult.retrievalConfidence,
					memoriesRetrieved: Object.keys(searchPositionMap).length,
					personalityMs: memoryResult.timing.personalityMs,
					memoryMs: memoryResult.timing.memoryMs,
				});
			}
		} catch (err) {
			// Memory system must never block streaming - fail silently
			logger.warn("[mcp] Memory prefetch failed, continuing without memory context", { error: String(err) });
		}

		if (toolsToUse.length > 0 && !useNativeTools) {
			// Detect Hebrew intent (research vs search) to guide tool selection
			const hebrewIntent = detectHebrewIntent(userQuery);
			let intentHint = "";

			if (hebrewIntent === "research") {
				// Check for research tool (perplexity)
				if (toolsToUse.some((t) => t.function.name.includes("perplexity"))) {
					intentHint =
						"User explicitly requested a DEEP RESEARCH task (מחקר). You MUST use the 'perplexity_ask' (or equivalent) tool for comprehensive analysis.";
				}
			} else if (hebrewIntent === "search") {
				// Check for search tool (tavily or generic search)
				if (
					toolsToUse.some(
						(t) => t.function.name.includes("tavily") || t.function.name.includes("search")
					)
				) {
					intentHint =
						"User explicitly requested a WEB SEARCH (חפש). You MUST use the 'tavily_search' (or equivalent) tool.";
				}
			}

			// Use the shared prompt builder that enforces reasoning and correct format
			const toolPrompt = buildToolPreprompt(toolsToUse, intentHint);
			prepromptPieces.push(toolPrompt);

			// DataGov Israel guidance when DataGov tools are present
			const datagovToolNames = new Set([
				"datagov_query", // PRIMARY - unified query tool
				"datagov_resource_map",
				"datagov_helper",
				"datagov_helper_map",
				"datagov_helper_pick",
				"datastore_search",
				"package_search",
				"package_show",
				"fetch_data",
				"get_resource_metadata_offline",
			]);
			const hasDataGov = toolsToUse.some((t) => datagovToolNames.has(t.function.name));
			if (hasDataGov) {
				const datagovGuidance = `**DataGov Israel (data.gov.il) - PRIORITY TOOL**

When the user asks about Israeli government/public data, statistics, ministries, hospitals, or any query mentioning "datagov", "data.gov.il", or Hebrew keywords like "נתונים ממשלתיים", "בתי חולים", "משרד הבריאות", you MUST use the DataGov tools.

**PRIMARY TOOL**: \`datagov_query\`
- Use this for ALL DataGov queries - it handles everything automatically
- The \`query\` parameter is REQUIRED - never call with empty arguments
- Supports Hebrew: {"query": "בתי חולים ירושלים", "limit": 20}
- Supports English: {"query": "trauma centers Jerusalem", "limit": 20}

**CORRECT USAGE**:
{
  "tool_calls": [
    {"name": "datagov_query", "arguments": {"query": "hospitals ministry of health", "limit": 20}}
  ]
}

**INCORRECT - DO NOT DO THIS**:
- Empty arguments: {"arguments": {}} ❌
- Missing query: {"arguments": {"limit": 20}} ❌

**DO NOT** use Tavily/Perplexity for Israeli government data - use DataGov tools instead.`;
				prepromptPieces.push(datagovGuidance);
			}
		}

		// ============================================
		// LANGUAGE INSTRUCTION
		// Respond in the same language as the user's query,
		// regardless of document content language
		// ============================================
		const queryLanguage = detectQueryLanguage(userQuery);
		if (queryLanguage === "he") {
			prepromptPieces.push(`**CRITICAL - Response Language**:
The user's query is in HEBREW. You MUST respond in HEBREW (עברית).
Even if the document content is in English, your response must be in Hebrew.
השתמש בעברית בתשובתך, גם אם המסמך באנגלית.`);
		} else if (queryLanguage === "en") {
			prepromptPieces.push(`**CRITICAL - Response Language**:
The user's query is in ENGLISH. You MUST respond in ENGLISH.
Even if the document content is in Hebrew or another language, your response must be in English.`);
		}
		// For "mixed" language, let the model decide based on context

		// const toolPreprompt = buildToolPreprompt(oaTools);
		// if (toolPreprompt.trim().length > 0) {
		// 	prepromptPieces.push(toolPreprompt);
		// }
		if (typeof preprompt === "string" && preprompt.trim().length > 0) {
			prepromptPieces.push(preprompt);
		}
		const mergedPreprompt = prepromptPieces.join("\n\n");
		const hasSystemMessage = messagesOpenAI.length > 0 && messagesOpenAI[0]?.role === "system";
		if (hasSystemMessage) {
			if (mergedPreprompt.length > 0) {
				const existing = messagesOpenAI[0].content ?? "";
				const existingText = typeof existing === "string" ? existing : "";
				messagesOpenAI[0].content = mergedPreprompt + (existingText ? "\n\n" + existingText : "");
			}
		} else if (mergedPreprompt.length > 0) {
			messagesOpenAI = [{ role: "system", content: mergedPreprompt }, ...messagesOpenAI];
		}

		// Work around servers that reject `system` role
		if (
			typeof config.OPENAI_BASE_URL === "string" &&
			config.OPENAI_BASE_URL.length > 0 &&
			(config.OPENAI_BASE_URL.includes("hf.space") ||
				config.OPENAI_BASE_URL.includes("gradio.app")) &&
			messagesOpenAI[0]?.role === "system"
		) {
			messagesOpenAI[0] = { ...messagesOpenAI[0], role: "user" };
		}

		const parameters = { ...targetModel.parameters, ...assistant?.generateSettings } as Record<
			string,
			unknown
		>;
		// For tool-calling, allow enough tokens for thinking + tool call + response
		let maxTokens =
			(parameters?.max_tokens as number | undefined) ??
			(parameters?.max_new_tokens as number | undefined) ??
			(parameters?.max_completion_tokens as number | undefined) ??
			4096;

		// Enforce a reasonable limit (allow up to 8192 for long tool responses)
		if (maxTokens <= 0 || maxTokens > 8192) {
			console.warn(`[mcp] clamping max_tokens from ${maxTokens} to 4096`);
			maxTokens = 4096;
		}

		const stopSequences =
			typeof parameters?.stop === "string"
				? [parameters.stop]
				: Array.isArray(parameters?.stop)
					? (parameters.stop as string[])
					: [];

		// For JSON tool calling format, we don't need special stop sequences
		// The model should output complete JSON: {"tool_calls": [...]}
		// NOTE: Do NOT add </think> as stop sequence - model needs to finish thinking
		// THEN generate the tool call. Stopping at </think> cuts off the response.

		// For llama.cpp, we need repetition_penalty (1.0-1.5 range, 1.0 = no penalty)
		// This prevents the model from getting stuck in repetition loops after tool execution
		// Use 1.1 as balance between preventing loops and not breaking JSON formatting
		const repetitionPenalty =
			typeof parameters?.repetition_penalty === "number" ? parameters.repetition_penalty : 1.1; // Balance between preventing loops and valid JSON output

		const completionBase: Omit<ChatCompletionCreateParamsStreaming, "messages"> & {
			repetition_penalty?: number;
			tools?: typeof toolsToUse;
			tool_choice?: "auto" | "none";
		} = {
			model: targetModel.id ?? targetModel.name,
			stream: true,
			temperature: typeof parameters?.temperature === "number" ? parameters.temperature : undefined,
			top_p: typeof parameters?.top_p === "number" ? parameters.top_p : undefined,
			frequency_penalty:
				typeof parameters?.frequency_penalty === "number"
					? parameters.frequency_penalty
					: undefined,
			presence_penalty:
				typeof parameters?.presence_penalty === "number" ? parameters.presence_penalty : undefined,
			// llama.cpp specific: repetition_penalty helps prevent loops in quantized models
			repetition_penalty: repetitionPenalty,
			stop: stopSequences,
			max_tokens: typeof maxTokens === "number" ? maxTokens : undefined,
			// Native tools API - only enable if MCP_USE_NATIVE_TOOLS=true
			// With few tools (2-3), native API may work better than XML injection
			...(useNativeTools ? { tools: toolsToUse, tool_choice: "auto" as const } : {}),
		};

		// Debug: Log message sizes to diagnose token explosion
		const messageSizes = messagesOpenAI.map((m, i) => ({
			index: i,
			role: m.role,
			contentLength:
				typeof m.content === "string" ? m.content.length : JSON.stringify(m.content || "").length,
		}));
		const totalChars = messageSizes.reduce((sum, m) => sum + m.contentLength, 0);

		console.debug(
			{
				messageCount: messagesOpenAI.length,
				toolCount: toolsToUse.length,
				maxTokens,
				repetitionPenalty,
				useNativeTools,
				totalChars,
				messageSizes,
			},
			"[mcp] completion request configured"
		);

		const toPrimitive = (value: unknown) => {
			if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
				return value;
			}
			return undefined;
		};

		const parseArgs = (raw: unknown): { value: Record<string, unknown>; error?: string } => {
			if (typeof raw !== "string" || raw.trim().length === 0) return { value: {} };
			try {
				const parsed = JSON.parse(raw) as unknown;
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
					return { value: parsed as Record<string, unknown> };
				return { value: {}, error: "Arguments must be a JSON object" };
			} catch (e) {
				try {
					const parsed = JSON5.parse(raw) as unknown;
					if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
						return { value: parsed as Record<string, unknown> };
					return { value: {}, error: "Arguments must be an object" };
				} catch (e2) {
					const msg = e2 instanceof Error ? e2.message : String(e2);
					return { value: {}, error: msg };
				}
			}
		};

		const processToolOutput = (
			text: string
		): {
			annotated: string;
			sources: { index: number; link: string }[];
		} => ({ annotated: cleanString(text), sources: [] });

		let lastAssistantContent = "";
		let streamedContent = false;
		// Track whether we're inside a <think> block when the upstream streams
		// provider-specific reasoning tokens (e.g. `reasoning` or `reasoning_content`).
		let thinkOpen = false;

		if (resolvedRoute && candidateModelId) {
			yield {
				type: MessageUpdateType.RouterMetadata,
				route: resolvedRoute,
				model: candidateModelId,
			};
			logger.debug("[mcp] router metadata emitted", {
				route: resolvedRoute,
				model: candidateModelId,
			});
		}

		// Enhanced loop detection with semantic analysis
		const loopDetector = getLoopDetectorService();

		// Constants for memory management and performance
		const MAX_CONTENT_LENGTH = 50000; // 50KB limit for content accumulation

		// Track all tool executions for outcome recording (Point D from rompal_implementation_plan.md)
		const executedToolsTracker: Array<{ name: string; success: boolean; latencyMs?: number }> = [];

		for (let loop = 0; loop < 10; loop += 1) {
			lastAssistantContent = "";
			streamedContent = false;
			let codeFenceOpen = false;

			// For follow-up completions after tool results (loop > 0):
			// 1. Allow sufficient tokens for comprehensive summaries with citations (6144 default for verbose, comprehensive output)
			// 2. Increase repetition_penalty to prevent loops
			// CRITICAL: For summaries, OVERRIDE the original token limit (don't use Math.min)
			// The original request might have a low max_tokens, but summaries need more space
			const isFollowup = loop > 0;
			const followupMaxTokens = isFollowup
				? parseInt(process.env.MCP_FOLLOWUP_MAX_TOKENS || "6144", 10)
				: completionBase.max_tokens;

			// Higher repetition penalty for follow-up to prevent degeneration
			const followupRepPenalty = isFollowup
				? parseFloat(process.env.MCP_FOLLOWUP_REP_PENALTY || "1.05")
				: completionBase.repetition_penalty;

			if (isFollowup) {
				console.info(
					{
						loop,
						maxTokens: followupMaxTokens,
						repPenalty: followupRepPenalty,
						envValue: process.env.MCP_FOLLOWUP_REP_PENALTY,
					},
					"[mcp] follow-up completion configuration"
				);
			}

			// Lower temperature for follow-up to reduce hallucination (more deterministic)
			const followupTemperature = isFollowup
				? parseFloat(process.env.MCP_FOLLOWUP_TEMPERATURE || "0.7")
				: completionBase.temperature;

			const followupStopSequences = isFollowup ? stopSequences : undefined;

			const completionRequest: ChatCompletionCreateParamsStreaming = {
				...completionBase,
				stream: true,
				messages: messagesOpenAI,
				max_tokens: followupMaxTokens,
				repetition_penalty: followupRepPenalty,
				temperature: followupTemperature,
				...(followupStopSequences ? { stop: followupStopSequences } : {}),
			} as ChatCompletionCreateParamsStreaming & { repetition_penalty?: number; stop?: string[] };

			if (isFollowup) {
				console.info(
					{ loop, maxTokens: followupMaxTokens, repPenalty: followupRepPenalty },
					"[mcp] follow-up completion configured with reduced tokens and higher rep penalty"
				);
			}

			const completionStream: Stream<ChatCompletionChunk> = await timeAsync(
				"completion_creation",
				() =>
					executeWithCircuitBreaker(
						"openai_completion",
						() =>
							openai.chat.completions.create(completionRequest, {
								signal: abortSignal,
								headers: {
									"ChatUI-Conversation-ID": conv._id.toString(),
									"X-use-cache": "false",
									...(locals?.token ? { Authorization: `Bearer ${locals.token}` } : {}),
								},
							}),
						{
							failureThreshold: 3,
							resetTimeout: 30000,
							monitoringPeriod: 60000,
						}
					)
			);

			// If provider header was exposed, notify UI so it can render "via {provider}".
			if (providerHeader) {
				yield {
					type: MessageUpdateType.RouterMetadata,
					route: "",
					model: "",
					provider: providerHeader as unknown as import("@huggingface/inference").InferenceProvider,
				};
				console.debug({ provider: providerHeader }, "[mcp] provider metadata emitted");
			}

			const toolCallState: Record<number, { id?: string; name?: string; arguments: string }> = {};
			let firstToolDeltaLogged = false;
			let sawToolCall = false;
			let toolCallDetectedLogged = false;
			let tokenCount = 0;
			for await (const chunk of completionStream) {
				const choice = chunk.choices?.[0];
				const delta = choice?.delta;
				if (!delta) continue;

				const chunkToolCalls = delta.tool_calls ?? [];
				if (chunkToolCalls.length > 0) {
					sawToolCall = true;
					for (const call of chunkToolCalls) {
						const toolCall = call as unknown as {
							index?: number;
							id?: string;
							function?: { name?: string; arguments?: string };
						};
						const index = toolCall.index ?? 0;
						const current = toolCallState[index] ?? { arguments: "" };
						if (toolCall.id) current.id = toolCall.id;
						if (toolCall.function?.name) current.name = toolCall.function.name;
						if (toolCall.function?.arguments) current.arguments += toolCall.function.arguments;
						toolCallState[index] = current;
					}
					if (!firstToolDeltaLogged) {
						try {
							const first =
								toolCallState[
									Object.keys(toolCallState)
										.map((k) => Number(k))
										.sort((a, b) => a - b)[0] ?? 0
								];
							console.info(
								{ firstCallName: first?.name, hasId: Boolean(first?.id) },
								"[mcp] observed streamed tool_call delta"
							);
							firstToolDeltaLogged = true;
						} catch {}
					}
				}

				const deltaContent = (() => {
					if (typeof delta.content === "string") return delta.content;
					const maybeParts = delta.content as unknown;
					if (Array.isArray(maybeParts)) {
						return maybeParts
							.map((part) =>
								typeof part === "object" &&
								part !== null &&
								"text" in part &&
								typeof (part as Record<string, unknown>).text === "string"
									? String((part as Record<string, unknown>).text)
									: ""
							)
							.join("");
					}
					return "";
				})();

				// Provider-dependent reasoning fields (e.g., `reasoning` or `reasoning_content`).
				const deltaReasoning: string =
					typeof (delta as unknown as Record<string, unknown>)?.reasoning === "string"
						? ((delta as unknown as { reasoning?: string }).reasoning as string)
						: typeof (delta as unknown as Record<string, unknown>)?.reasoning_content === "string"
							? ((delta as unknown as { reasoning_content?: string }).reasoning_content as string)
							: "";

				// Merge reasoning + content into a single combined token stream, mirroring
				// the OpenAI adapter so the UI can auto-detect <think> blocks.
				// IMPORTANT: If deltaContent already contains <think> tags, don't wrap again
				let combined = "";
				// Optimized: Single regex pass instead of multiple includes() calls
				const contentHasThinkTags = deltaContent && /<\/?think>/i.test(deltaContent);

				if (deltaReasoning.trim().length > 0 && !contentHasThinkTags) {
					if (!thinkOpen) {
						combined += "<think>" + deltaReasoning;
						thinkOpen = true;
					} else {
						combined += deltaReasoning;
					}
				}

				if (deltaContent && deltaContent.length > 0) {
					if (contentHasThinkTags) {
						// Model already handles think tags, pass through as-is
						combined += deltaContent;
						thinkOpen = false;
					} else if (thinkOpen) {
						combined += "</think>" + deltaContent;
						thinkOpen = false;
					} else {
						combined += deltaContent;
					}
				}

				if (combined.length > 0) {
					const fenceMatches = combined.match(/```/g);
					if (fenceMatches && fenceMatches.length % 2 === 1) {
						codeFenceOpen = !codeFenceOpen;
					}

					let nextContent = lastAssistantContent + combined;
					if (nextContent.length > MAX_CONTENT_LENGTH) {
						const preserveStart = findToolCallsPayloadStartIndex(nextContent);
						if (preserveStart !== -1 && nextContent.length - preserveStart <= MAX_CONTENT_LENGTH) {
							nextContent = nextContent.slice(preserveStart);
						} else {
							nextContent = nextContent.slice(nextContent.length - MAX_CONTENT_LENGTH);
						}
						console.warn(
							{
								currentLength: lastAssistantContent.length,
								newContentLength: combined.length,
								maxLength: MAX_CONTENT_LENGTH,
							},
							"[mcp] content size limit exceeded, truncating to prevent memory accumulation"
						);
					}
					lastAssistantContent = nextContent;

					const toolCallsPayloadStart = codeFenceOpen
						? -1
						: findToolCallsPayloadStartIndex(lastAssistantContent);
					const hasToolCallInContent = toolCallsPayloadStart !== -1;

					// CRITICAL: During initial tool call (loop 0), buffer content before streaming
					// to prevent showing gibberish that appears before {"tool_calls": ...}
					// Only stream if we have enough content to be confident there are no tool calls coming
					// FIX: Allow <think> blocks to stream immediately by checking if we are inside one
					const inThinkBlock = isInThinkBlock(lastAssistantContent);

					// Calculate content length excluding the last think block to ensure we buffer the start of the actual response
					const thinkCloseIndex = lastAssistantContent.lastIndexOf("</think>");
					const contentStartIndex = thinkCloseIndex === -1 ? 0 : thinkCloseIndex + 8; // 8 is len of </think>
					const effectiveLength = lastAssistantContent.length - contentStartIndex;

					const shouldStream =
						!sawToolCall &&
						!hasToolCallInContent &&
						(inThinkBlock ||
							effectiveLength > 50);

					if (shouldStream) {
						// Stream any new content that hasn't been sent yet
						// We rely on tokenCount as the authoritative cursor of what has been yielded
						if (lastAssistantContent.length > tokenCount) {
							const toStream = lastAssistantContent.slice(tokenCount);
							streamedContent = true;
							yield { type: MessageUpdateType.Stream, token: toStream };
							tokenCount += toStream.length;
						}

						// EARLY ABORT: If model is generating too much content without calling a tool
						// This prevents 9000+ token responses that don't use tools
						// Enterprise Fix: Allow extensive reasoning chains (Thinking Models) to exceed standard limits
						const hasThinking = inThinkBlock || lastAssistantContent.includes("<think>");
						const safetyLimit = hasThinking ? 20000 : 1500;

						if (
							!isFollowup &&
							loop === 0 &&
							lastAssistantContent.length > safetyLimit &&
							!hasToolCallInContent
						) {
							// Check if this looks like a search query that should have used tools
							const userQuery =
								messages[messages.length - 1]?.content?.toString().toLowerCase() || "";
							const isSearchQuery =
								/search|find|חפש|מצא|מה|איזה|recommend|best|price|מחיר|compare|news|חדשות|research|מחקר/.test(
									userQuery
								);
							if (isSearchQuery) {
								console.warn(
									{ contentLength: lastAssistantContent.length, userQuery: userQuery.slice(0, 50) },
									"[mcp] model generating long response without tool call for search query, aborting"
								);
								break; // Exit streaming, will fallback
							}
						}

						// NOTE: Gibberish detection DISABLED for summary phase (isFollowup)
						// The summary input is clean tool results - if model generates bad output,
						// we should abort the entire MCP flow (return false) in the post-stream check,
						// not truncate during streaming. Truncation was causing valid summaries to be cut off.
					} else if (hasToolCallInContent && !sawToolCall && !toolCallDetectedLogged) {
						// Flush any remaining safe content before the tool call
						// This ensures that <think> blocks or introductory text are not cut off
						const safeContentEnd = toolCallsPayloadStart;
						
						// We rely on tokenCount as the authoritative cursor of what has been yielded
						if (safeContentEnd > tokenCount) {
							const toYield = lastAssistantContent.slice(tokenCount, safeContentEnd);
							if (toYield.length > 0) {
								yield { type: MessageUpdateType.Stream, token: toYield };
								tokenCount += toYield.length;
							}
						}

						// Log once that we detected a tool call in content
						console.debug("[mcp] detected tool_calls JSON in stream, stopping UI streaming");
						toolCallDetectedLogged = true;
					}
				}
			}
			console.info(
				{ sawToolCalls: Object.keys(toolCallState).length > 0, tokens: tokenCount, loop },
				"[mcp] completion stream closed"
			);

			// Log summary if no native tool calls detected
			if (Object.keys(toolCallState).length === 0) {
				logger.debug("[mcp] no native tool_calls in response", {
					bufferStart: lastAssistantContent.slice(0, 50),
					hasToolCallsJson: findToolCallsPayloadStartIndex(lastAssistantContent) !== -1,
				});
			}

			// Fallback: If no structured tool calls were seen, check if the model outputted them as JSON
			// Open WebUI format: {"tool_calls": [{"name": "...", "parameters": {...}}]}
			const toolCallsPayloadStart = findToolCallsPayloadStartIndex(lastAssistantContent);
			if (Object.keys(toolCallState).length === 0 && toolCallsPayloadStart !== -1) {
				try {
					logger.info("[mcp] attempting to parse tool_calls JSON from content");

					const payloadSlice = extractJsonObjectSlice(lastAssistantContent, toolCallsPayloadStart);
					if (!payloadSlice.success || !payloadSlice.json) {
						logger.warn("[mcp] failed to extract tool_calls JSON", {
							error: payloadSlice.error,
							position: payloadSlice.position,
						});
						throw new Error(payloadSlice.error || "Failed to parse JSON");
					}

					const parsedPayload = JSON5.parse(payloadSlice.json) as { tool_calls?: unknown[] };
					const toolCalls = Array.isArray(parsedPayload?.tool_calls)
						? parsedPayload.tool_calls
						: [];
					if (Array.isArray(toolCalls)) {
						let index = 0;
						for (const call of toolCalls) {
							if (
								call &&
								typeof call === "object" &&
								"name" in call &&
								typeof (call as { name: unknown }).name === "string"
							) {
								const typedCall = call as {
									name: string;
									arguments?: unknown;
									parameters?: unknown;
								};
								// Open WebUI uses "parameters", convert to "arguments" for compatibility
								const params = typedCall.parameters || typedCall.arguments || {};
								const args =
									typeof params === "object" ? JSON.stringify(params) : String(params || "{}");

								toolCallState[index] = {
									id: `call_json_${Math.random().toString(36).slice(2)}`,
									name: typedCall.name,
									arguments: args,
								};
								index++;
							}
						}
						if (Object.keys(toolCallState).length > 0) {
							logger.info("[mcp] successfully parsed tool_calls from JSON", {
								count: Object.keys(toolCallState).length,
							});
						}
					}
				} catch (e) {
					logger.error(
						"[mcp] error parsing tool_calls JSON",
						e instanceof Error ? e : new Error(String(e))
					);
				}
			}

			if (Object.keys(toolCallState).length > 0) {
				const calls: NormalizedToolCall[] = Object.values(toolCallState)
					.filter((c) => c?.name)
					.map((c) => ({
						id: c?.id || `call_${Math.random().toString(36).slice(2)}`,
						name: c?.name ?? "",
						arguments: c?.arguments ?? "",
					}));

				// Enhanced loop detection with semantic analysis
				if (loopDetector.detectToolLoop(calls)) {
					console.warn(
						{ loop, toolCalls: calls.map((c) => ({ name: c.name, args: c.arguments })) },
						"[mcp] detected tool call loop via semantic analysis, aborting MCP flow to fallback"
					);
					return false; // Fall back to regular generation
				}

				// Enhanced content loop detection
				if (loopDetector.detectContentLoop(lastAssistantContent)) {
					console.warn(
						{ loop, contentPreview: lastAssistantContent.slice(0, 100) },
						"[mcp] detected content repetition loop via semantic analysis, aborting MCP flow to fallback"
					);
					return false;
				}

				if (Object.values(toolCallState).some((c) => c?.name && !c?.id)) {
					console.debug({ loop }, "[mcp] missing tool_call id in stream; generated synthetic ids");
				}

				// Include the assistant message with tool_calls so the next round
				// sees both the calls and their outputs, matching MCP branch behavior.
				const toolCalls: ChatCompletionMessageToolCall[] = calls.map((call) => ({
					id: call.id,
					type: "function",
					function: { name: call.name, arguments: call.arguments },
				}));

				// Emit tool call updates so UI shows them as "in progress" immediately
				// This ensures the collapsible tool call appears before the result
				for (const call of calls) {
					let parsedParams: Record<string, string | number | boolean> = {};
					try {
						const parsed = parseArgs(call.arguments);
						if (!parsed.error) {
							for (const [key, val] of Object.entries(parsed.value)) {
								if (
									typeof val === "string" ||
									typeof val === "number" ||
									typeof val === "boolean"
								) {
									parsedParams[key] = val;
								} else {
									parsedParams[key] = JSON.stringify(val);
								}
							}
						} else {
							parsedParams = { error: parsed.error, raw: call.arguments.slice(0, 500) };
						}
					} catch (e) {
						parsedParams = { error: String(e), raw: call.arguments.slice(0, 500) };
					}

					yield {
						type: MessageUpdateType.Tool,
						subtype: MessageToolUpdateType.Call,
						uuid: call.id,
						call: { name: call.name, parameters: parsedParams },
					};
				}

				// Avoid sending <think> content back to the model alongside tool_calls
				// to prevent confusing follow-up reasoning. Strip any think blocks.
				// Also strip the tool_calls JSON if it was parsed from content to avoid duplication.
				// FIX: Do NOT strip <think> blocks - preserve context for the model as requested
				let assistantContentForToolMsg = lastAssistantContent;
				// .replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "");

				assistantContentForToolMsg = stripLeadingToolCallsPayload(assistantContentForToolMsg).text;
				assistantContentForToolMsg = assistantContentForToolMsg.trim();

				const assistantToolMessage: ChatCompletionMessageParam = {
					role: "assistant",
					content: assistantContentForToolMsg,
					tool_calls: toolCalls,
				};

				const toolExecutionTimer = startTimer("tool_execution");
				const exec = executeToolCalls({
					calls,
					mapping,
					servers,
					parseArgs,
					resolveFileRef,
					toPrimitive,
					processToolOutput,
					abortSignal,
					conversationId: conv._id?.toString(),
				});
				let toolMsgCount = 0;
				let toolRunCount = 0;
				for await (const event of exec) {
					if (event.type === "update") {
						yield event.update;
					} else {
						// Check if the last message is already an assistant message
						const lastMsg = messagesOpenAI[messagesOpenAI.length - 1];
						const lastIsAssistant = lastMsg?.role === "assistant";

						// Wrap tool outputs in <tool_results> tags and enforce token limits
						// This helps the model distinguish tool data from conversation history
						// and prevents context overflow from massive search results
						const processedToolMessages = (event.summary.toolMessages ?? []).map((msg) => {
							if (msg.role === "tool" && typeof msg.content === "string") {
								// Truncate to ~10k chars (approx 2500 tokens) to leave room for reasoning
								const MAX_TOOL_OUTPUT = 10000;
								let content = msg.content;
								if (content.length > MAX_TOOL_OUTPUT) {
									content =
										content.slice(0, MAX_TOOL_OUTPUT) + "\n...[Output truncated due to length]...";
								}
								return {
									...msg,
									content: `<tool_results>\n${content}\n</tool_results>`,
								};
							}
							return msg;
						});

						if (lastIsAssistant) {
							// Replace the last assistant message with the tool call version
							// to avoid "Cannot have 2 or more assistant messages" error
							console.debug(
								{ replacedContent: lastMsg.content },
								"[mcp] replacing last assistant message with tool_calls version"
							);
							messagesOpenAI = [
								...messagesOpenAI.slice(0, -1),
								assistantToolMessage,
								...processedToolMessages,
							];
						} else {
							// Safe to append normally
							messagesOpenAI = [...messagesOpenAI, assistantToolMessage, ...processedToolMessages];
						}
						toolExecutionTimer(); // End timer after execution completes
						toolMsgCount = event.summary.toolMessages?.length ?? 0;
						toolRunCount = event.summary.toolRuns?.length ?? 0;

						// Extract ONLY the raw text outputs (not the structured messages)
						// Send raw results without "Tool:" prefix to avoid confusing the model
						const toolOutputs = cleanString(
							(event.summary.toolRuns ?? []).map((run) => run.output || "").join("\n\n---\n\n")
						);

						logger.info(
							"[mcp] tools executed; context preserved for follow-up (no summarizer template)",
							{
								toolMsgCount,
								toolRunCount,
								outputLength: toolOutputs.length,
								query: (userQuery || "").slice(0, 100),
								// Explicitly log tool calls with their parameters and specific outputs
								toolExecutions: (event.summary.toolRuns ?? []).map((r) => ({
									name: r.name,
									params: r.parameters,
									outputLength: r.output?.length,
									outputPreview: r.output?.slice(0, 500),
								})),
								// Reduced log limit for production safety
								toolOutputPreview: toolOutputs.slice(0, 500),
							}
						);

						// Track executed tools for outcome recording (Point D)
						for (const run of event.summary.toolRuns ?? []) {
							// Determine success based on output - empty or error-like output indicates failure
							const hasValidOutput = Boolean(run.output && run.output.length > 0 && !run.output.startsWith("Error:"));
							executedToolsTracker.push({
								name: run.name,
								success: hasValidOutput,
								// Latency not available in ToolRun type, will be undefined
							});
						}

						// VERBOSE DEBUGGING: Log the exact context being sent to the model for the follow-up
						logger.debug("[mcp] context prepared for follow-up generation", {
							loop: loop + 1,
							messageCount: messagesOpenAI.length,
							lastMessageRole: messagesOpenAI[messagesOpenAI.length - 1]?.role,
							lastMessageContentPreview: JSON.stringify(
								messagesOpenAI[messagesOpenAI.length - 1]?.content
							).slice(0, 500),
							fullContextStructure: messagesOpenAI.map((m) => ({
								role: m.role,
								length: JSON.stringify(m.content).length,
							})),
						});
					}
				}
				// Continue loop: next iteration will use tool messages to get the final content
				continue;
			}

			// No tool calls: finalize and return
			// Use robust XML repair to ensure all tags (think, tool_call, etc.) are properly closed
			// This prevents UI issues and ensures the model's reasoning is fully captured
			// FALLBACK: Use xmlUtils to repair tags only at the final stage to avoid interfering with streaming or JSON parsing
			if (
				thinkOpen ||
				lastAssistantContent.includes("<think>") ||
				lastAssistantContent.includes("<tool_call>")
			) {
				const repaired = repairXmlTags(lastAssistantContent);
				if (repaired !== lastAssistantContent) {
					console.debug(
						{ original: lastAssistantContent.slice(-50), repaired: repaired.slice(-50) },
						"[mcp] repaired unclosed XML tags in final answer (fallback)"
					);
					lastAssistantContent = repaired;
				}
				thinkOpen = false;
			}

			// Post-process to remove any tool_calls artifacts or JSON output
			// This handles cases where gibberish detection truncated but left fragments
			let cleanedContent = lastAssistantContent;
			const stripped = stripLeadingToolCallsPayload(cleanedContent);
			cleanedContent = stripped.text;

			// Remove <reasoning> tags from output (common in Perplexity/research tool responses)
			// Strip the tags but keep the content - the reasoning is valuable, just not the markup
			cleanedContent = cleanedContent
				.replace(/<reasoning>/gi, "")
				.replace(/<\/reasoning>/gi, "");

			// Also remove other common internal tags that shouldn't appear in user output
			// These are model artifacts that leak through from tool responses
			cleanedContent = cleanedContent
				.replace(/<internal>/gi, "")
				.replace(/<\/internal>/gi, "")
				.replace(/<context>/gi, "")
				.replace(/<\/context>/gi, "")
				.replace(/<sources>/gi, "")
				.replace(/<\/sources>/gi, "");

			// Remove leading/trailing whitespace and collapse multiple HORIZONTAL spaces only
			// CRITICAL: DO NOT collapse newlines - summaries need proper paragraph structure
			// CRITICAL: DO NOT collapse spaces - code indentation must be preserved
			cleanedContent = cleanedContent.trim();

			if (cleanedContent !== lastAssistantContent) {
				console.debug(
					{
						originalLength: lastAssistantContent.length,
						cleanedLength: cleanedContent.length,
						removed: lastAssistantContent.length - cleanedContent.length,
					},
					"[mcp] cleaned tool_calls artifacts from final answer"
				);
				lastAssistantContent = cleanedContent;
			}

			if (!streamedContent && lastAssistantContent.trim().length > 0) {
				yield { type: MessageUpdateType.Stream, token: lastAssistantContent };
			}
			yield {
				type: MessageUpdateType.FinalAnswer,
				text: lastAssistantContent,
				interrupted: false,
			};
			console.info(
				{ length: lastAssistantContent.length, loop },
				"[mcp] final answer emitted (no tool_calls)"
			);

			// ============================================
			// MEMORY SYSTEM: Outcome Tracking (Point D from rompal_implementation_plan.md)
			// Record outcome after response completion for learning
			// ============================================
			try {
				// Record response outcome for memory learning (async, non-blocking)
				recordResponseOutcome({
					userId,
					conversationId,
					searchPositionMap,
					toolsUsed: executedToolsTracker,
					success: true,
					hasError: false,
				}).catch((err) => {
					logger.debug("[mcp] Failed to record response outcome", { error: String(err) });
				});

				// Store working memory from exchange (async, non-blocking)
				if (lastAssistantContent.trim().length > 50) {
					storeWorkingMemory({
						userId,
						conversationId,
						userQuery,
						assistantResponse: lastAssistantContent.slice(0, 2000), // Limit stored response size
						toolsUsed: executedToolsTracker.map((t) => t.name),
						memoriesUsed: Object.keys(searchPositionMap),
					}).catch((err) => {
						logger.debug("[mcp] Failed to store working memory", { error: String(err) });
					});
				}
			} catch (memErr) {
				// Memory tracking must never block or throw
				logger.debug("[mcp] Memory outcome tracking failed", { error: String(memErr) });
			}

			return true;
		}
		console.warn("[mcp] exceeded tool-followup loops; falling back");
	} catch (err) {
		const msg = String(err ?? "");
		const isAbort =
			(abortSignal && abortSignal.aborted) ||
			msg.includes("AbortError") ||
			msg.includes("APIUserAbortError") ||
			msg.includes("Request was aborted");
		if (isAbort) {
			// Expected on user stop; keep logs quiet and do not treat as error
			logger.debug("[mcp] aborted by user");
			return false;
		}
		logger.warn("[mcp] flow failed, falling back to default endpoint", { err: msg });
	} finally {
		// ensure MCP clients are closed after the turn
		try {
			await drainPoolEnhanced();
		} catch (e) {
			logger.warn("[mcp] failed to drain client pool", { err: String(e) });
		}

		// Log performance summary
		try {
			logPerformanceSummary();
		} catch (perfError) {
			console.debug("[mcp] failed to log performance summary", perfError);
		}
	}

	return false;
}
