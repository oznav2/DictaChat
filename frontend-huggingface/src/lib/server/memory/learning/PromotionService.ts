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

/**
 * Phase 22.4: Stricter promotion rules
 * 
 * working → history: Score ≥ 0.7, Uses ≥ 2 (unchanged)
 * history → patterns: Score ≥ 0.9, Uses ≥ 3, AND success_count ≥ 5 (NEW)
 * 
 * The history tier acts as a "probation period" where counters reset.
 * Only items that re-establish high success in the history tier get promoted.
 */
const PROMOTION_RULES: PromotionRule[] = [
	{ fromTier: "working", toTier: "history", minScore: 0.7, minUses: 2 },
	{ fromTier: "history", toTier: "patterns", minScore: 0.9, minUses: 3 },
];

/**
 * Phase 22.4: Minimum success_count required for history → patterns promotion
 * This ensures items have re-established their value during the probation period
 */
const MIN_SUCCESS_COUNT_FOR_PATTERNS = 5;

/**
 * Phase 12.3: Time decay configuration for promotion
 * Recently used memories get priority in promotion decisions
 * 
 * RECENCY_BOOST_DAYS: Items used within this window get a boost
 * RECENCY_BOOST_FACTOR: Multiplier for recent items (1.1 = 10% boost to score threshold)
 * STALE_PENALTY_DAYS: Items not used for this long get a penalty
 * STALE_PENALTY_FACTOR: Multiplier for stale items (0.9 = need 10% higher score to promote)
 */
