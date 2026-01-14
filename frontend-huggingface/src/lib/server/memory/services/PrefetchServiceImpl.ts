/**
 * PrefetchServiceImpl - Context prefetch service implementation
 *
 * Handles system-driven retrieval before LLM generation:
 * - Fetches always-inject memories (identity)
 * - Executes hybrid search for relevant context
 * - Formats context for prompt injection
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { SearchDebug, RetrievalConfidence, MemoryTier } from "../types";
import { MEMORY_TIER_GROUPS } from "../types";
import type { SearchService as HybridSearchService } from "../search/SearchService";
import type { QdrantAdapter } from "../adapters/QdrantAdapter";
import type {
	PrefetchService,
	PrefetchContextParams,
	PrefetchContextResult,
} from "../UnifiedMemoryFacade";

export interface PrefetchServiceImplConfig {
	hybridSearch: HybridSearchService;
	qdrantAdapter: QdrantAdapter;
	config?: MemoryConfig;
}

interface AlwaysInjectMemory {
	memoryId: string;
	content: string;
	tier: MemoryTier;
	tags: string[];
}

export class PrefetchServiceImpl implements PrefetchService {
	private hybridSearch: HybridSearchService;
	private qdrant: QdrantAdapter;
	private config: MemoryConfig;

	constructor(params: PrefetchServiceImplConfig) {
		this.hybridSearch = params.hybridSearch;
		this.qdrant = params.qdrantAdapter;
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Prefetch context for prompt injection
	 */
	async prefetchContext(params: PrefetchContextParams): Promise<PrefetchContextResult> {
		const startTime = Date.now();
		const timings: Record<string, number> = {};

		// Step 1: Fetch always-inject memories (identity, core preferences)
		const alwaysInjectStart = Date.now();
		const alwaysInjectMemories = await this.fetchAlwaysInjectMemories(params.userId);
		timings.always_inject_ms = Date.now() - alwaysInjectStart;

		// Step 2: Execute hybrid search for contextually relevant memories
		const searchStart = Date.now();
		const limit = params.limit ?? this.estimateContextLimit(params.query, params.hasDocuments);

		const searchResponse = await this.hybridSearch.search({
			userId: params.userId,
			query: params.query,
			tiers: this.determineTierPlan(params.hasDocuments, params.includeDataGov),
			limit,
			enableRerank: true,
		});
		timings.search_ms = Date.now() - searchStart;

		// Step 3: Build context injection string
		const formatStart = Date.now();
		const memoryContextInjection = this.formatContextInjection(
			alwaysInjectMemories,
			searchResponse.results.map((r) => ({
				position: r.position,
				tier: r.tier,
				content: r.content,
				memoryId: r.memory_id,
			})),
			params.recentMessages
		);
		timings.format_ms = Date.now() - formatStart;

		// Step 4: Calculate confidence
		const confidence = this.calculateConfidence(
			alwaysInjectMemories.length,
			searchResponse.results.length,
			searchResponse.debug
		);

		const totalMs = Date.now() - startTime;

		logger.debug(
			{
				userId: params.userId,
				alwaysInjectCount: alwaysInjectMemories.length,
				searchResultCount: searchResponse.results.length,
				confidence,
				totalMs,
			},
			"Context prefetch completed"
		);

		return {
			memoryContextInjection,
			retrievalDebug: {
				...searchResponse.debug,
				stage_timings_ms: {
					...searchResponse.debug.stage_timings_ms,
					memory_prefetch_ms: timings.always_inject_ms,
				},
			},
			retrievalConfidence: confidence,
		};
	}

	/**
	 * Fetch memories marked as always_inject (identity, core preferences)
	 */
	private async fetchAlwaysInjectMemories(userId: string): Promise<AlwaysInjectMemory[]> {
		if (this.qdrant.isCircuitOpen()) {
			return [];
		}

		try {
			// Use search with a filter for always_inject memories
			// Note: scroll doesn't support custom filters, so we use search with zero vector
			const dims = this.config.qdrant.expected_embedding_dims ?? 768;
			const zeroVector = new Array(dims).fill(0);
			const results = await this.qdrant.search({
				userId,
				vector: zeroVector,
				limit: 20,
				status: ["active"],
			});

			// Filter for always_inject in client-side (since Qdrant search doesn't support custom filters)
			return results
				.filter((r) => r.payload.always_inject === true)
				.map((r) => ({
					memoryId: r.id,
					content: r.payload.content as string,
					tier: r.payload.tier as MemoryTier,
					tags: (r.payload.tags as string[]) ?? [],
				}));
		} catch (err) {
			logger.warn({ err }, "Failed to fetch always-inject memories");
			return [];
		}
	}

	/**
	 * Determine which tiers to search based on context
	 * Phase 25: Now supports DataGov tiers when includeDataGov is true
	 */
	private determineTierPlan(hasDocuments: boolean, includeDataGov?: boolean): MemoryTier[] {
		// Always include working (cross-conversation) and memory_bank (permanent)
		const tiers: MemoryTier[] = ["working", "memory_bank"];

		// Include books if documents are attached
		if (hasDocuments) {
			tiers.push("books");
		}

		// Include patterns for learned behaviors
		tiers.push("patterns");

		// History is lower priority but included for completeness
		tiers.push("history");

		// Phase 25: Include DataGov tiers when query suggests government data interest
		// Set by detectDataGovIntent() in the orchestration layer
		if (includeDataGov) {
			tiers.push(...MEMORY_TIER_GROUPS.DATAGOV);
		}

		return tiers;
	}

	/**
	 * Estimate context limit based on query complexity
	 */
	private estimateContextLimit(query: string, hasDocuments: boolean): number {
		const baseLimit = this.config.caps.search_limit_default;

		// Reduce limit if documents attached (save context space)
		if (hasDocuments) {
			return Math.max(3, Math.floor(baseLimit * 0.6));
		}

		// Increase for complex queries
		const queryLength = query.length;
		if (queryLength > 200) {
			return Math.min(this.config.caps.search_limit_max, baseLimit + 5);
		}

		return baseLimit;
	}

	/**
	 * Phase 22.6: Check if content is empty or whitespace-only
	 */
	private isEmptyContent(content: string | null | undefined): boolean {
		if (!content) return true;
		return content.trim().length === 0;
	}

	/**
	 * Phase 22.6: Maximum memories to display in context (matches RoamPal)
	 */
	private static readonly MAX_CONTEXT_MEMORIES = 3;

	/**
	 * Format context for prompt injection
	 * 
	 * Phase 22.6: Filters empty memories and limits to 3 items
	 */
	private formatContextInjection(
		alwaysInject: AlwaysInjectMemory[],
		searchResults: Array<{
			position: number;
			tier: MemoryTier;
			content: string;
			memoryId: string;
		}>,
		recentMessages: Array<{ role: string; content: string }>
	): string {
		const sections: string[] = [];

		// Phase 22.6: Filter out empty memories from always-inject
		const filteredAlwaysInject = alwaysInject.filter((m) => !this.isEmptyContent(m.content));
		const filteredOutAlwaysInject = alwaysInject.length - filteredAlwaysInject.length;

		if (filteredOutAlwaysInject > 0) {
			logger.debug(
				{ filtered: filteredOutAlwaysInject, total: alwaysInject.length },
				"[Phase 22.6] Filtered empty always-inject memories"
			);
		}

		// Section 1: Identity/Core (always-inject)
		if (filteredAlwaysInject.length > 0) {
			const identityItems = filteredAlwaysInject
				.filter((m) => m.tags.includes("identity"))
				.map((m) => `• ${m.content}`)
				.join("\n");

			const preferenceItems = filteredAlwaysInject
				.filter((m) => !m.tags.includes("identity"))
				.map((m) => `• ${m.content}`)
				.join("\n");

			if (identityItems) {
				sections.push(`**User Identity:**\n${identityItems}`);
			}
			if (preferenceItems) {
				sections.push(`**Core Preferences:**\n${preferenceItems}`);
			}
		}

		// Phase 22.6: Filter out empty memories from search results and limit to 3
		const filteredSearchResults = searchResults
			.filter((r) => !this.isEmptyContent(r.content))
			.slice(0, PrefetchServiceImpl.MAX_CONTEXT_MEMORIES);

		const filteredOutSearch = searchResults.length - filteredSearchResults.length;
		if (filteredOutSearch > 0) {
			logger.debug(
				{ 
					filtered: filteredOutSearch, 
					total: searchResults.length,
					kept: filteredSearchResults.length,
					maxAllowed: PrefetchServiceImpl.MAX_CONTEXT_MEMORIES
				},
				"[Phase 22.6] Filtered/limited search result memories"
			);
		}

		// Section 2: Retrieved Context (numbered for positional reference)
		if (filteredSearchResults.length > 0) {
			const retrievedItems = filteredSearchResults
				.map((r) => `[${r.position}] [${r.tier}:${r.memoryId}] ${r.content}`)
				.join("\n");

			sections.push(`**Relevant Context:**\n${retrievedItems}`);
		}

		// Section 3: Conversation continuity hints
		if (recentMessages.length > 0) {
			const lastUserMessage = recentMessages.filter((m) => m.role === "user").slice(-1)[0];

			if (lastUserMessage && lastUserMessage.content.length > 50) {
				// Only add if substantial
				sections.push(
					`**Recent Topic:** ${lastUserMessage.content.slice(0, 100)}${lastUserMessage.content.length > 100 ? "..." : ""}`
				);
			}
		}

		if (sections.length === 0) {
			return "";
		}

		return `═══ CONTEXTUAL MEMORY ═══\n\n${sections.join("\n\n")}\n\n═══════════════════════`;
	}

	/**
	 * Calculate retrieval confidence
	 */
	private calculateConfidence(
		alwaysInjectCount: number,
		searchResultCount: number,
		searchDebug: SearchDebug
	): RetrievalConfidence {
		// High: good identity context + good search results
		if (alwaysInjectCount >= 2 && searchResultCount >= 3) {
			const topScore = searchDebug.stage_timings_ms ? 0.7 : 0; // Placeholder
			if (searchDebug.confidence === "high" || searchDebug.errors.length === 0) {
				return "high";
			}
		}

		// Medium: some context available
		if (alwaysInjectCount > 0 || searchResultCount > 0) {
			if (searchDebug.fallbacks_used.length <= 1) {
				return "medium";
			}
		}

		return "low";
	}
}
