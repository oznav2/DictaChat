/**
 * OpsServiceImpl - Operations service implementation
 *
 * Implements the OpsService interface from UnifiedMemoryFacade:
 * - promoteNow (manual trigger)
 * - reindexFromMongo
 * - consistencyCheck
 * - exportBackup / importBackup
 * - getStats
 */

import { logger } from "$lib/server/logger";
import type { Db, WithId } from "mongodb";
import type { MemoryMongoStore } from "../stores/MemoryMongoStore";
import type { QdrantAdapter } from "../adapters/QdrantAdapter";
import type { DictaEmbeddingClient } from "../embedding/DictaEmbeddingClient";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { PromotionService, PromotionStats } from "../learning/PromotionService";
import type { ReindexService, ReindexResult } from "./ReindexService";
import type {
	ConsistencyService,
	ConsistencyCheckParams,
	ConsistencyCheckResult,
} from "./ConsistencyService";
import type { MemoryTier, MemoryStatus, StatsSnapshot } from "../types";
import { MEMORY_COLLECTIONS } from "../stores/schemas";

/**
 * Export backup parameters
 */
export interface ExportBackupParams {
	userId: string;
	includeTiers?: MemoryTier[] | "all";
	includeArchived?: boolean;
	includeOutcomes?: boolean;
	includeActionOutcomes?: boolean;
	includeKg?: boolean;
	includeRoutingKg?: boolean;
	includeActionKg?: boolean;
	includeVersions?: boolean;
	includePersonalityMappings?: boolean;
	includeReindexCheckpoints?: boolean;
	includeConsistencyLogs?: boolean;
}

/**
 * Export backup result
 */
export interface ExportBackupResult {
	exportedAt: string;
	size_bytes: number;
	payload: BackupPayload;
}

/**
 * Import backup parameters
 */
export interface ImportBackupParams {
	userId: string;
	payload: BackupPayload;
	dryRun?: boolean;
	mergeStrategy?: "replace" | "merge" | "skip_existing";
}

/**
 * Import backup result
 */
export interface ImportBackupResult {
	success: boolean;
	dryRun: boolean;
	stats: {
		memoriesImported: number;
		memoriesSkipped: number;
		versionsImported: number;
		outcomesImported: number;
		actionOutcomesImported: number;
		kgNodesImported: number;
		kgEdgesImported: number;
		routingConceptsImported: number;
		routingStatsImported: number;
		actionEffectivenessImported: number;
		personalityMappingsImported: number;
		reindexCheckpointsImported: number;
		consistencyLogsImported: number;
	};
	errors: string[];
}

export interface OpsServiceImplConfig {
	mongoStore: MemoryMongoStore;
	qdrantAdapter: QdrantAdapter;
	embeddingClient: DictaEmbeddingClient;
	promotionService: PromotionService;
	reindexService: ReindexService;
	consistencyService: ConsistencyService;
	db: Db;
	config?: MemoryConfig;
	/** Optional BM25 adapter for cache invalidation (v0.2.9 parity) */
	bm25Adapter?: { invalidateUserCache: (userId: string) => void };
}

export interface BackupPayload {
	version: string;
	exportedAt: string;
	userId: string;
	collections: Record<string, unknown[]>;
	meta: {
		format: "bricksllm_backup";
	};
}

const BACKUP_VERSION = "2.0.0";

export class OpsServiceImpl {
	private mongo: MemoryMongoStore;
	private qdrant: QdrantAdapter;
	private embedding: DictaEmbeddingClient;
	private promotion: PromotionService;
	private reindex: ReindexService;
	private consistency: ConsistencyService;
	private db: Db;
	private config: MemoryConfig;
	private bm25?: { invalidateUserCache: (userId: string) => void };

	constructor(params: OpsServiceImplConfig) {
		this.mongo = params.mongoStore;
		this.qdrant = params.qdrantAdapter;
		this.embedding = params.embeddingClient;
		this.promotion = params.promotionService;
		this.reindex = params.reindexService;
		this.consistency = params.consistencyService;
		this.db = params.db;
		this.config = params.config ?? defaultMemoryConfig;
		this.bm25 = params.bm25Adapter;
	}

	private stripMongoIds<T extends Record<string, unknown>>(
		doc: WithId<T>
	): Record<string, unknown> {
		const { _id, ...rest } = doc as unknown as { _id?: unknown } & Record<string, unknown>;
		return rest;
	}

	private reviveDates(value: unknown): unknown {
		if (Array.isArray(value)) return value.map((v) => this.reviveDates(v));
		if (!value || typeof value !== "object") return value;
		const obj = value as Record<string, unknown>;
		for (const [k, v] of Object.entries(obj)) {
			if (typeof v === "string" && (k.endsWith("_at") || k.endsWith("At"))) {
				const ms = Date.parse(v);
				if (Number.isFinite(ms)) {
					obj[k] = new Date(ms);
					continue;
				}
			}
			obj[k] = this.reviveDates(v);
		}
		return obj;
	}

