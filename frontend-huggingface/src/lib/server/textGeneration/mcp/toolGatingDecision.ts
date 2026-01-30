/**
 * Tool Gating Decision Service
 *
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║  SINGLE SOURCE OF TRUTH FOR TOOL GATING                                    ║
 * ║                                                                            ║
 * ║  Finding 12: This module is the ONLY authoritative implementation for      ║
 * ║  tool gating decisions. Do NOT create parallel gating logic elsewhere.     ║
 * ║                                                                            ║
 * ║  All tool filtering must flow through decideToolGating() to ensure:        ║
 * ║  - Consistent behavior across the codebase                                 ║
 * ║  - Proper fail-open semantics when memory is degraded                      ║
 * ║  - Hebrew intent awareness for research/search queries                     ║
 * ║  - Auditable reason codes for debugging and metrics                        ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
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
// K.1.1: ToolGatingInput Interface (8 parameters)
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

	/** Date query needs search tools because memory lacks explicit date signals */
	dateQueryNeedsSearch: boolean;

	/** Whether memory results include document or memory-bank tiers */
	memoryHasDocumentTier: boolean;

	/** Original user query text */
	userQuery: string;

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
	| "DATE_QUERY_NEEDS_SEARCH" // Rule 3.5: Date query requires external search
	| "LEGAL_DECISION_NEEDS_SEARCH" // Rule 3.75: Legal decision queries should keep search tools
	| "HIGH_CONFIDENCE_REDUCTION" // Rule 4: High confidence, reduce tools
	| "DEFAULT_ALLOW_ALL"; // Rule 5: Default allow all tools

// ============================================
// Tool Categories for Gating
// ============================================

/**
 * Normalize tool name to handle MCP server inconsistency.
 * Some MCP servers use hyphens (tavily-search), others use underscores (perplexity_ask).
 * This function converts to lowercase with underscores for consistent matching.
 */
function normalizeToolName(name: string): string {
	return name.toLowerCase().replace(/-/g, "_");
}

/**
 * Check if a tool name is in a set (handles hyphen/underscore variants).
 */
function toolNameInSet(toolName: string, toolSet: Set<string>): boolean {
	const normalized = normalizeToolName(toolName);
	for (const name of toolSet) {
		if (normalizeToolName(name) === normalized) {
			return true;
		}
	}
	return false;
}

/**
 * Tools that should ALWAYS be available regardless of confidence.
 * These are memory system tools or critical infrastructure.
 *
 * Consolidated from Finding 12: includes tools from both original implementations.
 */
const ALWAYS_ALLOWED_TOOLS = new Set([
	// Memory system tools
	"add_to_memory_bank", // Memory storage
	"search_memory", // Memory retrieval
	"recall_memory", // Memory recall
	"get_context_insights", // Context analysis (from memoryIntegration)
	"record_response", // Response recording (from memoryIntegration)
	// Document processing tools
	"docling_convert", // Document processing (might be needed for context)
	"docling_ocr", // OCR processing
]);

/**
 * Tools that should be reduced when memory confidence is high.
 * These are external search/research tools that may be redundant
 * when memory already has high-confidence answers.
 *
 * Consolidated from Finding 12: includes tools from both original implementations.
 */
const REDUCIBLE_TOOLS = new Set([
	// Web search tools
	"tavily_search", // External web search
	"web_search", // Generic web search
	"perplexity_ask", // Research tool
	"brave_search", // Brave search
	"duckduckgo_search", // DuckDuckGo search
	// Data query tools (from memoryIntegration)
	"datagov_query", // Israeli government data
]);

/**
 * Tools that require explicit user request to enable.
 * These are potentially dangerous or have side effects.
 *
 * NOTE: Currently not enforced in decideToolGating() but defined here
 * for future use and documentation. These tools should only be allowed
 * if the user explicitly requests them in their query.
 */
export const RESTRICTED_TOOLS = new Set([
	"code_execution", // Runs arbitrary code
	"file_write", // Modifies filesystem
	"database_query", // Direct DB access
	"system_command", // Shell commands
]);

