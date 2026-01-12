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

		const items = db.collection(MEMORY_COLLECTIONS.ITEMS);

		const docs = await items
			.find({ user_id: ADMIN_USER_ID, tier: "patterns", status: "active" })
			.sort({ "stats.wilson_score": -1, "stats.uses": -1, updated_at: -1 })
			.limit(50)
			.toArray();

		const patterns = docs.map((doc: any) => ({
			memory_id: String(doc.memory_id),
			summary: doc.summary ? String(doc.summary) : null,
			text_preview: typeof doc.text === "string" ? doc.text.slice(0, 220) : "",
			uses: Number(doc.stats?.uses ?? 0),
			success_rate: Number(doc.stats?.success_rate ?? 0.5),
			wilson_score: Number(doc.stats?.wilson_score ?? 0.5),
			worked: Number(doc.stats?.worked_count ?? 0),
			failed: Number(doc.stats?.failed_count ?? 0),
			partial: Number(doc.stats?.partial_count ?? 0),
			unknown: Number(doc.stats?.unknown_count ?? 0),
			updated_at: doc.updated_at ? new Date(doc.updated_at).toISOString() : null,
		}));

		return json({
			success: true,
			patterns,
			meta: {
				count: patterns.length,
				built_ms: Date.now() - startedAt,
			},
		});
	} catch (err) {
		console.error("[API] Failed to get pattern performance:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to get pattern performance",
				meta: { built_ms: Date.now() - startedAt },
			},
			{ status: 500 }
		);
	}
};
