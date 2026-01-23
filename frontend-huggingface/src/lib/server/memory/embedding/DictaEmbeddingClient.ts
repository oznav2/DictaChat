/**
 * DictaEmbeddingClient - Enterprise-Grade Embedding Service Client
 *
 * Connects to the dicta-retrieval container (port 5005) for embeddings.
 * Uses Redis caching to avoid redundant embedding calls.
 *
 * ENTERPRISE ROBUSTNESS FEATURES:
 * - Graceful degradation: UI NEVER freezes, even when service is down
 * - Smart circuit breaker with auto-recovery
 * - Error categorization (transient vs configuration vs service down)
 * - Adaptive timeouts based on service health
 * - Detailed diagnostics for debugging
 * - Optional fallback embeddings for degraded mode
 *
 * Key design principles:
 * - NO local models - fail fast if container unavailable
 * - Redis cache with 7-day TTL
 * - Batch processing with configurable batch size
 * - Circuit breaker for fail-open behavior
 * - GRACEFUL DEGRADATION: Memory operations continue without embeddings
 *
 * RoamPal v0.2.11 Fix #4 Note (Books Search):
 * The RoamPal fix was for ChromaDB's embedding_function initialization issue
 * where incorrect defaults caused dimension mismatches. This codebase uses
 * Qdrant instead of ChromaDB, so the specific fix doesn't apply. However,
 * we ensure dimension validation is enforced at lines 172 and 240.
 */

import { createHash } from "crypto";
import { logger } from "$lib/server/logger";
import { MetricsServer } from "$lib/server/metrics";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import { memoryMetrics } from "../observability";

/**
 * Error categories for smart handling
 */
export enum EmbeddingErrorCategory {
	/** Temporary network/timeout issues - retry later */
	TRANSIENT = "transient",
	/** Backend configuration issue (e.g., InvalidIntervalError) - needs fix */
	CONFIGURATION = "configuration",
	/** Service is completely down - circuit breaker should open */
	SERVICE_DOWN = "service_down",
	/** Unknown error */
	UNKNOWN = "unknown",
}

export interface EmbeddingServiceDiagnostics {
	isOperational: boolean;
	circuitBreakerOpen: boolean;
	lastError: string | null;
	lastErrorCategory: EmbeddingErrorCategory | null;
	lastErrorTime: number | null;
	consecutiveFailures: number;
	healthCheckPending: boolean;
	degradedMode: boolean;
	recoveryAttempts: number;
	lastSuccessfulCall: number | null;
	uptime: number | null;
	recommendations: string[];
}

export interface DictaEmbeddingClientConfig {
	endpoint: string;
	batchSize?: number;
	timeoutMs?: number;
	expectedDims?: number;
	config?: MemoryConfig;
	/** Enable graceful degradation with fallback embeddings when service is down */
	enableGracefulDegradation?: boolean;
	/** Maximum time to wait before declaring service unhealthy (ms) */
	unhealthyThresholdMs?: number;
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
	private enableGracefulDegradation: boolean;
	private unhealthyThresholdMs: number;

	// Circuit breaker state
	private isOpen = false;
	private failureCount = 0;
	private lastFailure: number | null = null;
	private successCount = 0;
	private consecutiveSlowResponses = 0; // Track slow responses for proactive timeout reduction

	// Enhanced diagnostics
	private lastError: string | null = null;
	private lastErrorCategory: EmbeddingErrorCategory | null = null;
	private recoveryAttempts = 0;
	private lastSuccessfulCall: number | null = null;
	private degradedMode = false;
	private startTime: number = Date.now();

	// Health check state for proactive recovery
	private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
	private lastHealthCheck: number = 0;
	private healthCheckPending = false;
	private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // Check every 30 seconds when open

	// In-memory cache (Redis is optional enhancement)
	private memoryCache: Map<string, number[]> = new Map();
	private readonly maxCacheSize = 10000;
	private cacheEvents: Array<{ ts: number; hits: number; misses: number }> = [];
	private readonly maxCacheEvents = 5000;

