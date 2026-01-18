/**
 * ContextServiceImpl - Context retrieval service implementation
 *
 * Provides cold-start context and context insights for memory-augmented conversations.
 * Implements the ContextService interface from UnifiedMemoryFacade.
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import { getMemoryFeatureFlags } from "../featureFlags";
import type { ContextInsights, SearchDebug } from "../types";
import type {
	ContextService,
	GetColdStartContextParams,
	GetColdStartContextResult,
	GetContextInsightsParams,
} from "../UnifiedMemoryFacade";
import type { SearchService as HybridSearchService } from "../search/SearchService";
import type { KnowledgeGraphService } from "../kg/KnowledgeGraphService";

export interface ContextServiceImplConfig {
	searchService?: HybridSearchService;
	kgService?: KnowledgeGraphService;
	config?: MemoryConfig;
}

export class ContextServiceImpl implements ContextService {
	private searchService: HybridSearchService | null;
	private kgService: KnowledgeGraphService | null;
	private config: MemoryConfig;

	constructor(params: ContextServiceImplConfig) {
		this.searchService = params.searchService ?? null;
		this.kgService = params.kgService ?? null;
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Get cold-start context for a user
	 * Returns high-value memories to inject at conversation start
	 */
	async getColdStartContext(params: GetColdStartContextParams): Promise<GetColdStartContextResult> {
		if (!this.searchService) {
			return { text: null, debug: null };
		}

		try {
			const coldStartConfig = this.config.cold_start;
			const limit = params.limit ?? coldStartConfig.limit;

			// Search for high-value memories using cold-start query
			// Respect the MEMORY_RERANK_ENABLED feature flag for graceful degradation
			const flags = getMemoryFeatureFlags();
			const searchResult = await this.searchService.search({
				userId: params.userId,
				query: coldStartConfig.query,
				limit,
				enableRerank: flags.rerankEnabled,
			});

			if (searchResult.results.length === 0) {
				return { text: null, debug: searchResult.debug };
			}

			// Format results into context injection string
			const contextLines = searchResult.results.map((r, i) => `${i + 1}. ${r.preview}`);
			const contextText = [coldStartConfig.header, ...contextLines, coldStartConfig.footer].join(
				"\n"
			);

			return {
				text: contextText,
				debug: searchResult.debug,
			};
		} catch (err) {
			logger.error({ err, userId: params.userId }, "Failed to get cold-start context");
			return { text: null, debug: null };
		}
	}

	/**
	 * Get context insights for the current conversation turn
	 * Combines routing KG, action KG, and content KG insights
	 */
	async getContextInsights(params: GetContextInsightsParams): Promise<ContextInsights> {
		const emptyInsights: ContextInsights = {
			matched_concepts: [],
			relevant_patterns: [],
			past_outcomes: [],
			proactive_insights: [],
			topic_continuity: { topics: [], links: [] },
			repetition: { is_repeated: false },
			you_already_know: [],
			directives: [],
		};

		if (!this.kgService) {
			return emptyInsights;
		}

		try {
			// Extract concepts from recent messages
			const recentText = params.recentMessages.map((m) => m.content).join(" ");
			const entities = this.kgService.extractEntities(recentText);
			const conceptLabels = entities.map((e) => e.label);

			// Detect context type
			const contextType = this.kgService.detectContextType(
				recentText,
				params.recentMessages.map((m) => m.content)
			);

			// Get KG insights
			const kgInsights = await this.kgService.getContextInsights(
				params.userId,
				contextType,
				conceptLabels
			);

			// Transform KG insights into ContextInsights format
			return {
				matched_concepts: conceptLabels.slice(0, 5),
				relevant_patterns: kgInsights.tier_recommendations.map((r) => ({
					memory_id: "",
					tier: r.tier,
					content: `Use ${r.tier} tier (score: ${r.wilson_score.toFixed(2)})`,
					success_rate: r.wilson_score,
				})),
				past_outcomes: kgInsights.action_stats.map((a) => ({
					memory_id: "",
					tier: "working" as const,
					content: `Action: ${a.action} - ${a.recommendation}`,
					reason: a.recommendation,
				})),
				proactive_insights: kgInsights.related_entities.map((e) => ({
					concept: e.label,
					recommendations: [],
				})),
				topic_continuity: { topics: conceptLabels, links: [] },
				repetition: { is_repeated: false },
				you_already_know: [],
				directives: [],
			};
		} catch (err) {
			logger.error({ err, userId: params.userId }, "Failed to get context insights");
			return emptyInsights;
		}
	}

	/**
	 * Extract entities from text and store them in the Content KG
	 * Phase 3 Gap 7: Content KG Entity Extraction
	 *
	 * RoamPal Parity:
	 * - On memory storage, extracts entities from text
	 * - Builds Content Graph with entity relationships
	 * - Used for cold-start and organic recall
	 */
	async extractAndStoreEntities(params: {
		userId: string;
		memoryId: string;
		text: string;
		importance?: number;
		confidence?: number;
	}): Promise<{ entitiesExtracted: number; entitiesStored: number; entities: string[] }> {
		const result = {
			entitiesExtracted: 0,
			entitiesStored: 0,
			entities: [] as string[],
		};

		if (!this.kgService) {
			return result;
		}

		try {
			// Extract entities using KG service's heuristic extraction
			const entities = this.kgService.extractEntities(params.text);
			result.entitiesExtracted = entities.length;
			result.entities = entities.map((e) => e.label);

			if (entities.length === 0) {
				return result;
			}

			// Store entities in Content KG with quality score
			const importance = params.importance ?? 0.5;
			const confidence = params.confidence ?? 0.5;

			await this.kgService.updateContentKg(
				params.userId,
				params.memoryId,
				entities,
				importance,
				confidence
			);

			result.entitiesStored = entities.length;

			logger.debug(
				{
					userId: params.userId,
					memoryId: params.memoryId,
					entitiesExtracted: result.entitiesExtracted,
					entitiesStored: result.entitiesStored,
					entityLabels: result.entities.slice(0, 5), // Log first 5 for debugging
				},
				"Entities extracted and stored to Content KG"
			);

			return result;
		} catch (err) {
			logger.error(
				{ err, userId: params.userId, memoryId: params.memoryId },
				"Failed to extract and store entities"
			);
			return result;
		}
	}
}
