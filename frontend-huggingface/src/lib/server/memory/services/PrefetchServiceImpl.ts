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
import { memoryMetrics } from "../observability";
import type { SearchDebug, RetrievalConfidence, MemoryTier } from "../types";
import { MEMORY_TIER_GROUPS } from "../types";
import type { SearchService as HybridSearchService } from "../search/SearchService";
import type { QdrantAdapter } from "../adapters/QdrantAdapter";
import type { MemoryMongoStore } from "../stores/MemoryMongoStore";
import type {
	PrefetchService,
	PrefetchContextParams,
	PrefetchContextResult,
} from "../UnifiedMemoryFacade";

export interface PrefetchServiceImplConfig {
	hybridSearch: HybridSearchService;
	qdrantAdapter: QdrantAdapter;
	/** Phase 1.1: MongoDB store for efficient always_inject lookup */
	mongoStore?: MemoryMongoStore;
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
	private mongoStore?: MemoryMongoStore;
	private config: MemoryConfig;

	constructor(params: PrefetchServiceImplConfig) {
		this.hybridSearch = params.hybridSearch;
		this.qdrant = params.qdrantAdapter;
		this.mongoStore = params.mongoStore;
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
	 * Finding 14: Maximum time for prefetch operations to prevent indefinite hangs
	 */
	private static readonly PREFETCH_TIMEOUT_MS = 10000;
	private static readonly DATE_SECOND_PASS_LIMIT = 5;

	/**
	 * Prefetch context for prompt injection
	 *
	 * Phase 9.1: Uses Promise.all() for parallel always-inject + hybrid search
	 * Phase 9.3: Applies token budget management
	 */
	async prefetchContext(params: PrefetchContextParams): Promise<PrefetchContextResult> {
		const startTime = Date.now();
		let success = false;
		const timings: Record<string, number> = {};

		try {
			// Check if already aborted before starting
			if (params.signal?.aborted) {
				throw new Error("Prefetch aborted before start");
			}

			// Phase 9.1: Execute always-inject fetch AND hybrid search in PARALLEL
			// This reduces total prefetch time by ~30-50% compared to sequential execution
			const limit = params.limit ?? this.estimateContextLimit(params.query, params.hasDocuments);
			const tiers = this.determineTierPlan(params.hasDocuments, params.includeDataGov);

			const parallelStart = Date.now();
			// Phase 1.3: Skip reranking in prefetch for faster TTFT
			// Prefetch's job is to provide relevant context, not perfect ordering.
			// Reranking adds 100-300ms latency which is not worth it for prefetch.
			// The RRF fusion from hybrid search is sufficient for context injection.

			// Wrap Promise.all with abort signal support
			const prefetchPromise = Promise.all([
				this.fetchAlwaysInjectMemories(params.userId),
				this.hybridSearch.search({
					userId: params.userId,
					query: params.query,
					tiers,
					limit,
					enableRerank: false, // Phase 1.3: Disabled for prefetch speed
				}),
			]);

			// Finding 14: Always include timeout to prevent indefinite hangs
			let alwaysInjectMemories: Awaited<ReturnType<typeof this.fetchAlwaysInjectMemories>>;
			let searchResponse: Awaited<ReturnType<typeof this.hybridSearch.search>>;

			// Create timeout promise that always fires
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => {
					reject(new Error("Prefetch timeout exceeded"));
				}, PrefetchServiceImpl.PREFETCH_TIMEOUT_MS);
			});

			// Build race promises array - always includes timeout
			const racePromises: Promise<never>[] = [timeoutPromise];

			// Add abort signal promise if provided
			if (params.signal) {
				const abortPromise = new Promise<never>((_, reject) => {
					params.signal!.addEventListener("abort", () => {
						reject(new Error("Prefetch aborted by signal"));
					});
				});
				racePromises.push(abortPromise);
			}

			// Race prefetch against timeout (and optional abort signal)
			[alwaysInjectMemories, searchResponse] = await Promise.race([
				prefetchPromise,
				...racePromises,
			]);

			timings.parallel_prefetch_ms = Date.now() - parallelStart;

			// Record individual timings from search response
			if (searchResponse.debug.stage_timings_ms) {
				timings.search_ms = Object.values(searchResponse.debug.stage_timings_ms).reduce(
					(sum, v) => sum + (typeof v === "number" ? v : 0),
					0
				);
			}

