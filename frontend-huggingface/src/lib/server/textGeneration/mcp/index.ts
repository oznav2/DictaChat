/**
 * MCP Memory Integration Module
 *
 * This module provides the integration layer between the MCP (Model Context Protocol)
 * orchestration and the memory system. It exports utilities for:
 *
 * 1. **Memory Context Formatting** - Functions to format memory results for LLM prompts
 * 2. **Attribution & Scoring** - Track which memories helped and score accordingly
 * 3. **Bilingual Support** - Hebrew/English formatting with RTL support
 * 4. **Tool Guidance** - Memory-informed tool filtering and suggestions
 *
 * @module mcp
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
	/** Result of memory context prefetch operation */
	MemoryContextResult,
	/** Maps search positions to memory IDs for attribution */
	SearchPositionMap,
	/** Single entry in the search position map */
	SearchPositionEntry,
	// NOTE: ToolGatingConfig removed - use ToolGatingInput from toolGatingDecision.ts
	/** Parameters for recording response outcomes */
	RecordOutcomeParams,
	/** Result of cold-start context retrieval */
	ColdStartContextResult,
	/** Result of contextual guidance retrieval */
	ContextualGuidanceResult,
	/** Parameters for recording tool action outcomes */
	RecordToolActionParams,
	/** Attribution data for a single memory */
	MemoryAttribution,
	/** Collection of surfaced memories with their positions */
	SurfacedMemories,
	/** Result of outcome detection analysis */
	OutcomeDetectionResult,
	/** Scoring action to apply to a memory */
	ScoringAction,
	/** Entry in the scoring matrix */
	ScoringMatrixEntry,
	/** Result of parsing memory marks from response */
	ParseMemoryMarksResult,
	/** Result of tool guidance retrieval */
	ToolGuidanceResult,
} from "./memoryIntegration";

// ============================================================================
// Memory Context & Prefetch
// ============================================================================

export {
	/**
	 * Prefetch memory context before LLM generation.
	 * Retrieves relevant memories, personality prompt, and KG context.
	 * @param userId - User identifier
	 * @param query - User's query text
	 * @param options - Optional configuration including recent messages
	 * @returns Promise<MemoryContextResult> with all context data
	 */
	prefetchMemoryContext,
	/**
	 * Format memory context into prompt sections for injection.
	 * Handles bilingual formatting and RTL support.
	 * @param result - Memory context result from prefetch
	 * @param language - Target language ('he', 'en', or 'mixed')
	 * @returns Formatted prompt sections object
	 */
	formatMemoryPromptSections,
	/**
	 * Extract user ID from conversation object.
	 * Falls back to session ID or default admin user.
	 */
	getUserIdFromConversation,
	/**
	 * Check if this is the first message in a conversation.
	 * Used to trigger cold-start context injection.
	 */
	isFirstMessage,
	/**
	 * Get cold-start context for new conversations.
	 * Includes user profile, preferences, and initial guidance.
	 */
	getColdStartContextForConversation,
	/**
	 * Check if conversation has document files attached.
	 * (Moved from ragIntegration.ts in Finding 11 consolidation)
	 */
	hasDocumentAttachments,
} from "./memoryIntegration";

// ============================================================================
// Attribution & Outcome Tracking
// ============================================================================

