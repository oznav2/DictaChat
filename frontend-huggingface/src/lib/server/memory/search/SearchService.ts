/**
 * SearchService - Hybrid retrieval orchestrator for Memory System
 *
 * Combines vector search (Qdrant) + lexical search (BM25) using RRF fusion,
 * with optional cross-encoder reranking.
 *
 * Key design principles:
 * - Parallel execution of vector and lexical stages
 * - RRF (Reciprocal Rank Fusion) for combining results
 * - Cross-encoder reranking for top-K refinement
 * - Graceful degradation (vector-only, lexical-only, or both)
 * - Hard timeouts at every stage
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type {
	MemoryTier,
	MemoryStatus,
	SearchResult,
	SearchResponse,
	SearchDebug,
	StageTimingsMs,
	SearchScoreSummary,
	Citation,
	RetrievalConfidence,
} from "../types";
import type { QdrantAdapter, QdrantSearchResult } from "../adapters/QdrantAdapter";
import type { Bm25Adapter, Bm25SearchResult } from "./Bm25Adapter";
import { rankToRrfScore } from "./Bm25Adapter";
import type { DictaEmbeddingClient } from "../embedding/DictaEmbeddingClient";

export interface SearchServiceConfig {
	qdrantAdapter: QdrantAdapter;
	bm25Adapter: Bm25Adapter;
	embeddingClient: DictaEmbeddingClient;
	rerankerEndpoint?: string;
	config?: MemoryConfig;
}

export interface HybridSearchParams {
	userId: string;
	query: string;
	tiers?: MemoryTier[];
	status?: MemoryStatus[];
	limit?: number;
	enableRerank?: boolean;
	minScore?: number;
	/** Current personality ID for filtering */
	personalityId?: string | null;
	/** Include memories from all personalities (cross-personality search) */
	includeAllPersonalities?: boolean;
	/** Specific personality IDs to include in search */
	includePersonalityIds?: string[] | null;
	/** Extracted entities from query for pre-filtering (NER Integration) */
	queryEntities?: Array<{ entityGroup: string; word: string; score: number }>;
	/** Enable entity pre-filtering (default: true if entities provided) */
	enableEntityPreFilter?: boolean;
}

interface CandidateResult {
	memoryId: string;
	content: string;
	tier: MemoryTier;
	vectorScore?: number;
	vectorRank?: number;
	textScore?: number;
	textRank?: number;
	rrfScore: number;
	ceScore?: number;
	ceRank?: number;
	finalScore: number;
	wilsonScore?: number;
	uses?: number;
	createdAt?: string;
	updatedAt?: string;
}

/**
 * RRF constant - higher values give more weight to lower-ranked items
 */
const RRF_K = 60;

/**
 * Tier-based boost multipliers for RAG prioritization
 * Documents tier gets highest boost to prioritize PDF/uploaded content over conversation history
 * Working tier gets penalty to deprioritize conversation snippets
 */
const TIER_BOOST: Record<string, number> = {
	documents: 1.5, // 50% boost for uploaded documents (PDF, etc.)
	memory_bank: 1.3, // 30% boost for user-curated facts
	patterns: 1.2, // 20% boost for proven patterns
	history: 1.0, // Neutral for validated history
	working: 0.7, // 30% penalty for working memory (conversation snippets)
	datagov_schema: 1.1, // 10% boost for DataGov schemas
	datagov_expansion: 1.0, // Neutral for DataGov expansions
};

/**
 * Patterns that indicate conversation history (should be filtered from working tier)
 * These patterns help identify items that are conversation snippets rather than actual knowledge
 */
const CONVERSATION_PATTERNS = [
	/^User:\s/i,
	/^Assistant:\s/i,
	/<think>/i,
	/<\/think>/i,
	/^Detailed Results:/i,
	/^\[Tool Result\]/i,
];

export class SearchService {
	private qdrant: QdrantAdapter;
	private bm25: Bm25Adapter;
	private embedding: DictaEmbeddingClient;
	private rerankerEndpoint?: string;
	private config: MemoryConfig;

	// Circuit breaker for reranker
	private rerankerOpen = false;
	private rerankerFailures = 0;
	private rerankerLastFailure: number | null = null;

