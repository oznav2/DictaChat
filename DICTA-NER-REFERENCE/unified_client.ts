/**
 * Unified client for both NER and Semantic Search services
 * Provides optimized access to entity extraction and semantic embeddings
 */

import type {
  EmbeddingVector,
  ValidatedText,
  SimilarityScore,
} from './types/domain.js';
import type { Result, AppError } from './types/result.js';

// ============================================================
// NER Service Types
// ============================================================

export interface NEREntity {
  readonly entity_group: string;
  readonly word: string;
  readonly score: number;
  readonly start: number;
  readonly end: number;
}

export interface NERResponse {
  readonly entities: readonly NEREntity[];
  readonly entity_count: number;
  readonly entity_types: Record<string, number>;
  readonly processing_time_ms: number;
}

export interface StructuredEntities {
  readonly people: readonly NEREntity[];
  readonly organizations: readonly NEREntity[];
  readonly locations: readonly NEREntity[];
  readonly times: readonly NEREntity[];
  readonly all: readonly NEREntity[];
}

// ============================================================
// Semantic Search Types
// ============================================================

export interface SemanticEmbeddingResponse {
  readonly embedding: EmbeddingVector;
  readonly dimensions: number;
  readonly processingTimeMs: number;
}

export interface SemanticSearchResult {
  readonly document: string;
  readonly similarity: SimilarityScore;
  readonly rank: number;
}

// ============================================================
// Unified Client Configuration
// ============================================================

export interface UnifiedClientConfig {
  readonly nerServiceUrl: string;
  readonly semanticServiceUrl: string;
  readonly timeout?: number;
  readonly retries?: number;
}

// ============================================================
// Unified Client Implementation
// ============================================================

export class UnifiedAIClient {
  private readonly nerUrl: string;
  private readonly semanticUrl: string;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(config: UnifiedClientConfig) {
    this.nerUrl = config.nerServiceUrl.replace(/\/$/, '');
    this.semanticUrl = config.semanticServiceUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 30000;
    this.retries = config.retries ?? 3;
  }

  // ============================================================
  // NER Service Methods
  // ============================================================

