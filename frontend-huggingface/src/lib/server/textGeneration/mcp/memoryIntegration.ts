/**
 * Memory Integration for runMcpFlow
 *
 * Handles personality prompt loading, memory context prefetching,
 * confidence-based tool gating, searchPositionMap tracking, and outcome recording.
 *
 * Designed to fail gracefully - never blocks streaming or crashes the UI.
 *
 * Integration Points (from rompal_implementation_plan.md Section 9):
 * - Point A (Prefetch): Before inference, after message assembly
 * - Point B (Tool Gating): Confidence-based tool selection
 * - Point C (Search Position Map): Track memory positions for outcome learning
 * - Point D (Outcome Tracking): Record response outcomes after completion
 */

import { logger } from "$lib/server/logger";
import { getPersonalityLoader } from "$lib/server/memory/personality";
import {
	getMemoryFeatureFlags,
	isMemorySystemOperational,
	getMemoryEnvConfig,
} from "$lib/server/memory/featureFlags";
import { UnifiedMemoryFacade } from "$lib/server/memory/UnifiedMemoryFacade";
import type {
	RetrievalConfidence,
	SearchDebug,
	MemoryTier,
	SearchResult,
	Outcome,
} from "$lib/server/memory/types";
import type { SourceAttribution } from "$lib/server/memory/services/SourceDescriptionService";

// ============================================
// TYPES
// ============================================

/**
 * Result of memory context prefetch
 */
export interface MemoryContextResult {
	/** Personality prompt (Section 1) */
	personalityPrompt: string | null;
	/** Memory context block (Section 2) */
	memoryContext: string | null;
	/** Whether memory system is operational */
	isOperational: boolean;
	/** Retrieval confidence for tool gating */
	retrievalConfidence: RetrievalConfidence;
	/** Debug information from retrieval */
	retrievalDebug: SearchDebug | null;
	/** Search position map for outcome tracking */
	searchPositionMap: SearchPositionMap;
	/** Timing information */
	timing: {
		personalityMs: number;
		memoryMs: number;
	};
}

/**
 * Search Position Map - tracks which memories were used and their positions
 * Used for outcome learning and feedback attribution
 */
export interface SearchPositionEntry {
	/** Position in final results (0-indexed) */
	position: number;
	/** Which tier the memory came from */
	tier: MemoryTier;
	/** Final score after fusion/reranking */
	score: number;
	/** Original similarity score before fusion */
	originalScore?: number;
	/** Whether this memory was from always_inject */
	alwaysInjected: boolean;
}

export type SearchPositionMap = Record<string, SearchPositionEntry>;

/**
 * Tool gating configuration based on retrieval confidence
 */
export interface ToolGatingConfig {
	/** Tools always allowed regardless of confidence */
	highConfidence: string[];
	/** Tools that require memory match to be allowed */
	mediumConfidence: string[];
	/** Tools that are blocked without explicit user request */
	lowConfidence: string[];
}

/**
 * Outcome recording parameters
 */
export interface RecordOutcomeParams {
	userId: string;
	conversationId: string;
	messageId?: string;
	searchPositionMap: SearchPositionMap;
	toolsUsed: Array<{ name: string; success: boolean; latencyMs?: number }>;
	userFeedback?: Outcome | null;
	success: boolean;
	hasError: boolean;
}

// ============================================
// DEFAULT CONFIGURATIONS
// ============================================

/**
 * Default tool gating configuration
 * Based on rompal_implementation_plan.md Section 9 confidence-based gating
 */
