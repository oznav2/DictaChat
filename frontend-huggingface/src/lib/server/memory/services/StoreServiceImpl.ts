/**
 * StoreServiceImpl - Memory storage service implementation
 *
 * Handles storing memories to MongoDB (truth) and Qdrant (index),
 * with deduplication, versioning, and capacity enforcement.
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import { memoryMetrics } from "../observability";
import type { MemoryTier, MemoryStatus, MemorySource } from "../types";
import type { MemoryMongoStore } from "../stores/MemoryMongoStore";
import type { QdrantAdapter } from "../adapters/QdrantAdapter";
import type { DictaEmbeddingClient } from "../embedding/DictaEmbeddingClient";
import type { UnifiedAIClient, ExtractedEntity } from "../ai/UnifiedAIClient";
import type {
	StoreService,
	StoreParams,
	StoreResult,
	RemoveBookParams,
	MemorySourceAttribution,
	GetByIdParams,
	UpdateParams,
	DeleteParams,
	MemoryItemResult,
} from "../UnifiedMemoryFacade";

/**
 * Convert MemorySourceAttribution to MemorySource for storage
 */
function toMemorySource(attr: MemorySourceAttribution | undefined): MemorySource {
	if (!attr) {
		return {
			type: "system",
			conversation_id: null,
			message_id: null,
			tool_name: null,
			tool_run_id: null,
			doc_id: null,
			chunk_id: null,
		};
	}

	// Map attribution type to source type
	const typeMap: Record<MemorySourceAttribution["type"], MemorySource["type"]> = {
		tool: "tool",
		conversation: "assistant",
		manual: "user",
		document: "document",
	};

	return {
		type: typeMap[attr.type] ?? "system",
		conversation_id: attr.conversation_id ?? null,
		message_id: null,
		tool_name: attr.tool_name ?? null,
		tool_run_id: null,
		doc_id: null,
		chunk_id: null,
	};
}

export interface StoreServiceImplConfig {
	mongoStore: MemoryMongoStore;
	qdrantAdapter: QdrantAdapter;
	embeddingClient: DictaEmbeddingClient;
	unifiedAIClient?: UnifiedAIClient;
	config?: MemoryConfig;
}

export class StoreServiceImpl implements StoreService {
	private mongo: MemoryMongoStore;
	private qdrant: QdrantAdapter;
	private embedding: DictaEmbeddingClient;
	private unifiedAI: UnifiedAIClient | null;
	private config: MemoryConfig;
	private embeddingQueue: Array<() => Promise<void>> = [];
	private embeddingInFlight = 0;
	private readonly embeddingConcurrency = 2;

	constructor(params: StoreServiceImplConfig) {
		this.mongo = params.mongoStore;
		this.qdrant = params.qdrantAdapter;
		this.embedding = params.embeddingClient;
		this.unifiedAI = params.unifiedAIClient ?? null;
		this.config = params.config ?? defaultMemoryConfig;
	}

	private toPreview(text: string): string {
		const normalized = text.replace(/\r/g, "").trim();
		const maxLen = 280;
		if (normalized.length <= maxLen) {
			return normalized;
		}
		return `${normalized.slice(0, maxLen)}...`;
	}

