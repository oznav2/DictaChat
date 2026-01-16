/**
 * Memory System Diagnostics Endpoint
 *
 * Phase 5: Fix "0 Memories Found" Issue
 * Phase 21: Memory System Observability (Task 21.4)
 *
 * Provides comprehensive diagnostics for debugging memory search issues:
 * - Collection counts (MongoDB items vs Qdrant points)
 * - Circuit breaker states for all components
 * - Items needing reindex
 * - Auto-reindex trigger capability
 * - Deferred indexing queue size (Phase 21.4.5)
 * - Embedding dimension config (Phase 21.4.6)
 * - Operation metrics snapshot (Phase 21)
 *
 * Risk Mitigation:
 * - All checks use timeouts to prevent hanging
 * - Graceful degradation if any component is unavailable
 * - Does not modify data (read-only diagnostic)
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Database } from "$lib/server/database";
import { logger } from "$lib/server/logger";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { createDictaEmbeddingClient, memoryMetrics } from "$lib/server/memory";
import { QdrantAdapter } from "$lib/server/memory/adapters/QdrantAdapter";
import { env } from "$env/dynamic/private";
import type { MemoryTier } from "$lib/server/memory/types";
import type { MetricsSnapshot } from "$lib/server/memory/observability";

// ============================================
// Types
// ============================================

interface TierCount {
	tier: MemoryTier;
	mongoCount: number;
	qdrantCount: number;
	needsReindexCount: number;
}

interface DiagnosticsResult {
	success: boolean;
	timestamp: string;

	// Collection counts
	memory_items_total: number;
	qdrant_points_total: number;
	by_tier: TierCount[];

	// Reindex status
	needs_reindex_total: number;
	needs_reindex_sample: Array<{ memory_id: string; tier: string; created_at: string }>;

	// Circuit breaker status
	circuit_breakers: {
		embedding: { open: boolean; healthy: boolean; degradedMode: boolean };
		qdrant: { open: boolean; healthy: boolean; pointCount: number };
		bm25: { open: boolean };
	};

	// Phase 21: Deferred indexing queue (21.4.5)
	deferred_indexing: {
		queue_size: number;
		processing: number;
	};

	// Phase 21: Embedding config (21.4.6)
	embedding_config: {
		dimension: number;
		model: string;
	};

	// Health recommendations
	health_issues: string[];
	recommendations: string[];

	// Timing
	diagnostics_ms: number;

	// Phase 21: Metrics snapshot (optional)
	metrics?: MetricsSnapshot;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get MongoDB collection counts with timeout
 */
async function getMongoStats(userId: string): Promise<{
	total: number;
	byTier: Map<MemoryTier, number>;
	needsReindex: number;
	needsReindexSample: Array<{ memory_id: string; tier: string; created_at: string }>;
}> {
	const tiers: MemoryTier[] = [
		"working",
		"history",
		"patterns",
		"books",
		"memory_bank",
		"datagov_schema",
		"datagov_expansion",
	];
	const byTier = new Map<MemoryTier, number>();

	const db = await Database.getInstance();
	const client = db.getClient();
	const items = client.db().collection("memory_items");

	// Get counts by tier
	for (const tier of tiers) {
		const count = await items
			.countDocuments({ user_id: userId, tier, status: "active" }, { maxTimeMS: 3000 })
			.catch(() => 0);
		byTier.set(tier, count);
	}

	// Get total
	const total = await items
		.countDocuments({ user_id: userId, status: "active" }, { maxTimeMS: 3000 })
		.catch(() => 0);

	// Get items needing reindex (no embedding or embedding not indexed)
	const needsReindex = await items
		.countDocuments(
			{
				user_id: userId,
				status: "active",
				$or: [{ embedding: null }, { "embedding.last_indexed_at": null }],
			},
			{ maxTimeMS: 3000 }
		)
		.catch(() => 0);

	// Get sample of items needing reindex for debugging
	const needsReindexSample = await items
		.find(
			{
				user_id: userId,
				status: "active",
				$or: [{ embedding: null }, { "embedding.last_indexed_at": null }],
			},
			{
				projection: { memory_id: 1, tier: 1, created_at: 1 },
				limit: 5,
			}
		)
		.toArray()
		.catch(() => []);

	return {
		total,
		byTier,
		needsReindex,
		needsReindexSample: needsReindexSample.map(
			(doc: { memory_id?: string; tier?: string; created_at?: Date }) => ({
				memory_id: doc.memory_id ?? "unknown",
				tier: doc.tier ?? "unknown",
				created_at: doc.created_at ? doc.created_at.toISOString() : "unknown",
			})
		),
	};
}