const DEFAULT_TOOL_GATING: ToolGatingConfig = {
	// Always allow - core functionality
	highConfidence: [
		"search_memory",
		"get_context_insights",
		"add_to_memory_bank",
		"record_response",
	],
	// Allow if memory context suggests relevance
	mediumConfidence: [
		"tavily_search",
		"perplexity_ask",
		"datagov_query",
		"web_search",
		"docling_convert",
	],
	// Block unless explicitly requested by user or high-confidence memory match
	lowConfidence: ["code_execution", "file_write", "database_query", "system_command"],
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Estimate context limit based on query complexity
 * (Section 3.11.D from rompal_implementation_plan.md)
 */
function estimateContextLimit(query: string): number {
	const lowerQuery = query.toLowerCase();

	// Broad queries -> more context
	if (
		/\b(show|list|all|everything|מה ה|הראה|תפרט)\b/i.test(lowerQuery) ||
		lowerQuery.includes("everything")
	) {
		return 20;
	}

	// How-to / medium complexity
	if (/\b(how|explain|why|מדוע|איך|הסבר)\b/i.test(lowerQuery) || lowerQuery.length > 100) {
		return 12;
	}

	// Specific identity lookup
	if (
		/\b(my name|my preference|what i said|מה שמי|מה אמרתי)\b/i.test(lowerQuery) ||
		lowerQuery.length < 30
	) {
		return 5;
	}

	// Default
	return 10;
}

/**
 * Build search position map from retrieval results
 * Tracks which memories were used and their positions for outcome learning
 */
export function buildSearchPositionMap(results: SearchResult[]): SearchPositionMap {
	const positionMap: SearchPositionMap = {};

	for (const result of results) {
		positionMap[result.memory_id] = {
			position: result.position,
			tier: result.tier,
			score: result.score_summary.final_score,
			originalScore: result.score_summary.embedding_similarity,
			alwaysInjected: false, // Will be updated if memory_bank.always_inject=true
		};
	}

	return positionMap;
}

/**
 * Determine if a tool should be allowed based on confidence and memory context
 */
export function shouldAllowTool(
	toolName: string,
	retrievalConfidence: RetrievalConfidence,
	explicitToolRequest: string | null = null,
	config: ToolGatingConfig = DEFAULT_TOOL_GATING
): boolean {
	// Always allow high-confidence tools (memory system tools)
	if (config.highConfidence.includes(toolName)) {
		return true;
	}

	// Low confidence tools require explicit user request
	if (config.lowConfidence.includes(toolName)) {
		return explicitToolRequest === toolName;
	}

	// Medium confidence tools: allow if retrieval confidence is not high
	// (if high confidence, we prefer answering from memory)
	if (config.mediumConfidence.includes(toolName)) {
		// If retrieval is high confidence, suggest NOT using external tools
		// But don't block - the model can still choose to use them
		return true; // Always allow, but the prompt will discourage use if confidence is high
	}

	// Unknown tools - allow by default
	return true;
}

/**
 * Filter tools based on retrieval confidence
 * Returns tools that should be available for this request
 */
export function filterToolsByConfidence<T extends { function: { name: string } }>(
	tools: T[],
	retrievalConfidence: RetrievalConfidence,
	explicitToolRequest: string | null = null,
	config: ToolGatingConfig = DEFAULT_TOOL_GATING
): T[] {
	// If confidence is high, we could potentially skip all external tools
	// But for now, we just filter and let the prompt guide the model
	return tools.filter((tool) =>
		shouldAllowTool(tool.function.name, retrievalConfidence, explicitToolRequest, config)
	);
}

/**
 * Get prompt hint based on retrieval confidence
 * Guides the model on whether to use tools or answer from memory
 */
export function getConfidencePromptHint(
	retrievalConfidence: RetrievalConfidence,
	hasMemoryContext: boolean
): string {
	if (!hasMemoryContext) {
		return "";
	}

	switch (retrievalConfidence) {
		case "high":
			return `**MEMORY CONTEXT AVAILABLE (HIGH CONFIDENCE)**
The memory context above contains highly relevant information for this query.
You SHOULD be able to answer directly from memory without calling external tools.
Only use tools if the memory context is clearly insufficient or outdated.`;

		case "medium":
			return `**MEMORY CONTEXT AVAILABLE (MEDIUM CONFIDENCE)**
The memory context above may contain relevant information.
Check the memory context first before deciding to use external tools.
If memory provides a partial answer, consider supplementing with tools.`;

		case "low":
			return `**MEMORY CONTEXT AVAILABLE (LOW CONFIDENCE)**
The memory context above has limited relevance to this query.
You may need to use tools to gather additional information.`;

		default:
			return "";
	}
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Prefetch memory context for injection into system prompt
 *
 * Integration Point A from rompal_implementation_plan.md Section 9:
 * - Called after message assembly, before inference
 * - Performs organic recall + hybrid retrieval
 * - Returns memory context for prompt injection
 *
 * @param userId - User identifier for memory retrieval
 * @param query - User's query for context-aware retrieval
 * @param options - Optional configuration
 * @returns Memory context result (may have null values if disabled/failed)
 */
export async function prefetchMemoryContext(
	userId: string,
	query: string,
	options: {
		conversationId?: string;
		recentMessages?: Array<{ role: string; content: string }>;
		hasDocuments?: boolean;
		signal?: AbortSignal;
	} = {}
): Promise<MemoryContextResult> {
	const result: MemoryContextResult = {
		personalityPrompt: null,
		memoryContext: null,
		isOperational: false,
		retrievalConfidence: "low",
		retrievalDebug: null,
		searchPositionMap: {},
		timing: { personalityMs: 0, memoryMs: 0 },
	};

	// Check if memory system is enabled
	const flags = getMemoryFeatureFlags();
	if (!flags.systemEnabled) {
		return result;
	}

	const envConfig = getMemoryEnvConfig();

	// Load personality prompt (always available, file-based)
	const personalityStart = Date.now();
	try {
		const personalityLoader = getPersonalityLoader();
		result.personalityPrompt = personalityLoader.loadTemplate();
	} catch (err) {
		logger.warn({ err }, "Failed to load personality template");
	}
	result.timing.personalityMs = Date.now() - personalityStart;

	// Check if full memory system is operational (Qdrant + Mongo)
	result.isOperational = isMemorySystemOperational();
	if (!result.isOperational) {
		// Memory system not available, but we still have personality
		return result;
	}

	// Prefetch memory context using UnifiedMemoryFacade
	const memoryStart = Date.now();
	try {
		const facade = UnifiedMemoryFacade.getInstance();
		const contextLimit = estimateContextLimit(query);

		// Create AbortSignal with timeout if not provided
		let signal = options.signal;
		if (!signal) {
			const controller = new AbortController();
			setTimeout(() => controller.abort(), envConfig.prefetchTimeoutMs);
			signal = controller.signal;
		}

		const prefetchResult = await facade.prefetchContext({
			userId,
			conversationId: options.conversationId ?? "",
			query,
			recentMessages: options.recentMessages ?? [],
			hasDocuments: options.hasDocuments ?? false,
			limit: contextLimit,
			signal,
		});

		// Store results
		result.memoryContext = prefetchResult.memoryContextInjection || null;
		result.retrievalConfidence = prefetchResult.retrievalConfidence;
		result.retrievalDebug = prefetchResult.retrievalDebug;

		// Build search position map from debug info if available
		// The facade should include this in the debug response
		if (prefetchResult.retrievalDebug && "results" in prefetchResult.retrievalDebug) {
			const debugWithResults = prefetchResult.retrievalDebug as SearchDebug & {
				results?: SearchResult[];
			};
			if (debugWithResults.results) {
				result.searchPositionMap = buildSearchPositionMap(debugWithResults.results);
			}
		}
	} catch (err) {
		// Check if aborted
		if (err instanceof Error && err.name === "AbortError") {
			logger.debug("Memory prefetch aborted (timeout or user cancellation)");
		} else {
			logger.warn({ err }, "Failed to prefetch memory context");
		}
		// Continue without memory - graceful degradation
	}
	result.timing.memoryMs = Date.now() - memoryStart;

	return result;
}

/**
 * Format memory context for injection into prepromptPieces
 *
 * Integration Point C from rompal_implementation_plan.md Section 9:
 * - Injects personality as Section 1
 * - Injects memory context as Section 2
 * - Adds confidence hint to guide tool usage
 *
 * @param result - Memory context result from prefetchMemoryContext
 * @returns Array of prompt sections to prepend
 */
export function formatMemoryPromptSections(result: MemoryContextResult): string[] {
	const sections: string[] = [];

	// Section 1: Personality (if available)
	if (result.personalityPrompt) {
		sections.push(result.personalityPrompt);
	}

	// Section 2: Memory context (if available)
	if (result.memoryContext) {
		sections.push(result.memoryContext);

		// Add confidence hint after memory context
		const confidenceHint = getConfidencePromptHint(
			result.retrievalConfidence,
			!!result.memoryContext
		);
		if (confidenceHint) {
			sections.push(confidenceHint);
		}
	}

	return sections;
}

/**
 * Get user ID from conversation object
 * Falls back to a default for anonymous users
 */
export function getUserIdFromConversation(conv: { sessionId?: string; userId?: string }): string {
	return conv.userId || conv.sessionId || "anonymous";
}

// ============================================
// OUTCOME TRACKING
// ============================================

/**
 * Record outcome after response completion
 *
 * Integration Point D from rompal_implementation_plan.md Section 9:
 * - Called after response is complete
 * - Records tool outcomes and memory usage
 * - Updates memory scores based on success/failure
 *
 * @param params - Outcome recording parameters
 */
export async function recordResponseOutcome(params: RecordOutcomeParams): Promise<void> {
	const flags = getMemoryFeatureFlags();
	if (!flags.systemEnabled || !flags.outcomeEnabled) {
		return;
	}

	try {
		const facade = UnifiedMemoryFacade.getInstance();

		// Determine outcome based on parameters
		let outcome: Outcome = "unknown";
		if (params.userFeedback) {
			outcome = params.userFeedback;
		} else if (params.hasError) {
			outcome = "failed";
		} else if (params.success) {
			// If successful without explicit feedback, record as partial
			// Full "worked" requires explicit user confirmation
			outcome = "partial";
		}

		// Record outcome for memories that were used
		const memoryIds = Object.keys(params.searchPositionMap);
		if (memoryIds.length > 0) {
			await facade.recordOutcome({
				userId: params.userId,
				outcome,
				relatedMemoryIds: memoryIds,
			});
		}

		// Record action outcomes for tools used
		for (const tool of params.toolsUsed) {
			await facade.recordActionOutcome({
				action_id: `${params.conversationId}_${params.messageId ?? Date.now()}_${tool.name}`,
				action_type: tool.name,
				context_type: "general", // Could be enhanced with context detection
				outcome: tool.success ? "worked" : "failed",
				conversation_id: params.conversationId,
				message_id: params.messageId ?? null,
				answer_attempt_id: null,
				tier: null,
				doc_id: null,
				memory_id: null,
				action_params: null,
				tool_status: tool.success ? "ok" : "error",
				latency_ms: tool.latencyMs ?? null,
				error_type: null,
				error_message: null,
				timestamp: new Date().toISOString(),
			});
		}

		logger.debug(
			{
				userId: params.userId,
				conversationId: params.conversationId,
				outcome,
				memoriesUsed: memoryIds.length,
				toolsUsed: params.toolsUsed.length,
			},
			"Recorded response outcome"
		);
	} catch (err) {
		// Outcome recording should never block or throw
		logger.warn({ err }, "Failed to record response outcome");
	}
}

/**
 * Store working memory entry from final answer
 *
 * Integration Point from rompal_implementation_plan.md Section 9.2:
 * - On final answer emission, store the exchange in working tier
 * - Includes user query + assistant response
 * - Links to tools used and memories retrieved
 *
 * @param params - Working memory storage parameters
 */
export async function storeWorkingMemory(params: {
	userId: string;
	conversationId: string;
	userQuery: string;
	assistantResponse: string;
	toolsUsed: string[];
	memoriesUsed: string[];
	personalityId?: string | null;
	personalityName?: string | null;
	language?: "he" | "en" | "mixed";
	/** Source attribution from tool execution (Phase 9.9) */
	sourceAttribution?: SourceAttribution | null;
	conversationTitle?: string | null;
}): Promise<void> {
	const flags = getMemoryFeatureFlags();
	if (!flags.systemEnabled) {
		return;
	}

	try {
		const facade = UnifiedMemoryFacade.getInstance();

		// Create combined exchange fragment (Roampal parity)
		const text = `User: ${params.userQuery}\nAssistant: ${params.assistantResponse}`;

		// Build tags from context
		const tags: string[] = ["exchange"];
		if (params.toolsUsed.length > 0) {
			tags.push("tool_assisted");
			// Add tool names as tags for future routing
			params.toolsUsed.forEach((tool) => tags.push(`tool:${tool}`));
		}
		if (params.memoriesUsed.length > 0) {
			tags.push("memory_assisted");
		}

		await facade.store({
			userId: params.userId,
			tier: "working",
			text,
			tags,
			metadata: {
				conversation_id: params.conversationId,
				tools_used: params.toolsUsed,
				memories_used: params.memoriesUsed,
				stored_at: new Date().toISOString(),
			},
			personalityId: params.personalityId,
			personalityName: params.personalityName,
			language: params.language,
			// Phase 9.9: Source attribution
			source: params.sourceAttribution
				? {
						type: "tool" as const,
						tool_name: params.sourceAttribution.toolName,
						url: params.sourceAttribution.url,
						description: params.sourceAttribution.description?.en ?? null,
						description_he: params.sourceAttribution.description?.he ?? null,
						conversation_id: params.conversationId,
						conversation_title: params.conversationTitle ?? null,
						collected_at: params.sourceAttribution.collectedAt,
					}
				: undefined,
		});

		// Increment message count for auto-promotion (Roampal pattern)
		// This triggers promotion every 20 messages
		await facade.incrementMessageCount(params.userId);

		logger.debug(
			{
				userId: params.userId,
				conversationId: params.conversationId,
				textLength: text.length,
				tags,
			},
			"Stored working memory from exchange"
		);
	} catch (err) {
		// Working memory storage should never block or throw
		logger.warn({ err }, "Failed to store working memory");
	}
}

/**
 * Extract explicit tool request from user query
 * Used for confidence-based tool gating
 */
export function extractExplicitToolRequest(query: string): string | null {
	// Check for explicit tool mentions
	const toolPatterns: Array<[RegExp, string]> = [
		[/\b(search|חפש|find)\s+(the\s+)?(web|internet|online)/i, "web_search"],
		[/\b(search|חפש)\s+(tavily|טבילי)/i, "tavily_search"],
		[/\b(research|מחקר|analyze deeply)/i, "perplexity_ask"],
		[/\b(datagov|data\.gov|נתונים ממשלתיים)/i, "datagov_query"],
		[/\b(convert|המר|parse)\s+(document|pdf|docx)/i, "docling_convert"],
		[/\b(remember|זכור|save to memory)/i, "add_to_memory_bank"],
		[/\b(recall|היזכר|search memory)/i, "search_memory"],
	];

	for (const [pattern, toolName] of toolPatterns) {
		if (pattern.test(query)) {
			return toolName;
		}
	}

	return null;
}
