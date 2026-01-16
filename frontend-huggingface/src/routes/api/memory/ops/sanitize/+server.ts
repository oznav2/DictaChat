import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
	createReindexService,
	createDictaEmbeddingClient,
	QdrantAdapter,
	MemoryMongoStore,
	getMemoryEnvConfig,
} from "$lib/server/memory";
import { Database } from "$lib/server/database";
import { env } from "$env/dynamic/private";
import { ADMIN_USER_ID } from "$lib/server/constants";
import type { MemoryTier } from "$lib/server/memory/types";

/**
 * API endpoint to sanitize corrupted memory content
 * (removes base64/binary artifacts from text)
 *
 * GET: Check count of corrupted memories
 * POST: Trigger sanitization (supports dry_run mode)
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

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.isAdmin) {
		return json(
			{
				success: false,
				error: "Admin only",
			},
			{ status: 403 }
		);
	}

	const tier = url.searchParams.get("tier") as MemoryTier | null;

	try {
		const reindexService = await createReindexServiceInstance();
		const result = await reindexService.countCorruptedContent(ADMIN_USER_ID, tier ?? undefined);

		return json({
			success: true,
			total: result.total,
			corrupted: result.corrupted,
			percentage: result.total > 0 ? ((result.corrupted / result.total) * 100).toFixed(2) : "0",
			samples: result.samples,
			message:
				result.corrupted > 0
					? `Found ${result.corrupted} corrupted memories out of ${result.total}. POST to this endpoint to sanitize.`
					: "No corrupted memories found.",
		});
	} catch (err) {
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : String(err),
			},
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.isAdmin) {
		return json(
			{
				success: false,
				error: "Admin only",
			},
			{ status: 403 }
		);
	}

	const body = await request.json().catch(() => ({}));
	const tier = body.tier as MemoryTier | undefined;
	const dryRun = body.dry_run === true;

	try {
		const reindexService = await createReindexServiceInstance();

		const result = await reindexService.sanitizeCorruptedContent({
			userId: ADMIN_USER_ID,
			tier,
			dryRun,
		});

		return json({
			success: result.success,
			dryRun,
			totalScanned: result.totalScanned,
			totalCorrupted: result.totalCorrupted,
			totalSanitized: result.totalSanitized,
			totalFailed: result.totalFailed,
			samples: result.corruptedSamples,
			durationMs: result.durationMs,
			message: dryRun
				? `Dry run: Would sanitize ${result.totalCorrupted} corrupted memories.`
				: `Sanitized ${result.totalSanitized} memories. ${result.totalCorrupted - result.totalSanitized} memories marked for reindex.`,
			nextSteps:
				result.totalSanitized > 0
					? [
							"1. Run reindex to re-embed sanitized memories: POST /api/memory/ops/reindex/deferred",
							"2. Check reindex progress: GET /api/memory/ops/reindex/deferred",
						]
					: [],
		});
	} catch (err) {
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : String(err),
			},
			{ status: 500 }
		);
	}
};
