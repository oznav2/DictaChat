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
 * Enhanced Features (Tool Result Ingestion Enhancement):
 * - Tool-specific summary strategies with heuristic extraction
 * - Entity extraction for KG integration (200ms timeout)
 * - Document linking for related document discovery
 * - UI event emission for processing progress
 *
 * Reference: codespace_gaps_enhanced.md Phase 2, codespace_priorities.md TIER 3
 */

import { createHash } from "crypto";
import { logger } from "$lib/server/logger";
import { UnifiedMemoryFacade } from "../UnifiedMemoryFacade";
import { getMemoryFeatureFlags } from "../featureFlags";
import type { MemoryTier } from "../types";
import { ADMIN_USER_ID } from "$lib/server/constants";
import {
	MessageUpdateType,
	MessageMemoryUpdateType,
	type MessageUpdate,
	type MessageMemoryToolIngestingUpdate,
} from "$lib/types/MessageUpdate";

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
// Tool-Specific Summary Configuration
// ============================================

/**
 * Configuration for tool-specific summary extraction.
 * Each tool type has optimized settings for content extraction.
 */
interface ToolSummaryConfig {
	/** Maximum summary length in characters */
	maxLen: number;
	/** Whether to extract headline-style content (** or # prefixed) */
	extractHeadlines: boolean;
	/** Maximum number of sentences to extract */
	maxSentences: number;
}

const TOOL_SUMMARY_CONFIG: Record<string, ToolSummaryConfig> = {
	perplexity: { maxLen: 500, extractHeadlines: true, maxSentences: 5 },
	tavily: { maxLen: 500, extractHeadlines: true, maxSentences: 5 },
	datagov: { maxLen: 300, extractHeadlines: false, maxSentences: 3 },
	youtube: { maxLen: 400, extractHeadlines: true, maxSentences: 4 },
	fetch: { maxLen: 400, extractHeadlines: true, maxSentences: 4 },
	brave: { maxLen: 400, extractHeadlines: true, maxSentences: 4 },
	duckduckgo: { maxLen: 400, extractHeadlines: true, maxSentences: 4 },
	search: { maxLen: 400, extractHeadlines: true, maxSentences: 4 },
};

const DEFAULT_SUMMARY_CONFIG: ToolSummaryConfig = {
	maxLen: 400,
	extractHeadlines: true,
	maxSentences: 4,
};

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
	/** Optional callback for UI event emission */
	emitUpdate?: (update: MessageUpdate) => void;
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

export interface EnhancedIngestionResult extends IngestionResult {
	/** Heuristic summary of the tool output */
	summary?: string;
	/** Number of entities extracted */
	entitiesExtracted?: number;
	/** IDs of linked documents */
	linkedDocuments?: string[];
	/** Total latency in milliseconds */
	latencyMs?: number;
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

	// ============================================
	// Enhanced Ingestion Methods (Tool Result Enhancement)
	// ============================================

	/**
	 * Get tool-specific summary configuration.
	 */
	private getToolConfig(toolName: string): ToolSummaryConfig {
		const normalized = toolName.toLowerCase();

		// Match by prefix to handle variants like perplexity-ask, tavily-search
		for (const [key, config] of Object.entries(TOOL_SUMMARY_CONFIG)) {
			if (normalized.includes(key)) {
				return config;
			}
		}

		return DEFAULT_SUMMARY_CONFIG;
	}

