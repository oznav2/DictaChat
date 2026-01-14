/**
 * Tool Gating Decision Service
 *
 * Phase 3 (+13): Memory-First Tool Gating
 * Kimi Enterprise Requirement K.1: Enforceable Tool Gating
 *
 * Centralized decision logic for determining which tools should be available
 * based on memory confidence, user intent, and system state.
 *
 * Design Principles:
 * - Fail-open: Always allow tools if memory system is degraded
 * - Explicit override: Honor user's explicit tool requests
 * - Hebrew intent awareness: "מחקר" (research) always allows all tools
 * - High confidence reduction: Reduce tools when memory has confident answers
 *
 * Reference: codespace_gaps_enhanced.md Phase 3, codespace_priorities.md TIER 3
 */

import { logger } from "$lib/server/logger";
import type { RetrievalConfidence } from "$lib/server/memory/types";
import type { DetectedIntent } from "$lib/server/textGeneration/utils/hebrewIntentDetector";

// ============================================
// K.1.1: ToolGatingInput Interface (6 parameters)
// ============================================

/**
 * Input parameters for tool gating decision.
 * Each parameter influences the gating logic.
 */
export interface ToolGatingInput {
	/** Confidence level from memory retrieval (high/medium/low) */
	retrievalConfidence: RetrievalConfidence;

	/** Number of memory results retrieved */
	memoryResultCount: number;

	/** Explicit tool request from user query (e.g., "search the web") */
	explicitToolRequest: string | null;

	/** Hebrew intent detected from query (research/search/official_data/null) */
	detectedHebrewIntent: DetectedIntent;

	/** Whether memory system is degraded (circuit breaker open, timeouts) */
	memoryDegraded: boolean;

	/** Original list of tools available */
	availableTools: ToolDefinition[];
}

/**
 * Minimal tool definition for gating decisions.
 * Compatible with OpenAI function calling format.
 */
export interface ToolDefinition {
	function: {
		name: string;
		description?: string;
	};
	type?: string;
}

// ============================================
// K.1.2: ToolGatingOutput Interface (4 fields)
// ============================================

/**
 * Output from tool gating decision.
 * Provides both the filtered tool list and trace information.
 */
export interface ToolGatingOutput {
	/** Filtered list of tools allowed for this request */
	allowedTools: ToolDefinition[];

	/** Number of tools that were reduced/skipped */
	reducedCount: number;

	/** Reason code for the gating decision */
	reasonCode: ToolGatingReasonCode;

	/** Human-readable explanation for trace UI */
	traceExplanation: {
		he: string;
		en: string;
	};
}

/**
 * Reason codes for tool gating decisions.
 * Used for logging, metrics, and debugging.
 */
export type ToolGatingReasonCode =
	| "FAIL_OPEN_DEGRADED" // Rule 1: Memory system degraded, allow all
	| "EXPLICIT_TOOL_REQUEST" // Rule 2: User explicitly requested tools
	| "RESEARCH_INTENT" // Rule 3: Hebrew "מחקר" detected
	| "HIGH_CONFIDENCE_REDUCTION" // Rule 4: High confidence, reduce tools
	| "DEFAULT_ALLOW_ALL"; // Rule 5: Default allow all tools

// ============================================
// Tool Categories for Gating
// ============================================

/**
 * Tools that should ALWAYS be available regardless of confidence.
 * These are memory system tools or critical infrastructure.
 */
const ALWAYS_ALLOWED_TOOLS = new Set([
	"add_to_memory_bank", // Memory storage
	"search_memory", // Memory retrieval
	"recall_memory", // Memory recall
	"docling_convert", // Document processing (might be needed for context)
	"docling_ocr", // OCR processing
]);

/**
 * Tools that should be reduced when memory confidence is high.
 * These are external search/research tools.
 */
const REDUCIBLE_TOOLS = new Set([
	"tavily_search", // External web search
	"web_search", // Generic web search
	"perplexity_ask", // Research tool
	"brave_search", // Brave search
	"duckduckgo_search", // DuckDuckGo search
]);

// ============================================
// K.1.3: decideToolGating() Function (5 Rules)
// ============================================

/**
 * Central decision function for tool gating.
 *
 * Rule Priority (evaluated in order):
 * 1. Fail-open: If memoryDegraded=true, allow all tools
 * 2. Explicit override: If user explicitly requested a tool, allow all
 * 3. Research intent: If Hebrew "מחקר" detected, allow all
 * 4. High confidence: If confidence='high' + 3+ results, reduce external tools
 * 5. Default: Allow all tools
 *
 * @param input - Tool gating input parameters
 * @returns Tool gating output with filtered tools and trace info
 */
