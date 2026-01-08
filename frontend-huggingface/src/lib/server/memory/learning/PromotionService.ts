/**
 * PromotionService - Deterministic memory lifecycle management
 *
 * Single owner of all promotion, demotion, and cleanup operations:
 * - working → history (score ≥ 0.7 AND uses ≥ 2)
 * - history → patterns (score ≥ 0.9 AND uses ≥ 3)
 * - TTL expiration (working: 24h, history: 30d)
 * - Garbage cleanup (score < 0.2)
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { MemoryTier } from "../types";
import type { MemoryMongoStore } from "../stores/MemoryMongoStore";
import type { QdrantAdapter } from "../adapters/QdrantAdapter";

export interface PromotionServiceConfig {
	mongoStore: MemoryMongoStore;
	qdrantAdapter: QdrantAdapter;
	config?: MemoryConfig;
}

/**
 * Promotion rules
 */
interface PromotionRule {
	fromTier: MemoryTier;
	toTier: MemoryTier;
	minScore: number;
	minUses: number;
}

/**
 * TTL rules (in milliseconds)
 */
interface TtlRule {
	tier: MemoryTier;
	ttlMs: number;
	preserveHighValue: boolean;
	preserveScoreThreshold: number;
}

/**
 * Promotion result statistics
 */
export interface PromotionStats {
	promoted: number;
	archived: number;
	deleted: number;
	errors: number;
	durationMs: number;
}

const PROMOTION_RULES: PromotionRule[] = [
	{ fromTier: "working", toTier: "history", minScore: 0.7, minUses: 2 },
	{ fromTier: "history", toTier: "patterns", minScore: 0.9, minUses: 3 },
];

const TTL_RULES: TtlRule[] = [
	{
		tier: "working",
		ttlMs: 24 * 60 * 60 * 1000, // 24 hours
		preserveHighValue: true,
		preserveScoreThreshold: 0.8,
	},
	{
		tier: "history",
		ttlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
		preserveHighValue: true,
		preserveScoreThreshold: 0.7,
	},
];

/**
 * Score threshold for garbage cleanup
 */
const GARBAGE_SCORE_THRESHOLD = 0.2;

/**
 * Tiers that can be cleaned up
 */
const CLEANABLE_TIERS: MemoryTier[] = ["working", "history", "patterns"];

export class PromotionService {
	private mongo: MemoryMongoStore;
	private qdrant: QdrantAdapter;
	private config: MemoryConfig;

	// Prevent concurrent runs
	private isRunning = false;
	private lastRunAt: Date | null = null;

	// Scheduler interval handle
	private schedulerInterval: NodeJS.Timeout | null = null;

