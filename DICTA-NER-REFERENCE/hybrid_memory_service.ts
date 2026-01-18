/**
 * Hybrid Memory System
 * Combines entity extraction (NER) with semantic embeddings for optimal search
 * 
 * Strategy:
 * 1. Store: Extract entities + Generate embeddings in parallel
 * 2. Query: Entity-based pre-filtering → Semantic reranking
 * 3. Score: Weighted combination of entity match + semantic similarity
 */

import type { UnifiedAIClient, StructuredEntities, NEREntity } from '../clients/unified-client.js';
import type { EmbeddingVector, SimilarityScore } from '../types/domain.js';

// ============================================================
// Types
// ============================================================

export interface Message {
  readonly id: string;
  readonly text: string;
  readonly userId: string;
  readonly timestamp: Date;
  readonly entities: StructuredEntities;
  readonly embedding: EmbeddingVector;
  readonly metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  readonly strategy?: 'entity' | 'semantic' | 'hybrid';
  readonly topK?: number;
  readonly entityWeight?: number;
  readonly semanticWeight?: number;
  readonly minEntityMatches?: number;
  readonly semanticThreshold?: number;
}

export interface SearchResult {
  readonly message: Message;
  readonly score: number;
  readonly rank: number;
  readonly explanation: {
    readonly entityScore: number;
    readonly semanticScore: number;
    readonly matchedEntities: readonly NEREntity[];
  };
}

// ============================================================
// Hybrid Memory System Implementation
// ============================================================

export class HybridMemorySystem {
  private messages: Message[] = [];
  private entityIndex: Map<string, Set<string>> = new Map(); // entity -> message IDs
  private idCounter = 0;

  constructor(private readonly aiClient: UnifiedAIClient) {}

  /**
   * Store message with BOTH entity extraction and semantic embedding
   * Optimized: Parallel processing for maximum performance
   */
  async storeMessage(
    text: string,
    userId: string,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    // Process with both services in parallel (optimal!)
    const processed = await this.aiClient.processTextFull(text);

    const message: Message = {
      id: `msg_${++this.idCounter}`,
      text,
      userId,
      timestamp: new Date(),
      entities: processed.entities,
      embedding: processed.embedding,
      metadata,
    };

    // Store message
    this.messages.push(message);

    // Update entity index for fast entity-based lookups
    this.indexMessageEntities(message);

    return message;
  }

  /**
   * Store multiple messages efficiently (batch processing)
   */
  async storeMessagesBatch(
    items: readonly { text: string; userId: string; metadata?: Record<string, unknown> }[]
  ): Promise<readonly Message[]> {
    const texts = items.map(item => item.text);

    // Batch process with both services (very efficient!)
    const processed = await this.aiClient.processTextsBatch(texts);

    const messages: Message[] = processed.map((result, index) => ({
      id: `msg_${++this.idCounter}`,
      text: result.text,
      userId: items[index]!.userId,
      timestamp: new Date(),
      entities: result.entities,
      embedding: result.embedding,
      metadata: items[index]!.metadata,
    }));

    // Store and index all messages
    this.messages.push(...messages);
    messages.forEach(msg => this.indexMessageEntities(msg));

    return messages;
  }

  /**
   * Search with hybrid strategy: Entity filtering + Semantic ranking
   * This is the OPTIMAL search strategy!
   */
  async search(
    query: string,
    userId: string,
    options: SearchOptions = {}
  ): Promise<readonly SearchResult[]> {
    const {
      strategy = 'hybrid',
      topK = 10,
      entityWeight = 0.3,
      semanticWeight = 0.7,
      minEntityMatches = 0,
      semanticThreshold = 0.0,
    } = options;

    // Get user's messages
    const userMessages = this.messages.filter(m => m.userId === userId);

    if (userMessages.length === 0) {
      return [];
    }

    // Extract entities from query for hybrid search
    const queryProcessed = await this.aiClient.processTextFull(query);
    const queryEntities = queryProcessed.entities;
    const queryEmbedding = queryProcessed.embedding;

    switch (strategy) {
      case 'entity':
        return this.entityOnlySearch(query, userMessages, queryEntities, topK);

      case 'semantic':
        return this.semanticOnlySearch(
          userMessages,
          queryEmbedding,
          topK,
          semanticThreshold
        );

      case 'hybrid':
      default:
        return this.hybridSearch(
          userMessages,
          queryEntities,
          queryEmbedding,
          topK,
          entityWeight,
          semanticWeight,
          minEntityMatches,
          semanticThreshold
        );
    }
  }

