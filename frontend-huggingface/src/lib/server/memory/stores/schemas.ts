/**
 * MongoDB Document Schemas for Memory System
 *
 * These define the document structure in MongoDB collections.
 * MongoDB is the source of truth; Qdrant is the fast vector index.
 */

import type { ObjectId } from "mongodb";
import type {
	MemoryTier,
	MemoryStatus,
	MemorySourceType,
	Outcome,
	ActionType,
	ContextType,
	ToolRunStatus,
} from "../types";

/**
 * memory_items collection - Primary memory storage
 * Stores all memory items across all tiers
 */
export interface MemoryItemDocument {
	_id: ObjectId;
	memory_id: string; // UUID, also used as Qdrant point ID
	user_id: string;
	org_id: string | null;

	// Core content
	tier: MemoryTier;
	status: MemoryStatus;
	text: string;
	summary: string | null;
	tags: string[];
	entities: string[];
	always_inject: boolean;

	// Source tracking
	source: {
		type: MemorySourceType;
		conversation_id: string | null;
		message_id: string | null;
		tool_name: string | null;
		tool_run_id: string | null;
		doc_id: string | null;
		chunk_id: string | null;
		book?: {
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
		};
	};

	// Quality metrics
	quality: {
		importance: number;
		confidence: number;
		mentioned_count: number;
		quality_score: number;
	};

	// Usage & outcome stats
	stats: {
		uses: number;
		last_used_at: Date | null;
		worked_count: number;
		failed_count: number;
		partial_count: number;
		unknown_count: number;
		/** Phase 23.2: Cumulative success value for Wilson calculation */
		success_count?: number;
		success_rate: number;
		wilson_score: number;
	};

	// Timestamps
	created_at: Date;
	updated_at: Date;
	archived_at: Date | null;
	expires_at: Date | null;

	// Embedding info (for consistency checks with Qdrant)
	embedding: {
		model: string;
		dims: number;
		vector_hash: string;
		last_indexed_at: Date | null;
	} | null;

	// Versioning
	versioning: {
		current_version: number;
		supersedes_memory_id: string | null;
	};

	// Personality tracking (for cross-personality memory access)
	personality: {
		source_personality_id: string | null;
		source_personality_name: string | null;
	};

	// Bilingual support - "none" disables language-specific stemming
	language: "he" | "en" | "mixed" | "none";
	translation_ref_id: string | null;
}

export interface KnownSolutionDocument {
	_id: ObjectId;
	user_id: string;
	problem_hash: string;
	memory_id: string;
	success_count: number;
	first_used_at: Date;
	last_used_at: Date;
}

/**
 * memory_versions collection - Historical versions of memories
 * Preserves old content when memories are updated
 */
export interface MemoryVersionDocument {
	_id: ObjectId;
	version_id: string; // UUID
	memory_id: string; // References memory_items.memory_id
	user_id: string;
	version_number: number;

	// Snapshot of content at this version
	text: string;
	summary: string | null;
	tags: string[];
	entities: string[];
	tier: MemoryTier;

	// Why this version was created
	change_type: "create" | "update" | "promote" | "archive" | "restore";
	change_reason: string | null;

	// Stats snapshot at version time
	stats_snapshot: {
		uses: number;
		success_rate: number;
		wilson_score: number;
	};

	created_at: Date;
}

/**
 * memory_outcomes collection - Individual outcome events
 * Records each time a memory is used and what happened
 */
export interface MemoryOutcomeDocument {
	_id: ObjectId;
	outcome_id: string; // UUID
	memory_id: string; // References memory_items.memory_id
	user_id: string;

	// Outcome details
	outcome: Outcome;
	context_type: ContextType;

	// What triggered this outcome
	conversation_id: string | null;
	message_id: string | null;
	answer_attempt_id: string | null;

	// Optional feedback
	feedback_source: "explicit" | "implicit" | "auto_detected" | null;
	feedback_text: string | null;

	// Score delta applied
	score_delta: number;
	new_wilson_score: number;

