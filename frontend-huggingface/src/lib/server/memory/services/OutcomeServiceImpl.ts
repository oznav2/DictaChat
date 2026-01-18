/**
 * OutcomeServiceImpl - Outcome recording service implementation
 *
 * Handles:
 * - Recording outcomes for retrieved memories
 * - Storing key takeaways from exchanges
 * - Selective scoring based on related references
 * - KG routing updates (Roampal-aligned)
 * - Time-weighted score decay
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { MemoryTier, Outcome } from "../types";
import { buildProblemHash } from "../utils/problemSignature";
import type { MemoryMongoStore } from "../stores/MemoryMongoStore";
import type { QdrantAdapter } from "../adapters/QdrantAdapter";
import type { DictaEmbeddingClient } from "../embedding/DictaEmbeddingClient";
import type { KnowledgeGraphService } from "../kg/KnowledgeGraphService";
import type {
	OutcomeService,
	RecordOutcomeParams,
	RecordResponseParams,
} from "../UnifiedMemoryFacade";

export interface OutcomeServiceImplConfig {
	mongoStore: MemoryMongoStore;
	qdrantAdapter: QdrantAdapter;
	embeddingClient: DictaEmbeddingClient;
	kgService?: KnowledgeGraphService;
	config?: MemoryConfig;
	// Callback to get current search position map
	getSearchPositionMap?: () => Map<number, string>;
	getLastSearchResults?: () => string[];
	getLastQueryNormalized?: () => string;
	getLastSearchTiers?: () => MemoryTier[];
	clearTurnTracking?: () => void;
}

/**
 * Initial scores for different outcomes
 */
const OUTCOME_SCORES: Record<Outcome, number> = {
	worked: 0.7,
	failed: 0.2,
	partial: 0.55,
	unknown: 0.5,
};

/**
 * Tiers that should NOT have their scores updated (protected)
 */
const PROTECTED_TIERS = new Set(["documents", "memory_bank"]);

export class OutcomeServiceImpl implements OutcomeService {
	private mongo: MemoryMongoStore;
	private qdrant: QdrantAdapter;
	private embedding: DictaEmbeddingClient;
	private kgService: KnowledgeGraphService | null;
	private config: MemoryConfig;
	private getSearchPositionMap: () => Map<number, string>;
	private getLastSearchResults: () => string[];
	private getLastQueryNormalized: () => string;
	private getLastSearchTiers: () => MemoryTier[];
	private clearTurnTracking: () => void;

	constructor(params: OutcomeServiceImplConfig) {
		this.mongo = params.mongoStore;
		this.qdrant = params.qdrantAdapter;
		this.embedding = params.embeddingClient;
		this.kgService = params.kgService ?? null;
		this.config = params.config ?? defaultMemoryConfig;

		// Default no-op callbacks
		this.getSearchPositionMap = params.getSearchPositionMap ?? (() => new Map());
		this.getLastSearchResults = params.getLastSearchResults ?? (() => []);
		this.getLastQueryNormalized = params.getLastQueryNormalized ?? (() => "");
		this.getLastSearchTiers = params.getLastSearchTiers ?? (() => []);
		this.clearTurnTracking = params.clearTurnTracking ?? (() => {});
	}

