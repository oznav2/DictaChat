/**
 * search_memory Tool
 *
 * Unified search interface for the 5-tier memory system.
 * Supports hybrid retrieval with vector + lexical search.
 */

import { logger } from "$lib/server/logger";
import type { MemoryTier, SortBy, SearchResponse } from "../types";
import type { UnifiedMemoryFacade } from "../UnifiedMemoryFacade";

/**
 * Tool definition for LLM tool calling
 */
export const SEARCH_MEMORY_TOOL_DEFINITION = {
	name: "search_memory",
	description: `Search the user's memory system for relevant information.

Use this tool to:
- Find past conversations and learnings
- Look up user preferences and patterns
- Search through uploaded books/documents
- Recall facts and context from memory_bank

The memory system has 5 tiers:
- working: Recent cross-conversation insights
- history: Session-specific memories
- patterns: Learned behavioral patterns
- documents: Uploaded document content
- memory_bank: Permanent user knowledge

Results are numbered [1], [2], etc. Use these numbers in record_response to score which memories were helpful.`,
	inputSchema: {
		type: "object" as const,
		properties: {
			query: {
				type: "string",
				description: "The search query - what to look for in memory",
			},
			collections: {
				type: "array",
				items: {
					type: "string",
					enum: ["working", "history", "patterns", "documents", "memory_bank", "all"],
				},
				description:
					"Which memory tiers to search. Defaults to all. Use specific tiers for faster, focused results.",
			},
			limit: {
				type: "integer",
				minimum: 1,
				maximum: 20,
				description: "Maximum results to return (default: 5)",
			},
			sort_by: {
				type: "string",
				enum: ["relevance", "recency", "score"],
				description:
					"Sort mode: relevance (default), recency (newest first), or score (best performing first)",
			},
		},
		required: ["query"],
	},
};

/**
 * Input parameters for search_memory tool
 */
export interface SearchMemoryInput {
	query: string;
	collections?: string[];
	limit?: number;
	sort_by?: string;
}

/**
 * Output format for search_memory tool (LLM-friendly)
 */
export interface SearchMemoryOutput {
	success: boolean;
	results: Array<{
		position: number;
		tier: MemoryTier;
		memory_id: string;
		content: string;
		score: number;
		wilson_score?: number;
		uses?: number;
	}>;
	total_found: number;
	search_debug?: {
		confidence: string;
		fallbacks_used: string[];
		latency_ms: number;
	};
	error?: string;
}

/**
 * Execute search_memory tool
 */
export async function executeSearchMemory(
	facade: UnifiedMemoryFacade,
	userId: string,
	input: SearchMemoryInput
): Promise<SearchMemoryOutput> {
	const startTime = Date.now();

	try {
		// Validate input
		if (!input.query || input.query.trim().length === 0) {
			return {
				success: false,
				results: [],
				total_found: 0,
				error: "Query is required",
			};
		}

		// Resolve collections
		const collections = resolveCollections(input.collections);

		// Resolve sort mode
		const sortBy = resolveSortBy(input.sort_by);

		// Execute search
		const response: SearchResponse = await facade.search({
			userId,
			query: input.query.trim(),
			collections,
			limit: input.limit ?? 5,
			sortBy,
		});

		const latencyMs = Date.now() - startTime;

		logger.debug(
			{
				userId,
				query: input.query.slice(0, 50),
				resultCount: response.results.length,
				latencyMs,
			},
			"search_memory executed"
		);

		return {
			success: true,
			results: response.results.map((r) => ({
				position: r.position,
				tier: r.tier,
				memory_id: r.memory_id,
				content: r.content,
				score: r.score_summary.final_score,
				wilson_score: r.score_summary.wilson_score,
				uses: r.score_summary.uses,
			})),
			total_found: response.results.length,
			search_debug: {
				confidence: response.debug.confidence,
				fallbacks_used: response.debug.fallbacks_used,
				latency_ms: latencyMs,
			},
		};
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error({ err, userId, query: input.query?.slice(0, 50) }, "search_memory failed");

		return {
			success: false,
			results: [],
			total_found: 0,
			error: errorMessage,
		};
	}
}

/**
 * Resolve collections input to MemoryTier array
 */
function resolveCollections(collections?: string[]): MemoryTier[] | "all" {
	if (!collections || collections.length === 0) {
		return "all";
	}

	if (collections.includes("all")) {
		return "all";
	}

	const validTiers: MemoryTier[] = [];
	const tierSet = new Set(["working", "history", "patterns", "documents", "memory_bank"]);

	for (const c of collections) {
		if (tierSet.has(c)) {
			validTiers.push(c as MemoryTier);
		}
	}

	return validTiers.length > 0 ? validTiers : "all";
}

/**
 * Resolve sort_by input to SortBy type
 */
function resolveSortBy(sortBy?: string): SortBy {
	if (sortBy === "recency") return "recency";
	if (sortBy === "score") return "score";
	return "relevance";
}

/**
 * Format search results for LLM consumption
 */
export function formatSearchResultsForLLM(output: SearchMemoryOutput): string {
	if (!output.success) {
		return `Memory search failed: ${output.error}`;
	}

	if (output.results.length === 0) {
		return "No relevant memories found.";
	}

	const lines: string[] = [`Found ${output.total_found} relevant memories:\n`];

	for (const r of output.results) {
		lines.push(`[${r.position}] (${r.tier}) ${r.content}`);
		if (r.wilson_score !== undefined && r.uses !== undefined && r.uses > 0) {
			lines.push(`    Score: ${r.wilson_score.toFixed(2)} | Uses: ${r.uses}`);
		}
		lines.push("");
	}

	lines.push(
		"\nTip: Reference these by number (e.g., [1], [3]) in record_response to mark which were helpful."
	);

	return lines.join("\n");
}
