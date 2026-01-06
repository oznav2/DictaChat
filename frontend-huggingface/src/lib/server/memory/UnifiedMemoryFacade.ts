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
	private readonly config: MemoryConfig;
	private readonly services: ResolvedServices;

	constructor({
		config = defaultMemoryConfig,
		services = {},
	}: {
		config?: MemoryConfig;
		services?: UnifiedMemoryFacadeServices;
	} = {}) {
		this.config = config;
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
}
