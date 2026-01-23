/**
 * SearchServiceImpl - Search service implementation for UnifiedMemoryFacade
 *
 * Wraps the hybrid SearchService and adds:
 * - Tier planning based on query analysis
 * - Sort mode detection (relevance/recency/score)
 * - Position tracking for record_response integration
 * - Bilingual query expansion (Hebrew ↔ English)
 * - Cross-personality search support
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import { memoryMetrics } from "../observability";
import type { MemoryTier, SearchResponse, SearchResult, SortBy } from "../types";
import type { ISearchService } from "../interfaces/ISearchService";
import type { SearchService as HybridSearchService } from "../search/SearchService";
import type { SearchParams } from "../UnifiedMemoryFacade";
import { findHebrewTranslation, findEnglishTranslation } from "../seed/bilingualEntities";
import { buildProblemHash } from "../utils/problemSignature";
import { getMemoryFeatureFlags } from "../featureFlags";
import {
	ContextualEmbeddingService,
	createContextualEmbeddingService,
} from "../ContextualEmbeddingService";

export interface SearchServiceImplConfig {
	hybridSearch: HybridSearchService;
	config?: MemoryConfig;
	/** MongoDB store for known solution lookup (optional) */
	mongoStore?: {
		getKnownSolution?: (userId: string, problemHash: string) => Promise<SearchResult | null>;
	};
	/** KnowledgeGraphService for entity boost (optional) */
	kgService?: {
		getEntityBoosts?: (
			userId: string,
			memoryIds: string[]
		) => Promise<Array<{ memory_id: string; boost: number; matched_entities: string[] }>>;
	};
	/** Optional contextual embedding service for LLM-enhanced retrieval */
	contextualEmbeddingService?: ContextualEmbeddingService;
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

export class SearchServiceImpl implements ISearchService {
	private hybridSearch: HybridSearchService;
	private config: MemoryConfig;
	private mongoStore: SearchServiceImplConfig["mongoStore"];
	private kgService: SearchServiceImplConfig["kgService"];
	private contextualEmbeddingService: ContextualEmbeddingService | null = null;

	// Per-turn tracking for record_response
	private searchPositionMap: Map<number, string> = new Map();
	private lastSearchResults: string[] = [];
	private lastQueryNormalized: string = "";
	private lastSearchTiers: MemoryTier[] = [];

	constructor(params: SearchServiceImplConfig) {
		this.hybridSearch = params.hybridSearch;
		this.config = params.config ?? defaultMemoryConfig;
		this.mongoStore = params.mongoStore;
		this.kgService = params.kgService;

		// Initialize contextual embedding if enabled via feature flag
		const flags = getMemoryFeatureFlags();
		if (flags.contextualEmbeddingEnabled) {
			this.contextualEmbeddingService =
				params.contextualEmbeddingService ??
				createContextualEmbeddingService({
					enabled: true,
					timeout_ms: 5000,
					cache_ttl_hours: 24,
				});
			logger.info("[SearchServiceImpl] ContextualEmbeddingService enabled");
		}
	}

	/**
	 * Hash problem signature for known solution lookup (Roampal pattern)
	 * Extracts key terms and creates a stable hash for caching
	 */
	private hashProblemSignature(query: string): string {
		return buildProblemHash(query);
	}

	/**
	 * Check for known solution before full search (Roampal pattern)
	 * Returns cached high-quality solution if found in patterns tier
	 */
	private async checkKnownSolution(userId: string, query: string): Promise<SearchResult | null> {
		if (!this.mongoStore?.getKnownSolution) {
			return null;
		}

		try {
			const problemHash = this.hashProblemSignature(query);
			const cachedSolution = await this.mongoStore.getKnownSolution(userId, problemHash);

			if (cachedSolution && (cachedSolution.score_summary.wilson_score ?? 0) > 0.8) {
				logger.debug(
					{ userId, problemHash, memoryId: cachedSolution.memory_id },
					"Known solution found (skipping full search)"
				);
				return cachedSolution;
			}
		} catch (err) {
			logger.warn({ err }, "Known solution lookup failed");
		}

		return null;
	}

