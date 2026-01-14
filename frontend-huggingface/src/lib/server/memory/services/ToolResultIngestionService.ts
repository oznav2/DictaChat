/**
 * Tool Result Ingestion Service
 *
 * Phase 2 (+16): Ingest Tool Results into Memory
 * Kimi Enterprise Requirement K.2: Async Ingestion Protocol
 *
 * Stores valuable tool outputs (search results, research findings, data queries)
 * in memory for future retrieval. This prevents re-researching the same topics.
 *
 * Design Principles:
 * - Fire-and-forget: NEVER blocks user response path
 * - Deduplication: Content hash prevents duplicate storage
 * - Store-then-embed: Items stored immediately with needs_reindex=true
 * - Quality filtering: Only ingest substantial, valuable results
 *
 * Reference: codespace_gaps_enhanced.md Phase 2, codespace_priorities.md TIER 3
 */

import { createHash } from "crypto";
import { logger } from "$lib/server/logger";
import { UnifiedMemoryFacade } from "../UnifiedMemoryFacade";
import type { MemoryTier } from "../types";

// ============================================
// Tool Categories for Ingestion Eligibility
// ============================================

/**
 * Tools whose results should be ingested into memory.
 * These produce valuable research/data that can be reused.
 */
const INGESTIBLE_TOOLS = new Set([
	// Research tools - valuable findings
	"perplexity-ask",
	"perplexity-search",
	"perplexity-research",
	"perplexity-reason",
	"perplexity_ask",
	"perplexity_search",
	"perplexity_research",
	"perplexity_reason",

	// Web search tools - factual information
	"tavily-search",
	"tavily-extract",
	"tavily_search",
	"tavily_extract",
	"brave_search",
	"duckduckgo_search",
	"web_search",
	"search", // Context7

	// Government data tools - structured data
	"datagov_query",
	"datagov_resource_map",
	"datastore_search",
	"package_search",
	"package_show",
]);

/**
 * Tools that should NEVER be ingested.
 * Either they produce transient data or are already handled elsewhere.
 */
const NON_INGESTIBLE_TOOLS = new Set([
	// Docling - already has dedicated bridge in toolInvocation.ts
	"docling_convert",
	"docling_convert_url",
	"docling_ocr",
	"docling_extract_tables",
	"docling_extract_images",
	"docling_analyze",
	"docling_status",
	"docling_list_formats",

	// Memory tools - circular dependency
	"add_to_memory_bank",
	"search_memory",
	"recall_memory",

	// Utility tools - no persistent value
	"echo",
	"add",
	"printEnv",
	"sampleLLM",
	"longRunningOperation",

	// File operations - ephemeral
	"read_file",
	"write_file",
	"edit_file",
	"list_directory",
	"directory_tree",
]);

// ============================================
// Types
// ============================================

export interface ToolResultIngestionParams {
	/** Conversation ID for context tracking */
	conversationId: string;
	/** Name of the tool that produced the result */
	toolName: string;
	/** Original query/prompt sent to the tool */
	query?: string;
	/** Tool output to potentially ingest */
	output: string;
	/** Additional metadata about the tool call */
	metadata?: Record<string, unknown>;
}

export interface IngestionResult {
	/** Whether ingestion was attempted */
	attempted: boolean;
	/** Whether content was actually stored (not duplicate) */
	stored: boolean;
	/** Memory ID if stored */
	memoryId?: string;
	/** Reason if not stored */
	reason?: string;
}

// ============================================
// Configuration
// ============================================

const CONFIG = {
	/** Minimum output length to be considered for ingestion (chars) */
	minOutputLength: 100,
	/** Maximum output length before truncation (chars) */
	maxOutputLength: 10000,
	/** Short hash length for dedup */
	shortHashLength: 16,
	/** Content hash for dedup uses first N chars */
	hashContentLength: 5000,
};

// ============================================
// Service Class
// ============================================

/**
 * Tool Result Ingestion Service
 *
 * Handles fire-and-forget ingestion of tool results into memory.
 * All operations are async and non-blocking.
 */
export class ToolResultIngestionService {
	private static instance: ToolResultIngestionService | null = null;

	/**
	 * Get singleton instance.
	 * Creates instance if not exists.
	 */
	static getInstance(): ToolResultIngestionService {
		if (!ToolResultIngestionService.instance) {
			ToolResultIngestionService.instance = new ToolResultIngestionService();
		}
		return ToolResultIngestionService.instance;
	}

	/**
	 * Check if a tool's results should be ingested.
	 *
	 * @param toolName - Name of the tool
	 * @returns true if tool results should be ingested
	 */
	shouldIngest(toolName: string): boolean {
		// Normalize tool name (handle both dash and underscore variants)
		const normalized = toolName.toLowerCase();

		// Explicit exclusion takes priority
		if (NON_INGESTIBLE_TOOLS.has(normalized)) {
			return false;
		}

		// Check explicit inclusion
		if (INGESTIBLE_TOOLS.has(normalized)) {
			return true;
		}

		// Default: don't ingest unknown tools
		return false;
	}

