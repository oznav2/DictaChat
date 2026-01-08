/**
 * Knowledge Graph Types
 *
 * Types for the three KG systems:
 * - Routing KG: concept → tier routing
 * - Content KG: entity relationships
 * - Action KG: action effectiveness
 */

import type { MemoryTier, Outcome } from "../types";

// ============================================
// Routing KG Types
// ============================================

/**
 * Routing concept - represents a searchable concept
 */
export interface RoutingConcept {
	user_id: string;
	concept_id: string;
	label: string;
	aliases: string[]; // Hebrew/English spellings, acronyms
	first_seen_at: Date;
	last_seen_at: Date;
}

/**
 * Tier success statistics for a concept
 */
export interface TierStats {
	success_rate: number; // worked / (worked + failed)
	wilson_score: number;
	uses: number;
	worked: number;
	failed: number;
	partial: number;
	unknown: number;
	last_used_at: Date | null;
}

/**
 * Routing stats for a concept across all tiers
 */
export interface RoutingStats {
	user_id: string;
	concept_id: string;
	tier_success_rates: Record<MemoryTier, TierStats>;
	best_tiers_cached: MemoryTier[];
}

/**
 * Tier plan result from routing
 */
export interface TierPlan {
	tiers: MemoryTier[];
	source: "routing_kg" | "default" | "explicit";
	confidence: number;
}

// ============================================
// Content KG Types
// ============================================

/**
 * Content KG node - represents an entity
 */
export interface KgNode {
	user_id: string;
	node_id: string;
	label: string;
	node_type: "entity" | "concept" | "topic";
	aliases: string[];
	mentions: number;
	avg_quality: number; // sum(importance × confidence) / mentions
	quality_sum: number; // Running sum for avg calculation
	first_seen_at: Date;
	last_seen_at: Date;
	memory_ids: string[]; // Memories mentioning this entity
}

/**
 * Content KG edge - represents a relationship
 */
export interface KgEdge {
	user_id: string;
	edge_id: string;
	source_id: string;
	target_id: string;
	relation_type: "co_occurs" | "related_to" | "part_of" | "similar_to";
	weight: number; // Co-occurrence count or strength
	first_seen_at: Date;
	last_seen_at: Date;
}

/**
 * Entity extraction result
 */
export interface ExtractedEntity {
	label: string;
	type: "person" | "organization" | "location" | "concept" | "tool" | "other";
	confidence: number;
}

/**
 * Entity boost for search ranking
 */
export interface EntityBoost {
	memory_id: string;
	boost: number; // 0.0 to 0.5 max
	matched_entities: string[];
}

// ============================================
// Action KG Types
// ============================================

/**
 * Context types for action effectiveness tracking
 */
export type ContextType =
	| "docker"
	| "debugging"
	| "datagov_query"
	| "doc_rag"
	| "coding_help"
	| "web_search"
	| "memory_management"
	| "general";

/**
 * Action outcome example for provenance
 */
export interface ActionExample {
	timestamp: Date;
	conversation_id?: string;
	message_id?: string;
	query_preview: string;
	outcome: Outcome;
	memory_ids?: string[];
	tool_runs?: string[];
	doc_ids?: string[];
}

/**
 * Action effectiveness record
 */
export interface ActionEffectiveness {
	user_id: string;
	context_type: ContextType;
	action: string; // e.g., "search_memory", "tavily_search"
	tier: MemoryTier | null;
	success_rate: number;
	wilson_score: number;
	uses: number;
	worked: number;
	failed: number;
	partial: number;
	unknown: number;
	examples: ActionExample[]; // Bounded, keep last N
}

/**
 * Context insights result
 */
export interface ContextInsightsResult {
	context_type: ContextType;
	tier_recommendations: Array<{
		tier: MemoryTier;
		wilson_score: number;
		reason: string;
	}>;
	action_stats: Array<{
		action: string;
		success_rate: number;
		uses: number;
		recommendation: "preferred" | "neutral" | "avoid";
	}>;
	related_entities: Array<{
		label: string;
		quality: number;
	}>;
}

// ============================================
// Action Cache Types (per-turn tracking)
// ============================================

/**
 * Cached action for outcome attribution
 */
export interface CachedAction {
	action: string;
	tier: MemoryTier | null;
	timestamp: Date;
	memory_ids?: string[];
	tool_name?: string;
}

/**
 * Turn context for action caching
 */
export interface TurnContext {
	conversation_id: string;
	turn_id: string;
	context_type: ContextType;
	actions: CachedAction[];
	query: string;
}