	/**
	 * Apply entity boost from ContentKG (Roampal pattern)
	 * Boosts documents containing high-quality entities from the knowledge graph
	 */
	private async applyEntityBoosts(
		userId: string,
		results: SearchResult[]
	): Promise<SearchResult[]> {
		if (!this.kgService?.getEntityBoosts || results.length === 0) {
			return results;
		}

		try {
			const memoryIds = results.map((r) => r.memory_id);
			const boosts = await this.kgService.getEntityBoosts(userId, memoryIds);

			if (boosts.length === 0) {
				return results;
			}

			// Create boost lookup map
			const boostMap = new Map(boosts.map((b) => [b.memory_id, b]));

			// Apply boosts to results
			const boostedResults = results.map((result) => {
				const boost = boostMap.get(result.memory_id);
				if (boost) {
					const originalScore = result.score_summary.final_score ?? 0;
					const boostedScore = originalScore * (1 + boost.boost);

					return {
						...result,
						score_summary: {
							...result.score_summary,
							final_score: boostedScore,
							entity_boost: boost.boost,
						},
					};
				}
				return result;
			});

			const boostCount = boosts.length;
			if (boostCount > 0) {
				logger.debug({ userId, boostCount }, "Entity boosts applied from ContentKG");
			}

			return boostedResults;
		} catch (err) {
			logger.warn({ err }, "Entity boost application failed");
			return results;
		}
	}

	/**
	 * Expand query with bilingual translations
	 */
	private expandQueryBilingual(query: string): string[] {
		const queries = [query];

		// Try to find translations for query terms
		const words = query.split(/\s+/);
		for (const word of words) {
			// Try Hebrew → English
			const englishTranslation = findEnglishTranslation(word);
			if (englishTranslation && !queries.includes(englishTranslation)) {
				queries.push(query.replace(word, englishTranslation));
			}

			// Try English → Hebrew
			const hebrewTranslation = findHebrewTranslation(word);
			if (hebrewTranslation && !queries.includes(hebrewTranslation)) {
				queries.push(query.replace(word, hebrewTranslation));
			}
		}

		// Also try whole query translation
		const wholeEnglish = findEnglishTranslation(query);
		if (wholeEnglish && !queries.includes(wholeEnglish)) {
			queries.push(wholeEnglish);
		}
		const wholeHebrew = findHebrewTranslation(query);
		if (wholeHebrew && !queries.includes(wholeHebrew)) {
			queries.push(wholeHebrew);
		}

		return queries.slice(0, 3); // Limit to 3 queries max
	}

	/**
	 * Enhance query with contextual prefix for better embedding similarity
	 * Uses LLM to generate context that helps retrieval understand references
	 * like "that thing we discussed" or "the approach that worked"
	 */
	private async enhanceQueryWithContext(
		query: string,
		conversationContext?: string
	): Promise<string> {
		if (!this.contextualEmbeddingService || !this.contextualEmbeddingService.isEnabled()) {
			return query;
		}

		if (this.contextualEmbeddingService.isCircuitOpen()) {
			logger.debug("[SearchServiceImpl] ContextualEmbedding circuit breaker open, using raw query");
			return query;
		}

		try {
			const enhanced = await this.contextualEmbeddingService.prepareForEmbedding(
				query,
				conversationContext
			);

			if (enhanced.context_prefix) {
				logger.debug(
					{
						originalLength: query.length,
						prefixLength: enhanced.context_prefix.length,
					},
					"[SearchServiceImpl] Query enhanced with contextual prefix"
				);
				return enhanced.combined_text;
			}
		} catch (err) {
			logger.warn(
				{ err },
				"[SearchServiceImpl] Contextual embedding enhancement failed, using raw query"
			);
		}

		return query;
	}

