/**
 * ContextualEmbeddingService - LLM-powered contextual embedding preparation
 *
 * Adds LLM-generated context prefixes to chunks before embedding for improved retrieval.
 * Uses Redis caching to avoid redundant LLM calls.
 *
 * Key design principles:
 * - Generate context prefix using LLM for better semantic understanding
 * - Cache results using SHA256 hash as key
 * - Timeout after 5 seconds with fallback to empty prefix
 * - Batch processing with max 5 concurrent requests
 */

import { createHash } from "crypto";
import { logger } from "$lib/server/logger";
import { getMemoryEnvConfig } from "./featureFlags";
import type { MemoryConfig } from "./memory_config";
import { defaultMemoryConfig } from "./memory_config";

export interface ContextualEmbeddingConfig {
	enabled: boolean;
	timeout_ms: number; // Default: 5000
	cache_ttl_hours: number; // Default: 24
	model?: string; // Optional, uses default LLM
	llmBaseUrl?: string; // Optional, uses default from env
	maxConcurrent?: number; // Default: 5
	memoryConfig?: MemoryConfig;
}

export interface ContextualChunk {
	original_text: string;
	context_prefix: string;
	combined_text: string;
	vector_hash: string; // SHA256 of combined_text for cache key
}

/**
 * Redis client interface - supports both ioredis and node-redis
 */
interface RedisClientLike {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
	setex?(key: string, seconds: number, value: string): Promise<unknown>;
	mget(...keys: string[]): Promise<Array<string | null>>;
}

/**
 * Generate SHA256 hash for cache key
 */
