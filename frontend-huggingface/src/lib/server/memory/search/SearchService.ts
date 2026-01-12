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
		this.rerankerEndpoint = params.rerankerEndpoint;
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Hybrid search combining vector and lexical retrieval
	 * Wrapped with enterprise-grade 15s timeout for graceful degradation
	 */
	async search(params: HybridSearchParams): Promise<SearchResponse> {
		const timeoutMs = this.config.timeouts.end_to_end_search_ms;

		try {
			return await this.withTimeout(this._executeSearch(params), timeoutMs, "search");
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
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

		// Step 2: Execute vector and lexical search in parallel
		const [vectorResults, lexicalResults] = await Promise.all([
			this.vectorSearch(params, queryVector, candidateLimit, timings, errors),
			this.lexicalSearch(params, candidateLimit, timings, errors),
		]);

		// Step 3: Merge and fuse results with RRF
		const mergeStart = Date.now();
		let candidates = this.fuseResults(vectorResults, lexicalResults);
		timings.candidate_merge_ms = Date.now() - mergeStart;

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
	 * Vector search using Qdrant
	 */
	private async vectorSearch(
		params: HybridSearchParams,
		queryVector: number[] | null,
		limit: number,
		timings: StageTimingsMs,
		errors: Array<{ stage: string; message: string }>
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
	 * Fuse vector and lexical results using RRF
	 */
	private fuseResults(
		vectorResults: QdrantSearchResult[],
		lexicalResults: Bm25SearchResult[]
	): CandidateResult[] {
		const candidates = new Map<string, CandidateResult>();
		const weights = this.config.weights.embedding_blend;

		// Process vector results
		for (let i = 0; i < vectorResults.length; i++) {
			const vr = vectorResults[i];
			const vectorRank = i + 1;
			const vectorRrfScore = rankToRrfScore(vectorRank, RRF_K);

			candidates.set(vr.id, {
				memoryId: vr.id,
				content: vr.payload.content,
				tier: vr.payload.tier,
				vectorScore: vr.score,
				vectorRank,
				rrfScore: vectorRrfScore * weights.dense_weight,
				finalScore: vectorRrfScore * weights.dense_weight,
				wilsonScore: vr.payload.composite_score,
				uses: vr.payload.uses,
			});
		}

		// Process lexical results and merge
		for (let i = 0; i < lexicalResults.length; i++) {
			const lr = lexicalResults[i];
			const textRank = i + 1;
			const textRrfScore = rankToRrfScore(textRank, RRF_K);

			const existing = candidates.get(lr.memoryId);

			if (existing) {
				// Merge scores
				existing.textScore = lr.textScore;
				existing.textRank = textRank;
				existing.rrfScore += textRrfScore * weights.text_weight;
				existing.finalScore = existing.rrfScore;
			} else {
				// New candidate from lexical only
				candidates.set(lr.memoryId, {
					memoryId: lr.memoryId,
					content: lr.content,
					tier: lr.tier,
					textScore: lr.textScore,
					textRank,
					rrfScore: textRrfScore * weights.text_weight,
					finalScore: textRrfScore * weights.text_weight,
				});
			}
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

			const data = (await response.json()) as { results: Array<{ index: number; score: number }> };

			// Apply CE scores
			const ceWeights = this.config.weights.cross_encoder_blend;

			for (const result of data.results) {
				const candidate = toRerank[result.index];
				if (candidate) {
					candidate.ceScore = result.score;
					candidate.ceRank = data.results.findIndex((r) => r.index === result.index) + 1;

					// Blend original RRF score with CE score
					candidate.finalScore =
						candidate.rrfScore * ceWeights.original_weight + result.score * ceWeights.ce_weight;
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
}
