/**
 * Memory System Feature Flags
 *
 * Reads from environment variables and provides type-safe access to feature flags.
 * Supports gradual rollout and safe defaults.
 */

import { env } from "$env/dynamic/private";
import { MetricsServer } from "$lib/server/metrics";

export interface MemoryFeatureFlags {
	// Master switches
	systemEnabled: boolean;
	uiEnabled: boolean;
	kgVizEnabled: boolean;

	// Component flags (gradual rollout)
	qdrantEnabled: boolean;
	bm25Enabled: boolean;
	rerankEnabled: boolean;
	outcomeEnabled: boolean;
	promotionEnabled: boolean;

	// Advanced flags (Roampal compat)
	enableKg: boolean;
	enableAutonomy: boolean;
	enableOutcomeDetection: boolean;
	enableProblemSolutionIndex: boolean;
	requireConfirmation: boolean;

	// Emergency feature flags (runtime kill switches)
	memoryConsolidationEnabled: boolean;
	toolResultIngestionEnabled: boolean;
	toolResultEnhancedIngestionEnabled: boolean;
	memoryFirstLogicEnabled: boolean;

	// Experimental features
	/** Enable contextual embedding with LLM-generated prefixes for improved retrieval */
	contextualEmbeddingEnabled: boolean;

	// Finding 13: Full attribution mode for comprehensive memory scoring
	/** Enable full attribution mode with inference fallback and scoring matrix */
	fullAttributionEnabled: boolean;
}

export interface MemoryEnvConfig {
	// Storage
	dataDir: string;

	// Qdrant
	qdrantHost: string;
	qdrantPort: number;
	qdrantHttps: boolean;
	qdrantCollection: string;
	qdrantVectorSize: number;

	// Scoring
	initialScore: number;
	positiveBoost: number;
	negativePenalty: number;
	partialBoost: number;
	topK: number;

	// Search
	searchLimit: number;
	searchMinScore: number;
	prefetchTimeoutMs: number;
	searchTimeoutMs: number;

	// Safety
	logLevel: string;
	requireAuth: boolean;

	// LLM for outcome detection
	llmBaseUrl: string;
	llmModel: string;

	// Personality
	personalityTemplatesDir: string;
	personalityDefaultTemplate: string;
	personalityActiveTemplate: string;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
	if (value === undefined || value === "") return defaultValue;
	return value.toLowerCase() === "true" || value === "1";
}

function parseNumber(value: string | undefined, defaultValue: number): number {
	if (value === undefined || value === "") return defaultValue;
	const parsed = parseFloat(value);
	return isNaN(parsed) ? defaultValue : parsed;
}

function parseString(value: string | undefined, defaultValue: string): string {
	return value ?? defaultValue;
}

/**
 * Get current feature flags from environment
 */
export function getMemoryFeatureFlags(): MemoryFeatureFlags {
	return {
		// Master switches
		systemEnabled: parseBoolean(env.MEMORY_SYSTEM_ENABLED, false),
		uiEnabled: parseBoolean(env.MEMORY_UI_ENABLED, false),
		kgVizEnabled: parseBoolean(env.MEMORY_KG_VIZ_ENABLED, false),

		// Component flags
		qdrantEnabled: parseBoolean(env.MEMORY_QDRANT_ENABLED, true),
		bm25Enabled: parseBoolean(env.MEMORY_BM25_ENABLED, true),
		// Option C: Enable reranking by default for better document vs conversation ranking
		// The cross-encoder helps distinguish actual document content from conversation snippets
		// Note: If dicta-retrieval crashes with batch size issues, set MEMORY_RERANK_ENABLED=false
		rerankEnabled: parseBoolean(env.MEMORY_RERANK_ENABLED, true),
		outcomeEnabled: parseBoolean(env.MEMORY_OUTCOME_ENABLED, true),
		promotionEnabled: parseBoolean(env.MEMORY_PROMOTION_ENABLED, true),

		// Advanced flags
		enableKg: parseBoolean(env.MEMORY_ENABLE_KG, true),
		enableAutonomy: parseBoolean(env.MEMORY_ENABLE_AUTONOMY, false),
		enableOutcomeDetection: parseBoolean(env.MEMORY_ENABLE_OUTCOME_DETECTION, true),
		enableProblemSolutionIndex: parseBoolean(env.MEMORY_ENABLE_PROBLEM_SOLUTION_INDEX, true),
		requireConfirmation: parseBoolean(env.MEMORY_REQUIRE_CONFIRMATION, true),

		memoryConsolidationEnabled: parseBoolean(env.MEMORY_CONSOLIDATION_ENABLED, true),
		toolResultIngestionEnabled: parseBoolean(env.TOOL_RESULT_INGESTION_ENABLED, true),
		toolResultEnhancedIngestionEnabled: parseBoolean(env.TOOL_RESULT_ENHANCED_INGESTION_ENABLED, true),
		memoryFirstLogicEnabled: parseBoolean(env.MEMORY_FIRST_LOGIC_ENABLED, true),

		// Experimental features (default: off)
		contextualEmbeddingEnabled: parseBoolean(env.CONTEXTUAL_EMBEDDING_ENABLED, false),

		// Finding 13: Full attribution mode (default: off, enable for comprehensive scoring)
		fullAttributionEnabled: parseBoolean(env.MEMORY_FULL_ATTRIBUTION_ENABLED, false),
	};
}

