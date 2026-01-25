export { StoreServiceImpl } from "./StoreServiceImpl";
export type { StoreServiceImplConfig } from "./StoreServiceImpl";

export { SearchServiceImpl } from "./SearchServiceImpl";
export type { SearchServiceImplConfig } from "./SearchServiceImpl";

export { PrefetchServiceImpl } from "./PrefetchServiceImpl";
export type { PrefetchServiceImplConfig } from "./PrefetchServiceImpl";

export { OutcomeServiceImpl } from "./OutcomeServiceImpl";
export type { OutcomeServiceImplConfig } from "./OutcomeServiceImpl";

export { PromotionServiceImpl } from "./PromotionServiceImpl";
export type { PromotionServiceImplConfig } from "./PromotionServiceImpl";

export { ContextServiceImpl } from "./ContextServiceImpl";
export type { ContextServiceImplConfig } from "./ContextServiceImpl";

export { ActionKgServiceImpl } from "./ActionKgServiceImpl";
export type { ActionKgServiceImplConfig } from "./ActionKgServiceImpl";

export { WilsonScoreService, getWilsonScoreService } from "./WilsonScoreService";
export type { MemoryScoreData, RankedMemory } from "./WilsonScoreService";

export { GhostRegistry, getGhostRegistry } from "./GhostRegistry";
export type { GhostMemoryParams, GhostRecord } from "./GhostRegistry";

export {
	DocumentRecognitionService,
	createDocumentRecognitionService,
	calculateDocumentHash,
} from "./DocumentRecognitionService";
export type {
	DocumentRecognitionConfig,
	DocumentRecognitionResult,
	DocumentMemoryRetrievalResult,
} from "./DocumentRecognitionService";

// Phase 2 (+16): Tool Result Ingestion
export { ToolResultIngestionService, ingestToolResult } from "./ToolResultIngestionService";
export type { ToolResultIngestionParams, IngestionResult } from "./ToolResultIngestionService";