/**
 * Get Qdrant collection counts with timeout
 */
async function getQdrantStats(userId: string): Promise<{
	total: number;
	byTier: Map<MemoryTier, number>;
	healthy: boolean;
	circuitOpen: boolean;
}> {
	const tiers: MemoryTier[] = ["working", "history", "patterns", "books", "memory_bank"];
	const byTier = new Map<MemoryTier, number>();

	try {
		const qdrantHost = env.QDRANT_HOST || "bricksllm-qdrant";
		const qdrantPort = parseInt(env.QDRANT_PORT || "6333", 10);

		const qdrant = new QdrantAdapter({
			host: qdrantHost,
			port: qdrantPort,
		});

		// Get health status
		const health = await qdrant.getHealth();

		if (!health.healthy) {
			return {
				total: 0,
				byTier,
				healthy: false,
				circuitOpen: qdrant.isCircuitOpen(),
			};
		}

		// Get counts by tier
		for (const tier of tiers) {
			const count = await qdrant.count(userId, tier);
			byTier.set(tier, count);
		}

		// Get total
		const total = await qdrant.count(userId);

		return {
			total,
			byTier,
			healthy: true,
			circuitOpen: qdrant.isCircuitOpen(),
		};
	} catch (err) {
		logger.warn({ err }, "[diagnostics] Failed to get Qdrant stats");
		return {
			total: 0,
			byTier,
			healthy: false,
			circuitOpen: true,
		};
	}
}

/**
 * Get embedding service status
 */
async function getEmbeddingStatus(): Promise<{
	healthy: boolean;
	circuitOpen: boolean;
	degradedMode: boolean;
}> {
	try {
		const client = createDictaEmbeddingClient({
			endpoint: env.EMBEDDING_SERVICE_URL || "http://dicta-retrieval:5005",
			enableGracefulDegradation: true,
		});

		const status = client.getCircuitBreakerStatus();
		const isHealthy = await client.healthCheck().catch(() => false);

		// Check for degraded mode
		const isDegradedMode =
			(client as unknown as { isDegradedMode?: () => boolean })?.isDegradedMode?.() ?? false;

		return {
			healthy: isHealthy,
			circuitOpen: status.isOpen,
			degradedMode: isDegradedMode,
		};
	} catch (err) {
		logger.warn({ err }, "[diagnostics] Failed to get embedding status");
		return {
			healthy: false,
			circuitOpen: true,
			degradedMode: false,
		};
	}
}

/**
 * Analyze diagnostics and generate recommendations
 */
function analyzeHealth(
	mongoStats: Awaited<ReturnType<typeof getMongoStats>>,
	qdrantStats: Awaited<ReturnType<typeof getQdrantStats>>,
	embeddingStatus: Awaited<ReturnType<typeof getEmbeddingStatus>>
): { issues: string[]; recommendations: string[] } {
	const issues: string[] = [];
	const recommendations: string[] = [];

	// Check for MongoDB-Qdrant sync issues
	const countDiff = mongoStats.total - qdrantStats.total;
	if (countDiff > 0) {
		issues.push(`${countDiff} items in MongoDB are not indexed in Qdrant`);
		recommendations.push("Run POST /api/memory/ops/reindex/deferred to reindex missing items");
	}

	// Check for items needing reindex
	if (mongoStats.needsReindex > 0) {
		issues.push(`${mongoStats.needsReindex} items need embedding/reindexing`);
		recommendations.push("Trigger reindex via POST /api/memory/ops/reindex/deferred");
	}

	// Check embedding service
	if (!embeddingStatus.healthy) {
		issues.push("Embedding service is not healthy");
		if (embeddingStatus.circuitOpen) {
			recommendations.push("Circuit breaker is open - check dicta-retrieval container");
			recommendations.push('Reset via POST /api/memory/ops/circuit-breaker {"action":"reset"}');
		}
	}

	if (embeddingStatus.degradedMode) {
		issues.push("Embedding service is in degraded mode (fallback embeddings)");
		recommendations.push("Semantic search quality is reduced - investigate embedding service");
	}

	// Check Qdrant
	if (!qdrantStats.healthy) {
		issues.push("Qdrant vector database is not healthy");
		recommendations.push("Check Qdrant container: docker logs bricksllm-qdrant");
	}

	if (qdrantStats.circuitOpen) {
		issues.push("Qdrant circuit breaker is open");
		recommendations.push("Vector search is disabled - check Qdrant connectivity");
	}

	// If no issues, indicate healthy
	if (issues.length === 0) {
		recommendations.push("Memory system is healthy - all components operational");
	}

	return { issues, recommendations };
}