  /**
   * Entity-only search (fastest, most precise)
   */
  private entityOnlySearch(
    query: string,
    messages: readonly Message[],
    queryEntities: StructuredEntities,
    topK: number
  ): SearchResult[] {
    const queryEntitySet = new Set(
      queryEntities.all.map(e => e.word.toLowerCase())
    );

    const results = messages
      .map(message => {
        const matchedEntities = message.entities.all.filter(e =>
          queryEntitySet.has(e.word.toLowerCase())
        );

        const entityScore = matchedEntities.length / Math.max(queryEntities.all.length, 1);

        return {
          message,
          score: entityScore,
          matchedEntities,
        };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return results.map((result, index) => ({
      message: result.message,
      score: result.score,
      rank: index + 1,
      explanation: {
        entityScore: result.score,
        semanticScore: 0,
        matchedEntities: result.matchedEntities,
      },
    }));
  }

  /**
   * Semantic-only search (slowest, most intelligent)
   */
  private semanticOnlySearch(
    messages: readonly Message[],
    queryEmbedding: EmbeddingVector,
    topK: number,
    threshold: number
  ): SearchResult[] {
    const results = messages
      .map(message => {
        const similarity = this.cosineSimilarity(queryEmbedding, message.embedding);
        return {
          message,
          similarity,
        };
      })
      .filter(r => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return results.map((result, index) => ({
      message: result.message,
      score: result.similarity,
      rank: index + 1,
      explanation: {
        entityScore: 0,
        semanticScore: result.similarity,
        matchedEntities: [],
      },
    }));
  }

  /**
   * Hybrid search: Entity pre-filtering + Semantic reranking
   * OPTIMAL STRATEGY: Fast + Intelligent
   */
  private hybridSearch(
    messages: readonly Message[],
    queryEntities: StructuredEntities,
    queryEmbedding: EmbeddingVector,
    topK: number,
    entityWeight: number,
    semanticWeight: number,
    minEntityMatches: number,
    semanticThreshold: number
  ): SearchResult[] {
    const queryEntitySet = new Set(
      queryEntities.all.map(e => e.word.toLowerCase())
    );

    // Step 1: Entity-based filtering (fast pre-filter)
    let candidates = messages;

    if (queryEntities.all.length > 0 && minEntityMatches > 0) {
      candidates = messages.filter(message => {
        const matchCount = message.entities.all.filter(e =>
          queryEntitySet.has(e.word.toLowerCase())
        ).length;
        return matchCount >= minEntityMatches;
      });
    }

    // Step 2: Score with both entity matching and semantic similarity
    const scoredResults = candidates.map(message => {
      // Entity match score
      const matchedEntities = message.entities.all.filter(e =>
        queryEntitySet.has(e.word.toLowerCase())
      );

      const entityScore =
        queryEntities.all.length > 0
          ? matchedEntities.length / queryEntities.all.length
          : 0;

      // Semantic similarity score
      const semanticScore = this.cosineSimilarity(queryEmbedding, message.embedding);

      // Combined score (weighted)
      const combinedScore = entityScore * entityWeight + semanticScore * semanticWeight;

      return {
        message,
        score: combinedScore,
        entityScore,
        semanticScore,
        matchedEntities,
      };
    });

    // Step 3: Filter by semantic threshold and sort
    const results = scoredResults
      .filter(r => r.semanticScore >= semanticThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return results.map((result, index) => ({
      message: result.message,
      score: result.score,
      rank: index + 1,
      explanation: {
        entityScore: result.entityScore,
        semanticScore: result.semanticScore,
        matchedEntities: result.matchedEntities,
      },
    }));
  }

  /**
   * Get entity timeline: All messages mentioning a specific entity
   */
  async getEntityTimeline(
    entityName: string,
    userId: string
  ): Promise<readonly Message[]> {
    const messageIds = this.entityIndex.get(entityName.toLowerCase());

    if (!messageIds) {
      return [];
    }

    return this.messages
      .filter(m => m.userId === userId && messageIds.has(m.id))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get related entities: Entities that co-occur with a given entity
   */
  getRelatedEntities(entityName: string): Map<string, number> {
    const messageIds = this.entityIndex.get(entityName.toLowerCase());

    if (!messageIds) {
      return new Map();
    }

    const coOccurrences = new Map<string, number>();

    for (const msgId of messageIds) {
      const message = this.messages.find(m => m.id === msgId);
      if (!message) continue;

      for (const entity of message.entities.all) {
        if (entity.word.toLowerCase() !== entityName.toLowerCase()) {
          const count = coOccurrences.get(entity.word) ?? 0;
          coOccurrences.set(entity.word, count + 1);
        }
      }
    }

    return coOccurrences;
  }

  /**
   * Cluster messages by semantic similarity
   */
  async clusterMessages(
    userId: string,
    similarityThreshold: number = 0.7
  ): Promise<readonly (readonly Message[])[]> {
    const userMessages = this.messages.filter(m => m.userId === userId);

    if (userMessages.length === 0) {
      return [];
    }

    const clusters: Message[][] = [];
    const processed = new Set<string>();

    for (const message of userMessages) {
      if (processed.has(message.id)) continue;

      const cluster: Message[] = [message];
      processed.add(message.id);

      // Find similar messages
      for (const other of userMessages) {
        if (processed.has(other.id)) continue;

        const similarity = this.cosineSimilarity(message.embedding, other.embedding);

        if (similarity >= similarityThreshold) {
          cluster.push(other);
          processed.add(other.id);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  /**
   * Get statistics about stored data
   */
  getStatistics(userId: string) {
    const userMessages = this.messages.filter(m => m.userId === userId);

    const entityCounts = new Map<string, number>();
    let totalEntities = 0;

    for (const message of userMessages) {
      for (const entity of message.entities.all) {
        totalEntities++;
        const count = entityCounts.get(entity.entity_group) ?? 0;
        entityCounts.set(entity.entity_group, count + 1);
      }
    }

    return {
      totalMessages: userMessages.length,
      totalEntities,
      entityTypes: Object.fromEntries(entityCounts),
      averageEntitiesPerMessage: totalEntities / Math.max(userMessages.length, 1),
      indexedEntities: this.entityIndex.size,
    };
  }

  // ============================================================
  // Private Utility Methods
  // ============================================================

  /**
   * Index message entities for fast lookups
   */
  private indexMessageEntities(message: Message): void {
    for (const entity of message.entities.all) {
      const key = entity.word.toLowerCase();

      if (!this.entityIndex.has(key)) {
        this.entityIndex.set(key, new Set());
      }

      this.entityIndex.get(key)!.add(message.id);
    }
  }

  /**
   * Compute cosine similarity between two embedding vectors
   */
  private cosineSimilarity(vec1: EmbeddingVector, vec2: EmbeddingVector): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have same dimensions');
    }

    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i]!, 0);

    // For normalized vectors, dot product IS cosine similarity
    // Ensure result is in [0, 1] range
    return Math.max(0, Math.min(1, dotProduct));
  }
}