export {
	/**
	 * Build search position map from search results.
	 * Maps position numbers to memory IDs for attribution tracking.
	 */
	buildSearchPositionMap,
	/**
	 * Parse search position map from context text.
	 * Extracts position markers from formatted memory context.
	 */
	parseSearchPositionMapFromContext,
	/**
	 * Record outcome of a response for memory scoring.
	 * Analyzes user follow-up to determine if memories helped.
	 */
	recordResponseOutcome,
	/**
	 * Store working memory from assistant response.
	 * Creates new memory items from the current interaction.
	 */
	storeWorkingMemory,
	/**
	 * Get memory ID from search position number.
	 * Used to look up which memory corresponds to a position marker.
	 */
	getMemoryIdByPosition,
	/**
	 * Record selective outcomes for specific memories.
	 * Applies targeted scoring based on attribution markers.
	 */
	recordSelectiveOutcomes,
	/**
	 * Process response with basic attribution.
	 * Extracts memory marks and records outcomes.
	 */
	processResponseWithAttribution,
	/**
	 * Process response with full attribution (Finding 13).
	 * Includes inference fallback and comprehensive scoring matrix.
	 * Enable via MEMORY_FULL_ATTRIBUTION_ENABLED=true
	 */
	processResponseWithFullAttribution,
	/**
	 * Parse memory marks from response text.
	 * Extracts <!-- MEM: 1👍 2👎 --> style markers.
	 */
	parseMemoryMarks,
	/**
	 * Build surfaced memories collection from search results.
	 * Creates a lookup structure for attribution tracking.
	 */
	buildSurfacedMemories,
	/**
	 * Infer which memory positions were used in response.
	 * Fallback when explicit marks are not present.
	 */
	inferUsedPositions,
	/**
	 * Detect basic outcome from user follow-up.
	 * Classifies as positive, negative, or neutral.
	 */
	detectBasicOutcome,
	/**
	 * Extract document IDs from search position map for scoring.
	 * Used to identify which memories to update.
	 */
	extractDocIdsForScoring,
	/** Scoring matrix for memory attribution outcomes */
	SCORING_MATRIX,
	/**
	 * Get scoring action from explicit mark and inferred presence.
	 * Combines LLM attribution with inference fallback.
	 */
	getScoringAction,
} from "./memoryIntegration";

// ============================================================================
// Tool Filtering & Gating (Consolidated - Finding 12)
// ============================================================================

// NOTE: shouldAllowTool and filterToolsByConfidence were removed in Finding 12.
// Tool gating is now handled exclusively by decideToolGating() below.

export {
	/**
	 * Get confidence hint for prompt (HIGH/MEDIUM/LOW).
	 * Based on retrieval confidence from memory search.
	 */
	getConfidencePromptHint,
	/**
	 * Get contextual guidance from memory system.
	 * Includes past experiences, failure warnings, and suggestions.
	 */
	getContextualGuidance,
	/**
	 * Format contextual guidance into prompt text.
	 * Converts guidance data into natural language instructions.
	 */
	formatContextualGuidancePrompt,
	/**
	 * Get tool guidance from action effectiveness KG.
	 * Returns which tools work best for the current context type.
	 */
	getToolGuidance,
	/**
	 * Record outcome of a single tool action.
	 * Updates action effectiveness statistics.
	 */
	recordToolActionOutcome,
	/**
	 * Record multiple tool action outcomes in batch.
	 * Efficient bulk update for multi-tool interactions.
	 */
	recordToolActionsInBatch,
	/**
	 * Extract explicit tool request from user query.
	 * Detects patterns like "use X tool" or "search with Y".
	 */
	extractExplicitToolRequest,
	/**
	 * Check if memory bank tool is available in tool list.
	 * Used to determine if user can save facts to memory.
	 */
	hasMemoryBankTool,
} from "./memoryIntegration";

// ============================================================================
// Formatting & Bilingual Support
// ============================================================================

