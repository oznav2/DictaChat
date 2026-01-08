/**
 * SearchServiceImpl - Search service implementation for UnifiedMemoryFacade
 *
 * Wraps the hybrid SearchService and adds:
 * - Tier planning based on query analysis
 * - Sort mode detection (relevance/recency/score)
 * - Position tracking for record_response integration
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { MemoryTier, SearchResponse, SearchResult, SortBy } from "../types";
import type { SearchService as HybridSearchService } from "../search/SearchService";
import type { SearchService, SearchParams } from "../UnifiedMemoryFacade";

export interface SearchServiceImplConfig {
	hybridSearch: HybridSearchService;
	config?: MemoryConfig;
}

/**
 * Temporal keywords for auto-detecting recency queries
 */
const RECENCY_KEYWORDS = [
	"last",
	"recent",
	"yesterday",
	"today",
	"earlier",
	"previous",
	"before",
	"when did",
	"how long ago",
	"last time",
	"previously",
	"lately",
	"just now",
	// Hebrew equivalents
	"אחרון",
	"לאחרונה",
	"אתמול",
	"היום",
	"קודם",
	"מתי",
	"פעם אחרונה",
];

export class SearchServiceImpl implements SearchService {
	private hybridSearch: HybridSearchService;
	private config: MemoryConfig;

	// Per-turn tracking for record_response
	private searchPositionMap: Map<number, string> = new Map();
	private lastSearchResults: string[] = [];
	private lastQueryNormalized: string = "";

	constructor(params: SearchServiceImplConfig) {
		this.hybridSearch = params.hybridSearch;
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Search memories with hybrid retrieval
	 */
	async search(params: SearchParams): Promise<SearchResponse> {
		const startTime = Date.now();

		// Step 1: Determine tiers to search
		const tiers = this.resolveTiers(params.collections);

		// Step 2: Detect sort mode
		const sortBy = params.sortBy ?? this.detectSortMode(params.query);

		// Step 3: Execute hybrid search
		const response = await this.hybridSearch.search({
			userId: params.userId,
			query: params.query,
			tiers,
			limit: params.limit ?? this.config.caps.search_limit_default,
			enableRerank: true,
		});

		// Step 4: Apply sort mode
		let results = response.results;
		if (sortBy === "recency") {
			results = this.sortByRecency(results);
		} else if (sortBy === "score") {
			results = this.sortByScore(results);
		}
		// Default "relevance" uses the hybrid search ranking

		// Step 5: Update position tracking for record_response
		this.updatePositionTracking(params.query, results);

		const latencyMs = Date.now() - startTime;
		logger.debug(
			{
				userId: params.userId,
				query: params.query.slice(0, 50),
				resultCount: results.length,
				sortBy,
				latencyMs,
			},
			"Memory search completed"
		);

		return {
			results,
			debug: {
				...response.debug,
				stage_timings_ms: {
					...response.debug.stage_timings_ms,
					total_ms: latencyMs,
				},
			},
		};
	}

	/**
	 * Get the position map for the last search (for record_response)
	 */
	getSearchPositionMap(): Map<number, string> {
		return new Map(this.searchPositionMap);
	}

	/**
	 * Get the last search results (memory_ids)
	 */
	getLastSearchResults(): string[] {
		return [...this.lastSearchResults];
	}

	/**
	 * Get the last normalized query
	 */
	getLastQueryNormalized(): string {
		return this.lastQueryNormalized;
	}

	/**
	 * Clear per-turn tracking (call after record_response)
	 */
	clearTurnTracking(): void {
		this.searchPositionMap.clear();
		this.lastSearchResults = [];
		this.lastQueryNormalized = "";
	}

	/**
	 * Resolve tier specification to array of tiers
	 */
	private resolveTiers(collections?: MemoryTier[] | "all"): MemoryTier[] {
		if (!collections || collections === "all") {
			return ["working", "history", "patterns", "books", "memory_bank"];
		}
		return collections;
	}

	/**
	 * Auto-detect sort mode from query keywords
	 */
	private detectSortMode(query: string): SortBy {
		const lowerQuery = query.toLowerCase();

		for (const keyword of RECENCY_KEYWORDS) {
			if (lowerQuery.includes(keyword.toLowerCase())) {
				return "recency";
			}
		}

		return "relevance";
	}

	/**
	 * Sort results by recency (most recent first)
	 */
	private sortByRecency(results: SearchResult[]): SearchResult[] {
		return [...results].sort((a, b) => {
			const aTime = a.score_summary.updated_at ?? a.score_summary.created_at ?? "";
			const bTime = b.score_summary.updated_at ?? b.score_summary.created_at ?? "";
			return bTime.localeCompare(aTime);
		});
	}

	/**
	 * Sort results by learned effectiveness (Wilson score)
	 */
	private sortByScore(results: SearchResult[]): SearchResult[] {
		return [...results].sort((a, b) => {
			const aScore = a.score_summary.wilson_score ?? 0.5;
			const bScore = b.score_summary.wilson_score ?? 0.5;
			return bScore - aScore;
		});
	}

	/**
	 * Update position tracking for record_response integration
	 */
	private updatePositionTracking(query: string, results: SearchResult[]): void {
		this.searchPositionMap.clear();
		this.lastSearchResults = [];
		this.lastQueryNormalized = query;

		for (const result of results) {
			this.searchPositionMap.set(result.position, result.memory_id);
			this.lastSearchResults.push(result.memory_id);
		}
	}
}