	/**
	 * Trigger immediate promotion cycle
	 */
	async promoteNow(userId?: string): Promise<PromotionStats> {
		logger.info({ userId }, "OpsService: Manual promotion triggered");
		return this.promotion.runCycle(userId);
	}

	/**
	 * Trigger reindex from Mongo
	 */
	async reindexFromMongo(
		params: { userId?: string; tier?: MemoryTier; since?: string } = {}
	): Promise<ReindexResult> {
		const since = params.since ? new Date(params.since) : undefined;
		logger.info({ ...params, since }, "OpsService: Reindex triggered");
		return this.reindex.rebuild({
			userId: params.userId,
			tier: params.tier,
			since,
		});
	}

	/**
	 * Get reindex progress
	 */
	getReindexProgress() {
		return this.reindex.getProgress();
	}

	/**
	 * Pause reindex
	 */
	pauseReindex(): boolean {
		return this.reindex.pause();
	}

	/**
	 * Trigger consistency check
	 */
	async consistencyCheck(params: ConsistencyCheckParams = {}): Promise<ConsistencyCheckResult> {
		logger.info({ params }, "OpsService: Consistency check triggered");
		return this.consistency.runCheck(params);
	}

	/**
	 * Export user's memory data as backup
	 */
	async exportBackup(params: ExportBackupParams): Promise<ExportBackupResult> {
		const {
			userId,
			includeTiers = "all",
			includeArchived = true,
			includeOutcomes = true,
			includeActionOutcomes = true,
			includeKg = true,
			includeRoutingKg = true,
			includeActionKg = true,
			includeVersions = true,
			includePersonalityMappings = true,
			includeReindexCheckpoints = true,
			includeConsistencyLogs = true,
		} = params;

		logger.info(
			{
				userId,
				includeTiers,
				includeArchived,
				includeOutcomes,
				includeActionOutcomes,
				includeKg,
				includeRoutingKg,
				includeActionKg,
				includeVersions,
				includePersonalityMappings,
			},
			"OpsService: Exporting backup"
		);

		const exportedAt = new Date().toISOString();
		const collections: Record<string, unknown[]> = {};

		const {
			items,
			versions,
			outcomes,
			actionOutcomes,
			kgNodes,
			kgEdges,
			personalityMappings,
			reindexCheckpoints,
			consistencyLogs,
		} = this.mongo.getCollections();

		const tierFilter = includeTiers === "all" ? undefined : { $in: includeTiers as MemoryTier[] };
		const statusFilter = includeArchived
			? ({ $in: ["active", "archived", "deleted"] as const } as const)
			: ("active" as const);

		const itemDocs = await items
			.find({
				user_id: userId,
				...(tierFilter ? { tier: tierFilter } : {}),
				status: statusFilter,
			})
			.toArray();
		collections[MEMORY_COLLECTIONS.ITEMS] = itemDocs.map((d) => this.stripMongoIds(d));

		if (includeVersions) {
			const versionDocs = await versions.find({ user_id: userId }).toArray();
			collections[MEMORY_COLLECTIONS.VERSIONS] = versionDocs.map((d) => this.stripMongoIds(d));
		}

		if (includeOutcomes) {
			const outcomeDocs = await outcomes.find({ user_id: userId }).toArray();
			collections[MEMORY_COLLECTIONS.OUTCOMES] = outcomeDocs.map((d) => this.stripMongoIds(d));
		}

		if (includeOutcomes) {
			const knownSolutions = await this.db
				.collection(MEMORY_COLLECTIONS.KNOWN_SOLUTIONS)
				.find({ user_id: userId })
				.toArray();
			collections[MEMORY_COLLECTIONS.KNOWN_SOLUTIONS] = knownSolutions.map((d) =>
				this.stripMongoIds(d as any)
			);
		}

		if (includeActionOutcomes) {
			const actionOutcomeDocs = await actionOutcomes.find({ user_id: userId }).toArray();
			collections[MEMORY_COLLECTIONS.ACTION_OUTCOMES] = actionOutcomeDocs.map((d) =>
				this.stripMongoIds(d)
			);
		}

		if (includeKg) {
			const kgNodeDocs = await kgNodes.find({ user_id: userId }).toArray();
			const kgEdgeDocs = await kgEdges.find({ user_id: userId }).toArray();
			collections[MEMORY_COLLECTIONS.KG_NODES] = kgNodeDocs.map((d) => this.stripMongoIds(d));
			collections[MEMORY_COLLECTIONS.KG_EDGES] = kgEdgeDocs.map((d) => this.stripMongoIds(d));
		}

		if (includeRoutingKg) {
			const routingConcepts = await this.db
				.collection("kg_routing_concepts")
				.find({ user_id: userId })
				.toArray();
			const routingStats = await this.db
				.collection("kg_routing_stats")
				.find({ user_id: userId })
				.toArray();
			collections["kg_routing_concepts"] = routingConcepts.map((d) => this.stripMongoIds(d as any));
			collections["kg_routing_stats"] = routingStats.map((d) => this.stripMongoIds(d as any));
		}

		if (includeActionKg) {
			const actionEff = await this.db
				.collection("kg_action_effectiveness")
				.find({ user_id: userId })
				.toArray();
			collections["kg_action_effectiveness"] = actionEff.map((d) => this.stripMongoIds(d as any));

			const rollups = await this.db
				.collection("kg_context_action_effectiveness")
				.find({ user_id: userId })
				.toArray();
			collections["kg_context_action_effectiveness"] = rollups.map((d) =>
				this.stripMongoIds(d as any)
			);
		}

		if (includePersonalityMappings) {
			const mappingDocs = await personalityMappings.find({ user_id: userId }).toArray();
			collections[MEMORY_COLLECTIONS.PERSONALITY_MAPPINGS] = mappingDocs.map((d) =>
				this.stripMongoIds(d)
			);
		}

		if (includeReindexCheckpoints) {
			const checkpointDocs = await reindexCheckpoints.find({ user_id: userId }).toArray();
			collections[MEMORY_COLLECTIONS.REINDEX_CHECKPOINTS] = checkpointDocs.map((d) =>
				this.stripMongoIds(d)
			);
		}

		if (includeConsistencyLogs) {
			const logDocs = await consistencyLogs.find({ user_id: userId }).toArray();
			collections[MEMORY_COLLECTIONS.CONSISTENCY_LOGS] = logDocs.map((d) => this.stripMongoIds(d));
		}

		const payload: BackupPayload = {
			version: BACKUP_VERSION,
			exportedAt,
			userId,
			collections,
			meta: { format: "bricksllm_backup" },
		};

		const size_bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
		return { exportedAt, size_bytes, payload };
	}

