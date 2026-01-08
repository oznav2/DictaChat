/**
 * MemoryMongoStore - MongoDB CRUD operations for Memory System
 *
 * This is the source of truth for all memory data.
 * Qdrant is used for fast vector search but MongoDB owns the data.
 *
 * Key design principles:
 * - All operations have timeouts to prevent blocking streaming
 * - Fail-open: return empty results on timeout/error, never throw to UI path
 * - Wilson scoring for outcome-based ranking
 */

import type { Collection, Db, MongoClient, IndexDescription } from "mongodb";
import { ObjectId } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type {
	MemoryItem,
	MemoryTier,
	MemoryStatus,
	Outcome,
	ActionOutcome,
	ContextType,
	ActionType,
} from "../types";
import type {
	MemoryItemDocument,
	MemoryVersionDocument,
	MemoryOutcomeDocument,
	ActionOutcomeDocument,
	KgNodeDocument,
	KgEdgeDocument,
	ReindexCheckpointDocument,
	ConsistencyLogDocument,
} from "./schemas";
import { MEMORY_COLLECTIONS, MEMORY_COLLECTION_INDEXES } from "./schemas";

export interface MemoryMongoStoreConfig {
	client: MongoClient;
	dbName: string;
	config?: MemoryConfig;
}

export interface StoreMemoryParams {
	userId: string;
	orgId?: string | null;
	tier: MemoryTier;
	text: string;
	summary?: string | null;
	tags?: string[];
	entities?: string[];
	alwaysInject?: boolean;
	source: MemoryItem["source"];
	quality?: MemoryItem["quality"];
	expiresAt?: Date | null;
}

export interface UpdateMemoryParams {
	memoryId: string;
	userId: string;
	text?: string;
	summary?: string | null;
	tags?: string[];
	entities?: string[];
	alwaysInject?: boolean;
	tier?: MemoryTier;
	status?: MemoryStatus;
	changeReason?: string;
}

export interface QueryMemoriesParams {
	userId: string;
	tiers?: MemoryTier[];
	status?: MemoryStatus[];
	tags?: string[];
	entities?: string[];
	textSearch?: string;
	alwaysInject?: boolean;
	minScore?: number;
	limit?: number;
	offset?: number;
	sortBy?: "updated_at" | "created_at" | "wilson_score" | "uses";
	sortOrder?: "asc" | "desc";
}

export interface RecordOutcomeParams {
	memoryId: string;
	userId: string;
	outcome: Outcome;
	contextType: ContextType;
	conversationId?: string | null;
	messageId?: string | null;
	answerAttemptId?: string | null;
	feedbackSource?: "explicit" | "implicit" | "auto_detected";
	feedbackText?: string | null;
}

export interface RecordActionOutcomeParams {
	userId: string;
	actionType: ActionType;
	contextType: ContextType;
	outcome: Outcome;
	conversationId?: string | null;
	messageId?: string | null;
	answerAttemptId?: string | null;
	tier?: MemoryTier | null;
	docId?: string | null;
	memoryId?: string | null;
	actionParams?: Record<string, unknown> | null;
	toolStatus?: "ok" | "error" | "timeout" | null;
	latencyMs?: number | null;
	errorType?: string | null;
	errorMessage?: string | null;
}

/**
 * Calculate Wilson score lower bound for confidence interval
 * Used for ranking memories by outcome success rate
 */
function calculateWilsonScore(successes: number, total: number, z = 1.96): number {
	if (total === 0) return 0.5; // Prior: assume 50% success rate

	const p = successes / total;
	const n = total;

	// Wilson score interval lower bound
	const numerator = p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
	const denominator = 1 + (z * z) / n;

	return Math.max(0, Math.min(1, numerator / denominator));
}

export class MemoryMongoStore {
	private db: Db;
	private config: MemoryConfig;
	private initialized = false;