	/**
	 * Extract a heuristic summary from tool output.
	 * Uses regex-based extraction (no LLM) for speed (<50ms).
	 *
	 * Strategy:
	 * 1. Extract headlines (** or # prefixed lines) if configured
	 * 2. Extract first N sentences
	 * 3. Truncate to maxLen
	 */
	extractHeuristicSummary(toolName: string, output: string): string {
		const config = this.getToolConfig(toolName);
		const lines = output.split("\n").filter((l) => l.trim().length > 0);
		const parts: string[] = [];

		// Extract headlines if configured
		if (config.extractHeadlines) {
			for (const line of lines) {
				const trimmed = line.trim();
				// Match markdown headers or bold text
				if (
					trimmed.startsWith("# ") ||
					trimmed.startsWith("## ") ||
					trimmed.startsWith("**") ||
					trimmed.startsWith("- **")
				) {
					// Clean up the headline
					const cleaned = trimmed
						.replace(/^#+\s*/, "")
						.replace(/^\*\*/, "")
						.replace(/\*\*$/, "")
						.replace(/^-\s*\*\*/, "")
						.trim();
					if (cleaned.length > 5 && cleaned.length < 200) {
						parts.push(cleaned);
					}
				}
				// Stop after 5 headlines
				if (parts.length >= 5) break;
			}
		}

		// Extract first N sentences from non-headline content
		const textContent = lines
			.filter((l) => !l.trim().startsWith("#") && !l.trim().startsWith("**"))
			.join(" ");

		// Simple sentence extraction (split on . ! ?)
		const sentences = textContent.match(/[^.!?]+[.!?]+/g) ?? [];
		const sentencesToAdd = config.maxSentences - parts.length;
		if (sentencesToAdd > 0) {
			for (let i = 0; i < Math.min(sentencesToAdd, sentences.length); i++) {
				const sentence = sentences[i].trim();
				if (sentence.length > 10 && sentence.length < 300) {
					parts.push(sentence);
				}
			}
		}

		// Join and truncate
		let summary = parts.join(" ").trim();
		if (summary.length > config.maxLen) {
			summary = summary.slice(0, config.maxLen - 3) + "...";
		}

		// Fallback: first N chars of output if no summary extracted
		if (summary.length < 20) {
			summary = output.slice(0, config.maxLen).trim();
			if (output.length > config.maxLen) {
				summary = summary.slice(0, config.maxLen - 3) + "...";
			}
		}

		return summary;
	}

	/**
	 * Extract entities from text with timeout protection.
	 * Uses heuristic extraction (same pattern as KnowledgeGraphService).
	 *
	 * @param text - Text to extract entities from
	 * @param timeoutMs - Maximum time to wait (default 200ms)
	 * @returns Array of entity labels (empty on timeout/error)
	 */
	async extractEntitiesWithTimeout(text: string, timeoutMs: number = 200): Promise<string[]> {
		const flags = getMemoryFeatureFlags();
		if (!flags.enableKg) {
			return [];
		}

		try {
			// Race between extraction and timeout
			const extractionPromise = Promise.resolve().then(() => {
				return this.extractEntitiesHeuristic(text);
			});

			const timeoutPromise = new Promise<string[]>((resolve) => {
				setTimeout(() => resolve([]), timeoutMs);
			});

			return await Promise.race([extractionPromise, timeoutPromise]);
		} catch (err) {
			logger.warn({ err }, "[toolIngestion] Entity extraction failed (graceful skip)");
			return [];
		}
	}

	/**
	 * Heuristic entity extraction (same pattern as KnowledgeGraphService.extractEntities).
	 * Extracts capitalized words and Hebrew terms.
	 */
	private extractEntitiesHeuristic(text: string): string[] {
		const entities: string[] = [];
		const seen = new Set<string>();

		// Common words to exclude
		const commonWords = new Set([
			"The",
			"This",
			"That",
			"These",
			"Those",
			"What",
			"When",
			"Where",
			"Which",
			"Who",
			"Why",
			"How",
			"And",
			"But",
			"For",
			"With",
			"From",
			"About",
			"Into",
			"Through",
			"During",
			"Before",
			"After",
			"Above",
			"Below",
			"Between",
			"Under",
			"Again",
			"Further",
			"Then",
			"Once",
			"Here",
			"There",
			"All",
			"Each",
			"Few",
			"More",
			"Most",
			"Other",
			"Some",
			"Such",
			"Only",
			"Same",
			"Than",
			"Too",
			"Very",
			"Just",
			"Also",
			"Now",
			"New",
			"First",
			"Last",
			"Long",
			"Great",
			"Little",
			"Own",
			"Next",
			"Right",
			"Big",
			"High",
			"Different",
			"Small",
			"Large",
			"Early",
			"Young",
			"Important",
			"Public",
			"Bad",
			"Good",
		]);

		// Word-based extraction: split on whitespace and extract individual capitalized words
		const words = text.split(/\s+/);
		for (const word of words) {
			// Clean punctuation from word edges
			const cleanWord = word.replace(/^[^\w\u0590-\u05FF]+|[^\w\u0590-\u05FF]+$/g, "");
			if (cleanWord.length <= 2) continue;

			// Check for English capitalized words (including CamelCase like TypeScript, JavaScript)
			if (
				/^[A-Z][a-zA-Z]*$/.test(cleanWord) &&
				!commonWords.has(cleanWord) &&
				!seen.has(cleanWord)
			) {
				seen.add(cleanWord);
				entities.push(cleanWord);
			}
		}

		// Extract Hebrew words (individual words, not phrases)
		const hebrewPattern = /[\u0590-\u05FF]+/g;
		const hebrewMatches = text.match(hebrewPattern) ?? [];

		for (const match of hebrewMatches) {
			const clean = match.replace(/^[^\u0590-\u05FF]+|[^\u0590-\u05FF]+$/g, "");
			if (clean.length > 2 && !commonWords.has(clean) && !seen.has(clean)) {
				seen.add(clean);
				entities.push(clean);
			}
		}

		return entities.slice(0, 10); // Limit to 10 entities
	}

	/**
	 * Link tool result to related documents in memory.
	 * Queries documents tier for entity overlap.
	 *
	 * @param entities - Entities extracted from tool result
	 * @param timeoutMs - Maximum time to wait (default 50ms)
	 * @returns Array of linked document IDs
	 */
	async linkToRelatedDocuments(entities: string[], timeoutMs: number = 50): Promise<string[]> {
		if (entities.length === 0) {
			return [];
		}

		try {
			const { Database } = await import("$lib/server/database");
			const db = await Database.getInstance();
			const client = db.getClient();
			const kgEdges = client.db("chat-ui").collection("kg_edges");

			// Query for documents that share entities with this tool result
			const linkPromise = kgEdges
				.find(
					{
						user_id: ADMIN_USER_ID,
						source_label: { $in: entities },
						target_type: "memory",
					},
					{ projection: { target_id: 1 }, limit: 5 }
				)
				.toArray()
				.then((edges) => edges.map((e) => e.target_id as string).filter(Boolean));

			const timeoutPromise = new Promise<string[]>((resolve) => {
				setTimeout(() => resolve([]), timeoutMs);
			});

			return await Promise.race([linkPromise, timeoutPromise]);
		} catch (err) {
			logger.warn({ err }, "[toolIngestion] Document linking failed (graceful skip)");
			return [];
		}
	}

	/**
	 * Enhanced ingestion with summary, entity extraction, and document linking.
	 * Emits UI events for progress tracking.
	 *
	 * Performance budget:
	 * - Summary extraction: 50ms (heuristic, no LLM)
	 * - Entity extraction: 200ms (with timeout)
	 * - Document linking: 50ms (with timeout)
	 * - Storage: 100ms
	 * - Total: <500ms
	 */
	async ingestToolResultEnhanced(
		params: ToolResultIngestionParams
	): Promise<EnhancedIngestionResult> {
		const startTime = Date.now();
		const { conversationId, toolName, query, output, metadata, emitUpdate } = params;

		const flags = getMemoryFeatureFlags();
		if (!flags.toolResultIngestionEnabled) {
			return {
				attempted: false,
				stored: false,
				reason: "Tool result ingestion is disabled by feature flag",
			};
		}

		// Enhanced ingestion requires the enhanced flag
		if (!flags.toolResultEnhancedIngestionEnabled) {
			// Fall back to basic ingestion
			return this.ingestToolResult(params);
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
			return {
				attempted: false,
				stored: false,
				reason: "Output too short or empty",
			};
		}

		// Get facade instance
		const facade = UnifiedMemoryFacade.getInstance();
		if (!facade.isInitialized()) {
			return {
				attempted: false,
				stored: false,
				reason: "Memory system not initialized",
			};
		}

		// Helper to emit tool ingestion updates
		const emitToolIngestion = (
			stage: MessageMemoryToolIngestingUpdate["stage"],
			extras?: { entitiesExtracted?: number; linkedDocuments?: number }
		) => {
			if (!emitUpdate) return;
			const update: MessageMemoryToolIngestingUpdate = {
				type: MessageUpdateType.Memory,
				subtype: MessageMemoryUpdateType.ToolIngesting,
				toolName,
				stage,
				...extras,
			};
			emitUpdate(update);
		};

		try {
			const normalizedToolName = toolName.toLowerCase();
			const toolCategory = this.getToolCategory(normalizedToolName);

			// Emit: summarizing stage
			emitToolIngestion("summarizing");

			// Step 1: Generate heuristic summary (sync, <50ms)
			const sanitizedOutput = sanitizeToolOutput(output);
			const summary = this.extractHeuristicSummary(normalizedToolName, sanitizedOutput);

			// Emit: extracting stage
			emitToolIngestion("extracting");

			// Step 2: Extract entities with timeout (200ms max)
			const entities = await this.extractEntitiesWithTimeout(sanitizedOutput, 200);

			// Emit: linking stage
			emitToolIngestion("linking", { entitiesExtracted: entities.length });

			// Step 3: Link to related documents (50ms max)
			const linkedDocuments = await this.linkToRelatedDocuments(entities, 50);

			// Check for duplicates
			const contentForHash = sanitizedOutput.trim().slice(0, CONFIG.hashContentLength);
			const contentHash = createHash("sha256").update(contentForHash).digest("hex");
			const shortHash = contentHash.slice(0, CONFIG.shortHashLength);

			const isDuplicate = await this.checkDuplicate({
				toolName: normalizedToolName,
				shortHash,
			});

			if (isDuplicate) {
				emitToolIngestion("completed", {
					entitiesExtracted: entities.length,
					linkedDocuments: linkedDocuments.length,
				});

				return {
					attempted: true,
					stored: false,
					reason: "Duplicate content already in memory",
					summary,
					entitiesExtracted: entities.length,
					linkedDocuments,
					latencyMs: Date.now() - startTime,
				};
			}

			// Emit: storing stage
			emitToolIngestion("storing", {
				entitiesExtracted: entities.length,
				linkedDocuments: linkedDocuments.length,
			});

			// Step 4: Store with summary and entity tags
			const textToStore = sanitizedOutput.trim().slice(0, CONFIG.maxOutputLength);
			const title = query
				? `${toolName}: ${query.slice(0, 100)}${query.length > 100 ? "..." : ""}`
				: `Result from ${toolName}`;

			// Build tags including entities
			const tags = buildToolTags({
				toolName: normalizedToolName,
				category: toolCategory,
				shortHash,
				conversationId,
			});

			// Add entity tags (limit to 5 to avoid tag bloat)
			for (const entity of entities.slice(0, 5)) {
				tags.push(`entity:${entity.toLowerCase()}`);
			}

			// Add linked document tags
			for (const docId of linkedDocuments.slice(0, 3)) {
				tags.push(`linked_doc:${docId}`);
			}

			// Build description with summary for better searchability
			const enhancedDescription = summary
				? `${title} | Summary: ${summary.slice(0, 150)}`
				: title;

			const result = await facade.store({
				userId: ADMIN_USER_ID,
				tier: "working" as MemoryTier,
				text: textToStore,
				tags,
				importance: 0.6,
				confidence: 0.7,
				source: {
					type: "tool",
					tool_name: toolName,
					conversation_id: conversationId,
					description:
						typeof metadata?.description === "string" ? metadata.description : enhancedDescription,
					collected_at: new Date(),
				},
			});

			// Emit: completed stage
			emitToolIngestion("completed", {
				entitiesExtracted: entities.length,
				linkedDocuments: linkedDocuments.length,
			});

			logger.info("[toolIngestion] Enhanced ingestion completed", {
				toolName,
				memoryId: result.memory_id,
				summaryLen: summary.length,
				entitiesExtracted: entities.length,
				linkedDocuments: linkedDocuments.length,
				latencyMs: Date.now() - startTime,
			});

			return {
				attempted: true,
				stored: true,
				memoryId: result.memory_id,
				summary,
				entitiesExtracted: entities.length,
				linkedDocuments,
				latencyMs: Date.now() - startTime,
			};
		} catch (err) {
			logger.error("[toolIngestion] Enhanced ingestion failed (non-blocking)", {
				err,
				toolName,
				conversationId,
			});
			return {
				attempted: true,
				stored: false,
				reason: `Ingestion error: ${String(err)}`,
				latencyMs: Date.now() - startTime,
			};
		}
	}
}

// ============================================
// Convenience Export
// ============================================

/**
 * Fire-and-forget ingestion of tool result.
 * Use this from toolInvocation.ts for non-blocking ingestion.
 * Automatically uses enhanced ingestion when feature flag is enabled.
 *
 * @param params - Ingestion parameters
 */
export function ingestToolResult(params: ToolResultIngestionParams): void {
	const flags = getMemoryFeatureFlags();
	const service = ToolResultIngestionService.getInstance();

	// Use enhanced ingestion when flag is enabled
	const ingestionPromise = flags.toolResultEnhancedIngestionEnabled
		? service.ingestToolResultEnhanced(params)
		: service.ingestToolResult(params);

	// Truly fire-and-forget: don't await, catch errors
	ingestionPromise.catch((err) => {
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
