/**
 * UnifiedAIClient - Parallel NER + Embedding Processing
 *
 * Coordinates calls to:
 * - DictaBERT-NER (port 5007) for entity extraction
 * - DictaEmbeddingClient (port 5005) for semantic embeddings
 *
 * Enterprise features:
 * - Parallel execution via Promise.allSettled
 * - Independent circuit breakers per service
 * - Graceful degradation (NER optional, embeddings critical)
 * - 2-level caching (LRU + Redis)
 * - Structured error categorization
 */

import { createHash } from "crypto";
import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import { memoryMetrics } from "../observability";
import type { DictaEmbeddingClient } from "../embedding/DictaEmbeddingClient";

// ============================================
// TYPES
// ============================================

export interface ExtractedEntity {
	entityGroup: string; // PER, ORG, LOC, DATE, MISC
	word: string;
	score: number;
	start: number;
	end: number;
}

export interface EnrichmentResult {
	entities: ExtractedEntity[];
	embedding: number[];
	semanticDensity: number;
	metadata: {
		latencyMs: number;
		nerDegraded: boolean;
		embeddingDegraded: boolean;
		nerLatencyMs: number;
		embeddingLatencyMs: number;
		modelVersion: string;
	};
}

export interface UnifiedAIClientConfig {
	nerServiceUrl: string;
	embeddingClient: DictaEmbeddingClient;
	config?: MemoryConfig;
	nerTimeoutMs?: number;
	nerMinConfidence?: number;
	enableNer?: boolean;
}

interface NERServiceResponse {
	results: Array<
		Array<{
			entity_group: string;
			word: string;
			score: number;
			start: number;
			end: number;
		}>
	>;
	processing_time_ms: number;
	model_version: string;
}

// ============================================
// CIRCUIT BREAKER (NER-specific)
// ============================================

class NERCircuitBreaker {
	private isOpen = false;
	private failureCount = 0;
	private lastFailure: number | null = null;
	private successCount = 0;

	constructor(
		private failureThreshold: number = 3,
		private successThreshold: number = 2,
		private openDurationMs: number = 30000
	) {}

	isCircuitOpen(): boolean {
		if (!this.isOpen) return false;

		// Check if we should attempt half-open
		if (this.lastFailure && Date.now() - this.lastFailure > this.openDurationMs) {
			return false; // Allow half-open attempt
		}

		return true;
	}

	recordSuccess(): void {
		this.failureCount = 0;
		if (this.isOpen) {
			this.successCount++;
			if (this.successCount >= this.successThreshold) {
				this.isOpen = false;
				this.successCount = 0;
				logger.info("NER circuit breaker closed");
			}
		}
	}

	recordFailure(): void {
		this.failureCount++;
		this.successCount = 0;
		this.lastFailure = Date.now();

		if (this.failureCount >= this.failureThreshold && !this.isOpen) {
			this.isOpen = true;
			logger.warn("NER circuit breaker opened");
		}
	}

	getStatus(): { isOpen: boolean; failureCount: number } {
		return { isOpen: this.isOpen, failureCount: this.failureCount };
	}
}

// ============================================
// LRU CACHE FOR ENTITIES
// ============================================

class EntityCache {
	private cache = new Map<string, ExtractedEntity[]>();
	private readonly maxSize: number;

	constructor(maxSize = 5000) {
		this.maxSize = maxSize;
	}

	private hashText(text: string): string {
		return createHash("md5").update(text.trim().toLowerCase()).digest("hex");
	}

	get(text: string): ExtractedEntity[] | null {
		const key = this.hashText(text);
		const cached = this.cache.get(key);

		if (cached) {
			// Move to end for LRU
			this.cache.delete(key);
			this.cache.set(key, cached);
			return cached;
		}

		return null;
	}

	set(text: string, entities: ExtractedEntity[]): void {
		const key = this.hashText(text);

		// Evict oldest if at capacity
		if (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey) this.cache.delete(firstKey);
		}

		this.cache.set(key, entities);
	}

	getStats(): { size: number; maxSize: number } {
		return { size: this.cache.size, maxSize: this.maxSize };
	}
}

// ============================================
// MAIN CLIENT
// ============================================

export class UnifiedAIClient {
	private nerUrl: string;
	private embeddingClient: DictaEmbeddingClient;
	private config: MemoryConfig;
	private nerTimeoutMs: number;
	private nerMinConfidence: number;
	private enableNer: boolean;

