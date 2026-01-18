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
	SearchResult,
} from "../types";

// ============================================
// Phase 23: v0.2.8 Bug Fixes (Safeguards)
// ============================================

/**
 * Valid outcome types for memory feedback.
 * Phase 23.1: Explicit type definition prevents invalid outcomes from silently falling through.
 */
const VALID_OUTCOMES = ["worked", "failed", "partial", "unknown"] as const;
type ValidOutcome = (typeof VALID_OUTCOMES)[number];

/**
 * Success values for Wilson score calculation.
 * Phase 23.1/22.3: Authoritative outcome semantics.
 *
 * | Outcome | success_count Delta | Wilson Impact |
 * |---------|---------------------|---------------|
 * | worked  | +1.0                | Positive      |
 * | partial | +0.5                | Neutral       |
 * | unknown | +0.25               | Weak negative (surfaced but unused) |
 * | failed  | +0.0                | Strong negative |
 */
const OUTCOME_SUCCESS_VALUES: Record<ValidOutcome, number> = {
	worked: 1.0,
	partial: 0.5,
	unknown: 0.25,
	failed: 0.0,
};

/**
 * Check if an outcome is valid.
 * Phase 23.1: Validates outcome type before processing.
 */
function isValidOutcome(outcome: string): outcome is ValidOutcome {
	return VALID_OUTCOMES.includes(outcome as ValidOutcome);
}

/**
 * Get the success delta for an outcome.
 * Phase 23.1: Uses explicit switch statement with TypeScript exhaustiveness check.
 * NO DEFAULT CASE - TypeScript will error if a case is missing.
 */
