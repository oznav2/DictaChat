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
	ContextInsights,
	ContextType,
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
}): Promise<string | null> {
	const flags = getMemoryFeatureFlags();
	if (!flags.systemEnabled) {
		return null;
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

		const storeResult = await facade.store({
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

		// ============================================
		// CONTENT KG ENTITY EXTRACTION (Phase 3 P2 - Gap 7)
		// Extract entities from the stored memory and add to Content Graph
		// ============================================
		if (storeResult.memory_id) {
			void facade
				.extractAndStoreEntities({
					userId: params.userId,
					memoryId: storeResult.memory_id,
					text,
					importance: 0.5,
					confidence: 0.6,
				})
				.then((entityResult) => {
					if (entityResult.entitiesStored > 0) {
						logger.debug(
							{
								userId: params.userId,
								memoryId: storeResult.memory_id,
								entitiesExtracted: entityResult.entitiesExtracted,
								entitiesStored: entityResult.entitiesStored,
								entities: entityResult.entities.slice(0, 5),
							},
							"Entities extracted and stored to Content KG"
						);
					}
				})
				.catch((entityErr) => {
					logger.debug({ err: entityErr }, "Entity extraction failed, continuing");
				});
		}

		// Increment message count for auto-promotion (Roampal pattern)
		// This triggers promotion every 20 messages
		void facade.incrementMessageCount(params.userId).catch((err) => {
			logger.debug({ err }, "Failed to increment message count");
		});

		logger.debug(
			{
				userId: params.userId,
				conversationId: params.conversationId,
				textLength: text.length,
				tags,
			},
			"Stored working memory from exchange"
		);

		return storeResult.memory_id ?? null;
	} catch (err) {
		// Working memory storage should never block or throw
		logger.warn({ err }, "Failed to store working memory");
		return null;
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

// ============================================
// COLD-START CONTEXT (Phase 1 P0 - Gap 1)
// ============================================

/**
 * Cold-start context result
 */
export interface ColdStartContextResult {
	/** Formatted cold-start context text */
	coldStartContext: string | null;
	/** Whether cold-start was applied */
	applied: boolean;
	/** Debug information */
	debug: SearchDebug | null;
	/** Timing in milliseconds */
	timingMs: number;
}

/**
 * Check if this is the first message in the conversation
 * Used to determine if cold-start injection should be applied
 *
 * @param recentMessages - Recent messages in the conversation
 * @returns true if this appears to be the first user message
 */
export function isFirstMessage(recentMessages: Array<{ role: string; content: string }>): boolean {
	// If no recent messages, this is definitely first
	if (!recentMessages || recentMessages.length === 0) {
		return true;
	}

	// Count user messages (excluding system messages)
	const userMessages = recentMessages.filter((m) => m.role === "user");

	// If only one user message, this is the first
	return userMessages.length <= 1;
}

/**
 * Get cold-start context for first message of a conversation
 *
 * RoamPal Parity (agent_chat.py lines 627-668):
 * - On message #1 of every conversation, auto-injects user profile from Content KG
 * - Uses getColdStartContext() which returns formatted context with doc_ids
 * - Caches doc_ids for selective outcome scoring
 *
 * @param userId - User identifier
 * @param options - Optional configuration
 * @returns Cold-start context result
 */
export async function getColdStartContextForConversation(
	userId: string,
	options: {
		recentMessages?: Array<{ role: string; content: string }>;
		signal?: AbortSignal;
	} = {}
): Promise<ColdStartContextResult> {
	const result: ColdStartContextResult = {
		coldStartContext: null,
		applied: false,
		debug: null,
		timingMs: 0,
	};

	// Check if memory system is enabled
	const flags = getMemoryFeatureFlags();
	if (!flags.systemEnabled) {
		return result;
	}

	// Only apply cold-start on first message
	if (!isFirstMessage(options.recentMessages ?? [])) {
		return result;
	}

	// Check if memory system is operational
	if (!isMemorySystemOperational()) {
		return result;
	}

	const startTime = Date.now();
	try {
		const facade = UnifiedMemoryFacade.getInstance();

		const coldStart = await facade.getColdStartContext({
			userId,
			limit: 5, // Get top 5 high-value memories
			signal: options.signal,
		});

		if (coldStart.text) {
			result.coldStartContext = coldStart.text;
			result.applied = true;
			result.debug = coldStart.debug;

			logger.debug(
				{
					userId,
					contextLength: coldStart.text.length,
					hasDebug: !!coldStart.debug,
				},
				"Cold-start context loaded for first message"
			);
		}
	} catch (err) {
		// Cold-start should never block - fail silently
		logger.warn({ err }, "Failed to get cold-start context");
	}

	result.timingMs = Date.now() - startTime;
	return result;
}

// ============================================
// CONTEXTUAL GUIDANCE (Phase 2 P1 - Gap 2)
// ============================================

/**
 * Contextual guidance result
 */
export interface ContextualGuidanceResult {
	/** Formatted guidance text to inject before LLM call */
	guidanceText: string | null;
	/** Whether any guidance was generated */
	hasGuidance: boolean;
	/** Context insights from KG */
	insights: ContextInsights | null;
	/** Timing in milliseconds */
	timingMs: number;
}

/**
 * Get contextual guidance from Knowledge Graphs
 *
 * RoamPal Parity (agent_chat.py lines 675-794):
 * - BEFORE LLM sees user message, injects:
 *   - 📋 Past Experience from Content KG
 *   - ⚠️ Past Failures from failure_patterns
 *   - 📊 Action Stats from Action-Effectiveness KG
 *   - 💡 Search Recommendations from proactive insights
 *
 * @param userId - User identifier
 * @param query - User's query
 * @param options - Configuration options
 * @returns Contextual guidance result
 */
export async function getContextualGuidance(
	userId: string,
	query: string,
	options: {
		conversationId?: string;
		recentMessages?: Array<{ role: string; content: string }>;
		signal?: AbortSignal;
	} = {}
): Promise<ContextualGuidanceResult> {
	const result: ContextualGuidanceResult = {
		guidanceText: null,
		hasGuidance: false,
		insights: null,
		timingMs: 0,
	};

	const flags = getMemoryFeatureFlags();
	if (!flags.systemEnabled) {
		return result;
	}

	if (!isMemorySystemOperational()) {
		return result;
	}

	const startTime = Date.now();
	try {
		const facade = UnifiedMemoryFacade.getInstance();

		// Get context insights from KG
		const insights = await facade.getContextInsights({
			userId,
			conversationId: options.conversationId ?? "",
			contextType: "general" as ContextType,
			recentMessages: options.recentMessages ?? [],
			signal: options.signal,
		});

		result.insights = insights;

		// Format insights into guidance text
		const guidanceParts: string[] = [];

		// Past experience from relevant patterns
		if (insights.relevant_patterns && insights.relevant_patterns.length > 0) {
			guidanceParts.push("📋 **Past Experience**:");
			for (const pattern of insights.relevant_patterns.slice(0, 3)) {
				const successInfo = pattern.success_rate
					? ` (success rate: ${(pattern.success_rate * 100).toFixed(0)}%)`
					: "";
				guidanceParts.push(`  - ${pattern.content}${successInfo}`);
			}
		}

		// Past failures to avoid
		if (insights.past_outcomes && insights.past_outcomes.length > 0) {
			guidanceParts.push("⚠️ **Past Failures to Avoid**:");
			for (const failure of insights.past_outcomes.slice(0, 3)) {
				const reason = failure.reason ? `: ${failure.reason}` : "";
				guidanceParts.push(`  - ${failure.content}${reason}`);
			}
		}

		// Proactive insights / recommendations
		if (insights.proactive_insights && insights.proactive_insights.length > 0) {
			guidanceParts.push("💡 **Recommendations**:");
			for (const insight of insights.proactive_insights.slice(0, 3)) {
				if (insight.concept) {
					guidanceParts.push(`  - Consider "${insight.concept}" tier for this type of query`);
				}
			}
		}

		// You already know (to avoid repetition)
		if (insights.you_already_know && insights.you_already_know.length > 0) {
			guidanceParts.push("📝 **User Context (already known)**:");
			for (const item of insights.you_already_know.slice(0, 3)) {
				guidanceParts.push(`  - ${item.content}`);
			}
		}

		// Directives
		if (insights.directives && insights.directives.length > 0) {
			guidanceParts.push("🎯 **Directives**:");
			for (const directive of insights.directives.slice(0, 3)) {
				guidanceParts.push(`  - ${directive}`);
			}
		}

		if (guidanceParts.length > 0) {
			result.guidanceText = guidanceParts.join("\n");
			result.hasGuidance = true;

			logger.debug(
				{
					userId,
					guidanceLength: result.guidanceText.length,
					patternsCount: insights.relevant_patterns?.length ?? 0,
					failuresCount: insights.past_outcomes?.length ?? 0,
				},
				"Contextual guidance generated"
			);
		}
	} catch (err) {
		// Contextual guidance should never block - fail silently
		logger.warn({ err }, "Failed to get contextual guidance");
	}

	result.timingMs = Date.now() - startTime;
	return result;
}

/**
 * Format contextual guidance for injection into preprompt
 */
export function formatContextualGuidancePrompt(guidance: ContextualGuidanceResult): string | null {
	if (!guidance.hasGuidance || !guidance.guidanceText) {
		return null;
	}

	return `**CONTEXTUAL GUIDANCE FROM MEMORY SYSTEM**
The following insights are derived from past interactions and should inform your response:

${guidance.guidanceText}

Use this guidance to provide a more relevant and informed response.`;
}

// ============================================
// ACTION KG RECORDING (Phase 2 P1 - Gap 6)
// ============================================

/**
 * Parameters for recording a tool action outcome
 */
export interface RecordToolActionParams {
	userId: string;
	conversationId: string;
	messageId?: string;
	toolName: string;
	success: boolean;
	latencyMs?: number;
	errorType?: string;
	errorMessage?: string;
	contextType?: ContextType;
}

/**
 * Record tool action outcome to Action KG
 *
 * RoamPal Parity (agent_chat.py lines 1276-1290):
 * - After outcome detection, scores cached actions
 * - record_action_outcome() updates Action-Effectiveness KG
 * - Stats surface in contextual guidance
 *
 * @param params - Tool action parameters
 */
export async function recordToolActionOutcome(params: RecordToolActionParams): Promise<void> {
	const flags = getMemoryFeatureFlags();
	if (!flags.systemEnabled || !flags.outcomeEnabled) {
		return;
	}

	try {
		const facade = UnifiedMemoryFacade.getInstance();

		await facade.recordActionOutcome({
			action_id: `${params.conversationId}_${params.messageId ?? Date.now()}_${params.toolName}`,
			action_type: params.toolName,
			context_type: params.contextType ?? "general",
			outcome: params.success ? "worked" : "failed",
			conversation_id: params.conversationId,
			message_id: params.messageId ?? null,
			answer_attempt_id: null,
			tier: null,
			doc_id: null,
			memory_id: null,
			action_params: null,
			tool_status: params.success ? "ok" : "error",
			latency_ms: params.latencyMs ?? null,
			error_type: params.errorType ?? null,
			error_message: params.errorMessage ?? null,
			timestamp: new Date().toISOString(),
		});

		logger.debug(
			{
				userId: params.userId,
				conversationId: params.conversationId,
				toolName: params.toolName,
				success: params.success,
				latencyMs: params.latencyMs,
			},
			"Recorded tool action outcome to Action KG"
		);
	} catch (err) {
		// Action recording should never block or throw
		logger.warn({ err, toolName: params.toolName }, "Failed to record tool action outcome");
	}
}

/**
 * Record multiple tool action outcomes in batch
 *
 * @param userId - User identifier
 * @param conversationId - Conversation identifier
 * @param messageId - Message identifier
 * @param tools - Array of tool execution results
 */
export async function recordToolActionsInBatch(
	userId: string,
	conversationId: string,
	messageId: string | undefined,
	tools: Array<{ name: string; success: boolean; latencyMs?: number }>
): Promise<void> {
	// Record each tool action - errors are caught individually
	await Promise.all(
		tools.map((tool) =>
			recordToolActionOutcome({
				userId,
				conversationId,
				messageId,
				toolName: tool.name,
				success: tool.success,
				latencyMs: tool.latencyMs,
			})
		)
	);
}

// ============================================
// MEMORY ATTRIBUTION (Phase 3 P2 - Gap 9)
// Causal Scoring via LLM-generated memory marks
// v0.2.12 Enhancements: Selective & Causal Scoring
// ============================================

/**
 * Memory attribution result from parsing LLM response
 *
 * RoamPal Parity (agent_chat.py lines 180-220):
 * - LLM adds hidden annotation: <!-- MEM: 1👍 2👎 3➖ -->
 * - parse_memory_marks() extracts and strips annotation
 * - Upvote/downvote arrays drive selective scoring
 */
export interface MemoryAttribution {
	/** Memory positions that were helpful (👍) */
	upvoted: number[];
	/** Memory positions that were unhelpful or wrong (👎) */
	downvoted: number[];
	/** Memory positions that were not used (➖) */
	neutral: number[];
	/** Raw annotation string */
	raw: string;
}

/**
 * v0.2.12 Surfaced Memories - for selective scoring (Fix #5)
 * Tracks which memories were actually surfaced to the main LLM
 */
export interface SurfacedMemories {
	/** Position to memory_id mapping {1: "mem_abc123", 2: "mem_def456"} */
	position_map: Record<number, string>;
	/** Position to content preview mapping {1: "User prefers dark mode...", 2: "User lives in..."} */
	content_map: Record<number, string>;
}

/**
 * v0.2.12 Outcome Detection Result
 * Matches RoamPal OutcomeDetector.analyze() return type
 */
export interface OutcomeDetectionResult {
	/** Overall outcome: worked | failed | partial | unknown */
	outcome: "worked" | "failed" | "partial" | "unknown";
	/** Confidence 0.0-1.0 */
	confidence: number;
	/** Detected indicators like ["explicit_thanks", "follow_up_question"] */
	indicators: string[];
	/** Human-readable reasoning */
	reasoning: string;
	/** v0.2.12 Fix #5: Inferred positions that were actually USED in response */
	used_positions: number[];
	/** v0.2.12 Fix #7: Positions to upvote (from causal attribution) */
	upvote: number[];
	/** v0.2.12 Fix #7: Positions to downvote (from causal attribution) */
	downvote: number[];
}

/**
 * v0.2.12 Scoring Matrix for Causal Attribution
 * Combines detected outcome with LLM's memory marks
 *
 * Matrix (outcome vs mark):
 * | Mark/Outcome | YES (worked) | KINDA (partial) | NO (failed) |
 * |--------------|--------------|-----------------|-------------|
 * | 👍 (helpful) | upvote       | slight_up       | neutral     |
 * | 👎 (unhelpful)| neutral     | slight_down     | downvote    |
 * | ➖ (no_impact)| neutral     | neutral         | neutral     |
 */
export type ScoringAction = "upvote" | "slight_up" | "neutral" | "slight_down" | "downvote";

export interface ScoringMatrixEntry {
	/** Final scoring action */
	action: ScoringAction;
	/** Score delta to apply */
	delta: number;
}

/**
 * v0.2.12 Scoring matrix implementation
 * Key insight: A positive exchange can still downvote bad memories if LLM marked them 👎
 */
export const SCORING_MATRIX: Record<string, Record<string, ScoringMatrixEntry>> = {
	// outcome -> mark -> action
	worked: {
		upvoted: { action: "upvote", delta: 0.2 },
		downvoted: { action: "neutral", delta: 0.0 }, // Don't punish on success
		neutral: { action: "neutral", delta: 0.0 },
	},
	partial: {
		upvoted: { action: "slight_up", delta: 0.1 },
		downvoted: { action: "slight_down", delta: -0.1 },
		neutral: { action: "neutral", delta: 0.0 },
	},
	failed: {
		upvoted: { action: "neutral", delta: 0.0 }, // Don't reward on failure
		downvoted: { action: "downvote", delta: -0.3 },
		neutral: { action: "neutral", delta: 0.0 },
	},
	unknown: {
		upvoted: { action: "slight_up", delta: 0.05 },
		downvoted: { action: "slight_down", delta: -0.05 },
		neutral: { action: "neutral", delta: 0.0 },
	},
};

/**
 * Get scoring action from matrix based on outcome and mark
 */
export function getScoringAction(
	outcome: "worked" | "failed" | "partial" | "unknown",
	mark: "upvoted" | "downvoted" | "neutral"
): ScoringMatrixEntry {
	return SCORING_MATRIX[outcome]?.[mark] ?? { action: "neutral", delta: 0.0 };
}

/**
 * Result of parsing memory marks from LLM response
 */
export interface ParseMemoryMarksResult {
	/** Response with memory attribution comment stripped */
	cleanedResponse: string;
	/** Parsed attribution or null if not found */
	attribution: MemoryAttribution | null;
}

/**
 * Memory attribution instruction to inject into system prompt
 *
 * When memories are injected, we ask the LLM to mark which ones were helpful
 * using a hidden comment at the end of the response.
 */
export const MEMORY_ATTRIBUTION_INSTRUCTION = `
IMPORTANT: When using information from the memory context above, at the END of your response,
add a hidden attribution comment in this exact format on its own line:
<!-- MEM: 1👍 2👎 3➖ -->

Where numbers correspond to memory positions from the context:
- 👍 = memory was helpful and used in your response
- 👎 = memory was unhelpful, irrelevant, or wrong
- ➖ = memory was not used in your response

Example: If memories 1 and 3 helped, memory 2 was wrong, and 4-5 weren't used:
<!-- MEM: 1👍 3👍 2👎 4➖ 5➖ -->

This helps improve memory quality for future conversations. Include ALL memory positions.
`;

/**
 * Hebrew version of the attribution instruction
 */
export const MEMORY_ATTRIBUTION_INSTRUCTION_HE = `
חשוב: כאשר אתה משתמש במידע מהקשר הזיכרון לעיל, בסוף התשובה שלך,
הוסף הערת ייחוס מוסתרת בפורמט הזה בדיוק בשורה נפרדת:
<!-- MEM: 1👍 2👎 3➖ -->

כאשר המספרים מתאימים למיקומי הזיכרונות מההקשר:
- 👍 = הזיכרון היה שימושי ונעשה בו שימוש בתשובתך
- 👎 = הזיכרון היה לא רלוונטי או שגוי
- ➖ = לא נעשה שימוש בזיכרון בתשובתך

דוגמה: אם זיכרונות 1 ו-3 עזרו, זיכרון 2 היה שגוי, ו-4-5 לא נעשה בהם שימוש:
<!-- MEM: 1👍 3👍 2👎 4➖ 5➖ -->

זה עוזר לשפר את איכות הזיכרון לשיחות עתידיות. כלול את כל מיקומי הזיכרון.
`;

/**
 * Parse memory marks from LLM response
 *
 * Extracts the attribution comment and returns both the cleaned response
 * and the parsed attribution data.
 *
 * @param response - Raw LLM response that may contain attribution comment
 * @returns Cleaned response and parsed attribution
 */
export function parseMemoryMarks(response: string): ParseMemoryMarksResult {
	// Pattern matches: <!-- MEM: 1👍 2👎 3➖ -->
	// Also handles variations like <!-- MEM:1👍2👎 --> and whitespace
	const pattern = /<!--\s*MEM:\s*(.+?)\s*-->/i;
	const match = response.match(pattern);

	if (!match) {
		return { cleanedResponse: response, attribution: null };
	}

	// Remove the attribution comment from response
	const cleanedResponse = response.replace(pattern, "").trim();
	const markString = match[1];

	const upvoted: number[] = [];
	const downvoted: number[] = [];
	const neutral: number[] = [];

	// Parse marks: "1👍 2👎 3➖" or "1👍2👎3➖"
	// Match number followed by emoji
	const markPattern = /(\d+)\s*(👍|👎|➖|:\+1:|:-1:|:neutral_face:)/g;
	let markMatch;

	while ((markMatch = markPattern.exec(markString)) !== null) {
		const position = parseInt(markMatch[1], 10);
		const mark = markMatch[2];

		if (isNaN(position)) continue;

		switch (mark) {
			case "👍":
			case ":+1:":
				upvoted.push(position);
				break;
			case "👎":
			case ":-1:":
				downvoted.push(position);
				break;
			case "➖":
			case ":neutral_face:":
				neutral.push(position);
				break;
		}
	}

	// If no marks were successfully parsed, return null attribution
	if (upvoted.length === 0 && downvoted.length === 0 && neutral.length === 0) {
		return { cleanedResponse, attribution: null };
	}

	logger.debug(
		{ markCount: upvoted.length + downvoted.length + neutral.length },
		"[marks] Parsed memory marks"
	);

	return {
		cleanedResponse,
		attribution: {
			upvoted,
			downvoted,
			neutral,
			raw: markString,
		},
	};
}

/**
 * Get memory ID by position from search position map
 *
 * @param searchPositionMap - Map of memory IDs to positions
 * @param position - 1-indexed position (as used in LLM attribution)
 * @returns Memory ID or null if not found
 */
export function getMemoryIdByPosition(
	searchPositionMap: SearchPositionMap,
	position: number
): string | null {
	// Position in attribution is 1-indexed, position in map is 0-indexed
	const targetPosition = position - 1;

	for (const [memoryId, entry] of Object.entries(searchPositionMap)) {
		if (entry.position === targetPosition) {
			return memoryId;
		}
	}

	return null;
}

/**
 * Record selective outcomes based on memory attribution
 *
 * v0.2.12 Enhanced: Uses scoring matrix to combine outcome detection with LLM marks
 *
 * Uses the attribution from the LLM response to record positive/negative
 * outcomes for specific memories, rather than all-or-nothing scoring.
 *
 * @param params - Selective outcome parameters
 */
export async function recordSelectiveOutcomes(params: {
	userId: string;
	conversationId: string;
	searchPositionMap: SearchPositionMap;
	attribution: MemoryAttribution;
	/** v0.2.12: Optional outcome detection result for scoring matrix */
	detectedOutcome?: "worked" | "failed" | "partial" | "unknown";
}): Promise<{
	recorded: number;
	errors: number;
	scoringDetails: Array<{
		position: number;
		memoryId: string;
		action: ScoringAction;
		delta: number;
	}>;
}> {
	const flags = getMemoryFeatureFlags();
	if (!flags.systemEnabled || !flags.outcomeEnabled) {
		return { recorded: 0, errors: 0, scoringDetails: [] };
	}

	let recorded = 0;
	let errors = 0;
	const scoringDetails: Array<{
		position: number;
		memoryId: string;
		action: ScoringAction;
		delta: number;
	}> = [];
	const outcome = params.detectedOutcome ?? "unknown";

	try {
		const facade = UnifiedMemoryFacade.getInstance();

		// v0.2.12: Apply scoring matrix for upvoted memories
		for (const position of params.attribution.upvoted) {
			const memoryId = getMemoryIdByPosition(params.searchPositionMap, position);
			if (memoryId) {
				const { action, delta } = getScoringAction(outcome, "upvoted");
				scoringDetails.push({ position, memoryId, action, delta });

				// Only record if action suggests score change
				if (action === "upvote" || action === "slight_up") {
					try {
						await facade.recordOutcome({
							userId: params.userId,
							outcome: action === "upvote" ? "worked" : "partial",
							relatedMemoryIds: [memoryId],
						});
						recorded++;
						logger.debug(
							{ memoryId, position, action, delta, detectedOutcome: outcome },
							"Recorded selective outcome (upvoted)"
						);
					} catch (err) {
						errors++;
						logger.warn({ err, memoryId, position }, "Failed to record positive outcome");
					}
				}
			}
		}

		// v0.2.12: Apply scoring matrix for downvoted memories
		for (const position of params.attribution.downvoted) {
			const memoryId = getMemoryIdByPosition(params.searchPositionMap, position);
			if (memoryId) {
				const { action, delta } = getScoringAction(outcome, "downvoted");
				scoringDetails.push({ position, memoryId, action, delta });

				// Only record if action suggests score change
				if (action === "downvote" || action === "slight_down") {
					try {
						await facade.recordOutcome({
							userId: params.userId,
							outcome: action === "downvote" ? "failed" : "partial",
							relatedMemoryIds: [memoryId],
						});
						recorded++;
						logger.debug(
							{ memoryId, position, action, delta, detectedOutcome: outcome },
							"Recorded selective outcome (downvoted)"
						);
					} catch (err) {
						errors++;
						logger.warn({ err, memoryId, position }, "Failed to record negative outcome");
					}
				}
			}
		}

		// Neutral memories (➖) are intentionally not recorded
		// v0.2.12: Log them for transparency but don't score
		for (const position of params.attribution.neutral) {
			const memoryId = getMemoryIdByPosition(params.searchPositionMap, position);
			if (memoryId) {
				const { action, delta } = getScoringAction(outcome, "neutral");
				scoringDetails.push({ position, memoryId, action, delta });
			}
		}

		logger.info(
			{
				userId: params.userId,
				conversationId: params.conversationId,
				detectedOutcome: outcome,
				upvotedCount: params.attribution.upvoted.length,
				downvotedCount: params.attribution.downvoted.length,
				neutralCount: params.attribution.neutral.length,
				recorded,
				errors,
				scoringActions: scoringDetails.map((d) => d.action),
			},
			"v0.2.12 Recorded selective memory outcomes with scoring matrix"
		);
	} catch (err) {
		logger.error({ err }, "Failed to record selective outcomes");
	}

	return { recorded, errors, scoringDetails };
}

/**
 * Process LLM response with memory attribution
 *
 * This is the main entry point for memory attribution. It:
 * 1. Parses memory marks from the response
 * 2. Records selective outcomes if attribution is found
 * 3. Returns the cleaned response (attribution comment stripped)
 *
 * @param params - Processing parameters
 * @returns Cleaned response and whether attribution was found
 */
export async function processResponseWithAttribution(params: {
	userId: string;
	conversationId: string;
	response: string;
	searchPositionMap: SearchPositionMap;
}): Promise<{
	cleanedResponse: string;
	attributionFound: boolean;
	attribution: MemoryAttribution | null;
}> {
	const { cleanedResponse, attribution } = parseMemoryMarks(params.response);

	if (attribution && Object.keys(params.searchPositionMap).length > 0) {
		// Record selective outcomes in background (don't block)
		recordSelectiveOutcomes({
			userId: params.userId,
			conversationId: params.conversationId,
			searchPositionMap: params.searchPositionMap,
			attribution,
		}).catch((err) => {
			logger.warn({ err }, "Background selective outcome recording failed");
		});
	}

	return {
		cleanedResponse,
		attributionFound: attribution !== null,
		attribution,
	};
}

/**
 * Get the appropriate attribution instruction based on language
 *
 * @param language - Language code ('he' | 'en' | 'mixed')
 * @returns Attribution instruction string
 */
export function getAttributionInstruction(language?: "he" | "en" | "mixed"): string {
	if (language === "he") {
		return MEMORY_ATTRIBUTION_INSTRUCTION_HE;
	}
	return MEMORY_ATTRIBUTION_INSTRUCTION;
}

// ============================================
// v0.2.12 ENHANCEMENTS - SELECTIVE & CAUSAL SCORING
// ============================================

/**
 * v0.2.12 Fix #5: Build surfaced memories structure for selective scoring
 *
 * Creates position_map and content_map from search results to track
 * which memories were actually surfaced to the main LLM.
 *
 * @param searchPositionMap - The search position map from memory retrieval
 * @param memoryContents - Optional map of memory_id to content previews
 * @returns SurfacedMemories structure for outcome detection
 */
export function buildSurfacedMemories(
	searchPositionMap: SearchPositionMap,
	memoryContents?: Record<string, string>
): SurfacedMemories {
	const position_map: Record<number, string> = {};
	const content_map: Record<number, string> = {};

	for (const [memoryId, entry] of Object.entries(searchPositionMap)) {
		// Position in UI is 1-indexed
		const uiPosition = entry.position + 1;
		position_map[uiPosition] = memoryId;

		// Content preview if available
		if (memoryContents?.[memoryId]) {
			content_map[uiPosition] = memoryContents[memoryId].slice(0, 100);
		}
	}

	return { position_map, content_map };
}

/**
 * v0.2.12 Fix #5: Infer which memories were actually USED in the response
 *
 * When LLM doesn't provide explicit attribution marks, we fall back to
 * inference by checking if memory content appears referenced in the response.
 *
 * This is the TypeScript equivalent of OutcomeDetector's used_positions inference.
 *
 * @param response - The LLM's response text
 * @param surfacedMemories - The surfaced memories with content
 * @returns Array of positions that appear to have been used
 */
export function inferUsedPositions(response: string, surfacedMemories: SurfacedMemories): number[] {
	const usedPositions: number[] = [];
	const responseLower = response.toLowerCase();

	for (const [posStr, content] of Object.entries(surfacedMemories.content_map)) {
		const position = parseInt(posStr, 10);
		if (isNaN(position)) continue;

		// Check if any significant words from the memory appear in response
		// Use keyword matching - extract 3+ letter words
		const keywords = content
			.toLowerCase()
			.split(/\s+/)
			.filter((w) => w.length >= 4) // Skip short words
			.slice(0, 10); // Limit to first 10 keywords

		// If 2+ keywords match, consider it "used"
		let matchCount = 0;
		for (const keyword of keywords) {
			if (responseLower.includes(keyword)) {
				matchCount++;
			}
		}

		if (matchCount >= 2 || (keywords.length <= 3 && matchCount >= 1)) {
			usedPositions.push(position);
		}
	}

	return usedPositions;
}

/**
 * v0.2.12: Simple outcome detection based on response characteristics
 *
 * This is a simplified version of OutcomeDetector.analyze() for TypeScript.
 * For full LLM-based outcome detection, use the Python backend.
 *
 * Detects indicators like:
 * - explicit_thanks
 * - follow_up_question
 * - correction_needed
 * - error_message
 *
 * @param userMessage - The user's follow-up message (if any)
 * @param assistantResponse - The assistant's response
 * @returns Basic outcome detection result
 */
export function detectBasicOutcome(
	userMessage: string | null,
	assistantResponse: string
): Pick<OutcomeDetectionResult, "outcome" | "confidence" | "indicators" | "reasoning"> {
	const indicators: string[] = [];
	let outcome: "worked" | "failed" | "partial" | "unknown" = "unknown";
	let confidence = 0.3;
	let reasoning = "No clear indicators";

	// Check assistant response for error patterns
	const responseLower = assistantResponse.toLowerCase();
	if (
		responseLower.includes("i'm sorry") ||
		responseLower.includes("i cannot") ||
		responseLower.includes("error:") ||
		responseLower.includes("failed to")
	) {
		indicators.push("error_message");
		outcome = "failed";
		confidence = 0.6;
		reasoning = "Response contains error or apology";
	}

	// Check user's follow-up message for positive/negative signals
	if (userMessage) {
		const userLower = userMessage.toLowerCase();

		// Positive signals
		if (
			userLower.includes("thank") ||
			userLower.includes("thanks") ||
			userLower.includes("perfect") ||
			userLower.includes("great") ||
			userLower.includes("exactly") ||
			userLower.includes("תודה") || // Hebrew: thank you
			userLower.includes("מעולה") // Hebrew: excellent
		) {
			indicators.push("explicit_thanks");
			outcome = "worked";
			confidence = 0.8;
			reasoning = "User expressed gratitude or satisfaction";
		}

		// Negative signals
		if (
			userLower.includes("wrong") ||
			userLower.includes("incorrect") ||
			userLower.includes("no, ") ||
			userLower.includes("that's not") ||
			userLower.includes("actually") ||
			userLower.includes("לא נכון") // Hebrew: not correct
		) {
			indicators.push("correction_needed");
			outcome = "failed";
			confidence = 0.7;
			reasoning = "User indicated response was wrong";
		}

		// Follow-up question (neutral - could indicate partial success)
		if (
			userLower.includes("?") ||
			userLower.includes("what about") ||
			userLower.includes("can you also") ||
			userLower.includes("how about")
		) {
			indicators.push("follow_up_question");
			if (outcome === "unknown") {
				outcome = "partial";
				confidence = 0.5;
				reasoning = "User asked follow-up question";
			}
		}
	}

	// If response is substantial and no negative indicators, lean positive
	if (outcome === "unknown" && assistantResponse.length > 200 && indicators.length === 0) {
		outcome = "partial";
		confidence = 0.4;
		reasoning = "Substantial response with no clear signals";
	}

	return { outcome, confidence, indicators, reasoning };
}

/**
 * v0.2.12: Process response with full outcome detection and attribution
 *
 * Enhanced version that combines:
 * - LLM attribution marks (Fix #7)
 * - Inferred usage (Fix #5)
 * - Scoring matrix application
 * - Fallback to all-scoring (Fix #4)
 *
 * @param params - Enhanced processing parameters
 * @returns Full processing result with outcome detection
 */
export async function processResponseWithFullAttribution(params: {
	userId: string;
	conversationId: string;
	response: string;
	searchPositionMap: SearchPositionMap;
	/** v0.2.12: Content map for inference fallback */
	memoryContents?: Record<string, string>;
	/** v0.2.12: User's follow-up message for outcome detection */
	userFollowUp?: string | null;
}): Promise<{
	cleanedResponse: string;
	attributionFound: boolean;
	attribution: MemoryAttribution | null;
	outcomeDetection: Pick<
		OutcomeDetectionResult,
		"outcome" | "confidence" | "indicators" | "reasoning"
	>;
	usedPositions: number[];
	scoringApplied: "attribution" | "inference" | "all" | "none";
}> {
	// Step 1: Parse LLM attribution marks
	const { cleanedResponse, attribution } = parseMemoryMarks(params.response);

	// Step 2: Detect outcome
	const outcomeDetection = detectBasicOutcome(params.userFollowUp ?? null, cleanedResponse);

	// Step 3: Determine used positions and scoring strategy
	let usedPositions: number[] = [];
	let scoringApplied: "attribution" | "inference" | "all" | "none" = "none";

	const memoryCount = Object.keys(params.searchPositionMap).length;

	if (memoryCount === 0) {
		// No memories to score
		scoringApplied = "none";
	} else if (attribution) {
		// v0.2.12 Fix #7: Use LLM attribution marks with scoring matrix
		usedPositions = [...attribution.upvoted, ...attribution.downvoted];
		scoringApplied = "attribution";

		// Record with scoring matrix
		recordSelectiveOutcomes({
			userId: params.userId,
			conversationId: params.conversationId,
			searchPositionMap: params.searchPositionMap,
			attribution,
			detectedOutcome: outcomeDetection.outcome,
		}).catch((err) => {
			logger.warn({ err }, "Background selective outcome recording failed");
		});
	} else if (params.memoryContents && Object.keys(params.memoryContents).length > 0) {
		// v0.2.12 Fix #5: Fallback to inference
		const surfacedMemories = buildSurfacedMemories(params.searchPositionMap, params.memoryContents);
		usedPositions = inferUsedPositions(cleanedResponse, surfacedMemories);
		scoringApplied = usedPositions.length > 0 ? "inference" : "all";

		if (usedPositions.length > 0) {
			// Score only inferred used memories
			const inferredAttribution: MemoryAttribution = {
				upvoted: outcomeDetection.outcome === "worked" ? usedPositions : [],
				downvoted: outcomeDetection.outcome === "failed" ? usedPositions : [],
				neutral: [],
				raw: `inferred:${usedPositions.join(",")}`,
			};

			recordSelectiveOutcomes({
				userId: params.userId,
				conversationId: params.conversationId,
				searchPositionMap: params.searchPositionMap,
				attribution: inferredAttribution,
				detectedOutcome: outcomeDetection.outcome,
			}).catch((err) => {
				logger.warn({ err }, "Background inferred outcome recording failed");
			});
		} else {
			// Fix #4 fallback: Score all memories with detected outcome
			const allPositions = Object.values(params.searchPositionMap).map(
				(entry) => entry.position + 1
			);

			const allAttribution: MemoryAttribution = {
				upvoted: outcomeDetection.outcome === "worked" ? allPositions : [],
				downvoted: outcomeDetection.outcome === "failed" ? allPositions : [],
				neutral:
					outcomeDetection.outcome === "unknown" || outcomeDetection.outcome === "partial"
						? allPositions
						: [],
				raw: `fallback_all:${allPositions.join(",")}`,
			};

			if (outcomeDetection.outcome !== "unknown") {
				recordSelectiveOutcomes({
					userId: params.userId,
					conversationId: params.conversationId,
					searchPositionMap: params.searchPositionMap,
					attribution: allAttribution,
					detectedOutcome: outcomeDetection.outcome,
				}).catch((err) => {
					logger.warn({ err }, "Background all-memory outcome recording failed");
				});
			}
		}
	} else {
		// No content map - can't infer, use Fix #4 fallback
		scoringApplied = "all";
		const allPositions = Object.values(params.searchPositionMap).map((entry) => entry.position + 1);
		usedPositions = allPositions;

		// Record all with detected outcome if not unknown
		if (outcomeDetection.outcome !== "unknown") {
			const flags = getMemoryFeatureFlags();
			if (flags.systemEnabled && flags.outcomeEnabled) {
				try {
					const facade = UnifiedMemoryFacade.getInstance();
					await facade.recordOutcome({
						userId: params.userId,
						outcome: outcomeDetection.outcome,
						relatedMemoryIds: Object.keys(params.searchPositionMap),
					});
				} catch (err) {
					logger.warn({ err }, "Failed to record all-memory outcome");
				}
			}
		}
	}

	logger.debug(
		{
			userId: params.userId,
			conversationId: params.conversationId,
			memoryCount,
			attributionFound: !!attribution,
			outcomeDetected: outcomeDetection.outcome,
			confidence: outcomeDetection.confidence,
			usedPositions,
			scoringApplied,
		},
		"v0.2.12 Full attribution processing complete"
	);

	return {
		cleanedResponse,
		attributionFound: attribution !== null,
		attribution,
		outcomeDetection,
		usedPositions,
		scoringApplied,
	};
}

/**
 * v0.2.12: Get doc_ids from cold-start context for outcome scoring
 *
 * RoamPal Parity (unified_memory_system.py get_cold_start_context):
 * Returns (formatted_context, doc_ids, raw_context) for outcome scoring.
 * doc_ids derived via: doc_ids = [r.get("id") for r in all_context if r.get("id")]
 *
 * @param searchPositionMap - The search position map from memory retrieval
 * @returns Array of memory IDs (doc_ids) for outcome scoring
 */
export function extractDocIdsForScoring(searchPositionMap: SearchPositionMap): string[] {
	return Object.keys(searchPositionMap);
}

// ============================================
// v0.2.10 ENHANCEMENTS - MEMORY BANK PHILOSOPHY
// Three-layer purpose: User Context, System Mastery, Agent Growth
// ============================================

/**
 * Memory Bank Philosophy - Three-layer purpose and selectivity guidance
 *
 * RoamPal v0.2.10: Prevents LLM from spamming create_memory with every fact.
 * Instead, guides LLM to store only strategic knowledge that enables
 * continuity and learning across sessions.
 */
export const MEMORY_BANK_PHILOSOPHY = `
**MEMORY BANK PHILOSOPHY - Three Layers**

When storing to memory_bank with add_to_memory_bank, classify under these THREE layers:

1. **User Context** (tag: user_context)
   - Identity: Name, background, career role, language preference
   - Preferences: Preferred tools, styles, communication preferences
   - Goals: Current projects, objectives, deadlines, priorities
   
2. **System Mastery** (tag: system_mastery)
   - Tool strategies: What search patterns/tools work for this user
   - Effective workflows: Proven approaches for this user
   - Navigation patterns: How this user finds what they need
   
3. **Agent Growth** (tag: agent_growth)
   - Mistakes learned: What to avoid, lessons from failures
   - Relationship dynamics: Trust patterns, collaboration style
   - Progress tracking: Goal checkpoints, iterations, milestones

**BE SELECTIVE - CRITICAL:**
✅ Store: What enables continuity/learning across sessions
❌ DON'T store: Every conversation fact (automatic working memory handles this)
❌ DON'T store: Session-specific transient details
❌ DON'T store: Redundant duplicates of existing memories

**Good memory examples:**
- "User prefers dark mode and uses VS Code for Python development" ✅
- "User is senior backend engineer at TechCorp, confirmed" ✅
- "User had success with chunking approach for API timeouts (3 times)" ✅

**Bad memory examples (don't store these):**
- "User asked about weather today" ❌ (too transient)
- "User said hello" ❌ (session noise)
- "User's name is Alex" when already stored ❌ (duplicate)
`;

/**
 * Hebrew version of Memory Bank Philosophy
 */
export const MEMORY_BANK_PHILOSOPHY_HE = `
**פילוסופיית בנק הזיכרון - שלוש שכבות**

כאשר שומרים לבנק הזיכרון עם add_to_memory_bank, סווג תחת שלוש שכבות:

1. **הקשר משתמש** (תג: user_context)
   - זהות: שם, רקע, תפקיד מקצועי, העדפת שפה
   - העדפות: כלים מועדפים, סגנונות, העדפות תקשורת
   - מטרות: פרויקטים נוכחיים, יעדים, לוחות זמנים
   
2. **שליטה במערכת** (תג: system_mastery)
   - אסטרטגיות כלים: אילו דפוסי חיפוש/כלים עובדים למשתמש
   - זרימות עבודה יעילות: גישות מוכחות למשתמש זה
   
3. **צמיחת הסוכן** (תג: agent_growth)
   - טעויות שנלמדו: מה להימנע, לקחים מכישלונות
   - מעקב התקדמות: נקודות ביקורת, איטרציות

**היה סלקטיבי - קריטי:**
✅ שמור: מה שמאפשר המשכיות/למידה בין שיחות
❌ אל תשמור: כל עובדה בשיחה (זיכרון עבודה אוטומטי מטפל)
❌ אל תשמור: פרטים חולפים של הפגישה
❌ אל תשמור: כפילויות מיותרות
`;

// ============================================
// v0.2.10 ENHANCEMENTS - TOOL GUIDANCE INJECTION
// Action-Level Causal Learning with prompt injection
// ============================================

/**
 * Tool guidance result from action effectiveness analysis
 */
export interface ToolGuidanceResult {
	/** Formatted guidance text to inject */
	guidanceText: string | null;
	/** Whether any guidance was generated */
	hasGuidance: boolean;
	/** Tools to prefer (Wilson score > 0.7) */
	preferredTools: string[];
	/** Tools to avoid (Wilson score < 0.4) */
	avoidTools: string[];
	/** Timing in milliseconds */
	timingMs: number;
}

/**
 * Get tool guidance based on action effectiveness from Action KG
 *
 * RoamPal v0.2.10: After learning from 3+ uses, system automatically injects warnings:
 *
 * ═══ CONTEXTUAL GUIDANCE (Context: memory_test) ═══
 * 🎯 Tool Guidance (learned from past outcomes):
 *   ✓ search_memory() → 87% success (42 uses)
 *   ✗ create_memory() → only 5% success (19 uses) - AVOID
 *
 * @param userId - User identifier
 * @param contextType - Detected context type (docker, debugging, coding_help, etc.)
 * @param availableTools - List of available tool names in current session
 * @returns Tool guidance result
 */
export async function getToolGuidance(
	userId: string,
	contextType: string,
	availableTools: string[] = []
): Promise<ToolGuidanceResult> {
	const result: ToolGuidanceResult = {
		guidanceText: null,
		hasGuidance: false,
		preferredTools: [],
		avoidTools: [],
		timingMs: 0,
	};

	const flags = getMemoryFeatureFlags();
	if (!flags.systemEnabled) {
		return result;
	}

	const startTime = Date.now();

	try {
		const facade = UnifiedMemoryFacade.getInstance();
		const actionStats = await facade.getActionEffectiveness({
			userId,
			contextType,
		});

		if (actionStats.length === 0) {
			result.timingMs = Date.now() - startTime;
			return result;
		}

		// Filter to only relevant tools (with 3+ uses for statistical significance)
		const relevantStats = actionStats.filter((stat) => stat.total_uses >= 3);

		if (relevantStats.length === 0) {
			result.timingMs = Date.now() - startTime;
			return result;
		}

		// Build guidance text
		const lines: string[] = [
			`═══ TOOL GUIDANCE (Context: ${contextType}) ═══`,
			"",
			"🎯 Tool Effectiveness (learned from past outcomes):",
		];

		for (const stat of relevantStats.slice(0, 6)) {
			// Limit to top 6
			const successRate = stat.success_rate;
			let emoji: string;
			let warning = "";

			if (successRate > 0.7) {
				emoji = "✓";
				result.preferredTools.push(stat.action_type);
			} else if (successRate < 0.4) {
				emoji = "✗";
				warning = " - AVOID";
				result.avoidTools.push(stat.action_type);
			} else {
				emoji = "○";
			}

			lines.push(
				`  ${emoji} ${stat.action_type}() → ${(successRate * 100).toFixed(0)}% success (${stat.total_uses} uses)${warning}`
			);
		}

		// Add warning if tools to avoid exist
		if (result.avoidTools.length > 0) {
			lines.push("");
			lines.push(`⚠️ Based on past failures, avoid: ${result.avoidTools.join(", ")}`);
		}

		result.guidanceText = lines.join("\n");
		result.hasGuidance = true;

		logger.debug(
			{
				userId,
				contextType,
				preferredTools: result.preferredTools,
				avoidTools: result.avoidTools,
				statsCount: relevantStats.length,
			},
			"Tool guidance generated"
		);
	} catch (err) {
		// Tool guidance should never block - fail silently
		logger.warn({ err }, "Failed to get tool guidance");
	}

	result.timingMs = Date.now() - startTime;
	return result;
}

/**
 * Get the appropriate Memory Bank Philosophy instruction based on language
 *
 * @param language - Language code ('he' | 'en' | 'mixed')
 * @returns Memory Bank Philosophy string
 */
export function getMemoryBankPhilosophy(language?: "he" | "en" | "mixed"): string {
	if (language === "he") {
		return MEMORY_BANK_PHILOSOPHY_HE;
	}
	return MEMORY_BANK_PHILOSOPHY;
}

/**
 * Check if add_to_memory_bank tool is available in the current tool set
 *
 * @param tools - Array of tool definitions
 * @returns true if add_to_memory_bank is available
 */
export function hasMemoryBankTool(tools: Array<{ function: { name: string } }>): boolean {
	return tools.some(
		(t) =>
			t.function.name === "add_to_memory_bank" ||
			t.function.name === "create_memory" ||
			t.function.name === "store_memory"
	);
}