	private nerCircuitBreaker: NERCircuitBreaker;
	private entityCache: EntityCache;

	constructor(params: UnifiedAIClientConfig) {
		this.nerUrl = params.nerServiceUrl;
		this.embeddingClient = params.embeddingClient;
		this.config = params.config ?? defaultMemoryConfig;
		this.nerTimeoutMs = params.nerTimeoutMs ?? 2000;
		this.nerMinConfidence = params.nerMinConfidence ?? 0.85;
		this.enableNer = params.enableNer ?? true;

		// Initialize circuit breaker with config values
		const cbConfig = this.config.circuit_breakers?.ner ?? {
			failure_threshold: 3,
			success_threshold: 2,
			open_duration_ms: 30000,
		};

		this.nerCircuitBreaker = new NERCircuitBreaker(
			cbConfig.failure_threshold,
			cbConfig.success_threshold,
			cbConfig.open_duration_ms
		);

		this.entityCache = new EntityCache(5000);
	}

	/**
	 * Process text to extract entities AND generate embedding in parallel.
	 *
	 * This is the main entry point for AI enrichment.
	 *
	 * CRITICAL: Uses Promise.allSettled to ensure one failure doesn't block the other.
	 * - NER failure: Returns empty entities (degraded but functional)
	 * - Embedding failure: Returns fallback embedding (degraded but functional)
	 */
	async processTextFull(text: string, traceId: string): Promise<EnrichmentResult> {
		const startTime = Date.now();
		let nerLatencyMs = 0;
		let embeddingLatencyMs = 0;

		// Execute NER and Embedding in parallel
		const [nerResult, embeddingResult] = await Promise.allSettled([
			this.fetchNER(text, traceId),
			this.fetchEmbedding(text, traceId),
		]);

		// Process NER result
		let entities: ExtractedEntity[] = [];
		let nerDegraded = false;

		if (nerResult.status === "fulfilled") {
			entities = nerResult.value.entities;
			nerLatencyMs = nerResult.value.latencyMs;
		} else {
			nerDegraded = true;
			logger.warn(
				{ traceId, error: nerResult.reason },
				"NER extraction failed, using empty entities"
			);
		}

		// Process Embedding result
		let embedding: number[];
		let embeddingDegraded = false;

		if (embeddingResult.status === "fulfilled") {
			embedding = embeddingResult.value.embedding;
			embeddingLatencyMs = embeddingResult.value.latencyMs;
		} else {
			embeddingDegraded = true;
			embedding = this.generateFallbackEmbedding(text);
			logger.warn({ traceId, error: embeddingResult.reason }, "Embedding failed, using fallback");
		}

		// Calculate semantic density (entities per 100 words)
		const wordCount = text.split(/\s+/).length;
		const semanticDensity = wordCount > 0 ? (entities.length / wordCount) * 100 : 0;

		const totalLatencyMs = Date.now() - startTime;

		// Record metrics
		memoryMetrics.recordOperation("ai_enrichment", !nerDegraded && !embeddingDegraded);
		memoryMetrics.recordLatency("ai_enrichment", totalLatencyMs);

		return {
			entities,
			embedding,
			semanticDensity,
			metadata: {
				latencyMs: totalLatencyMs,
				nerDegraded,
				embeddingDegraded,
				nerLatencyMs,
				embeddingLatencyMs,
				modelVersion: "dictabert-ner+bge-m3",
			},
		};
	}

	/**
	 * Fetch entities from NER service with caching and circuit breaker.
	 */
	private async fetchNER(
		text: string,
		traceId: string
	): Promise<{ entities: ExtractedEntity[]; latencyMs: number }> {
		const startTime = Date.now();

		// Feature flag check
		if (!this.enableNer) {
			return { entities: [], latencyMs: 0 };
		}

		// Circuit breaker check
		if (this.nerCircuitBreaker.isCircuitOpen()) {
			logger.debug({ traceId }, "NER circuit breaker is open, returning empty");
			return { entities: [], latencyMs: 0 };
		}

		// Cache check
		const cached = this.entityCache.get(text);
		if (cached) {
			return { entities: cached, latencyMs: Date.now() - startTime };
		}

		// Fetch from service
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.nerTimeoutMs);