	// Collections
	private items!: Collection<MemoryItemDocument>;
	private versions!: Collection<MemoryVersionDocument>;
	private outcomes!: Collection<MemoryOutcomeDocument>;
	private actionOutcomes!: Collection<ActionOutcomeDocument>;
	private kgNodes!: Collection<KgNodeDocument>;
	private kgEdges!: Collection<KgEdgeDocument>;
	private reindexCheckpoints!: Collection<ReindexCheckpointDocument>;
	private consistencyLogs!: Collection<ConsistencyLogDocument>;

	constructor(params: MemoryMongoStoreConfig) {
		this.db = params.client.db(params.dbName);
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Initialize collections and create indexes
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		// Get collection references
		this.items = this.db.collection<MemoryItemDocument>(MEMORY_COLLECTIONS.ITEMS);
		this.versions = this.db.collection<MemoryVersionDocument>(MEMORY_COLLECTIONS.VERSIONS);
		this.outcomes = this.db.collection<MemoryOutcomeDocument>(MEMORY_COLLECTIONS.OUTCOMES);
		this.actionOutcomes = this.db.collection<ActionOutcomeDocument>(
			MEMORY_COLLECTIONS.ACTION_OUTCOMES
		);
		this.kgNodes = this.db.collection<KgNodeDocument>(MEMORY_COLLECTIONS.KG_NODES);
		this.kgEdges = this.db.collection<KgEdgeDocument>(MEMORY_COLLECTIONS.KG_EDGES);
		this.reindexCheckpoints = this.db.collection<ReindexCheckpointDocument>(
			MEMORY_COLLECTIONS.REINDEX_CHECKPOINTS
		);
		this.consistencyLogs = this.db.collection<ConsistencyLogDocument>(
			MEMORY_COLLECTIONS.CONSISTENCY_LOGS
		);

		// Create indexes (non-blocking, fire-and-forget with error logging)
		await this.createIndexes();

		this.initialized = true;
		logger.info("MemoryMongoStore initialized");
	}

	private async createIndexes(): Promise<void> {
		const collections: Record<string, Collection<unknown>> = {
			[MEMORY_COLLECTIONS.ITEMS]: this.items,
			[MEMORY_COLLECTIONS.VERSIONS]: this.versions,
			[MEMORY_COLLECTIONS.OUTCOMES]: this.outcomes,
			[MEMORY_COLLECTIONS.ACTION_OUTCOMES]: this.actionOutcomes,
			[MEMORY_COLLECTIONS.KG_NODES]: this.kgNodes,
			[MEMORY_COLLECTIONS.KG_EDGES]: this.kgEdges,
			[MEMORY_COLLECTIONS.REINDEX_CHECKPOINTS]: this.reindexCheckpoints,
			[MEMORY_COLLECTIONS.CONSISTENCY_LOGS]: this.consistencyLogs,
		};

		for (const [collName, indexes] of Object.entries(MEMORY_COLLECTION_INDEXES)) {
			const collection = collections[collName];
			if (!collection) continue;

			for (const indexDef of indexes) {
				try {
					await collection.createIndex(indexDef.key as IndexDescription, {
						background: true,
						...(indexDef as object),
					});
				} catch (err) {
					logger.warn({ err, collection: collName, index: indexDef }, "Failed to create index");
				}
			}
		}
	}