	/**
	 * Record outcome for specific memories
	 * Roampal-aligned: Updates KG routing FIRST, then scores
	 */
	async recordOutcome(params: RecordOutcomeParams): Promise<void> {
		const { userId, outcome, relatedMemoryIds } = params;

		if (!relatedMemoryIds || relatedMemoryIds.length === 0) {
			logger.debug("No memory IDs provided for outcome recording");
			return;
		}

		const startTime = Date.now();

		// Step 1: Update KG routing FIRST (Roampal pattern)
		// This allows KG to learn which collections answer which queries
		await this.updateKgRouting(userId, outcome);
		const queryForKnownSolution = this.getLastQueryNormalized();
		const problemHash = queryForKnownSolution ? buildProblemHash(queryForKnownSolution) : null;

		// Step 2: Record outcome for each memory with time-weighted scoring
		for (const memoryId of relatedMemoryIds) {
			try {
				// Get current memory to check tier
				const memory = await this.mongo.getById(memoryId, userId);
				if (!memory) {
					logger.warn({ memoryId }, "[outcome] Item not found");
					logger.warn({ memoryId }, "Memory not found for outcome recording");
					continue;
				}

				// Skip protected tiers (documents, memory_bank don't get scored)
				// But KG routing was still updated above
				if (PROTECTED_TIERS.has(memory.tier)) {
					logger.debug(
						{ memoryId, tier: memory.tier },
						"Skipping protected tier (KG still updated)"
					);
					continue;
				}

				// Calculate time weight (Roampal pattern)
				const timeWeight = this.calculateTimeWeight(memory.timestamps?.updated_at ?? null);
				const oldScore =
					typeof memory.stats?.wilson_score === "number" ? memory.stats.wilson_score : null;

				logger.info(
					{ memoryId, outcome, delta: 0, timeWeight },
					"[outcome] Recording with time decay"
				);

				// Record outcome in MongoDB with time-weighted adjustment
				await this.mongo.recordOutcome({
					memoryId,
					userId,
					outcome,
					contextType: "chat",
					feedbackSource: "explicit",
					timeWeight, // Pass time weight for score calculation
				});

				const updated = await this.mongo.getById(memoryId, userId);
				const newWilsonScore =
					typeof updated?.stats?.wilson_score === "number" ? updated.stats.wilson_score : null;
				const delta =
					oldScore !== null && newWilsonScore !== null
						? Number((newWilsonScore - oldScore).toFixed(6))
						: null;
				logger.info(
					{ memoryId, outcome, oldScore, newScore: newWilsonScore, delta, timeWeight },
					"[outcome] Score updated with time decay"
				);

				if (outcome === "failed") {
					logger.warn({ memoryId, reason: "failed" }, "[outcome] Failure recorded");
				}

				if (outcome === "worked" && memory.tier === "patterns" && problemHash) {
					await this.mongo.recordKnownSolution({
						userId,
						problemHash,
						memoryId,
					});
				}

				// Update Qdrant composite score
				const compositeScore = await this.calculateNewCompositeScore(memoryId, userId);
				if (compositeScore !== null) {
					await this.qdrant.updatePayload(memoryId, {
						composite_score: compositeScore,
					});
				}
			} catch (err) {
				logger.error({ err, memoryId }, "Failed to record outcome for memory");
			}
		}

		logger.debug(
			{
				userId,
				outcome,
				memoryCount: relatedMemoryIds.length,
				latencyMs: Date.now() - startTime,
			},
			"Outcomes recorded"
		);
	}

	/**
	 * Update KG routing based on outcome (Roampal pattern)
	 * Learns which collections answer which query types
	 */
	private async updateKgRouting(userId: string, outcome: Outcome): Promise<void> {
		if (!this.kgService) {
			return;
		}

		const query = this.getLastQueryNormalized();
		const tiers = this.getLastSearchTiers();

		if (!query || tiers.length === 0) {
			return;
		}

		try {
			// Extract concepts from query for routing learning
			const entities = this.kgService.extractEntities(query);
			const concepts = entities.map((e) => e.label.toLowerCase());

			if (concepts.length > 0) {
				await this.kgService.updateRoutingStats(userId, concepts, tiers, outcome);
				logger.debug(
					{ userId, concepts: concepts.slice(0, 3), tiers, outcome },
					"KG routing updated"
				);
			}
		} catch (err) {
			logger.error({ err }, "Failed to update KG routing");
		}
	}

