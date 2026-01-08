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
import type { MemoryMongoStore } from "../stores/MemoryMongoStore";
import type { QdrantAdapter } from "../adapters/QdrantAdapter";
import type { DictaEmbeddingClient } from "../embedding/DictaEmbeddingClient";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { PromotionService, PromotionStats } from "../learning/PromotionService";
import type { ReindexService, ReindexParams, ReindexResult } from "./ReindexService";
import type {
	ConsistencyService,
	ConsistencyCheckParams,
	ConsistencyCheckResult,
} from "./ConsistencyService";
import type { MemoryTier } from "../types";

/**
 * Export backup parameters
 */
export interface ExportBackupParams {
	userId: string;
	includeTiers?: MemoryTier[];
	includeOutcomes?: boolean;
	includeKg?: boolean;
}

/**
 * Export backup result
 */
export interface ExportBackupResult {
	success: boolean;
	data: {
		version: string;
		exportedAt: string;
		userId: string;
		memories: unknown[];
		outcomes?: unknown[];
		kgNodes?: unknown[];
		kgEdges?: unknown[];
	};
	stats: {
		memoriesCount: number;
		outcomesCount: number;
		kgNodesCount: number;
		kgEdgesCount: number;
	};
}

/**
 * Import backup parameters
 */
export interface ImportBackupParams {
	userId: string;
	data: ExportBackupResult["data"];
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
		outcomesImported: number;
		kgNodesImported: number;
		kgEdgesImported: number;
	};
	errors: string[];
}

/**
 * Memory system stats
 */
export interface MemoryStats {
	timestamp: Date;
	byTier: Record<MemoryTier, { count: number; avgScore: number }>;
	totalActive: number;
	totalArchived: number;
	qdrantHealth: { healthy: boolean; pointCount?: number };
	lastPromotion?: Date;
	lastConsistencyCheck?: Date;
	lastReindex?: Date;
}

export interface OpsServiceImplConfig {
	mongoStore: MemoryMongoStore;
	qdrantAdapter: QdrantAdapter;
	embeddingClient: DictaEmbeddingClient;
	promotionService: PromotionService;
	reindexService: ReindexService;
	consistencyService: ConsistencyService;
	config?: MemoryConfig;
}

const BACKUP_VERSION = "1.0.0";

export class OpsServiceImpl {
	private mongo: MemoryMongoStore;
	private qdrant: QdrantAdapter;
	private embedding: DictaEmbeddingClient;
	private promotion: PromotionService;
	private reindex: ReindexService;
	private consistency: ConsistencyService;
	private config: MemoryConfig;