	created_at: Date;
}

/**
 * action_outcomes collection - Action effectiveness tracking
 * Records outcomes of tool/action invocations for learning
 */
export interface ActionOutcomeDocument {
	_id: ObjectId;
	action_id: string; // UUID
	user_id: string;

	// Action identification
	action_type: ActionType;
	context_type: ContextType;

	// Outcome
	outcome: Outcome;
	tool_status: ToolRunStatus | null;

	// Context
	conversation_id: string | null;
	message_id: string | null;
	answer_attempt_id: string | null;
	tier: MemoryTier | null;
	doc_id: string | null;
	memory_id: string | null;

	// Parameters used (for learning what works)
	action_params: Record<string, unknown> | null;

	// Performance
	latency_ms: number | null;

	// Error info (if failed)
	error_type: string | null;
	error_message: string | null;

	created_at: Date;
}

/**
 * kg_nodes collection - Knowledge graph nodes
 * Stores concepts, entities, and their metadata
 */
export interface KgNodeDocument {
	_id: ObjectId;
	node_id: string; // UUID
	user_id: string;
	graph_type: "routing" | "content" | "action";

	// Node content
	label: string; // Normalized form
	display_label: string; // Original form for display
	node_type: "concept" | "entity" | "action" | "context" | "topic";

	// Metrics
	mention_count: number;
	last_mentioned_at: Date | null;
	avg_success_rate: number | null;

	// References
	memory_ids: string[]; // Memories that mention this node

	created_at: Date;
	updated_at: Date;
}

/**
 * kg_edges collection - Knowledge graph edges
 * Stores relationships between nodes
 */
export interface KgEdgeDocument {
	_id: ObjectId;
	edge_id: string; // UUID
	user_id: string;
	graph_type: "routing" | "content" | "action";

	// Edge endpoints
	source_node_id: string;
	target_node_id: string;

	// Edge properties
	edge_type: "related_to" | "leads_to" | "causes" | "part_of" | "effective_for" | "ineffective_for";
	weight: number;
	co_occurrence_count: number;

	// For action graph: effectiveness data
	success_rate: number | null;
	total_uses: number | null;

	created_at: Date;
	updated_at: Date;
}

/**
 * personality_memory_mappings collection - Cross-personality memory access
 * Maps memories to personalities for shared access across personas
 */
export interface PersonalityMemoryMappingDocument {
	_id: ObjectId;
	mapping_id: string; // UUID
	user_id: string;
	memory_id: string; // References memory_items.memory_id
	personality_id: string;
	personality_name: string;
	access_level: "owner" | "shared" | "inherited";
	created_at: Date;
}

/**
 * reindex_checkpoints collection - Tracks reindex progress
 * Allows resumable reindexing from MongoDB to Qdrant
 */
export interface ReindexCheckpointDocument {
	_id: ObjectId;
	checkpoint_id: string;
	user_id: string | null; // null = global reindex

	// Progress
	status: "running" | "completed" | "failed" | "paused";
	last_processed_id: string | null;
	processed_count: number;
	total_count: number;
	error_count: number;

	// Timing
	started_at: Date;
	updated_at: Date;
	completed_at: Date | null;

	// Errors (last N)
	recent_errors: Array<{
		memory_id: string;
		error: string;
		timestamp: Date;
	}>;
}

/**
 * consistency_logs collection - Logs from consistency checks
 * Records discrepancies between MongoDB and Qdrant
 */
export interface ConsistencyLogDocument {
	_id: ObjectId;
	log_id: string;
	user_id: string | null;

	// Check info
	check_type: "full" | "sample" | "targeted";
	started_at: Date;
	completed_at: Date | null;

	// Results
	total_checked: number;
	discrepancies_found: number;
	auto_repaired: number;

	// Discrepancy details
	discrepancies: Array<{
		memory_id: string;
		type: "missing_in_qdrant" | "missing_in_mongo" | "vector_mismatch" | "payload_mismatch";
		details: string;
		repaired: boolean;
	}>;
}

