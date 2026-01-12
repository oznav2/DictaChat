import type {
	ActionOutcome,
	ContextInsights,
	MemoryTier,
	Outcome,
	SearchResponse,
	SortBy,
	StatsSnapshot,
	RetrievalConfidence,
	SearchDebug,
} from "./types";
import type {
	ExportBackupParams,
	ExportBackupResult,
	ImportBackupParams,
	ImportBackupResult,
} from "./ops/OpsServiceImpl";
import type { MemoryConfig } from "./memory_config";
import { defaultMemoryConfig } from "./memory_config";
import { logger } from "$lib/server/logger";
import type { PromotionService, PromotionStats } from "./learning/PromotionService";
import type { ReindexProgress, ReindexResult } from "./ops/ReindexService";
import type { ConsistencyCheckResult } from "./ops/ConsistencyService";
import {
	getGhostRegistry,
	type GhostRegistry,
	type GhostMemoryParams,
} from "./services/GhostRegistry";
import { getWilsonScoreService, type WilsonScoreService } from "./services/WilsonScoreService";

/**
 * BookChunk represents a chunk of text from an uploaded book
 */
export interface BookChunk {
	chunkId: string;
	bookId: string;
	title: string;
	author: string | null;
	chunkIndex: number;
	content: string;
	score?: number;
}

/**
 * Book metadata returned by listBooks
 */
export interface BookListItem {
	id: string;
	title: string;
	uploadedAt: Date;
}

/**
 * User profile document structure for goals/values storage
 */
interface UserProfileDocument {
	userId: string;
	goals: string[];
	values: string[];
	updatedAt: Date;
}

/**
 * Arbitrary user data document structure
 */
interface UserDataDocument {
	userId: string;
	key: string;
	data: unknown;
	updatedAt: Date;
}

export interface SearchService {
	search(params: SearchParams): Promise<SearchResponse>;
}

export interface PrefetchService {
	prefetchContext(params: PrefetchContextParams): Promise<PrefetchContextResult>;
}

export interface StoreService {
	store(params: StoreParams): Promise<StoreResult>;
	removeBook(params: RemoveBookParams): Promise<void>;
}

export interface OutcomeService {
	recordOutcome(params: RecordOutcomeParams): Promise<void>;
	recordResponse(params: RecordResponseParams): Promise<void>;
}

export interface ActionKgService {
	recordActionOutcome(action: ActionOutcome): Promise<void>;
	getActionEffectiveness(
		params: GetActionEffectivenessParams
	): Promise<StatsSnapshot["action_effectiveness"]>;
}

export interface ContextService {
	getColdStartContext(params: GetColdStartContextParams): Promise<GetColdStartContextResult>;
	getContextInsights(params: GetContextInsightsParams): Promise<ContextInsights>;
}

export interface OpsService {
	promoteNow(userId?: string): Promise<PromotionStats>;
	reindexFromMongo(params: ReindexFromMongoParams): Promise<ReindexResult>;
	getReindexProgress(): ReindexProgress | null;
	pauseReindex(): boolean;
	consistencyCheck(params: ConsistencyCheckParams): Promise<ConsistencyCheckResult>;
	exportBackup(params: ExportBackupParams): Promise<ExportBackupResult>;
	importBackup(params: ImportBackupParams): Promise<ImportBackupResult>;
	getStats(userId: string): Promise<StatsSnapshot>;
}

export interface UnifiedMemoryFacadeServices {
	search?: Partial<SearchService>;
	prefetch?: Partial<PrefetchService>;
	store?: Partial<StoreService>;
	outcomes?: Partial<OutcomeService>;
	actionKg?: Partial<ActionKgService>;
	context?: Partial<ContextService>;
	ops?: Partial<OpsService>;
}

export interface PrefetchContextParams {
	userId: string;
	conversationId: string;
	query: string;
	recentMessages: Array<{ role: string; content: string }>;
	hasDocuments: boolean;
	limit?: number;
	signal?: AbortSignal;
}

export interface PrefetchContextResult {
	memoryContextInjection: string;
	retrievalDebug: SearchDebug;
	retrievalConfidence: RetrievalConfidence;
}

