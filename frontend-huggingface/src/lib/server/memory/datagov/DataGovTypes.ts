/**
 * DataGov Type Definitions for Memory Integration
 *
 * Phase 25: DataGov Knowledge Pre-Ingestion
 *
 * These types extend the memory system to support Israeli government data schemas
 * and semantic term expansions from data.gov.il.
 *
 * @see codespace_gaps_enhanced.md Section 25.2
 */

import type { MemoryTier } from "../types";

/**
 * Extended memory tiers including DataGov-specific tiers
 */
export type DataGovTier = MemoryTier | "datagov_schema" | "datagov_expansion";

/**
 * Category Hebrew name mapping for the 21 DataGov categories
 */
export const CATEGORY_HEBREW_NAMES: Record<string, string> = {
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
 * DataGov source metadata for memory items
 */
export interface DataGovSourceMetadata {
	type: "datagov";
	/** Category slug (e.g., "transportation", "health") */
	category: string;
	/** Hebrew category name */
	category_he?: string;
	/** Dataset ID from data.gov.il */
	dataset_id?: string;
	/** Resource ID for individual resources */
	resource_id?: string;
	/** Original file path in schemas directory */
	file_path?: string;
}

/**
 * Schema metadata for DataGov dataset items
 */
export interface DataGovSchemaMetadata {
	/** Hebrew title */
	title_he: string;
	/** English title (if available) */
	title_en?: string;
	/** Data format (CSV, JSON, XLSX, etc.) */
	format: string;
	/** Total number of records in dataset */
	total_records: number;
	/** Field/column names in the dataset */
	fields: string[];
	/** Dataset contains phone numbers */
	has_phone: boolean;
	/** Dataset contains address information */
	has_address: boolean;
	/** Dataset contains date fields */
	has_date: boolean;
}

/**
 * Expansion metadata for semantic term mapping items
 */
export interface DataGovExpansionMetadata {
	/** Semantic domain (e.g., "TRANSPORTATION", "HEALTH") */
	domain: string;
	/** Hebrew term expansions */
	terms_he: string[];
	/** English term equivalents */
	terms_en: string[];
	/** Total term count in this domain */
	term_count: number;
}

/**
 * DataGov memory item structure
 * Extends base memory schema with DataGov-specific fields
 */
export interface DataGovMemoryItem {
	/** Unique memory identifier */
	memory_id: string;
	/** User ID (system-level for DataGov) */
	user_id: string;
	/** Memory tier - datagov_schema or datagov_expansion */
	tier: DataGovTier;
	/** Searchable bilingual content */
	content: string;
	/** DataGov source metadata */
	source: DataGovSourceMetadata;
	/** Schema metadata (for datagov_schema tier) */
	schema_meta?: DataGovSchemaMetadata;
	/** Expansion metadata (for datagov_expansion tier) */
	expansion_meta?: DataGovExpansionMetadata;
	/** Tags for filtering and categorization */
	tags: string[];
	/** Importance score (0.0 - 1.0) */
	importance: number;
	/** Status flag */
	status: "active" | "archived";
	/** Needs vector embedding index */
	needs_reindex: boolean;
	/** Timestamp of creation */
	created_at: Date;
}

/**
 * Result of DataGov ingestion operation
 */
export interface DataGovIngestionResult {
	/** Number of categories ingested */
	categories: number;
	/** Number of dataset schemas ingested */
	datasets: number;
	/** Number of semantic expansions ingested */
	expansions: number;
	/** Number of KG nodes created */
	kgNodes: number;
	/** Number of KG edges created */
	kgEdges: number;
	/** Total items ingested */
	totalItems: number;
	/** Errors encountered (non-fatal) */
	errors: string[];
	/** Whether ingestion was skipped (already complete) */
	skipped: boolean;
	/** Duration in milliseconds */
	durationMs: number;
}

/**
 * Checkpoint for resumable ingestion
 * Stored in MongoDB to survive crashes
 */
export interface DataGovIngestionCheckpoint {
	/** Last processed category */
	last_category: string | null;
	/** Index within category datasets */
	last_dataset_index: number;
	/** Last processed expansion domain */
	last_expansion_domain: string | null;
	/** When ingestion completed (null if in progress) */
	completed_at: Date | null;
	/** Total error count */
	error_count: number;
	/** Last updated timestamp */
	updated_at: Date;
}

/**
 * Category data from _category_index.json
 */
export interface CategoryIndexData {
	/** Number of datasets in category */
	count: number;
	/** Dataset IDs in this category */
	dataset_ids: string[];
}

/**
 * Category index structure
 */
export interface CategoryIndex {
	categories: Record<string, CategoryIndexData>;
	generated_at: string;
	total_categories: number;
}

/**
 * Resource/dataset entry from _index.json
 */
export interface ResourceIndexEntry {
	/** Dataset title (Hebrew) */
	title: string;
	/** Category slug */
	category: string;
	/** Data format */
	format: string;
	/** Dataset ID */
	dataset_id: string;
	/** Resource ID */
	resource_id: string;
	/** Total records */
	total_records: number;
	/** Field names */
	fields?: string[];
	/** Has phone field */
	has_phone?: boolean;
	/** Has address field */
	has_address?: boolean;
	/** Has date field */
	has_date?: boolean;
	/** Schema file path */
	file?: string;
}

/**
 * Resource index structure
 */
export interface ResourceIndex {
	resources: Record<string, ResourceIndexEntry>;
	generated_at: string;
	total_resources: number;
}

/**
 * Semantic expansion entry from enterprise_expansions.json
 */
export interface ExpansionEntry {
	/** Base term (Hebrew or English) */
	term: string;
	/** Related terms/synonyms */
	expansions: string[];
}

/**
 * Semantic expansions by domain
 */
export interface SemanticExpansions {
	[domain: string]: Record<string, string[]>;
}

/**
 * Field availability index entry (from _field_index.json)
 */
export interface FieldIndexEntry {
	has_phone: boolean;
	has_address: boolean;
	has_location: boolean;
	has_email: boolean;
	has_date: boolean;
}

/**
 * Field availability index structure
 */
export interface FieldIndex {
	generated_at: string;
	description: string;
	resources: Record<string, FieldIndexEntry>;
}

/**
 * Schema field definition (from per-dataset JSON files)
 */
export interface SchemaField {
	name: string;
	type: string;
	semantic: string | null;
}

/**
 * Schema resource definition (from per-dataset JSON files)
 */
export interface SchemaResource {
	resource_id: string;
	title: string;
	format: string;
	fields: SchemaField[];
	note?: string;
}

/**
 * Full dataset schema (from per-dataset JSON files)
 */
export interface DatasetSchema {
	dataset_id: string;
	title: string;
	organization: string;
	tags: string[];
	categories: string[];
	keywords: string[];
	resources: SchemaResource[];
}

/**
 * DataGov intent detection result
 */
export interface DataGovIntent {
	/** Whether DataGov intent was detected */
	detected: boolean;
	/** Suggest checking memory before tools */
	suggestMemoryFirst: boolean;
	/** Confidence score */
	confidence: number;
	/** Detected category (if specific) */
	category?: string;
	/** Hebrew pattern that matched */
	matchedPattern?: string;
}

/**
 * Hebrew patterns for DataGov intent detection
 */
export const DATAGOV_INTENT_PATTERNS = [
	// Government data queries
	/מאגרי?\s*מידע\s*(ממשלתי|ציבורי)/i,
	/נתונים\s+(ממשלתי|ציבורי)/i,
	/אילו\s+מאגרים/i,
	/מה\s+יש\s+(ב)?data\.gov/i,
	/רשימת?\s+(מאגרי?|נתונ)/i,

	// Category-specific
	/(מידע|נתונים)\s+על\s+(תחבורה|בריאות|חינוך|סביבה|משפט|כספים)/i,
	/מאגרי\s+(רכב|בתי\s*חולים|בתי\s*ספר|מים|רווחה)/i,
];

/**
 * Environment configuration for DataGov ingestion
 */
export interface DataGovConfig {
	/** Enable pre-loading at startup */
	preloadEnabled: boolean;
	/** Run ingestion in background (non-blocking) */
	backgroundIngestion: boolean;
	/** Path to schemas directory */
	schemasPath: string;
	/** Path to pre-converted expansions JSON */
	expansionsPath: string;
	/** Datasets per category in KG (sampling) */
	kgSampleSize: number;
	/** Batch size for ingestion */
	batchSize: number;
	/** Maximum KG nodes to create */
	maxKgNodes: number;
}

/**
 * Default DataGov configuration
 */
export const DEFAULT_DATAGOV_CONFIG: DataGovConfig = {
	preloadEnabled: false, // Must explicitly enable
	backgroundIngestion: true, // Non-blocking by default
	schemasPath: "/datagov/schemas",
	expansionsPath: "/datagov/enterprise_expansions.json",
	kgSampleSize: 5, // Top 5 datasets per category
	batchSize: 50,
	maxKgNodes: 150, // Hard cap to prevent UI collapse
};
