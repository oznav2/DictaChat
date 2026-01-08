/**
 * Retrieval module exports
 *
 * Provides advanced retrieval capabilities:
 * - RRF (Reciprocal Rank Fusion) with dynamic k
 * - Dynamic weighting based on learned effectiveness
 * - 3-stage memory_bank quality enforcement
 * - Organic Memory Recall for proactive insights
 */

export {
	MemoryRetrievalService,
	memoryRetrievalService,
	// RRF functions
	rrfFuse,
	rrfFuseWithDynamicK,
	calculateRrfScore,
	// Dynamic weighting functions
	calculateDynamicWeights,
	applyDynamicWeights,
	applyDynamicWeightsToResults,
	// Quality enforcement functions
	applyDistanceBoost,
	distanceToSimilarity,
	applyCEQualityMultiplier,
	applyMemoryBankQualityEnforcement,
	enforceMemoryBankQuality,
} from "./MemoryRetrievalService";

export type {
	RRFCandidate,
	DynamicWeights,
	WeightedResult,
	OrganicRecall,
	RankedList,
	MemoryRetrievalServiceConfig,
} from "./MemoryRetrievalService";