			// Step 2.5: Date-focused second pass for document chunks (if needed)
			const isDateQuery = this.isHistoricalDateQuery(params.query);
			if (isDateQuery) {
				const hasDateInResults = searchResponse.results.some((r) =>
					this.hasDecisionDateSignal(r.content)
				);
				if (!hasDateInResults) {
					const dateStart = Date.now();
					try {
						const dateSearch = await this.hybridSearch.search({
							userId: params.userId,
							query: `${params.query} תאריך הישיבה "ניתן היום"`,
							tiers: ["documents"],
							limit: PrefetchServiceImpl.DATE_SECOND_PASS_LIMIT,
							enableRerank: false,
						});
						timings.date_second_pass_ms = Date.now() - dateStart;

						const seen = new Set(searchResponse.results.map((r) => r.memory_id));
						const dateResults = dateSearch.results.filter((r) => !seen.has(r.memory_id));
						if (dateResults.length > 0) {
							const merged = [...dateResults, ...searchResponse.results];
							searchResponse = {
								...searchResponse,
								results: merged.map((r, index) => ({ ...r, position: index })),
								debug: {
									...searchResponse.debug,
									stage_timings_ms: {
										...searchResponse.debug.stage_timings_ms,
										date_second_pass_ms: timings.date_second_pass_ms,
									},
								},
							};
							logger.info(
								{
									added: dateResults.length,
									total: searchResponse.results.length,
								},
								"[prefetch] Date-focused second pass added document results"
							);
						}
					} catch (err) {
						logger.debug("[prefetch] Date-focused second pass failed", { error: String(err) });
					}
				}
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

			success = true;

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
		} finally {
			const durationMs = Date.now() - startTime;
			memoryMetrics.recordOperation("prefetch", success);
			memoryMetrics.recordLatency("prefetch", durationMs);
		}
	}

	/**
	 * Fetch memories marked as always_inject (identity, core preferences)
	 *
	 * Phase 1.1 Optimization: Uses MongoDB indexed query instead of Qdrant similarity search.
	 * This removes an expensive vector search from the critical TTFT path.
	 * - Before: Qdrant search with zero vector + client-side filter (~50-100ms)
	 * - After: MongoDB indexed query on {user_id, always_inject, status} (~10-20ms)
	 */
	private async fetchAlwaysInjectMemories(userId: string): Promise<AlwaysInjectMemory[]> {
		try {
			// Phase 1.1: Use MongoDB for always_inject lookup (fast indexed query)
			if (this.mongoStore) {
				const items = await this.mongoStore.getAlwaysInject(userId);
				return items.map((item) => ({
					memoryId: item.memory_id,
					content: item.text,
					tier: item.tier,
					tags: item.tags ?? [],
				}));
			}

			// Fallback to Qdrant if mongoStore not provided (backwards compatibility)
			if (this.qdrant.isCircuitOpen()) {
				return [];
			}

			// BGE-M3 produces 1024-dim vectors - must match DictaEmbeddingClient default
			const dims = this.config.qdrant.expected_embedding_dims ?? 1024;
			const zeroVector = new Array(dims).fill(0);
			const results = await this.qdrant.search({
				userId,
				vector: zeroVector,
				limit: 20,
				status: ["active"],
			});

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
	 *
	 * CRITICAL FIX: Documents tier is ALWAYS included because uploaded documents
	 * are persistent RAG sources. Users expect to query their documents anytime,
	 * not just when the document is currently attached to the message.
	 * The hasDocuments flag now only affects search priority, not inclusion.
	 */
	private determineTierPlan(hasDocuments: boolean, includeDataGov?: boolean): MemoryTier[] {
		// Always include working (cross-conversation) and memory_bank (permanent)
		const tiers: MemoryTier[] = ["working", "memory_bank"];

		// CRITICAL FIX: Always include documents tier for persistent RAG
		// Uploaded documents should be searchable regardless of current attachments
		// hasDocuments flag indicates if current message has attachments (for logging/priority)
		tiers.push("documents");
		if (hasDocuments) {
			logger.debug(
				"[PrefetchService] Current message has document attachments - prioritizing documents tier"
			);
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
		const headerTokens = this.estimateTokens(
			"═══ CONTEXTUAL MEMORY ═══\n\n═══════════════════════"
		);
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
					maxAllowed: PrefetchServiceImpl.MAX_CONTEXT_MEMORIES,
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

	private isHistoricalDateQuery(query: string): boolean {
		if (!query) return false;
		const dateKeywords = /\b(when)\b|מתי|תאריך|באיזה\s*תאריך|באיזה\s*יום|באיזה\s*מועד|מועד/i;
		const currentTimeKeywords =
			/\b(current time|time now|what time|timezone|convert|clock|local time)\b|מה\s*השעה|שעה\s*עכשיו|אזור\s*זמן|המרת?\s*זמן|שעון/i;
		const historicalContext =
			/\b(decision|appointed|appointment|nominated|nomination|elected|election|resigned|ruling|verdict|court|case|founded|established|announced|approved|hearing)\b|החלט(?:ה|ות)|הוחלט|מונ(?:ה|ו|תה)|מינוי|נבחר|התפטר|פסק(?:\s*דין)?|בג\"ץ|בית\s*המשפט|הוקם|נוסד|אושר|הוכרז|מינויו|מינויה|דיון|שימוע|ישיבה/i;
		if (!dateKeywords.test(query)) return false;
		if (currentTimeKeywords.test(query)) return false;
		return historicalContext.test(query);
	}

	private hasDateSignal(text: string): boolean {
		if (!text) return false;
		const lower = text.toLowerCase();
		if (/\b(?:19|20)\d{2}\b/.test(lower)) return true;
		if (/\b\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}\b/.test(lower)) return true;
		if (
			/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/.test(
				lower
			)
		) {
			return true;
		}
		if (
			/(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/.test(
				text
			) ||
			/(?:ב|ל)(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/.test(
				text
			) ||
			/\b\d{1,2}\s+(?:ב|ל)?(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s+\d{4}\b/.test(
				text
			)
		) {
			return true;
		}
		if (/(?:תאריך\s+הישיבה|ניתן\s+היום)/.test(text)) return true;
		if (/(?:בתאריך|מיום|ביום)\s+\d{1,2}/.test(text)) return true;
		return false;
	}

	private hasDecisionDateSignal(text: string): boolean {
		if (!text) return false;
		const lower = text.toLowerCase();
		if (
			/(?:תאריך\s+הישיבה|מועד\s+הדיון|הדיון\s+התקיים|תאריך\s+פסק\s+דין|מועד\s+הכרעה|ניתן\s+היום|ניתנה?\s+ביום)/.test(
				text
			)
		) {
			return true;
		}
		if (/\b\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}\b/.test(lower)) return true;
		if (
			/\b\d{1,2}\s+(?:ב|ל)?(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s+\d{4}\b/.test(
				text
			)
		) {
			return true;
		}
		if (
			/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+(?:19|20)\d{2}\b/.test(
				lower
			)
		) {
			return true;
		}
		return false;
	}

	/**
	 * Calculate retrieval confidence
	 *
	 * CRITICAL FIX: Document results alone should yield high confidence
	 * Previous logic required 2+ always-inject memories, which prevented
	 * high confidence even when we had perfect document matches.
	 */
	private calculateConfidence(
		alwaysInjectCount: number,
		searchResultCount: number,
		searchDebug: SearchDebug
	): RetrievalConfidence {
		const noErrors = searchDebug.errors.length === 0;
		const minimalFallbacks = searchDebug.fallbacks_used.length <= 1;

		// High confidence conditions (any of these):
		// 1. Good identity context (2+) AND good search results (3+)
		// 2. Strong search results (3+) with no errors - document content is sufficient
		if (alwaysInjectCount >= 2 && searchResultCount >= 3 && noErrors) {
			return "high";
		}
		if (searchResultCount >= 3 && noErrors && minimalFallbacks) {
			// Document content alone can provide high confidence
			// This enables tool gating when we have relevant stored content
			return "high";
		}

		// Medium: some context available
		if (alwaysInjectCount > 0 || searchResultCount > 0) {
			if (minimalFallbacks) {
				return "medium";
			}
		}

		return "low";
	}
}
