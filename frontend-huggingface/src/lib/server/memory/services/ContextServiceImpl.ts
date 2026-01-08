/**
 * ContextServiceImpl - Context retrieval service implementation
 *
 * Provides cold-start context and context insights for memory-augmented conversations.
 * Implements the ContextService interface from UnifiedMemoryFacade.
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
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
			const searchResult = await this.searchService.search({
				userId: params.userId,
				query: coldStartConfig.query,
				limit,
				enableRerank: true,
			});

			if (searchResult.results.length === 0) {
				return { text: null, debug: searchResult.debug };
			}

			// Format results into context injection string
			const contextLines = searchResult.results.map((r, i) => `${i + 1}. ${r.preview}`);
			const contextText = [
				coldStartConfig.header,
				...contextLines,
				coldStartConfig.footer,
			].join("\n");

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
					pattern: `Use ${r.tier} tier`,
					confidence: r.wilson_score,
				})),
				past_outcomes: kgInsights.action_stats.map((a) => ({
					action: a.action,
					outcome: a.recommendation,
					frequency: a.uses,
				})),
				proactive_insights: kgInsights.related_entities.map((e) => ({
					insight: `Related concept: ${e.label}`,
					relevance: e.quality,
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
}
