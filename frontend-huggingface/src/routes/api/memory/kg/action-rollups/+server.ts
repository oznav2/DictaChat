import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { ADMIN_USER_ID } from "$lib/server/constants";

type RollupRow = {
	label: string;
	action: string;
	context_type: string;
	tier_key: string;
	uses: number;
	worked: number;
	failed: number;
	partial: number;
	unknown: number;
	success_rate: number;
	wilson_score: number;
	first_used_at: string | null;
	last_used_at: string | null;
};

export const GET: RequestHandler = async ({ url }) => {
	const startedAt = Date.now();
	try {
		const limitRaw = Number(url.searchParams.get("limit") ?? "50");
		const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;
		const contextType = url.searchParams.get("context_type");
		const includeTiers = url.searchParams.get("include_tiers") === "true";

		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		const col = db.collection("kg_context_action_effectiveness");

		const filter: Record<string, unknown> = { user_id: ADMIN_USER_ID };
		if (contextType) filter.context_type = String(contextType);
		if (!includeTiers) filter.tier_key = "*";

		const docs = await col
			.find(filter)
			.sort({ wilson_score: -1, uses: -1 })
			.limit(limit)
			.toArray();

		const rollups: RollupRow[] = docs.map((d: any) => {
			const action = String(d.action ?? "unknown");
			const context_type = String(d.context_type ?? "general");
			const tier_key = String(d.tier_key ?? "*");
			const label =
				tier_key === "*" ? `${action}@${context_type}` : `${action}@${context_type}->${tier_key}`;
			return {
				label,
				action,
				context_type,
				tier_key,
				uses: Number(d.uses ?? 0),
				worked: Number(d.worked ?? 0),
				failed: Number(d.failed ?? 0),
				partial: Number(d.partial ?? 0),
				unknown: Number(d.unknown ?? 0),
				success_rate: Number(d.success_rate ?? 0.5),
				wilson_score: Number(d.wilson_score ?? 0.5),
				first_used_at: d.first_used_at ? new Date(d.first_used_at).toISOString() : null,
				last_used_at: d.last_used_at ? new Date(d.last_used_at).toISOString() : null,
			};
		});

		return json({
			success: true,
			rollups,
			meta: { built_ms: Date.now() - startedAt },
		});
	} catch (err) {
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to fetch action rollups",
				rollups: [],
				meta: { built_ms: Date.now() - startedAt },
			},
			{ status: 500 }
		);
	}
};

