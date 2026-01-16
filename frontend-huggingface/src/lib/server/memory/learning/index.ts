export { OutcomeDetector, createOutcomeDetector } from "./OutcomeDetector";
export type { ConversationMessage, OutcomeDetectionResult } from "./OutcomeDetector";

export { PromotionService, createPromotionService } from "./PromotionService";
export type { PromotionServiceConfig, PromotionStats } from "./PromotionService";

// Phase 8: Surfaced Memory Tracking for Outcome Detection
export {
	storeSurfacedMemories,
	getSurfacedMemories,
	clearSurfacedMemories,
} from "./SurfacedMemoryTracker";
export type { SurfacedMemoryRecord } from "./SurfacedMemoryTracker";
