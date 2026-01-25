/**
 * MemoryRetrievalService - Advanced retrieval pipeline with dynamic weighting and quality enforcement
 *
 * Implements features from rompal_implementation_plan.md Section 6:
 * - RRF (Reciprocal Rank Fusion) with dynamic k parameter
 * - Dynamic weighting based on learned effectiveness
 * - 3-stage memory_bank quality enforcement
 * - Organic Memory Recall for proactive insights
 *
 * Key design principles:
 * - All scoring is explainable via score breakdown fields
 * - Quality enforcement prevents cross-encoder from washing out quality
 * - Dynamic weights shift from semantic matching to learned effectiveness as items prove themselves
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type {
	MemoryTier,
	MemoryItem,
	SearchResult,
	TierRecommendation,
	TierEffectiveness,
	Outcome,
} from "../types";

// ============================================
// Types
// ============================================

export interface RRFCandidate {
	id: string;
	memoryId: string;
	content: string;
	tier: MemoryTier;
	ranks: Map<string, number>; // source -> rank (1-indexed)
	rrfScore: number;
}

export interface DynamicWeights {
	embedding_weight: number; // 0.0-1.0, from user feedback
	learned_weight: number; // 0.0-1.0, from successful retrievals
}

export interface WeightedResult extends SearchResult {
	dynamic_weights: DynamicWeights;
	quality_multiplier?: number;
	ce_applied?: boolean;
}

export interface OrganicRecall {
	proactive_insights: string[]; // Patterns that might help
	failure_prevention: string[]; // Past failures to avoid
	pattern_recognition: string[]; // Recognized patterns
	topic_continuity: string[]; // Connected topics
	tier_recommendations: TierRecommendation[];
}

export interface RankedList {
	source: string; // e.g., "vector", "lexical", "ce"
	items: Array<{
		id: string;
		memoryId: string;
		content: string;
		tier: MemoryTier;
		score?: number;
		// Memory item metadata for weighting
		uses?: number;
		wilsonScore?: number;
		qualityScore?: number;
		importance?: number;
		confidence?: number;
		hasCE?: boolean;
	}>;
}

export interface MemoryRetrievalServiceConfig {
	config?: MemoryConfig;
}

/**
 * Cross-personality search options
 * Allows memories from different personalities to be searched together
 */
export interface CrossPersonalitySearchOptions {
	/** Current personality ID making the search */
	currentPersonalityId?: string | null;
	/** List of personality IDs to include in search (null = all personalities) */
	includePersonalityIds?: string[] | null;
	/** Whether to include memories with no personality (legacy/shared) */
	includeSharedMemories?: boolean;
	/** Whether to boost memories from current personality */
	boostCurrentPersonality?: boolean;
	/** Boost factor for current personality memories (default 1.2) */
	currentPersonalityBoost?: number;
}

// ============================================
// RRF Fusion Implementation
// ============================================

/**
 * Default RRF k constant
 * Higher values give more weight to lower-ranked items
 * k=60 is the standard value from the original RRF paper
 */
const DEFAULT_RRF_K = 60;

/**
 * Calculate RRF score for a single rank
 * Formula: 1 / (k + rank)
 */
export function calculateRrfScore(rank: number, k: number = DEFAULT_RRF_K): number {
	if (rank < 1) {
		throw new Error("Rank must be >= 1 (1-indexed)");
	}
	return 1 / (k + rank);
}

/**
 * Reciprocal Rank Fusion
 *
 * Combines multiple ranked lists into a single ranking without manual weight tuning.
 * Each item's score is the sum of its RRF contributions from all lists where it appears.
 *
 * @param rankings - Array of ranked lists from different sources
 * @param k - RRF constant (default 60). Higher values flatten the ranking.
 * @returns Fused candidates sorted by RRF score descending
 */