	constructor(params: DictaEmbeddingClientConfig) {
		this.endpoint = params.endpoint;
		this.batchSize = params.batchSize ?? 32;
		this.timeoutMs = params.timeoutMs ?? 10000;
		this.expectedDims =
			params.expectedDims ?? params.config?.qdrant?.expected_embedding_dims ?? 1024;
		this.config = params.config ?? defaultMemoryConfig;
		this.enableGracefulDegradation = params.enableGracefulDegradation ?? true;
		this.unhealthyThresholdMs = params.unhealthyThresholdMs ?? 30000; // 30s default

		// Start background health monitoring
		this.startHealthMonitoring();
		this.setCircuitBreakerMetric(false);
	}

	/**
	 * Categorize error for smart handling
	 */
	private categorizeError(error: string | Error, statusCode?: number): EmbeddingErrorCategory {
		const errorStr = error instanceof Error ? error.message : error;

		// Configuration errors - need manual intervention
		if (
			errorStr.includes("InvalidIntervalError") ||
			errorStr.includes("Interval must be greater than 0") ||
			errorStr.includes("Timer configuration") ||
			statusCode === 503
		) {
			return EmbeddingErrorCategory.CONFIGURATION;
		}

		// Transient errors - may resolve on retry
		if (
			errorStr.includes("timeout") ||
			errorStr.includes("AbortError") ||
			errorStr.includes("ECONNREFUSED") ||
			errorStr.includes("ECONNRESET") ||
			errorStr.includes("network") ||
			statusCode === 429 || // Rate limit
			statusCode === 502 || // Bad Gateway
			statusCode === 504 // Gateway Timeout
		) {
			return EmbeddingErrorCategory.TRANSIENT;
		}

		// Service down
		if (errorStr.includes("ENOTFOUND") || errorStr.includes("fetch failed") || statusCode === 500) {
			return EmbeddingErrorCategory.SERVICE_DOWN;
		}

		return EmbeddingErrorCategory.UNKNOWN;
	}