function generateVectorHash(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<ContextualEmbeddingConfig, "memoryConfig">> = {
	enabled: true,
	timeout_ms: 5000,
	cache_ttl_hours: 24,
	model: "",
	llmBaseUrl: "",
	maxConcurrent: 5,
};

export class ContextualEmbeddingService {
	private config: Required<Omit<ContextualEmbeddingConfig, "memoryConfig">>;
	private memoryConfig: MemoryConfig;
	private redisClient: RedisClientLike | null = null;
	private connected = false;
	private envConfig = getMemoryEnvConfig();

	// Circuit breaker state
	private isOpen = false;
	private failureCount = 0;
	private lastFailure: number | null = null;
	private successCount = 0;

	constructor(config: Partial<ContextualEmbeddingConfig> = {}) {
		this.config = {
			enabled: config.enabled ?? DEFAULT_CONFIG.enabled,
			timeout_ms: config.timeout_ms ?? DEFAULT_CONFIG.timeout_ms,
			cache_ttl_hours: config.cache_ttl_hours ?? DEFAULT_CONFIG.cache_ttl_hours,
			model: config.model ?? DEFAULT_CONFIG.model,
			llmBaseUrl: config.llmBaseUrl ?? DEFAULT_CONFIG.llmBaseUrl,
			maxConcurrent: config.maxConcurrent ?? DEFAULT_CONFIG.maxConcurrent,
		};
		this.memoryConfig = config.memoryConfig ?? defaultMemoryConfig;

		// Initialize Redis connection lazily
		this.initRedis();
	}

	/**
	 * Initialize Redis client for caching
	 */
	private async initRedis(): Promise<void> {
		try {
			const Redis = await import("ioredis").then((m) => m.default).catch(() => null);

			if (Redis) {
				const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
				this.redisClient = new Redis(redisUrl, {
					maxRetriesPerRequest: 3,
					retryStrategy: (times: number) => Math.min(times * 100, 3000),
					lazyConnect: true,
				}) as unknown as RedisClientLike;
				this.connected = true;
				logger.info("ContextualEmbeddingService Redis cache initialized");
			} else {
				logger.warn("ioredis not available, ContextualEmbeddingService cache will be disabled");
			}
		} catch (err) {
			logger.warn({ err }, "Failed to initialize Redis client for ContextualEmbeddingService");
		}
	}

	/**
	 * Get the LLM endpoint URL
	 */
	private getLlmUrl(): string {
		return this.config.llmBaseUrl || this.envConfig.llmBaseUrl || "http://bricksllm:8002/v1";
	}

	/**
	 * Get the model to use for context generation
	 */
	private getModel(): string {
		return this.config.model || this.envConfig.llmModel || "dictalm-3.0";
	}

	/**
	 * Generate cache key for context prefix
	 */
	private getCacheKey(vectorHash: string): string {
		return `ce:context:${vectorHash}`;
	}

	/**
	 * Get cached context prefix
	 */
	async getCachedContext(vectorHash: string): Promise<string | null> {
		if (!this.redisClient || !this.connected) {
			return null;
		}

		try {
			const key = this.getCacheKey(vectorHash);
			const cached = await this.redisClient.get(key);
			return cached;
		} catch (err) {
			logger.warn({ err }, "Redis cache get failed for context prefix");
			return null;
		}
	}

	/**
	 * Cache context prefix
	 */
	async cacheContext(vectorHash: string, contextPrefix: string): Promise<void> {
		if (!this.redisClient || !this.connected) {
			return;
		}

		try {
			const key = this.getCacheKey(vectorHash);
			const ttlSeconds = this.config.cache_ttl_hours * 3600;

			if (this.redisClient.setex) {
				await this.redisClient.setex(key, ttlSeconds, contextPrefix);
			} else {
				await this.redisClient.set(key, contextPrefix, { EX: ttlSeconds });
			}
		} catch (err) {
			logger.warn({ err }, "Redis cache set failed for context prefix");
		}
	}

	/**
	 * Generate context prefix using LLM
	 */
	async generateContextPrefix(chunk: string, documentContext?: string): Promise<string> {
		if (!this.config.enabled) {
			return "";
		}

		// Check circuit breaker
		if (this.isOpen && !this.shouldAttemptHalfOpen()) {
			logger.debug("ContextualEmbeddingService circuit breaker is open, returning empty prefix");
			return "";
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.config.timeout_ms);

		try {
			const prompt = this.buildPrompt(chunk, documentContext);
			const llmUrl = this.getLlmUrl();
			const model = this.getModel();

			const response = await fetch(`${llmUrl}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model,
					messages: [
						{
							role: "system",
							content:
								"You are a helpful assistant that generates concise context summaries for text chunks. " +
								"Your summaries help retrieval systems understand the content better. " +
								"Respond with only the context summary, no explanations or preamble.",
						},
						{
							role: "user",
							content: prompt,
						},
					],
					max_tokens: 100,
					temperature: 0.3,
					stream: false,
				}),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorText = await response.text().catch(() => "Unknown error");
				logger.warn(
					{ status: response.status, error: errorText },
					"LLM context prefix generation failed"
				);
				this.recordFailure();
				return "";
			}

			const data = (await response.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
			};

			const content = data.choices?.[0]?.message?.content?.trim() ?? "";
			this.recordSuccess();

			return content;
		} catch (err) {
			clearTimeout(timeoutId);

			if (err instanceof Error && err.name === "AbortError") {
				logger.warn(
					{ timeout: this.config.timeout_ms },
					"Context prefix generation timed out, falling back to empty prefix"
				);
			} else {
				logger.warn({ err }, "Context prefix generation failed");
			}

			this.recordFailure();
			return "";
		}
	}

	/**
	 * Build the prompt for context generation
	 */
	private buildPrompt(chunk: string, documentContext?: string): string {
		const docContextPart = documentContext
			? `\n\nDocument context: ${documentContext.slice(0, 500)}`
			: "";

		return (
			`Given this text chunk, provide a 1-2 sentence context summary that would help a retrieval system understand what this chunk is about.` +
			docContextPart +
			`\n\nChunk: ${chunk.slice(0, 2000)}`
		);
	}

	/**
	 * Combine context with chunk for embedding
	 */
	async prepareForEmbedding(chunk: string, documentContext?: string): Promise<ContextualChunk> {
		// First, check if we have a cached context for this chunk
		const originalHash = generateVectorHash(chunk);
		const cachedPrefix = await this.getCachedContext(originalHash);

		let contextPrefix: string;
		if (cachedPrefix !== null) {
			contextPrefix = cachedPrefix;
			logger.debug({ hash: originalHash }, "Using cached context prefix");
		} else {
			// Generate new context prefix
			contextPrefix = await this.generateContextPrefix(chunk, documentContext);

			// Cache the result (even if empty, to avoid re-generating)
			await this.cacheContext(originalHash, contextPrefix);
		}

		// Combine context with original text
		const combined_text = contextPrefix ? `${contextPrefix}\n\n${chunk}` : chunk;
		const vector_hash = generateVectorHash(combined_text);

		return {
			original_text: chunk,
			context_prefix: contextPrefix,
			combined_text,
			vector_hash,
		};
	}

	/**
	 * Batch processing with caching and concurrency control
	 */
	async prepareBatch(chunks: string[], documentContext?: string): Promise<ContextualChunk[]> {
		if (chunks.length === 0) {
			return [];
		}

		const results: ContextualChunk[] = new Array(chunks.length);

		// Check cache for all chunks first
		const uncachedIndices: number[] = [];
		const hashes = chunks.map((chunk) => generateVectorHash(chunk));

		// Batch check cache
		if (this.redisClient && this.connected) {
			try {
				const cacheKeys = hashes.map((hash) => this.getCacheKey(hash));
				const cachedValues = await this.redisClient.mget(...cacheKeys);

				for (let i = 0; i < chunks.length; i++) {
					const cachedPrefix = cachedValues[i];
					if (cachedPrefix !== null) {
						// Use cached value
						const combined_text = cachedPrefix
							? `${cachedPrefix}\n\n${chunks[i]}`
							: chunks[i];
						results[i] = {
							original_text: chunks[i],
							context_prefix: cachedPrefix,
							combined_text,
							vector_hash: generateVectorHash(combined_text),
						};
					} else {
						uncachedIndices.push(i);
					}
				}
			} catch (err) {
				logger.warn({ err }, "Batch cache check failed, processing all chunks");
				uncachedIndices.push(...chunks.map((_, i) => i));
			}
		} else {
			// No cache, process all
			uncachedIndices.push(...chunks.map((_, i) => i));
		}

		// Process uncached chunks with concurrency limit
		if (uncachedIndices.length > 0) {
			const concurrentLimit = this.config.maxConcurrent;
			const batches: number[][] = [];

			for (let i = 0; i < uncachedIndices.length; i += concurrentLimit) {
				batches.push(uncachedIndices.slice(i, i + concurrentLimit));
			}

			for (const batch of batches) {
				const promises = batch.map(async (index) => {
					const chunk = chunks[index];
					const result = await this.prepareForEmbedding(chunk, documentContext);
					results[index] = result;
				});

				await Promise.all(promises);
			}
		}

		return results;
	}

	// ============================================
	// Circuit Breaker
	// ============================================

	private shouldAttemptHalfOpen(): boolean {
		if (!this.lastFailure) return true;
		const elapsed = Date.now() - this.lastFailure;
		return elapsed > this.memoryConfig.circuit_breakers.contextual_prefix.open_duration_ms;
	}

	private recordSuccess(): void {
		if (this.isOpen) {
			this.successCount++;
			if (
				this.successCount >= this.memoryConfig.circuit_breakers.contextual_prefix.success_threshold
			) {
				this.isOpen = false;
				this.failureCount = 0;
				this.successCount = 0;
				logger.info("ContextualEmbeddingService circuit breaker closed");
			}
		} else {
			this.failureCount = 0;
		}
	}

	private recordFailure(): void {
		this.failureCount++;
		this.successCount = 0;
		this.lastFailure = Date.now();
		if (
			this.failureCount >= this.memoryConfig.circuit_breakers.contextual_prefix.failure_threshold
		) {
			this.isOpen = true;
			logger.warn("ContextualEmbeddingService circuit breaker opened");
		}
	}

	/**
	 * Check if circuit breaker is open
	 */
	isCircuitOpen(): boolean {
		return this.isOpen;
	}

	/**
	 * Check if service is enabled
	 */
	isEnabled(): boolean {
		return this.config.enabled;
	}

	/**
	 * Check if cache is available
	 */
	isCacheAvailable(): boolean {
		return this.connected && this.redisClient !== null;
	}

	/**
	 * Get current configuration
	 */
	getConfig(): Readonly<typeof this.config> {
		return { ...this.config };
	}
}

/**
 * Factory function
 */
export function createContextualEmbeddingService(
	config?: Partial<ContextualEmbeddingConfig>
): ContextualEmbeddingService {
	return new ContextualEmbeddingService(config);
}