	constructor(params: OpsServiceImplConfig) {
		this.mongo = params.mongoStore;
		this.qdrant = params.qdrantAdapter;
		this.embedding = params.embeddingClient;
		this.promotion = params.promotionService;
		this.reindex = params.reindexService;
		this.consistency = params.consistencyService;
		this.config = params.config ?? defaultMemoryConfig;
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
	async reindexFromMongo(params: ReindexParams = {}): Promise<ReindexResult> {
		logger.info({ params }, "OpsService: Reindex triggered");
		return this.reindex.rebuild(params);
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
		const { userId, includeTiers, includeOutcomes = true, includeKg = true } = params;

		logger.info({ userId, includeTiers, includeOutcomes, includeKg }, "OpsService: Exporting backup");

		try {
			// Export memories
			const memories = await this.mongo.query({
				userId,
				status: "active",
				limit: 100000, // High limit for export
			});

			// Filter by tiers if specified
			const filteredMemories = includeTiers
				? memories.filter((m) => includeTiers.includes(m.tier as MemoryTier))
				: memories;

			// Export outcomes
			let outcomes: unknown[] = [];
			if (includeOutcomes) {
				outcomes = await this.mongo.getOutcomesForUser(userId);
			}

			// Export KG (simplified - just get nodes and edges for user)
			let kgNodes: unknown[] = [];
			let kgEdges: unknown[] = [];
			if (includeKg) {
				const kg = await this.mongo.getKgForUser(userId);
				kgNodes = kg.nodes;
				kgEdges = kg.edges;
			}

			const result: ExportBackupResult = {
				success: true,
				data: {
					version: BACKUP_VERSION,
					exportedAt: new Date().toISOString(),
					userId,
					memories: filteredMemories,
					outcomes: includeOutcomes ? outcomes : undefined,
					kgNodes: includeKg ? kgNodes : undefined,
					kgEdges: includeKg ? kgEdges : undefined,
				},
				stats: {
					memoriesCount: filteredMemories.length,
					outcomesCount: outcomes.length,
					kgNodesCount: kgNodes.length,
					kgEdgesCount: kgEdges.length,
				},
			};

			logger.info({ userId, stats: result.stats }, "OpsService: Backup exported");
			return result;
		} catch (err) {
			logger.error({ err, userId }, "OpsService: Backup export failed");
			return {
				success: false,
				data: {
					version: BACKUP_VERSION,
					exportedAt: new Date().toISOString(),
					userId,
					memories: [],
				},
				stats: {
					memoriesCount: 0,
					outcomesCount: 0,
					kgNodesCount: 0,
					kgEdgesCount: 0,
				},
			};
		}
	}

	/**
	 * Import backup data
	 */
	async importBackup(params: ImportBackupParams): Promise<ImportBackupResult> {
		const { userId, data, dryRun = false, mergeStrategy = "merge" } = params;

		logger.info(
			{ userId, dryRun, mergeStrategy, version: data.version },
			"OpsService: Importing backup"
		);

		const result: ImportBackupResult = {
			success: true,
			dryRun,
			stats: {
				memoriesImported: 0,
				memoriesSkipped: 0,
				outcomesImported: 0,
				kgNodesImported: 0,
				kgEdgesImported: 0,
			},
			errors: [],
		};

		try {
			// Validate version
			if (!data.version || !data.version.startsWith("1.")) {
				result.errors.push(`Unsupported backup version: ${data.version}`);
				result.success = false;
				return result;
			}

			// Import memories
			for (const memory of data.memories as Array<{
				memory_id: string;
				content: string;
				tier: string;
				tags?: string[];
			}>) {
				try {
					// Check if exists
					const existing = await this.mongo.getById(memory.memory_id, userId);

					if (existing && mergeStrategy === "skip_existing") {
						result.stats.memoriesSkipped++;
						continue;
					}

					if (!dryRun) {
						if (existing && mergeStrategy === "replace") {
							// Archive existing and create new
							await this.mongo.archive(memory.memory_id, userId);
						}

						// Generate embedding
						const embeddingResult = await this.embedding.embed(memory.content);
						if (!embeddingResult.success || !embeddingResult.embedding) {
							result.errors.push(`Failed to embed memory ${memory.memory_id}`);
							continue;
						}

						// Store in Mongo
						await this.mongo.store({
							memoryId: memory.memory_id,
							userId,
							content: memory.content,
							tier: memory.tier as MemoryTier,
							tags: memory.tags,
							status: "active",
						});

						// Index in Qdrant
						await this.qdrant.upsert({
							id: memory.memory_id,
							vector: embeddingResult.embedding,
							payload: {
								user_id: userId,
								tier: memory.tier,
								status: "active",
								content: memory.content,
								tags: memory.tags || [],
							},
						});
					}

					result.stats.memoriesImported++;
				} catch (err) {
					result.errors.push(
						`Failed to import memory ${memory.memory_id}: ${err instanceof Error ? err.message : String(err)}`
					);
				}
			}

			// Import outcomes (if present)
			if (data.outcomes && Array.isArray(data.outcomes)) {
				for (const outcome of data.outcomes) {
					if (!dryRun) {
						try {
							await this.mongo.importOutcome(outcome as Record<string, unknown>);
							result.stats.outcomesImported++;
						} catch (err) {
							result.errors.push(`Failed to import outcome: ${err instanceof Error ? err.message : String(err)}`);
						}
					} else {
						result.stats.outcomesImported++;
					}
				}
			}

			// Import KG nodes
			if (data.kgNodes && Array.isArray(data.kgNodes)) {
				for (const node of data.kgNodes) {
					if (!dryRun) {
						try {
							await this.mongo.importKgNode(node as Record<string, unknown>);
							result.stats.kgNodesImported++;
						} catch (err) {
							result.errors.push(`Failed to import KG node: ${err instanceof Error ? err.message : String(err)}`);
						}
					} else {
						result.stats.kgNodesImported++;
					}
				}
			}

			// Import KG edges
			if (data.kgEdges && Array.isArray(data.kgEdges)) {
				for (const edge of data.kgEdges) {
					if (!dryRun) {
						try {
							await this.mongo.importKgEdge(edge as Record<string, unknown>);
							result.stats.kgEdgesImported++;
						} catch (err) {
							result.errors.push(`Failed to import KG edge: ${err instanceof Error ? err.message : String(err)}`);
						}
					} else {
						result.stats.kgEdgesImported++;
					}
				}
			}

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
	 * Get memory system stats
	 */
	async getStats(userId?: string): Promise<MemoryStats> {
		const stats: MemoryStats = {
			timestamp: new Date(),
			byTier: {
				working: { count: 0, avgScore: 0 },
				history: { count: 0, avgScore: 0 },
				patterns: { count: 0, avgScore: 0 },
				books: { count: 0, avgScore: 0 },
				memory_bank: { count: 0, avgScore: 0 },
			},
			totalActive: 0,
			totalArchived: 0,
			qdrantHealth: { healthy: false },
			lastPromotion: this.promotion.getLastRunAt() ?? undefined,
			lastConsistencyCheck: this.consistency.getLastCheckAt() ?? undefined,
		};

		try {
			// Get counts by tier
			const tiers: MemoryTier[] = ["working", "history", "patterns", "books", "memory_bank"];

			for (const tier of tiers) {
				const items = await this.mongo.query({
					userId: userId ?? "",
					tier,
					status: "active",
					limit: 10000,
				});

				stats.byTier[tier].count = items.length;
				stats.totalActive += items.length;

				if (items.length > 0) {
					const totalScore = items.reduce((sum, i) => sum + (i.wilson_score ?? 0.5), 0);
					stats.byTier[tier].avgScore = totalScore / items.length;
				}
			}

			// Get archived count
			const archivedItems = await this.mongo.query({
				userId: userId ?? "",
				status: "archived",
				limit: 10000,
			});
			stats.totalArchived = archivedItems.length;

			// Check Qdrant health
			const qdrantHealth = await this.qdrant.healthCheck();
			stats.qdrantHealth = {
				healthy: qdrantHealth.healthy,
				pointCount: qdrantHealth.pointCount,
			};

			// Get reindex progress if running
			const reindexProgress = this.reindex.getProgress();
			if (reindexProgress?.status === "completed") {
				stats.lastReindex = reindexProgress.updatedAt;
			}

			return stats;
		} catch (err) {
			logger.error({ err }, "OpsService: Failed to get stats");
			return stats;
		}
	}
}

/**
 * Factory function
 */
export function createOpsServiceImpl(params: OpsServiceImplConfig): OpsServiceImpl {
	return new OpsServiceImpl(params);
}