	/**
	 * Import backup data
	 */
	async importBackup(params: ImportBackupParams): Promise<ImportBackupResult> {
		const { userId, payload, dryRun = false, mergeStrategy = "merge" } = params;

		logger.info(
			{ userId, dryRun, mergeStrategy, version: payload.version },
			"OpsService: Importing backup"
		);

		const result: ImportBackupResult = {
			success: true,
			dryRun,
			stats: {
				memoriesImported: 0,
				memoriesSkipped: 0,
				versionsImported: 0,
				outcomesImported: 0,
				actionOutcomesImported: 0,
				kgNodesImported: 0,
				kgEdgesImported: 0,
				routingConceptsImported: 0,
				routingStatsImported: 0,
				actionEffectivenessImported: 0,
				personalityMappingsImported: 0,
				reindexCheckpointsImported: 0,
				consistencyLogsImported: 0,
			},
			errors: [],
		};

		try {
			if (!payload?.meta || payload.meta.format !== "bricksllm_backup") {
				result.errors.push("Invalid backup payload format");
				result.success = false;
				return result;
			}

			if (!payload.version || !payload.version.startsWith("2.")) {
				result.errors.push(`Unsupported backup version: ${payload.version}`);
				result.success = false;
				return result;
			}

			const collections = payload.collections ?? {};
			const {
				items,
				versions,
				outcomes,
				actionOutcomes,
				kgNodes,
				kgEdges,
				personalityMappings,
				reindexCheckpoints,
				consistencyLogs,
			} = this.mongo.getCollections();

			const clearUserData = async (name: string) => {
				if (dryRun) return;
				try {
					if (name === MEMORY_COLLECTIONS.ITEMS) await items.deleteMany({ user_id: userId });
					else if (name === MEMORY_COLLECTIONS.VERSIONS)
						await versions.deleteMany({ user_id: userId });
					else if (name === MEMORY_COLLECTIONS.OUTCOMES)
						await outcomes.deleteMany({ user_id: userId });
					else if (name === MEMORY_COLLECTIONS.KNOWN_SOLUTIONS)
						await this.db
							.collection(MEMORY_COLLECTIONS.KNOWN_SOLUTIONS)
							.deleteMany({ user_id: userId });
					else if (name === MEMORY_COLLECTIONS.ACTION_OUTCOMES)
						await actionOutcomes.deleteMany({ user_id: userId });
					else if (name === MEMORY_COLLECTIONS.KG_NODES)
						await kgNodes.deleteMany({ user_id: userId });
					else if (name === MEMORY_COLLECTIONS.KG_EDGES)
						await kgEdges.deleteMany({ user_id: userId });
					else if (name === MEMORY_COLLECTIONS.PERSONALITY_MAPPINGS)
						await personalityMappings.deleteMany({ user_id: userId });
					else if (name === MEMORY_COLLECTIONS.REINDEX_CHECKPOINTS)
						await reindexCheckpoints.deleteMany({ user_id: userId });
					else if (name === MEMORY_COLLECTIONS.CONSISTENCY_LOGS)
						await consistencyLogs.deleteMany({ user_id: userId });
					else if (name === "kg_routing_concepts")
						await this.db.collection("kg_routing_concepts").deleteMany({ user_id: userId });
					else if (name === "kg_routing_stats")
						await this.db.collection("kg_routing_stats").deleteMany({ user_id: userId });
					else if (name === "kg_action_effectiveness")
						await this.db.collection("kg_action_effectiveness").deleteMany({ user_id: userId });
					else if (name === "kg_context_action_effectiveness")
						await this.db
							.collection("kg_context_action_effectiveness")
							.deleteMany({ user_id: userId });
				} catch (err) {
					result.errors.push(
						`Failed to clear ${name}: ${err instanceof Error ? err.message : String(err)}`
					);
				}
			};

			if (mergeStrategy === "replace") {
				for (const name of Object.keys(collections)) {
					await clearUserData(name);
				}
			}

			const rawItems = Array.isArray(collections[MEMORY_COLLECTIONS.ITEMS])
				? (collections[MEMORY_COLLECTIONS.ITEMS] as Array<Record<string, unknown>>)
				: [];

			const itemsToEmbed: Array<{
				id: string;
				text: string;
				tier: MemoryTier;
				status: MemoryStatus;
				doc: Record<string, unknown>;
			}> = [];

			for (const raw of rawItems) {
				const revived = this.reviveDates({ ...raw }) as Record<string, unknown>;
				const memoryId = String(revived.memory_id ?? "");
				const text = String(revived.text ?? "");
				const tier = String(revived.tier ?? "working") as MemoryTier;
				const rawStatus = String(revived.status ?? "active");
				const status: MemoryStatus =
					rawStatus === "archived" || rawStatus === "deleted" ? rawStatus : "active";

				if (!memoryId || !text) {
					result.errors.push("Skipped invalid memory item missing memory_id/text");
					continue;
				}

				const existing = await items.findOne({ user_id: userId, memory_id: memoryId });
				if (existing && mergeStrategy === "skip_existing") {
					result.stats.memoriesSkipped++;
					continue;
				}

				if (!dryRun) {
					await items.updateOne(
						{ user_id: userId, memory_id: memoryId },
						{
							$set: {
								...revived,
								user_id: userId,
							},
							$setOnInsert: { created_at: new Date() },
						},
						{ upsert: true }
					);
				}

				itemsToEmbed.push({ id: memoryId, text, tier, status, doc: revived });
				result.stats.memoriesImported++;
			}

			if (!dryRun && itemsToEmbed.length > 0) {
				const batch = await this.embedding.embedBatch(itemsToEmbed.map((m) => m.text));
				const vectorsByIndex = new Map<number, number[]>();
				for (let i = 0; i < itemsToEmbed.length; i++) {
					const r = batch.results.find((res) => res.text === itemsToEmbed[i].text);
					if (r?.vector?.length) vectorsByIndex.set(i, r.vector);
				}

				const points = itemsToEmbed
					.map((m, idx) => {
						const vector = vectorsByIndex.get(idx);
						if (!vector) return null;
						const stats = (m.doc.stats as Record<string, unknown> | undefined) ?? {};
						const uses = Number(stats.uses ?? 0);
						const score = Number(stats.wilson_score ?? 0.5);
						const createdAt =
							m.doc.created_at instanceof Date ? m.doc.created_at.getTime() : Date.now();

						return {
							id: m.id,
							vector,
							payload: {
								user_id: userId,
								tier: m.tier,
								status: m.status,
								content: m.text,
								tags: Array.isArray(m.doc.tags) ? (m.doc.tags as string[]) : [],
								entities: Array.isArray(m.doc.entities) ? (m.doc.entities as string[]) : [],
								composite_score: score,
								always_inject: Boolean(m.doc.always_inject),
								timestamp: createdAt,
								uses,
							},
						};
					})
					.filter((p): p is NonNullable<typeof p> => p !== null);

				await this.qdrant.upsertBatch(points);
			}

			const upsertMany = async (
				name: string,
				docs: Array<Record<string, unknown>>,
				key: (d: Record<string, unknown>) => Record<string, unknown>,
				collection: { updateOne: Function }
			) => {
				for (const raw of docs) {
					const revived = this.reviveDates({ ...raw }) as Record<string, unknown>;
					if (!dryRun) {
						await (collection.updateOne as any)(
							{ ...key(revived), user_id: userId },
							{ $set: { ...revived, user_id: userId } },
							{ upsert: true }
						);
					}
				}
			};

			const rawVersions = Array.isArray(collections[MEMORY_COLLECTIONS.VERSIONS])
				? (collections[MEMORY_COLLECTIONS.VERSIONS] as Array<Record<string, unknown>>)
				: [];
			await upsertMany(
				MEMORY_COLLECTIONS.VERSIONS,
				rawVersions,
				(d) => ({ version_id: d.version_id }),
				versions as any
			);
			result.stats.versionsImported = rawVersions.length;

			const rawOutcomes = Array.isArray(collections[MEMORY_COLLECTIONS.OUTCOMES])
				? (collections[MEMORY_COLLECTIONS.OUTCOMES] as Array<Record<string, unknown>>)
				: [];
			await upsertMany(
				MEMORY_COLLECTIONS.OUTCOMES,
				rawOutcomes,
				(d) => ({ outcome_id: d.outcome_id }),
				outcomes as any
			);
			result.stats.outcomesImported = rawOutcomes.length;

			const rawKnownSolutions = Array.isArray(collections[MEMORY_COLLECTIONS.KNOWN_SOLUTIONS])
				? (collections[MEMORY_COLLECTIONS.KNOWN_SOLUTIONS] as Array<Record<string, unknown>>)
				: [];
			if (rawKnownSolutions.length > 0) {
				await upsertMany(
					MEMORY_COLLECTIONS.KNOWN_SOLUTIONS,
					rawKnownSolutions,
					(d) => ({ problem_hash: d.problem_hash }),
					this.db.collection(MEMORY_COLLECTIONS.KNOWN_SOLUTIONS) as any
				);
			}

			const rawActionOutcomes = Array.isArray(collections[MEMORY_COLLECTIONS.ACTION_OUTCOMES])
				? (collections[MEMORY_COLLECTIONS.ACTION_OUTCOMES] as Array<Record<string, unknown>>)
				: [];
			await upsertMany(
				MEMORY_COLLECTIONS.ACTION_OUTCOMES,
				rawActionOutcomes,
				(d) => ({ action_id: d.action_id }),
				actionOutcomes as any
			);
			result.stats.actionOutcomesImported = rawActionOutcomes.length;

			const rawKgNodes = Array.isArray(collections[MEMORY_COLLECTIONS.KG_NODES])
				? (collections[MEMORY_COLLECTIONS.KG_NODES] as Array<Record<string, unknown>>)
				: [];
			await upsertMany(
				MEMORY_COLLECTIONS.KG_NODES,
				rawKgNodes,
				(d) => ({ node_id: d.node_id }),
				kgNodes as any
			);
			result.stats.kgNodesImported = rawKgNodes.length;

			const rawKgEdges = Array.isArray(collections[MEMORY_COLLECTIONS.KG_EDGES])
				? (collections[MEMORY_COLLECTIONS.KG_EDGES] as Array<Record<string, unknown>>)
				: [];
			await upsertMany(
				MEMORY_COLLECTIONS.KG_EDGES,
				rawKgEdges,
				(d) => ({ edge_id: d.edge_id }),
				kgEdges as any
			);
			result.stats.kgEdgesImported = rawKgEdges.length;

			const rawRoutingConcepts = Array.isArray(collections["kg_routing_concepts"])
				? (collections["kg_routing_concepts"] as Array<Record<string, unknown>>)
				: [];
			if (rawRoutingConcepts.length > 0) {
				await upsertMany(
					"kg_routing_concepts",
					rawRoutingConcepts,
					(d) => ({ concept_id: d.concept_id }),
					this.db.collection("kg_routing_concepts") as any
				);
			}
			result.stats.routingConceptsImported = rawRoutingConcepts.length;

			const rawRoutingStats = Array.isArray(collections["kg_routing_stats"])
				? (collections["kg_routing_stats"] as Array<Record<string, unknown>>)
				: [];
			if (rawRoutingStats.length > 0) {
				await upsertMany(
					"kg_routing_stats",
					rawRoutingStats,
					(d) => ({ concept_id: d.concept_id }),
					this.db.collection("kg_routing_stats") as any
				);
			}
			result.stats.routingStatsImported = rawRoutingStats.length;

			const rawActionEff = Array.isArray(collections["kg_action_effectiveness"])
				? (collections["kg_action_effectiveness"] as Array<Record<string, unknown>>)
				: [];
			if (rawActionEff.length > 0) {
				await upsertMany(
					"kg_action_effectiveness",
					rawActionEff,
					(d) => ({ context_type: d.context_type, action: d.action }),
					this.db.collection("kg_action_effectiveness") as any
				);
			}
			result.stats.actionEffectivenessImported = rawActionEff.length;

			const rawActionRollups = Array.isArray(collections["kg_context_action_effectiveness"])
				? (collections["kg_context_action_effectiveness"] as Array<Record<string, unknown>>)
				: [];
			if (rawActionRollups.length > 0) {
				await upsertMany(
					"kg_context_action_effectiveness",
					rawActionRollups,
					(d) => ({ context_type: d.context_type, action: d.action, tier_key: d.tier_key }),
					this.db.collection("kg_context_action_effectiveness") as any
				);
			}

			const rawMappings = Array.isArray(collections[MEMORY_COLLECTIONS.PERSONALITY_MAPPINGS])
				? (collections[MEMORY_COLLECTIONS.PERSONALITY_MAPPINGS] as Array<Record<string, unknown>>)
				: [];
			await upsertMany(
				MEMORY_COLLECTIONS.PERSONALITY_MAPPINGS,
				rawMappings,
				(d) => ({ mapping_id: d.mapping_id }),
				personalityMappings as any
			);
			result.stats.personalityMappingsImported = rawMappings.length;

			const rawCheckpoints = Array.isArray(collections[MEMORY_COLLECTIONS.REINDEX_CHECKPOINTS])
				? (collections[MEMORY_COLLECTIONS.REINDEX_CHECKPOINTS] as Array<Record<string, unknown>>)
				: [];
			await upsertMany(
				MEMORY_COLLECTIONS.REINDEX_CHECKPOINTS,
				rawCheckpoints,
				(d) => ({ checkpoint_id: d.checkpoint_id }),
				reindexCheckpoints as any
			);
			result.stats.reindexCheckpointsImported = rawCheckpoints.length;

			const rawLogs = Array.isArray(collections[MEMORY_COLLECTIONS.CONSISTENCY_LOGS])
				? (collections[MEMORY_COLLECTIONS.CONSISTENCY_LOGS] as Array<Record<string, unknown>>)
				: [];
			await upsertMany(
				MEMORY_COLLECTIONS.CONSISTENCY_LOGS,
				rawLogs,
				(d) => ({ log_id: d.log_id }),
				consistencyLogs as any
			);
			result.stats.consistencyLogsImported = rawLogs.length;

			logger.info({ userId, stats: result.stats, dryRun }, "OpsService: Backup import completed");
			return result;
		} catch (err) {
			result.success = false;
			result.errors.push(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
			logger.error({ err, userId }, "OpsService: Backup import failed");
			return result;
		}
	}

	/**
	 * Get memory system stats snapshot
	 *
	 * Note: Books are stored in a separate 'books' collection, so we need to
	 * count them separately and merge into the stats.
	 */
	async getStats(userId: string): Promise<StatsSnapshot> {
		// Include DataGov tiers (Phase 25) in stats - they are static/pre-loaded
		const tiers: MemoryTier[] = [
			"working",
			"history",
			"patterns",
			"books",
			"memory_bank",
			"datagov_schema",
			"datagov_expansion",
		];
		const { items } = this.mongo.getCollections();
		const derivedWindowMs = 5 * 60 * 1000;

		// Get stats from memory_items collection (for most tiers)
		const aggregates = await items
			.aggregate<{
				_id: string;
				active_count: number;
				archived_count: number;
				deleted_count: number;
				uses_total: number;
				worked_total: number;
				failed_total: number;
			}>([
				{ $match: { user_id: userId } },
				{
					$group: {
						_id: "$tier",
						active_count: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
						archived_count: { $sum: { $cond: [{ $eq: ["$status", "archived"] }, 1, 0] } },
						deleted_count: { $sum: { $cond: [{ $eq: ["$status", "deleted"] }, 1, 0] } },
						uses_total: { $sum: { $ifNull: ["$stats.uses", 0] } },
						worked_total: { $sum: { $ifNull: ["$stats.worked_count", 0] } },
						failed_total: { $sum: { $ifNull: ["$stats.failed_count", 0] } },
					},
				},
			])
			.toArray();

		// Also count books from the dedicated books collection
		// Books are stored separately from memory_items for document management
		let booksActiveCount = 0;
		let booksArchivedCount = 0;
		let booksTotalChunks = 0;
		try {
			const booksCollection = this.db.collection("books");
			const booksAgg = await booksCollection
				.aggregate<{
					_id: string | null;
					count: number;
					totalChunks: number;
				}>([
					{ $match: { userId } },
					{
						$group: {
							_id: "$status",
							count: { $sum: 1 },
							totalChunks: {
								$sum: { $ifNull: ["$totalChunks", "$processing_stats.total_chunks", 0] },
							},
						},
					},
				])
				.toArray();

			for (const agg of booksAgg) {
				if (agg._id === "completed" || agg._id === "active" || !agg._id) {
					booksActiveCount += agg.count;
					booksTotalChunks += agg.totalChunks;
				} else if (agg._id === "archived") {
					booksArchivedCount += agg.count;
				}
			}
		} catch (err) {
			logger.warn({ err }, "Failed to get books stats from books collection");
		}

		// Also count items from the dedicated memoryBank collection
		// Memory Bank items are stored separately from memory_items
		let memoryBankActiveCount = 0;
		let memoryBankArchivedCount = 0;
		try {
			const memoryBankCollection = this.db.collection("memoryBank");
			const mbAgg = await memoryBankCollection
				.aggregate<{
					_id: string | null;
					count: number;
				}>([
					{ $match: { userId } },
					{
						$group: {
							_id: "$status",
							count: { $sum: 1 },
						},
					},
				])
				.toArray();

			for (const agg of mbAgg) {
				if (agg._id === "active" || !agg._id) {
					memoryBankActiveCount += agg.count;
				} else if (agg._id === "archived") {
					memoryBankArchivedCount += agg.count;
				}
			}
		} catch (err) {
			logger.warn({ err }, "Failed to get memory bank stats from memoryBank collection");
		}

		const tierMap = new Map(aggregates.map((a) => [String(a._id), a]));
		const tiersRecord = Object.fromEntries(
			tiers.map((tier) => {
				const agg = tierMap.get(tier);
				const worked = agg?.worked_total ?? 0;
				const failed = agg?.failed_total ?? 0;
				const denom = worked + failed;

				// For books tier, merge counts from both memory_items AND books collection
				if (tier === "books") {
					const memoryItemsActive = agg?.active_count ?? 0;
					const memoryItemsArchived = agg?.archived_count ?? 0;
					return [
						tier,
						{
							// Books chunks in memory_items PLUS books count from books collection
							active_count: memoryItemsActive + booksTotalChunks + booksActiveCount,
							archived_count: memoryItemsArchived + booksArchivedCount,
							deleted_count: agg?.deleted_count ?? 0,
							uses_total: agg?.uses_total ?? 0,
							success_rate: denom > 0 ? worked / denom : 0.5,
						},
					];
				}

				// For memory_bank tier, merge counts from both memory_items AND memoryBank collection
				if (tier === "memory_bank") {
					const memoryItemsActive = agg?.active_count ?? 0;
					const memoryItemsArchived = agg?.archived_count ?? 0;
					return [
						tier,
						{
							// Memory bank items in memory_items PLUS memoryBank collection
							active_count: memoryItemsActive + memoryBankActiveCount,
							archived_count: memoryItemsArchived + memoryBankArchivedCount,
							deleted_count: agg?.deleted_count ?? 0,
							uses_total: agg?.uses_total ?? 0,
							success_rate: denom > 0 ? worked / denom : 0.5,
						},
					];
				}

				return [
					tier,
					{
						active_count: agg?.active_count ?? 0,
						archived_count: agg?.archived_count ?? 0,
						deleted_count: agg?.deleted_count ?? 0,
						uses_total: agg?.uses_total ?? 0,
						success_rate: denom > 0 ? worked / denom : 0.5,
					},
				];
			})
		) as StatsSnapshot["tiers"];

		const actionDocs = await this.db
			.collection("kg_action_effectiveness")
			.find({ user_id: userId })
			.sort({ wilson_score: -1 })
			.limit(50)
			.toArray();

		const action_effectiveness: StatsSnapshot["action_effectiveness"] = actionDocs.map(
			(doc: any) => ({
				context_type: String(doc.context_type ?? "general"),
				action_type: String(doc.action ?? doc.action_key ?? "unknown"),
				success_rate: Number(doc.success_rate ?? doc.wilson_score) || 0.5,
				total_uses: Number(doc.uses ?? doc.total_uses) || 0,
				examples: Array.isArray(doc.examples)
					? doc.examples.slice(0, 10).map((ex: any) => ({
							timestamp: String(ex.timestamp ?? new Date().toISOString()),
							outcome: String(ex.outcome ?? "unknown"),
							doc_id: ex.memory_ids?.[0] ?? null,
						}))
					: [],
			})
		);

		const cacheMetrics = this.embedding.getCacheMetrics(derivedWindowMs);
		const promotionStats = this.promotion.getLastCycleStats();
		const promotionDenom = promotionStats
			? promotionStats.promoted + promotionStats.archived + promotionStats.deleted
			: 0;
		const promotionRate =
			promotionDenom > 0 && promotionStats ? promotionStats.promoted / promotionDenom : null;
		const demotionRate =
			promotionDenom > 0 && promotionStats
				? (promotionStats.archived + promotionStats.deleted) / promotionDenom
				: null;

		return {
			user_id: userId,
			as_of: new Date().toISOString(),
			cache_hit_rate: cacheMetrics.hit_rate,
			promotion_rate: promotionRate,
			demotion_rate: demotionRate,
			derived_window_ms: derivedWindowMs,
			tiers: tiersRecord,
			action_effectiveness,
		};
	}

	/**
	 * Clear all books for a user (v0.2.9 "Clear Books" functionality)
	 *
	 * This is the "nuke" operation that:
	 * 1. Deletes all books from MongoDB
	 * 2. Deletes all books vectors from Qdrant
	 * 3. Clears ghost registry for books tier
	 * 4. Clears Action KG entries for books
	 *
	 * RoamPal Parity: delete_collection() + create_collection() rebuilt HNSW
	 * DictaChat: Uses filter deletion (Qdrant supports this efficiently)
	 *
	 * @param userId - User identifier
	 * @returns Clear result with counts
	 */
	async clearBooksTier(userId: string): Promise<{
		success: boolean;
		mongoDeleted: number;
		qdrantDeleted: number;
		ghostsCleared: number;
		actionKgCleared: number;
		errors: string[];
	}> {
		const result = {
			success: true,
			mongoDeleted: 0,
			qdrantDeleted: 0,
			ghostsCleared: 0,
			actionKgCleared: 0,
			errors: [] as string[],
		};

		logger.info({ userId }, "OpsService: Clearing books tier (nuke)");
		const startTime = Date.now();

		// Step 1: Get book memory IDs before deletion (for Action KG cleanup)
		const { items } = this.mongo.getCollections();
		let bookMemoryIds: string[] = [];
		try {
			const bookDocs = await items
				.find({ user_id: userId, tier: "books" })
				.project({ memory_id: 1 })
				.toArray();
			bookMemoryIds = bookDocs.map((d) => d.memory_id);
		} catch (err) {
			result.errors.push(
				`Failed to get book IDs: ${err instanceof Error ? err.message : String(err)}`
			);
		}

		// Step 2: Delete all books from MongoDB
		try {
			const mongoResult = await items.deleteMany({
				user_id: userId,
				tier: "books",
			});
			result.mongoDeleted = mongoResult.deletedCount;
			logger.debug({ userId, deleted: result.mongoDeleted }, "Books deleted from MongoDB");
		} catch (err) {
			result.success = false;
			result.errors.push(
				`MongoDB deletion failed: ${err instanceof Error ? err.message : String(err)}`
			);
		}

		// Step 3: Delete all books vectors from Qdrant
		try {
			const qdrantResult = await this.qdrant.deleteByFilter({
				userId,
				tier: "books",
			});
			result.qdrantDeleted = qdrantResult.deleted;
			if (!qdrantResult.success) {
				result.errors.push("Qdrant deletion may have failed");
			}
			logger.debug({ userId, deleted: result.qdrantDeleted }, "Books deleted from Qdrant");
		} catch (err) {
			result.success = false;
			result.errors.push(
				`Qdrant deletion failed: ${err instanceof Error ? err.message : String(err)}`
			);
		}

		// Step 4: Clear ghost registry for books tier
		try {
			const { getGhostRegistry } = await import("../services/GhostRegistry");
			const ghostRegistry = getGhostRegistry();
			result.ghostsCleared = await ghostRegistry.clearByTier(userId, "books");
			logger.debug({ userId, cleared: result.ghostsCleared }, "Book ghosts cleared");
		} catch (err) {
			result.errors.push(
				`Ghost registry clear failed: ${err instanceof Error ? err.message : String(err)}`
			);
		}

		// Step 5: Clear Action KG entries for deleted books (v0.2.9 requirement)
		if (bookMemoryIds.length > 0) {
			try {
				const actionOutcomes = this.db.collection("memory_action_outcomes");
				const actionResult = await actionOutcomes.deleteMany({
					user_id: userId,
					memory_id: { $in: bookMemoryIds },
				});
				result.actionKgCleared = actionResult.deletedCount;
				logger.debug({ userId, cleared: result.actionKgCleared }, "Book action outcomes cleared");
			} catch (err) {
				result.errors.push(
					`Action KG clear failed: ${err instanceof Error ? err.message : String(err)}`
				);
			}
		}

		// Step 6: Invalidate BM25 cache (v0.2.9 parity - MCP Stale Cache fix)
		try {
			if (this.bm25) {
				this.bm25.invalidateUserCache(userId);
				logger.debug({ userId }, "BM25 cache invalidated");
			}
		} catch (err) {
			result.errors.push(
				`BM25 cache invalidation failed: ${err instanceof Error ? err.message : String(err)}`
			);
		}

		const latencyMs = Date.now() - startTime;
		logger.info(
			{
				userId,
				...result,
				latencyMs,
			},
			"OpsService: Books tier cleared"
		);

		return result;
	}

	/**
	 * Clean up Action KG entries for specific doc_ids (v0.2.9 book deletion cleanup)
	 *
	 * @param userId - User identifier
	 * @param docIds - Document/memory IDs to clean up
	 * @returns Number of entries deleted
	 */
	async cleanupActionKgForDocIds(userId: string, docIds: string[]): Promise<number> {
		if (docIds.length === 0) return 0;

		try {
			const actionOutcomes = this.db.collection("memory_action_outcomes");
			const result = await actionOutcomes.deleteMany({
				user_id: userId,
				$or: [{ memory_id: { $in: docIds } }, { doc_id: { $in: docIds } }],
			});

			logger.debug(
				{ userId, docIds: docIds.length, deleted: result.deletedCount },
				"Action KG entries cleaned up"
			);
			return result.deletedCount;
		} catch (err) {
			logger.error({ err, userId }, "Failed to cleanup Action KG entries");
			return 0;
		}
	}
}

/**
 * Factory function
 */
export function createOpsServiceImpl(params: OpsServiceImplConfig): OpsServiceImpl {
	return new OpsServiceImpl(params);
}
