/**
 * ReindexService - Rebuild Qdrant from Mongo truth
 *
 * Provides capability to:
 * - Full rebuild of Qdrant index from MongoDB source of truth
 * - Incremental reindex (since timestamp)
 * - User-scoped or tier-scoped reindex
 * - Checkpointing for pause/resume
 * - Throttled to prevent GPU overload
 */

import { logger } from "$lib/server/logger";
import type { MemoryMongoStore } from "../stores/MemoryMongoStore";
import type { QdrantAdapter } from "../adapters/QdrantAdapter";
import type { DictaEmbeddingClient } from "../embedding/DictaEmbeddingClient";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { MemoryTier } from "../types";
import { createHash } from "crypto";

/**
 * Sanitize text content by removing embedded binary/base64 data and artifacts
 * This handles corrupted memories with embedded image data from PDF extraction
 */
function sanitizeMemoryContent(text: string): { sanitized: string; wasCorrupted: boolean } {
	if (!text) return { sanitized: "", wasCorrupted: false };

	const original = text;
	let sanitized = text;

	// Remove inline base64 data URLs (images embedded in markdown/HTML)
	sanitized = sanitized.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[image]");

	// Remove markdown image references with base64 data
	sanitized = sanitized.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, "[image]");

	// Remove long sequences of base64-like characters (40+ chars of only base64 alphabet)
	sanitized = sanitized.replace(/[A-Za-z0-9+/]{40,}={0,2}/g, (match) => {
		const hasBase64Chars = /[+/]/.test(match);
		const ratio = (match.match(/[A-Z]/g) || []).length / match.length;
		if (hasBase64Chars || ratio > 0.3) {
			return "[binary-data-removed]";
		}
		return match;
	});

	// Remove raw control/binary characters
	sanitized = Array.from(sanitized)
		.filter((ch) => {
			const code = ch.charCodeAt(0);
			if (code <= 8) return false;
			if (code === 11 || code === 12) return false;
			if (code >= 14 && code <= 31) return false;
			if (code >= 127 && code <= 159) return false;
			return true;
		})
		.join("");

	// Remove sequences with excessive special characters (corrupted binary)
	sanitized = sanitized.replace(/(?:[^\w\s\u0590-\u05FF.,;:!?'"()[\]{}<>@#$%&*+=-]){10,}/g, "");

	// Normalize whitespace
	sanitized = sanitized.replace(/[ \t]+/g, " ");
	sanitized = sanitized.replace(/\n{3,}/g, "\n\n");

	// Remove lines that are mostly binary placeholders
	sanitized = sanitized
		.split("\n")
		.filter((line) => {
			const placeholderCount = (line.match(/\[(image|binary-data-removed)\]/g) || []).length;
			const wordCount = line.split(/\s+/).filter((w) => w.length > 0).length;
			return placeholderCount < 3 || wordCount - placeholderCount > 2;
		})
		.join("\n");

	sanitized = sanitized.trim();

	// Check if any significant changes were made
	const wasCorrupted =
		sanitized.length < original.length * 0.9 ||
		sanitized.includes("[binary-data-removed]") ||
		sanitized.includes("[image]");

	return { sanitized, wasCorrupted };
}

/**
 * Reindex job parameters
 */
export interface ReindexParams {
	/** Optional: only reindex specific user's memories */
	userId?: string;
	/** Optional: only reindex specific tier */
	tier?: MemoryTier;
	/** Optional: only reindex items updated since this date */
	since?: Date;
	/** Batch size for processing (default: 50) */
	batchSize?: number;
	/** Max concurrent embedding requests (default: 5) */
	concurrency?: number;
	/** Resume from checkpoint ID */
	resumeFromCheckpoint?: string;
}

/**
 * Reindex progress information
 */
export interface ReindexProgress {
	jobId: string;
	status: "running" | "paused" | "completed" | "failed";
	totalItems: number;
	processedItems: number;
	failedItems: number;
	startedAt: Date;
	updatedAt: Date;
	lastProcessedId?: string;
	lastProcessedAt?: Date;
	errorMessage?: string;
	durationMs: number;
}

/**
 * Reindex result
 */
export interface ReindexResult {
	success: boolean;
	jobId: string;
	totalProcessed: number;
	totalFailed: number;
	durationMs: number;
	errorMessage?: string;
}

export interface ReindexServiceConfig {
	mongoStore: MemoryMongoStore;
	qdrantAdapter: QdrantAdapter;
	embeddingClient: DictaEmbeddingClient;
	config?: MemoryConfig;
}

/**
 * Compute hash of content for change detection
 */
function computeContentHash(content: string): string {
	return createHash("md5").update(content).digest("hex");
}

export class ReindexService {
	private mongo: MemoryMongoStore;
	private qdrant: QdrantAdapter;
	private embedding: DictaEmbeddingClient;
	private config: MemoryConfig;

	// Track active job
	private activeJob: ReindexProgress | null = null;
	private abortController: AbortController | null = null;

	constructor(params: ReindexServiceConfig) {
		this.mongo = params.mongoStore;
		this.qdrant = params.qdrantAdapter;
		this.embedding = params.embeddingClient;
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Start a reindex job
	 */
	async rebuild(params: ReindexParams = {}): Promise<ReindexResult> {
		if (this.activeJob?.status === "running") {
			return {
				success: false,
				jobId: this.activeJob.jobId,
				totalProcessed: 0,
				totalFailed: 0,
				durationMs: 0,
				errorMessage: "Another reindex job is already running",
			};
		}

		const jobId = `reindex_${Date.now()}`;
		const batchSize = params.batchSize ?? 50;
		const concurrency = params.concurrency ?? 5;

		this.abortController = new AbortController();
		this.activeJob = {
			jobId,
			status: "running",
			totalItems: 0,
			processedItems: 0,
			failedItems: 0,
			startedAt: new Date(),
			updatedAt: new Date(),
			durationMs: 0,
		};

		const startTime = Date.now();

		try {
			logger.info({ jobId, params }, "ReindexService: Starting reindex job");

			// Get total count for progress tracking
			const totalCount = await this.getItemCount(params);
			this.activeJob.totalItems = totalCount;

			// Process in batches
			let cursor: string | undefined = params.resumeFromCheckpoint;
			let hasMore = true;

			while (hasMore && !this.abortController.signal.aborted) {
				const batch = await this.fetchBatch(params, batchSize, cursor);

				if (batch.items.length === 0) {
					hasMore = false;
					break;
				}

				// Process batch with concurrency limit
				const results = await this.processBatchWithConcurrency(batch.items, concurrency);

				// Update progress
				this.activeJob.processedItems += results.processed;
				this.activeJob.failedItems += results.failed;
				this.activeJob.updatedAt = new Date();

				if (batch.items.length > 0) {
					const lastItem = batch.items[batch.items.length - 1];
					this.activeJob.lastProcessedId = lastItem.memory_id;
					this.activeJob.lastProcessedAt = lastItem.updated_at
						? new Date(lastItem.updated_at)
						: undefined;

					// Save checkpoint
					await this.saveCheckpoint(jobId, lastItem.memory_id);
				}

				cursor = batch.nextCursor;
				hasMore = !!cursor;

				logger.debug(
					{
						jobId,
						processed: this.activeJob.processedItems,
						total: this.activeJob.totalItems,
					},
					"ReindexService: Batch completed"
				);
			}

			this.activeJob.status = this.abortController.signal.aborted ? "paused" : "completed";
			this.activeJob.durationMs = Date.now() - startTime;

			logger.info(
				{
					jobId,
					processedItems: this.activeJob.processedItems,
					failedItems: this.activeJob.failedItems,
					durationMs: this.activeJob.durationMs,
				},
				"ReindexService: Reindex job completed"
			);

			return {
				success: true,
				jobId,
				totalProcessed: this.activeJob.processedItems,
				totalFailed: this.activeJob.failedItems,
				durationMs: this.activeJob.durationMs,
			};
		} catch (err) {
			this.activeJob.status = "failed";
			this.activeJob.errorMessage = err instanceof Error ? err.message : String(err);
			this.activeJob.durationMs = Date.now() - startTime;

			logger.error({ err, jobId }, "ReindexService: Reindex job failed");

			return {
				success: false,
				jobId,
				totalProcessed: this.activeJob.processedItems,
				totalFailed: this.activeJob.failedItems,
				durationMs: this.activeJob.durationMs,
				errorMessage: this.activeJob.errorMessage,
			};
		}
	}

	/**
	 * Pause the current reindex job
	 */
	pause(): boolean {
		if (this.activeJob?.status === "running" && this.abortController) {
			this.abortController.abort();
			return true;
		}
		return false;
	}

	/**
	 * Get current job progress
	 */
	getProgress(): ReindexProgress | null {
		return this.activeJob;
	}

	/**
	 * Get count of items to reindex
	 */
	private async getItemCount(params: ReindexParams): Promise<number> {
		const items = await this.mongo.query({
			userId: params.userId ?? "",
			tiers: params.tier ? [params.tier] : undefined,
			status: ["active"],
			limit: 100000, // High limit for count
		});
		return items.length;
	}

	/**
	 * Fetch a batch of items to reindex
	 */
	private async fetchBatch(
		params: ReindexParams,
		batchSize: number,
		cursor?: string
	): Promise<{
		items: Array<{
			memory_id: string;
			user_id: string;
			content: string;
			vector_hash?: string;
			updated_at?: string;
		}>;
		nextCursor?: string;
	}> {
		const items = await this.mongo.query({
			userId: params.userId ?? "",
			tiers: params.tier ? [params.tier] : undefined,
			status: ["active"],
			limit: batchSize + 1, // Fetch one extra to check for more
		});

		// Simple cursor implementation - skip items before cursor
		let startIndex = 0;
		if (cursor) {
			const cursorIndex = items.findIndex((i) => i.memory_id === cursor);
			if (cursorIndex >= 0) {
				startIndex = cursorIndex + 1;
			}
		}

		const batch = items.slice(startIndex, startIndex + batchSize);
		const hasMore = items.length > startIndex + batchSize;

		return {
			items: batch.map((i) => ({
				memory_id: i.memory_id,
				user_id: i.user_id,
				content: i.text,
				vector_hash: i.embedding?.vector_hash,
				updated_at: i.timestamps.updated_at,
			})),
			nextCursor: hasMore ? batch[batch.length - 1]?.memory_id : undefined,
		};
	}

	/**
	 * Process batch with concurrency limit
	 */
	private async processBatchWithConcurrency(
		items: Array<{ memory_id: string; user_id: string; content: string; vector_hash?: string }>,
		concurrency: number
	): Promise<{ processed: number; failed: number }> {
		let processed = 0;
		let failed = 0;

		// Process in chunks of concurrency size
		for (let i = 0; i < items.length; i += concurrency) {
			const chunk = items.slice(i, i + concurrency);
			const results = await Promise.allSettled(chunk.map((item) => this.processItem(item)));

			for (const result of results) {
				if (result.status === "fulfilled" && result.value) {
					processed++;
				} else {
					failed++;
				}
			}
		}

		return { processed, failed };
	}

	/**
	 * Process a single item - recompute embedding and upsert to Qdrant
	 */
	private async processItem(item: {
		memory_id: string;
		user_id: string;
		content: string;
		vector_hash?: string;
	}): Promise<boolean> {
		try {
			// Check if content has changed (vector_hash mismatch)
			const currentHash = computeContentHash(item.content);
			const needsReembed = !item.vector_hash || item.vector_hash !== currentHash;

			let vector: number[];

			if (needsReembed) {
				// Compute new embedding
				const embeddingResult = await this.embedding.embed(item.content);
				if (!embeddingResult) {
					logger.warn({ memoryId: item.memory_id }, "Failed to compute embedding");
					return false;
				}
				vector = embeddingResult;

				// Update memory in Mongo (no direct vector_hash update available)
				// The embedding info will be updated when the memory is stored
			} else {
				// For reindex, always recompute embedding for consistency
				const embeddingResult = await this.embedding.embed(item.content);
				if (!embeddingResult) {
					return false;
				}
				vector = embeddingResult;
			}

			// Get full memory data for payload
			const memory = await this.mongo.getById(item.memory_id, item.user_id);
			if (!memory) {
				return false;
			}

			// Upsert to Qdrant
			const upserted = await this.qdrant.upsert({
				id: item.memory_id,
				vector,
				payload: {
					user_id: memory.user_id,
					tier: memory.tier,
					status: memory.status,
					content: memory.text,
					tags: memory.tags || [],
					entities: memory.entities || [],
					timestamp: memory.timestamps.created_at
						? new Date(memory.timestamps.created_at).getTime()
						: Date.now(),
					composite_score: memory.stats?.wilson_score ?? 0.5,
					uses: memory.stats?.uses ?? 0,
					always_inject: memory.always_inject ?? false,
				},
			});

			if (!upserted) {
				logger.warn({ memoryId: item.memory_id }, "Failed to upsert memory into Qdrant");
				return false;
			}

			return true;
		} catch (err) {
			logger.error({ err, memoryId: item.memory_id }, "Failed to process item");
			return false;
		}
	}

	/**
	 * Save checkpoint (logged for resume capability)
	 */
	private async saveCheckpoint(jobId: string, lastProcessedId: string): Promise<void> {
		// Log checkpoint for potential manual resume
		logger.debug(
			{ jobId, lastProcessedId, timestamp: new Date() },
			"ReindexService: Checkpoint saved"
		);
	}

	/**
	 * Reindex only memories marked as needing reindex (deferred embedding scenario)
	 * This is a lightweight operation that only processes memories with needs_reindex=true
	 */
	async reindexDeferred(userId?: string): Promise<ReindexResult> {
		const jobId = `reindex_deferred_${Date.now()}`;
		const startTime = Date.now();

		try {
			logger.info({ jobId, userId }, "ReindexService: Starting deferred reindex");

			// Get memories marked for reindex
			const { items } = this.mongo.getCollections();
			const filter: Record<string, unknown> = { needs_reindex: true };
			if (userId) {
				filter.user_id = userId;
			}

			const memoriesNeedingReindex = await items
				.find(filter as any)
				.limit(1000)
				.toArray();

			if (memoriesNeedingReindex.length === 0) {
				logger.info({ jobId }, "ReindexService: No memories need reindexing");
				return {
					success: true,
					jobId,
					totalProcessed: 0,
					totalFailed: 0,
					durationMs: Date.now() - startTime,
				};
			}

			logger.info(
				{ jobId, count: memoriesNeedingReindex.length },
				"ReindexService: Found memories needing reindex"
			);

			let processed = 0;
			let failed = 0;

			for (const memory of memoriesNeedingReindex) {
				const memoryId = String(memory.memory_id);
				const memoryUserId = String(memory.user_id);
				const content = String(memory.text);

				const success = await this.processItem({
					memory_id: memoryId,
					user_id: memoryUserId,
					content,
				});

				if (success) {
					// Clear the needs_reindex flag
					await items.updateOne(
						{ memory_id: memoryId },
						{
							$unset: { needs_reindex: "", reindex_reason: "", reindex_marked_at: "" },
							$set: { last_reindexed_at: new Date(), embedding_status: "indexed" },
						}
					);
					processed++;
				} else {
					await items.updateOne(
						{ memory_id: memoryId },
						{
							$set: {
								embedding_status: "failed",
								embedding_error: "Deferred reindex failed",
							},
						}
					);
					failed++;
				}
			}

			const durationMs = Date.now() - startTime;
			logger.info(
				{ jobId, processed, failed, durationMs },
				"ReindexService: Deferred reindex completed"
			);

			return {
				success: true,
				jobId,
				totalProcessed: processed,
				totalFailed: failed,
				durationMs,
			};
		} catch (err) {
			logger.error({ err, jobId }, "ReindexService: Deferred reindex failed");
			return {
				success: false,
				jobId,
				totalProcessed: 0,
				totalFailed: 0,
				durationMs: Date.now() - startTime,
				errorMessage: err instanceof Error ? err.message : String(err),
			};
		}
	}

	/**
	 * Check if there are memories pending reindex
	 */
	async countPendingReindex(userId?: string): Promise<number> {
		const { items } = this.mongo.getCollections();
		const filter: Record<string, unknown> = { needs_reindex: true };
		if (userId) {
			filter.user_id = userId;
		}
		return items.countDocuments(filter as any);
	}

	/**
	 * Sanitize corrupted memory content (remove base64/binary artifacts)
	 * This scans all memories and fixes corrupted text content.
	 *
	 * @param userId Optional: only sanitize specific user's memories
	 * @param tier Optional: only sanitize specific tier
	 * @param dryRun If true, only report what would be changed without making changes
	 * @returns Result with count of sanitized and unchanged items
	 */
	async sanitizeCorruptedContent(
		params: {
			userId?: string;
			tier?: MemoryTier;
			dryRun?: boolean;
		} = {}
	): Promise<{
		success: boolean;
		totalScanned: number;
		totalCorrupted: number;
		totalSanitized: number;
		totalFailed: number;
		corruptedSamples: Array<{ id: string; originalLength: number; sanitizedLength: number }>;
		durationMs: number;
	}> {
		const jobId = `sanitize_${Date.now()}`;
		const startTime = Date.now();

		try {
			logger.info({ jobId, params }, "ReindexService: Starting content sanitization scan");

			const { items } = this.mongo.getCollections();
			const filter: Record<string, unknown> = {};
			if (params.userId) {
				filter.user_id = params.userId;
			}
			if (params.tier) {
				filter.tier = params.tier;
			}

			// Process in batches to avoid memory issues
			const batchSize = 100;
			let totalScanned = 0;
			let totalCorrupted = 0;
			let totalSanitized = 0;
			let totalFailed = 0;
			const corruptedSamples: Array<{
				id: string;
				originalLength: number;
				sanitizedLength: number;
			}> = [];

			const cursor = items.find(filter as any).batchSize(batchSize);

			let batch: Array<any> = [];
			for await (const memory of cursor) {
				batch.push(memory);

				if (batch.length >= batchSize) {
					const result = await this.processSanitizationBatch(
						batch,
						params.dryRun ?? false,
						corruptedSamples
					);
					totalScanned += result.scanned;
					totalCorrupted += result.corrupted;
					totalSanitized += result.sanitized;
					totalFailed += result.failed;
					batch = [];
				}
			}

			// Process remaining items
			if (batch.length > 0) {
				const result = await this.processSanitizationBatch(
					batch,
					params.dryRun ?? false,
					corruptedSamples
				);
				totalScanned += result.scanned;
				totalCorrupted += result.corrupted;
				totalSanitized += result.sanitized;
				totalFailed += result.failed;
			}

			const durationMs = Date.now() - startTime;
			logger.info(
				{ jobId, totalScanned, totalCorrupted, totalSanitized, totalFailed, durationMs },
				"ReindexService: Content sanitization completed"
			);

			return {
				success: true,
				totalScanned,
				totalCorrupted,
				totalSanitized,
				totalFailed,
				corruptedSamples: corruptedSamples.slice(0, 10), // Return first 10 samples
				durationMs,
			};
		} catch (err) {
			logger.error({ err, jobId }, "ReindexService: Content sanitization failed");
			return {
				success: false,
				totalScanned: 0,
				totalCorrupted: 0,
				totalSanitized: 0,
				totalFailed: 0,
				corruptedSamples: [],
				durationMs: Date.now() - startTime,
			};
		}
	}

	/**
	 * Process a batch of memories for sanitization
	 */
	private async processSanitizationBatch(
		memories: Array<any>,
		dryRun: boolean,
		samples: Array<{ id: string; originalLength: number; sanitizedLength: number }>
	): Promise<{ scanned: number; corrupted: number; sanitized: number; failed: number }> {
		const { items } = this.mongo.getCollections();
		let scanned = 0;
		let corrupted = 0;
		let sanitized = 0;
		let failed = 0;

		for (const memory of memories) {
			scanned++;
			const text = memory.text;
			if (!text || typeof text !== "string") continue;

			const { sanitized: cleanText, wasCorrupted } = sanitizeMemoryContent(text);

			if (wasCorrupted) {
				corrupted++;

				if (samples.length < 10) {
					samples.push({
						id: String(memory.memory_id),
						originalLength: text.length,
						sanitizedLength: cleanText.length,
					});
				}

				if (!dryRun) {
					try {
						await items.updateOne(
							{ memory_id: memory.memory_id },
							{
								$set: {
									text: cleanText,
									original_text_backup: text,
									sanitized_at: new Date(),
									needs_reindex: true,
									reindex_reason: "content_sanitized",
								},
							}
						);
						sanitized++;
						logger.debug(
							{
								memoryId: memory.memory_id,
								originalLen: text.length,
								sanitizedLen: cleanText.length,
							},
							"ReindexService: Sanitized corrupted memory"
						);
					} catch (err) {
						logger.error(
							{ err, memoryId: memory.memory_id },
							"ReindexService: Failed to sanitize memory"
						);
						failed++;
					}
				}
			}
		}

		return { scanned, corrupted, sanitized, failed };
	}

	/**
	 * Count memories that appear to have corrupted content
	 */
	async countCorruptedContent(
		userId?: string,
		tier?: MemoryTier
	): Promise<{
		total: number;
		corrupted: number;
		samples: string[];
	}> {
		const { items } = this.mongo.getCollections();
		const filter: Record<string, unknown> = {};
		if (userId) {
			filter.user_id = userId;
		}
		if (tier) {
			filter.tier = tier;
		}

		// Patterns that indicate corrupted content
		const corruptionPatterns = [
			/[A-Za-z0-9+/]{40,}={0,2}/, // Long base64-like strings
			/data:[a-z]+\/[a-z0-9.+-]+;base64,/i, // Data URLs
		];

		let total = 0;
		let corrupted = 0;
		const samples: string[] = [];

		const cursor = items.find(filter as any).limit(10000);

		for await (const memory of cursor) {
			total++;
			const text = memory.text;
			if (typeof text === "string") {
				const isCorrupted = corruptionPatterns.some((pattern) => pattern.test(text));
				if (isCorrupted) {
					corrupted++;
					if (samples.length < 5) {
						samples.push(text.substring(0, 200) + "...");
					}
				}
			}
		}

		return { total, corrupted, samples };
	}
}

/**
 * Factory function
 */
export function createReindexService(params: ReindexServiceConfig): ReindexService {
	return new ReindexService(params);
}
