/**
 * Bm25Adapter - Lexical retrieval for hybrid search
 *
 * Uses MongoDB full-text search as a BM25-like lexical retrieval source.
 * Normalizes scores to rank-based similarity for RRF fusion.
 *
 * Key design principles:
 * - Mongo full-text is the primary lexical source (freshness guaranteed)
 * - Rank-based normalization: similarity = 1 / (rank + 60)
 * - Timeouts with empty fallback (fail-open)
 * - Circuit breaker for degraded mode
 */

import type { Collection } from "mongodb";
import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { MemoryTier, MemoryStatus } from "../types";
import type { MemoryItemDocument } from "../stores/schemas";

export interface Bm25AdapterConfig {
	collection: Collection<MemoryItemDocument>;
	config?: MemoryConfig;
}

export interface Bm25SearchParams {
	userId: string;
	query: string;
	tiers?: MemoryTier[];
	status?: MemoryStatus[];
	limit?: number;
	timeoutMs?: number;
}

export interface Bm25SearchResult {
	memoryId: string;
	rank: number;
	textScore: number;
	normalizedScore: number; // 1 / (rank + RRF_K)
	content: string;
	tier: MemoryTier;
}

export interface Bm25SearchResponse {
	results: Bm25SearchResult[];
	latencyMs: number;
	timedOut: boolean;
	error?: string;
}

/**
 * RRF constant for rank normalization
 * Higher value gives more weight to lower-ranked results
 */
const RRF_K = 60;

export class Bm25Adapter {
	private collection: Collection<MemoryItemDocument>;
	private config: MemoryConfig;

	// Circuit breaker state
	private isOpen = false;
	private failureCount = 0;
	private lastFailure: number | null = null;
	private successCount = 0;