export {
	/**
	 * Get attribution instruction in specified language.
	 * Returns the <!-- MEM: --> format explanation.
	 */
	getAttributionInstruction,
	/**
	 * Get memory bank philosophy text.
	 * Explains the purpose and use of memory bank to the LLM.
	 */
	getMemoryBankPhilosophy,
	/**
	 * Format memory context for prompt injection.
	 * Combines memories into a readable section.
	 */
	formatMemoryContext,
	/**
	 * Format goal reminder text.
	 * Creates the "remember to X" section for prompts.
	 */
	formatGoalReminder,
	/**
	 * Format error message in appropriate language.
	 * Creates user-friendly error descriptions.
	 */
	formatMemoryError,
	/**
	 * Wrap text with appropriate direction marker.
	 * Adds RTL/LTR spans based on content language.
	 */
	wrapTextWithDirection,
	/**
	 * Detect language of text content.
	 * Returns 'he', 'en', or 'mixed'.
	 */
	detectTextLanguage,
	/**
	 * Merge multiple prompt sections into final prompt.
	 * Combines personality, memory, and guidance sections.
	 */
	mergePromptSections,
	/**
	 * Render memory prompt using template engine.
	 * Applies Handlebars templates with context data.
	 */
	renderMemoryPrompt,
	/**
	 * Render template with full prompt context.
	 * High-level API for template-based prompts.
	 */
	renderTemplatePrompt,
	/**
	 * Render bilingual template with both languages.
	 * Generates Hebrew and English versions.
	 */
	renderBilingualTemplate,
	/**
	 * Render memory injection template.
	 * Formats memory context for system prompt.
	 */
	renderMemoryInjection,
	/**
	 * Render failure prevention template.
	 * Formats past failure warnings.
	 */
	renderFailurePrevention,
	/**
	 * List available templates in template directory.
	 * Returns array of template names.
	 */
	listAvailableTemplates,
	/** Attribution instruction for English prompts */
	MEMORY_ATTRIBUTION_INSTRUCTION,
	/** Attribution instruction for Hebrew prompts */
	MEMORY_ATTRIBUTION_INSTRUCTION_HE,
	/** Memory bank philosophy for English prompts */
	MEMORY_BANK_PHILOSOPHY,
	/** Memory bank philosophy for Hebrew prompts */
	MEMORY_BANK_PHILOSOPHY_HE,
} from "./memoryIntegration";

// ============================================================================
// Run Flow (Main Orchestrator)
// ============================================================================

export { runMcpFlow } from "./runMcpFlow";

// ============================================================================
// Tool Services
// ============================================================================

export {
	filterToolsByIntent,
	extractUserQuery,
	clearToolFilterCache,
	detectDataGovIntent,
	identifyToolMcp,
} from "./toolFilter";
export type { ToolFilterOptions } from "./toolFilter";
export { LoopDetector } from "./loopDetector";
export {
	container,
	ServiceContainer,
	SERVICE_KEYS,
	getToolFilterService,
	getLoopDetectorService,
	getClientPoolService,
	getUrlValidationService,
	getArgumentSanitizationService,
	getLoggingService,
	initializeServiceContainer,
} from "./serviceContainer";
export type {
	IToolFilterService,
	ILoopDetectorService,
	IClientPoolService,
	IUrlValidationService,
	IArgumentSanitizationService,
	ILoggingService,
} from "./serviceContainer";

// ============================================================================
// Tool Gating Decision (Single Source of Truth - Finding 12)
// ============================================================================

export {
	/**
	 * Central decision function for tool gating.
	 * This is the ONLY authoritative implementation for tool gating.
	 *
	 * Rule Priority (evaluated in order):
	 * 1. Fail-open: If memoryDegraded=true, allow all tools
	 * 2. Explicit override: If user explicitly requested a tool, allow all
	 * 3. Research intent: If Hebrew "מחקר" detected, allow all
	 * 4. High confidence: If confidence='high' + 3+ results, reduce external tools
	 * 5. Default: Allow all tools
	 */
	decideToolGating,
	/** Tools that require explicit user request (dangerous operations) */
	RESTRICTED_TOOLS,
} from "./toolGatingDecision";
export type {
	/** Input parameters for tool gating decision */
	ToolGatingInput,
	/** Output from tool gating decision with trace info */
	ToolGatingOutput,
	/** Minimal tool definition for gating decisions */
	ToolDefinition,
	/** Reason codes for tool gating decisions */
	ToolGatingReasonCode,
} from "./toolGatingDecision";