	/**
	 * Store a memory item to MongoDB and Qdrant
	 */
	async store(params: StoreParams): Promise<StoreResult> {
		const startTime = Date.now();
		let success = false;

		try {
			const meta = params.metadata ?? {};
			const bookId =
				params.tier === "documents" && typeof (meta as any).book_id === "string"
					? String((meta as any).book_id)
					: null;
			const bookChunkIndex =
				params.tier === "documents" && Number.isFinite(Number((meta as any).chunk_index))
					? Number((meta as any).chunk_index)
					: null;
			const bookTitle =
				params.tier === "documents" && typeof (meta as any).title === "string"
					? String((meta as any).title)
					: null;
			const bookAuthor =
				params.tier === "documents" && typeof (meta as any).author === "string"
					? String((meta as any).author)
					: null;
			const uploadTimestamp =
				params.tier === "documents" && typeof (meta as any).upload_timestamp === "string"
					? String((meta as any).upload_timestamp)
					: null;
			const fileType =
				params.tier === "documents" && typeof (meta as any).file_type === "string"
					? String((meta as any).file_type)
					: null;
			const mimeType =
				params.tier === "documents" && typeof (meta as any).mime_type === "string"
					? String((meta as any).mime_type)
					: null;
			const documentHash =
				params.tier === "documents" && typeof (meta as any).document_hash === "string"
					? String((meta as any).document_hash)
					: null;

			const computedSource: MemorySource =
				params.tier === "documents" && bookId && bookChunkIndex !== null
					? {
							type: "document",
							conversation_id: null,
							message_id: null,
							tool_name: null,
							tool_run_id: null,
							doc_id: `book:${bookId}`,
							chunk_id: String(bookChunkIndex),
							book: {
								book_id: bookId,
								title: bookTitle ?? "Unknown",
								author: bookAuthor,
								chunk_index: bookChunkIndex,
								source_context: null,
								doc_position: null,
								has_code: null,
								token_count: null,
								upload_timestamp: uploadTimestamp,
								file_type: fileType,
								mime_type: mimeType,
								document_hash: documentHash,
							},
						}
					: toMemorySource(params.source);

			// Calculate quality score
			const qualityScore = (params.importance ?? 0.5) * (params.confidence ?? 0.5);

			// Enforce capacity limits
			if (params.tier === "memory_bank") {
				await this.enforceCapacity(params.userId, params.tier);
			}

			if (params.tier === "working" || params.tier === "history") {
				await this.enforcePerTierCap(params.userId, params.tier);
			}

			// Store in MongoDB (source of truth)
			const mongoResult = await this.mongo.store({
				userId: params.userId,
				tier: params.tier,
				text: params.text,
				tags: params.tags,
				alwaysInject: params.alwaysInject ?? false,
				// Phase 9.9: Source attribution
				source: computedSource,
				quality: {
					importance: params.importance ?? 0.5,
					confidence: params.confidence ?? 0.5,
					mentioned_count: 0,
					quality_score: qualityScore,
				},
			});

			if (!mongoResult) {
				throw new Error("Failed to store memory in MongoDB");
			}

			try {
				await this.markForReindex(mongoResult.memory_id, params.userId, {
					reason: "async_ingestion",
					status: "pending",
				});
			} catch (err) {
				logger.warn({ err, memoryId: mongoResult.memory_id }, "Failed to mark memory for reindex");
			}

			this.queueEmbeddingTask(async () => {
				await this.embedAndIndex({
					memoryId: mongoResult.memory_id,
					userId: params.userId,
					tier: params.tier,
					text: params.text,
					tags: params.tags ?? [],
					alwaysInject: params.alwaysInject ?? false,
					qualityScore,
					source: computedSource,
				});
			});

			const latencyMs = Date.now() - startTime;
			logger.debug(
				{ memoryId: mongoResult.memory_id, tier: params.tier, latencyMs },
				"Memory stored"
			);

			success = true;

			return {
				memory_id: mongoResult.memory_id,
				tier: params.tier,
				preview: this.toPreview(params.text),
			};
		} finally {
			const durationMs = Date.now() - startTime;
			memoryMetrics.recordOperation("store", success, params.tier);
			memoryMetrics.recordLatency("store", durationMs);
		}
	}

	/**
	 * Remove a book and ALL its traces (complete deletion)
	 *
	 * Cleans up:
	 * - memory_items (DELETE, not archive)
	 * - memory_versions (version history)
	 * - memory_outcomes (outcome records)
	 * - kg_nodes (remove memory_id references)
	 * - Qdrant vectors
	 */
	async removeBook(params: RemoveBookParams): Promise<void> {
		const { userId, bookId } = params;

		const { items, versions, outcomes, kgNodes } = this.mongo.getCollections();

		// Step 1: Find all memory IDs for this document
		const filter = {
			user_id: userId,
			tier: "documents",
			"source.book.book_id": bookId,
		} as const;

		const bookMemories = await items
			.find(filter, { projection: { memory_id: 1, entities: 1 } })
			.limit(20000)
			.toArray();

		if (bookMemories.length === 0) {
			logger.warn({ bookId }, "No memories found for book");
			return;
		}

		const memoryIds = bookMemories.map((m: any) => String(m.memory_id));
		const allEntities = new Set<string>();
		bookMemories.forEach((m: any) => {
			(m.entities ?? []).forEach((e: string) => allEntities.add(e));
		});

		logger.info(
			{ bookId, chunkCount: memoryIds.length, entityCount: allEntities.size },
			"Starting complete book deletion"
		);

		// Step 2: Delete memory_items (not archive - full deletion)
		await items.deleteMany(filter);

		// Step 3: Delete memory_versions for these memories
		if (memoryIds.length > 0) {
			await versions.deleteMany({ memory_id: { $in: memoryIds } });
		}

		// Step 4: Delete memory_outcomes for these memories
		if (memoryIds.length > 0) {
			await outcomes.deleteMany({ memory_id: { $in: memoryIds } });
		}

		// Step 5: Update kg_nodes to remove memory_id references
		if (memoryIds.length > 0) {
			await kgNodes.updateMany(
				{ user_id: userId, memory_ids: { $in: memoryIds } },
				{ $pull: { memory_ids: { $in: memoryIds } } as any }
			);

			// Clean up orphaned kg_nodes (nodes with no more memory references)
			await kgNodes.deleteMany({
				user_id: userId,
				memory_ids: { $size: 0 },
			});
		}

		// Step 6: Delete from Qdrant
		if (memoryIds.length > 0) {
			await this.qdrant.delete(memoryIds);
		}

		logger.info(
			{ bookId, deletedChunks: memoryIds.length, cleanedEntities: allEntities.size },
			"Book completely removed (all traces deleted)"
		);
	}