	/**
	 * Search memories with hybrid retrieval
	 */
	async search(params: SearchParams): Promise<SearchResponse> {
		const startTime = Date.now();
		let success = false;
		let wasHit = false;
		let stageTimings: Record<string, unknown> | null = null;

		try {
			// Step 0: Check for known solution (Roampal pattern)
			// If we have a high-quality cached solution, return it immediately
			const knownSolution = await this.checkKnownSolution(params.userId, params.query);
			if (knownSolution) {
				const results = [{ ...knownSolution, position: 1 }];
				this.updatePositionTracking(params.query, results, ["patterns"]);
				wasHit = true;
				stageTimings = { known_solution_lookup: Date.now() - startTime };
				success = true;

				return {
					results,
					debug: {
						confidence: "high" as const,
						stage_timings_ms: stageTimings,
						fallbacks_used: [],
						errors: [],
					},
				};
			}

			// Step 1: Determine tiers to search
			const tiers = this.resolveTiers(params.collections);

			// Step 1b: Enhance query with contextual embedding if enabled
			let searchQuery = params.query;
			if (this.contextualEmbeddingService && params.recentMessages?.length) {
				const conversationContext = params.recentMessages
					.slice(-3)
					.map((m) => `${m.from}: ${m.content.slice(0, 200)}`)
					.join("\n");
				searchQuery = await this.enhanceQueryWithContext(params.query, conversationContext);
			}

			// Step 2: Detect sort mode
			const sortBy = params.sortBy ?? this.detectSortMode(searchQuery);

			// Step 3: Expand query with bilingual translations
			const expandedQueries = this.expandQueryBilingual(searchQuery);
			const isBilingual = expandedQueries.length > 1;

			if (isBilingual) {
				logger.debug({ originalQuery: params.query, expandedQueries }, "Bilingual query expansion");
			}

			// Step 4: Execute hybrid search(es) with cross-personality support
			// Respect the MEMORY_RERANK_ENABLED feature flag for graceful degradation
			const flags = getMemoryFeatureFlags();
			const searchPromises = expandedQueries.map((query) =>
				this.hybridSearch.search({
					userId: params.userId,
					query,
					tiers,
					limit: params.limit ?? this.config.caps.search_limit_default,
					enableRerank: flags.rerankEnabled,
					// Cross-personality search - include memories from other personalities
					personalityId: params.personalityId,
					includeAllPersonalities: params.includeAllPersonalities ?? true,
					includePersonalityIds: params.includePersonalityIds,
				})
			);

			const responses = await Promise.all(searchPromises);

			// Merge results, keeping best score per memory_id
			const resultMap = new Map<string, SearchResult>();
			const bestDebug = responses[0]?.debug;

			for (const response of responses) {
				for (const result of response.results) {
					const existing = resultMap.get(result.memory_id);
					const resultScore = result.score_summary.final_score ?? 0;
					const existingScore = existing?.score_summary.final_score ?? 0;
					if (!existing || resultScore > existingScore) {
						resultMap.set(result.memory_id, result);
					}
				}
			}

			// Convert back to array
			const limit = params.limit ?? this.config.caps.search_limit_default;
			let results = Array.from(resultMap.values());

			// Step 4b: Apply entity boost from ContentKG (Roampal pattern)
			results = await this.applyEntityBoosts(params.userId, results);

			// Sort by score and limit
			results = results
				.sort((a, b) => (b.score_summary.final_score ?? 0) - (a.score_summary.final_score ?? 0))
				.slice(0, limit);

			// Step 5: Apply sort mode
			if (sortBy === "recency") {
				results = this.sortByRecency(results);
			} else if (sortBy === "score") {
				results = this.sortByScore(results);
			}
			// Default "relevance" uses the hybrid search ranking

			// Step 5: Update position tracking for record_response integration
			this.updatePositionTracking(params.query, results, tiers);

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

			stageTimings = (bestDebug?.stage_timings_ms as unknown as Record<string, unknown>) ?? null;
			success = true;

			return {
				results,
				debug: bestDebug ?? {
					confidence: "low" as const,
					stage_timings_ms: {},
					fallbacks_used: [],
					errors: [],
				},
			};
		} finally {
			const durationMs = Date.now() - startTime;
			memoryMetrics.recordSearch(wasHit);
			memoryMetrics.recordOperation("search", success);
			memoryMetrics.recordLatency("search", durationMs);

			if (stageTimings && typeof stageTimings === "object") {
				const qdrantMs = stageTimings.qdrant_query_ms;
				if (typeof qdrantMs === "number" && Number.isFinite(qdrantMs) && qdrantMs >= 0) {
					memoryMetrics.recordLatency("qdrant_query", qdrantMs);
				}

				const bm25Ms = stageTimings.bm25_query_ms;
				if (typeof bm25Ms === "number" && Number.isFinite(bm25Ms) && bm25Ms >= 0) {
					memoryMetrics.recordLatency("bm25_query", bm25Ms);
				}

				const rerankMs = stageTimings.rerank_ms;
				if (typeof rerankMs === "number" && Number.isFinite(rerankMs) && rerankMs >= 0) {
					memoryMetrics.recordLatency("rerank", rerankMs);
				}
			}
		}
	}

	async healthCheck(): Promise<boolean> {
		return typeof (this.hybridSearch as unknown as { search?: unknown }).search === "function";
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
	 * Get the last searched tiers (for KG routing updates)
	 */
	getLastSearchTiers(): MemoryTier[] {
		return [...this.lastSearchTiers];
	}

	/**
	 * Clear per-turn tracking (call after record_response)
	 */
	clearTurnTracking(): void {
		this.searchPositionMap.clear();
		this.lastSearchResults = [];
		this.lastQueryNormalized = "";
		this.lastSearchTiers = [];
	}

	/**
	 * Resolve tier specification to array of tiers
	 */
	private resolveTiers(collections?: MemoryTier[] | "all"): MemoryTier[] {
		if (!collections || collections === "all") {
			return ["working", "history", "patterns", "documents", "memory_bank"];
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
	private updatePositionTracking(
		query: string,
		results: SearchResult[],
		tiers: MemoryTier[]
	): void {
		this.searchPositionMap.clear();
		this.lastSearchResults = [];
		this.lastQueryNormalized = query;
		this.lastSearchTiers = tiers;

		for (const result of results) {
			this.searchPositionMap.set(result.position, result.memory_id);
			this.lastSearchResults.push(result.memory_id);
		}
	}
}
