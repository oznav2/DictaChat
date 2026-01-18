import { HfInference } from '@huggingface/inference';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '@/config/env.js';
import {
  type EmbeddingVector,
  type ValidatedText,
  createEmbeddingVector,
} from '@/types/domain.js';
import {
  type Result,
  ok,
  err,
  type AppError,
  createModelInferenceError,
  createConfigurationError,
  createNetworkError,
} from '@/types/result.js';

/**
 * Interface for embedding service
 * Allows for different implementations (HuggingFace, local, etc.)
 */
export interface IEmbeddingService {
  initialize(): Promise<Result<void, AppError>>;
  generateEmbedding(text: ValidatedText): Promise<Result<EmbeddingVector, AppError>>;
  generateBatchEmbeddings(
    texts: readonly ValidatedText[]
  ): Promise<Result<readonly EmbeddingVector[], AppError>>;
  isReady(): boolean;
  getModelInfo(): {
    modelName: string;
    provider: string;
    embeddingDimensions: number;
  };
}

/**
 * HuggingFace Inference API implementation
 * Uses hosted models - no local model loading required
 */
export class HuggingFaceEmbeddingService implements IEmbeddingService {
  private client: HfInference | null = null;
  private readonly logger: FastifyBaseLogger;
  private readonly modelName: string;
  private isInitialized = false;

  // Embedding dimensions for NeoDictaBERT-bilingual
  private readonly EMBEDDING_DIMENSIONS = 768;

  constructor(logger: FastifyBaseLogger) {
    this.logger = logger;
    this.modelName = config.MODEL_NAME;
  }

  /**
   * Initialize the HuggingFace client
   */
  async initialize(): Promise<Result<void, AppError>> {
    try {
      const apiKey = config.HUGGINGFACE_API_KEY;

      if (!apiKey) {
        this.logger.error('HuggingFace API key not configured');
        return err(
          createConfigurationError(
            'HUGGINGFACE_API_KEY is required when using HuggingFace provider. ' +
              'Get your free API key from https://huggingface.co/settings/tokens'
          )
        );
      }

      this.client = new HfInference(apiKey);
      this.isInitialized = true;

      this.logger.info(
        { modelName: this.modelName },
        'HuggingFace embedding service initialized'
      );

      return ok(undefined);
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize HuggingFace client');
      return err(
        createConfigurationError(
          `Failed to initialize HuggingFace client: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      );
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: ValidatedText): Promise<Result<EmbeddingVector, AppError>> {
    if (!this.client || !this.isInitialized) {
      return err(createModelInferenceError('Service not initialized'));
    }

    try {
      this.logger.debug({ textLength: text.length }, 'Generating embedding');

      const response = await this.client.featureExtraction({
        model: this.modelName,
        inputs: text,
      });

      // HuggingFace returns embeddings as nested arrays for some models
      // Extract the actual embedding vector
      const embedding = this.extractEmbedding(response);

      if (config.NORMALIZE_EMBEDDINGS) {
        return ok(this.normalizeEmbedding(embedding));
      }

      return ok(createEmbeddingVector(embedding));
    } catch (error) {
      this.logger.error({ error, text: text.slice(0, 100) }, 'Failed to generate embedding');

      if (error instanceof Error && error.message.includes('fetch')) {
        return err(createNetworkError('Failed to connect to HuggingFace API', error));
      }

      return err(
        createModelInferenceError(
          'Failed to generate embedding',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateBatchEmbeddings(
    texts: readonly ValidatedText[]
  ): Promise<Result<readonly EmbeddingVector[], AppError>> {
    if (!this.client || !this.isInitialized) {
      return err(createModelInferenceError('Service not initialized'));
    }

    try {
      this.logger.debug({ count: texts.length }, 'Generating batch embeddings');

      // Process in batches to avoid overwhelming the API
      const batchSize = config.BATCH_SIZE;
      const embeddings: EmbeddingVector[] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);

        const batchResults = await Promise.all(
          batch.map(text => this.generateEmbedding(text))
        );

        // Check for errors
        for (const result of batchResults) {
          if (!result.success) {
            return err(result.error);
          }
          embeddings.push(result.data);
        }
      }

      return ok(embeddings);
    } catch (error) {
      this.logger.error({ error, count: texts.length }, 'Failed to generate batch embeddings');

      return err(
        createModelInferenceError(
          'Failed to generate batch embeddings',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.client !== null;
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return {
      modelName: this.modelName,
      provider: 'huggingface' as const,
      embeddingDimensions: this.EMBEDDING_DIMENSIONS,
    };
  }

  /**
   * Extract embedding vector from HuggingFace response
   * Handles different response formats
   */
  private extractEmbedding(response: unknown): readonly number[] {
    // Response can be a flat array or nested array
    if (Array.isArray(response)) {
      // If it's a nested array, take the first element
      if (response.length > 0 && Array.isArray(response[0])) {
        return response[0] as number[];
      }
      return response as number[];
    }

    throw new Error('Unexpected embedding format from HuggingFace API');
  }

  /**
   * Normalize embedding vector to unit length
   * This makes cosine similarity equivalent to dot product
   */
  private normalizeEmbedding(embedding: readonly number[]): EmbeddingVector {
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

    if (magnitude === 0) {
      throw new Error('Cannot normalize zero vector');
    }

    const normalized = embedding.map(val => val / magnitude);
    return createEmbeddingVector(normalized);
  }
}