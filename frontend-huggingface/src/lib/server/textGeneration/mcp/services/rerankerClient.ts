/**
 * RerankerClient - Semantic Reranking Service Client
 *
 * Calls the dicta-retrieval reranker service (port 5006)
 * to rerank search results by semantic relevance to query.
 */

import { env } from "$env/dynamic/private";
import type { RerankedResult } from "../types/documentContext";

export interface RerankerClientOptions {
	endpoint?: string;
	timeout?: number;
}

interface RerankResponseItem {
	index: number;
	score: number;
}

interface RerankResponse {
	results: RerankResponseItem[];
}

/**
 * Client for the reranker service
 */
export class RerankerClient {
	private readonly endpoint: string;
	private readonly timeout: number;

	constructor(options: RerankerClientOptions = {}) {
		this.endpoint = options.endpoint || env.RERANKER_SERVICE_URL || "http://localhost:5006";
		this.timeout = options.timeout ?? 30000;
	}

	/**
	 * Rerank documents by relevance to query
	 * @param query The search query
	 * @param documents Array of document texts to rerank
	 * @param topK Optional limit on results (default: return all)
	 * @returns Reranked results with scores, sorted by relevance
	 */
	async rerank(query: string, documents: string[], topK?: number): Promise<RerankedResult[]> {
		if (documents.length === 0) {
			return [];
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const response = await fetch(`${this.endpoint}/v1/rerank`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query,
					documents,
					top_k: topK,
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => "Unknown error");
				throw new Error(
					`Reranking failed: ${response.status} ${response.statusText} - ${errorText}`
				);
			}

			const data = (await response.json()) as RerankResponse;

			// Map results back to original documents
			return data.results.map((r) => ({
				content: documents[r.index],
				score: r.score,
				originalIndex: r.index,
				chunkId: "", // Will be filled by caller with actual chunk IDs
			}));
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				throw new Error(`Reranking request timed out after ${this.timeout}ms`);
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Rerank with chunk metadata preserved
	 * @param query The search query
	 * @param chunks Array of chunks with content and metadata
	 * @param topK Optional limit on results
	 */
	async rerankChunks<T extends { content: string; _id?: { toString(): string } }>(
		query: string,
		chunks: T[],
		topK?: number
	): Promise<Array<T & { score: number }>> {
		if (chunks.length === 0) {
			return [];
		}

		const documents = chunks.map((c) => c.content);
		const results = await this.rerank(query, documents, topK);

		// Map scores back to original chunks
		return results.map((r) => ({
			...chunks[r.originalIndex],
			score: r.score,
		}));
	}

	/**
	 * Filter results by minimum score threshold
	 */
	filterByScore(results: RerankedResult[], minScore: number): RerankedResult[] {
		return results.filter((r) => r.score >= minScore);
	}

	/**
	 * Check if the reranker service is healthy
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
}

/**
 * Factory function
 */
export function createRerankerClient(options?: RerankerClientOptions): RerankerClient {
	return new RerankerClient(options);
}
