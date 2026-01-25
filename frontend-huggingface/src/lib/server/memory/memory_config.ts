import type { SortBy } from "./types";

export type QdrantDistance = "Cosine" | "Dot" | "Euclid";

export interface CircuitBreakerConfig {
	failure_threshold: number;
	success_threshold: number;
	open_duration_ms: number;
	half_open_max_concurrency: number;
}

export interface MemoryTimeoutsConfig {
	end_to_end_search_ms: number;
	end_to_end_prefetch_ms: number;
	qdrant_query_ms: number;
	mongo_text_query_ms: number;
	mongo_aggregate_ms: number;
	reranker_ms: number;
	embeddings_ms: number;
	contextual_prefix_ms: number;
	book_conversion_ms: number;
}

export interface MemoryCapsConfig {
	search_limit_default: number;
	search_limit_max: number;
	candidate_fetch_multiplier_per_tier: number;
	rerank_k: number;
	rerank_max_input_chars: number;
	max_memory_bank_items: number;
	max_action_examples_per_key: number;
	max_entities_per_memory: number;
}

export interface MemoryWeightsConfig {
	embedding_blend: {
		dense_weight: number;
		text_weight: number;
		rrf_weight: number;
	};
	cross_encoder_blend: {
		original_weight: number;
		ce_weight: number;
	};
	kg_entity_boost_cap: number;
	memory_bank: {
		distance_reduction_max: number;
		ce_multiplier_max: number;
		high_quality_threshold: number;
	};
}

export interface OutcomeDeltaConfig {
	worked: number;
	failed: number;
	partial: number;
	unknown: number;
	min_score: number;
	max_score: number;
}

export interface PromotionConfig {
	working_ttl_ms: number;
	history_ttl_ms: number;
	promote_working_to_history: { min_score: number; min_uses: number };
	promote_history_to_patterns: { min_score: number; min_uses: number };
	garbage_score_threshold: number;
	scheduler_interval_ms: number;
}

export interface ColdStartConfig {
	limit: number;
	query: string;
	header: string;
	footer: string;
}

export interface RecencyConfig {
	temporal_keywords: string[];
	default_sort_by: SortBy;
}

export interface BooksIngestionConfig {
	max_document_bytes: number;
	allowed_extensions: string[];
	allowed_mime_types: string[];
	chunking: {
		mode: "sentence" | "character";
		target_chunk_chars: number;
		overlap_chars: number;
		max_chunk_chars: number;
	};
	upsert: {
		embed_batch_size: number;
		qdrant_upsert_batch_size: number;
	};
}

export interface QdrantCollectionConfig {
	collection_name: string;
	vector_name: string;
	distance: QdrantDistance;
	expected_embedding_dims: number | null;
}

export interface VectorSchemaValidationConfig {
	enabled: boolean;
	validate_on_startup: boolean;
	validate_every_ms: number;
	on_mismatch: "disable_vector_stage" | "throw";
}

export interface DedupConfig {
	enabled: boolean;
	similarity_threshold: number;
}

/**
 * Phase 25: DataGov Pre-Ingestion Configuration
 */
export interface DataGovConfig {
	/** Enable DataGov knowledge pre-loading at startup */
	enabled: boolean;
	/** Run ingestion in background (non-blocking startup) */
	background: boolean;
	/** Path to schema files */
	schemas_path: string;
	/** Path to enterprise expansions JSON */
	expansion_path: string;
	/** Number of sample datasets per category in KG */
	kg_sample_size: number;
	/** Batch size for schema ingestion */
	batch_size: number;
	/** Maximum KG nodes to prevent UI collapse */
	max_kg_nodes: number;
}

export interface MemoryConfig {
	timeouts: MemoryTimeoutsConfig;
	caps: MemoryCapsConfig;
	weights: MemoryWeightsConfig;
	outcome_deltas: OutcomeDeltaConfig;
	promotion: PromotionConfig;
	circuit_breakers: {
		qdrant: CircuitBreakerConfig;
		bm25: CircuitBreakerConfig;
		reranker: CircuitBreakerConfig;
		embeddings: CircuitBreakerConfig;
		contextual_prefix: CircuitBreakerConfig;
		ner: CircuitBreakerConfig;
	};
	cold_start: ColdStartConfig;
	recency: RecencyConfig;
	books: BooksIngestionConfig;
	qdrant: QdrantCollectionConfig;
	vector_schema_validation: VectorSchemaValidationConfig;
	dedup: DedupConfig;
	/** Phase 25: DataGov pre-ingestion settings */
	datagov: DataGovConfig;
}

