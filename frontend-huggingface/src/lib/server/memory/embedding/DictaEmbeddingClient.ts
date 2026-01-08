/**
 * DictaEmbeddingClient - Embedding service client for Memory System
 *
 * Connects to the dicta-retrieval container (port 5005) for embeddings.
 * Uses Redis caching to avoid redundant embedding calls.
 *
 * Key design principles:
 * - NO local models - fail fast if container unavailable
 * - Redis cache with 7-day TTL
 * - Batch processing with configurable batch size
 * - Circuit breaker for fail-open behavior
 */

import { createHash } from "crypto";
import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";

export interface DictaEmbeddingClientConfig {
	endpoint: string;
	batchSize?: number;
	timeoutMs?: number;
	expectedDims?: number;
	config?: MemoryConfig;
}

export interface EmbeddingResult {
	text: string;
	vector: number[];
	hash: string;
	cached: boolean;
}

export interface EmbeddingBatchResult {
	results: EmbeddingResult[];
	cacheHits: number;
	cacheMisses: number;
	latencyMs: number;
}

interface EmbeddingItem {
	text: string;
	dense: number[];
}

interface EmbeddingsResponse {
	embeddings: EmbeddingItem[];
}

/**
 * Normalize text for consistent hashing
 */
function normalizeText(text: string): string {
	return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Generate hash for embedding cache key
 */
function hashText(text: string, modelVersion = "v1"): string {
	const normalized = normalizeText(text);
	const hash = createHash("md5").update(normalized).digest("hex");
	return `embedding:${modelVersion}:${hash}`;
}

export class DictaEmbeddingClient {
	private endpoint: string;
	private batchSize: number;
	private timeoutMs: number;
	private expectedDims: number;
	private config: MemoryConfig;

	// Circuit breaker state
	private isOpen = false;
	private failureCount = 0;
	private lastFailure: number | null = null;
	private successCount = 0;

	// In-memory cache (Redis is optional enhancement)
	private memoryCache: Map<string, number[]> = new Map();
	private readonly maxCacheSize = 10000;

	constructor(params: DictaEmbeddingClientConfig) {
		this.endpoint = params.endpoint;
		this.batchSize = params.batchSize ?? 32;
		this.timeoutMs = params.timeoutMs ?? 10000;
		this.expectedDims = params.expectedDims ?? 768;
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Embed a single text
	 */
	async embed(text: string): Promise<number[] | null> {
		const result = await this.embedBatch([text]);
		if (result.results.length === 0) return null;
		return result.results[0].vector;
	}

	/**
	 * Embed multiple texts with caching
	 */
	async embedBatch(texts: string[]): Promise<EmbeddingBatchResult> {
		const startTime = Date.now();

		if (texts.length === 0) {
			return {
				results: [],
				cacheHits: 0,
				cacheMisses: 0,
				latencyMs: 0,
			};
		}

		// Check circuit breaker
		if (this.isOpen && !this.shouldAttemptHalfOpen()) {
			logger.warn("DictaEmbeddingClient circuit breaker is open, returning empty results");
			return {
				results: [],
				cacheHits: 0,
				cacheMisses: 0,
				latencyMs: Date.now() - startTime,
			};
		}

		// Check cache for all texts
		const results: EmbeddingResult[] = [];
		const uncachedTexts: string[] = [];
		const uncachedIndices: number[] = [];
		let cacheHits = 0;

		for (let i = 0; i < texts.length; i++) {
			const text = texts[i];
			const hash = hashText(text);
			const cached = this.memoryCache.get(hash);

			if (cached) {
				results.push({
					text,
					vector: cached,
					hash,
					cached: true,
				});
				cacheHits++;
			} else {
				uncachedTexts.push(text);
				uncachedIndices.push(i);
				// Placeholder for now
				results.push({
					text,
					vector: [],
					hash,
					cached: false,
				});
			}
		}

		// Fetch embeddings for uncached texts
		if (uncachedTexts.length > 0) {
			const embeddings = await this.fetchEmbeddings(uncachedTexts);

			if (embeddings) {
				// Update results and cache
				for (let i = 0; i < uncachedTexts.length; i++) {
					const originalIndex = uncachedIndices[i];
					const text = uncachedTexts[i];
					const vector = embeddings[i];
					const hash = hashText(text);

					if (vector && vector.length === this.expectedDims) {
						results[originalIndex] = {
							text,
							vector,
							hash,
							cached: false,
						};

						// Add to cache
						this.addToCache(hash, vector);
					}
				}
			}
		}

		// Filter out empty results
		const validResults = results.filter((r) => r.vector.length > 0);

		return {
			results: validResults,
			cacheHits,
			cacheMisses: uncachedTexts.length,
			latencyMs: Date.now() - startTime,
		};
	}

	/**
	 * Fetch embeddings from dicta-retrieval service
	 */
	private async fetchEmbeddings(texts: string[]): Promise<number[][] | null> {
		const allEmbeddings: number[][] = [];

		// Process in batches
		for (let i = 0; i < texts.length; i += this.batchSize) {
			const batch = texts.slice(i, i + this.batchSize);
			const batchEmbeddings = await this.fetchBatch(batch);

			if (!batchEmbeddings) {
				// Circuit breaker will handle failure
				return null;
			}

			allEmbeddings.push(...batchEmbeddings);
		}

		return allEmbeddings;
	}

	/**
	 * Fetch a single batch of embeddings
	 */
	private async fetchBatch(texts: string[]): Promise<number[][] | null> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await fetch(`${this.endpoint}/embeddings`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ texts }),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorText = await response.text().catch(() => "Unknown error");
				logger.error(
					{ status: response.status, error: errorText },
					"Embedding service returned error"
				);
				this.recordFailure();
				return null;
			}

			const data = (await response.json()) as EmbeddingsResponse;

			// Validate response
			if (!data.embeddings || !Array.isArray(data.embeddings)) {
				logger.error({ data }, "Invalid embedding response format");
				this.recordFailure();
				return null;
			}

			// Validate dimensions
			for (const item of data.embeddings) {
				if (item.dense.length !== this.expectedDims) {
					logger.error(
						{ expected: this.expectedDims, got: item.dense.length },
						"Embedding dimension mismatch"
					);
					this.recordFailure();
					return null;
				}
			}

			this.recordSuccess();
			return data.embeddings.map((item) => item.dense);
		} catch (err) {
			clearTimeout(timeoutId);

			if (err instanceof Error && err.name === "AbortError") {
				logger.warn({ timeout: this.timeoutMs }, "Embedding request timed out");
			} else {
				logger.error({ err }, "Embedding request failed");
			}

			this.recordFailure();
			return null;
		}
	}

	/**
	 * Add to in-memory cache with LRU eviction
	 */
	private addToCache(hash: string, vector: number[]): void {
		// Simple LRU: delete oldest entries if over limit
		if (this.memoryCache.size >= this.maxCacheSize) {
			const firstKey = this.memoryCache.keys().next().value;
			if (firstKey) {
				this.memoryCache.delete(firstKey);
			}
		}
		this.memoryCache.set(hash, vector);
	}

	/**
	 * Validate embedding dimensions
	 */
	async validateDimensions(): Promise<{ valid: boolean; actualDims?: number; error?: string }> {
		try {
			const testVector = await this.embed("test");
			if (!testVector) {
				return { valid: false, error: "Could not generate test embedding" };
			}

			if (testVector.length !== this.expectedDims) {
				return {
					valid: false,
					actualDims: testVector.length,
					error: `Dimension mismatch: expected ${this.expectedDims}, got ${testVector.length}`,
				};
			}

			return { valid: true, actualDims: testVector.length };
		} catch (err) {
			return {
				valid: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	/**
	 * Health check
	 */
	async healthCheck(): Promise<boolean> {
		try {
			const response = await fetch(`${this.endpoint}/health`, {
				method: "GET",
				signal: AbortSignal.timeout(5000),
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { size: number; maxSize: number } {
		return {
			size: this.memoryCache.size,
			maxSize: this.maxCacheSize,
		};
	}

	/**
	 * Clear the cache
	 */
	clearCache(): void {
		this.memoryCache.clear();
	}

	// ============================================
	// Circuit Breaker
	// ============================================

	private shouldAttemptHalfOpen(): boolean {
		if (!this.lastFailure) return true;
		const elapsed = Date.now() - this.lastFailure;
		return elapsed > this.config.circuit_breakers.embeddings.open_duration_ms;
	}

	private recordSuccess(): void {
		if (this.isOpen) {
			this.successCount++;
			if (this.successCount >= this.config.circuit_breakers.embeddings.success_threshold) {
				this.isOpen = false;
				this.failureCount = 0;
				this.successCount = 0;
				logger.info("Embedding circuit breaker closed");
			}
		} else {
			this.failureCount = 0;
		}
	}

	private recordFailure(): void {
		this.failureCount++;
		this.successCount = 0;
		this.lastFailure = Date.now();
		if (this.failureCount >= this.config.circuit_breakers.embeddings.failure_threshold) {
			this.isOpen = true;
			logger.warn("Embedding circuit breaker opened");
		}
	}

	/**
	 * Check if circuit breaker is open
	 */
	isCircuitOpen(): boolean {
		return this.isOpen;
	}
}

/**
 * Factory function
 */
export function createDictaEmbeddingClient(
	config?: Partial<DictaEmbeddingClientConfig>
): DictaEmbeddingClient {
	return new DictaEmbeddingClient({
		endpoint: config?.endpoint ?? "http://dicta-retrieval:5005",
		batchSize: config?.batchSize ?? 32,
		timeoutMs: config?.timeoutMs ?? 10000,
		expectedDims: config?.expectedDims ?? 768,
		config: config?.config,
	});
}