  /**
   * Extract entities from text using NER service
   */
  async extractEntities(
    text: string,
    options: {
      readonly confidenceThreshold?: number;
      readonly aggregationStrategy?: string;
    } = {}
  ): Promise<NERResponse> {
    const response = await this.fetchWithRetry(`${this.nerUrl}/api/v1/ner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        confidence_threshold: options.confidenceThreshold ?? 0.85,
        aggregation_strategy: options.aggregationStrategy ?? 'simple',
      }),
    });

    if (!response.ok) {
      throw new Error(`NER service error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Extract entities from multiple texts in batch
   */
  async extractEntitiesBatch(
    texts: readonly string[],
    options: {
      readonly confidenceThreshold?: number;
    } = {}
  ): Promise<{
    readonly results: readonly NERResponse[];
    readonly total_texts: number;
    readonly processing_time_ms: number;
  }> {
    const response = await this.fetchWithRetry(`${this.nerUrl}/api/v1/batch-ner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts,
        confidence_threshold: options.confidenceThreshold ?? 0.85,
      }),
    });

    if (!response.ok) {
      throw new Error(`NER batch service error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Structure entities by type for easier access
   */
  structureEntities(nerResponse: NERResponse): StructuredEntities {
    const structured: {
      people: NEREntity[];
      organizations: NEREntity[];
      locations: NEREntity[];
      times: NEREntity[];
      all: NEREntity[];
    } = {
      people: [],
      organizations: [],
      locations: [],
      times: [],
      all: [...nerResponse.entities],
    };

    for (const entity of nerResponse.entities) {
      switch (entity.entity_group) {
        case 'PER':
          structured.people.push(entity);
          break;
        case 'ORG':
          structured.organizations.push(entity);
          break;
        case 'GPE':
        case 'LOC':
          structured.locations.push(entity);
          break;
        case 'TIMEX':
          structured.times.push(entity);
          break;
      }
    }

    return structured;
  }

  // ============================================================
  // Semantic Search Methods
  // ============================================================

  /**
   * Generate semantic embedding using NeoDictaBERT-bilingual
   */
  async generateEmbedding(text: string): Promise<SemanticEmbeddingResponse> {
    const response = await this.fetchWithRetry(
      `${this.semanticUrl}/api/v1/embedding`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }
    );

    if (!response.ok) {
      throw new Error(`Semantic service error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateEmbeddingsBatch(
    texts: readonly string[]
  ): Promise<{
    readonly embeddings: readonly EmbeddingVector[];
    readonly dimensions: number;
    readonly totalTexts: number;
    readonly processingTimeMs: number;
  }> {
    const response = await this.fetchWithRetry(
      `${this.semanticUrl}/api/v1/batch-embedding`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
      }
    );

    if (!response.ok) {
      throw new Error(`Semantic batch service error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Compute similarity between two texts
   */
  async computeSimilarity(
    text1: string,
    text2: string
  ): Promise<{ similarity: SimilarityScore; processingTimeMs: number }> {
    const response = await this.fetchWithRetry(
      `${this.semanticUrl}/api/v1/similarity`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text1, text2 }),
      }
    );

    if (!response.ok) {
      throw new Error(`Similarity service error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Semantic search across documents
   */
  async semanticSearch(
    query: string,
    documents: readonly string[],
    options: {
      readonly topK?: number;
      readonly threshold?: number;
    } = {}
  ): Promise<{
    readonly results: readonly SemanticSearchResult[];
    readonly query: string;
    readonly totalDocuments: number;
    readonly processingTimeMs: number;
  }> {
    const response = await this.fetchWithRetry(`${this.semanticUrl}/api/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        documents,
        topK: options.topK,
        threshold: options.threshold,
      }),
    });

    if (!response.ok) {
      throw new Error(`Semantic search error: ${response.status}`);
    }

    return response.json();
  }

  // ============================================================
  // Hybrid Methods - Using Both Services Together
  // ============================================================

  /**
   * Process text with BOTH NER and semantic embedding in parallel
   * This is optimal for storage - get all information at once
   */
  async processTextFull(
    text: string
  ): Promise<{
    readonly entities: StructuredEntities;
    readonly embedding: EmbeddingVector;
    readonly metadata: {
      readonly nerProcessingMs: number;
      readonly semanticProcessingMs: number;
      readonly totalMs: number;
    };
  }> {
    const startTime = performance.now();

    // Call both services in parallel for maximum performance
    const [nerResponse, embeddingResponse] = await Promise.all([
      this.extractEntities(text),
      this.generateEmbedding(text),
    ]);

    const totalTime = performance.now() - startTime;

    return {
      entities: this.structureEntities(nerResponse),
      embedding: embeddingResponse.embedding,
      metadata: {
        nerProcessingMs: nerResponse.processing_time_ms,
        semanticProcessingMs: embeddingResponse.processingTimeMs,
        totalMs: Math.round(totalTime),
      },
    };
  }

  /**
   * Batch process multiple texts with both services
   * Optimized for bulk operations
   */
  async processTextsBatch(
    texts: readonly string[]
  ): Promise<
    readonly {
      readonly text: string;
      readonly entities: StructuredEntities;
      readonly embedding: EmbeddingVector;
    }[]
  > {
    // Process in parallel for maximum performance
    const [nerResults, embeddingResults] = await Promise.all([
      this.extractEntitiesBatch(texts),
      this.generateEmbeddingsBatch(texts),
    ]);

    // Combine results
    return texts.map((text, index) => ({
      text,
      entities: this.structureEntities(nerResults.results[index]!),
      embedding: embeddingResults.embeddings[index]!,
    }));
  }

  /**
   * Entity-aware semantic search
   * Uses entities to pre-filter, then semantic search for ranking
   */
  async entityAwareSearch(
    query: string,
    documents: readonly string[],
    options: {
      readonly entityTypes?: readonly string[];
      readonly requireEntityMatch?: boolean;
      readonly topK?: number;
      readonly semanticThreshold?: number;
    } = {}
  ): Promise<{
    readonly results: readonly (SemanticSearchResult & {
      readonly matchedEntities: readonly NEREntity[];
    })[];
    readonly queryEntities: StructuredEntities;
    readonly processingTimeMs: number;
  }> {
    const startTime = performance.now();

    // Extract entities from query
    const queryNER = await this.extractEntities(query);
    const queryEntities = this.structureEntities(queryNER);

    // If no entities in query or not requiring match, do pure semantic search
    if (queryEntities.all.length === 0 || !options.requireEntityMatch) {
      const semanticResults = await this.semanticSearch(query, documents, {
        topK: options.topK,
        threshold: options.semanticThreshold,
      });

      return {
        results: semanticResults.results.map(r => ({
          ...r,
          matchedEntities: [],
        })),
        queryEntities,
        processingTimeMs: Math.round(performance.now() - startTime),
      };
    }

    // Entity-based filtering: Extract entities from all documents
    const documentNERs = await this.extractEntitiesBatch(documents);

    // Filter documents that contain matching entities
    const queryEntitySet = new Set(
      queryEntities.all.map(e => e.word.toLowerCase())
    );

    const filteredDocuments = documents.filter((_, index) => {
      const docEntities = documentNERs.results[index]!.entities;
      return docEntities.some(e => queryEntitySet.has(e.word.toLowerCase()));
    });

    // If no documents match entities, return empty
    if (filteredDocuments.length === 0) {
      return {
        results: [],
        queryEntities,
        processingTimeMs: Math.round(performance.now() - startTime),
      };
    }

    // Perform semantic search on filtered documents
    const semanticResults = await this.semanticSearch(query, filteredDocuments, {
      topK: options.topK,
      threshold: options.semanticThreshold,
    });

    // Add matched entities to results
    const resultsWithEntities = semanticResults.results.map(result => {
      const docIndex = documents.indexOf(result.document);
      const docNER = documentNERs.results[docIndex]!;

      const matchedEntities = docNER.entities.filter(e =>
        queryEntitySet.has(e.word.toLowerCase())
      );

      return {
        ...result,
        matchedEntities,
      };
    });

    return {
      results: resultsWithEntities,
      queryEntities,
      processingTimeMs: Math.round(performance.now() - startTime),
    };
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    attempt: number = 1
  ): Promise<Response> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (attempt >= this.retries) {
        throw error;
      }

      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));

      return this.fetchWithRetry(url, options, attempt + 1);
    }
  }

  /**
   * Check health of both services
   */
  async checkHealth(): Promise<{
    readonly ner: { readonly status: string; readonly healthy: boolean };
    readonly semantic: { readonly status: string; readonly healthy: boolean };
  }> {
    const [nerHealth, semanticHealth] = await Promise.allSettled([
      fetch(`${this.nerUrl}/health`).then(r => r.json()),
      fetch(`${this.semanticUrl}/health`).then(r => r.json()),
    ]);

    return {
      ner: {
        status: nerHealth.status === 'fulfilled' ? 'online' : 'offline',
        healthy:
          nerHealth.status === 'fulfilled' &&
          nerHealth.value.status === 'healthy',
      },
      semantic: {
        status: semanticHealth.status === 'fulfilled' ? 'online' : 'offline',
        healthy:
          semanticHealth.status === 'fulfilled' &&
          semanticHealth.value.status === 'healthy',
      },
    };
  }
}