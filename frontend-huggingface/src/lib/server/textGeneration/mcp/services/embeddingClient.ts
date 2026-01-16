/**
 * EmbeddingClient - Vector Embedding Service Client
 *
 * Calls the dicta-retrieval embedding service (port 5005)
 * to generate semantic vector embeddings for text chunks.
 */

import { env } from "$env/dynamic/private";

export interface EmbeddingClientOptions {
	endpoint?: string;
	timeout?: number;
}

interface EmbeddingItem {
	text: string;
	dense: number[];
	sparse?: unknown;
	colbert?: unknown;
}

interface EmbeddingsResponse {
	embeddings: EmbeddingItem[];
}

/**
 * Client for the embedding service
 */
export class EmbeddingClient {
	private readonly endpoint: string;
	private readonly timeout: number;
	private queue: Array<() => Promise<void>> = [];
	private inFlight = 0;
	private readonly concurrency = 2;

	constructor(options: EmbeddingClientOptions = {}) {
		this.endpoint = options.endpoint || env.EMBEDDING_SERVICE_URL || "http://localhost:5005";
		this.timeout = options.timeout ?? 30000;
	}

	submitEmbedBatch(
		texts: string[],
		onComplete: (embeddings: number[][]) => Promise<void> | void,
		onError?: (err: unknown) => Promise<void> | void
	): void {
		this.enqueue(async () => {
			try {
				const embeddings = await this.embedBatch(texts);
				await onComplete(embeddings);
			} catch (err) {
				if (onError) await onError(err);
			}
		});
	}

	private enqueue(task: () => Promise<void>): void {
		this.queue.push(task);
		this.drain();
	}

	private drain(): void {
		while (this.inFlight < this.concurrency && this.queue.length > 0) {
			const task = this.queue.shift();
			if (!task) return;
			this.inFlight++;
			task().finally(() => {
				this.inFlight--;
				this.drain();
			});
		}
	}

	/**
	 * Generate embedding for a single text
	 */
	async embed(text: string): Promise<number[]> {
		const results = await this.embedBatch([text]);
		return results[0] || [];
	}

	/**
	 * Generate embeddings for multiple texts in batch
	 */
	async embedBatch(texts: string[]): Promise<number[][]> {
		if (texts.length === 0) {
			return [];
		}

		// For large batches, split into smaller chunks to avoid timeouts
		const BATCH_SIZE = 50;
		const results: number[][] = [];

		for (let i = 0; i < texts.length; i += BATCH_SIZE) {
			const batch = texts.slice(i, i + BATCH_SIZE);
			const batchResults = await this.embedBatchInternal(batch);
			results.push(...batchResults);
		}

		return results;
	}

	/**
	 * Internal batch embedding call
	 * Uses /embeddings endpoint with {texts: string[]} body
	 * Response format: {embeddings: [{text, dense, sparse?, colbert?}]}
	 */
	private async embedBatchInternal(texts: string[]): Promise<number[][]> {
		const controller = new AbortController();
		// Longer timeout for batch operations
		const batchTimeout = this.timeout * 2;
		const timeoutId = setTimeout(() => controller.abort(), batchTimeout);

		try {
			const response = await fetch(`${this.endpoint}/embeddings`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ texts }),
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => "Unknown error");
				throw new Error(
					`Batch embedding failed: ${response.status} ${response.statusText} - ${errorText}`
				);
			}

			const data = (await response.json()) as EmbeddingsResponse;
			// Extract dense embeddings from response
			return data.embeddings.map((item) => item.dense);
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				throw new Error(`Batch embedding request timed out after ${batchTimeout}ms`);
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Check if the embedding service is healthy
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
	 * Get the embedding dimension (for validation)
	 */
	async getDimension(): Promise<number> {
		// Generate a test embedding to get dimension
		const testEmbedding = await this.embed("test");
		return testEmbedding.length;
	}
}

/**
 * Factory function
 */
export function createEmbeddingClient(options?: EmbeddingClientOptions): EmbeddingClient {
	return new EmbeddingClient(options);
}
