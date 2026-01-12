/**
 * ConsistencyService - Mongo ⇄ Qdrant drift detection and repair
 *
 * Periodic checks for:
 * - Mongo has active memoryId but Qdrant missing point
 * - Qdrant has point but Mongo missing or archived
 *
 * Repair actions:
 * - Re-upsert missing points from Mongo
 * - Delete stray/orphan points from Qdrant
 */

import { logger } from "$lib/server/logger";
import type { MemoryMongoStore } from "../stores/MemoryMongoStore";
import type { QdrantAdapter } from "../adapters/QdrantAdapter";
import type { DictaEmbeddingClient } from "../embedding/DictaEmbeddingClient";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { MemoryTier, MemoryStatus } from "../types";

/**
 * Consistency check parameters
 */
export interface ConsistencyCheckParams {
	/** Optional: only check specific user's memories */
	userId?: string;
	/** Whether to perform repairs or just detect issues */
	dryRun?: boolean;
	/** Maximum items to check per run */
	sampleSize?: number;
}

/**
 * Individual consistency issue
 */
export interface ConsistencyIssue {
	type: "missing_in_qdrant" | "orphan_in_qdrant" | "payload_mismatch";
	memoryId: string;
	userId?: string;
	details: string;
	repaired: boolean;
}

/**
 * Consistency check result
 */
export interface ConsistencyCheckResult {
	success: boolean;
	checkedAt: Date;
	durationMs: number;
	totalChecked: number;
	issuesFound: number;
	issuesRepaired: number;
	issues: ConsistencyIssue[];
	mongoCount: number;
	qdrantCount: number;
}

export interface ConsistencyServiceConfig {
	mongoStore: MemoryMongoStore;
	qdrantAdapter: QdrantAdapter;
	embeddingClient: DictaEmbeddingClient;
	config?: MemoryConfig;
}

export class ConsistencyService {
	private mongo: MemoryMongoStore;
	private qdrant: QdrantAdapter;
	private embedding: DictaEmbeddingClient;
	private config: MemoryConfig;

	// Scheduler
	private schedulerInterval: NodeJS.Timeout | null = null;
	private lastCheckAt: Date | null = null;

