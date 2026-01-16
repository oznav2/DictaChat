/**
 * Memory System Health Check Endpoint
 *
 * Phase 21: Memory System Observability (Task 21.3)
 *
 * Provides:
 * - Quick health status for all memory system components
 * - Component-level health checks (MongoDB, Qdrant, Embedding)
 * - Aggregated health status for container health checks
 * - Metrics snapshot for observability
 *
 * Risk Mitigation:
 * - All checks use timeouts to prevent hanging
 * - Graceful degradation if any component unavailable
 * - Returns partial health even if some checks fail
 *
 * Usage:
 * - GET /api/memory/health - Quick health check (suitable for k8s probes)
 * - GET /api/memory/health?full=true - Full health with metrics
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Database } from "$lib/server/database";
import { logger } from "$lib/server/logger";
import { createDictaEmbeddingClient } from "$lib/server/memory";
import { QdrantAdapter } from "$lib/server/memory/adapters/QdrantAdapter";
import { memoryMetrics } from "$lib/server/memory/observability";
import { env } from "$env/dynamic/private";

// ============================================
// Types
// ============================================

export interface ComponentHealth {
	name: string;
	healthy: boolean;
	latencyMs: number;
	message?: string;
	details?: Record<string, unknown>;
}

export interface HealthCheckResult {
	status: "healthy" | "degraded" | "unhealthy";
	timestamp: string;
	components: ComponentHealth[];
	summary: {
		total: number;
		healthy: number;
		unhealthy: number;
	};
	metrics?: ReturnType<typeof memoryMetrics.getSnapshot>;
	checkDurationMs: number;
}

// ============================================
// Health Check Functions
// ============================================

const HEALTH_TIMEOUT_MS = 3000;

/**
 * Check MongoDB connectivity
 */
async function checkMongoDB(): Promise<ComponentHealth> {
	const start = Date.now();
	try {
		const db = await Database.getInstance();
		const client = db.getClient();
		const items = client.db().collection("memory_items");
		await items.estimatedDocumentCount({ maxTimeMS: HEALTH_TIMEOUT_MS });
		return {
			name: "mongodb",
			healthy: true,
			latencyMs: Date.now() - start,
			message: "Connected",
		};
	} catch (err) {
		return {
			name: "mongodb",
			healthy: false,
			latencyMs: Date.now() - start,
			message: err instanceof Error ? err.message : "Connection failed",
		};
	}
}

/**
 * Check Qdrant connectivity
 */
async function checkQdrant(): Promise<ComponentHealth> {
	const start = Date.now();
	try {
		const qdrantHost = env.QDRANT_HOST || "bricksllm-qdrant";
		const qdrantPort = parseInt(env.QDRANT_PORT || "6333", 10);

		const qdrant = new QdrantAdapter({
			host: qdrantHost,
			port: qdrantPort,
		});

		const health = await qdrant.getHealth();
		const isCircuitOpen = qdrant.isCircuitOpen();

		return {
			name: "qdrant",
			healthy: health.healthy && !isCircuitOpen,
			latencyMs: Date.now() - start,
			message: isCircuitOpen ? "Circuit breaker open" : health.healthy ? "Connected" : "Unhealthy",
			details: {
				circuitOpen: isCircuitOpen,
			},
		};
	} catch (err) {
		return {
			name: "qdrant",
			healthy: false,
			latencyMs: Date.now() - start,
			message: err instanceof Error ? err.message : "Connection failed",
		};
	}
}

/**
 * Check embedding service connectivity
 */
async function checkEmbedding(): Promise<ComponentHealth> {
	const start = Date.now();
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
			name: "embedding",
			healthy: isHealthy && !status.isOpen,
			latencyMs: Date.now() - start,
			message: status.isOpen
				? "Circuit breaker open"
				: isDegradedMode
					? "Degraded mode"
					: isHealthy
						? "Connected"
						: "Unhealthy",
			details: {
				circuitOpen: status.isOpen,
				degradedMode: isDegradedMode,
			},
		};
	} catch (err) {
		return {
			name: "embedding",
			healthy: false,
			latencyMs: Date.now() - start,
			message: err instanceof Error ? err.message : "Connection failed",
		};
	}
}

/**
 * Check reranking service connectivity
 */
async function checkReranking(): Promise<ComponentHealth> {
	const start = Date.now();
	try {
		// Reranking is optional - check if configured
		const rerankUrl = env.RERANKER_URL || env.EMBEDDING_SERVICE_URL;
		if (!rerankUrl) {
			return {
				name: "reranking",
				healthy: true,
				latencyMs: Date.now() - start,
				message: "Not configured (optional)",
			};
		}

		// Simple HTTP check
		const response = await fetch(`${rerankUrl}/health`, {
			method: "GET",
			signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
		}).catch(() => null);

		return {
			name: "reranking",
			healthy: response?.ok ?? false,
			latencyMs: Date.now() - start,
			message: response?.ok ? "Connected" : "Unavailable",
		};
	} catch (err) {
		return {
			name: "reranking",
			healthy: false,
			latencyMs: Date.now() - start,
			message: err instanceof Error ? err.message : "Check failed",
		};
	}
}

// ============================================
// Route Handler
// ============================================

export const GET: RequestHandler = async ({ url }) => {
	const startTime = Date.now();
	const includeFull = url.searchParams.get("full") === "true";

	try {
		// Run all health checks in parallel with timeout
		const checkPromises = [checkMongoDB(), checkQdrant(), checkEmbedding(), checkReranking()];

		const components = await Promise.all(
			checkPromises.map((p) =>
				Promise.race([
					p,
					new Promise<ComponentHealth>((resolve) =>
						setTimeout(
							() =>
								resolve({
									name: "unknown",
									healthy: false,
									latencyMs: HEALTH_TIMEOUT_MS,
									message: "Timeout",
								}),
							HEALTH_TIMEOUT_MS
						)
					),
				])
			)
		);

		// Calculate summary
		const healthy = components.filter((c) => c.healthy).length;
		const unhealthy = components.length - healthy;

		// Determine overall status
		let status: "healthy" | "degraded" | "unhealthy";
		if (healthy === components.length) {
			status = "healthy";
		} else if (healthy > 0) {
			status = "degraded";
		} else {
			status = "unhealthy";
		}

		const result: HealthCheckResult = {
			status,
			timestamp: new Date().toISOString(),
			components,
			summary: {
				total: components.length,
				healthy,
				unhealthy,
			},
			checkDurationMs: Date.now() - startTime,
		};

		// Include metrics if requested
		if (includeFull) {
			result.metrics = memoryMetrics.getSnapshot();
		}

		logger.debug(
			{ status, healthy, unhealthy, durationMs: result.checkDurationMs },
			"[memory/health] Health check completed"
		);

		// Return appropriate status code
		const httpStatus = status === "healthy" ? 200 : status === "degraded" ? 200 : 503;

		return json(result, { status: httpStatus });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error({ err }, "[memory/health] Health check failed");

		return json(
			{
				status: "unhealthy",
				timestamp: new Date().toISOString(),
				components: [
					{
						name: "memory_system",
						healthy: false,
						latencyMs: Date.now() - startTime,
						message: errorMessage,
					},
				],
				summary: { total: 1, healthy: 0, unhealthy: 1 },
				checkDurationMs: Date.now() - startTime,
			} as HealthCheckResult,
			{ status: 503 }
		);
	}
};