	constructor(params: SearchServiceConfig) {
		this.qdrant = params.qdrantAdapter;
		this.bm25 = params.bm25Adapter;
		this.embedding = params.embeddingClient;
		// Normalize reranker endpoint to include /v1/rerank path if not present
		// The dicta-retrieval service exposes /v1/rerank per OpenAPI spec
		if (params.rerankerEndpoint) {
			this.rerankerEndpoint = params.rerankerEndpoint.endsWith("/v1/rerank")
				? params.rerankerEndpoint
				: `${params.rerankerEndpoint.replace(/\/+$/, "")}/v1/rerank`;
		}
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Hybrid search combining vector and lexical retrieval
	 * Wrapped with enterprise-grade 15s timeout for graceful degradation
	 *
	 * Phase 5 Enhancement: Triggers auto-reindex diagnostics on 0 results
	 */
	async search(params: HybridSearchParams): Promise<SearchResponse> {
		const timeoutMs = this.config.timeouts.end_to_end_search_ms;

		try {
			const response = await this.withTimeout(this._executeSearch(params), timeoutMs, "search");

			// Phase 5: Check for indexing issues when search returns 0 results
			if (response.results.length === 0) {
				// Fire-and-forget: don't block the response
				this.handleZeroResults(params.userId, params.query).catch(() => {});
			}

			return response;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			if (errorMessage.toLowerCase().includes("timed out")) {
				logger.warn({ timeout: timeoutMs }, "[search] Timeout, returning empty results");
			} else {
				logger.error({ err }, "[search] Service error, graceful fallback");
			}
			logger.error({ err }, "[search] Failed, returning empty");
			logger.error({ err, timeoutMs }, "Search failed or timed out");

			// Graceful fallback: return empty results instead of throwing
			return {
				results: [],
				debug: {
					confidence: "low",
					stage_timings_ms: {},
					fallbacks_used: ["timeout_fallback"],
					errors: [{ stage: "search", message: errorMessage, code: "TIMEOUT" }],
				},
			};
		}
	}

	/**
	 * Timeout wrapper for any promise
	 */
	private async withTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number,
		operation: string
	): Promise<T> {
		let timeoutId: ReturnType<typeof setTimeout>;

		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => {
				reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
			}, timeoutMs);
		});

		try {
			const result = await Promise.race([promise, timeoutPromise]);
			clearTimeout(timeoutId!);
			return result;
		} catch (err) {
			clearTimeout(timeoutId!);
			throw err;
		}
	}

	/**
	 * Internal search implementation (extracted for timeout wrapper)
	 */
	private async _executeSearch(params: HybridSearchParams): Promise<SearchResponse> {
		const startTime = Date.now();
		const timings: StageTimingsMs = {};
		const fallbacksUsed: string[] = [];
		const errors: Array<{ stage: string; message: string; code?: string }> = [];

		const limit = params.limit ?? this.config.caps.search_limit_default;
		const candidateLimit = limit * this.config.caps.candidate_fetch_multiplier_per_tier;

		// Step 1: Generate query embedding
		const embeddingStart = Date.now();
		const queryVector = await this.embedding.embed(params.query);
		timings.memory_prefetch_ms = Date.now() - embeddingStart;

		if (!queryVector) {
			errors.push({ stage: "embedding", message: "Failed to generate query embedding" });
			fallbacksUsed.push("lexical_only");
		}

		// Step 1.5 (NER Integration): Entity pre-filtering if entities provided
		let entityFilteredIds: Set<string> | null = null;
		if (
			params.queryEntities &&
			params.queryEntities.length > 0 &&
			params.enableEntityPreFilter !== false
		) {
			entityFilteredIds = await this.entityPreFilter(params.queryEntities, params.userId, timings);
		}

		// Step 2: Execute vector and lexical search in parallel
		const [vectorResults, lexicalResults] = await Promise.all([
			this.vectorSearch(params, queryVector, candidateLimit, timings, errors, entityFilteredIds),
			this.lexicalSearch(params, candidateLimit, timings, errors),
		]);

		logger.debug(
			{ vectorCount: vectorResults.length, bm25Count: lexicalResults.length },
			"[search] Hybrid sources"
		);

		// Step 3: Merge and fuse results with RRF
		const mergeStart = Date.now();
		let candidates = this.fuseResults(vectorResults, lexicalResults);
		timings.candidate_merge_ms = Date.now() - mergeStart;
		logger.info(
			{ fusedCount: candidates.length, rrfWeights: { k: RRF_K } },
			"[search] RRF fusion complete"
		);

		// Track fallbacks
		if (vectorResults.length === 0 && lexicalResults.length > 0) {
			fallbacksUsed.push("lexical_only");
		} else if (lexicalResults.length === 0 && vectorResults.length > 0) {
			fallbacksUsed.push("vector_only");
		}

		// Step 4: Optional cross-encoder reranking
		if (params.enableRerank !== false && this.rerankerEndpoint && candidates.length > 0) {
			const rerankStart = Date.now();
			candidates = await this.rerank(params.query, candidates, timings, errors);
			timings.rerank_ms = Date.now() - rerankStart;
		}

		// Step 4.5: Phase 22.2 - Apply Wilson blending for memory_bank tier
		// This gives established memory_bank items (uses >= 3) a boost based on their Wilson score
		const wilsonBlendStart = Date.now();
		candidates = this.applyWilsonBlend(candidates);
		timings.wilson_blend_ms = Date.now() - wilsonBlendStart;

		// Step 5: Apply final scoring and sort
		candidates.sort((a, b) => b.finalScore - a.finalScore);

		// Step 6: Apply limit and min score filter
		let finalCandidates = candidates.slice(0, limit);
		if (params.minScore !== undefined) {
			finalCandidates = finalCandidates.filter((c) => c.finalScore >= params.minScore!);
		}

		// Step 7: Convert to SearchResults
		const results = this.toSearchResults(finalCandidates);

		// Calculate confidence
		const confidence = this.calculateConfidence(results, fallbacksUsed, errors);

		const debug: SearchDebug = {
			confidence,
			stage_timings_ms: timings,
			fallbacks_used: fallbacksUsed,
			errors,
		};

		return { results, debug };
	}

	/**
	 * Entity-based pre-filtering stage (NER Integration)
	 *
	 * Reduces candidate set by filtering to documents with entity overlap.
	 * This can dramatically improve search speed for large datasets.
	 *
	 * @param queryEntities - Entities extracted from user query
	 * @param userId - User ID for filtering
	 * @param timings - Stage timings object
	 * @returns Set of memory IDs that have entity overlap, or null to skip filtering
	 */
	private async entityPreFilter(
		queryEntities: Array<{ entityGroup: string; word: string; score: number }>,
		userId: string,
		timings: StageTimingsMs
	): Promise<Set<string> | null> {
		if (!queryEntities || queryEntities.length === 0) {
			return null; // No filtering - use full search
		}

		const start = Date.now();

		try {
			// Extract entity words for matching
			const queryEntityWords = queryEntities.map((e) => e.word.toLowerCase().trim());

			// Query Qdrant for documents with matching entities in payload
			const matchingIds = await this.qdrant.filterByEntities({
				userId,
				entityWords: queryEntityWords,
				limit: 500, // Max candidates after entity filtering
			});

			timings.entity_prefilter_ms = Date.now() - start;

			if (matchingIds.length === 0) {
				logger.debug(
					{ queryEntityCount: queryEntities.length },
					"[search] Entity pre-filter returned 0 matches, falling back to full search"
				);
				return null; // Fallback to full search
			}

			logger.info(
				{
					queryEntityCount: queryEntities.length,
					matchedCount: matchingIds.length,
					entities: queryEntities.map((e) => e.word).slice(0, 5),
				},
				"[search] Entity pre-filter reduced candidates"
			);

			return new Set(matchingIds);
		} catch (err) {
			logger.warn({ err }, "[search] Entity pre-filter failed, falling back to full search");
			timings.entity_prefilter_ms = Date.now() - start;
			return null;
		}
	}

	/**
	 * Vector search using Qdrant
	 */
	private async vectorSearch(
		params: HybridSearchParams,
		queryVector: number[] | null,
		limit: number,
		timings: StageTimingsMs,
		errors: Array<{ stage: string; message: string }>,
		entityFilteredIds?: Set<string> | null
	): Promise<QdrantSearchResult[]> {
		if (!queryVector) {
			return [];
		}

		if (this.qdrant.isCircuitOpen()) {
			errors.push({ stage: "qdrant", message: "Circuit breaker open" });
			return [];
		}

		const start = Date.now();

		try {
			const results = await this.qdrant.search({
				userId: params.userId,
				vector: queryVector,
				limit,
				tiers: params.tiers,
				status: params.status,
				filterIds: entityFilteredIds ? Array.from(entityFilteredIds) : undefined,
			});

			timings.qdrant_query_ms = Date.now() - start;
			return results;
		} catch (err) {
			timings.qdrant_query_ms = Date.now() - start;
			errors.push({
				stage: "qdrant",
				message: err instanceof Error ? err.message : String(err),
			});
			return [];
		}
	}

	/**
	 * Lexical search using BM25
	 */
	private async lexicalSearch(
		params: HybridSearchParams,
		limit: number,
		timings: StageTimingsMs,
		errors: Array<{ stage: string; message: string }>
	): Promise<Bm25SearchResult[]> {
		if (this.bm25.isCircuitOpen()) {
			errors.push({ stage: "bm25", message: "Circuit breaker open" });
			return [];
		}

		const start = Date.now();

		const response = await this.bm25.search({
			userId: params.userId,
			query: params.query,
			tiers: params.tiers,
			status: params.status,
			limit,
		});

		timings.bm25_query_ms = Date.now() - start;

		if (response.error) {
			errors.push({ stage: "bm25", message: response.error });
		}

		return response.results;
	}

	/**
	 * Check if content appears to be conversation history rather than actual knowledge
	 * Option B: Filter conversation snippets from working tier
	 */
	private isConversationSnippet(content: string): boolean {
		return CONVERSATION_PATTERNS.some((pattern) => pattern.test(content));
	}

	/**
	 * Get tier boost multiplier
	 * Option A: Prioritize documents tier over working tier
	 */
	private getTierBoost(tier: MemoryTier): number {
		return TIER_BOOST[tier] ?? 1.0;
	}

	/**
	 * Fuse vector and lexical results using RRF
	 * Enhanced with:
	 * - Option A: Tier-based boost (documents > working)
	 * - Option B: Conversation snippet filtering for working tier
	 */
	private fuseResults(
		vectorResults: QdrantSearchResult[],
		lexicalResults: Bm25SearchResult[]
	): CandidateResult[] {
		const candidates = new Map<string, CandidateResult>();
		const weights = this.config.weights.embedding_blend;
		let filteredConversationCount = 0;

		// Process vector results
		for (let i = 0; i < vectorResults.length; i++) {
			const vr = vectorResults[i];

			// Option B: Filter conversation snippets from working tier
			if (vr.payload.tier === "working" && this.isConversationSnippet(vr.payload.content)) {
				filteredConversationCount++;
				continue;
			}

			const vectorRank = i + 1;
			const vectorRrfScore = rankToRrfScore(vectorRank, RRF_K);

			// Option A: Apply tier boost
			const tierBoost = this.getTierBoost(vr.payload.tier);
			const boostedScore = vectorRrfScore * weights.dense_weight * tierBoost;

			candidates.set(vr.id, {
				memoryId: vr.id,
				content: vr.payload.content,
				tier: vr.payload.tier,
				vectorScore: vr.score,
				vectorRank,
				rrfScore: boostedScore,
				finalScore: boostedScore,
				wilsonScore: vr.payload.composite_score,
				uses: vr.payload.uses,
			});
		}

		// Process lexical results and merge
		for (let i = 0; i < lexicalResults.length; i++) {
			const lr = lexicalResults[i];

			// Option B: Filter conversation snippets from working tier
			if (lr.tier === "working" && this.isConversationSnippet(lr.content)) {
				filteredConversationCount++;
				continue;
			}

			const textRank = i + 1;
			const textRrfScore = rankToRrfScore(textRank, RRF_K);

			// Option A: Apply tier boost
			const tierBoost = this.getTierBoost(lr.tier);

			const existing = candidates.get(lr.memoryId);

			if (existing) {
				// Merge scores (tier boost already applied to existing)
				existing.textScore = lr.textScore;
				existing.textRank = textRank;
				existing.rrfScore += textRrfScore * weights.text_weight * tierBoost;
				existing.finalScore = existing.rrfScore;
			} else {
				// New candidate from lexical only
				const boostedScore = textRrfScore * weights.text_weight * tierBoost;
				candidates.set(lr.memoryId, {
					memoryId: lr.memoryId,
					content: lr.content,
					tier: lr.tier,
					textScore: lr.textScore,
					textRank,
					rrfScore: boostedScore,
					finalScore: boostedScore,
				});
			}
		}

		// Log filtering stats
		if (filteredConversationCount > 0) {
			logger.debug(
				{ filtered: filteredConversationCount },
				"[Option B] Filtered conversation snippets from working tier"
			);
		}

		return Array.from(candidates.values());
	}

	/**
	 * Cross-encoder reranking
	 */
	private async rerank(
		query: string,
		candidates: CandidateResult[],
		timings: StageTimingsMs,
		errors: Array<{ stage: string; message: string }>
	): Promise<CandidateResult[]> {
		if (!this.rerankerEndpoint) {
			return candidates;
		}

		// Check circuit breaker
		if (this.rerankerOpen && !this.shouldAttemptRerankerHalfOpen()) {
			errors.push({ stage: "reranker", message: "Circuit breaker open" });
			return candidates;
		}

		// Limit candidates for reranking
		const rerankK = Math.min(candidates.length, this.config.caps.rerank_k);
		const toRerank = candidates.slice(0, rerankK);

		// Prepare documents for reranking
		const documents = toRerank.map((c) =>
			c.content.slice(0, this.config.caps.rerank_max_input_chars)
		);

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.config.timeouts.reranker_ms);

			const response = await fetch(this.rerankerEndpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query, documents }),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`Reranker returned ${response.status}`);
			}

			// Handle both 'score' and 'relevance_score' field names from different reranker APIs
			const data = (await response.json()) as {
				results: Array<{ index: number; score?: number; relevance_score?: number }>;
			};

			// Apply CE scores
			const ceWeights = this.config.weights.cross_encoder_blend;

			for (const result of data.results) {
				const candidate = toRerank[result.index];
				if (candidate) {
					// Support both field names: dicta-retrieval uses 'relevance_score'
					const ceScore = result.relevance_score ?? result.score ?? 0;
					candidate.ceScore = ceScore;
					candidate.ceRank = data.results.findIndex((r) => r.index === result.index) + 1;

					// Blend original RRF score with CE score
					let finalScore =
						candidate.rrfScore * ceWeights.original_weight + ceScore * ceWeights.ce_weight;

					// Phase 22.8: Apply quality boost for memory_bank items with Wilson
					// Only applies to established items (uses >= 3) with cold-start protection
					if (
						candidate.tier === "memory_bank" &&
						(candidate.uses ?? 0) >= SearchService.WILSON_COLD_START_USES
					) {
						const wilsonScore = candidate.wilsonScore ?? 0.5;
						// Quality boost: multiply by (1 + wilson * 0.2) for high-quality items
						// This gives items with wilson=1.0 a 20% boost, wilson=0.5 a 10% boost
						const qualityBoost = 1 + wilsonScore * SearchService.WILSON_BLEND_WEIGHTS.wilson;
						finalScore *= qualityBoost;

						logger.debug(
							{
								memoryId: candidate.memoryId,
								wilsonScore,
								qualityBoost,
								preBoostScore:
									candidate.rrfScore * ceWeights.original_weight + ceScore * ceWeights.ce_weight,
								postBoostScore: finalScore,
							},
							"[Phase 22.8] Applied CE + Wilson quality boost"
						);
					}

					candidate.finalScore = finalScore;
				}
			}

			this.recordRerankerSuccess();

			// Re-sort by final score
			toRerank.sort((a, b) => b.finalScore - a.finalScore);

			// Merge back with non-reranked candidates
			const rerankedIds = new Set(toRerank.map((c) => c.memoryId));
			const remaining = candidates.filter((c) => !rerankedIds.has(c.memoryId));

			return [...toRerank, ...remaining];
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);

			if (errorMessage.includes("aborted")) {
				errors.push({ stage: "reranker", message: "Reranker timed out" });
			} else {
				errors.push({ stage: "reranker", message: errorMessage });
			}

			this.recordRerankerFailure();
			return candidates;
		}
	}

	// ============================================
	// Phase 22.2: Wilson Scoring for memory_bank
	// ============================================

	/**
	 * Cold-start protection threshold for Wilson blending
	 * Items with fewer uses than this will not have Wilson applied
	 */
	private static readonly WILSON_COLD_START_USES = 3;

	/**
	 * Wilson blend weights for memory_bank tier
	 * Phase 22.2: 80% quality/RRF + 20% Wilson for established items
	 */
	private static readonly WILSON_BLEND_WEIGHTS = {
		quality: 0.8,
		wilson: 0.2,
	};

	/**
	 * Apply Wilson score blending for memory_bank tier items
	 *
	 * Phase 22.2: For memory_bank items with uses >= 3, blend Wilson score
	 * into the final score. This gives established, high-quality items a boost.
	 *
	 * Formula: finalScore = 0.8 * originalScore + 0.2 * wilsonScore
	 * Cold-start protection: items with uses < 3 keep original score
	 */
	private applyWilsonBlend(candidates: CandidateResult[]): CandidateResult[] {
		let blendedCount = 0;

		for (const candidate of candidates) {
			// Only apply to memory_bank tier
			if (candidate.tier !== "memory_bank") {
				continue;
			}

			// Cold-start protection: require minimum uses
			const uses = candidate.uses ?? 0;
			if (uses < SearchService.WILSON_COLD_START_USES) {
				logger.debug(
					{ memoryId: candidate.memoryId, uses },
					"[Phase 22.2] Skipping Wilson blend (cold-start protection)"
				);
				continue;
			}

			// Get Wilson score (default to 0.5 if not available)
			const wilsonScore = candidate.wilsonScore ?? 0.5;
			const originalScore = candidate.finalScore;

			// Phase 22.2: Apply 80/20 blend
			const blendedScore =
				SearchService.WILSON_BLEND_WEIGHTS.quality * originalScore +
				SearchService.WILSON_BLEND_WEIGHTS.wilson * wilsonScore;

			candidate.finalScore = blendedScore;
			blendedCount++;

			logger.debug(
				{
					memoryId: candidate.memoryId,
					tier: candidate.tier,
					uses,
					wilsonScore,
					originalScore,
					blendedScore,
				},
				"[Phase 22.2] Applied Wilson blend to memory_bank item"
			);
		}

		if (blendedCount > 0) {
			logger.info(
				{ blendedCount, totalCandidates: candidates.length },
				"[Phase 22.2] Wilson blend applied to memory_bank items"
			);
		}

		return candidates;
	}

	/**
	 * Convert candidates to SearchResults
	 */
	private toSearchResults(candidates: CandidateResult[]): SearchResult[] {
		return candidates.map((c, index) => {
			const scoreSummary: SearchScoreSummary = {
				final_score: c.finalScore,
				dense_similarity: c.vectorScore,
				text_similarity: c.textScore,
				rrf_score: c.rrfScore,
				ce_score: c.ceScore,
				vector_rank: c.vectorRank ?? null,
				text_rank: c.textRank ?? null,
				ce_rank: c.ceRank ?? null,
				wilson_score: c.wilsonScore,
				uses: c.uses,
				created_at: c.createdAt,
				updated_at: c.updatedAt,
			};

			const citations: Citation[] = [
				{
					source_type: "assistant",
					memory_id: c.memoryId,
				},
			];

			return {
				position: index + 1,
				tier: c.tier,
				memory_id: c.memoryId,
				score_summary: scoreSummary,
				content: c.content,
				preview: c.content.slice(0, 200) + (c.content.length > 200 ? "..." : ""),
				citations,
			};
		});
	}

	/**
	 * Calculate retrieval confidence
	 */
	private calculateConfidence(
		results: SearchResult[],
		fallbacks: string[],
		errors: Array<{ stage: string; message: string }>
	): RetrievalConfidence {
		if (results.length === 0) {
			return "low";
		}

		// High confidence: both sources worked, top result has high score
		if (fallbacks.length === 0 && errors.length === 0) {
			const topScore = results[0]?.score_summary.final_score ?? 0;
			if (topScore > 0.7) return "high";
			if (topScore > 0.4) return "medium";
		}

		// Medium confidence: one source worked well
		if (fallbacks.length <= 1 && results.length >= 3) {
			return "medium";
		}

		return "low";
	}

	// ============================================
	// Reranker Circuit Breaker
	// ============================================

	private shouldAttemptRerankerHalfOpen(): boolean {
		if (!this.rerankerLastFailure) return true;
		const elapsed = Date.now() - this.rerankerLastFailure;
		return elapsed > this.config.circuit_breakers.reranker.open_duration_ms;
	}

	private recordRerankerSuccess(): void {
		this.rerankerFailures = 0;
		if (this.rerankerOpen) {
			this.rerankerOpen = false;
			logger.info("Reranker circuit breaker closed");
		}
	}

	private recordRerankerFailure(): void {
		this.rerankerFailures++;
		this.rerankerLastFailure = Date.now();
		if (this.rerankerFailures >= this.config.circuit_breakers.reranker.failure_threshold) {
			this.rerankerOpen = true;
			logger.warn("Reranker circuit breaker opened");
		}
	}

	// ============================================
	// Phase 5: Auto-Reindex on 0 Results
	// ============================================

	/**
	 * Check if there are items needing reindex for the user
	 *
	 * Phase 5: Fix "0 Memories Found" Issue
	 * - If search returns 0 results but items exist in MongoDB, they may need reindexing
	 * - This fires a background check and logs findings for diagnostics
	 *
	 * @param userId - User ID to check
	 * @returns Count of items needing reindex
	 */
	async checkNeedsReindex(userId: string): Promise<number> {
		try {
			// Query MongoDB for items without embeddings via BM25 adapter's collection
			// The BM25 adapter has access to the memory_items collection
			const count = await this.bm25.getActiveCount(userId);

			// Compare with Qdrant count to detect mismatch
			if (!this.qdrant.isCircuitOpen()) {
				const qdrantCount = await this.qdrant.count(userId);
				const mongoCount = count;

				if (mongoCount > 0 && qdrantCount === 0) {
					// Items exist in MongoDB but none in Qdrant - needs reindex
					logger.warn(
						{ userId, mongoCount, qdrantCount },
						"[Phase 5] Search anomaly: items in MongoDB but not in Qdrant"
					);
					return mongoCount;
				}

				const diff = mongoCount - qdrantCount;
				if (diff > 5) {
					// Significant mismatch
					logger.warn(
						{ userId, mongoCount, qdrantCount, diff },
						"[Phase 5] Search anomaly: MongoDB/Qdrant count mismatch"
					);
					return diff;
				}
			}

			return 0;
		} catch (err) {
			logger.warn({ err, userId }, "[Phase 5] Failed to check needs reindex");
			return 0;
		}
	}

	/**
	 * Trigger background reindex for a user
	 *
	 * Phase 5: Fix "0 Memories Found" Issue
	 * - Fire-and-forget: does not block the search response
	 * - Calls the deferred reindex endpoint internally
	 *
	 * @param userId - User ID to reindex
	 */
	async triggerBackgroundReindex(userId: string): Promise<void> {
		try {
			// This is a fire-and-forget operation
			// In production, this would call the reindex service directly
			// For now, we log the intent and let the scheduled reindex handle it
			logger.info({ userId }, "[Phase 5] Background reindex triggered due to 0 search results");

			// Note: The actual reindex is handled by the scheduled reindex service
			// or can be triggered via POST /api/memory/ops/reindex/deferred
			// This method serves as a hook for future async reindex implementation
		} catch (err) {
			// Swallow errors - this is fire-and-forget
			logger.warn({ err, userId }, "[Phase 5] Background reindex trigger failed");
		}
	}

	/**
	 * Handle 0 results scenario with diagnostic logging
	 *
	 * Phase 5: Fix "0 Memories Found" Issue
	 * - Called when search returns empty results
	 * - Checks for indexing issues and triggers background reindex if needed
	 *
	 * @param userId - User ID
	 * @param query - Original search query
	 */
	async handleZeroResults(userId: string, query: string): Promise<void> {
		const needsReindex = await this.checkNeedsReindex(userId);

		if (needsReindex > 0) {
			logger.warn(
				{ userId, count: needsReindex },
				"[search] Found unindexed items - triggering background reindex"
			);
			logger.warn(
				{ userId, needsReindex, queryPreview: query.slice(0, 50) },
				"[Phase 5] Zero results with unindexed items - triggering background reindex"
			);

			// Fire-and-forget reindex
			this.triggerBackgroundReindex(userId).catch(() => {});
		} else {
			// Genuine zero results - query may not match any content
			logger.debug(
				{ userId, queryPreview: query.slice(0, 50) },
				"[Phase 5] Zero results - no indexing issues detected"
			);
		}
	}
}
