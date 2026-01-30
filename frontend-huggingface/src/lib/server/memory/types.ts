export type Outcome = "worked" | "failed" | "partial" | "unknown";

/**
 * Memory tier types:
 * - working: Short-term working memory (TTL: 24h)
 * - history: Medium-term conversation history (TTL: 7d)
 * - patterns: Learned patterns and preferences (TTL: 30d)
 * - documents: Document chunks from uploaded PDFs/files (permanent)
 * - memory_bank: Long-term permanent storage
 * - datagov_schema: Israeli government data schemas (Phase 25)
 * - datagov_expansion: Hebrew/English term expansions (Phase 25)
 */
export type MemoryTier =
	| "working"
	| "history"
	| "patterns"
	| "documents"
	| "memory_bank"
	| "datagov_schema"
	| "datagov_expansion";

/**
 * Tier constants for consistent usage across memory services
 */
export const MEMORY_TIER_GROUPS = {
	/** Core tiers for normal user memories (subject to TTL and promotion) */
	CORE: ["working", "history", "patterns", "documents", "memory_bank"] as const,
	/** DataGov tiers - static, pre-loaded government data (Phase 25) */
	DATAGOV: ["datagov_schema", "datagov_expansion"] as const,
	/** All searchable tiers */
	ALL_SEARCHABLE: [
		"working",
		"history",
		"patterns",
		"documents",
		"memory_bank",
		"datagov_schema",
		"datagov_expansion",
	] as const,
	/** Tiers eligible for Wilson scoring and outcome tracking */
	LEARNABLE: ["working", "history", "patterns", "memory_bank"] as const,
	/** Tiers subject to TTL cleanup */
	CLEANABLE: ["working", "history", "patterns"] as const,
};

export type MemoryStatus = "active" | "archived" | "deleted";

export type SortBy = "relevance" | "recency" | "score";

export type ContextType =
	| "general"
	| "coding"
	| "debug"
	| "error"
	| "planning"
	| "research"
	| "other"
	| (string & {});

export type MemorySourceType = "user" | "assistant" | "tool" | "document" | "system";

export interface BookSourceMetadata {
	book_id: string;
	title: string;
	author: string | null;
	chunk_index: number;
	source_context: string | null;
	doc_position: number | null;
	has_code: boolean | null;
	token_count: number | null;
	upload_timestamp: string | null;
	file_type: string | null;
	mime_type: string | null;
	document_hash: string | null;
}

export interface MemorySource {
	type: MemorySourceType;
	conversation_id: string | null;
	message_id: string | null;
	tool_name: string | null;
	tool_run_id: string | null;
	doc_id: string | null;
	chunk_id: string | null;
	book?: BookSourceMetadata;
}

export interface MemoryQuality {
	importance: number;
	confidence: number;
	mentioned_count: number;
	quality_score: number;
}

export interface MemoryStats {
	uses: number;
	last_used_at: string | null;
	worked_count: number;
	failed_count: number;
	partial_count: number;
	unknown_count: number;
	/** Phase 23.2: Cumulative success value for Wilson calculation */
	success_count?: number;
	success_rate: number;
	wilson_score: number;
}

export interface MemoryTimestamps {
	created_at: string;
	updated_at: string;
	archived_at: string | null;
	expires_at: string | null;
}

export interface MemoryEmbeddingInfo {
	model: string;
	dims: number;
	vector_hash: string;
	last_indexed_at: string | null;
}

export interface MemoryVersioningInfo {
	current_version: number;
	supersedes_memory_id: string | null;
}

// "none" disables MongoDB language-specific stemming - best for bilingual content
export type MemoryLanguage = "he" | "en" | "mixed" | "none";

export interface MemoryPersonalityInfo {
	source_personality_id: string | null;
	source_personality_name: string | null;
}

/**
 * Maps memories to personalities for cross-personality access
 */
export interface PersonalityMemoryMapping {
	mapping_id: string;
	user_id: string;
	memory_id: string;
	personality_id: string;
	personality_name: string;
	access_level: "owner" | "shared" | "inherited";
	created_at: string;
}

export interface MemoryItem {
	memory_id: string;
	user_id: string;
	org_id: string | null;
	tier: MemoryTier;
	status: MemoryStatus;
	needs_reindex?: boolean;
	reindex_reason?: string | null;
	reindex_marked_at?: string | null;
	embedding_status?: "pending" | "indexed" | "failed";
	embedding_error?: string | null;
	last_reindexed_at?: string | null;
	tags: string[];
	always_inject?: boolean;
	text: string;
	summary: string | null;
	entities: string[];
	source: MemorySource;
	quality?: MemoryQuality;
	stats?: MemoryStats;
	timestamps: MemoryTimestamps;
	embedding?: MemoryEmbeddingInfo;
	versioning?: MemoryVersioningInfo;
	personality?: MemoryPersonalityInfo;
	language?: MemoryLanguage;
	translation_ref_id?: string | null;
}

