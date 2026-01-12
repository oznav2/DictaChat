import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { isEntityBlocklistedLabel, normalizeEntityLabel } from "$lib/server/memory/kg/entityHygiene";

interface RoutingConcept {
	concept_id: string;
	label: string;
	wilson_score: number;
	uses: number;
	tier_stats: Record<string, { success_rate: number; uses: number }>;
}

interface ActionEffectiveness {
	action: string;
	context_type: string;
	success_rate: number;
	uses: number;
	last_used?: string;
}

// GET /api/memory/kg - Get knowledge graph concepts and action effectiveness
export const GET: RequestHandler = async () => {
	const concepts: RoutingConcept[] = [];
	const actionEffectiveness: ActionEffectiveness[] = [];

	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		// Get routing concepts
		try {
			const routingDocs = await db
				.collection("kg_routing_concepts")
				.find({ user_id: ADMIN_USER_ID })
				.sort({ wilson_score: -1 })
				.limit(50)
				.toArray();

			for (const doc of routingDocs) {
				const label = normalizeEntityLabel(String(doc.label || doc.concept_id || "Unknown"));
				if (isEntityBlocklistedLabel(label)) continue;
				concepts.push({
					concept_id: String(doc.concept_id || doc._id),
					label,
					wilson_score: Number(doc.wilson_score) || 0.5,
					uses: Number(doc.uses) || 0,
					tier_stats:
						(doc.tier_stats as Record<string, { success_rate: number; uses: number }>) || {},
				});
			}
		} catch (err) {
			console.debug("[API] KG: routing concepts unavailable", { err: String(err) });
		}

		// Get action effectiveness
		try {
			const actionDocs = await db
				.collection("kg_action_effectiveness")
				.find({ user_id: ADMIN_USER_ID })
				.sort({ wilson_score: -1 })
				.limit(30)
				.toArray();

			for (const doc of actionDocs) {
				const examples = Array.isArray(doc.examples) ? doc.examples : [];
				const timestamps = examples
					.map((ex: any) => (ex?.timestamp ? new Date(ex.timestamp).getTime() : null))
					.filter((t: number | null): t is number => typeof t === "number" && Number.isFinite(t));
				const lastUsed =
					timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : undefined;

				actionEffectiveness.push({
					action: String(doc.action ?? doc.action_key ?? doc._id),
					context_type: String(doc.context_type || "general"),
					success_rate: Number(doc.success_rate ?? doc.wilson_score) || 0.5,
					uses: Number(doc.uses ?? doc.total_uses) || 0,
					...(lastUsed ? { last_used: lastUsed } : {}),
				});
			}
		} catch (err) {
			console.debug("[API] KG: action effectiveness unavailable", { err: String(err) });
		}

		return json({
			success: true,
			concepts,
			actionEffectiveness,
		});
	} catch (err) {
		console.error("[API] KG fetch failed:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to fetch KG data",
				concepts: [],
				actionEffectiveness: [],
			},
			{ status: 500 }
		);
	}
};

// POST /api/memory/kg/concept - Record a concept interaction (for future use)
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { concept, tier, outcome } = body;

		if (!concept || !tier) {
			return json({ success: false, error: "Missing concept or tier" }, { status: 400 });
		}

		// For now, just acknowledge - full implementation would use KnowledgeGraphService
		console.log(`[KG] Concept interaction: ${concept} -> ${tier} (${outcome || "unknown"})`);

		return json({
			success: true,
			message: "Concept interaction recorded",
		});
	} catch (err) {
		console.error("[API] KG concept record failed:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to record concept",
			},
			{ status: 500 }
		);
	}
};
