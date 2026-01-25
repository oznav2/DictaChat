import type { FastifyBaseLogger } from 'fastify';
import type { IEmbeddingService } from './embedding.service.js';
import {
  type EmbeddingVector,
  type SimilarityScore,
  type ValidatedText,
  type SearchResult,
  createSimilarityScore,
} from '@/types/domain.js';
import {
  type Result,
  ok,
  err,
  type AppError,
  createInvalidInputError,
} from '@/types/result.js';

/**
 * Semantic search service
 * Provides high-level search operations using embeddings
 */
export class SemanticSearchService {
  constructor(
    private readonly embeddingService: IEmbeddingService,
    private readonly logger: FastifyBaseLogger
  ) {}

  /**
   * Compute cosine similarity between two embedding vectors
   */
  private computeCosineSimilarity(
    vec1: EmbeddingVector,
    vec2: EmbeddingVector
  ): SimilarityScore {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    // For normalized vectors, dot product equals cosine similarity
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i]!, 0);

    // Ensure result is in [0, 1] range
    // (can be slightly outside due to floating point errors)
    const similarity = Math.max(0, Math.min(1, dotProduct));

    return createSimilarityScore(similarity);
  }

  /**
   * Calculate similarity between two texts
   */
  async computeTextSimilarity(
    text1: ValidatedText,
    text2: ValidatedText
  ): Promise<Result<SimilarityScore, AppError>> {
    this.logger.debug('Computing text similarity');

    // Generate embeddings for both texts
    const result1 = await this.embeddingService.generateEmbedding(text1);
    if (!result1.success) return err(result1.error);

    const result2 = await this.embeddingService.generateEmbedding(text2);
    if (!result2.success) return err(result2.error);

    const similarity = this.computeCosineSimilarity(result1.data, result2.data);

    return ok(similarity);
  }

  /**
   * Search for most similar documents to a query
   */
  async search(
    query: ValidatedText,
    documents: readonly ValidatedText[],
    options: {
      readonly topK?: number;
      readonly threshold?: number;
    } = {}
  ): Promise<Result<readonly SearchResult[], AppError>> {
    const { topK = 10, threshold = 0.0 } = options;

    if (documents.length === 0) {
      return err(createInvalidInputError('No documents provided for search'));
    }

    if (topK <= 0 || topK > documents.length) {
      return err(
        createInvalidInputError(
          `topK must be between 1 and ${documents.length}`,
          { topK, documentCount: documents.length }
        )
      );
    }

    if (threshold < 0 || threshold > 1) {
      return err(
        createInvalidInputError('threshold must be between 0 and 1', { threshold })
      );
    }

    this.logger.debug(
      { documentCount: documents.length, topK, threshold },
      'Performing semantic search'
    );

    // Generate query embedding
    const queryEmbeddingResult = await this.embeddingService.generateEmbedding(query);
    if (!queryEmbeddingResult.success) return err(queryEmbeddingResult.error);

    const queryEmbedding = queryEmbeddingResult.data;

    // Generate document embeddings
    const docEmbeddingsResult = await this.embeddingService.generateBatchEmbeddings(documents);
    if (!docEmbeddingsResult.success) return err(docEmbeddingsResult.error);

    const docEmbeddings = docEmbeddingsResult.data;

    // Compute similarities
    const similarities = docEmbeddings.map((docEmbedding, index) => ({
      document: documents[index]!,
      similarity: this.computeCosineSimilarity(queryEmbedding, docEmbedding),
      index,
    }));

    // Filter by threshold and sort by similarity (descending)
    const filtered = similarities
      .filter(item => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);

    // Take top K results
    const topResults = filtered.slice(0, topK);

    // Map to SearchResult with ranks
    const results: SearchResult[] = topResults.map((item, rank) => ({
      document: item.document,
      similarity: item.similarity,
      rank: rank + 1,
    }));

    this.logger.debug(
      { resultsCount: results.length },
      'Semantic search completed'
    );

    return ok(results);
  }

  /**
   * Find most similar document from a set of documents
   */
  async findMostSimilar(
    query: ValidatedText,
    documents: readonly ValidatedText[]
  ): Promise<Result<SearchResult | null, AppError>> {
    const searchResult = await this.search(query, documents, { topK: 1 });

    if (!searchResult.success) return err(searchResult.error);

    const topResult = searchResult.data[0];

    return ok(topResult ?? null);
  }

  /**
   * Cluster documents by similarity
   * Returns groups of similar documents
   */
  async clusterBySimilarity(
    documents: readonly ValidatedText[],
    similarityThreshold: number
  ): Promise<Result<readonly (readonly ValidatedText[])[], AppError>> {
    if (documents.length === 0) {
      return ok([]);
    }

    if (similarityThreshold < 0 || similarityThreshold > 1) {
      return err(
        createInvalidInputError(
          'similarityThreshold must be between 0 and 1',
          { similarityThreshold }
        )
      );
    }

    this.logger.debug(
      { documentCount: documents.length, threshold: similarityThreshold },
      'Clustering documents'
    );

    // Generate embeddings for all documents
    const embeddingsResult = await this.embeddingService.generateBatchEmbeddings(documents);
    if (!embeddingsResult.success) return err(embeddingsResult.error);

    const embeddings = embeddingsResult.data;

    // Simple greedy clustering algorithm
    const clusters: ValidatedText[][] = [];
    const processed = new Set<number>();

    for (let i = 0; i < documents.length; i++) {
      if (processed.has(i)) continue;

      const cluster: ValidatedText[] = [documents[i]!];
      processed.add(i);

      // Find all documents similar to this one
      for (let j = i + 1; j < documents.length; j++) {
        if (processed.has(j)) continue;

        const similarity = this.computeCosineSimilarity(
          embeddings[i]!,
          embeddings[j]!
        );

        if (similarity >= similarityThreshold) {
          cluster.push(documents[j]!);
          processed.add(j);
        }
      }

      clusters.push(cluster);
    }

    this.logger.debug(
      { clusterCount: clusters.length },
      'Document clustering completed'
    );

    return ok(clusters);
  }
}