export type ActionType =
	| "search_memory"
	| "get_context_insights"
	| "add_to_memory_bank"
	| "update_memory"
	| "archive_memory"
	| "delete_memory"
	| "record_response"
	| (string & {});

export type ToolRunStatus = "ok" | "error" | "timeout";

export interface ActionOutcome {
	action_id: string;
	action_type: ActionType;
	context_type: ContextType;
	outcome: Outcome;
	conversation_id: string | null;
	message_id: string | null;
	answer_attempt_id: string | null;
	tier: MemoryTier | null;
	doc_id: string | null;
	memory_id: string | null;
	action_params: Record<string, unknown> | null;
	tool_status: ToolRunStatus | null;
	latency_ms: number | null;
	error_type: string | null;
	error_message: string | null;
	timestamp: string;
}

export interface StageTimingsMs {
	memory_prefetch_ms?: number;
	parallel_prefetch_ms?: number;
	format_ms?: number;
	qdrant_query_ms?: number;
	bm25_query_ms?: number;
	candidate_merge_ms?: number;
	wilson_blend_ms?: number;
	rerank_ms?: number;
	kg_insights_ms?: number;
	known_solution_lookup?: number;
	entity_boost_ms?: number;
	/** NER Integration: Entity pre-filtering stage timing */
	entity_prefilter_ms?: number;
}

export interface SearchScoreSummary {
	final_score: number;
	embedding_similarity?: number;
	learned_score?: number;
	dense_similarity?: number;
	text_similarity?: number;
	rrf_score?: number;
	ce_score?: number;
	quality_score?: number;
	entity_boost?: number;
	embedding_weight?: number;
	learned_weight?: number;
	vector_rank?: number | null;
	text_rank?: number | null;
	ce_rank?: number | null;
	uses?: number;
	wilson_score?: number;
	last_outcome?: Outcome | null;
	age_seconds?: number | null;
	created_at?: string | null;
	updated_at?: string | null;
}

export interface Citation {
	source_type: MemorySourceType;
	memory_id?: string;
	conversation_id?: string | null;
	message_id?: string | null;
	tool_name?: string | null;
	doc_id?: string | null;
	chunk_id?: string | null;
	book?: BookSourceMetadata;
}

export interface SearchResult {
	position: number;
	tier: MemoryTier;
	memory_id: string;
	score_summary: SearchScoreSummary;
	content: string;
	preview?: string;
	citations: Citation[];
}

export type RetrievalConfidence = "high" | "medium" | "low";

export interface SearchDebug {
	confidence: RetrievalConfidence;
	stage_timings_ms: StageTimingsMs;
	fallbacks_used: string[];
	errors: Array<{ stage: string; message: string; code?: string }>;
}

export interface SearchResponse {
	results: SearchResult[];
	debug: SearchDebug;
}

export interface TierEffectiveness {
	tier: MemoryTier;
	success_rate: number;
	total_uses: number;
}

export interface TierRecommendation {
	concept: string;
	recommendations: TierEffectiveness[];
}

export interface InsightMemoryRef {
	memory_id: string;
	tier: MemoryTier;
	content: string;
	success_rate?: number;
	total_uses?: number;
}

export interface PastFailure {
	memory_id: string;
	tier: MemoryTier;
	content: string;
	reason?: string;
	timestamp?: string;
}

export interface ContextInsights {
	matched_concepts: string[];
	relevant_patterns: InsightMemoryRef[];
	past_outcomes: PastFailure[];
	proactive_insights: TierRecommendation[];
	topic_continuity: {
		topics: string[];
		links: Array<{ from: string; to: string; weight?: number }>;
	};
	repetition: { is_repeated: boolean; similar_query?: string; last_seen_at?: string };
	you_already_know: InsightMemoryRef[];
	directives: string[];
}

export interface StatsSnapshot {
	user_id: string;
	as_of: string;
	cache_hit_rate?: number | null;
	promotion_rate?: number | null;
	demotion_rate?: number | null;
	derived_window_ms?: number | null;
	tiers: Record<
		MemoryTier,
		{
			active_count: number;
			archived_count: number;
			deleted_count: number;
			uses_total: number;
			success_rate: number;
		}
	>;
	action_effectiveness: Array<{
		context_type: ContextType;
		action_type: ActionType;
		success_rate: number;
		total_uses: number;
		examples: Array<{ timestamp: string; outcome: Outcome; doc_id: string | null }>;
	}>;
}
