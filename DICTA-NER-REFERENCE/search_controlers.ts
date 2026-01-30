import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SemanticSearchService } from '@/services/search.service.js';
import type { CachedEmbeddingService } from '@/services/cache.service.js';
import {
  embeddingRequestSchema,
  batchEmbeddingRequestSchema,
  similarityRequestSchema,
  searchRequestSchema,
  createValidatedText,
  type EmbeddingResponse,
  type BatchEmbeddingResponse,
  type SimilarityResponse,
  type SearchResponse,
  type HealthResponse,
  type ModelInfo,
} from '@/types/domain.js';
import {
  errorToStatusCode,
  errorToMessage,
  createInvalidInputError,
} from '@/types/result.js';
import { config } from '@/config/env.js';

/**
 * Controller for semantic search endpoints
 * Handles HTTP request/response cycle with proper error handling
 */
export class SemanticSearchController {
  private readonly startTime = Date.now();

  constructor(
    private readonly searchService: SemanticSearchService,
    private readonly embeddingService: CachedEmbeddingService
  ) {}

  /**
   * Health check endpoint
   */
  async health(request: FastifyRequest, reply: FastifyReply): Promise<HealthResponse> {
    const modelInfo: ModelInfo = {
      ...this.embeddingService['embeddingService'].getModelInfo(),
      maxSequenceLength: config.MAX_SEQUENCE_LENGTH,
      isLoaded: this.embeddingService['embeddingService'].isReady(),
    };

    const response: HealthResponse = {
      status: modelInfo.isLoaded ? 'healthy' : 'unhealthy',
      model: modelInfo,
      uptime: Date.now() - this.startTime,
      version: '1.0.0',
    };

    reply.code(modelInfo.isLoaded ? 200 : 503);
    return response;
  }

  /**
   * Generate embedding for single text
   */
  async generateEmbedding(request: FastifyRequest, reply: FastifyReply) {
    const startTime = performance.now();

    // Validate request body
    const parseResult = embeddingRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Invalid request',
        details: parseResult.error.format(),
      };
    }

    const { text } = parseResult.data;

    try {
      const validatedText = createValidatedText(text);
      const result = await this.embeddingService.generateEmbedding(validatedText);

      if (!result.success) {
        reply.code(errorToStatusCode(result.error));
        return {
          error: errorToMessage(result.error),
          type: result.error.type,
        };
      }

      const response: EmbeddingResponse = {
        embedding: result.data,
        dimensions: result.data.length,
        processingTimeMs: Math.round(performance.now() - startTime),
      };

      return response;
    } catch (error) {
      request.log.error({ error }, 'Error generating embedding');
      reply.code(500);
      return {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateBatchEmbeddings(request: FastifyRequest, reply: FastifyReply) {
    const startTime = performance.now();

    // Validate request body
    const parseResult = batchEmbeddingRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Invalid request',
        details: parseResult.error.format(),
      };
    }

    const { texts } = parseResult.data;

    try {
      const validatedTexts = texts.map(text => createValidatedText(text));
      const result = await this.embeddingService.generateBatchEmbeddings(validatedTexts);

      if (!result.success) {
        reply.code(errorToStatusCode(result.error));
        return {
          error: errorToMessage(result.error),
          type: result.error.type,
        };
      }

      const response: BatchEmbeddingResponse = {
        embeddings: result.data,
        dimensions: result.data[0]?.length ?? 0,
        totalTexts: result.data.length,
        processingTimeMs: Math.round(performance.now() - startTime),
      };

      return response;
    } catch (error) {
      request.log.error({ error }, 'Error generating batch embeddings');
      reply.code(500);
      return {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Compute similarity between two texts
   */
  async computeSimilarity(request: FastifyRequest, reply: FastifyReply) {
    const startTime = performance.now();

    // Validate request body
    const parseResult = similarityRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Invalid request',
        details: parseResult.error.format(),
      };
    }

    const { text1, text2 } = parseResult.data;

    try {
      const validatedText1 = createValidatedText(text1);
      const validatedText2 = createValidatedText(text2);

      const result = await this.searchService.computeTextSimilarity(
        validatedText1,
        validatedText2
      );

      if (!result.success) {
        reply.code(errorToStatusCode(result.error));
        return {
          error: errorToMessage(result.error),
          type: result.error.type,
        };
      }

      const response: SimilarityResponse = {
        similarity: result.data,
        processingTimeMs: Math.round(performance.now() - startTime),
      };

      return response;
    } catch (error) {
      request.log.error({ error }, 'Error computing similarity');
      reply.code(500);
      return {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Search for most similar documents
   */
  async search(request: FastifyRequest, reply: FastifyReply) {
    const startTime = performance.now();

    // Validate request body
    const parseResult = searchRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Invalid request',
        details: parseResult.error.format(),
      };
    }

    const { query, documents, topK, threshold } = parseResult.data;

    try {
      const validatedQuery = createValidatedText(query);
      const validatedDocuments = documents.map(doc => createValidatedText(doc));

      const result = await this.searchService.search(validatedQuery, validatedDocuments, {
        topK,
        threshold,
      });

      if (!result.success) {
        reply.code(errorToStatusCode(result.error));
        return {
          error: errorToMessage(result.error),
          type: result.error.type,
        };
      }

      const response: SearchResponse = {
        results: result.data,
        query,
        totalDocuments: documents.length,
        processingTimeMs: Math.round(performance.now() - startTime),
      };

      return response;
    } catch (error) {
      request.log.error({ error }, 'Error performing search');
      reply.code(500);
      return {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(request: FastifyRequest, reply: FastifyReply) {
    const stats = this.embeddingService.getCacheStats();

    if (!stats) {
      return {
        caching: 'disabled',
      };
    }

    return {
      caching: 'enabled',
      ...stats,
    };
  }

  /**
   * Clear cache
   */
  async clearCache(request: FastifyRequest, reply: FastifyReply) {
    this.embeddingService.clearCache();
    return {
      success: true,
      message: 'Cache cleared successfully',
    };
  }
}