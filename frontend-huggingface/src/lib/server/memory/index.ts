export { UnifiedMemoryFacade } from "./UnifiedMemoryFacade";
export type {
	ActionKgService,
	ContextService,
	GetActionEffectivenessParams,
	GetColdStartContextParams,
	GetColdStartContextResult,
	GetContextInsightsParams,
	OpsService,
	OutcomeService,
	PrefetchContextParams,
	PrefetchContextResult,
	PrefetchService,
	RecordOutcomeParams,
	RecordResponseParams,
	ReindexFromMongoParams,
	RemoveBookParams,
	SearchParams,
	StoreParams,
	StoreResult,
	StoreService,
	UnifiedMemoryFacadeServices,
	RecordFeedbackParams,
	RecordResponseFeedbackParams,
	// Core Interface Parity types
	BookChunk,
	BookListItem,
	ConsistencyCheckParams as FacadeConsistencyCheckParams,
	SearchService as FacadeSearchService,
	// Phase 1: Consolidate Memory Collections types
	GetByIdParams,
	UpdateParams,
	DeleteParams,
	MemoryItemResult,
} from "./UnifiedMemoryFacade";
export { defaultMemoryConfig } from "./memory_config";
export type { MemoryConfig } from "./memory_config";
export type * from "./types";
// Phase 25: Export tier group constants for consistent tier usage
export { MEMORY_TIER_GROUPS } from "./types";

// Feature flags
export {
	getMemoryFeatureFlags,
	getMemoryEnvConfig,
	validateFeatureFlags,
	isMemorySystemOperational,
	getFeatureFlagsSummary,
} from "./featureFlags";
export type { MemoryFeatureFlags, MemoryEnvConfig } from "./featureFlags";

// Stores (MongoDB)
export { MemoryMongoStore, MEMORY_COLLECTIONS, MEMORY_COLLECTION_INDEXES } from "./stores";
export type {
	MemoryMongoStoreConfig,
	StoreMemoryParams,
	UpdateMemoryParams,
	QueryMemoriesParams,
	RecordOutcomeParams as MongoRecordOutcomeParams,
	RecordActionOutcomeParams,
	MemoryItemDocument,
	MemoryVersionDocument,
	MemoryOutcomeDocument,
	ActionOutcomeDocument,
	KgNodeDocument,
	KgEdgeDocument,
	ReindexCheckpointDocument,
	ConsistencyLogDocument,
} from "./stores";

// Adapters (Qdrant)
export { QdrantAdapter } from "./adapters";
export type {
	QdrantAdapterConfig,
	QdrantPoint,
	QdrantPayload,
	QdrantSearchResult,
	QdrantSearchParams,
	QdrantHealthStatus,
} from "./adapters";

// Embedding
export { DictaEmbeddingClient, createDictaEmbeddingClient } from "./embedding";
export type {
	DictaEmbeddingClientConfig,
	EmbeddingResult,
	EmbeddingBatchResult,
} from "./embedding";
export { RedisEmbeddingCache, createRedisEmbeddingCache } from "./embedding";
export type { RedisEmbeddingCacheConfig, CacheGetResult, CacheBatchGetResult } from "./embedding";

// Contextual Embedding (LLM-powered context prefix generation)
export {
	ContextualEmbeddingService,
	createContextualEmbeddingService,
} from "./ContextualEmbeddingService";
export type { ContextualEmbeddingConfig, ContextualChunk } from "./ContextualEmbeddingService";

// Search
export { Bm25Adapter, rankToRrfScore, mergeByMemoryId, SearchService } from "./search";
export type {
	Bm25AdapterConfig,
	Bm25SearchParams,
	Bm25SearchResult,
	Bm25SearchResponse,
	SearchServiceConfig,
	HybridSearchParams,
} from "./search";

// Service Implementations
export {
	StoreServiceImpl,
	SearchServiceImpl,
	PrefetchServiceImpl,
	OutcomeServiceImpl,
} from "./services";
export type {
	StoreServiceImplConfig,
	SearchServiceImplConfig,
	PrefetchServiceImplConfig,
	OutcomeServiceImplConfig,
} from "./services";

