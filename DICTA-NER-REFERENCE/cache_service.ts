import type { EmbeddingVector, CacheEntry } from '@/types/domain.js';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '@/config/env.js';

/**
 * Simple LRU (Least Recently Used) cache for embeddings
 * Prevents expensive recomputation of embeddings for frequently used texts
 */
export class EmbeddingCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly logger: FastifyBaseLogger,
    maxSize?: number,
    ttlMs?: number
  ) {
    this.maxSize = maxSize ?? config.CACHE_MAX_SIZE;
    this.ttlMs = ttlMs ?? config.CACHE_TTL_MS;

    this.logger.info(
      { maxSize: this.maxSize, ttlMs: this.ttlMs },
      'Embedding cache initialized'
    );
  }

  /**
   * Get embedding from cache
   */
  get(text: string): EmbeddingVector | null {
    const entry = this.cache.get(text);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(text);
      this.misses++;
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(text);
    this.cache.set(text, entry);

    this.hits++;
    return entry.embedding;
  }

  /**
   * Store embedding in cache
   */
  set(text: string, embedding: EmbeddingVector): void {
    // If cache is full, remove oldest entry (first in map)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    const entry: CacheEntry = {
      embedding,
      timestamp: Date.now(),
    };

    this.cache.set(text, entry);
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate,
    };
  }

  /**
   * Check if caching is enabled
   */
  static isEnabled(): boolean {
    return config.ENABLE_EMBEDDING_CACHE;
  }
}

/**
 * Cached embedding service wrapper
 * Adds caching layer on top of any embedding service
 */
export class CachedEmbeddingService {
  private readonly cache: EmbeddingCache | null;

  constructor(
    private readonly embeddingService: import('./embedding.service.js').IEmbeddingService,
    private readonly logger: FastifyBaseLogger
  ) {
    this.cache = EmbeddingCache.isEnabled()
      ? new EmbeddingCache(logger)
      : null;

    if (this.cache) {
      this.logger.info('Embedding caching enabled');
    } else {
      this.logger.info('Embedding caching disabled');
    }
  }

  /**
   * Generate embedding with caching
   */
  async generateEmbedding(
    text: import('@/types/domain.js').ValidatedText
  ): Promise<import('@/types/result.js').Result<EmbeddingVector, import('@/types/result.js').AppError>> {
    // Check cache first
    if (this.cache) {
      const cached = this.cache.get(text);
      if (cached) {
        this.logger.debug('Cache hit for embedding');
        return { success: true, data: cached };
      }
    }

    // Generate embedding
    const result = await this.embeddingService.generateEmbedding(text);

    // Store in cache if successful
    if (result.success && this.cache) {
      this.cache.set(text, result.data);
    }

    return result;
  }

  /**
   * Generate batch embeddings with caching
   */
  async generateBatchEmbeddings(
    texts: readonly import('@/types/domain.js').ValidatedText[]
  ): Promise<
    import('@/types/result.js').Result<
      readonly EmbeddingVector[],
      import('@/types/result.js').AppError
    >
  > {
    if (!this.cache) {
      // No caching, pass through
      return this.embeddingService.generateBatchEmbeddings(texts);
    }

    // Check which texts are in cache
    const embeddings: (EmbeddingVector | null)[] = texts.map(text =>
      this.cache!.get(text)
    );

    // Find texts that need to be generated
    const missingIndices: number[] = [];
    const missingTexts: import('@/types/domain.js').ValidatedText[] = [];

    embeddings.forEach((embedding, index) => {
      if (embedding === null) {
        missingIndices.push(index);
        missingTexts.push(texts[index]!);
      }
    });

    // Generate missing embeddings
    if (missingTexts.length > 0) {
      this.logger.debug(
        { cached: texts.length - missingTexts.length, missing: missingTexts.length },
        'Partial cache hit for batch'
      );

      const result = await this.embeddingService.generateBatchEmbeddings(missingTexts);
      if (!result.success) return result;

      // Fill in missing embeddings and update cache
      const newEmbeddings = result.data;
      missingIndices.forEach((index, i) => {
        const embedding = newEmbeddings[i]!;
        embeddings[index] = embedding;
        this.cache!.set(missingTexts[i]!, embedding);
      });
    }

    // All embeddings should now be present
    return {
      success: true,
      data: embeddings as EmbeddingVector[],
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache?.getStats() ?? null;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache?.clear();
  }
}