export function decideToolGating(input: ToolGatingInput): ToolGatingOutput {
	const {
		retrievalConfidence,
		memoryResultCount,
		explicitToolRequest,
		detectedHebrewIntent,
		memoryDegraded,
		availableTools,
	} = input;

	// ============================================
	// K.1.4: Rule 1 - Fail-open when memoryDegraded=true
	// ============================================
	if (memoryDegraded) {
		logger.info({ reason: "FAIL_OPEN_DEGRADED" }, "[toolGating] Memory degraded, allowing all tools");
		return {
			allowedTools: availableTools,
			reducedCount: 0,
			reasonCode: "FAIL_OPEN_DEGRADED",
			traceExplanation: {
				he: "מערכת הזיכרון לא זמינה - כל הכלים מותרים",
				en: "Memory system unavailable - all tools allowed",
			},
		};
	}

	// ============================================
	// K.1.5: Rule 2 - Allow all tools when explicitToolRequest detected
	// ============================================
	if (explicitToolRequest) {
		logger.info(
			{ reason: "EXPLICIT_TOOL_REQUEST", tool: explicitToolRequest },
			"[toolGating] Explicit tool request detected, allowing all tools"
		);
		return {
			allowedTools: availableTools,
			reducedCount: 0,
			reasonCode: "EXPLICIT_TOOL_REQUEST",
			traceExplanation: {
				he: `זוהתה בקשה מפורשת לכלי: ${explicitToolRequest}`,
				en: `Explicit tool request detected: ${explicitToolRequest}`,
			},
		};
	}

	// ============================================
	// K.1.6: Rule 3 - Allow all tools for Hebrew research/search/official_data intent
	// ============================================
	if (detectedHebrewIntent === "research" || detectedHebrewIntent === "search" || detectedHebrewIntent === "official_data") {
		const intentLabel = detectedHebrewIntent === "research" ? "מחקר" 
			: detectedHebrewIntent === "search" ? "חפש" 
			: "נתונים רשמיים";
		logger.info(
			{ reason: "EXPLICIT_INTENT", intent: detectedHebrewIntent },
			"[toolGating] Explicit intent detected, allowing all tools"
		);
		return {
			allowedTools: availableTools,
			reducedCount: 0,
			reasonCode: "RESEARCH_INTENT",
			traceExplanation: {
				he: `זוהתה כוונה מפורשת (${intentLabel}) - כל הכלים מותרים`,
				en: `Explicit intent detected (${detectedHebrewIntent}) - all tools allowed`,
			},
		};
	}

	// ============================================
	// K.1.7: Rule 4 - Reduce tools when retrievalConfidence='high' + 3+ results
	// ============================================
	if (retrievalConfidence === "high" && memoryResultCount >= 3) {
		const filteredTools = availableTools.filter((tool) => {
			const toolName = tool.function.name;

			// Always keep memory/document tools
			if (ALWAYS_ALLOWED_TOOLS.has(toolName)) {
				return true;
			}

			// Remove reducible external search tools
			if (REDUCIBLE_TOOLS.has(toolName)) {
				return false;
			}

			// Keep all other tools by default
			return true;
		});

		const reducedCount = availableTools.length - filteredTools.length;

		if (reducedCount > 0) {
			logger.info(
				{
					reason: "HIGH_CONFIDENCE_REDUCTION",
					confidence: retrievalConfidence,
					memoryResults: memoryResultCount,
					reducedCount,
					reducedTools: availableTools
						.filter((t) => !filteredTools.includes(t))
						.map((t) => t.function.name),
				},
				"[toolGating] High confidence from memory, reducing external tools"
			);

			return {
				allowedTools: filteredTools,
				reducedCount,
				reasonCode: "HIGH_CONFIDENCE_REDUCTION",
				traceExplanation: {
					he: `ביטחון גבוה מהזיכרון (${memoryResultCount} תוצאות) - הופחתו ${reducedCount} כלי חיפוש חיצוניים`,
					en: `High confidence from memory (${memoryResultCount} results) - reduced ${reducedCount} external search tools`,
				},
			};
		}
	}

	// ============================================
	// K.1.8: Rule 5 - Default allow all tools
	// ============================================
	logger.debug(
		{
			reason: "DEFAULT_ALLOW_ALL",
			confidence: retrievalConfidence,
			memoryResults: memoryResultCount,
		},
		"[toolGating] Default decision - allowing all tools"
	);

	return {
		allowedTools: availableTools,
		reducedCount: 0,
		reasonCode: "DEFAULT_ALLOW_ALL",
		traceExplanation: {
			he: "כל הכלים מותרים (ברירת מחדל)",
			en: "All tools allowed (default)",
		},
	};
}

// ============================================
// Export Types for Use in runMcpFlow.ts
// ============================================

export type { RetrievalConfidence };
export type { DetectedIntent };
