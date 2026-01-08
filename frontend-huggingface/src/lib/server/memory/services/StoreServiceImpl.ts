/**
 * StoreServiceImpl - Memory storage service implementation
 *
 * Handles storing memories to MongoDB (truth) and Qdrant (index),
 * with deduplication, versioning, and capacity enforcement.
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { MemoryTier, MemoryStatus } from "../types";
import type { MemoryMongoStore } from "../stores/MemoryMongoStore";
import type { QdrantAdapter } from "../adapters/QdrantAdapter";
import type { DictaEmbeddingClient } from "../embedding/DictaEmbeddingClient";
import type { StoreService, StoreParams, StoreResult, RemoveBookParams } from "../UnifiedMemoryFacade";

export interface StoreServiceImplConfig {
	mongoStore: MemoryMongoStore;
	qdrantAdapter: QdrantAdapter;
	embeddingClient: DictaEmbeddingClient;
	config?: MemoryConfig;
}

interface DedupeResult {
	isDuplicate: boolean;
	existingId?: string;
	similarity?: number;
}

export class StoreServiceImpl implements StoreService {
	private mongo: MemoryMongoStore;
	private qdrant: QdrantAdapter;
	private embedding: DictaEmbeddingClient;
	private config: MemoryConfig;

	constructor(params: StoreServiceImplConfig) {
		this.mongo = params.mongoStore;
		this.qdrant = params.qdrantAdapter;
		this.embedding = params.embeddingClient;
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Store a memory item to MongoDB and Qdrant
	 */
	async store(params: StoreParams): Promise<StoreResult> {
		const startTime = Date.now();

		// Step 1: Generate embedding
		const vector = await this.embedding.embed(params.text);
		if (!vector) {
			throw new Error("Failed to generate embedding for memory");
		}

		// Step 2: Check for duplicates (optional, based on config)
		if (this.config.dedup.enabled) {
			const dedupeResult = await this.checkDuplicate(params.userId, params.tier, vector);
			if (dedupeResult.isDuplicate && dedupeResult.existingId) {
				logger.info(
					{ existingId: dedupeResult.existingId, similarity: dedupeResult.similarity },
					"Duplicate memory detected, returning existing"
				);
				return { memory_id: dedupeResult.existingId };
			}
		}

		// Step 3: Calculate quality score
		const qualityScore = (params.importance ?? 0.5) * (params.confidence ?? 0.5);

		// Step 4: Enforce capacity limits for memory_bank
		if (params.tier === "memory_bank") {
			await this.enforceCapacity(params.userId, params.tier);
		}

		// Step 5: Store in MongoDB (source of truth)
		const mongoResult = await this.mongo.store({
			userId: params.userId,
			tier: params.tier,
			text: params.text,
			tags: params.tags,
			metadata: {
				...params.metadata,
				importance: params.importance,
				confidence: params.confidence,
				always_inject: params.alwaysInject,
				quality_score: qualityScore,
			},
		});

		// Step 6: Index in Qdrant
		await this.qdrant.upsert({
			id: mongoResult.memoryId,
			vector,
			payload: {
				user_id: params.userId,
				tier: params.tier,
				status: "active" as MemoryStatus,
				content: params.text,
				tags: params.tags ?? [],
				entities: [], // Will be populated by KG service later
				importance: params.importance ?? 0.5,
				composite_score: qualityScore,
				always_inject: params.alwaysInject ?? false,
				timestamp: Date.now(),
				uses: 0,
			},
		});

		const latencyMs = Date.now() - startTime;
		logger.debug({ memoryId: mongoResult.memoryId, tier: params.tier, latencyMs }, "Memory stored");

		return { memory_id: mongoResult.memoryId };
	}

	/**
	 * Remove a book and all its chunks
	 */
	async removeBook(params: RemoveBookParams): Promise<void> {
		const { userId, bookId } = params;

		// Find all memories associated with this book
		const bookMemories = await this.mongo.query({
			userId,
			tier: "books",
			metadata: { book_id: bookId },
			limit: 10000, // Get all chunks
		});

		if (bookMemories.length === 0) {
			logger.warn({ bookId }, "No memories found for book");
			return;
		}

		// Archive all book memories in MongoDB
		for (const memory of bookMemories) {
			await this.mongo.archive(memory.memory_id, userId);
		}

		// Delete from Qdrant
		const memoryIds = bookMemories.map((m) => m.memory_id);
		for (const id of memoryIds) {
			await this.qdrant.delete(id);
		}

		logger.info({ bookId, chunkCount: bookMemories.length }, "Book removed");
	}

	/**
	 * Check for duplicate content using vector similarity
	 */
	private async checkDuplicate(
		userId: string,
		tier: MemoryTier,
		vector: number[]
	): Promise<DedupeResult> {
		if (this.qdrant.isCircuitOpen()) {
			return { isDuplicate: false };
		}

		const results = await this.qdrant.search({
			userId,
			vector,
			limit: 1,
			tiers: [tier],
			status: ["active"],
		});

		if (results.length === 0) {
			return { isDuplicate: false };
		}

		const topResult = results[0];
		const similarity = topResult.score;

		if (similarity >= this.config.dedup.similarity_threshold) {
			return {
				isDuplicate: true,
				existingId: topResult.id,
				similarity,
			};
		}

		return { isDuplicate: false };
	}

	/**
	 * Enforce capacity limits by archiving lowest-value memories
	 */
	private async enforceCapacity(userId: string, tier: MemoryTier): Promise<void> {
		const maxActive = this.config.caps.memory_bank_max_active;

		// Count current active memories
		const activeMemories = await this.mongo.query({
			userId,
			tier,
			status: "active",
			limit: maxActive + 100, // Get slightly more to handle overflow
		});

		if (activeMemories.length < maxActive) {
			return; // Under capacity
		}

		// Sort by quality score (lowest first) and archive excess
		const sorted = activeMemories.sort((a, b) => {
			const aScore = (a.metadata?.quality_score as number) ?? 0.5;
			const bScore = (b.metadata?.quality_score as number) ?? 0.5;
			return aScore - bScore;
		});

		const toArchive = sorted.slice(0, activeMemories.length - maxActive + 1);

		for (const memory of toArchive) {
			await this.mongo.archive(memory.memory_id, userId);
			// Update Qdrant payload to mark as archived
			await this.qdrant.updatePayload(memory.memory_id, { status: "archived" });
		}

		logger.info(
			{ userId, tier, archivedCount: toArchive.length },
			"Capacity enforcement: archived low-value memories"
		);
	}
}