export const defaultMemoryConfig: MemoryConfig = {
	timeouts: {
		end_to_end_search_ms: 15_000,
		end_to_end_prefetch_ms: 6_000,
		qdrant_query_ms: 10_000, // 10s for first-use model loading, SQLite locks, HNSW scenarios
		mongo_text_query_ms: 1_500,
		mongo_aggregate_ms: 1_500,
		reranker_ms: 2_000, // Reduced from 4s to 2s for better UX - skip reranking if slow
		embeddings_ms: 3_000,
		contextual_prefix_ms: 5_000,
		book_conversion_ms: 30_000,
	},
	caps: {
		search_limit_default: 5,
		search_limit_max: 20,
		candidate_fetch_multiplier_per_tier: 3,
		// Option C Safety: Reduced from 30 to 10 to prevent dicta-retrieval batch size crashes
		// The reranker works better with fewer, high-quality candidates anyway
		rerank_k: 10,
		// Option C Safety: Reduced from 10k to 2k chars to prevent token overflow
		// Legal/formal documents are often longer but 2k chars captures the key content
		rerank_max_input_chars: 2_000,
		max_memory_bank_items: 1_000,
		max_action_examples_per_key: 5,
		max_entities_per_memory: 32,
	},
	weights: {
		embedding_blend: {
			dense_weight: 0.6,
			text_weight: 0.2,
			rrf_weight: 0.2,
		},
		cross_encoder_blend: {
			original_weight: 0.4,
			ce_weight: 0.6,
		},
		kg_entity_boost_cap: 1.5,
		memory_bank: {
			distance_reduction_max: 0.5,
			ce_multiplier_max: 2.0,
			high_quality_threshold: 0.8,
		},
	},
	outcome_deltas: {
		worked: 0.2,
		failed: -0.3,
		partial: 0.05,
		unknown: 0,
		min_score: 0,
		max_score: 1,
	},
	promotion: {
		working_ttl_ms: 24 * 60 * 60 * 1_000,
		history_ttl_ms: 30 * 24 * 60 * 60 * 1_000,
		promote_working_to_history: { min_score: 0.7, min_uses: 2 },
		promote_history_to_patterns: { min_score: 0.9, min_uses: 3 },
		garbage_score_threshold: 0.2,
		scheduler_interval_ms: 30 * 60 * 1_000,
	},
	circuit_breakers: {
		qdrant: {
			failure_threshold: 3,
			success_threshold: 2,
			open_duration_ms: 30_000,
			half_open_max_concurrency: 1,
		},
		bm25: {
			failure_threshold: 3,
			success_threshold: 2,
			open_duration_ms: 30_000,
			half_open_max_concurrency: 1,
		},
		reranker: {
			failure_threshold: 3, // Increased from 2 to match qdrant/bm25 - less aggressive circuit opening
			success_threshold: 2,
			open_duration_ms: 30_000, // Reduced from 60s to 30s for faster recovery
			half_open_max_concurrency: 1,
		},
		embeddings: {
			failure_threshold: 2,
			success_threshold: 2,
			open_duration_ms: 60_000,
			half_open_max_concurrency: 1,
		},
		contextual_prefix: {
			failure_threshold: 2,
			success_threshold: 2,
			open_duration_ms: 60_000,
			half_open_max_concurrency: 1,
		},
		ner: {
			failure_threshold: 3,
			success_threshold: 2,
			open_duration_ms: 30_000,
			half_open_max_concurrency: 1,
		},
	},
	cold_start: {
		limit: 5,
		query:
			"user name identity preferences goals what works how to help effectively learned mistakes to avoid proven approaches communication style agent mistakes agent needs to learn agent growth areas",
		header: "═══ KNOWN CONTEXT ═══",
		footer: "═══ END CONTEXT ═══",
	},
	recency: {
		default_sort_by: "relevance",
		temporal_keywords: [
			"last",
			"recent",
			"yesterday",
			"today",
			"earlier",
			"previous",
			"before",
			"when did",
			"how long ago",
			"last time",
			"previously",
			"lately",
			"just now",
		],
	},
	books: {
		max_document_bytes: 10 * 1024 * 1024,
		allowed_extensions: ["pdf", "docx", "xlsx", "csv", "html", "rtf", "txt", "md"],
		allowed_mime_types: [
			"application/pdf",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"text/csv",
			"text/html",
			"application/rtf",
			"text/rtf",
			"text/plain",
			"text/markdown",
		],
		chunking: {
			mode: "sentence",
			target_chunk_chars: 2_000,
			overlap_chars: 200,
			max_chunk_chars: 6_000,
		},
		upsert: {
			embed_batch_size: 32,
			qdrant_upsert_batch_size: 128,
		},
	},
	qdrant: {
		collection_name: "memories_v1",
		vector_name: "dense",
		distance: "Cosine",
		expected_embedding_dims: null,
	},
	vector_schema_validation: {
		enabled: true,
		validate_on_startup: true,
		validate_every_ms: 5 * 60 * 1_000,
		on_mismatch: "disable_vector_stage",
	},
	dedup: {
		enabled: true,
		similarity_threshold: 0.95,
	},
	/** Phase 25: DataGov pre-ingestion defaults */
	datagov: {
		enabled: true,
		background: true,
		schemas_path: "/datagov/schemas",
		expansion_path: "/datagov/enterprise_expansions.json",
		kg_sample_size: 5,
		batch_size: 50,
		max_kg_nodes: 150,
	},
};
