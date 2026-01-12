/**
 * WilsonScoreService - Statistical memory ranking using Wilson score
 *
 * Wilson score confidence interval provides a statistically sound ranking
 * for memories with varying numbers of interactions (hits/misses).
 *
 * Key features:
 * - Handles small sample sizes correctly (no division by zero)
 * - Considers confidence interval width
 * - Bayesian prior of 0.5 for new memories
 */

export interface MemoryScoreData {
	id: string;
	hits: number;
	misses: number;
	total?: number;
}

export interface RankedMemory {
	id: string;
	score: number;
	confidence: "high" | "medium" | "low";
}

export class WilsonScoreService {
	/**
	 * Calculate Wilson score lower bound for confidence interval
	 *
	 * @param positive - Number of positive outcomes (hits)
	 * @param total - Total number of outcomes
	 * @param confidence - Confidence level (0.95 = 95%, 0.90 = 90%)
	 * @returns Wilson score lower bound [0, 1]
	 */
	calculate(positive: number, total: number, confidence = 0.95): number {
		if (total === 0) return 0.5; // Bayesian prior: assume 50% success rate

		// Z-score for confidence level
		const z = confidence === 0.95 ? 1.96 : confidence === 0.9 ? 1.645 : 1.96;
		const p = positive / total;

		// Wilson score interval lower bound formula
		const denominator = 1 + (z * z) / total;
		const center = p + (z * z) / (2 * total);
		const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

		const lowerBound = (center - spread) / denominator;

		return Math.max(0, Math.min(1, lowerBound));
	}

	/**
	 * Calculate Wilson score from hits/misses
	 */
	calculateFromStats(hits: number, misses: number, confidence = 0.95): number {
		const total = hits + misses;
		return this.calculate(hits, total, confidence);
	}

	/**
	 * Rank memories by Wilson score (highest first)
	 *
	 * @param memories - Array of memory score data
	 * @returns Array of memory IDs sorted by Wilson score (descending)
	 */
	rankMemories(memories: MemoryScoreData[]): string[] {
		return memories
			.map((m) => ({
				id: m.id,
				score: this.calculateFromStats(m.hits, m.misses),
			}))
			.sort((a, b) => b.score - a.score)
			.map((m) => m.id);
	}

	/**
	 * Rank memories with full score details
	 */
	rankMemoriesWithScores(memories: MemoryScoreData[]): RankedMemory[] {
		return memories
			.map((m) => {
				const total = m.total ?? m.hits + m.misses;
				const score = this.calculateFromStats(m.hits, m.misses);

				// Confidence is based on sample size
				let confidence: "high" | "medium" | "low";
				if (total >= 10) {
					confidence = "high";
				} else if (total >= 5) {
					confidence = "medium";
				} else {
					confidence = "low";
				}

				return { id: m.id, score, confidence };
			})
			.sort((a, b) => b.score - a.score);
	}

	/**
	 * Get promotion eligibility based on Wilson score and usage
	 *
	 * Roampal promotion criteria:
	 * - Wilson score >= 0.7 AND accessCount >= 5 = high_usage
	 * - Age > 7 days AND accessCount >= 3 = persistent_relevance
	 */
	checkPromotionEligibility(stats: { wilsonScore: number; accessCount: number; createdAt: Date }): {
		eligible: boolean;
		reason?: string;
	} {
		const now = Date.now();
		const ageMs = now - stats.createdAt.getTime();
		const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

		// High usage criterion
		if (stats.accessCount >= 5 && stats.wilsonScore >= 0.7) {
			return { eligible: true, reason: "high_usage" };
		}

		// Persistent relevance criterion
		if (ageMs > sevenDaysMs && stats.accessCount >= 3) {
			return { eligible: true, reason: "persistent_relevance" };
		}

		return { eligible: false };
	}

	/**
	 * Batch update Wilson scores for multiple memories
	 *
	 * Used for background recalculation jobs
	 */
	batchCalculate(
		memories: Array<{
			id: string;
			workedCount: number;
			failedCount: number;
			partialCount: number;
		}>
	): Array<{ id: string; wilsonScore: number; successRate: number }> {
		return memories.map((m) => {
			const total = m.workedCount + m.failedCount + m.partialCount;
			// Partial counts as 0.5 success
			const successes = m.workedCount + m.partialCount * 0.5;
			const wilsonScore = this.calculate(successes, total);
			const successRate = total > 0 ? successes / total : 0.5;

			return { id: m.id, wilsonScore, successRate };
		});
	}
}

/**
 * Singleton instance
 */
let _instance: WilsonScoreService | null = null;

export function getWilsonScoreService(): WilsonScoreService {
	if (!_instance) {
		_instance = new WilsonScoreService();
	}
	return _instance;
}
