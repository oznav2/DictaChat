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
import type { MemoryConfig } from "./memory_config";
import { defaultMemoryConfig } from "./memory_config";
import { logger } from "$lib/server/logger";
import type { PromotionService } from "./learning/PromotionService";

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
		params: GetActionEffectivenessParams,
	): Promise<StatsSnapshot["action_effectiveness"]>;
}

export interface ContextService {
	getColdStartContext(params: GetColdStartContextParams): Promise<GetColdStartContextResult>;
	getContextInsights(params: GetContextInsightsParams): Promise<ContextInsights>;
}

export interface OpsService {
	promoteNow(userId?: string): Promise<void>;
	reindexFromMongo(params: ReindexFromMongoParams): Promise<void>;
	consistencyCheck(params: ConsistencyCheckParams): Promise<void>;
	exportBackup(params: ExportBackupParams): Promise<ExportBackupResult>;
	importBackup(params: ImportBackupParams): Promise<void>;
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
}

export interface ExportBackupParams {
	userId: string;
	includeBooks?: boolean;
}

export interface ExportBackupResult {
	exportedAt: string;
	size_bytes: number;
	payload: unknown;
}

export interface ImportBackupParams {
	userId: string;
	payload: unknown;
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
			promoteNow: async () => {},
			reindexFromMongo: async () => {},
			consistencyCheck: async () => {},
			exportBackup: async () => ({
				exportedAt: new Date().toISOString(),
				size_bytes: 0,
				payload: null,
			}),
			importBackup: async () => {},
			getStats: async (userId: string) => createNoopStatsSnapshot(userId),
		},
	};
}

export class UnifiedMemoryFacade {
	private static instance: UnifiedMemoryFacade | null = null;
	private readonly config: MemoryConfig;
	private readonly services: ResolvedServices;
	private promotionService?: PromotionService;
	private initialized = false;

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
		const noop = createNoopServices();

		this.services = {
			search: { ...noop.search, ...(services.search ?? {}) } as SearchService,
			prefetch: { ...noop.prefetch, ...(services.prefetch ?? {}) } as PrefetchService,
			store: { ...noop.store, ...(services.store ?? {}) } as StoreService,
			outcomes: { ...noop.outcomes, ...(services.outcomes ?? {}) } as OutcomeService,
			actionKg: { ...noop.actionKg, ...(services.actionKg ?? {}) } as ActionKgService,
			context: { ...noop.context, ...(services.context ?? {}) } as ContextService,
			ops: { ...noop.ops, ...(services.ops ?? {}) } as OpsService,
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
		return this.services.search.search(params);
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
		params: GetActionEffectivenessParams,
	): Promise<StatsSnapshot["action_effectiveness"]> {
		return this.services.actionKg.getActionEffectiveness(params);
	}

	async getColdStartContext(
		params: GetColdStartContextParams,
	): Promise<GetColdStartContextResult> {
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

	async promoteNow(userId?: string): Promise<void> {
		return this.services.ops.promoteNow(userId);
	}

	async reindexFromMongo(params: ReindexFromMongoParams): Promise<void> {
		return this.services.ops.reindexFromMongo(params);
	}

	async consistencyCheck(params: ConsistencyCheckParams): Promise<void> {
		return this.services.ops.consistencyCheck(params);
	}

	async removeBook(params: RemoveBookParams): Promise<void> {
		return this.services.store.removeBook(params);
	}

	async exportBackup(params: ExportBackupParams): Promise<ExportBackupResult> {
		return this.services.ops.exportBackup(params);
	}

	async importBackup(params: ImportBackupParams): Promise<void> {
		return this.services.ops.importBackup(params);
	}

	async recordFeedback(params: RecordFeedbackParams): Promise<void> {
		// Record feedback score for a specific memory item
		// This adjusts the memory's score based on user feedback
		const outcome: Outcome = params.score === 1 ? "positive" : params.score === -1 ? "negative" : "neutral";
		await this.services.outcomes.recordOutcome({
			userId: params.userId,
			outcome,
			relatedMemoryIds: [params.memoryId],
		});
	}

	async recordResponseFeedback(params: RecordResponseFeedbackParams): Promise<void> {
		// Record general feedback for a response
		// This is used for analytics and improving memory retrieval
		const outcome: Outcome = params.score === 1 ? "positive" : params.score === -1 ? "negative" : "neutral";
		await this.services.outcomes.recordOutcome({
			userId: params.userId,
			outcome,
			relatedMemoryIds: [],
		});
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

			const books = await booksCollection
				.find({ userId })
				.sort({ uploadTimestamp: -1 })
				.toArray();

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
