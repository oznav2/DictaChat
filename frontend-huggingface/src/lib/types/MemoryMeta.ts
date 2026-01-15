export type MemoryTier = "working" | "history" | "patterns" | "books" | "memory_bank" | "datagov_schema" | "datagov_expansion";

/**
 * Phase 25: DataGov category definitions for UI filtering
 */
export const DATAGOV_CATEGORIES: Record<string, string> = {
	transportation: "תחבורה",
	health: "בריאות",
	finance: "כספים",
	justice: "משפט",
	education: "חינוך",
	environment: "סביבה",
	geography: "גיאוגרפיה",
	water: "מים",
	welfare: "רווחה",
	culture: "תרבות",
	technology: "מדע וטכנולוגיה",
	agriculture: "חקלאות",
	immigration: "הגירה",
	housing: "דיור",
	communications: "תקשורת",
	tourism: "תיירות",
	religion: "דת",
	municipal: "רשויות מקומיות",
	economy: "כלכלה",
	demographics: "דמוגרפיה",
	statistics: "סטטיסטיקה",
};

/**
 * Phase 25: Check if a tier is a DataGov tier
 */
export function isDataGovTier(tier: MemoryTier): boolean {
	return tier === "datagov_schema" || tier === "datagov_expansion";
}

export type SortBy = "relevance" | "recency" | "score";

export type RetrievalConfidence = "high" | "medium" | "low";

export interface MemoryCitationV1 {
	tier: MemoryTier;
	memory_id: string;
	doc_id?: string | null;
	chunk_id?: string | null;
	content?: string;
	text?: string;
	wilson_score?: number;
	confidence?: number;
	score?: number;
}

export interface MemorySearchPositionV1 {
	position: number;
	tier: MemoryTier;
	memory_id: string;
}

export interface MemorySearchPositionMapV1 {
	by_position: MemorySearchPositionV1[];
	by_memory_id: Record<string, { position: number; tier: MemoryTier }>;
}

export interface MemoryRetrievalMetaV1 {
	query: string;
	normalized_query?: string | null;
	limit: number;
	sort_by?: SortBy | null;
	tiers_considered: MemoryTier[];
	tiers_used: MemoryTier[];
	search_position_map?: MemorySearchPositionMapV1;
}

export interface KnownContextItemV1 {
	tier: MemoryTier;
	memory_id: string;
	content: string;
	doc_id?: string | null;
	score_summary?: Record<string, unknown> | null;
	wilson_score?: number;
	confidence?: number;
}

export interface KnownContextV1 {
	known_context_text: string;
	known_context_items: KnownContextItemV1[];
}

export interface ActiveConceptV1 {
	concept: string;
	best_collection?: string | null;
	success_rate?: number | null;
	usage_count?: number | null;
}

export interface ContextInsightsMetaV1 {
	matched_concepts: string[];
	active_concepts: ActiveConceptV1[];
	tier_recommendations?: unknown[] | null;
	you_already_know?: unknown[] | null;
	directives?: string[] | null;
}

export interface MemoryDebugErrorV1 {
	stage: string;
	message: string;
	code?: string | null;
}

export type VectorStageStatus =
	| "enabled"
	| "disabled_schema_mismatch"
	| "disabled_breaker_open"
	| "disabled_config";

export interface MemoryDebugMetaV1 {
	retrieval_confidence: RetrievalConfidence;
	fallbacks_used: string[];
	stage_timings_ms: Record<string, number>;
	errors: MemoryDebugErrorV1[];
	vector_stage_status?: VectorStageStatus | null;
}

export interface RetrievalDebugV1 {
	confidence: RetrievalConfidence;
	fallbacks_used: string[];
	stage_timings_ms: Record<string, number>;
	errors: MemoryDebugErrorV1[];
}

export interface MemoryFeedbackMetaV1 {
	eligible: boolean;
	interrupted: boolean;
	eligible_reason?: string | null;
	default_related_positions?: number[];
}

export interface MemoryMetaV1 {
	schema_version: "v1";
	conversation_id: string;
	assistant_message_id: string;
	user_id?: string | null;
	created_at: string;
	context_type?: string | null;
	retrieval: MemoryRetrievalMetaV1;
	known_context: KnownContextV1;
	citations: MemoryCitationV1[];
	context_insights: ContextInsightsMetaV1;
	retrievalDebug?: RetrievalDebugV1;
	debug: MemoryDebugMetaV1;
	feedback: MemoryFeedbackMetaV1;
}
