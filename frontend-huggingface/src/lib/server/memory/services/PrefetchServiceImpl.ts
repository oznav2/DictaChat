/**
 * PrefetchServiceImpl - Context prefetch service implementation
 *
 * Phase 9 Enhanced:
 * - Parallel prefetch for always-inject + hybrid search (9.1)
 * - Token budget management with priority truncation (9.3)
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
	 * Phase 9.3: Default token budget for memory context
	 * Reserves space for model output while maximizing context utilization
	 */
	private static readonly DEFAULT_TOKEN_BUDGET = 2000;

	/**
	 * Phase 9.3: Approximate tokens per character for budget estimation
	 * Conservative estimate for mixed Hebrew/English text
	 */
	private static readonly TOKENS_PER_CHAR = 0.35;

	/**
	 * Prefetch context for prompt injection
	 * 
	 * Phase 9.1: Uses Promise.all() for parallel always-inject + hybrid search
	 * Phase 9.3: Applies token budget management
	 */
	async prefetchContext(params: PrefetchContextParams): Promise<PrefetchContextResult> {
		const startTime = Date.now();
		const timings: Record<string, number> = {};

		// Phase 9.1: Execute always-inject fetch AND hybrid search in PARALLEL
		// This reduces total prefetch time by ~30-50% compared to sequential execution
		const limit = params.limit ?? this.estimateContextLimit(params.query, params.hasDocuments);
		const tiers = this.determineTierPlan(params.hasDocuments, params.includeDataGov);

		const parallelStart = Date.now();
		const [alwaysInjectMemories, searchResponse] = await Promise.all([
			this.fetchAlwaysInjectMemories(params.userId),
			this.hybridSearch.search({
				userId: params.userId,
				query: params.query,
				tiers,
				limit,
				enableRerank: true,
			}),
		]);
		timings.parallel_prefetch_ms = Date.now() - parallelStart;

		// Record individual timings from search response
		if (searchResponse.debug.stage_timings_ms) {
			timings.search_ms = Object.values(searchResponse.debug.stage_timings_ms).reduce(
				(sum, v) => sum + (typeof v === "number" ? v : 0),
				0
			);
		}

		// Step 3: Build context injection string with token budget management
		const formatStart = Date.now();
		const tokenBudget = params.tokenBudget ?? PrefetchServiceImpl.DEFAULT_TOKEN_BUDGET;
		const memoryContextInjection = this.formatContextInjection(
			alwaysInjectMemories,
			searchResponse.results.map((r) => ({
				position: r.position,
				tier: r.tier,
				content: r.content,
				memoryId: r.memory_id,
			})),
			params.recentMessages,
			tokenBudget
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
					parallel_prefetch_ms: timings.parallel_prefetch_ms,
					format_ms: timings.format_ms,
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
	 * Phase 9.3: Estimate token count for a string
	 * Uses character-based approximation suitable for mixed Hebrew/English
	 */
	private estimateTokens(text: string): number {
		return Math.ceil(text.length * PrefetchServiceImpl.TOKENS_PER_CHAR);
	}

	/**
	 * Format context for prompt injection
	 * 
	 * Phase 22.6: Filters empty memories and limits to 3 items
	 * Phase 9.3: Applies token budget for context window management
	 */
	private formatContextInjection(
		alwaysInject: AlwaysInjectMemory[],
		searchResults: Array<{
			position: number;
			tier: MemoryTier;
			content: string;
			memoryId: string;
		}>,
		recentMessages: Array<{ role: string; content: string }>,
		tokenBudget: number = PrefetchServiceImpl.DEFAULT_TOKEN_BUDGET
	): string {
		const sections: string[] = [];
		let usedTokens = 0;
		const headerTokens = this.estimateTokens("═══ CONTEXTUAL MEMORY ═══\n\n═══════════════════════");
		usedTokens += headerTokens;

		// Phase 22.6: Filter out empty memories from always-inject
		const filteredAlwaysInject = alwaysInject.filter((m) => !this.isEmptyContent(m.content));
		const filteredOutAlwaysInject = alwaysInject.length - filteredAlwaysInject.length;

		if (filteredOutAlwaysInject > 0) {
			logger.debug(
				{ filtered: filteredOutAlwaysInject, total: alwaysInject.length },
				"[Phase 22.6] Filtered empty always-inject memories"
			);
		}

		// Section 1: Identity/Core (always-inject) - highest priority, add first
		if (filteredAlwaysInject.length > 0) {
			const identityItems = filteredAlwaysInject
				.filter((m) => m.tags.includes("identity"))
				.map((m) => `• ${m.content}`)
				.join("\n");

			const preferenceItems = filteredAlwaysInject
				.filter((m) => !m.tags.includes("identity"))
				.map((m) => `• ${m.content}`)
				.join("\n");

			// Phase 9.3: Identity gets priority - always include if within budget
			if (identityItems) {
				const section = `**User Identity:**\n${identityItems}`;
				const sectionTokens = this.estimateTokens(section);
				if (usedTokens + sectionTokens <= tokenBudget) {
					sections.push(section);
					usedTokens += sectionTokens;
				}
			}
			// Preferences get second priority
			if (preferenceItems) {
				const section = `**Core Preferences:**\n${preferenceItems}`;
				const sectionTokens = this.estimateTokens(section);
				if (usedTokens + sectionTokens <= tokenBudget) {
					sections.push(section);
					usedTokens += sectionTokens;
				}
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
		// Phase 9.3: Apply token budget with priority-based truncation
		if (filteredSearchResults.length > 0) {
			const remainingBudget = tokenBudget - usedTokens;
			const sectionHeader = "**Relevant Context:**\n";
			let contextTokens = this.estimateTokens(sectionHeader);
			const includedItems: string[] = [];

			// Add search results by priority until budget exhausted
			for (const r of filteredSearchResults) {
				const itemText = `[${r.position}] [${r.tier}:${r.memoryId}] ${r.content}`;
				const itemTokens = this.estimateTokens(itemText + "\n");

				if (contextTokens + itemTokens <= remainingBudget) {
					includedItems.push(itemText);
					contextTokens += itemTokens;
				} else {
					// Budget exhausted - log truncation
					logger.debug(
						{
							included: includedItems.length,
							truncated: filteredSearchResults.length - includedItems.length,
							usedTokens: usedTokens + contextTokens,
							tokenBudget,
						},
						"[Phase 9.3] Token budget reached, truncating context"
					);
					break;
				}
			}

			if (includedItems.length > 0) {
				sections.push(`${sectionHeader}${includedItems.join("\n")}`);
				usedTokens += contextTokens;
			}
		}

		// Section 3: Conversation continuity hints (lowest priority - only if budget allows)
		if (recentMessages.length > 0) {
			const lastUserMessage = recentMessages.filter((m) => m.role === "user").slice(-1)[0];

			if (lastUserMessage && lastUserMessage.content.length > 50) {
				const section = `**Recent Topic:** ${lastUserMessage.content.slice(0, 100)}${lastUserMessage.content.length > 100 ? "..." : ""}`;
				const sectionTokens = this.estimateTokens(section);
				
				// Phase 9.3: Only include if within budget (lowest priority)
				if (usedTokens + sectionTokens <= tokenBudget) {
					sections.push(section);
					usedTokens += sectionTokens;
				}
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
