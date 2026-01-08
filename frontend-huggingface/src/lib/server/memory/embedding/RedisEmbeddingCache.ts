/**
 * RedisEmbeddingCache - Redis-backed embedding cache for Memory System
 *
 * Stores embeddings with 7-day TTL to avoid redundant embedding calls.
 * Uses binary packing for efficient storage.
 *
 * Key format: embedding:v1:{model_version}:{md5_hash_of_normalized_text}
 */

import { createHash } from "crypto";
import { logger } from "$lib/server/logger";

export interface RedisEmbeddingCacheConfig {
	redisUrl: string;
	ttlSeconds?: number;
	modelVersion?: string;
	keyPrefix?: string;
}

export interface CacheGetResult {
	vector: number[] | null;
	hit: boolean;
}

export interface CacheBatchGetResult {
	results: Map<string, number[]>;
	hits: number;
	misses: number;
}

/**
 * Normalize text for consistent hashing
 */
function normalizeText(text: string): string {
	return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Generate cache key for text
 */
function generateKey(text: string, prefix: string, modelVersion: string): string {
	const normalized = normalizeText(text);
	const hash = createHash("md5").update(normalized).digest("hex");
	return `${prefix}:${modelVersion}:${hash}`;
}

/**
 * Pack float32 array to Buffer for efficient storage
 */
function packVector(vector: number[]): Buffer {
	const buffer = Buffer.alloc(vector.length * 4);
	for (let i = 0; i < vector.length; i++) {
		buffer.writeFloatLE(vector[i], i * 4);
	}
	return buffer;
}

/**
 * Unpack Buffer to float32 array
 */
function unpackVector(buffer: Buffer): number[] {
	const vector: number[] = [];
	for (let i = 0; i < buffer.length; i += 4) {
		vector.push(buffer.readFloatLE(i));
	}
	return vector;
}

/**
 * Redis client interface - supports both ioredis and node-redis
 */
interface RedisClientLike {
	get(key: string): Promise<string | Buffer | null>;
	set(key: string, value: string | Buffer, options?: { EX?: number }): Promise<unknown>;
	setex?(key: string, seconds: number, value: string | Buffer): Promise<unknown>;
	mget(...keys: string[]): Promise<Array<string | Buffer | null>>;
	del(...keys: string[]): Promise<number>;
	expire(key: string, seconds: number): Promise<number>;
	pipeline?(): RedisPipelineLike;
}

interface RedisPipelineLike {
	setex(key: string, seconds: number, value: string | Buffer): RedisPipelineLike;
	set(key: string, value: string | Buffer, mode: string, duration: number): RedisPipelineLike;
	exec(): Promise<unknown>;
}

export class RedisEmbeddingCache {
	private client: RedisClientLike | null = null;
	private ttlSeconds: number;
	private modelVersion: string;
	private keyPrefix: string;
	private connected = false;

	constructor(config: RedisEmbeddingCacheConfig) {
		this.ttlSeconds = config.ttlSeconds ?? 604800; // 7 days
		this.modelVersion = config.modelVersion ?? "v1";
		this.keyPrefix = config.keyPrefix ?? "embedding";

		// Lazy initialization - don't connect until first use
		this.initClient(config.redisUrl);
	}

	/**
	 * Initialize Redis client
	 */
	private async initClient(redisUrl: string): Promise<void> {
		try {
			// Dynamic import to avoid bundling issues
			const Redis = await import("ioredis").then((m) => m.default).catch(() => null);

			if (Redis) {
				this.client = new Redis(redisUrl, {
					maxRetriesPerRequest: 3,
					retryStrategy: (times) => Math.min(times * 100, 3000),
					lazyConnect: true,
				}) as unknown as RedisClientLike;
				this.connected = true;
				logger.info("RedisEmbeddingCache initialized with ioredis");
			} else {
				logger.warn("ioredis not available, RedisEmbeddingCache will be disabled");
			}
		} catch (err) {
			logger.warn({ err }, "Failed to initialize Redis client");
		}
	}

	/**
	 * Get a single embedding from cache
	 */
	async get(text: string): Promise<CacheGetResult> {
		if (!this.client || !this.connected) {
			return { vector: null, hit: false };
		}

		try {
			const key = generateKey(text, this.keyPrefix, this.modelVersion);
			const data = await this.client.get(key);

			if (!data) {
				return { vector: null, hit: false };
			}

			// Convert to Buffer if string
			const buffer = typeof data === "string" ? Buffer.from(data, "base64") : data;
			const vector = unpackVector(buffer);

			// Refresh TTL on hit
			this.client.expire(key, this.ttlSeconds).catch(() => {});

			return { vector, hit: true };
		} catch (err) {
			logger.warn({ err }, "Redis cache get failed");
			return { vector: null, hit: false };
		}
	}

	/**
	 * Get multiple embeddings from cache
	 */
	async getBatch(texts: string[]): Promise<CacheBatchGetResult> {
		if (!this.client || !this.connected || texts.length === 0) {
			return {
				results: new Map(),
				hits: 0,
				misses: texts.length,
			};
		}

		try {
			const keys = texts.map((t) => generateKey(t, this.keyPrefix, this.modelVersion));
			const values = await this.client.mget(...keys);

			const results = new Map<string, number[]>();
			let hits = 0;

			for (let i = 0; i < texts.length; i++) {
				const data = values[i];
				if (data) {
					const buffer = typeof data === "string" ? Buffer.from(data, "base64") : data;
					const vector = unpackVector(buffer);
					results.set(texts[i], vector);
					hits++;

					// Refresh TTL (fire and forget)
					this.client.expire(keys[i], this.ttlSeconds).catch(() => {});
				}
			}

			return {
				results,
				hits,
				misses: texts.length - hits,
			};
		} catch (err) {
			logger.warn({ err }, "Redis cache batch get failed");
			return {
				results: new Map(),
				hits: 0,
				misses: texts.length,
			};
		}
	}

	/**
	 * Store a single embedding in cache
	 */
	async set(text: string, vector: number[]): Promise<boolean> {
		if (!this.client || !this.connected) {
			return false;
		}

		try {
			const key = generateKey(text, this.keyPrefix, this.modelVersion);
			const buffer = packVector(vector);
			const base64 = buffer.toString("base64");

			if (this.client.setex) {
				await this.client.setex(key, this.ttlSeconds, base64);
			} else {
				await this.client.set(key, base64, { EX: this.ttlSeconds });
			}

			return true;
		} catch (err) {
			logger.warn({ err }, "Redis cache set failed");
			return false;
		}
	}

	/**
	 * Store multiple embeddings in cache (pipelined)
	 */
	async setBatch(entries: Array<{ text: string; vector: number[] }>): Promise<number> {
		if (!this.client || !this.connected || entries.length === 0) {
			return 0;
		}

		try {
			let successCount = 0;

			// Use pipeline if available
			if (this.client.pipeline) {
				const pipeline = this.client.pipeline();

				for (const entry of entries) {
					const key = generateKey(entry.text, this.keyPrefix, this.modelVersion);
					const buffer = packVector(entry.vector);
					const base64 = buffer.toString("base64");
					pipeline.setex(key, this.ttlSeconds, base64);
				}

				await pipeline.exec();
				successCount = entries.length;
			} else {
				// Fallback to sequential sets
				for (const entry of entries) {
					const success = await this.set(entry.text, entry.vector);
					if (success) successCount++;
				}
			}

			return successCount;
		} catch (err) {
			logger.warn({ err }, "Redis cache batch set failed");
			return 0;
		}
	}

	/**
	 * Delete an embedding from cache
	 */
	async delete(text: string): Promise<boolean> {
		if (!this.client || !this.connected) {
			return false;
		}

		try {
			const key = generateKey(text, this.keyPrefix, this.modelVersion);
			await this.client.del(key);
			return true;
		} catch (err) {
			logger.warn({ err }, "Redis cache delete failed");
			return false;
		}
	}

	/**
	 * Check if cache is available
	 */
	isAvailable(): boolean {
		return this.connected && this.client !== null;
	}

	/**
	 * Generate key for a text (for external use)
	 */
	generateKey(text: string): string {
		return generateKey(text, this.keyPrefix, this.modelVersion);
	}
}

/**
 * Factory function
 */
export function createRedisEmbeddingCache(
	config?: Partial<RedisEmbeddingCacheConfig>
): RedisEmbeddingCache {
	return new RedisEmbeddingCache({
		redisUrl: config?.redisUrl ?? "redis://localhost:6379",
		ttlSeconds: config?.ttlSeconds ?? 604800,
		modelVersion: config?.modelVersion ?? "v1",
		keyPrefix: config?.keyPrefix ?? "embedding",
	});
}
