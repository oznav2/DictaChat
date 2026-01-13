import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createReindexService, createDictaEmbeddingClient, QdrantAdapter, MemoryMongoStore, getMemoryEnvConfig } from "$lib/server/memory";
import { Database } from "$lib/server/database";
import { env } from "$env/dynamic/private";

/**
 * API endpoint to reindex memories that were stored without embeddings
 * (when the embedding service was unavailable)
 * 
 * GET: Check count of memories pending reindex
 * POST: Trigger reindex of pending memories
 */

async function createReindexServiceInstance() {
	const envConfig = getMemoryEnvConfig();
	const db = await Database.getInstance();
	const client = db.getClient();
	
	const mongoStore = new MemoryMongoStore({
		client,
		dbName: "chat-ui",
	});
	await mongoStore.initialize();

	const qdrantAdapter = new QdrantAdapter({
		host: envConfig.qdrantHost,
		port: envConfig.qdrantPort,
		https: envConfig.qdrantHttps,
	});
	await qdrantAdapter.initialize();

	const embeddingClient = createDictaEmbeddingClient({
		endpoint: env.EMBEDDING_SERVICE_URL || "http://dicta-retrieval:5005",
	});

	return createReindexService({
		mongoStore,
		qdrantAdapter,
		embeddingClient,
	});
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const userId = url.searchParams.get("userId") || undefined;
	
	try {
		const reindexService = await createReindexServiceInstance();
		const pendingCount = await reindexService.countPendingReindex(userId);
		
		return json({
			success: true,
			pendingReindex: pendingCount,
			message: pendingCount > 0 
				? `${pendingCount} memories are pending reindex. POST to this endpoint to trigger reindex.`
				: "No memories pending reindex.",
		});
	} catch (err) {
		return json({
			success: false,
			error: err instanceof Error ? err.message : String(err),
		}, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => ({}));
	const userId = body.userId as string | undefined;

	try {
		const reindexService = await createReindexServiceInstance();
		
		// First check embedding service health
		const embeddingClient = createDictaEmbeddingClient({
			endpoint: env.EMBEDDING_SERVICE_URL || "http://dicta-retrieval:5005",
		});
		
		const isHealthy = await embeddingClient.healthCheck();
		if (!isHealthy) {
			return json({
				success: false,
				error: "Embedding service is not available. Please ensure the dicta-retrieval container is healthy before reindexing.",
				recoverySteps: [
					"1. Check embedding service health: GET /api/memory/ops/circuit-breaker",
					"2. If circuit breaker is open, restart dicta-retrieval: docker-compose restart dicta-retrieval",
					"3. Wait 30 seconds for GPU model to load",
					"4. Reset circuit breaker: POST /api/memory/ops/circuit-breaker with {\"action\":\"reset\"}",
					"5. Retry this reindex operation"
				]
			}, { status: 503 });
		}

		// Trigger reindex
		const result = await reindexService.reindexDeferred(userId);
		
		return json({
			success: result.success,
			result,
			message: result.success
				? `Reindex completed: ${result.totalProcessed} processed, ${result.totalFailed} failed.`
				: `Reindex failed: ${result.errorMessage}`,
		});
	} catch (err) {
		return json({
			success: false,
			error: err instanceof Error ? err.message : String(err),
		}, { status: 500 });
	}
};