// Memory Tools
export {
	SEARCH_MEMORY_TOOL_DEFINITION,
	executeSearchMemory,
	formatSearchResultsForLLM,
	ADD_TO_MEMORY_BANK_TOOL_DEFINITION,
	executeAddToMemoryBank,
	formatAddToMemoryBankForLLM,
	RECORD_RESPONSE_TOOL_DEFINITION,
	executeRecordResponse,
	formatRecordResponseForLLM,
	MEMORY_TOOL_DEFINITIONS,
	MEMORY_TOOL_NAMES,
	isMemoryTool,
} from "./tools";
export type {
	SearchMemoryInput,
	SearchMemoryOutput,
	AddToMemoryBankInput,
	AddToMemoryBankOutput,
	RecordResponseInput,
	RecordResponseOutput,
} from "./tools";

// Knowledge Graph
export { KnowledgeGraphService } from "./kg";
export type {
	KnowledgeGraphServiceConfig,
	RoutingConcept,
	RoutingStats,
	TierStats,
	TierPlan,
	KgNode,
	KgEdge,
	ExtractedEntity,
	EntityBoost,
	ContextType,
	ActionEffectiveness,
	ActionExample,
	ContextInsightsResult,
	TurnContext,
	CachedAction,
} from "./kg";

// Learning (Outcome Detection & Promotion)
export {
	OutcomeDetector,
	createOutcomeDetector,
	PromotionService,
	createPromotionService,
} from "./learning";
export type {
	ConversationMessage,
	OutcomeDetectionResult,
	PromotionServiceConfig,
	PromotionStats,
} from "./learning";

// Personality (YAML Template System)
export {
	PersonalityLoader,
	getPersonalityLoader,
	createPersonalityLoader,
	templateToPrompt,
} from "./personality";
export type {
	PersonalityYAML,
	PersonalityIdentity,
	PersonalityCommunication,
	PersonalityResponseBehavior,
	PersonalityMemoryUsage,
	PersonalityFormatting,
} from "./personality";

// Operations (Reindex, Consistency, Backup)
export {
	ReindexService,
	createReindexService,
	ConsistencyService,
	createConsistencyService,
	OpsServiceImpl,
	createOpsServiceImpl,
} from "./ops";
export type {
	ReindexServiceConfig,
	ReindexParams,
	ReindexProgress,
	ReindexResult,
	ConsistencyServiceConfig,
	ConsistencyCheckParams,
	ConsistencyIssue,
	ConsistencyCheckResult,
	OpsServiceImplConfig,
	ExportBackupParams,
	ExportBackupResult,
	ImportBackupParams,
	ImportBackupResult,
} from "./ops";

// Prompt Engine (Handlebars-based template system)
export {
	PromptEngine,
	getPromptEngine,
	createPromptEngine,
	resetPromptEngine,
} from "./PromptEngine";
export type {
	PromptTemplate,
	PromptConfig,
	PromptLanguage,
	BilingualResult,
	RenderContext,
} from "./PromptEngine";

// Bilingual Prompts (Static strings and utilities)
export {
	BILINGUAL_PROMPTS,
	getBilingualPrompt,
	getBothLanguages,
	renderBilingual,
	renderPrompt,
	createBilingualPrompt,
	mergeBilingualPrompts,
	getTextDirection,
	wrapWithDirection,
	createDirectionalDiv,
	containsHebrew,
	detectLanguage,
	isRtlText,
	buildMemoryContextHeader,
	buildGoalReminder,
	buildFailureWarning,
	buildErrorMessage,
} from "./BilingualPrompts";
export type {
	SupportedLanguage,
	BilingualPrompt,
	BilingualPromptWithContext,
} from "./BilingualPrompts";

// Retrieval (RRF Fusion, Dynamic Weighting, Quality Enforcement, Organic Recall)
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
} from "./retrieval";
export type {
	RRFCandidate,
	DynamicWeights,
	WeightedResult,
	OrganicRecall,
	RankedList,
	MemoryRetrievalServiceConfig,
} from "./retrieval";

// DataGov (Phase 25: Knowledge Pre-Ingestion)
export { DataGovIngestionService, getDataGovIngestionService } from "./datagov";
export type {
	DataGovTier,
	DataGovSourceMetadata,
	DataGovSchemaMetadata,
	DataGovExpansionMetadata,
	DataGovMemoryItem,
	DataGovIngestionResult,
	DataGovIngestionCheckpoint,
	DataGovConfig,
	DataGovIntent,
} from "./datagov";
export { CATEGORY_HEBREW_NAMES, DATAGOV_INTENT_PATTERNS, DEFAULT_DATAGOV_CONFIG } from "./datagov";