function getSuccessDelta(outcome: ValidOutcome): number {
	switch (outcome) {
		case "worked":
			return OUTCOME_SUCCESS_VALUES.worked;
		case "partial":
			return OUTCOME_SUCCESS_VALUES.partial;
		case "unknown":
			return OUTCOME_SUCCESS_VALUES.unknown;
		case "failed":
			return OUTCOME_SUCCESS_VALUES.failed;
	}
	// TypeScript exhaustiveness check - this should never be reached
	const _exhaustiveCheck: never = outcome;
	return _exhaustiveCheck;
}
import type {
	MemoryItemDocument,
	MemoryVersionDocument,
	MemoryOutcomeDocument,
	ActionOutcomeDocument,
	KnownSolutionDocument,
	KgNodeDocument,
	KgEdgeDocument,
	PersonalityMemoryMappingDocument,
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
	personalityId?: string | null;
	personalityName?: string | null;
	language?: "he" | "en" | "mixed" | "none";
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
	/** Time weight for score decay (Roampal pattern: 1.0 / (1 + age_days / 30)) */
	timeWeight?: number;
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
 * Calculate Wilson score lower bound for confidence interval.
 * Used for ranking memories by outcome success rate.
 *
 * Phase 23.2: Now uses cumulative success_count field instead of capped outcome_history.
 * This fixes the bug where Wilson was incorrectly calculated for memories with >10 uses.
 *
 * @param successCount - Cumulative success value (sum of outcome success deltas)
 * @param uses - Total number of uses (denominator)
 * @param z - Z-score for confidence interval (default: 1.96 for 95% CI)
 * @returns Wilson score lower bound [0, 1]
 */
function calculateWilsonScore(successCount: number, uses: number, z = 1.96): number {
	if (uses === 0) return 0.5; // Prior: assume 50% success rate

	const p = successCount / uses;
	const n = uses;

	// Wilson score interval lower bound
	const numerator = p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
	const denominator = 1 + (z * z) / n;

	return Math.max(0, Math.min(1, numerator / denominator));
}

/**
 * Calculate Wilson score from memory stats with fallback for legacy records.
 * Phase 23.2: Uses success_count field if available, falls back to counting individual outcome counts.
 *
 * @param stats - Memory stats object
 * @returns Wilson score [0, 1]
 */
function calculateWilsonFromStats(stats: {
	uses: number;
	success_count?: number;
	worked_count: number;
	partial_count: number;
	unknown_count: number;
	failed_count: number;
}): number {
	const uses = stats.uses;
	if (uses === 0) return 0.5;

	// Phase 23.2: Prefer success_count if available (new field)
	if (typeof stats.success_count === "number") {
		return calculateWilsonScore(stats.success_count, uses);
	}

	// Fallback: Calculate from individual counts (legacy records)
	// This logs a warning so we can track migration progress
	logger.warn(
		{ uses, worked: stats.worked_count, partial: stats.partial_count },
		"[Phase 23.2] Using fallback Wilson calculation - success_count field missing"
	);

	const successCount =
		stats.worked_count * OUTCOME_SUCCESS_VALUES.worked +
		stats.partial_count * OUTCOME_SUCCESS_VALUES.partial +
		stats.unknown_count * OUTCOME_SUCCESS_VALUES.unknown +
		stats.failed_count * OUTCOME_SUCCESS_VALUES.failed;

	return calculateWilsonScore(successCount, uses);
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
	private knownSolutions!: Collection<KnownSolutionDocument>;
	private kgNodes!: Collection<KgNodeDocument>;
	private kgEdges!: Collection<KgEdgeDocument>;
	private personalityMappings!: Collection<PersonalityMemoryMappingDocument>;
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
		this.knownSolutions = this.db.collection<KnownSolutionDocument>(
			MEMORY_COLLECTIONS.KNOWN_SOLUTIONS
		);
		this.kgNodes = this.db.collection<KgNodeDocument>(MEMORY_COLLECTIONS.KG_NODES);
		this.kgEdges = this.db.collection<KgEdgeDocument>(MEMORY_COLLECTIONS.KG_EDGES);
		this.personalityMappings = this.db.collection<PersonalityMemoryMappingDocument>(
			MEMORY_COLLECTIONS.PERSONALITY_MAPPINGS
		);
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
		// Create indexes for each collection individually to maintain type safety
		const indexConfigs: Array<{
			collection: Collection<Document>;
			indexes: (typeof MEMORY_COLLECTION_INDEXES)[keyof typeof MEMORY_COLLECTION_INDEXES];
		}> = [
			{
				collection: this.items as unknown as Collection<Document>,
				indexes: MEMORY_COLLECTION_INDEXES[MEMORY_COLLECTIONS.ITEMS],
			},
			{
				collection: this.versions as unknown as Collection<Document>,
				indexes: MEMORY_COLLECTION_INDEXES[MEMORY_COLLECTIONS.VERSIONS],
			},
			{
				collection: this.outcomes as unknown as Collection<Document>,
				indexes: MEMORY_COLLECTION_INDEXES[MEMORY_COLLECTIONS.OUTCOMES],
			},
			{
				collection: this.actionOutcomes as unknown as Collection<Document>,
				indexes: MEMORY_COLLECTION_INDEXES[MEMORY_COLLECTIONS.ACTION_OUTCOMES],
			},
			{
				collection: this.knownSolutions as unknown as Collection<Document>,
				indexes: MEMORY_COLLECTION_INDEXES[MEMORY_COLLECTIONS.KNOWN_SOLUTIONS],
			},
			{
				collection: this.kgNodes as unknown as Collection<Document>,
				indexes: MEMORY_COLLECTION_INDEXES[MEMORY_COLLECTIONS.KG_NODES],
			},
			{
				collection: this.kgEdges as unknown as Collection<Document>,
				indexes: MEMORY_COLLECTION_INDEXES[MEMORY_COLLECTIONS.KG_EDGES],
			},
			{
				collection: this.reindexCheckpoints as unknown as Collection<Document>,
				indexes: MEMORY_COLLECTION_INDEXES[MEMORY_COLLECTIONS.REINDEX_CHECKPOINTS],
			},
			{
				collection: this.consistencyLogs as unknown as Collection<Document>,
				indexes: MEMORY_COLLECTION_INDEXES[MEMORY_COLLECTIONS.CONSISTENCY_LOGS],
			},
		];

		for (const config of indexConfigs) {
			if (!config.indexes) continue;

			for (const indexDef of config.indexes) {
				try {
					// indexDef.key is the index specification
					const indexSpec = indexDef.key ?? indexDef;
					await config.collection.createIndex(indexSpec as unknown as Record<string, 1 | -1>, {
						background: true,
					});
				} catch (err) {
					logger.warn({ err, index: indexDef }, "Failed to create index");
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
				setTimeout(
					() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
					timeoutMs
				);
			});

			return await Promise.race([operation(), timeoutPromise]);
		} catch (err) {
			logger.warn({ err, operation: operationName, timeoutMs }, "MongoDB operation failed");
			return null;
		}
	}

	async recordKnownSolution(params: {
		userId: string;
		problemHash: string;
		memoryId: string;
		now?: Date;
	}): Promise<void> {
		const now = params.now ?? new Date();
		await this.withTimeout(
			async () => {
				await this.knownSolutions.updateOne(
					{ user_id: params.userId, problem_hash: params.problemHash },
					[
						{
							$set: {
								user_id: params.userId,
								problem_hash: params.problemHash,
								memory_id: params.memoryId,
								first_used_at: { $ifNull: ["$first_used_at", now] },
								last_used_at: now,
								success_count: {
									$cond: [
										{ $eq: ["$memory_id", params.memoryId] },
										{ $add: [{ $ifNull: ["$success_count", 0] }, 1] },
										1,
									],
								},
							},
						},
					],
					{ upsert: true }
				);
				return true;
			},
			this.config.timeouts.mongo_text_query_ms,
			"recordKnownSolution"
		);
	}

	async getKnownSolution(userId: string, problemHash: string): Promise<SearchResult | null> {
		const doc = await this.withTimeout(
			async () => this.knownSolutions.findOne({ user_id: userId, problem_hash: problemHash }),
			this.config.timeouts.mongo_text_query_ms,
			"getKnownSolution"
		);
		if (!doc) return null;

		const memory = await this.getById(String(doc.memory_id), userId);
		if (!memory) return null;
		if (memory.tier !== "patterns") return null;

		const citations = [
			{
				source_type: memory.source.type,
				memory_id: memory.memory_id,
				conversation_id: memory.source.conversation_id ?? null,
				message_id: memory.source.message_id ?? null,
				tool_name: memory.source.tool_name ?? null,
				doc_id: memory.source.doc_id ?? null,
				chunk_id: memory.source.chunk_id ?? null,
				...(memory.source.book ? { book: memory.source.book } : {}),
			},
		];

		return {
			position: 1,
			tier: memory.tier,
			memory_id: memory.memory_id,
			content: memory.text,
			preview: memory.summary ?? memory.text.slice(0, 200),
			citations,
			score_summary: {
				final_score: 999,
				wilson_score: memory.stats?.wilson_score ?? undefined,
				uses: memory.stats?.uses ?? undefined,
				updated_at: memory.timestamps?.updated_at ?? null,
				created_at: memory.timestamps?.created_at ?? null,
			},
		};
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

		logger.info(
			{
				dbName: this.db.databaseName,
				collection: this.items.collectionName,
				memoryId,
			},
			"[MemoryMongoStore] storing item"
		);

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
				success_count: 0, // Phase 23.2: Cumulative success for Wilson calculation
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
			personality: {
				source_personality_id: params.personalityId ?? null,
				source_personality_name: params.personalityName ?? null,
			},
			// MongoDB text indexes don't support "mixed" - use "none" to disable language-specific stemming
			// This is optimal for bilingual Hebrew/English content
			language: params.language && params.language !== "mixed" ? params.language : "none",
			translation_ref_id: null,
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
				const doc = (await this.items.findOneAndUpdate(
					{ memory_id: params.memoryId, user_id: params.userId },
					{
						$set: updateFields,
						$inc: { "versioning.current_version": 1 },
					},
					{ returnDocument: "after" }
				)) as unknown as MemoryItemDocument | null;
				return doc ? this.documentToMemoryItem(doc) : null;
			},
			this.config.timeouts.mongo_aggregate_ms,
			"update"
		);

		if (result) {
			// Create version record (fire-and-forget)
			const changeType =
				params.tier !== current.tier
					? "promote"
					: params.status === "archived"
						? "archive"
						: "update";
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

				logger.info({ userId, counts }, "[MemoryMongoStore] countByTier raw result");

				const tierCounts: Record<MemoryTier, number> = {
					working: 0,
					history: 0,
					patterns: 0,
					documents: 0,
					memory_bank: 0,
					datagov_schema: 0,
					datagov_expansion: 0,
				};

				for (const item of counts) {
					tierCounts[item._id as MemoryTier] = item.count;
				}

				return tierCounts;
			},
			this.config.timeouts.mongo_aggregate_ms,
			"countByTier"
		);

		return (
			result ?? {
				working: 0,
				history: 0,
				patterns: 0,
				documents: 0,
				memory_bank: 0,
				datagov_schema: 0,
				datagov_expansion: 0,
			}
		);
	}

	// ============================================
	// Outcome Recording
	// ============================================

	/**
	 * Record an outcome for a memory and update its stats.
	 *
	 * Phase 23 Bug Fixes (v0.2.8 Safeguards):
	 * - 23.1: Validates outcome type explicitly (no silent fallthrough)
	 * - 23.2: Uses cumulative success_count for Wilson (not capped history)
	 * - 23.3: Always increments uses counter (including for failed/unknown)
	 * - 23.4: Atomic update with aggregation pipeline
	 *
	 * Roampal-aligned: Uses time-weighted score deltas.
	 */
	async recordOutcome(params: RecordOutcomeParams): Promise<boolean> {
		const now = new Date();
		const outcomeId = uuidv4();

		// Phase 23.1: Validate outcome type explicitly
		if (!isValidOutcome(params.outcome)) {
			logger.warn(
				{ outcome: params.outcome, memoryId: params.memoryId },
				"[Phase 23.1] Invalid outcome type - rejecting"
			);
			return false;
		}

		// Phase 23.1: Get success delta using explicit switch (no default case)
		const successDelta = getSuccessDelta(params.outcome);

		// Calculate time-weighted score delta (Roampal pattern)
		const deltas = this.config.outcome_deltas;
		const baseDelta = deltas[params.outcome];
		const timeWeight = params.timeWeight ?? 1.0;
		const scoreDelta = baseDelta * timeWeight;

		logger.debug(
			{
				memoryId: params.memoryId,
				outcome: params.outcome,
				successDelta,
				scoreDelta,
				timeWeight,
			},
			"[Phase 23] Recording outcome"
		);

		const result = await this.withTimeout(
			async () => {
				// Phase 23.3 & 23.4: Atomic update with aggregation pipeline
				// - Always increment uses (outside conditionals)
				// - Always increment success_count by successDelta
				// - Calculate Wilson in same operation (atomicity)
				const outcomeField = `stats.${params.outcome}_count`;

				const updated = (await this.items.findOneAndUpdate(
					{ memory_id: params.memoryId, user_id: params.userId },
					[
						{
							$set: {
								// Phase 23.3: ALWAYS increment uses (for ALL outcomes including failed/unknown)
								"stats.uses": { $add: [{ $ifNull: ["$stats.uses", 0] }, 1] },
								// Increment specific outcome counter
								[outcomeField]: { $add: [{ $ifNull: [`$${outcomeField}`, 0] }, 1] },
								// Phase 23.2: Increment cumulative success_count
								"stats.success_count": {
									$add: [{ $ifNull: ["$stats.success_count", 0] }, successDelta],
								},
								"stats.last_used_at": now,
								updated_at: now,
							},
						},
					],
					{ returnDocument: "after" }
				)) as unknown as MemoryItemDocument | null;

				if (!updated) {
					logger.warn(
						{ memoryId: params.memoryId },
						"[Phase 23] Memory not found for outcome recording"
					);
					return false;
				}

				// Phase 23.2 & 23.4: Recalculate Wilson from cumulative stats
				let stats = updated.stats;
				if (!stats) {
					// Phase 23.5: Initialize stats for legacy memories missing this field
					logger.info(
						{ memoryId: params.memoryId },
						"[Phase 23.5] Initializing missing stats field for legacy memory"
					);
					const defaultStats = {
						uses: 1,
						last_used_at: now,
						worked_count: params.outcome === "worked" ? 1 : 0,
						failed_count: params.outcome === "failed" ? 1 : 0,
						partial_count: params.outcome === "partial" ? 1 : 0,
						unknown_count: params.outcome === "unknown" ? 1 : 0,
						success_count: successDelta,
						success_rate: 0.5,
						wilson_score: 0.5,
					};
					await this.items.updateOne(
						{ memory_id: params.memoryId },
						{ $set: { stats: defaultStats } }
					);
					stats = defaultStats;
				}
				const wilsonScore = calculateWilsonFromStats({
					uses: stats.uses ?? 0,
					success_count: (stats as Record<string, unknown>).success_count as number | undefined,
					worked_count: stats.worked_count,
					partial_count: stats.partial_count,
					unknown_count: stats.unknown_count,
					failed_count: stats.failed_count,
				});
				const successRate =
					stats.uses > 0
						? (((stats as Record<string, unknown>).success_count as number) ?? 0) / stats.uses
						: 0.5;

				// Second update for Wilson score (could be combined with aggregation pipeline
				// but kept separate for clarity and debugging)
				await this.items.updateOne(
					{ memory_id: params.memoryId },
					{
						$set: {
							"stats.wilson_score": wilsonScore,
							"stats.success_rate": successRate,
						},
					}
				);

				logger.info(
					{
						memoryId: params.memoryId,
						outcome: params.outcome,
						newUses: stats.uses,
						newWilson: wilsonScore,
						successCount: (stats as Record<string, unknown>).success_count,
					},
					"[Phase 23] Outcome recorded successfully"
				);

				// Record outcome event for audit trail
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
	): Promise<
		Array<{
			actionType: ActionType;
			contextType: ContextType;
			successRate: number;
			totalUses: number;
		}>
	> {
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
			needs_reindex: doc.needs_reindex ?? false,
			reindex_reason: doc.reindex_reason ?? null,
			reindex_marked_at: doc.reindex_marked_at?.toISOString() ?? null,
			embedding_status: doc.embedding_status,
			embedding_error: doc.embedding_error ?? null,
			last_reindexed_at: doc.last_reindexed_at?.toISOString() ?? null,
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
				success_count: doc.stats.success_count, // Phase 23.2
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
			personality: doc.personality
				? {
						source_personality_id: doc.personality.source_personality_id,
						source_personality_name: doc.personality.source_personality_name,
					}
				: undefined,
			language: doc.language,
			translation_ref_id: doc.translation_ref_id,
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
			knownSolutions: this.knownSolutions,
			kgNodes: this.kgNodes,
			kgEdges: this.kgEdges,
			personalityMappings: this.personalityMappings,
			reindexCheckpoints: this.reindexCheckpoints,
			consistencyLogs: this.consistencyLogs,
		};
	}

	// ============================================
	// Document Recognition (Cross-Chat Memory)
	// ============================================

	/**
	 * Find memories by document hash (for cross-chat document recognition)
	 *
	 * This enables the memory system to recognize previously processed documents
	 * even when uploaded in a new chat session.
	 *
	 * @param userId - User ID to scope the search
	 * @param documentHash - SHA256 hash of the document content
	 * @param options - Optional filters for tier and status
	 * @returns Array of memory items matching the document hash
	 */
	async findByDocumentHash(
		userId: string,
		documentHash: string,
		options?: {
			tier?: MemoryTier;
			status?: MemoryStatus[];
			limit?: number;
		}
	): Promise<MemoryItem[]> {
		const filter: Record<string, unknown> = {
			user_id: userId,
			"source.book.document_hash": documentHash,
		};

		if (options?.tier) {
			filter.tier = options.tier;
		}

		if (options?.status?.length) {
			filter.status = { $in: options.status };
		} else {
			filter.status = "active"; // Default to active only
		}

		const limit = options?.limit ?? 100;

		const result = await this.withTimeout(
			async () => {
				const docs = await this.items
					.find(filter)
					.sort({ "source.book.chunk_index": 1 })
					.limit(limit)
					.maxTimeMS(this.config.timeouts.mongo_text_query_ms)
					.toArray();

				return docs.map((doc) => this.documentToMemoryItem(doc));
			},
			this.config.timeouts.mongo_text_query_ms,
			"findByDocumentHash"
		);

		return result ?? [];
	}

	/**
	 * Get document metadata by hash (book info without loading all chunks)
	 *
	 * Returns summary info about a previously processed document.
	 *
	 * @param userId - User ID to scope the search
	 * @param documentHash - SHA256 hash of the document content
	 * @returns Document metadata or null if not found
	 */
	async getDocumentByHash(
		userId: string,
		documentHash: string
	): Promise<{
		bookId: string;
		title: string;
		author: string | null;
		chunkCount: number;
		firstChunkPreview: string;
		uploadTimestamp: string | null;
	} | null> {
		const result = await this.withTimeout(
			async () => {
				// Get first chunk to extract metadata
				const firstChunk = await this.items.findOne({
					user_id: userId,
					"source.book.document_hash": documentHash,
					status: "active",
				});

				if (!firstChunk?.source?.book) {
					return null;
				}

				// Count total chunks
				const chunkCount = await this.items.countDocuments({
					user_id: userId,
					"source.book.document_hash": documentHash,
					status: "active",
				});

				return {
					bookId: firstChunk.source.book.book_id,
					title: firstChunk.source.book.title ?? "Unknown",
					author: firstChunk.source.book.author ?? null,
					chunkCount,
					firstChunkPreview:
						firstChunk.text.slice(0, 200) + (firstChunk.text.length > 200 ? "..." : ""),
					uploadTimestamp: firstChunk.source.book.upload_timestamp ?? null,
				};
			},
			this.config.timeouts.mongo_text_query_ms,
			"getDocumentByHash"
		);

		return result;
	}

	/**
	 * Check if a document has been processed (exists in memory system)
	 *
	 * Fast check to determine if document processing can be skipped.
	 *
	 * @param userId - User ID to scope the search
	 * @param documentHash - SHA256 hash of the document content
	 * @returns true if document exists, false otherwise
	 */
	async documentExists(userId: string, documentHash: string): Promise<boolean> {
		const result = await this.withTimeout(
			async () => {
				const count = await this.items.countDocuments({
					user_id: userId,
					"source.book.document_hash": documentHash,
					status: "active",
				});
				return count > 0;
			},
			this.config.timeouts.mongo_text_query_ms,
			"documentExists"
		);

		return result ?? false;
	}
}
