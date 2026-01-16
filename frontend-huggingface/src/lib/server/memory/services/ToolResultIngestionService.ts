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
import { getMemoryFeatureFlags } from "../featureFlags";
import type { MemoryTier } from "../types";
import { ADMIN_USER_ID } from "$lib/server/constants";

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

		const flags = getMemoryFeatureFlags();
		if (!flags.toolResultIngestionEnabled) {
			return {
				attempted: false,
				stored: false,
				reason: "Tool result ingestion is disabled by feature flag",
			};
		}

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
			logger.warn(
				{ toolName, reason: "output_too_short" },
				"[tool-ingest] Skipped - low quality output"
			);
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
			const normalizedToolName = toolName.toLowerCase();
			const toolCategory = this.getToolCategory(normalizedToolName);

			// Calculate content hash for deduplication
			const sanitizedOutput = sanitizeToolOutput(output);
			const contentForHash = sanitizedOutput.trim().slice(0, CONFIG.hashContentLength);
			const contentHash = createHash("sha256").update(contentForHash).digest("hex");
			const shortHash = contentHash.slice(0, CONFIG.shortHashLength);

			// Check if content already exists via hash lookup
			// This reuses the document hash pattern from Phase 4
			const isDuplicate = await this.checkDuplicate({
				toolName: normalizedToolName,
				shortHash,
			});
			if (isDuplicate) {
				logger.debug("[toolIngestion] Duplicate content detected, skipping storage", {
					toolName,
					contentHash: shortHash,
					conversationId,
				});
				return {
					attempted: true,
					stored: false,
					reason: "Duplicate content already in memory",
				};
			}

			// Prepare text for storage (truncate if needed)
			const textToStore = sanitizedOutput.trim().slice(0, CONFIG.maxOutputLength);

			logger.info(
				{ toolName, outputLength: sanitizedOutput.length, chunkCount: 1 },
				"[tool-ingest] Storing tool result"
			);

			// Build title from query or tool name
			const title = query
				? `${toolName}: ${query.slice(0, 100)}${query.length > 100 ? "..." : ""}`
				: `Result from ${toolName}`;

			// Store in working tier with tool metadata
			// Phase K.2: Uses needs_reindex pattern for async embedding
			const result = await facade.store({
				userId: ADMIN_USER_ID,
				tier: "working" as MemoryTier,
				text: textToStore,
				tags: buildToolTags({
					toolName: normalizedToolName,
					category: toolCategory,
					shortHash,
					conversationId,
				}),
				importance: 0.6, // Tool results are moderately important
				confidence: 0.7, // High confidence in tool outputs
				source: {
					type: "tool",
					tool_name: toolName,
					conversation_id: conversationId,
					description: typeof metadata?.description === "string" ? metadata.description : title,
					collected_at: new Date(),
				},
			});

			logger.info("[toolIngestion] Tool result ingested into memory", {
				toolName,
				conversationId,
				memoryId: result.memory_id,
				contentHash: shortHash,
				textLength: textToStore.length,
			});

			logger.info({ toolName, category: toolCategory }, "[tool-ingest] Stored result");

			return {
				attempted: true,
				stored: true,
				memoryId: result.memory_id,
			};
		} catch (err) {
			// Fire-and-forget: log error but don't throw
			logger.error("[toolIngestion] Failed to ingest tool result (non-blocking)", {
				err,
				toolName,
				conversationId,
			});
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
	private async checkDuplicate(params: { toolName: string; shortHash: string }): Promise<boolean> {
		try {
			const { Database } = await import("$lib/server/database");
			const db = await Database.getInstance();
			const client = db.getClient();
			const items = client.db("chat-ui").collection("memory_items");

			const existing = await items.findOne(
				{
					user_id: ADMIN_USER_ID,
					tier: "working",
					status: "active",
					"source.tool_name": params.toolName,
					tags: { $all: [`content_hash:${params.shortHash}`, `tool:${params.toolName}`] },
				},
				{ projection: { memory_id: 1 } }
			);

			return !!existing;
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
	private getToolCategory(
		toolName: string
	): "search" | "research" | "data" | "document" | "unknown" {
		const normalized = toolName.toLowerCase();

		if (normalized.includes("docling")) return "document";
		if (normalized.includes("perplexity")) return "research";
		if (normalized.includes("tavily")) return "search";
		if (normalized.includes("datagov") || normalized.includes("datastore")) return "data";
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
			logger.error("[toolIngestion] Fire-and-forget ingestion failed", {
				err,
				toolName: params.toolName,
			});
		});
}

function buildToolTags(params: {
	toolName: string;
	category: string;
	shortHash: string;
	conversationId: string;
}): string[] {
	const toolName = params.toolName.toLowerCase();
	const category = params.category.toLowerCase();

	return [
		`tool:${toolName}`,
		`tool_category:${category}`,
		`content_hash:${params.shortHash}`,
		`conversation:${params.conversationId}`,
	];
}

export function sanitizeToolOutput(text: string): string {
	let sanitized = text ?? "";

	sanitized = sanitized.replace(
		/data:[a-z]+[/][a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi,
		"[binary-data-removed]"
	);
	sanitized = sanitized.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, "[binary-data-removed]");

	sanitized = sanitized.replace(
		/\b(authorization)\s*:\s*bearer\s+[a-z0-9\-._~+/]+=*/gi,
		"authorization: Bearer [REDACTED]"
	);
	sanitized = sanitized.replace(/\bBearer\s+[a-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]");
	sanitized = sanitized.replace(/\b(x-api-key)\s*:\s*[^ \t\r\n]+/gi, "x-api-key: [REDACTED]");
	sanitized = sanitized.replace(
		/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token)\s*[:=]\s*["']?[^"'\s]+["']?/gi,
		"$1=[REDACTED]"
	);
	sanitized = sanitized.replace(/\b(cookie|set-cookie)\s*:\s*[^\r\n]+/gi, "$1: [REDACTED]");
	sanitized = sanitized.replace(
		/([?&](?:token|access_token|refresh_token|api_key|key|sig|signature)=)[^&\s]+/gi,
		"$1[REDACTED]"
	);

	sanitized = sanitized.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
	sanitized = sanitized.replace(/\+?[0-9][0-9()\s.-]{7,}[0-9]/g, (match) => {
		const digitCount = match.replace(/\D/g, "").length;
		return digitCount >= 9 ? "[REDACTED_PHONE]" : match;
	});

	sanitized = Array.from(sanitized)
		.filter((ch) => {
			const code = ch.charCodeAt(0);
			if (code <= 8) return false;
			if (code === 11 || code === 12) return false;
			if (code >= 14 && code <= 31) return false;
			if (code >= 127 && code <= 159) return false;
			return true;
		})
		.join("");

	return sanitized;
}