	constructor(params: PromotionServiceConfig) {
		this.mongo = params.mongoStore;
		this.qdrant = params.qdrantAdapter;
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Start the promotion scheduler
	 * Runs immediately on startup, then every 30 minutes
	 */
	async startScheduler(): Promise<void> {
		// Run immediately on startup
		logger.info("PromotionService: Running initial promotion cycle");
		await this.runCycle();

		// Schedule regular runs (every 30 minutes)
		const intervalMs = this.config.promotion.scheduler_interval_ms;
		this.schedulerInterval = setInterval(async () => {
			await this.runCycle();
		}, intervalMs);

		logger.info({ intervalMs }, "PromotionService scheduler started");
	}

	/**
	 * Stop the promotion scheduler
	 */
	stopScheduler(): void {
		if (this.schedulerInterval) {
			clearInterval(this.schedulerInterval);
			this.schedulerInterval = null;
			logger.info("PromotionService scheduler stopped");
		}
	}

	/**
	 * Run a full promotion/cleanup cycle
	 */
	async runCycle(userId?: string): Promise<PromotionStats> {
		if (this.isRunning) {
			logger.warn("PromotionService: Skipping cycle, already running");
			return { promoted: 0, archived: 0, deleted: 0, errors: 0, durationMs: 0 };
		}

		this.isRunning = true;
		const startTime = Date.now();
		const stats: PromotionStats = {
			promoted: 0,
			archived: 0,
			deleted: 0,
			errors: 0,
			durationMs: 0,
		};

		try {
			// Step 1: Run promotions (working→history, history→patterns)
			const promotionResults = await this.runPromotions(userId);
			stats.promoted = promotionResults.promoted;
			stats.errors += promotionResults.errors;

			// Step 2: Run TTL cleanup (expires old entries)
			const ttlResults = await this.runTtlCleanup(userId);
			stats.archived += ttlResults.archived;
			stats.errors += ttlResults.errors;

			// Step 3: Run garbage cleanup (removes low-score entries)
			const garbageResults = await this.runGarbageCleanup(userId);
			stats.archived += garbageResults.archived;
			stats.errors += garbageResults.errors;

			this.lastRunAt = new Date();
		} finally {
			this.isRunning = false;
			stats.durationMs = Date.now() - startTime;
		}

		logger.info(stats, "PromotionService: Cycle completed");
		return stats;
	}

	/**
	 * Run promotion rules
	 */
	private async runPromotions(
		userId?: string
	): Promise<{ promoted: number; errors: number }> {
		let promoted = 0;
		let errors = 0;

		for (const rule of PROMOTION_RULES) {
			try {
				const candidates = await this.findPromotionCandidates(
					rule.fromTier,
					rule.minScore,
					rule.minUses,
					userId
				);

				for (const candidate of candidates) {
					try {
						await this.promoteMemory(candidate.memory_id, candidate.user_id, rule.toTier);
						promoted++;
					} catch (err) {
						logger.error(
							{ err, memoryId: candidate.memory_id },
							"Failed to promote memory"
						);
						errors++;
					}
				}
			} catch (err) {
				logger.error({ err, rule }, "Failed to run promotion rule");
				errors++;
			}
		}

		return { promoted, errors };
	}

	/**
	 * Find memories eligible for promotion
	 */
	private async findPromotionCandidates(
		tier: MemoryTier,
		minScore: number,
		minUses: number,
		userId?: string
	): Promise<Array<{ memory_id: string; user_id: string }>> {
		const filter: Record<string, unknown> = {
			tier,
			status: "active",
			wilson_score: { $gte: minScore },
			uses: { $gte: minUses },
		};

		if (userId) {
			filter.user_id = userId;
		}

		const memories = await this.mongo.query({
			userId: userId ?? "",
			tier,
			status: "active",
			limit: 100,
		});

		// Filter by score and uses
		return memories
			.filter((m) => (m.wilson_score ?? 0) >= minScore && (m.uses ?? 0) >= minUses)
			.map((m) => ({ memory_id: m.memory_id, user_id: m.user_id }));
	}

	/**
	 * Promote a memory to a new tier
	 */
	private async promoteMemory(
		memoryId: string,
		userId: string,
		toTier: MemoryTier
	): Promise<void> {
		// Update MongoDB
		await this.mongo.update({
			memoryId,
			userId,
			updates: {
				tier: toTier,
			},
		});

		// Update Qdrant payload
		await this.qdrant.updatePayload(memoryId, { tier: toTier });

		logger.debug({ memoryId, toTier }, "Memory promoted");
	}

	/**
	 * Run TTL-based cleanup
	 */
	private async runTtlCleanup(
		userId?: string
	): Promise<{ archived: number; errors: number }> {
		let archived = 0;
		let errors = 0;
		const now = Date.now();

		for (const rule of TTL_RULES) {
			try {
				const cutoffDate = new Date(now - rule.ttlMs);
				const candidates = await this.findExpiredMemories(rule.tier, cutoffDate, userId);

				for (const candidate of candidates) {
					try {
						// Check if high-value and should be preserved
						if (rule.preserveHighValue) {
							const memory = await this.mongo.getById(candidate.memory_id, candidate.user_id);
							if (memory && (memory.wilson_score ?? 0) >= rule.preserveScoreThreshold) {
								continue; // Skip high-value memories
							}
						}

						await this.archiveMemory(candidate.memory_id, candidate.user_id);
						archived++;
					} catch (err) {
						logger.error(
							{ err, memoryId: candidate.memory_id },
							"Failed to archive expired memory"
						);
						errors++;
					}
				}
			} catch (err) {
				logger.error({ err, tier: rule.tier }, "Failed to run TTL cleanup");
				errors++;
			}
		}

		return { archived, errors };
	}

	/**
	 * Find memories older than cutoff date
	 */
	private async findExpiredMemories(
		tier: MemoryTier,
		cutoffDate: Date,
		userId?: string
	): Promise<Array<{ memory_id: string; user_id: string }>> {
		const memories = await this.mongo.query({
			userId: userId ?? "",
			tier,
			status: "active",
			limit: 100,
		});

		// Filter by creation date
		return memories
			.filter((m) => m.created_at && new Date(m.created_at) < cutoffDate)
			.map((m) => ({ memory_id: m.memory_id, user_id: m.user_id }));
	}

	/**
	 * Run garbage cleanup for low-score memories
	 */
	private async runGarbageCleanup(
		userId?: string
	): Promise<{ archived: number; errors: number }> {
		let archived = 0;
		let errors = 0;

		for (const tier of CLEANABLE_TIERS) {
			try {
				const candidates = await this.findLowScoreMemories(tier, userId);

				for (const candidate of candidates) {
					try {
						await this.archiveMemory(candidate.memory_id, candidate.user_id);
						archived++;
					} catch (err) {
						logger.error(
							{ err, memoryId: candidate.memory_id },
							"Failed to archive low-score memory"
						);
						errors++;
					}
				}
			} catch (err) {
				logger.error({ err, tier }, "Failed to run garbage cleanup");
				errors++;
			}
		}

		return { archived, errors };
	}

	/**
	 * Find memories with score below threshold
	 */
	private async findLowScoreMemories(
		tier: MemoryTier,
		userId?: string
	): Promise<Array<{ memory_id: string; user_id: string }>> {
		const memories = await this.mongo.query({
			userId: userId ?? "",
			tier,
			status: "active",
			limit: 100,
		});

		// Filter by low score AND has been used at least once
		return memories
			.filter(
				(m) =>
					(m.wilson_score ?? 0.5) < GARBAGE_SCORE_THRESHOLD && (m.uses ?? 0) > 0
			)
			.map((m) => ({ memory_id: m.memory_id, user_id: m.user_id }));
	}

	/**
	 * Archive a memory (soft delete)
	 */
	private async archiveMemory(memoryId: string, userId: string): Promise<void> {
		// Update MongoDB
		await this.mongo.archive(memoryId, userId);

		// Update Qdrant payload
		await this.qdrant.updatePayload(memoryId, { status: "archived" });

		logger.debug({ memoryId }, "Memory archived");
	}

	/**
	 * Get last run timestamp
	 */
	getLastRunAt(): Date | null {
		return this.lastRunAt;
	}

	/**
	 * Check if scheduler is running
	 */
	isSchedulerRunning(): boolean {
		return this.schedulerInterval !== null;
	}

	/**
	 * Trigger immediate promotion for a user (e.g., on conversation switch)
	 */
	async triggerForUser(userId: string): Promise<PromotionStats> {
		return this.runCycle(userId);
	}
}

/**
 * Factory function
 */
export function createPromotionService(params: PromotionServiceConfig): PromotionService {
	return new PromotionService(params);
}