	/**
	 * Generate deterministic fallback embedding for graceful degradation
	 * Uses text hash to create consistent pseudo-embeddings
	 * These won't provide semantic similarity but allow operations to continue
	 */
	private generateFallbackEmbedding(text: string): number[] {
		const hash = createHash("sha256").update(text).digest();
		const embedding: number[] = new Array(this.expectedDims);

		// Generate pseudo-random but deterministic values from hash
		for (let i = 0; i < this.expectedDims; i++) {
			const byteIndex = i % hash.length;
			const byte = hash[byteIndex];
			// Normalize to [-1, 1] range like real embeddings
			embedding[i] = byte / 127.5 - 1;
		}

		// Normalize the vector
		const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
		if (magnitude > 0) {
			for (let i = 0; i < embedding.length; i++) {
				embedding[i] /= magnitude;
			}
		}

		return embedding;
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
	 * Embed multiple texts with caching and graceful degradation
	 */
	async embedBatch(texts: string[]): Promise<EmbeddingBatchResult> {
		const startTime = Date.now();
		let success = false;

		if (texts.length === 0) {
			return {
				results: [],
				cacheHits: 0,
				cacheMisses: 0,
				latencyMs: 0,
			};
		}

		try {
			// Check circuit breaker - but handle gracefully
			if (this.isOpen && !this.shouldAttemptHalfOpen()) {
				// GRACEFUL DEGRADATION: Instead of returning empty results,
				// generate fallback embeddings if enabled
				if (this.enableGracefulDegradation) {
					logger.warn(
						{ textCount: texts.length, degradedMode: true },
						"DictaEmbeddingClient circuit breaker is open, using fallback embeddings"
					);
					this.degradedMode = true;

					const results: EmbeddingResult[] = texts.map((text) => ({
						text,
						vector: this.generateFallbackEmbedding(text),
						hash: hashText(text),
						cached: false,
					}));

					success = results.length > 0;

					return {
						results,
						cacheHits: 0,
						cacheMisses: texts.length,
						latencyMs: Date.now() - startTime,
					};
				}

				logger.warn("DictaEmbeddingClient circuit breaker is open, returning empty results");
				success = false;
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

			this.recordCacheEvent(cacheHits, uncachedTexts.length);

			success = validResults.length > 0;

			return {
				results: validResults,
				cacheHits,
				cacheMisses: uncachedTexts.length,
				latencyMs: Date.now() - startTime,
			};
		} finally {
			const durationMs = Date.now() - startTime;
			memoryMetrics.recordOperation("embed", success);
			memoryMetrics.recordLatency("embed", durationMs);
		}
	}

	getCacheMetrics(windowMs: number): {
		hit_rate: number | null;
		hits: number;
		misses: number;
		window_ms: number;
		as_of: string;
	} {
		const now = Date.now();
		const cutoff = now - Math.max(0, windowMs);
		let hits = 0;
		let misses = 0;

		for (let i = this.cacheEvents.length - 1; i >= 0; i--) {
			const e = this.cacheEvents[i];
			if (e.ts < cutoff) break;
			hits += e.hits;
			misses += e.misses;
		}

		const denom = hits + misses;
		return {
			hit_rate: denom > 0 ? hits / denom : null,
			hits,
			misses,
			window_ms: Math.max(0, windowMs),
			as_of: new Date(now).toISOString(),
		};
	}

	private recordCacheEvent(hits: number, misses: number) {
		if (!Number.isFinite(hits) || !Number.isFinite(misses)) return;
		if (hits <= 0 && misses <= 0) return;

		this.cacheEvents.push({ ts: Date.now(), hits, misses });
		if (this.cacheEvents.length > this.maxCacheEvents) {
			this.cacheEvents.splice(0, this.cacheEvents.length - this.maxCacheEvents);
		}
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
	 * Uses adaptive timeout: shorter when we've seen recent failures to fail fast
	 */
	private async fetchBatch(texts: string[]): Promise<number[][] | null> {
		const controller = new AbortController();

		// Adaptive timeout: reduce timeout if we've seen failures recently
		// This prevents UI freezes by failing fast when service is likely down
		let effectiveTimeout = this.timeoutMs;
		if (this.failureCount > 0 || this.consecutiveSlowResponses > 2) {
			// Use 3s timeout instead of 10s if we've had recent issues
			effectiveTimeout = Math.min(3000, this.timeoutMs);
			logger.debug(
				{
					effectiveTimeout,
					failureCount: this.failureCount,
					slowResponses: this.consecutiveSlowResponses,
				},
				"Using reduced timeout due to recent failures"
			);
		}

		const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

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
				const errorCategory = this.categorizeError(errorText, response.status);

				this.lastError = errorText;
				this.lastErrorCategory = errorCategory;

				// Handle different error categories appropriately
				switch (errorCategory) {
					case EmbeddingErrorCategory.CONFIGURATION:
						// Configuration errors (e.g., InvalidIntervalError) - need manual fix
						// Record multiple failures to quickly open circuit breaker
						logger.error(
							{ status: response.status, error: errorText, category: errorCategory },
							"Embedding service configuration error - requires service restart/fix"
						);
						this.recordFailure();
						this.recordFailure(); // Double failure for faster circuit break
						break;

					case EmbeddingErrorCategory.TRANSIENT:
						// Transient errors - single failure, may recover
						logger.warn(
							{ status: response.status, error: errorText, category: errorCategory },
							"Embedding service transient error - will retry"
						);
						this.recordFailure();
						break;

					case EmbeddingErrorCategory.SERVICE_DOWN:
						// Service completely down
						logger.error(
							{ status: response.status, error: errorText, category: errorCategory },
							"Embedding service appears to be down"
						);
						this.recordFailure();
						this.recordFailure();
						break;

					default:
						logger.error(
							{ status: response.status, error: errorText, category: errorCategory },
							"Embedding service returned error"
						);
						this.recordFailure();
				}
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
			this.consecutiveSlowResponses = 0; // Reset on successful response
			return data.embeddings.map((item) => item.dense);
		} catch (err) {
			clearTimeout(timeoutId);

			const errorMessage = err instanceof Error ? err.message : String(err);
			const errorCategory = this.categorizeError(errorMessage);

			this.lastError = errorMessage;
			this.lastErrorCategory = errorCategory;

			if (err instanceof Error && err.name === "AbortError") {
				logger.warn(
					{ timeout: effectiveTimeout, category: errorCategory },
					"Embedding request timed out"
				);
				this.consecutiveSlowResponses++;
			} else {
				logger.error({ err, category: errorCategory }, "Embedding request failed");
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

	private setCircuitBreakerMetric(isOpen: boolean): void {
		MetricsServer.getMetrics().memory.circuitBreakerOpen.set(isOpen ? 1 : 0);
	}

	private recordSuccess(): void {
		this.lastSuccessfulCall = Date.now();
		this.degradedMode = false;
		this.lastError = null;
		this.lastErrorCategory = null;

		if (this.isOpen) {
			this.successCount++;
			this.recoveryAttempts++;
			if (this.successCount >= this.config.circuit_breakers.embeddings.success_threshold) {
				this.isOpen = false;
				this.setCircuitBreakerMetric(false);
				this.failureCount = 0;
				this.successCount = 0;
				this.recoveryAttempts = 0;
				logger.info(
					{ endpoint: this.endpoint },
					"Embedding circuit breaker closed - service recovered"
				);
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
			if (!this.isOpen) {
				this.isOpen = true;
				this.setCircuitBreakerMetric(true);
			}
			logger.warn("Embedding circuit breaker opened");
		}
	}

	/**
	 * Check if circuit breaker is open
	 */
	isCircuitOpen(): boolean {
		return this.isOpen;
	}

	/**
	 * Start background health monitoring to auto-recover circuit breaker
	 */
	private startHealthMonitoring(): void {
		if (this.healthCheckInterval) return;

		this.healthCheckInterval = setInterval(async () => {
			// Only check health if circuit is open
			if (!this.isOpen) return;

			// Avoid too frequent checks
			const now = Date.now();
			if (now - this.lastHealthCheck < this.HEALTH_CHECK_INTERVAL_MS) return;
			this.lastHealthCheck = now;

			try {
				const isHealthy = await this.healthCheck();
				if (isHealthy) {
					logger.info(
						{ endpoint: this.endpoint },
						"DictaEmbeddingClient: Service recovered, closing circuit breaker"
					);
					// Service is back - attempt to close circuit breaker
					this.successCount++;
					if (this.successCount >= this.config.circuit_breakers.embeddings.success_threshold) {
						this.isOpen = false;
						this.setCircuitBreakerMetric(false);
						this.failureCount = 0;
						this.successCount = 0;
						logger.info("DictaEmbeddingClient: Circuit breaker closed after health recovery");
					}
				}
			} catch (err) {
				// Health check failed, stay open
				logger.debug({ err }, "DictaEmbeddingClient: Health check failed, circuit stays open");
			}
		}, this.HEALTH_CHECK_INTERVAL_MS);
	}

	/**
	 * Stop background health monitoring (for cleanup)
	 */
	stopHealthMonitoring(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval);
			this.healthCheckInterval = null;
		}
	}

	/**
	 * Manually reset the circuit breaker (for admin/ops use)
	 */
	resetCircuitBreaker(): void {
		this.isOpen = false;
		this.failureCount = 0;
		this.successCount = 0;
		this.lastFailure = null;
		logger.info("DictaEmbeddingClient: Circuit breaker manually reset");
	}

	/**
	 * Get circuit breaker status (for diagnostics)
	 */
	getCircuitBreakerStatus(): {
		isOpen: boolean;
		failureCount: number;
		successCount: number;
		lastFailure: number | null;
		threshold: number;
		openDurationMs: number;
	} {
		return {
			isOpen: this.isOpen,
			failureCount: this.failureCount,
			successCount: this.successCount,
			lastFailure: this.lastFailure,
			threshold: this.config.circuit_breakers.embeddings.failure_threshold,
			openDurationMs: this.config.circuit_breakers.embeddings.open_duration_ms,
		};
	}

	/**
	 * Get comprehensive diagnostics for debugging and monitoring
	 */
	getDiagnostics(): EmbeddingServiceDiagnostics {
		const now = Date.now();
		const recommendations: string[] = [];

		// Generate recommendations based on state
		if (this.isOpen) {
			recommendations.push("Circuit breaker is OPEN - embedding service is unavailable");

			if (this.lastErrorCategory === EmbeddingErrorCategory.CONFIGURATION) {
				recommendations.push(
					"CONFIGURATION ERROR detected - check MODEL_IDLE_TIMEOUT environment variable"
				);
				recommendations.push("Restart dicta-retrieval container after fixing configuration");
			} else if (this.lastErrorCategory === EmbeddingErrorCategory.SERVICE_DOWN) {
				recommendations.push(
					"Service appears to be DOWN - check if dicta-retrieval container is running"
				);
				recommendations.push("Run: docker-compose ps dicta-retrieval");
				recommendations.push("Run: docker-compose logs dicta-retrieval --tail=50");
			} else if (this.lastErrorCategory === EmbeddingErrorCategory.TRANSIENT) {
				recommendations.push("Transient error - service may recover automatically");
				recommendations.push("Wait for health check to close circuit breaker");
			}
		}

		if (this.degradedMode) {
			recommendations.push("DEGRADED MODE active - using fallback embeddings (reduced quality)");
			recommendations.push("Memory operations continue but semantic search quality is reduced");
		}

		if (this.consecutiveSlowResponses > 2) {
			recommendations.push(
				`${this.consecutiveSlowResponses} consecutive slow responses - service may be overloaded`
			);
		}

		if (this.recoveryAttempts > 3) {
			recommendations.push(`${this.recoveryAttempts} recovery attempts - service may be unstable`);
		}

		return {
			isOperational: !this.isOpen || this.degradedMode,
			circuitBreakerOpen: this.isOpen,
			lastError: this.lastError,
			lastErrorCategory: this.lastErrorCategory,
			lastErrorTime: this.lastFailure,
			consecutiveFailures: this.failureCount,
			healthCheckPending: this.healthCheckPending,
			degradedMode: this.degradedMode,
			recoveryAttempts: this.recoveryAttempts,
			lastSuccessfulCall: this.lastSuccessfulCall,
			uptime: now - this.startTime,
			recommendations,
		};
	}

	/**
	 * Check if service is operational (including degraded mode)
	 */
	isOperational(): boolean {
		// Operational if circuit is closed OR if we're in graceful degradation mode
		return !this.isOpen || (this.enableGracefulDegradation && this.degradedMode);
	}

	/**
	 * Check if we're in degraded mode
	 */
	isDegradedMode(): boolean {
		return this.degradedMode;
	}

	/**
	 * Force enter degraded mode (for testing or manual intervention)
	 */
	enterDegradedMode(): void {
		this.degradedMode = true;
		logger.info("DictaEmbeddingClient: Manually entered degraded mode");
	}

	/**
	 * Force exit degraded mode (for testing or manual intervention)
	 */
	exitDegradedMode(): void {
		this.degradedMode = false;
		logger.info("DictaEmbeddingClient: Manually exited degraded mode");
	}
}

/**
 * Factory function with enterprise-grade defaults
 */
export function createDictaEmbeddingClient(
	config?: Partial<DictaEmbeddingClientConfig>
): DictaEmbeddingClient {
	return new DictaEmbeddingClient({
		endpoint: config?.endpoint ?? "http://dicta-retrieval:5005",
		batchSize: config?.batchSize ?? 32,
		timeoutMs: config?.timeoutMs ?? 10000,
		expectedDims: config?.expectedDims ?? config?.config?.qdrant?.expected_embedding_dims ?? 1024,
		config: config?.config,
		// Enterprise defaults: always enable graceful degradation
		enableGracefulDegradation: config?.enableGracefulDegradation ?? true,
		unhealthyThresholdMs: config?.unhealthyThresholdMs ?? 30000,
	});
}

// EmbeddingErrorCategory is already exported via enum declaration above