	/**
	 * Execute a MongoDB operation with timeout
	 * Returns null on timeout/error (fail-open behavior)
	 */
	private async withTimeout<T>(
		operation: () => Promise<T>,
		timeoutMs: number,
		operationName: string
	): Promise<T | null> {
		try {
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs);
			});

			return await Promise.race([operation(), timeoutPromise]);
		} catch (err) {
			logger.warn({ err, operation: operationName, timeoutMs }, "MongoDB operation failed");
			return null;
		}
	}

	// ============================================
	// CRUD Operations for Memory Items
	// ============================================

	/**
	 * Store a new memory item
	 */
	async store(params: StoreMemoryParams): Promise<MemoryItem | null> {
		const memoryId = uuidv4();
		const now = new Date();

		const doc: MemoryItemDocument = {
			_id: new ObjectId(),
			memory_id: memoryId,
			user_id: params.userId,
			org_id: params.orgId ?? null,
			tier: params.tier,
			status: "active",
			text: params.text,
			summary: params.summary ?? null,
			tags: params.tags ?? [],
			entities: params.entities ?? [],
			always_inject: params.alwaysInject ?? false,
			source: {
				type: params.source.type,
				conversation_id: params.source.conversation_id,
				message_id: params.source.message_id,
				tool_name: params.source.tool_name,
				tool_run_id: params.source.tool_run_id,
				doc_id: params.source.doc_id,
				chunk_id: params.source.chunk_id,
				book: params.source.book,
			},
			quality: params.quality ?? {
				importance: 0.5,
				confidence: 0.5,
				mentioned_count: 1,
				quality_score: 0.5,
			},
			stats: {
				uses: 0,
				last_used_at: null,
				worked_count: 0,
				failed_count: 0,
				partial_count: 0,
				unknown_count: 0,
				success_rate: 0.5,
				wilson_score: 0.5,
			},
			created_at: now,
			updated_at: now,
			archived_at: null,
			expires_at: params.expiresAt ?? null,
			embedding: null,
			versioning: {
				current_version: 1,
				supersedes_memory_id: null,
			},
		};

		const result = await this.withTimeout(
			async () => {
				await this.items.insertOne(doc);
				return this.documentToMemoryItem(doc);
			},
			this.config.timeouts.mongo_aggregate_ms,
			"store"
		);

		if (result) {
			// Create initial version record (fire-and-forget)
			this.createVersion(memoryId, params.userId, 1, doc, "create", null).catch((err) =>
				logger.warn({ err }, "Failed to create version record")
			);
		}

		return result;
	}

	/**
	 * Get a memory item by ID
	 */
	async getById(memoryId: string, userId: string): Promise<MemoryItem | null> {
		return this.withTimeout(
			async () => {
				const doc = await this.items.findOne({ memory_id: memoryId, user_id: userId });
				return doc ? this.documentToMemoryItem(doc) : null;
			},
			this.config.timeouts.mongo_text_query_ms,
			"getById"
		);
	}

	/**
	 * Update a memory item
	 */
	async update(params: UpdateMemoryParams): Promise<MemoryItem | null> {
		const now = new Date();

		// Get current document for versioning
		const current = await this.items.findOne({
			memory_id: params.memoryId,
			user_id: params.userId,
		});

		if (!current) return null;

		const updateFields: Partial<MemoryItemDocument> = {
			updated_at: now,
		};

		if (params.text !== undefined) updateFields.text = params.text;
		if (params.summary !== undefined) updateFields.summary = params.summary;
		if (params.tags !== undefined) updateFields.tags = params.tags;
		if (params.entities !== undefined) updateFields.entities = params.entities;
		if (params.alwaysInject !== undefined) updateFields.always_inject = params.alwaysInject;
		if (params.tier !== undefined) updateFields.tier = params.tier;
		if (params.status !== undefined) {
			updateFields.status = params.status;
			if (params.status === "archived") {
				updateFields.archived_at = now;
			}
		}

		// Increment version
		const newVersion = current.versioning.current_version + 1;

		const result = await this.withTimeout(
			async () => {
				const updated = await this.items.findOneAndUpdate(
					{ memory_id: params.memoryId, user_id: params.userId },
					{
						$set: updateFields,
						$inc: { "versioning.current_version": 1 },
					},
					{ returnDocument: "after" }
				);
				return updated ? this.documentToMemoryItem(updated) : null;
			},
			this.config.timeouts.mongo_aggregate_ms,
			"update"
		);

		if (result) {
			// Create version record (fire-and-forget)
			const changeType = params.tier !== current.tier ? "promote" : params.status === "archived" ? "archive" : "update";
			this.createVersion(
				params.memoryId,
				params.userId,
				newVersion,
				current,
				changeType,
				params.changeReason ?? null
			).catch((err) => logger.warn({ err }, "Failed to create version record"));
		}

		return result;
	}

	/**
	 * Query memories with filters
	 */
	async query(params: QueryMemoriesParams): Promise<MemoryItem[]> {
		const filter: Record<string, unknown> = {
			user_id: params.userId,
		};

		if (params.tiers?.length) {
			filter.tier = { $in: params.tiers };
		}

		if (params.status?.length) {
			filter.status = { $in: params.status };
		} else {
			filter.status = "active"; // Default to active only
		}

		if (params.tags?.length) {
			filter.tags = { $in: params.tags };
		}

		if (params.entities?.length) {
			filter.entities = { $in: params.entities };
		}

		if (params.alwaysInject !== undefined) {
			filter.always_inject = params.alwaysInject;
		}

		if (params.minScore !== undefined) {
			filter["stats.wilson_score"] = { $gte: params.minScore };
		}

		const sortField = params.sortBy ?? "updated_at";
		const sortOrder = params.sortOrder === "asc" ? 1 : -1;
		const limit = Math.min(params.limit ?? 20, this.config.caps.search_limit_max);
		const offset = params.offset ?? 0;

		// Handle text search separately
		if (params.textSearch) {
			return this.textSearch(params.userId, params.textSearch, {
				tiers: params.tiers,
				status: params.status,
				limit,
			});
		}

		const result = await this.withTimeout(
			async () => {
				const docs = await this.items
					.find(filter)
					.sort({ [sortField]: sortOrder })
					.skip(offset)
					.limit(limit)
					.maxTimeMS(this.config.timeouts.mongo_text_query_ms)
					.toArray();

				return docs.map((doc) => this.documentToMemoryItem(doc));
			},
			this.config.timeouts.mongo_text_query_ms,
			"query"
		);

		return result ?? [];
	}

	/**
	 * Full-text search using MongoDB text index
	 */
	async textSearch(
		userId: string,
		query: string,
		options?: {
			tiers?: MemoryTier[];
			status?: MemoryStatus[];
			limit?: number;
		}
	): Promise<MemoryItem[]> {
		const filter: Record<string, unknown> = {
			user_id: userId,
			$text: { $search: query },
		};

		if (options?.tiers?.length) {
			filter.tier = { $in: options.tiers };
		}

		if (options?.status?.length) {
			filter.status = { $in: options.status };
		} else {
			filter.status = "active";
		}

		const limit = Math.min(options?.limit ?? 20, this.config.caps.search_limit_max);

		const result = await this.withTimeout(
			async () => {
				const docs = await this.items
					.find(filter, { projection: { score: { $meta: "textScore" } } })
					.sort({ score: { $meta: "textScore" } })
					.limit(limit)
					.maxTimeMS(this.config.timeouts.mongo_text_query_ms)
					.toArray();

				return docs.map((doc) => this.documentToMemoryItem(doc));
			},
			this.config.timeouts.mongo_text_query_ms,
			"textSearch"
		);

		return result ?? [];
	}

	/**
	 * Archive a memory (soft delete)
	 */
	async archive(memoryId: string, userId: string, reason?: string): Promise<boolean> {
		const result = await this.update({
			memoryId,
			userId,
			status: "archived",
			changeReason: reason ?? "User archived",
		});
		return result !== null;
	}

	/**
	 * Delete a memory (hard delete - use sparingly)
	 */
	async delete(memoryId: string, userId: string): Promise<boolean> {
		const result = await this.withTimeout(
			async () => {
				const deleted = await this.items.deleteOne({
					memory_id: memoryId,
					user_id: userId,
				});
				return deleted.deletedCount > 0;
			},
			this.config.timeouts.mongo_aggregate_ms,
			"delete"
		);
		return result ?? false;
	}

	/**
	 * Get always-inject memories for a user
	 */
	async getAlwaysInject(userId: string): Promise<MemoryItem[]> {
		return this.query({
			userId,
			alwaysInject: true,
			status: ["active"],
		});
	}

	/**
	 * Count memories by tier
	 */
	async countByTier(userId: string): Promise<Record<MemoryTier, number>> {
		const result = await this.withTimeout(
			async () => {
				const counts = await this.items
					.aggregate([
						{ $match: { user_id: userId, status: "active" } },
						{ $group: { _id: "$tier", count: { $sum: 1 } } },
					])
					.maxTimeMS(this.config.timeouts.mongo_aggregate_ms)
					.toArray();

				const tierCounts: Record<MemoryTier, number> = {
					working: 0,
					history: 0,
					patterns: 0,
					books: 0,
					memory_bank: 0,
				};

				for (const item of counts) {
					tierCounts[item._id as MemoryTier] = item.count;
				}

				return tierCounts;
			},
			this.config.timeouts.mongo_aggregate_ms,
			"countByTier"
		);

		return result ?? { working: 0, history: 0, patterns: 0, books: 0, memory_bank: 0 };
	}

	// ============================================
	// Outcome Recording
	// ============================================

	/**
	 * Record an outcome for a memory and update its stats
	 */
	async recordOutcome(params: RecordOutcomeParams): Promise<boolean> {
		const now = new Date();
		const outcomeId = uuidv4();

		// Calculate score delta
		const deltas = this.config.outcome_deltas;
		const scoreDelta = deltas[params.outcome];

		const result = await this.withTimeout(
			async () => {
				// Update memory stats atomically
				const outcomeField = `stats.${params.outcome}_count`;

				const updated = await this.items.findOneAndUpdate(
					{ memory_id: params.memoryId, user_id: params.userId },
					{
						$inc: {
							"stats.uses": 1,
							[outcomeField]: 1,
						},
						$set: {
							"stats.last_used_at": now,
							updated_at: now,
						},
					},
					{ returnDocument: "after" }
				);

				if (!updated) return false;

				// Recalculate Wilson score
				const stats = updated.stats;
				const total = stats.worked_count + stats.failed_count + stats.partial_count;
				const successes = stats.worked_count + stats.partial_count * 0.5;
				const wilsonScore = calculateWilsonScore(successes, total);
				const successRate = total > 0 ? successes / total : 0.5;

				await this.items.updateOne(
					{ memory_id: params.memoryId },
					{
						$set: {
							"stats.wilson_score": wilsonScore,
							"stats.success_rate": successRate,
						},
					}
				);

				// Record outcome event
				const outcomeDoc: MemoryOutcomeDocument = {
					_id: new ObjectId(),
					outcome_id: outcomeId,
					memory_id: params.memoryId,
					user_id: params.userId,
					outcome: params.outcome,
					context_type: params.contextType,
					conversation_id: params.conversationId ?? null,
					message_id: params.messageId ?? null,
					answer_attempt_id: params.answerAttemptId ?? null,
					feedback_source: params.feedbackSource ?? null,
					feedback_text: params.feedbackText ?? null,
					score_delta: scoreDelta,
					new_wilson_score: wilsonScore,
					created_at: now,
				};

				await this.outcomes.insertOne(outcomeDoc);
				return true;
			},
			this.config.timeouts.mongo_aggregate_ms,
			"recordOutcome"
		);

		return result ?? false;
	}

	/**
	 * Record an action outcome for learning
	 */
	async recordActionOutcome(params: RecordActionOutcomeParams): Promise<boolean> {
		const now = new Date();
		const actionId = uuidv4();

		const doc: ActionOutcomeDocument = {
			_id: new ObjectId(),
			action_id: actionId,
			user_id: params.userId,
			action_type: params.actionType,
			context_type: params.contextType,
			outcome: params.outcome,
			tool_status: params.toolStatus ?? null,
			conversation_id: params.conversationId ?? null,
			message_id: params.messageId ?? null,
			answer_attempt_id: params.answerAttemptId ?? null,
			tier: params.tier ?? null,
			doc_id: params.docId ?? null,
			memory_id: params.memoryId ?? null,
			action_params: params.actionParams ?? null,
			latency_ms: params.latencyMs ?? null,
			error_type: params.errorType ?? null,
			error_message: params.errorMessage ?? null,
			created_at: now,
		};

		const result = await this.withTimeout(
			async () => {
				await this.actionOutcomes.insertOne(doc);
				return true;
			},
			this.config.timeouts.mongo_aggregate_ms,
			"recordActionOutcome"
		);

		return result ?? false;
	}

	/**
	 * Get action effectiveness stats
	 */
	async getActionEffectiveness(
		userId: string,
		actionType?: ActionType,
		contextType?: ContextType
	): Promise<Array<{ actionType: ActionType; contextType: ContextType; successRate: number; totalUses: number }>> {
		const match: Record<string, unknown> = { user_id: userId };
		if (actionType) match.action_type = actionType;
		if (contextType) match.context_type = contextType;

		const result = await this.withTimeout(
			async () => {
				const stats = await this.actionOutcomes
					.aggregate([
						{ $match: match },
						{
							$group: {
								_id: { action_type: "$action_type", context_type: "$context_type" },
								total: { $sum: 1 },
								worked: { $sum: { $cond: [{ $eq: ["$outcome", "worked"] }, 1, 0] } },
								partial: { $sum: { $cond: [{ $eq: ["$outcome", "partial"] }, 1, 0] } },
							},
						},
						{
							$project: {
								actionType: "$_id.action_type",
								contextType: "$_id.context_type",
								totalUses: "$total",
								successRate: {
									$divide: [{ $add: ["$worked", { $multiply: ["$partial", 0.5] }] }, "$total"],
								},
							},
						},
					])
					.maxTimeMS(this.config.timeouts.mongo_aggregate_ms)
					.toArray();

				return stats as Array<{
					actionType: ActionType;
					contextType: ContextType;
					successRate: number;
					totalUses: number;
				}>;
			},
			this.config.timeouts.mongo_aggregate_ms,
			"getActionEffectiveness"
		);

		return result ?? [];
	}

	// ============================================
	// Versioning
	// ============================================

	private async createVersion(
		memoryId: string,
		userId: string,
		versionNumber: number,
		doc: MemoryItemDocument,
		changeType: MemoryVersionDocument["change_type"],
		changeReason: string | null
	): Promise<void> {
		const versionDoc: MemoryVersionDocument = {
			_id: new ObjectId(),
			version_id: uuidv4(),
			memory_id: memoryId,
			user_id: userId,
			version_number: versionNumber,
			text: doc.text,
			summary: doc.summary,
			tags: doc.tags,
			entities: doc.entities,
			tier: doc.tier,
			change_type: changeType,
			change_reason: changeReason,
			stats_snapshot: {
				uses: doc.stats.uses,
				success_rate: doc.stats.success_rate,
				wilson_score: doc.stats.wilson_score,
			},
			created_at: new Date(),
		};

		await this.versions.insertOne(versionDoc);
	}

	/**
	 * Get version history for a memory
	 */
	async getVersionHistory(
		memoryId: string,
		userId: string
	): Promise<Array<{ versionNumber: number; text: string; changeType: string; createdAt: Date }>> {
		const result = await this.withTimeout(
			async () => {
				const versions = await this.versions
					.find({ memory_id: memoryId, user_id: userId })
					.sort({ version_number: -1 })
					.limit(50)
					.toArray();

				return versions.map((v) => ({
					versionNumber: v.version_number,
					text: v.text,
					changeType: v.change_type,
					createdAt: v.created_at,
				}));
			},
			this.config.timeouts.mongo_text_query_ms,
			"getVersionHistory"
		);

		return result ?? [];
	}

	// ============================================
	// Embedding tracking
	// ============================================

	/**
	 * Update embedding info after indexing in Qdrant
	 */
	async updateEmbeddingInfo(
		memoryId: string,
		embeddingInfo: { model: string; dims: number; vectorHash: string }
	): Promise<boolean> {
		const result = await this.withTimeout(
			async () => {
				const updated = await this.items.updateOne(
					{ memory_id: memoryId },
					{
						$set: {
							embedding: {
								model: embeddingInfo.model,
								dims: embeddingInfo.dims,
								vector_hash: embeddingInfo.vectorHash,
								last_indexed_at: new Date(),
							},
						},
					}
				);
				return updated.modifiedCount > 0;
			},
			this.config.timeouts.mongo_aggregate_ms,
			"updateEmbeddingInfo"
		);

		return result ?? false;
	}

	/**
	 * Get memories that need reindexing (never indexed or outdated)
	 */
	async getMemoriesNeedingReindex(userId: string, limit = 100): Promise<MemoryItem[]> {
		const result = await this.withTimeout(
			async () => {
				const docs = await this.items
					.find({
						user_id: userId,
						status: "active",
						$or: [{ embedding: null }, { "embedding.last_indexed_at": null }],
					})
					.limit(limit)
					.toArray();

				return docs.map((doc) => this.documentToMemoryItem(doc));
			},
			this.config.timeouts.mongo_text_query_ms,
			"getMemoriesNeedingReindex"
		);

		return result ?? [];
	}

	// ============================================
	// Helpers
	// ============================================

	private documentToMemoryItem(doc: MemoryItemDocument): MemoryItem {
		return {
			memory_id: doc.memory_id,
			user_id: doc.user_id,
			org_id: doc.org_id,
			tier: doc.tier,
			status: doc.status,
			tags: doc.tags,
			always_inject: doc.always_inject,
			text: doc.text,
			summary: doc.summary,
			entities: doc.entities,
			source: {
				type: doc.source.type,
				conversation_id: doc.source.conversation_id,
				message_id: doc.source.message_id,
				tool_name: doc.source.tool_name,
				tool_run_id: doc.source.tool_run_id,
				doc_id: doc.source.doc_id,
				chunk_id: doc.source.chunk_id,
				book: doc.source.book,
			},
			quality: doc.quality,
			stats: {
				uses: doc.stats.uses,
				last_used_at: doc.stats.last_used_at?.toISOString() ?? null,
				worked_count: doc.stats.worked_count,
				failed_count: doc.stats.failed_count,
				partial_count: doc.stats.partial_count,
				unknown_count: doc.stats.unknown_count,
				success_rate: doc.stats.success_rate,
				wilson_score: doc.stats.wilson_score,
			},
			timestamps: {
				created_at: doc.created_at.toISOString(),
				updated_at: doc.updated_at.toISOString(),
				archived_at: doc.archived_at?.toISOString() ?? null,
				expires_at: doc.expires_at?.toISOString() ?? null,
			},
			embedding: doc.embedding
				? {
						model: doc.embedding.model,
						dims: doc.embedding.dims,
						vector_hash: doc.embedding.vector_hash,
						last_indexed_at: doc.embedding.last_indexed_at?.toISOString() ?? null,
					}
				: undefined,
			versioning: {
				current_version: doc.versioning.current_version,
				supersedes_memory_id: doc.versioning.supersedes_memory_id,
			},
		};
	}

	/**
	 * Get collections for direct access (use sparingly)
	 */
	getCollections() {
		return {
			items: this.items,
			versions: this.versions,
			outcomes: this.outcomes,
			actionOutcomes: this.actionOutcomes,
			kgNodes: this.kgNodes,
			kgEdges: this.kgEdges,
			reindexCheckpoints: this.reindexCheckpoints,
			consistencyLogs: this.consistencyLogs,
		};
	}
}