export function rrfFuse(rankings: RankedList[], k: number = DEFAULT_RRF_K): RRFCandidate[] {
	const candidates = new Map<string, RRFCandidate>();

	for (const ranking of rankings) {
		for (let i = 0; i < ranking.items.length; i++) {
			const item = ranking.items[i];
			const rank = i + 1; // 1-indexed
			const rrfScore = calculateRrfScore(rank, k);

			const existing = candidates.get(item.memoryId);

			if (existing) {
				// Add to existing candidate's score
				existing.rrfScore += rrfScore;
				existing.ranks.set(ranking.source, rank);
			} else {
				// Create new candidate
				const ranks = new Map<string, number>();
				ranks.set(ranking.source, rank);

				candidates.set(item.memoryId, {
					id: item.id,
					memoryId: item.memoryId,
					content: item.content,
					tier: item.tier,
					ranks,
					rrfScore,
				});
			}
		}
	}

	// Sort by RRF score descending
	return Array.from(candidates.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}

/**
 * RRF with dynamic k based on query characteristics
 *
 * Adjusts k parameter based on:
 * - Query length: shorter queries benefit from higher k (more diversity)
 * - Specificity: specific queries benefit from lower k (trust top ranks)
 *
 * @param rankings - Array of ranked lists
 * @param queryLength - Length of the query in characters
 * @param isSpecific - Whether the query is specific (e.g., identity lookup)
 * @returns Fused candidates with dynamically adjusted ranking
 */
export function rrfFuseWithDynamicK(
	rankings: RankedList[],
	queryLength: number,
	isSpecific: boolean = false
): RRFCandidate[] {
	// Dynamic k calculation
	let k = DEFAULT_RRF_K;

	// Shorter queries get higher k (more diversity)
	if (queryLength < 20) {
		k = 80;
	} else if (queryLength < 50) {
		k = 60;
	} else {
		k = 50;
	}

	// Specific queries get lower k (trust top ranks more)
	if (isSpecific) {
		k = Math.max(30, k - 20);
	}

	logger.debug({ queryLength, isSpecific, dynamicK: k }, "RRF dynamic k calculated");

	return rrfFuse(rankings, k);
}

// ============================================
// Dynamic Weighting Implementation
// ============================================

/**
 * Weight assignment based on memory type and effectiveness
 *
 * From rompal_implementation_plan.md Section 6.4.1:
 * | Memory Type             | Uses | Score | Embedding Weight | Learned Weight |
 * |------------------------|------|-------|------------------|----------------|
 * | Proven high-value      | >=5  | >=0.8 | 20%              | 80%            |
 * | Established            | >=3  | >=0.7 | 25%              | 75%            |
 * | Emerging (positive)    | >=2  | >=0.5 | 35%              | 65%            |
 * | Failing pattern        | >=2  | <0.5  | 70%              | 30%            |
 * | Memory_bank (high)     | any  | any   | 45%              | 55%            |
 * | Memory_bank (standard) | any  | any   | 60%              | 40%            |
 * | New/Unknown            | <2   | any   | 70%              | 30%            |
 */
export function calculateDynamicWeights(
	tier: MemoryTier,
	uses: number,
	wilsonScore: number,
	qualityScore?: number
): DynamicWeights {
	// memory_bank uses quality_score instead of wilson_score
	if (tier === "memory_bank") {
		const quality = qualityScore ?? 0.5;
		if (quality >= 0.8) {
			return { embedding_weight: 0.45, learned_weight: 0.55 };
		}
		return { embedding_weight: 0.6, learned_weight: 0.4 };
	}

	// documents tier - always favor embedding (never outcome-scored)
	if (tier === "documents") {
		return { embedding_weight: 0.9, learned_weight: 0.1 };
	}

	// Proven high-value: uses >= 5 AND score >= 0.8
	if (uses >= 5 && wilsonScore >= 0.8) {
		return { embedding_weight: 0.2, learned_weight: 0.8 };
	}

	// Established: uses >= 3 AND score >= 0.7
	if (uses >= 3 && wilsonScore >= 0.7) {
		return { embedding_weight: 0.25, learned_weight: 0.75 };
	}

	// Emerging (positive): uses >= 2 AND score >= 0.5
	if (uses >= 2 && wilsonScore >= 0.5) {
		return { embedding_weight: 0.35, learned_weight: 0.65 };
	}

	// Failing pattern: uses >= 2 AND score < 0.5
	if (uses >= 2 && wilsonScore < 0.5) {
		return { embedding_weight: 0.7, learned_weight: 0.3 };
	}

	// New/Unknown: uses < 2
	return { embedding_weight: 0.7, learned_weight: 0.3 };
}

/**
 * Apply dynamic weights to calculate combined score
 *
 * Formula: combined_score = (embedding_weight * embedding_similarity) + (learned_weight * learned_score)
 */
export function applyDynamicWeights(
	embeddingSimilarity: number,
	learnedScore: number,
	weights: DynamicWeights
): number {
	return weights.embedding_weight * embeddingSimilarity + weights.learned_weight * learnedScore;
}

/**
 * Adjust search results based on learned dynamic weights
 */
export function applyDynamicWeightsToResults(
	results: SearchResult[],
	memoryItems: Map<string, MemoryItem>
): WeightedResult[] {
	return results.map((result) => {
		const memory = memoryItems.get(result.memory_id);
		if (!memory) {
			// No memory data, use default weights
			const weights = calculateDynamicWeights(result.tier, 0, 0.5);
			return {
				...result,
				dynamic_weights: weights,
			};
		}

		const uses = memory.stats?.uses ?? 0;
		const wilsonScore = memory.stats?.wilson_score ?? 0.5;
		const qualityScore = memory.quality?.quality_score;

		const weights = calculateDynamicWeights(result.tier, uses, wilsonScore, qualityScore);

		// Recalculate final score with dynamic weights
		const embeddingSimilarity =
			result.score_summary.dense_similarity ?? result.score_summary.final_score;
		const learnedScore = result.tier === "memory_bank" ? (qualityScore ?? 0.5) : wilsonScore;

		const newFinalScore = applyDynamicWeights(embeddingSimilarity, learnedScore, weights);

		return {
			...result,
			score_summary: {
				...result.score_summary,
				final_score: newFinalScore,
				embedding_weight: weights.embedding_weight,
				learned_weight: weights.learned_weight,
				embedding_similarity: embeddingSimilarity,
				learned_score: learnedScore,
			},
			dynamic_weights: weights,
		};
	});
}

// ============================================
// memory_bank 3-Stage Quality Enforcement
// ============================================

/**
 * Stage 1: Distance boost (lower distance = higher quality)
 *
 * Applies quality-based distance reduction for memory_bank items.
 * quality = importance * confidence
 * adjusted_distance = L2_distance * (1.0 - quality * 0.8)
 * Clamp multiplier to minimum 0.2 to prevent pathological behavior.
 */
export function applyDistanceBoost(
	distance: number,
	importance: number,
	confidence: number
): number {
	const quality = importance * confidence;
	const multiplier = Math.max(0.2, 1.0 - quality * 0.8);
	return distance * multiplier;
}

/**
 * Stage 2: Distance to similarity conversion
 *
 * Converts L2/Euclidean distance to similarity score.
 * similarity = 1 / (1 + distance)
 *
 * This ensures:
 * - distance 0 -> similarity 1.0
 * - distance infinity -> similarity 0.0
 */
export function distanceToSimilarity(distance: number): number {
	if (distance < 0) {
		throw new Error("Distance cannot be negative");
	}
	return 1 / (1 + distance);
}

/**
 * Stage 3: Cross-encoder quality multiplier
 *
 * After blended score (vector/BM25/CE), applies quality boost.
 * final_score = blended_score * (1 + quality)
 *
 * @param hasCE - Whether cross-encoder scoring was applied
 */
export function applyCEQualityMultiplier(
	score: number,
	importance: number,
	confidence: number,
	hasCE: boolean = true
): number {
	if (!hasCE) {
		return score;
	}
	const quality = importance * confidence;
	return score * (1 + quality);
}

/**
 * Apply full 3-stage quality enforcement for memory_bank items
 */
export function applyMemoryBankQualityEnforcement(
	distance: number,
	importance: number,
	confidence: number,
	hasCE: boolean = true,
	config?: MemoryConfig
): { similarity: number; qualityMultiplier: number } {
	const cfg = config ?? defaultMemoryConfig;

	// Stage 1: Distance boost
	const boostedDistance = applyDistanceBoost(distance, importance, confidence);

	// Stage 2: Distance to similarity
	const similarity = distanceToSimilarity(boostedDistance);

	// Stage 3: Quality multiplier (applied after CE blending)
	const quality = importance * confidence;
	const qualityMultiplier = hasCE
		? Math.min(1 + quality, cfg.weights.memory_bank.ce_multiplier_max)
		: 1.0;

	return { similarity, qualityMultiplier };
}

/**
 * Process memory_bank results with full quality enforcement
 */
export function enforceMemoryBankQuality(
	results: SearchResult[],
	memoryItems: Map<string, MemoryItem>,
	hasCE: boolean = true,
	config?: MemoryConfig
): WeightedResult[] {
	return results.map((result) => {
		// Only apply to memory_bank tier
		if (result.tier !== "memory_bank") {
			return {
				...result,
				dynamic_weights: calculateDynamicWeights(
					result.tier,
					result.score_summary.uses ?? 0,
					result.score_summary.wilson_score ?? 0.5
				),
			};
		}

		const memory = memoryItems.get(result.memory_id);
		const importance = memory?.quality?.importance ?? 0.5;
		const confidence = memory?.quality?.confidence ?? 0.5;

		// Get current distance (convert from similarity if needed)
		const currentSimilarity =
			result.score_summary.dense_similarity ?? result.score_summary.final_score;
		// Approximate distance from similarity (inverse of Stage 2)
		const currentDistance = currentSimilarity > 0 ? 1 / currentSimilarity - 1 : 10;

		// Apply 3-stage enforcement
		const { similarity, qualityMultiplier } = applyMemoryBankQualityEnforcement(
			currentDistance,
			importance,
			confidence,
			hasCE,
			config
		);

		// Calculate final score with quality multiplier
		const finalScore = similarity * qualityMultiplier;

		const weights = calculateDynamicWeights(result.tier, 0, 0.5, importance * confidence);

		return {
			...result,
			score_summary: {
				...result.score_summary,
				final_score: finalScore,
				dense_similarity: similarity,
				quality_score: importance * confidence,
			},
			dynamic_weights: weights,
			quality_multiplier: qualityMultiplier,
			ce_applied: hasCE,
		};
	});
}

// ============================================
// Organic Memory Recall (Proactive Insights)
// ============================================

/**
 * MemoryRetrievalService class
 *
 * Provides advanced retrieval capabilities:
 * - RRF fusion for hybrid search
 * - Dynamic weighting
 * - Quality enforcement
 * - Organic recall for proactive insights
 */
export class MemoryRetrievalService {
	private config: MemoryConfig;

	constructor(params?: MemoryRetrievalServiceConfig) {
		this.config = params?.config ?? defaultMemoryConfig;
	}

	/**
	 * Fuse multiple ranked lists using RRF
	 */
	fuseRankings(rankings: RankedList[], k?: number): RRFCandidate[] {
		return rrfFuse(rankings, k ?? DEFAULT_RRF_K);
	}

	/**
	 * Fuse with dynamic k based on query
	 */
	fuseWithDynamicK(
		rankings: RankedList[],
		query: string,
		isSpecific: boolean = false
	): RRFCandidate[] {
		return rrfFuseWithDynamicK(rankings, query.length, isSpecific);
	}

	/**
	 * Calculate dynamic weights for a memory item
	 */
	getDynamicWeights(memory: MemoryItem): DynamicWeights {
		return calculateDynamicWeights(
			memory.tier,
			memory.stats?.uses ?? 0,
			memory.stats?.wilson_score ?? 0.5,
			memory.quality?.quality_score
		);
	}

	/**
	 * Apply dynamic weights to search results
	 */
	applyDynamicWeights(
		results: SearchResult[],
		memoryItems: Map<string, MemoryItem>
	): WeightedResult[] {
		return applyDynamicWeightsToResults(results, memoryItems);
	}

	/**
	 * Apply memory_bank quality enforcement
	 */
	enforceQuality(
		results: SearchResult[],
		memoryItems: Map<string, MemoryItem>,
		hasCE: boolean = true
	): WeightedResult[] {
		return enforceMemoryBankQuality(results, memoryItems, hasCE, this.config);
	}

	/**
	 * Get organic memory recall for proactive insights
	 *
	 * Analyzes:
	 * - Tier effectiveness for query concepts
	 * - Past failures related to query
	 * - Pattern recognition from historical data
	 * - Topic continuity from recent messages
	 *
	 * @param query - Current query
	 * @param userId - User ID for personalized insights
	 * @param recentTopics - Topics from recent conversation
	 * @param pastOutcomes - Recent outcomes for learning
	 * @param tierStats - Per-tier effectiveness stats
	 */
	async getOrganicRecall(
		query: string,
		userId: string,
		options?: {
			recentTopics?: string[];
			pastOutcomes?: Array<{
				memoryId: string;
				outcome: Outcome;
				tier: MemoryTier;
				content: string;
				reason?: string;
			}>;
			tierStats?: Map<string, TierEffectiveness[]>;
			relatedMemories?: MemoryItem[];
		}
	): Promise<OrganicRecall> {
		const proactiveInsights: string[] = [];
		const failurePrevention: string[] = [];
		const patternRecognition: string[] = [];
		const topicContinuity: string[] = [];
		const tierRecommendations: TierRecommendation[] = [];

		// Extract concepts from query for matching
		const queryConcepts = this.extractConcepts(query);

		// 1. Proactive insights from high-performing patterns
		if (options?.relatedMemories) {
			const highPerformers = options.relatedMemories.filter(
				(m) => m.tier === "patterns" && (m.stats?.wilson_score ?? 0) >= 0.8
			);

			for (const memory of highPerformers.slice(0, 3)) {
				proactiveInsights.push(
					'Pattern "' +
						this.truncate(memory.text, 100) +
						'" has ' +
						Math.round((memory.stats?.success_rate ?? 0.5) * 100) +
						"% success rate"
				);
			}
		}

		// 2. Failure prevention from past failures
		if (options?.pastOutcomes) {
			const failures = options.pastOutcomes.filter((o) => o.outcome === "failed");

			for (const failure of failures.slice(0, 3)) {
				const reason = failure.reason ?? "unknown reason";
				failurePrevention.push(
					'Avoid: "' + this.truncate(failure.content, 80) + '" failed due to: ' + reason
				);
			}
		}

		// 3. Pattern recognition from repeated queries
		if (options?.relatedMemories) {
			const workingItems = options.relatedMemories.filter(
				(m) => m.tier === "working" && (m.stats?.uses ?? 0) >= 2
			);

			if (workingItems.length >= 2) {
				patternRecognition.push(
					"Detected recurring theme: " + workingItems.length + " recent items on similar topic"
				);
			}
		}

		// 4. Topic continuity from recent conversation
		if (options?.recentTopics?.length) {
			const matchingTopics = options.recentTopics.filter((topic) =>
				queryConcepts.some(
					(concept) =>
						topic.toLowerCase().includes(concept.toLowerCase()) ||
						concept.toLowerCase().includes(topic.toLowerCase())
				)
			);

			if (matchingTopics.length > 0) {
				topicContinuity.push("Continuing discussion about: " + matchingTopics.join(", "));
			}
		}

		// 5. Tier recommendations based on effectiveness
		if (options?.tierStats) {
			for (const [concept, stats] of options.tierStats) {
				if (queryConcepts.some((qc) => concept.toLowerCase().includes(qc.toLowerCase()))) {
					tierRecommendations.push({
						concept,
						recommendations: stats.sort((a, b) => b.success_rate - a.success_rate),
					});
				}
			}
		}

		logger.debug(
			{
				userId,
				queryConcepts,
				proactiveInsightsCount: proactiveInsights.length,
				failurePreventionCount: failurePrevention.length,
				patternRecognitionCount: patternRecognition.length,
			},
			"Organic recall generated"
		);

		return {
			proactive_insights: proactiveInsights,
			failure_prevention: failurePrevention,
			pattern_recognition: patternRecognition,
			topic_continuity: topicContinuity,
			tier_recommendations: tierRecommendations,
		};
	}

	/**
	 * Format organic recall as context injection block
	 *
	 * Returns deterministic structure for prompt injection:
	 *
	 * === CONTEXTUAL MEMORY ===
	 *
	 * Past Experience:
	 *   - Based on {uses} past use(s), this approach had a {success_rate}% success rate
	 *
	 * Past Failures to Avoid:
	 *   - Similar approach failed before due to: {reason}
	 *
	 * Recommendations:
	 *   - For '{topic}', check {tier} collection (historically {tier_success}% effective)
	 *
	 * Continuing discussion about: {topic_1}, {topic_2}
	 */
	formatOrganicRecallForPrompt(recall: OrganicRecall): string {
		const lines: string[] = [];

		lines.push("=== CONTEXTUAL MEMORY ===");
		lines.push("");

		// Past Experience (proactive insights)
		if (recall.proactive_insights.length > 0) {
			lines.push("Past Experience:");
			for (const insight of recall.proactive_insights) {
				lines.push("  - " + insight);
			}
			lines.push("");
		}

		// Past Failures to Avoid
		if (recall.failure_prevention.length > 0) {
			lines.push("Past Failures to Avoid:");
			for (const failure of recall.failure_prevention) {
				lines.push("  - " + failure);
			}
			lines.push("");
		}

		// Pattern Recognition
		if (recall.pattern_recognition.length > 0) {
			lines.push("Pattern Recognition:");
			for (const pattern of recall.pattern_recognition) {
				lines.push("  - " + pattern);
			}
			lines.push("");
		}

		// Tier Recommendations
		if (recall.tier_recommendations.length > 0) {
			lines.push("Recommendations:");
			for (const rec of recall.tier_recommendations) {
				if (rec.recommendations.length > 0) {
					const best = rec.recommendations[0];
					lines.push(
						"  - For '" +
							rec.concept +
							"', check " +
							best.tier +
							" collection (historically " +
							Math.round(best.success_rate * 100) +
							"% effective)"
					);
				}
			}
			lines.push("");
		}

		// Topic Continuity
		if (recall.topic_continuity.length > 0) {
			for (const topic of recall.topic_continuity) {
				lines.push(topic);
			}
			lines.push("");
		}

		if (lines.length > 2) {
			lines.push("Use this context to provide more informed, personalized responses.");
		}

		return lines.join("\n");
	}

	/**
	 * Extract concepts/keywords from query for matching
	 */
	private extractConcepts(query: string): string[] {
		// Simple concept extraction - split on spaces and filter
		const stopWords = new Set([
			"the",
			"a",
			"an",
			"is",
			"are",
			"was",
			"were",
			"be",
			"been",
			"being",
			"have",
			"has",
			"had",
			"do",
			"does",
			"did",
			"will",
			"would",
			"could",
			"should",
			"may",
			"might",
			"must",
			"can",
			"to",
			"of",
			"in",
			"for",
			"on",
			"with",
			"at",
			"by",
			"from",
			"as",
			"into",
			"through",
			"during",
			"before",
			"after",
			"above",
			"below",
			"between",
			"under",
			"again",
			"further",
			"then",
			"once",
			"here",
			"there",
			"when",
			"where",
			"why",
			"how",
			"all",
			"each",
			"few",
			"more",
			"most",
			"other",
			"some",
			"such",
			"no",
			"nor",
			"not",
			"only",
			"own",
			"same",
			"so",
			"than",
			"too",
			"very",
			"just",
			"and",
			"but",
			"if",
			"or",
			"because",
			"until",
			"while",
			"what",
			"which",
			"who",
			"this",
			"that",
			"these",
			"those",
			"it",
			"its",
			"i",
			"me",
			"my",
			"you",
			"your",
			"he",
			"him",
			"his",
			"she",
			"her",
			"we",
			"us",
			"our",
			"they",
			"them",
			"their",
		]);

		return query
			.toLowerCase()
			.replace(/[^\w\s]/g, " ")
			.split(/\s+/)
			.filter((word) => word.length > 2 && !stopWords.has(word))
			.slice(0, 10); // Limit to 10 concepts
	}

	/**
	 * Truncate text for display
	 */
	private truncate(text: string, maxLength: number): string {
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength - 3) + "...";
	}

	/**
	 * Build a MongoDB filter for cross-personality search
	 *
	 * Returns filter conditions that match memories from:
	 * - Current personality (if specified)
	 * - Other included personalities
	 * - Shared/legacy memories (no personality)
	 */
	buildCrossPersonalityFilter(options: CrossPersonalitySearchOptions): Record<string, unknown> {
		const conditions: Record<string, unknown>[] = [];

		// Include memories with no personality (shared/legacy)
		if (options.includeSharedMemories !== false) {
			conditions.push({
				$or: [{ "personality.source_personality_id": null }, { personality: { $exists: false } }],
			});
		}

		// Include specific personalities
		if (options.includePersonalityIds?.length) {
			conditions.push({
				"personality.source_personality_id": { $in: options.includePersonalityIds },
			});
		} else if (options.currentPersonalityId) {
			// If no specific list, at least include current personality
			conditions.push({
				"personality.source_personality_id": options.currentPersonalityId,
			});
		}

		// If no conditions, match all (no personality filter)
		if (conditions.length === 0) {
			return {};
		}

		return { $or: conditions };
	}

	/**
	 * Apply personality boost to search results
	 *
	 * Boosts memories from the current personality to prioritize
	 * personality-specific context while still showing cross-personality results
	 */
	applyPersonalityBoost(
		results: WeightedResult[],
		memoryItems: Map<string, MemoryItem>,
		options: CrossPersonalitySearchOptions
	): WeightedResult[] {
		if (!options.boostCurrentPersonality || !options.currentPersonalityId) {
			return results;
		}

		const boostFactor = options.currentPersonalityBoost ?? 1.2;

		return results
			.map((result) => {
				const memory = memoryItems.get(result.memory_id);
				const memoryPersonalityId = memory?.personality?.source_personality_id;

				// Boost if from current personality
				if (memoryPersonalityId === options.currentPersonalityId) {
					return {
						...result,
						score_summary: {
							...result.score_summary,
							final_score: result.score_summary.final_score * boostFactor,
						},
					};
				}

				return result;
			})
			.sort((a, b) => b.score_summary.final_score - a.score_summary.final_score);
	}

	/**
	 * Determine if a query is "specific" (for dynamic k adjustment)
	 *
	 * Specific queries include:
	 * - Identity lookups ("my name", "who am i")
	 * - Direct references ("that file", "this error")
	 * - Exact matches (quoted strings)
	 */
	isSpecificQuery(query: string): boolean {
		const specificPatterns = [
			/my name/i,
			/who am i/i,
			/what's my/i,
			/my preference/i,
			/that (file|error|issue|problem)/i,
			/this (file|error|issue|problem)/i,
			/"[^"]+"/,
			/'[^']+'/,
			// Hebrew equivalents
			/השם שלי/,
			/מי אני/,
			/מה ה/,
		];

		return specificPatterns.some((pattern) => pattern.test(query));
	}

	/**
	 * Estimate context limit based on query type
	 *
	 * From rompal_implementation_plan.md Section 3.11.D:
	 * - broad queries ("show me all...", "list...") -> 20
	 * - how-to / medium complexity -> 12
	 * - specific identity lookup ("my name...") -> 5
	 */
	estimateContextLimit(query: string): number {
		const lowerQuery = query.toLowerCase();

		// Broad queries
		if (
			lowerQuery.includes("show me all") ||
			lowerQuery.includes("list all") ||
			lowerQuery.includes("everything") ||
			lowerQuery.includes("all of") ||
			lowerQuery.includes("הכל") ||
			lowerQuery.includes("רשימה")
		) {
			return 20;
		}

		// Specific identity lookups
		if (
			lowerQuery.includes("my name") ||
			lowerQuery.includes("who am i") ||
			lowerQuery.includes("my preference") ||
			lowerQuery.includes("השם שלי") ||
			lowerQuery.includes("מי אני")
		) {
			return 5;
		}

		// How-to and medium complexity
		if (
			lowerQuery.includes("how to") ||
			lowerQuery.includes("how do") ||
			lowerQuery.includes("איך ל") ||
			lowerQuery.includes("כיצד")
		) {
			return 12;
		}

		// Default to medium
		return 10;
	}
}

// Export default instance for convenience
export const memoryRetrievalService = new MemoryRetrievalService();