	constructor(params: Bm25AdapterConfig) {
		this.collection = params.collection;
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Search using MongoDB full-text index
	 */
	async search(params: Bm25SearchParams): Promise<Bm25SearchResponse> {
		const startTime = Date.now();
		const timeoutMs = params.timeoutMs ?? this.config.timeouts.mongo_text_query_ms;

		// Check circuit breaker
		if (this.isOpen && !this.shouldAttemptHalfOpen()) {
			return {
				results: [],
				latencyMs: Date.now() - startTime,
				timedOut: false,
				error: "Circuit breaker open",
			};
		}

		// Build filter
		const filter: Record<string, unknown> = {
			user_id: params.userId,
			$text: { $search: params.query },
		};

		if (params.tiers?.length) {
			filter.tier = { $in: params.tiers };
		}

		if (params.status?.length) {
			filter.status = { $in: params.status };
		} else {
			filter.status = "active";
		}

		const limit = params.limit ?? this.config.caps.search_limit_max;

		try {
			const cursor = this.collection
				.find(filter, {
					projection: {
						memory_id: 1,
						text: 1,
						tier: 1,
						score: { $meta: "textScore" },
					},
				})
				.sort({ score: { $meta: "textScore" } })
				.limit(limit)
				.maxTimeMS(timeoutMs);

			const docs = await cursor.toArray();
			const latencyMs = Date.now() - startTime;

			// Convert to results with rank-based normalization
			const results: Bm25SearchResult[] = docs.map((doc, index) => ({
				memoryId: doc.memory_id,
				rank: index + 1,
				textScore: (doc as unknown as { score: number }).score ?? 0,
				normalizedScore: 1 / (index + 1 + RRF_K),
				content: doc.text,
				tier: doc.tier,
			}));

			this.recordSuccess();

			return {
				results,
				latencyMs,
				timedOut: false,
			};
		} catch (err) {
			const latencyMs = Date.now() - startTime;
			const errorMessage = err instanceof Error ? err.message : String(err);

			// Check if it's a timeout
			const timedOut =
				errorMessage.includes("timed out") || errorMessage.includes("exceeded time limit");

			if (timedOut) {
				logger.warn({ query: params.query, timeout: timeoutMs }, "BM25 search timed out");
			} else {
				logger.error({ err, query: params.query }, "BM25 search failed");
			}

			this.recordFailure();

			return {
				results: [],
				latencyMs,
				timedOut,
				error: errorMessage,
			};
		}
	}

	/**
	 * Search with query expansion (acronyms, synonyms)
	 * Takes expanded terms and runs search with OR semantics
	 */
	async searchWithExpansion(
		params: Bm25SearchParams & { expandedTerms?: string[] }
	): Promise<Bm25SearchResponse> {
		// Build expanded query with OR semantics
		let query = params.query;

		if (params.expandedTerms?.length) {
			// MongoDB text search treats space-separated terms as OR
			// Wrap original query in quotes to keep it as a phrase
			const terms = [
				`"${params.query}"`,
				...params.expandedTerms.map((t) => (t.includes(" ") ? `"${t}"` : t)),
			];
			query = terms.join(" ");
		}

		return this.search({ ...params, query });
	}

	/**
	 * Get document count for cache invalidation checks
	 */
	async getActiveCount(userId: string, tier?: MemoryTier): Promise<number> {
		try {
			const filter: Record<string, unknown> = {
				user_id: userId,
				status: "active",
			};

			if (tier) {
				filter.tier = tier;
			}

			return await this.collection.countDocuments(filter, {
				maxTimeMS: 1000,
			});
		} catch (err) {
			logger.warn({ err }, "Failed to get active count");
			return -1;
		}
	}

	/**
	 * Get max updated_at for cache invalidation checks
	 */
	async getMaxUpdatedAt(userId: string, tier?: MemoryTier): Promise<Date | null> {
		try {
			const filter: Record<string, unknown> = {
				user_id: userId,
				status: "active",
			};

			if (tier) {
				filter.tier = tier;
			}

			const doc = await this.collection.findOne(filter, {
				sort: { updated_at: -1 },
				projection: { updated_at: 1 },
				maxTimeMS: 1000,
			});

			return doc?.updated_at ?? null;
		} catch (err) {
			logger.warn({ err }, "Failed to get max updated_at");
			return null;
		}
	}

	// ============================================
	// Circuit Breaker
	// ============================================

	private shouldAttemptHalfOpen(): boolean {
		if (!this.lastFailure) return true;
		const elapsed = Date.now() - this.lastFailure;
		return elapsed > this.config.circuit_breakers.bm25.open_duration_ms;
	}

	private recordSuccess(): void {
		if (this.isOpen) {
			this.successCount++;
			if (this.successCount >= this.config.circuit_breakers.bm25.success_threshold) {
				this.isOpen = false;
				this.failureCount = 0;
				this.successCount = 0;
				logger.info("BM25 circuit breaker closed");
			}
		} else {
			this.failureCount = 0;
		}
	}

	private recordFailure(): void {
		this.failureCount++;
		this.successCount = 0;
		this.lastFailure = Date.now();
		if (this.failureCount >= this.config.circuit_breakers.bm25.failure_threshold) {
			this.isOpen = true;
			logger.warn("BM25 circuit breaker opened");
		}
	}

	/**
	 * Check if circuit breaker is open
	 */
	isCircuitOpen(): boolean {
		return this.isOpen;
	}

	/**
	 * Reset circuit breaker (for testing)
	 */
	resetCircuitBreaker(): void {
		this.isOpen = false;
		this.failureCount = 0;
		this.successCount = 0;
		this.lastFailure = null;
	}
}

/**
 * Utility: Convert rank to RRF score
 */
export function rankToRrfScore(rank: number, k = RRF_K): number {
	return 1 / (rank + k);
}

/**
 * Utility: Merge and deduplicate results from multiple sources by memoryId
 */
export function mergeByMemoryId<T extends { memoryId: string }>(
	...resultSets: T[][]
): Map<string, T[]> {
	const merged = new Map<string, T[]>();

	for (const results of resultSets) {
		for (const result of results) {
			const existing = merged.get(result.memoryId) ?? [];
			existing.push(result);
			merged.set(result.memoryId, existing);
		}
	}

	return merged;
}