/**
 * Get memory system configuration from environment
 */
export function getMemoryEnvConfig(): MemoryEnvConfig {
	return {
		// Storage
		dataDir: parseString(env.MEMORY_DATA_DIR, "./data/memory"),

		// Qdrant
		qdrantHost: parseString(env.QDRANT_HOST, "qdrant"),
		qdrantPort: parseNumber(env.QDRANT_PORT, 6333),
		qdrantHttps: parseBoolean(env.QDRANT_HTTPS, false),
		qdrantCollection: parseString(env.QDRANT_COLLECTION, "memories_v1"),
		// BGE-M3 produces 1024-dim vectors - must match DictaEmbeddingClient default
		qdrantVectorSize: parseNumber(env.QDRANT_VECTOR_SIZE, 1024),

		// Scoring
		initialScore: parseNumber(env.MEMORY_INITIAL_SCORE, 0.5),
		positiveBoost: parseNumber(env.MEMORY_POSITIVE_BOOST, 0.2),
		negativePenalty: parseNumber(env.MEMORY_NEGATIVE_PENALTY, 0.3),
		partialBoost: parseNumber(env.MEMORY_PARTIAL_BOOST, 0.05),
		topK: parseNumber(env.MEMORY_TOP_K, 10),

		// Search
		searchLimit: parseNumber(env.MEMORY_SEARCH_LIMIT, 20),
		searchMinScore: parseNumber(env.MEMORY_SEARCH_MIN_SCORE, 0.0),
		// Phase 1.2: Reduced from 6000ms to 800ms to cap TTFT impact
		// Memory prefetch should be fast; if it exceeds this, proceed without memory
		prefetchTimeoutMs: parseNumber(env.MEMORY_PREFETCH_TIMEOUT_MS, 800),
		searchTimeoutMs: parseNumber(env.MEMORY_SEARCH_TIMEOUT_MS, 15000),

		// Safety
		logLevel: parseString(env.MEMORY_LOG_LEVEL, "INFO"),
		requireAuth: parseBoolean(env.MEMORY_REQUIRE_AUTH, true),

		// LLM
		llmBaseUrl: parseString(env.MEMORY_LLM_BASE_URL, "http://bricksllm:8002/v1"),
		llmModel: parseString(env.MEMORY_LLM_MODEL, "dictalm-3.0"),

		// Personality
		personalityTemplatesDir: parseString(
			env.PERSONALITY_TEMPLATES_DIR,
			"/app/templates/personality"
		),
		personalityDefaultTemplate: parseString(env.PERSONALITY_DEFAULT_TEMPLATE, "default.txt"),
		personalityActiveTemplate: parseString(env.PERSONALITY_ACTIVE_TEMPLATE, "active.txt"),
	};
}

/**
 * Validate feature flag configuration for dangerous combinations
 * Returns array of error messages, empty if valid
 */
export function validateFeatureFlags(flags: MemoryFeatureFlags): string[] {
	const errors: string[] = [];

	// Dangerous combination: autonomy without confirmation
	if (flags.enableAutonomy && !flags.requireConfirmation) {
		errors.push("DANGEROUS: MEMORY_ENABLE_AUTONOMY=true requires MEMORY_REQUIRE_CONFIRMATION=true");
	}

	// If system is disabled, other flags don't matter but warn if they're set
	if (!flags.systemEnabled) {
		if (flags.uiEnabled) {
			errors.push("WARNING: MEMORY_UI_ENABLED=true has no effect when MEMORY_SYSTEM_ENABLED=false");
		}
	}

	return errors;
}

/**
 * Check if memory system is operational
 * Phase 2.3: Enhanced to check circuit breaker status for faster skip
 */
export function isMemorySystemOperational(): boolean {
	const flags = getMemoryFeatureFlags();
	if (!flags.systemEnabled) {
		return false;
	}

	// Phase 2.3: Check if embedding circuit breaker is open
	// If open, skip memory operations entirely (instant return vs 800ms timeout)
	try {
		const metrics = MetricsServer.getMetrics();
		// Gauge.get() returns { value: number } - circuit breaker open = 1
		const cbMetric = metrics.memory.circuitBreakerOpen;
		type GaugeInternal = { hashMap?: Record<string, { value: number }> };
		const internal = cbMetric as unknown as GaugeInternal;
		const rawValue = internal.hashMap?.[""]?.value;
		if (rawValue === 1) {
			return false;
		}
	} catch {
		// Metrics not available, assume operational
	}

	return true;
}

/**
 * Get a summary of enabled features for logging
 */
export function getFeatureFlagsSummary(): string {
	const flags = getMemoryFeatureFlags();
	const enabled = Object.entries(flags)
		.filter(([, v]) => v === true)
		.map(([k]) => k);
	const disabled = Object.entries(flags)
		.filter(([, v]) => v === false)
		.map(([k]) => k);

	return `Memory Features: enabled=[${enabled.join(", ")}] disabled=[${disabled.join(", ")}]`;
}