export interface SearchParams {
	userId: string;
	query: string;
	collections?: MemoryTier[] | "all";
	limit?: number;
	sortBy?: SortBy;
	metadata?: Record<string, unknown>;
	signal?: AbortSignal;
	/** Current personality ID (for personality-aware search) */
	personalityId?: string | null;
	/** Include memories from all personalities (cross-personality search) */
	includeAllPersonalities?: boolean;
	/** Specific personality IDs to include in search */
	includePersonalityIds?: string[] | null;
}

/** Source attribution for memory items (Phase 9.9) */
export interface MemorySourceAttribution {
	type: "tool" | "conversation" | "manual" | "document";
	tool_name?: string | null;
	url?: string | null;
	description?: string | null;
	description_he?: string | null;
	conversation_id?: string | null;
	conversation_title?: string | null;
	collected_at?: Date | null;
}

export interface StoreParams {
	userId: string;
	tier: MemoryTier;
	text: string;
	tags?: string[];
	metadata?: Record<string, unknown>;
	importance?: number;
	confidence?: number;
	alwaysInject?: boolean;
	personalityId?: string | null;
	personalityName?: string | null;
	language?: "he" | "en" | "mixed" | "none";
	/** Source attribution (Phase 9.9) */
	source?: MemorySourceAttribution;
}

export interface StoreResult {
	memory_id: string;
}

export interface RecordOutcomeParams {
	userId: string;
	outcome: Outcome;
	relatedMemoryIds?: string[];
}

export interface GetActionEffectivenessParams {
	userId: string;
	contextType?: string;
}

export interface GetColdStartContextParams {
	userId: string;
	limit?: number;
	signal?: AbortSignal;
}

export interface GetColdStartContextResult {
	text: string | null;
	debug: SearchDebug | null;
}

export interface GetContextInsightsParams {
	userId: string;
	conversationId: string;
	contextType: string;
	recentMessages: Array<{ role: string; content: string }>;
	signal?: AbortSignal;
}

export interface RecordResponseParams {
	userId: string;
	keyTakeaway: string;
	outcome?: Outcome;
	related?: Array<number | string>;
}

export interface RemoveBookParams {
	userId: string;
	bookId: string;
}

export interface ReindexFromMongoParams {
	userId?: string;
	tier?: MemoryTier;
	since?: string;
}

export interface ConsistencyCheckParams {
	userId?: string;
	dryRun?: boolean;
	sampleSize?: number;
}

export interface RecordFeedbackParams {
	userId: string;
	memoryId: string;
	score: -1 | 0 | 1;
	conversationId?: string;
	messageId?: string;
}

export interface RecordResponseFeedbackParams {
	userId: string;
	conversationId?: string;
	messageId?: string;
	score: -1 | 0 | 1;
	citationCount?: number;
}