	/**
	 * Get a memory by ID
	 * Phase 1: Consolidate Memory Collections
	 */
	async getById(params: GetByIdParams): Promise<MemoryItemResult | null> {
		const { userId, memoryId } = params;

		const item = await this.mongo.getById(memoryId, userId);
		if (!item) {
			return null;
		}

		return {
			memory_id: item.memory_id,
			text: item.text,
			tags: item.tags,
			status: item.status,
			tier: item.tier,
			score: item.stats?.wilson_score ?? 0.5,
			created_at: new Date(item.timestamps.created_at),
			updated_at: new Date(item.timestamps.updated_at),
			archived_at: item.timestamps.archived_at ? new Date(item.timestamps.archived_at) : undefined,
			archived_reason: undefined, // Not stored in current schema
		};
	}

	/**
	 * Update a memory
	 * Phase 1: Consolidate Memory Collections
	 */
	async update(params: UpdateParams): Promise<MemoryItemResult | null> {
		const { userId, memoryId, text, tags, status, archivedReason } = params;

		const result = await this.mongo.update({
			userId,
			memoryId,
			text,
			tags,
			status: status as MemoryStatus,
			changeReason: archivedReason,
		});

		if (!result) {
			return null;
		}

		return {
			memory_id: result.memory_id,
			text: result.text,
			tags: result.tags,
			status: result.status,
			tier: result.tier,
			score: result.stats?.wilson_score ?? 0.5,
			created_at: new Date(result.timestamps.created_at),
			updated_at: new Date(result.timestamps.updated_at),
			archived_at: result.timestamps.archived_at
				? new Date(result.timestamps.archived_at)
				: undefined,
			archived_reason: archivedReason,
		};
	}

	/**
	 * Delete a memory (hard delete)
	 * Phase 1: Consolidate Memory Collections
	 */
	async delete(params: DeleteParams): Promise<boolean> {
		const { userId, memoryId } = params;

		// Delete from MongoDB
		const deleted = await this.mongo.delete(memoryId, userId);

		if (deleted) {
			// Also delete from Qdrant
			try {
				await this.qdrant.delete([memoryId]);
			} catch (err) {
				logger.error(
					{ err, memoryId },
					"Failed to delete from Qdrant (MongoDB deletion succeeded)"
				);
			}
		}

		return deleted;
	}

