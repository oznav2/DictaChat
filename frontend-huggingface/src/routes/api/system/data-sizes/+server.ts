import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { MEMORY_COLLECTIONS, getMemoryEnvConfig } from "$lib/server/memory";

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export const GET: RequestHandler = async () => {
	const startedAt = Date.now();

	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		const collectionNames = [
			MEMORY_COLLECTIONS.ITEMS,
			MEMORY_COLLECTIONS.OUTCOMES,
			MEMORY_COLLECTIONS.ACTION_OUTCOMES,
			MEMORY_COLLECTIONS.KNOWN_SOLUTIONS,
			"books",
			MEMORY_COLLECTIONS.KG_NODES,
			MEMORY_COLLECTIONS.KG_EDGES,
			"kg_action_effectiveness",
			"kg_context_action_effectiveness",
		];

		const mongo = await Promise.all(
			collectionNames.map(async (name) => {
				try {
					const stats = await db.command({ collStats: name });
					return {
						name,
						count: Number(stats.count ?? 0),
						size_bytes: Number(stats.size ?? 0),
						storage_bytes: Number(stats.storageSize ?? 0),
					};
				} catch {
					const count = await db
						.collection(name)
						.estimatedDocumentCount()
						.catch(() => 0);
					return { name, count: Number(count), size_bytes: null, storage_bytes: null };
				}
			})
		);

		const envConfig = getMemoryEnvConfig();
		const qdrantBase = `${envConfig.qdrantHttps ? "https" : "http"}://${envConfig.qdrantHost}:${envConfig.qdrantPort}`;
		const qdrantStats = await fetchJsonWithTimeout(
			`${qdrantBase}/collections/${encodeURIComponent(envConfig.qdrantCollection)}`,
			1200
		);

		const qdrant = qdrantStats
			? {
					collection: envConfig.qdrantCollection,
					points_count: Number(qdrantStats?.result?.points_count ?? 0),
					vectors_count: Number(qdrantStats?.result?.vectors_count ?? 0),
					segments_count: Number(qdrantStats?.result?.segments_count ?? 0),
				}
			: null;

		return json({
			success: true,
			mongo,
			qdrant,
			meta: { built_ms: Date.now() - startedAt },
		});
	} catch (err) {
		console.error("[API] Failed to get data sizes:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to get data sizes",
				meta: { built_ms: Date.now() - startedAt },
			},
			{ status: 500 }
		);
	}
};
