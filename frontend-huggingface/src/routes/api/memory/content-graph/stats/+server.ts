import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { MEMORY_COLLECTIONS } from "$lib/server/memory";

export const GET: RequestHandler = async () => {
	const startedAt = Date.now();

	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		const nodesCol = db.collection(MEMORY_COLLECTIONS.KG_NODES);
		const edgesCol = db.collection(MEMORY_COLLECTIONS.KG_EDGES);

		const [nodeCount, edgeCount, newestNode, newestEdge] = await Promise.all([
			nodesCol.countDocuments({ user_id: ADMIN_USER_ID }),
			edgesCol.countDocuments({ user_id: ADMIN_USER_ID }),
			nodesCol.find({ user_id: ADMIN_USER_ID }).sort({ last_seen_at: -1 }).limit(1).toArray(),
			edgesCol.find({ user_id: ADMIN_USER_ID }).sort({ last_seen_at: -1 }).limit(1).toArray(),
		]);

		const lastUpdated = (() => {
			const nodeTs = newestNode[0]?.last_seen_at
				? new Date(newestNode[0].last_seen_at).getTime()
				: 0;
			const edgeTs = newestEdge[0]?.last_seen_at
				? new Date(newestEdge[0].last_seen_at).getTime()
				: 0;
			const ts = Math.max(nodeTs, edgeTs);
			return ts > 0 ? new Date(ts).toISOString() : null;
		})();

		return json({
			success: true,
			stats: {
				nodes: nodeCount,
				edges: edgeCount,
				last_updated_at: lastUpdated,
			},
			meta: { built_ms: Date.now() - startedAt },
		});
	} catch (err) {
		console.error("[API] Failed to get content graph stats:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to get content graph stats",
				meta: { built_ms: Date.now() - startedAt },
			},
			{ status: 500 }
		);
	}
};