const RECENCY_BOOST_DAYS = 7;  // Recently used (within 1 week)
const RECENCY_BOOST_FACTOR = 0.9;  // Effectively lowers threshold by 10%
const STALE_PENALTY_DAYS = 30;  // Not used in a month
const STALE_PENALTY_FACTOR = 1.1;  // Effectively raises threshold by 10%

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
	private lastCycleStats: PromotionStats | null = null;

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
			this.lastCycleStats = stats;
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
	private async runPromotions(userId?: string): Promise<{ promoted: number; errors: number }> {
		let promoted = 0;
		let errors = 0;

		for (const rule of PROMOTION_RULES) {
			try {
				const candidates = await this.findPromotionCandidates(
					rule.fromTier,
					rule.minScore,
					rule.minUses,
					userId,
					rule.toTier // Phase 22.4: Pass toTier for success_count check
				);

				for (const candidate of candidates) {
					try {
						await this.promoteMemory(
							candidate.memory_id, 
							candidate.user_id, 
							rule.toTier,
							rule.fromTier // Phase 22.4: Pass fromTier for counter reset
						);
						promoted++;
					} catch (err) {
						logger.error({ err, memoryId: candidate.memory_id }, "Failed to promote memory");
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
	 * Phase 12.3: Calculate recency-adjusted score threshold
	 * 
	 * Recently used memories get a lower threshold (easier to promote)
	 * Stale memories get a higher threshold (harder to promote)
	 * 
	 * @param baseThreshold The original minScore threshold
	 * @param lastUsedAt The last_used_at timestamp from stats
	 * @returns Adjusted threshold
	 */
	private calculateRecencyAdjustedThreshold(baseThreshold: number, lastUsedAt: string | Date | null): number {
		if (!lastUsedAt) {
			return baseThreshold; // No last_used_at, use default
		}

		try {
			const lastUsedDate = new Date(lastUsedAt);
			const ageDays = (Date.now() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24);

			if (ageDays <= RECENCY_BOOST_DAYS) {
				// Recently used - lower the threshold (boost promotion)
				return baseThreshold * RECENCY_BOOST_FACTOR;
			} else if (ageDays >= STALE_PENALTY_DAYS) {
				// Stale - raise the threshold (penalize promotion)
				return baseThreshold * STALE_PENALTY_FACTOR;
			}

			return baseThreshold; // In between - use default
		} catch {
			return baseThreshold;
		}
	}

	/**
	 * Find memories eligible for promotion
	 * 
	 * Phase 22.4: For history → patterns promotion, also requires success_count >= 5
	 * Phase 12.3: Considers recency in promotion decisions
	 */
	private async findPromotionCandidates(
		tier: MemoryTier,
		minScore: number,
		minUses: number,
		userId?: string,
		toTier?: MemoryTier
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
			tiers: [tier],
			status: ["active"],
			limit: 100,
		});

		// Phase 12.3: Filter by score with recency adjustment and uses
		let filtered = memories.filter((m) => {
			const uses = m.stats?.uses ?? 0;
			if (uses < minUses) return false;

			const wilsonScore = m.stats?.wilson_score ?? 0;
			const lastUsedAt = m.stats?.last_used_at ?? null;

			// Apply recency-adjusted threshold
			const adjustedThreshold = this.calculateRecencyAdjustedThreshold(minScore, lastUsedAt);

			return wilsonScore >= adjustedThreshold;
		});

		// Phase 22.4: Additional filter for history → patterns promotion
		// Require success_count >= 5 to ensure memory has re-established value
		if (tier === "history" && toTier === "patterns") {
			const beforeCount = filtered.length;
			filtered = filtered.filter((m) => {
				const successCount = (m.stats as Record<string, unknown>)?.success_count as number | undefined ?? 0;
				return successCount >= MIN_SUCCESS_COUNT_FOR_PATTERNS;
			});

			if (beforeCount > filtered.length) {
				logger.debug(
					{ 
						beforeCount, 
						afterCount: filtered.length, 
						requiredSuccessCount: MIN_SUCCESS_COUNT_FOR_PATTERNS 
					},
					"[Phase 22.4] Filtered history→patterns candidates by success_count"
				);
			}
		}

		// Phase 12.3: Sort by recency (recently used items first)
		filtered.sort((a, b) => {
			const aLastUsed = a.stats?.last_used_at ? new Date(a.stats.last_used_at).getTime() : 0;
			const bLastUsed = b.stats?.last_used_at ? new Date(b.stats.last_used_at).getTime() : 0;
			return bLastUsed - aLastUsed; // Most recently used first
		});

		logger.debug(
			{ 
				tier, 
				toTier, 
				candidateCount: filtered.length,
				recencyBoostDays: RECENCY_BOOST_DAYS,
				stalePenaltyDays: STALE_PENALTY_DAYS
			},
			"[Phase 12.3] Found promotion candidates with recency consideration"
		);

		return filtered.map((m) => ({ memory_id: m.memory_id, user_id: m.user_id }));
	}

	/**
	 * Promote a memory to a new tier
	 * 
	 * Phase 22.4: When promoting working → history, reset counters for probation period.
	 * This ensures items must re-prove their value before advancing to patterns.
	 */
	private async promoteMemory(
		memoryId: string, 
		userId: string, 
		toTier: MemoryTier,
		fromTier?: MemoryTier
	): Promise<void> {
		// Prepare update params
		const updateParams: Parameters<typeof this.mongo.update>[0] = {
			memoryId,
			userId,
			tier: toTier,
		};

		// Phase 22.4: Reset counters when promoting working → history
		// This creates a "probation period" where the memory must re-establish value
		const shouldResetCounters = fromTier === "working" && toTier === "history";

		if (shouldResetCounters) {
			logger.info(
				{ memoryId, fromTier, toTier },
				"[Phase 22.4] Resetting counters for history probation period"
			);
			// Note: Counter reset is handled by a separate MongoDB update
			// since the standard update() method doesn't support stats reset
			await this.resetPromotionCounters(memoryId, userId);
		}

		// Update MongoDB tier
		await this.mongo.update(updateParams);

		// Update Qdrant payload
		await this.qdrant.updatePayload(memoryId, { tier: toTier });

		logger.debug({ memoryId, toTier, countersReset: shouldResetCounters }, "Memory promoted");
	}

	/**
	 * Phase 22.4: Reset counters when promoting to history tier
	 * 
	 * Resets: uses=0, success_count=0, wilson_score=0.5
	 * Also adds promoted_to_history_at timestamp
	 */
	private async resetPromotionCounters(memoryId: string, userId: string): Promise<void> {
		const collections = this.mongo.getCollections();
		if (!collections) {
			logger.warn({ memoryId }, "[Phase 22.4] Cannot reset counters - no collections");
			return;
		}

		try {
			await collections.items.updateOne(
				{ memory_id: memoryId, user_id: userId },
				{
					$set: {
						"stats.uses": 0,
						"stats.success_count": 0,
						"stats.wilson_score": 0.5,
						"stats.success_rate": 0.5,
						"stats.worked_count": 0,
						"stats.failed_count": 0,
						"stats.partial_count": 0,
						"stats.unknown_count": 0,
						"versioning.promoted_to_history_at": new Date(),
					},
				}
			);
		} catch (err) {
			logger.error({ err, memoryId }, "[Phase 22.4] Failed to reset promotion counters");
		}
	}

	/**
	 * Run TTL-based cleanup
	 */
	private async runTtlCleanup(userId?: string): Promise<{ archived: number; errors: number }> {
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
							if (memory && (memory.stats?.wilson_score ?? 0) >= rule.preserveScoreThreshold) {
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
			tiers: [tier],
			status: ["active"],
			limit: 100,
		});

		// Filter by creation date
		return memories
			.filter((m) => m.timestamps.created_at && new Date(m.timestamps.created_at) < cutoffDate)
			.map((m) => ({ memory_id: m.memory_id, user_id: m.user_id }));
	}

	/**
	 * Run garbage cleanup for low-score memories
	 */
	private async runGarbageCleanup(userId?: string): Promise<{ archived: number; errors: number }> {
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
			tiers: [tier],
			status: ["active"],
			limit: 100,
		});

		// Filter by low score AND has been used at least once
		return memories
			.filter(
				(m) => (m.stats?.wilson_score ?? 0.5) < GARBAGE_SCORE_THRESHOLD && (m.stats?.uses ?? 0) > 0
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

	getLastCycleStats(): PromotionStats | null {
		return this.lastCycleStats;
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