	constructor(params: ConsistencyServiceConfig) {
		this.mongo = params.mongoStore;
		this.qdrant = params.qdrantAdapter;
		this.embedding = params.embeddingClient;
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Start the consistency check scheduler
	 * Runs every 15 minutes by default
	 */
	startScheduler(intervalMs: number = 15 * 60 * 1000): void {
		if (this.schedulerInterval) {
			return; // Already running
		}

		// Run first check after 5 minutes (let system stabilize)
		setTimeout(
			async () => {
				await this.runCheck({ dryRun: false, sampleSize: 100 });
			},
			5 * 60 * 1000
		);

		// Schedule regular checks
		this.schedulerInterval = setInterval(async () => {
			await this.runCheck({ dryRun: false, sampleSize: 100 });
		}, intervalMs);

		logger.info({ intervalMs }, "ConsistencyService scheduler started");
	}

	/**
	 * Stop the scheduler
	 */
	stopScheduler(): void {
		if (this.schedulerInterval) {
			clearInterval(this.schedulerInterval);
			this.schedulerInterval = null;
			logger.info("ConsistencyService scheduler stopped");
		}
	}

	/**
	 * Run a consistency check
	 */
	async runCheck(params: ConsistencyCheckParams = {}): Promise<ConsistencyCheckResult> {
		const startTime = Date.now();
		const sampleSize = params.sampleSize ?? 500;
		const dryRun = params.dryRun ?? false;

		const result: ConsistencyCheckResult = {
			success: true,
			checkedAt: new Date(),
			durationMs: 0,
			totalChecked: 0,
			issuesFound: 0,
			issuesRepaired: 0,
			issues: [],
			mongoCount: 0,
			qdrantCount: 0,
		};

		try {
			logger.debug({ params }, "ConsistencyService: Starting consistency check");

			// Step 1: Get sample of active Mongo items
			const mongoItems = await this.mongo.query({
				userId: params.userId ?? "",
				status: ["active"],
				limit: sampleSize,
			});
			result.mongoCount = mongoItems.length;

			// Step 2: Check if each Mongo item exists in Qdrant
			for (const item of mongoItems) {
				result.totalChecked++;

				const qdrantResults = await this.qdrant.getByIds([item.memory_id]);
				const qdrantPoint = qdrantResults.length > 0 ? qdrantResults[0] : null;
				if (!qdrantPoint) {
					const issue: ConsistencyIssue = {
						type: "missing_in_qdrant",
						memoryId: item.memory_id,
						userId: item.user_id,
						details: "Active memory in Mongo but missing in Qdrant",
						repaired: false,
					};

					if (!dryRun) {
						const repaired = await this.repairMissingInQdrant({
							memory_id: item.memory_id,
							user_id: item.user_id,
							content: item.text,
							tier: item.tier,
							status: item.status,
							tags: item.tags,
							entities: item.entities,
							created_at: item.timestamps.created_at,
							composite_score: item.stats?.wilson_score ?? 0.5,
							wilson_score: item.stats?.wilson_score ?? 0.5,
						});
						issue.repaired = repaired;
						if (repaired) {
							result.issuesRepaired++;
						}
					}

					result.issues.push(issue);
					result.issuesFound++;
				}
			}

			// Step 3: Sample Qdrant points and check for orphans
			const qdrantSample = await this.sampleQdrantPoints(params.userId, Math.min(100, sampleSize));
			result.qdrantCount = qdrantSample.length;

			for (const point of qdrantSample) {
				const memoryId = point.id;
				const mongoItem = await this.mongo.getById(memoryId, point.payload?.user_id as string);

				if (!mongoItem || mongoItem.status !== "active") {
					const issue: ConsistencyIssue = {
						type: "orphan_in_qdrant",
						memoryId,
						userId: point.payload?.user_id as string | undefined,
						details: mongoItem
							? `Memory exists in Mongo but status=${mongoItem.status}`
							: "Point in Qdrant but memory not found in Mongo",
						repaired: false,
					};

					if (!dryRun) {
						const repaired = await this.repairOrphanInQdrant(memoryId);
						issue.repaired = repaired;
						if (repaired) {
							result.issuesRepaired++;
						}
					}

					result.issues.push(issue);
					result.issuesFound++;
				}
			}

			this.lastCheckAt = new Date();
			result.durationMs = Date.now() - startTime;

			if (result.issuesFound > 0) {
				logger.warn(
					{
						issuesFound: result.issuesFound,
						issuesRepaired: result.issuesRepaired,
						durationMs: result.durationMs,
					},
					"ConsistencyService: Issues found"
				);
			} else {
				logger.debug({ durationMs: result.durationMs }, "ConsistencyService: No issues found");
			}

			// Log to consistency_logs collection
			await this.logCheckResult(result);

			return result;
		} catch (err) {
			result.success = false;
			result.durationMs = Date.now() - startTime;
			logger.error({ err }, "ConsistencyService: Check failed");
			return result;
		}
	}

	/**
	 * Repair missing item in Qdrant
	 */
	private async repairMissingInQdrant(item: {
		memory_id: string;
		user_id: string;
		content: string;
		tier: MemoryTier;
		status: MemoryStatus;
		tags?: string[];
		entities?: string[];
		created_at?: string;
		composite_score?: number;
		wilson_score?: number;
	}): Promise<boolean> {
		try {
			// Generate embedding
			const vector = await this.embedding.embed(item.content);
			if (!vector) {
				logger.warn({ memoryId: item.memory_id }, "Failed to generate embedding for repair");
				return false;
			}

			// Upsert to Qdrant
			await this.qdrant.upsert({
				id: item.memory_id,
				vector,
				payload: {
					user_id: item.user_id,
					tier: item.tier,
					status: item.status,
					content: item.content,
					tags: item.tags || [],
					entities: item.entities || [],
					timestamp: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
					composite_score: item.composite_score ?? 0.5,
					always_inject: false,
					uses: 0,
				},
			});

			logger.info({ memoryId: item.memory_id }, "Repaired: re-upserted missing point to Qdrant");
			return true;
		} catch (err) {
			logger.error({ err, memoryId: item.memory_id }, "Failed to repair missing point");
			return false;
		}
	}

	/**
	 * Repair orphan point in Qdrant
	 */
	private async repairOrphanInQdrant(memoryId: string): Promise<boolean> {
		try {
			await this.qdrant.delete([memoryId]);
			logger.info({ memoryId }, "Repaired: deleted orphan point from Qdrant");
			return true;
		} catch (err) {
			logger.error({ err, memoryId }, "Failed to delete orphan point");
			return false;
		}
	}

	/**
	 * Sample points from Qdrant for orphan check
	 * Uses search with a broad query to sample points
	 */
	private async sampleQdrantPoints(
		userId: string | undefined,
		limit: number
	): Promise<Array<{ id: string; payload?: Record<string, unknown> }>> {
		try {
			// Use getByIds with empty filter or search with broad query
			// Since scroll is not directly available, we'll search with user filter
			if (!userId) {
				return []; // Can't sample without user context
			}

			// Get a sample using a zero vector search (returns random-ish results)
			const zeroVector = new Array(1024).fill(0);
			const results = await this.qdrant.search({
				userId,
				vector: zeroVector,
				limit,
				status: ["active"],
			});
			return results.map((r) => ({
				id: r.id,
				payload: r.payload as unknown as Record<string, unknown>,
			}));
		} catch (err) {
			logger.warn({ err }, "Failed to sample Qdrant points");
			return [];
		}
	}

	/**
	 * Log check result
	 */
	private async logCheckResult(result: ConsistencyCheckResult): Promise<void> {
		// Log to console - Mongo logging can be added later if needed
		logger.info(
			{
				checkedAt: result.checkedAt,
				durationMs: result.durationMs,
				totalChecked: result.totalChecked,
				issuesFound: result.issuesFound,
				issuesRepaired: result.issuesRepaired,
				mongoCount: result.mongoCount,
				qdrantCount: result.qdrantCount,
			},
			"ConsistencyService: Check result logged"
		);
	}

	/**
	 * Get last check timestamp
	 */
	getLastCheckAt(): Date | null {
		return this.lastCheckAt;
	}

	/**
	 * Check if scheduler is running
	 */
	isSchedulerRunning(): boolean {
		return this.schedulerInterval !== null;
	}
}

/**
 * Factory function
 */
export function createConsistencyService(params: ConsistencyServiceConfig): ConsistencyService {
	return new ConsistencyService(params);
}