function createMemoryId(prefix = "mem_") {
	const uuid =
		typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : null;
	if (uuid) return `${prefix}${uuid}`;
	return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function emptySearchDebug(): SearchDebug {
	return {
		confidence: "low",
		stage_timings_ms: {},
		fallbacks_used: ["noop"],
		errors: [],
	};
}

function createNoopContextInsights(): ContextInsights {
	return {
		matched_concepts: [],
		relevant_patterns: [],
		past_outcomes: [],
		proactive_insights: [],
		topic_continuity: { topics: [], links: [] },
		repetition: { is_repeated: false },
		you_already_know: [],
		directives: [],
	};
}

function createNoopStatsSnapshot(userId: string): StatsSnapshot {
	return {
		user_id: userId,
		as_of: new Date().toISOString(),
		tiers: {
			working: {
				active_count: 0,
				archived_count: 0,
				deleted_count: 0,
				uses_total: 0,
				success_rate: 0.5,
			},
			history: {
				active_count: 0,
				archived_count: 0,
				deleted_count: 0,
				uses_total: 0,
				success_rate: 0.5,
			},
			patterns: {
				active_count: 0,
				archived_count: 0,
				deleted_count: 0,
				uses_total: 0,
				success_rate: 0.5,
			},
			books: {
				active_count: 0,
				archived_count: 0,
				deleted_count: 0,
				uses_total: 0,
				success_rate: 0.5,
			},
			memory_bank: {
				active_count: 0,
				archived_count: 0,
				deleted_count: 0,
				uses_total: 0,
				success_rate: 0.5,
			},
		},
		action_effectiveness: [],
	};
}

type ResolvedServices = {
	search: SearchService;
	prefetch: PrefetchService;
	store: StoreService;
	outcomes: OutcomeService;
	actionKg: ActionKgService;
	context: ContextService;
	ops: OpsService;
};

function createNoopServices(): ResolvedServices {
	return {
		search: {
			search: async () => ({
				results: [],
				debug: emptySearchDebug(),
			}),
		},
		prefetch: {
			prefetchContext: async () => ({
				memoryContextInjection: "",
				retrievalDebug: emptySearchDebug(),
				retrievalConfidence: "low",
			}),
		},
		store: {
			store: async () => ({
				memory_id: createMemoryId(),
			}),
			removeBook: async () => {},
		},
		outcomes: {
			recordOutcome: async () => {},
			recordResponse: async () => {},
		},
		actionKg: {
			recordActionOutcome: async () => {},
			getActionEffectiveness: async () => [],
		},
		context: {
			getColdStartContext: async () => ({
				text: null,
				debug: null,
			}),
			getContextInsights: async () => createNoopContextInsights(),
		},
		ops: {
			promoteNow: async () => ({
				promoted: 0,
				archived: 0,
				deleted: 0,
				errors: 0,
				durationMs: 0,
			}),
			reindexFromMongo: async () => ({
				success: true,
				jobId: "noop",
				totalProcessed: 0,
				totalFailed: 0,
				durationMs: 0,
			}),
			getReindexProgress: () => null,
			pauseReindex: () => false,
			consistencyCheck: async () => ({
				success: true,
				checkedAt: new Date(),
				issuesFound: 0,
				issuesRepaired: 0,
				totalChecked: 0,
				durationMs: 0,
				issues: [],
				mongoCount: 0,
				qdrantCount: 0,
			}),
			exportBackup: async () => ({
				exportedAt: new Date().toISOString(),
				size_bytes: 0,
				payload: {
					version: "2.0.0",
					exportedAt: new Date().toISOString(),
					userId: "noop",
					collections: {},
					meta: { format: "bricksllm_backup" },
				},
			}),
			importBackup: async () => ({
				success: true,
				dryRun: true,
				stats: {
					memoriesImported: 0,
					memoriesSkipped: 0,
					versionsImported: 0,
					outcomesImported: 0,
					actionOutcomesImported: 0,
					kgNodesImported: 0,
					kgEdgesImported: 0,
					routingConceptsImported: 0,
					routingStatsImported: 0,
					actionEffectivenessImported: 0,
					personalityMappingsImported: 0,
					reindexCheckpointsImported: 0,
					consistencyLogsImported: 0,
				},
				errors: [],
			}),
			getStats: async (userId: string) => createNoopStatsSnapshot(userId),
		},
	};
}

export class UnifiedMemoryFacade {
	private static instance: UnifiedMemoryFacade | null = null;
	private readonly config: MemoryConfig;
	private readonly services: ResolvedServices;
	private promotionService?: PromotionService;
	private ghostRegistry!: GhostRegistry;
	private wilsonScoreService!: WilsonScoreService;
	private initialized = false;

	// Auto-promote trigger: every 20 messages (Roampal pattern)
	private messageCount = 0;
	private static readonly AUTO_PROMOTE_INTERVAL = 20;

	constructor({
		config = defaultMemoryConfig,
		services = {},
		promotionService,
	}: {
		config?: MemoryConfig;
		services?: UnifiedMemoryFacadeServices;
		promotionService?: PromotionService;
	} = {}) {
		this.config = config;
		this.promotionService = promotionService;
		this.ghostRegistry = getGhostRegistry();
		this.wilsonScoreService = getWilsonScoreService();
		const noop = createNoopServices();

		this.services = {
			search: (services.search ?? noop.search) as SearchService,
			prefetch: (services.prefetch ?? noop.prefetch) as PrefetchService,
			store: (services.store ?? noop.store) as StoreService,
			outcomes: (services.outcomes ?? noop.outcomes) as OutcomeService,
			actionKg: (services.actionKg ?? noop.actionKg) as ActionKgService,
			context: (services.context ?? noop.context) as ContextService,
			ops: (services.ops ?? noop.ops) as OpsService,
		};
	}

	/**
	 * Initialize the memory facade - starts promotion scheduler
	 * Call this after creating the facade to enable autonomous memory lifecycle
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			logger.warn("UnifiedMemoryFacade already initialized");
			return;
		}

		// Start promotion scheduler for autonomous memory lifecycle
		if (this.promotionService) {
			await this.promotionService.startScheduler();
			logger.info("Memory promotion scheduler started (runs every 30 minutes)");
		}

		this.initialized = true;
		logger.info("UnifiedMemoryFacade initialized");
	}

	/**
	 * Shutdown the memory facade - stops promotion scheduler
	 * Call this on application shutdown for clean resource release
	 */
	async shutdown(): Promise<void> {
		if (!this.initialized) {
			return;
		}

		// Stop promotion scheduler
		if (this.promotionService) {
			this.promotionService.stopScheduler();
			logger.info("Memory promotion scheduler stopped");
		}

		this.initialized = false;
		logger.info("UnifiedMemoryFacade shutdown complete");
	}

	/**
	 * Check if the facade is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	static getInstance(): UnifiedMemoryFacade {
		if (!UnifiedMemoryFacade.instance) {
			logger.warn("UnifiedMemoryFacade.getInstance() called before initialization - creating NoOp instance");
			UnifiedMemoryFacade.instance = new UnifiedMemoryFacade();
		}
		return UnifiedMemoryFacade.instance;
	}

	static setInstance(facade: UnifiedMemoryFacade): void {
		UnifiedMemoryFacade.instance = facade;
	}

	static resetInstance(): void {
		UnifiedMemoryFacade.instance = null;
	}

	static create({
		enabled = true,
		config = defaultMemoryConfig,
		services = {},
	}: {
		enabled?: boolean;
		config?: MemoryConfig;
		services?: UnifiedMemoryFacadeServices;
	} = {}) {
		if (!enabled) return new UnifiedMemoryFacade({ config, services: {} });
		return new UnifiedMemoryFacade({ config, services });
	}

	getConfig(): MemoryConfig {
		return this.config;
	}

	async prefetchContext(params: PrefetchContextParams): Promise<PrefetchContextResult> {
		return this.services.prefetch.prefetchContext(params);
	}

	async search(params: SearchParams): Promise<SearchResponse> {
		const response = await this.services.search.search(params);

		// Filter out ghosted memories from results
		if (response.results.length > 0) {
			const memoryIds = response.results.map((r) => r.memory_id);
			const visibleIds = await this.ghostRegistry.filterGhosted(params.userId, memoryIds);
			const visibleIdSet = new Set(visibleIds);

			response.results = response.results
				.filter((r) => visibleIdSet.has(r.memory_id))
				.map((r, idx) => ({ ...r, position: idx + 1 }));
		}

		return response;
	}

	async store(params: StoreParams): Promise<StoreResult> {
		return this.services.store.store(params);
	}

	async recordOutcome(params: RecordOutcomeParams): Promise<void> {
		return this.services.outcomes.recordOutcome(params);
	}

	async recordActionOutcome(action: ActionOutcome): Promise<void> {
		return this.services.actionKg.recordActionOutcome(action);
	}

	async getActionEffectiveness(
		params: GetActionEffectivenessParams
	): Promise<StatsSnapshot["action_effectiveness"]> {
		return this.services.actionKg.getActionEffectiveness(params);
	}

	async getColdStartContext(params: GetColdStartContextParams): Promise<GetColdStartContextResult> {
		return this.services.context.getColdStartContext(params);
	}

	async getContextInsights(params: GetContextInsightsParams): Promise<ContextInsights> {
		return this.services.context.getContextInsights(params);
	}

	async recordResponse(params: RecordResponseParams): Promise<void> {
		return this.services.outcomes.recordResponse(params);
	}

	async getStats(userId: string): Promise<StatsSnapshot> {
		return this.services.ops.getStats(userId);
	}

	async promoteNow(userId?: string): Promise<PromotionStats> {
		return this.services.ops.promoteNow(userId);
	}

	/**
	 * Increment message count and trigger auto-promotion every 20 messages (Roampal pattern)
	 * Call this after each user message to enable autonomous memory lifecycle
	 * @param userId - The user ID for promotion scope
	 */
	async incrementMessageCount(userId?: string): Promise<void> {
		this.messageCount++;

		if (this.messageCount % UnifiedMemoryFacade.AUTO_PROMOTE_INTERVAL === 0) {
			logger.info(
				{ messageCount: this.messageCount, userId },
				"Auto-promote triggered (every 20 messages)"
			);

			// Run promotion in background - don't block the message flow
			this.promoteNow(userId).catch((err) => {
				logger.error({ err, userId }, "Auto-promote failed");
			});
		}
	}

	/**
	 * Get current message count (for debugging/monitoring)
	 */
	getMessageCount(): number {
		return this.messageCount;
	}

	async reindexFromMongo(params: ReindexFromMongoParams): Promise<ReindexResult> {
		return this.services.ops.reindexFromMongo(params);
	}

	getReindexProgress(): ReindexProgress | null {
		return this.services.ops.getReindexProgress();
	}

	pauseReindex(): boolean {
		return this.services.ops.pauseReindex();
	}

	async consistencyCheck(params: ConsistencyCheckParams): Promise<ConsistencyCheckResult> {
		return this.services.ops.consistencyCheck(params);
	}

	async removeBook(params: RemoveBookParams): Promise<void> {
		return this.services.store.removeBook(params);
	}

	async exportBackup(params: ExportBackupParams): Promise<ExportBackupResult> {
		return this.services.ops.exportBackup(params);
	}

	async importBackup(params: ImportBackupParams): Promise<ImportBackupResult> {
		return this.services.ops.importBackup(params);
	}

	async recordFeedback(params: RecordFeedbackParams): Promise<void> {
		// Record feedback score for a specific memory item
		// This adjusts the memory's score based on user feedback
		// Map user feedback to Outcome type: 1=worked, -1=failed, 0=partial
		const outcome: Outcome =
			params.score === 1 ? "worked" : params.score === -1 ? "failed" : "partial";
		await this.services.outcomes.recordOutcome({
			userId: params.userId,
			outcome,
			relatedMemoryIds: [params.memoryId],
		});
	}

	async recordResponseFeedback(params: RecordResponseFeedbackParams): Promise<void> {
		// Record general feedback for a response
		// This is used for analytics and improving memory retrieval
		// Map user feedback to Outcome type: 1=worked, -1=failed, 0=partial
		const outcome: Outcome =
			params.score === 1 ? "worked" : params.score === -1 ? "failed" : "partial";
		await this.services.outcomes.recordOutcome({
			userId: params.userId,
			outcome,
			relatedMemoryIds: [],
		});
	}

	// ============================================
	// Ghost Registry (Soft-Delete) Methods
	// ============================================

	/**
	 * Ghost (soft-delete) a memory - it won't appear in search results
	 * but can be restored later
	 */
	async ghostMemory(params: GhostMemoryParams): Promise<boolean> {
		return this.ghostRegistry.ghostMemory(params);
	}

	/**
	 * Restore a ghosted memory - makes it visible in search results again
	 */
	async restoreMemory(userId: string, memoryId: string): Promise<boolean> {
		return this.ghostRegistry.restoreMemory(userId, memoryId);
	}

	/**
	 * Check if a memory is currently ghosted
	 */
	async isMemoryGhosted(userId: string, memoryId: string): Promise<boolean> {
		return this.ghostRegistry.isGhosted(userId, memoryId);
	}

	/**
	 * Get all ghosted memories for a user
	 */
	async getGhostedMemories(userId: string) {
		return this.ghostRegistry.getGhostedMemories(userId);
	}

	// ============================================
	// Wilson Score Methods
	// ============================================

	/**
	 * Check if a memory is eligible for promotion based on Wilson score
	 */
	checkPromotionEligibility(stats: { wilsonScore: number; accessCount: number; createdAt: Date }): {
		eligible: boolean;
		reason?: string;
	} {
		return this.wilsonScoreService.checkPromotionEligibility(stats);
	}

	/**
	 * Calculate Wilson score for a memory
	 */
	calculateWilsonScore(hits: number, misses: number): number {
		return this.wilsonScoreService.calculateFromStats(hits, misses);
	}

	// ============================================
	// Goals Management (Core Interface Parity)
	// ============================================

	/**
	 * Get all goals for a user
	 * @param userId - The user ID
	 * @returns Array of goal strings
	 */
	async getGoals(userId: string): Promise<string[]> {
		try {
			const { Database } = await import("$lib/server/database");
			const db = await Database.getInstance();
			const client = db.getClient();
			const userProfilesCollection = client.db().collection<UserProfileDocument>("user_profiles");

			const profile = await userProfilesCollection.findOne({ userId });
			return profile?.goals ?? [];
		} catch (err) {
			logger.warn({ err, userId }, "Failed to get goals");
			return [];
		}
	}

	/**
	 * Add a goal for a user
	 * @param userId - The user ID
	 * @param goal - The goal to add
	 */
	async addGoal(userId: string, goal: string): Promise<void> {
		try {
			const { Database } = await import("$lib/server/database");
			const db = await Database.getInstance();
			const client = db.getClient();
			const userProfilesCollection = client.db().collection<UserProfileDocument>("user_profiles");

			await userProfilesCollection.updateOne(
				{ userId },
				{
					$addToSet: { goals: goal },
					$set: { updatedAt: new Date() },
					$setOnInsert: { values: [] },
				},
				{ upsert: true }
			);
			logger.info({ userId, goal }, "Goal added");
		} catch (err) {
			logger.error({ err, userId, goal }, "Failed to add goal");
			throw err;
		}
	}

	/**
	 * Remove a goal for a user
	 * @param userId - The user ID
	 * @param goal - The goal to remove
	 */
	async removeGoal(userId: string, goal: string): Promise<void> {
		try {
			const { Database } = await import("$lib/server/database");
			const db = await Database.getInstance();
			const client = db.getClient();
			const userProfilesCollection = client.db().collection<UserProfileDocument>("user_profiles");

			await userProfilesCollection.updateOne(
				{ userId },
				{
					$pull: { goals: goal },
					$set: { updatedAt: new Date() },
				}
			);
			logger.info({ userId, goal }, "Goal removed");
		} catch (err) {
			logger.error({ err, userId, goal }, "Failed to remove goal");
			throw err;
		}
	}

	// ============================================
	// Values Management (Core Interface Parity)
	// ============================================

	/**
	 * Get all values for a user
	 * @param userId - The user ID
	 * @returns Array of value strings
	 */
	async getValues(userId: string): Promise<string[]> {
		try {
			const { Database } = await import("$lib/server/database");
			const db = await Database.getInstance();
			const client = db.getClient();
			const userProfilesCollection = client.db().collection<UserProfileDocument>("user_profiles");

			const profile = await userProfilesCollection.findOne({ userId });
			return profile?.values ?? [];
		} catch (err) {
			logger.warn({ err, userId }, "Failed to get values");
			return [];
		}
	}

	/**
	 * Add a value for a user
	 * @param userId - The user ID
	 * @param value - The value to add
	 */
	async addValue(userId: string, value: string): Promise<void> {
		try {
			const { Database } = await import("$lib/server/database");
			const db = await Database.getInstance();
			const client = db.getClient();
			const userProfilesCollection = client.db().collection<UserProfileDocument>("user_profiles");

			await userProfilesCollection.updateOne(
				{ userId },
				{
					$addToSet: { values: value },
					$set: { updatedAt: new Date() },
					$setOnInsert: { goals: [] },
				},
				{ upsert: true }
			);
			logger.info({ userId, value }, "Value added");
		} catch (err) {
			logger.error({ err, userId, value }, "Failed to add value");
			throw err;
		}
	}

	/**
	 * Remove a value for a user
	 * @param userId - The user ID
	 * @param value - The value to remove
	 */
	async removeValue(userId: string, value: string): Promise<void> {
		try {
			const { Database } = await import("$lib/server/database");
			const db = await Database.getInstance();
			const client = db.getClient();
			const userProfilesCollection = client.db().collection<UserProfileDocument>("user_profiles");

			await userProfilesCollection.updateOne(
				{ userId },
				{
					$pull: { values: value },
					$set: { updatedAt: new Date() },
				}
			);
			logger.info({ userId, value }, "Value removed");
		} catch (err) {
			logger.error({ err, userId, value }, "Failed to remove value");
			throw err;
		}
	}

	// ============================================
	// Arbitrary Data Storage (Core Interface Parity)
	// ============================================

	/**
	 * Store arbitrary data for a user under a specific key
	 * @param userId - The user ID
	 * @param key - The storage key
	 * @param data - The data to store (any JSON-serializable value)
	 */
	async storeArbitraryData(userId: string, key: string, data: unknown): Promise<void> {
		try {
			const { Database } = await import("$lib/server/database");
			const db = await Database.getInstance();
			const client = db.getClient();
			const userDataCollection = client.db().collection<UserDataDocument>("user_data");

			await userDataCollection.updateOne(
				{ userId, key },
				{
					$set: {
						data,
						updatedAt: new Date(),
					},
				},
				{ upsert: true }
			);
			logger.info({ userId, key }, "Arbitrary data stored");
		} catch (err) {
			logger.error({ err, userId, key }, "Failed to store arbitrary data");
			throw err;
		}
	}

	/**
	 * Retrieve arbitrary data for a user by key
	 * @param userId - The user ID
	 * @param key - The storage key
	 * @returns The stored data or null if not found
	 */
	async retrieveArbitraryData(userId: string, key: string): Promise<unknown | null> {
		try {
			const { Database } = await import("$lib/server/database");
			const db = await Database.getInstance();
			const client = db.getClient();
			const userDataCollection = client.db().collection<UserDataDocument>("user_data");

			const doc = await userDataCollection.findOne({ userId, key });
			return doc?.data ?? null;
		} catch (err) {
			logger.warn({ err, userId, key }, "Failed to retrieve arbitrary data");
			return null;
		}
	}

	// ============================================
	// Books Management (Core Interface Parity)
	// ============================================

	/**
	 * List all books uploaded by a user
	 * @param userId - The user ID
	 * @returns Array of book metadata
	 */
	async listBooks(userId: string): Promise<BookListItem[]> {
		try {
			const { Database } = await import("$lib/server/database");
			const db = await Database.getInstance();
			const client = db.getClient();
			const booksCollection = client.db().collection("books");

			const books = await booksCollection.find({ userId }).sort({ uploadTimestamp: -1 }).toArray();

			return books.map((book) => ({
				id: (book._id as { toString(): string }).toString(),
				title: book.title as string,
				uploadedAt: book.uploadTimestamp as Date,
			}));
		} catch (err) {
			logger.warn({ err, userId }, "Failed to list books");
			return [];
		}
	}

	/**
	 * Retrieve relevant chunks from user's books based on a query
	 * Uses the memory search system to find relevant book content
	 * @param userId - The user ID
	 * @param query - The search query
	 * @param limit - Maximum number of chunks to return (default: 5)
	 * @returns Array of matching book chunks
	 */
	async retrieveFromBooks(userId: string, query: string, limit = 5): Promise<BookChunk[]> {
		try {
			// Use the existing search service with books tier filter
			const searchResults = await this.search({
				userId,
				query,
				collections: ["books"],
				limit,
			});

			// Transform search results to BookChunk format
			return searchResults.results.map((result) => {
				// Extract book metadata from the result's citations if available
				const bookCitation = result.citations.find((c) => c.book);
				const bookMeta = bookCitation?.book;

				return {
					chunkId: result.memory_id,
					bookId: bookMeta?.book_id ?? "",
					title: bookMeta?.title ?? "Unknown",
					author: bookMeta?.author ?? null,
					chunkIndex: bookMeta?.chunk_index ?? 0,
					content: result.content,
					score: result.score_summary.final_score,
				};
			});
		} catch (err) {
			logger.warn({ err, userId, query }, "Failed to retrieve from books");
			return [];
		}
	}
}
