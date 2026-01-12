/**
 * StoreServiceImpl - Memory storage service implementation
 *
 * Handles storing memories to MongoDB (truth) and Qdrant (index),
 * with deduplication, versioning, and capacity enforcement.
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { MemoryTier, MemoryStatus, MemorySource } from "../types";
import type { MemoryMongoStore } from "../stores/MemoryMongoStore";
import type { QdrantAdapter } from "../adapters/QdrantAdapter";
import type { DictaEmbeddingClient } from "../embedding/DictaEmbeddingClient";
import type {
	StoreService,
	StoreParams,
	StoreResult,
	RemoveBookParams,
	MemorySourceAttribution,
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

		const meta = params.metadata ?? {};
		const bookId =
			params.tier === "books" && typeof (meta as any).book_id === "string"
				? String((meta as any).book_id)
				: null;
		const bookChunkIndex =
			params.tier === "books" && Number.isFinite(Number((meta as any).chunk_index))
				? Number((meta as any).chunk_index)
				: null;
		const bookTitle =
			params.tier === "books" && typeof (meta as any).title === "string"
				? String((meta as any).title)
				: null;
		const bookAuthor =
			params.tier === "books" && typeof (meta as any).author === "string"
				? String((meta as any).author)
				: null;
		const uploadTimestamp =
			params.tier === "books" && typeof (meta as any).upload_timestamp === "string"
				? String((meta as any).upload_timestamp)
				: null;
		const fileType =
			params.tier === "books" && typeof (meta as any).file_type === "string"
				? String((meta as any).file_type)
				: null;
		const mimeType =
			params.tier === "books" && typeof (meta as any).mime_type === "string"
				? String((meta as any).mime_type)
				: null;
		const documentHash =
			params.tier === "books" && typeof (meta as any).document_hash === "string"
				? String((meta as any).document_hash)
				: null;

		const computedSource: MemorySource =
			params.tier === "books" && bookId && bookChunkIndex !== null
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

		// Step 1: Generate embedding (best-effort)
		const vector = await this.embedding.embed(params.text);

		// Step 2: Check for duplicates (optional, based on config)
		if (vector && this.config.dedup.enabled) {
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

		// Step 6: Index in Qdrant (best-effort). Mongo is the source of truth.
		if (!vector) {
			logger.error(
				{
					memoryId: mongoResult.memory_id,
					tier: params.tier,
					endpoint: (this.embedding as unknown as { endpoint?: string })?.endpoint,
				},
				"Embedding unavailable; stored to Mongo only (index deferred)"
			);
			return { memory_id: mongoResult.memory_id };
		}

		try {
			await this.qdrant.upsert({
				id: mongoResult.memory_id,
				vector,
				payload: {
					user_id: params.userId,
					tier: params.tier,
					status: "active" as MemoryStatus,
					content: params.text,
					tags: params.tags ?? [],
					entities: [], // Will be populated by KG service later
					composite_score: qualityScore,
					always_inject: params.alwaysInject ?? false,
					timestamp: Date.now(),
					uses: 0,
					doc_id: computedSource.doc_id,
					chunk_id: computedSource.chunk_id,
					book: computedSource.book,
				},
			});
		} catch (err) {
			logger.error(
				{ err, memoryId: mongoResult.memory_id, tier: params.tier },
				"Qdrant upsert failed; stored to Mongo only (index deferred)"
			);
		}

		const latencyMs = Date.now() - startTime;
		logger.debug(
			{ memoryId: mongoResult.memory_id, tier: params.tier, latencyMs },
			"Memory stored"
		);

		return { memory_id: mongoResult.memory_id };
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

		// Step 1: Find all memory IDs for this book
		const filter = {
			user_id: userId,
			tier: "books",
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
}