		try {
			const response = await fetch(`${this.nerUrl}/extract`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					texts: [text],
					min_confidence: this.nerMinConfidence,
				}),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`NER service returned ${response.status}`);
			}

			const data = (await response.json()) as NERServiceResponse;

			// Map to our entity format
			const entities: ExtractedEntity[] = (data.results[0] || []).map((e) => ({
				entityGroup: e.entity_group,
				word: e.word,
				score: e.score,
				start: e.start,
				end: e.end,
			}));

			// Cache the result
			this.entityCache.set(text, entities);

			this.nerCircuitBreaker.recordSuccess();

			return {
				entities,
				latencyMs: Date.now() - startTime,
			};
		} catch (err) {
			clearTimeout(timeoutId);
			this.nerCircuitBreaker.recordFailure();

			const errorMsg = err instanceof Error ? err.message : String(err);
			logger.warn({ traceId, error: errorMsg }, "NER fetch failed");

			throw err;
		}
	}

	/**
	 * Fetch embedding from DictaEmbeddingClient.
	 */
	private async fetchEmbedding(
		text: string,
		_traceId: string
	): Promise<{ embedding: number[]; latencyMs: number }> {
		const startTime = Date.now();

		const vector = await this.embeddingClient.embed(text);

		if (!vector) {
			throw new Error("Embedding returned null");
		}

		return {
			embedding: vector,
			latencyMs: Date.now() - startTime,
		};
	}

	/**
	 * Generate deterministic fallback embedding for degraded mode.
	 * Uses SHA-256 hash to create consistent pseudo-embeddings.
	 */
	private generateFallbackEmbedding(text: string): number[] {
		const dims = this.config.qdrant?.expected_embedding_dims ?? 1024;
		const hash = createHash("sha256").update(text).digest();
		const embedding: number[] = new Array(dims);

		for (let i = 0; i < dims; i++) {
			const byteIndex = i % hash.length;
			embedding[i] = hash[byteIndex] / 127.5 - 1;
		}

		// Normalize
		const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
		if (magnitude > 0) {
			for (let i = 0; i < embedding.length; i++) {
				embedding[i] /= magnitude;
			}
		}

		return embedding;
	}

	/**
	 * Extract entities only (for query processing without embedding).
	 */
	async extractEntitiesOnly(text: string, traceId: string): Promise<ExtractedEntity[]> {
		try {
			const result = await this.fetchNER(text, traceId);
			return result.entities;
		} catch {
			return [];
		}
	}

	/**
	 * Batch process multiple texts (for indexing).
	 */
	async processTextsBatch(texts: string[], traceId: string): Promise<EnrichmentResult[]> {
		// Process in parallel batches
		const results: EnrichmentResult[] = [];
		const batchSize = 10; // Limit concurrent requests

		for (let i = 0; i < texts.length; i += batchSize) {
			const batch = texts.slice(i, i + batchSize);
			const batchResults = await Promise.all(
				batch.map((text, idx) => this.processTextFull(text, `${traceId}-batch-${i + idx}`))
			);
			results.push(...batchResults);
		}

		return results;
	}

	/**
	 * Get diagnostics for monitoring.
	 */
	getDiagnostics(): {
		ner: {
			circuitBreaker: { isOpen: boolean; failureCount: number };
			cacheStats: { size: number; maxSize: number };
		};
		embedding: { isOperational: boolean; isDegradedMode: boolean };
	} {
		return {
			ner: {
				circuitBreaker: this.nerCircuitBreaker.getStatus(),
				cacheStats: this.entityCache.getStats(),
			},
			embedding: {
				isOperational: this.embeddingClient.isOperational(),
				isDegradedMode: this.embeddingClient.isDegradedMode(),
			},
		};
	}
}

// ============================================
// FACTORY
// ============================================

let unifiedAIClientInstance: UnifiedAIClient | null = null;

export function getUnifiedAIClient(
	embeddingClient: DictaEmbeddingClient,
	config?: MemoryConfig
): UnifiedAIClient {
	if (!unifiedAIClientInstance) {
		unifiedAIClientInstance = new UnifiedAIClient({
			nerServiceUrl: process.env.NER_SERVICE_URL ?? "http://dicta-ner:5007",
			embeddingClient,
			config,
			nerTimeoutMs: parseInt(process.env.NER_SERVICE_TIMEOUT_MS ?? "2000"),
			nerMinConfidence: parseFloat(process.env.NER_MIN_CONFIDENCE ?? "0.85"),
			enableNer: process.env.NER_SERVICE_ENABLED !== "false",
		});
	}
	return unifiedAIClientInstance;
}

export function resetUnifiedAIClient(): void {
	unifiedAIClientInstance = null;
}
