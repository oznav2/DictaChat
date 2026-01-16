/**
 * DataGov Memory Integration Module
 *
 * Phase 25: DataGov Knowledge Pre-Ingestion
 *
 * Exports for Israeli government data knowledge pre-loading.
 */

// Main service
export { DataGovIngestionService, getDataGovIngestionService } from "./DataGovIngestionService";

// Types
export type {
	DataGovTier,
	DataGovSourceMetadata,
	DataGovSchemaMetadata,
	DataGovExpansionMetadata,
	DataGovMemoryItem,
	DataGovIngestionResult,
	DataGovIngestionCheckpoint,
	CategoryIndex,
	CategoryIndexData,
	ResourceIndex,
	ResourceIndexEntry,
	SemanticExpansions,
	ExpansionEntry,
	DataGovIntent,
	DataGovConfig,
} from "./DataGovTypes";

// Constants
export {
	CATEGORY_HEBREW_NAMES,
	DATAGOV_INTENT_PATTERNS,
	DEFAULT_DATAGOV_CONFIG,
} from "./DataGovTypes";