// ============================================
// Route Handler
// ============================================

export const GET: RequestHandler = async ({ url, locals }) => {
	const startTime = Date.now();
	const includeMetrics = url.searchParams.get("metrics") === "true";

	try {
		if (!locals.isAdmin) {
			return json(
				{
					success: false,
					error: "Admin only",
				},
				{ status: 403 }
			);
		}

		const userId = ADMIN_USER_ID;
		const tiers: MemoryTier[] = ["working", "history", "patterns", "books", "memory_bank"];

		// Gather stats in parallel
		const [mongoStats, qdrantStats, embeddingStatus] = await Promise.all([
			getMongoStats(userId),
			getQdrantStats(userId),
			getEmbeddingStatus(),
		]);

		// Build tier breakdown
		const byTier: TierCount[] = tiers.map((tier) => ({
			tier,
			mongoCount: mongoStats.byTier.get(tier) ?? 0,
			qdrantCount: qdrantStats.byTier.get(tier) ?? 0,
			needsReindexCount: 0, // Would need separate query per tier
		}));

		// Analyze health and generate recommendations
		const { issues, recommendations } = analyzeHealth(mongoStats, qdrantStats, embeddingStatus);

		const diagnosticsMs = Date.now() - startTime;

		// Phase 21: Get embedding config from env
		const embeddingDimension = parseInt(env.EMBEDDING_DIMENSION || "1024", 10);
		const embeddingModel = env.EMBEDDING_MODEL || "dicta-il/dictalm2.0-instruct";

		const result: DiagnosticsResult = {
			success: true,
			timestamp: new Date().toISOString(),

			// Collection counts
			memory_items_total: mongoStats.total,
			qdrant_points_total: qdrantStats.total,
			by_tier: byTier,

			// Reindex status
			needs_reindex_total: mongoStats.needsReindex,
			needs_reindex_sample: mongoStats.needsReindexSample,

			// Circuit breaker status
			circuit_breakers: {
				embedding: {
					open: embeddingStatus.circuitOpen,
					healthy: embeddingStatus.healthy,
					degradedMode: embeddingStatus.degradedMode,
				},
				qdrant: {
					open: qdrantStats.circuitOpen,
					healthy: qdrantStats.healthy,
					pointCount: qdrantStats.total,
				},
				bm25: {
					open: false, // BM25 uses MongoDB, no separate circuit breaker exposed here
				},
			},

			// Phase 21: Deferred indexing queue (21.4.5)
			deferred_indexing: {
				queue_size: mongoStats.needsReindex, // Items awaiting reindex are effectively the queue
				processing: 0, // Would need integration with actual reindex service
			},

			// Phase 21: Embedding config (21.4.6)
			embedding_config: {
				dimension: embeddingDimension,
				model: embeddingModel,
			},

			// Health
			health_issues: issues,
			recommendations,

			// Timing
			diagnostics_ms: diagnosticsMs,
		};

		// Phase 21: Include metrics snapshot if requested
		if (includeMetrics) {
			result.metrics = memoryMetrics.getSnapshot();
		}

		logger.info(
			{ diagnosticsMs, issues: issues.length },
			"[diagnostics] Memory system check complete"
		);

		return json(result);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error({ err }, "[diagnostics] Failed to gather diagnostics");

		return json(
			{
				success: false,
				error: errorMessage,
				timestamp: new Date().toISOString(),
				diagnostics_ms: Date.now() - startTime,
			},
			{ status: 500 }
		);
	}
};