	/**
	 * Calculate time weight for score updates (Roampal pattern)
	 * Recent outcomes have more impact; old memories decay
	 */
	private calculateTimeWeight(lastUsed: string | null): number {
		if (!lastUsed) {
			return 1.0;
		}

		try {
			const lastUsedDate = new Date(lastUsed);
			const ageDays = (Date.now() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24);
			// Decay over month: 1.0 / (1 + age_days / 30)
			const decayFactor = 1.0 / (1 + ageDays / 30);
			logger.debug({ ageDays, decayFactor }, "[outcome] Time weight calculation");
			logger.debug({ lastUsed, ageDays, weight: decayFactor }, "[outcome] Time weight calculated");
			return decayFactor;
		} catch {
			return 1.0;
		}
	}

	/**
	 * Record response with key takeaway and selective scoring
	 */
	async recordResponse(params: RecordResponseParams): Promise<void> {
		const { userId, keyTakeaway, outcome = "unknown", related } = params;
		const startTime = Date.now();

		// Step 1: Store key takeaway as working memory
		const vector = await this.embedding.embed(keyTakeaway);
		if (vector) {
			const storeResult = await this.mongo.store({
				userId,
				tier: "working",
				text: keyTakeaway,
				tags: ["key_takeaway"],
				source: {
					type: "system",
					conversation_id: null,
					message_id: null,
					tool_name: null,
					tool_run_id: null,
					doc_id: null,
					chunk_id: null,
				},
			});

			if (storeResult) {
				// Index in Qdrant
				await this.qdrant.upsert({
					id: storeResult.memory_id,
					vector,
					payload: {
						user_id: userId,
						tier: "working",
						status: "active",
						content: keyTakeaway,
						tags: ["key_takeaway"],
						entities: [],
						composite_score: OUTCOME_SCORES[outcome],
						always_inject: false,
						timestamp: Date.now(),
						uses: 0,
					},
				});

				logger.debug({ memoryId: storeResult.memory_id }, "Key takeaway stored");
			}
		}

		// Step 2: Resolve which memories to score
		const memoriesToScore = this.resolveRelatedMemories(related);

		// Step 3: Score the resolved memories
		if (memoriesToScore.length > 0) {
			await this.recordOutcome({
				userId,
				outcome,
				relatedMemoryIds: memoriesToScore,
			});
		}

		// Step 4: Clear turn tracking
		this.clearTurnTracking();

		logger.debug(
			{
				userId,
				keyTakeawayLength: keyTakeaway.length,
				outcome,
				scoredCount: memoriesToScore.length,
				latencyMs: Date.now() - startTime,
			},
			"Response recorded"
		);
	}

	/**
	 * Resolve related references to memory IDs
	 * Supports: positional references (1,2,3) and explicit memory_ids
	 */
	private resolveRelatedMemories(related?: Array<number | string>): string[] {
		const positionMap = this.getSearchPositionMap();
		const lastResults = this.getLastSearchResults();

		// If no related specified, score all last search results (safe default)
		if (!related || related.length === 0) {
			return lastResults;
		}

		const resolved = new Set<string>();

		for (const ref of related) {
			if (typeof ref === "number") {
				// Positional reference
				const memoryId = positionMap.get(ref);
				if (memoryId) {
					resolved.add(memoryId);
				} else {
					logger.warn({ position: ref }, "Invalid position reference");
				}
			} else if (typeof ref === "string") {
				// Explicit memory_id
				if (ref.startsWith("mem_")) {
					resolved.add(ref);
				} else {
					logger.warn({ ref }, "Invalid memory_id format");
				}
			}
		}

		// If all references were invalid, fall back to scoring all
		if (resolved.size === 0 && related.length > 0) {
			logger.warn("All related references invalid, falling back to all last results");
			return lastResults;
		}

		return Array.from(resolved);
	}

	/**
	 * Calculate new composite score after outcome recording
	 */
	private async calculateNewCompositeScore(
		memoryId: string,
		userId: string
	): Promise<number | null> {
		try {
			const memory = await this.mongo.getById(memoryId, userId);
			if (!memory) return null;

			// Wilson score is already calculated by MemoryMongoStore
			return memory.stats?.wilson_score ?? 0.5;
		} catch {
			return null;
		}
	}
}