	/**
	 * Ingest a tool result into memory.
	 *
	 * This is a fire-and-forget operation that:
	 * 1. Validates the output is worth storing
	 * 2. Checks for duplicate content
	 * 3. Stores in working tier with tool metadata
	 *
	 * @param params - Ingestion parameters
	 * @returns Result indicating whether content was stored
	 */
	async ingestToolResult(params: ToolResultIngestionParams): Promise<IngestionResult> {
		const { conversationId, toolName, query, output, metadata } = params;

		// Validate tool eligibility
		if (!this.shouldIngest(toolName)) {
			return {
				attempted: false,
				stored: false,
				reason: `Tool ${toolName} is not eligible for ingestion`,
			};
		}

		// Validate output quality
		if (!output || output.trim().length < CONFIG.minOutputLength) {
			return {
				attempted: false,
				stored: false,
				reason: "Output too short or empty",
			};
		}

		// Get facade instance
		const facade = UnifiedMemoryFacade.getInstance();
		if (!facade.isInitialized()) {
			logger.warn("[toolIngestion] Memory system not initialized, skipping ingestion");
			return {
				attempted: false,
				stored: false,
				reason: "Memory system not initialized",
			};
		}

		try {
			// Calculate content hash for deduplication
			const contentForHash = output.trim().slice(0, CONFIG.hashContentLength);
			const contentHash = createHash("sha256").update(contentForHash).digest("hex");
			const shortHash = contentHash.slice(0, CONFIG.shortHashLength);

			// Check if content already exists via hash lookup
			// This reuses the document hash pattern from Phase 4
			const isDuplicate = await this.checkDuplicate(contentHash);
			if (isDuplicate) {
				logger.debug(
					{ toolName, contentHash: shortHash, conversationId },
					"[toolIngestion] Duplicate content detected, skipping storage"
				);
				return {
					attempted: true,
					stored: false,
					reason: "Duplicate content already in memory",
				};
			}

			// Prepare text for storage (truncate if needed)
			const textToStore = output.trim().slice(0, CONFIG.maxOutputLength);

			// Build title from query or tool name
			const title = query
				? `${toolName}: ${query.slice(0, 100)}${query.length > 100 ? "..." : ""}`
				: `Result from ${toolName}`;

			// Store in working tier with tool metadata
			// Phase K.2: Uses needs_reindex pattern for async embedding
			const result = await facade.store({
				userId: "ADMIN_USER_ID", // Tool results are system-level
				tier: "working" as MemoryTier,
				text: textToStore,
				metadata: {
					// Tool identification
					tool_name: toolName,
					tool_query: query ?? null,
					tool_category: this.getToolCategory(toolName),

					// Deduplication
					content_hash: contentHash,

					// Context
					conversation_id: conversationId,
					source_type: "tool_result",
					title,

					// Additional metadata passed by caller
					...metadata,
				},
				importance: 0.6, // Tool results are moderately important
				confidence: 0.7, // High confidence in tool outputs
				source: {
					type: "tool",
					toolName,
				},
			});

			logger.info(
				{
					toolName,
					conversationId,
					memoryId: result.memory_id,
					contentHash: shortHash,
					textLength: textToStore.length,
				},
				"[toolIngestion] Tool result ingested into memory"
			);

			return {
				attempted: true,
				stored: true,
				memoryId: result.memory_id,
			};
		} catch (err) {
			// Fire-and-forget: log error but don't throw
			logger.error(
				{ err, toolName, conversationId },
				"[toolIngestion] Failed to ingest tool result (non-blocking)"
			);
			return {
				attempted: true,
				stored: false,
				reason: `Ingestion error: ${String(err)}`,
			};
		}
	}

	/**
	 * Check if content already exists in memory via hash.
	 *
	 * @param contentHash - SHA-256 hash of content
	 * @returns true if duplicate exists
	 */
	private async checkDuplicate(contentHash: string): Promise<boolean> {
		try {
			const facade = UnifiedMemoryFacade.getInstance();

			// Search for existing content with same hash
			// This is a lightweight check that doesn't load full content
			const searchResult = await facade.search({
				userId: "ADMIN_USER_ID",
				query: `content_hash:${contentHash.slice(0, 16)}`,
				limit: 1,
				tiers: ["working"],
			});

			// If we find any result with matching hash, it's a duplicate
			// Note: This is a heuristic - full hash match would be more precise
			return (searchResult.results?.length ?? 0) > 0;
		} catch {
			// On error, assume not duplicate (fail-open)
			return false;
		}
	}

	/**
	 * Get tool category for metadata.
	 *
	 * @param toolName - Name of the tool
	 * @returns Category string
	 */
	private getToolCategory(toolName: string): string {
		const normalized = toolName.toLowerCase();

		if (normalized.includes("perplexity")) return "research";
		if (normalized.includes("tavily")) return "search";
		if (normalized.includes("datagov") || normalized.includes("datastore")) return "government_data";
		if (normalized.includes("brave") || normalized.includes("duckduckgo")) return "search";

		return "unknown";
	}
}

// ============================================
// Convenience Export
// ============================================

/**
 * Fire-and-forget ingestion of tool result.
 * Use this from toolInvocation.ts for non-blocking ingestion.
 *
 * @param params - Ingestion parameters
 */
export function ingestToolResult(params: ToolResultIngestionParams): void {
	// Truly fire-and-forget: don't await, catch errors
	ToolResultIngestionService.getInstance()
		.ingestToolResult(params)
		.catch((err) => {
			logger.error({ err, toolName: params.toolName }, "[toolIngestion] Fire-and-forget ingestion failed");
		});
}