const LEGAL_DECISION_PATTERNS = [
	/בג["׳״]?ץ/i,
	/בגץ/i,
	/פסק[ -]?דין/i,
	/החלט(ה|ות|ת)/i,
	/הוחלט/i,
	/ערעור/i,
	/עתיר(ה|ות)/i,
	/עליון/i,
	/בית המשפט/i,
	/ביהמ["׳״]?ש/i,
	/בימ["׳״]?ש/i,
	/supreme court/i,
	/decision/i,
	/ruling/i,
	/judgment/i,
	/appeal/i,
];

function isLegalDecisionQuery(query: string): boolean {
	if (!query) return false;
	return LEGAL_DECISION_PATTERNS.some((pattern) => pattern.test(query));
}

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
 * 4. Date query needs search: Allow all tools when memory lacks dates
 * 5. Legal decision queries: Allow all tools to verify current rulings
 * 6. High confidence: If confidence='high' + 3+ results, reduce external tools
 * 7. Default: Allow all tools
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
		dateQueryNeedsSearch,
		memoryHasDocumentTier,
		userQuery,
		availableTools,
	} = input;

	// ============================================
	// K.1.4: Rule 1 - Fail-open when memoryDegraded=true
	// ============================================
	if (memoryDegraded) {
		logger.info(
			{ reason: "FAIL_OPEN_DEGRADED" },
			"[toolGating] Memory degraded, allowing all tools"
		);
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
		logger.warn(
			{ toolName: explicitToolRequest },
			"[tool-gate] Allowing tool despite high confidence (explicit request)"
		);
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
	if (
		detectedHebrewIntent === "research" ||
		detectedHebrewIntent === "search" ||
		detectedHebrewIntent === "official_data"
	) {
		const intentLabel =
			detectedHebrewIntent === "research"
				? "מחקר"
				: detectedHebrewIntent === "search"
					? "חפש"
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
	// K.1.6.5: Rule 3.5 - Date queries need external search if memory lacks dates
	// ============================================
	if (dateQueryNeedsSearch) {
		logger.info(
			{ reason: "DATE_QUERY_NEEDS_SEARCH" },
			"[toolGating] Date query missing memory dates, allowing all tools"
		);
		return {
			allowedTools: availableTools,
			reducedCount: 0,
			reasonCode: "DATE_QUERY_NEEDS_SEARCH",
			traceExplanation: {
				he: "שאלת תאריך בלי תאריך בזיכרון - כל כלי החיפוש מותרים",
				en: "Date question missing memory dates - all search tools allowed",
			},
		};
	}

	// ============================================
	// K.1.7: Rule 3.75 - Legal decision queries should keep search tools
	// ============================================
	const shouldOverrideLegalSearch =
		isLegalDecisionQuery(userQuery) &&
		memoryHasDocumentTier &&
		(retrievalConfidence === "high" || retrievalConfidence === "medium") &&
		memoryResultCount >= 1;

	if (isLegalDecisionQuery(userQuery) && !shouldOverrideLegalSearch) {
		logger.info(
			{ reason: "LEGAL_DECISION_NEEDS_SEARCH" },
			"[toolGating] Legal decision query, allowing all tools"
		);
		return {
			allowedTools: availableTools,
			reducedCount: 0,
			reasonCode: "LEGAL_DECISION_NEEDS_SEARCH",
			traceExplanation: {
				he: "שאילתת פסיקה משפטית - כל כלי החיפוש מותרים",
				en: "Legal decision query - all search tools allowed",
			},
		};
	} else if (shouldOverrideLegalSearch) {
		logger.info(
			{ reason: "HIGH_CONFIDENCE_REDUCTION", memoryResultCount },
			"[toolGating] Legal decision query satisfied by memory documents, reducing search tools"
		);
	}

	// ============================================
	// K.1.7: Rule 4 - Reduce tools when memory has relevant results
	// Fix: Lowered threshold from "high + 3" to "(high OR medium) + 1"
	// Rationale: A single relevant document result should prevent redundant web searches
	// The previous threshold was too conservative - it required 3+ results for tool reduction
	// ============================================
	if (
		(retrievalConfidence === "high" || retrievalConfidence === "medium") &&
		memoryResultCount >= 1
	) {
		logger.info(
			{ confidence: retrievalConfidence, toolCount: availableTools.length, memoryResultCount },
			"[filter] Memory confidence sufficient - filtering search tools"
		);

		const filteredTools = availableTools.filter((tool) => {
			const toolName = tool.function.name;

			// Always keep memory/document tools (normalized matching for hyphen/underscore variants)
			if (toolNameInSet(toolName, ALWAYS_ALLOWED_TOOLS)) {
				return true;
			}

			// Remove reducible external search tools (normalized matching for hyphen/underscore variants)
			if (toolNameInSet(toolName, REDUCIBLE_TOOLS)) {
				return false;
			}

			// Keep all other tools by default
			return true;
		});

		const skippedTools = availableTools
			.filter((t) => !filteredTools.some((ft) => ft.function.name === t.function.name))
			.map((t) => t.function.name);
		if (skippedTools.length > 0) {
			logger.debug({ skippedTools }, "[tool-gate] Skipped redundant search tools");
		}
		logger.info(
			{ confidence: retrievalConfidence, filteredCount: filteredTools.length },
			"[tool-gate] Tools filtered by memory confidence"
		);

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
				"[toolGating] Memory has relevant results, reducing external tools"
			);

			const confidenceLabel = retrievalConfidence === "high" ? "גבוה" : "בינוני";
			return {
				allowedTools: filteredTools,
				reducedCount,
				reasonCode: "HIGH_CONFIDENCE_REDUCTION",
				traceExplanation: {
					he: `ביטחון ${confidenceLabel} מהזיכרון (${memoryResultCount} תוצאות) - הופחתו ${reducedCount} כלי חיפוש חיצוניים`,
					en: `${retrievalConfidence} confidence from memory (${memoryResultCount} results) - reduced ${reducedCount} external search tools`,
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