/**
 * Index definitions for memory collections
 * These should be created on database initialization
 */
export const MEMORY_COLLECTION_INDEXES = {
	memory_items: [
		// Primary lookups
		{ key: { memory_id: 1 }, unique: true },
		{ key: { user_id: 1, tier: 1, status: 1 } },
		{ key: { user_id: 1, status: 1, updated_at: -1 } },

		// Full-text search (BM25-like)
		{
			key: { text: "text", summary: "text", tags: "text" },
			weights: { text: 10, summary: 5, tags: 3 },
			name: "memory_text_search",
		},

		// Entity lookups
		{ key: { user_id: 1, entities: 1 } },

		// Tag lookups
		{ key: { user_id: 1, tags: 1 } },

		// Expiration (TTL index for automatic cleanup)
		{ key: { expires_at: 1 }, expireAfterSeconds: 0 },

		// Always-inject lookups
		{ key: { user_id: 1, always_inject: 1, status: 1 } },

		// Score-based queries
		{ key: { user_id: 1, tier: 1, "stats.wilson_score": -1 } },

		// Consistency checks
		{ key: { "embedding.last_indexed_at": 1 } },
	],

	memory_versions: [
		{ key: { version_id: 1 }, unique: true },
		{ key: { memory_id: 1, version_number: -1 } },
		{ key: { user_id: 1, created_at: -1 } },
	],

	memory_outcomes: [
		{ key: { outcome_id: 1 }, unique: true },
		{ key: { memory_id: 1, created_at: -1 } },
		{ key: { user_id: 1, created_at: -1 } },
		{ key: { user_id: 1, context_type: 1, outcome: 1 } },
	],

	action_outcomes: [
		{ key: { action_id: 1 }, unique: true },
		{ key: { user_id: 1, action_type: 1, context_type: 1 } },
		{ key: { user_id: 1, created_at: -1 } },
		{ key: { action_type: 1, context_type: 1, outcome: 1 } },
	],

	known_solutions: [
		{ key: { user_id: 1, problem_hash: 1 }, unique: true },
		{ key: { user_id: 1, last_used_at: -1 } },
		{ key: { user_id: 1, success_count: -1 } },
	],

	kg_nodes: [
		{ key: { node_id: 1 }, unique: true },
		{ key: { user_id: 1, graph_type: 1, label: 1 } },
		{ key: { user_id: 1, graph_type: 1, node_type: 1 } },
		{ key: { memory_ids: 1 } },
	],

	kg_edges: [
		{ key: { edge_id: 1 }, unique: true },
		{ key: { user_id: 1, graph_type: 1, source_node_id: 1 } },
		{ key: { user_id: 1, graph_type: 1, target_node_id: 1 } },
		{ key: { source_node_id: 1, target_node_id: 1, graph_type: 1 } },
	],

	personality_memory_mappings: [
		{ key: { mapping_id: 1 }, unique: true },
		{ key: { user_id: 1, personality_id: 1 } },
		{ key: { user_id: 1, memory_id: 1 } },
		{ key: { memory_id: 1, access_level: 1 } },
	],

	reindex_checkpoints: [
		{ key: { checkpoint_id: 1 }, unique: true },
		{ key: { user_id: 1, status: 1 } },
	],

	consistency_logs: [{ key: { log_id: 1 }, unique: true }, { key: { user_id: 1, started_at: -1 } }],
};

/**
 * Collection names
 */
export const MEMORY_COLLECTIONS = {
	ITEMS: "memory_items",
	VERSIONS: "memory_versions",
	OUTCOMES: "memory_outcomes",
	ACTION_OUTCOMES: "action_outcomes",
	KNOWN_SOLUTIONS: "known_solutions",
	KG_NODES: "kg_nodes",
	KG_EDGES: "kg_edges",
	PERSONALITY_MAPPINGS: "personality_memory_mappings",
	REINDEX_CHECKPOINTS: "reindex_checkpoints",
	CONSISTENCY_LOGS: "consistency_logs",
} as const;