	/**
	 * Enforce capacity limits by archiving lowest-value memories
	 */
	private async enforceCapacity(userId: string, tier: MemoryTier): Promise<void> {
		const maxActive = this.config.caps.max_memory_bank_items;

		// Count current active memories
		const activeMemories = await this.mongo.query({
			userId,
			tiers: [tier],
			status: ["active"],
			limit: maxActive + 100, // Get slightly more to handle overflow
		});

		if (activeMemories.length < maxActive) {
			return; // Under capacity
		}

		// Sort by quality score (lowest first) and archive excess
		const sorted = activeMemories.sort((a, b) => {
			const aScore = a.quality?.quality_score ?? 0.5;
			const bScore = b.quality?.quality_score ?? 0.5;
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

	private async enforcePerTierCap(userId: string, tier: MemoryTier): Promise<void> {
		const cap = tier === "working" ? 1000 : tier === "history" ? 10000 : null;
		if (!cap) return;

		const { items } = this.mongo.getCollections();
		const filter = { user_id: userId, tier, status: "active" as const };
		const count = await items.countDocuments(filter as any);
		const overBy = count - cap;
		if (overBy <= 0) return;

		const toArchive = await items
			.find(filter as any, { projection: { memory_id: 1 } })
			.sort({ updated_at: 1 })
			.limit(overBy)
			.toArray();

		for (const doc of toArchive) {
			const memoryId = String((doc as any).memory_id);
			const archived = await this.mongo.archive(memoryId, userId, "Tier cap enforcement");
			if (archived) {
				try {
					await this.qdrant.updatePayload(memoryId, { status: "archived" });
				} catch (err) {
					logger.warn(
						{ err, memoryId },
						"Failed to update Qdrant payload during tier cap enforcement"
					);
				}
			}
		}
	}

	/**
	 * Mark a memory as needing reindex (for deferred embedding scenarios)
	 * Uses MongoDB to track memories that weren't indexed in Qdrant
	 */
	private async markForReindex(
		memoryId: string,
		userId: string,
		params?: { reason?: string; status?: "pending" | "failed"; error?: string | null }
	): Promise<void> {
		const { items } = this.mongo.getCollections();
		await items.updateOne(
			{ memory_id: memoryId, user_id: userId },
			{
				$set: {
					needs_reindex: true,
					reindex_reason: params?.reason ?? "embedding_unavailable",
					reindex_marked_at: new Date(),
					embedding_status: params?.status ?? "pending",
					embedding_error: params?.error ?? null,
				},
			}
		);
		logger.debug({ memoryId, userId }, "Memory marked for reindex");
	}

	private queueEmbeddingTask(task: () => Promise<void>): void {
		this.embeddingQueue.push(task);
		void this.drainEmbeddingQueue();
	}

	private drainEmbeddingQueue(): void {
		while (this.embeddingInFlight < this.embeddingConcurrency && this.embeddingQueue.length > 0) {
			const task = this.embeddingQueue.shift();
			if (!task) return;
			this.embeddingInFlight++;
			task()
				.catch((err) => logger.warn({ err }, "Embedding task failed"))
				.finally(() => {
					this.embeddingInFlight--;
					this.drainEmbeddingQueue();
				});
		}
	}

	private async embedAndIndex(params: {
		memoryId: string;
		userId: string;
		tier: MemoryTier;
		text: string;
		tags: string[];
		alwaysInject: boolean;
		qualityScore: number;
		source: MemorySource;
	}): Promise<void> {
		const { items } = this.mongo.getCollections();

		let vector: number[] | null = null;
		let entities: ExtractedEntity[] = [];

		// Use UnifiedAIClient for parallel NER + Embedding when available
		if (this.unifiedAI) {
			try {
				const enrichment = await this.unifiedAI.processTextFull(
					params.text,
					`store-${params.memoryId}`
				);
				vector = enrichment.embedding;
				entities = enrichment.entities;

				if (enrichment.metadata.nerDegraded) {
					logger.debug(
						{ memoryId: params.memoryId },
						"NER degraded during enrichment, entities may be incomplete"
					);
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				await items.updateOne(
					{ memory_id: params.memoryId, user_id: params.userId },
					{ $set: { embedding_status: "failed", embedding_error: msg } }
				);
				return;
			}
		} else {
			// Fallback: embedding only (no NER)
			try {
				vector = await this.embedding.embed(params.text);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				await items.updateOne(
					{ memory_id: params.memoryId, user_id: params.userId },
					{ $set: { embedding_status: "failed", embedding_error: msg } }
				);
				return;
			}
		}

		if (!vector || vector.length === 0) {
			await items.updateOne(
				{ memory_id: params.memoryId, user_id: params.userId },
				{ $set: { embedding_status: "failed", embedding_error: "Embedding unavailable" } }
			);
			return;
		}

		// Convert entities to string array for Qdrant payload
		const entityStrings = entities.map((e) => `${e.entityGroup}:${e.word}`);

		try {
			await this.qdrant.upsert({
				id: params.memoryId,
				vector,
				payload: {
					user_id: params.userId,
					tier: params.tier,
					status: "active" as MemoryStatus,
					content: params.text,
					tags: params.tags,
					entities: entityStrings,
					composite_score: params.qualityScore,
					always_inject: params.alwaysInject,
					timestamp: Date.now(),
					uses: 0,
					doc_id: params.source.doc_id,
					chunk_id: params.source.chunk_id,
					book: params.source.book,
				},
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			await items.updateOne(
				{ memory_id: params.memoryId, user_id: params.userId },
				{ $set: { embedding_status: "failed", embedding_error: msg } }
			);
			return;
		}

		// Update MongoDB with entities and indexed status
		await items.updateOne(
			{ memory_id: params.memoryId, user_id: params.userId },
			{
				$unset: {
					needs_reindex: "",
					reindex_reason: "",
					reindex_marked_at: "",
					embedding_error: "",
				},
				$set: {
					embedding_status: "indexed",
					last_reindexed_at: new Date(),
					entities: entityStrings,
				},
			}
		);
	}
}
