import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { isEntityBlocklistedLabel, normalizeEntityLabel } from "$lib/server/memory/kg/entityHygiene";

/**
 * Phase 3 Gap 8: Dual KG Visualization
 * 
 * RoamPal Parity (memory_visualization_enhanced.py lines 179-316):
 * - /knowledge-graph/concepts returns merged entities from Routing KG AND Content KG
 * - Nodes include source: 'routing' | 'content' | 'both'
 * - Optimization: Direct in-memory graph access (<1s vs ~20s)
 */

interface KgConcept {
	concept_id: string;
	label: string;
	wilson_score: number;
	uses: number;
	tier_stats: Record<string, { success_rate: number; uses: number }>;
	/** Source KG: 'routing' | 'content' | 'both' */
	source: "routing" | "content" | "both";
}

interface ContentEntity {
	entity_id: string;
	label: string;
	quality: number;
	hit_count: number;
	aliases?: string[];
}

interface ActionEffectiveness {
	action: string;
	context_type: string;
	success_rate: number;
	uses: number;
	last_used?: string;
}

type KgMode = "routing" | "content" | "both";

function formatBilingualLabel(labelRaw: string, aliasesRaw: unknown): string {
	const label = normalizeEntityLabel(labelRaw);
	const aliases = Array.isArray(aliasesRaw)
		? aliasesRaw
				.map((a) => normalizeEntityLabel(String(a)))
				.filter((a) => a.length > 0)
		: [];
	const hasHebrew = /[\u0590-\u05FF]/.test(label);
	const aliasHeb = aliases.find((a) => /[\u0590-\u05FF]/.test(a));
	const aliasEn = aliases.find((a) => /[a-zA-Z]/.test(a));

	if (hasHebrew && aliasEn) return `${label} / ${aliasEn}`;
	if (!hasHebrew && aliasHeb) return `${aliasHeb} / ${label}`;
	return label;
}

// GET /api/memory/kg - Get knowledge graph concepts and action effectiveness
// Supports ?mode=routing|content|both (default: both)
export const GET: RequestHandler = async ({ url }) => {
	const modeRaw = String(url.searchParams.get("mode") ?? "both");
	const mode: KgMode = modeRaw === "routing" || modeRaw === "content" ? modeRaw : "both";
	
	const conceptsByLabel = new Map<string, KgConcept>();
	const actionEffectiveness: ActionEffectiveness[] = [];
	const startedAt = Date.now();

	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		// Get routing concepts (if mode includes routing)
		if (mode === "routing" || mode === "both") {
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
					
					const concept: KgConcept = {
						concept_id: String(doc.concept_id || doc._id),
						label,
						wilson_score: Number(doc.wilson_score) || 0.5,
						uses: Number(doc.uses) || 0,
						tier_stats:
							(doc.tier_stats as Record<string, { success_rate: number; uses: number }>) || {},
						source: "routing",
					};
					conceptsByLabel.set(label.toLowerCase(), concept);
				}
			} catch (err) {
				console.debug("[API] KG: routing concepts unavailable", { err: String(err) });
			}
		}

		// Get content KG entities (if mode includes content)
		if (mode === "content" || mode === "both") {
			try {
				const contentDocs = await db
					.collection("kg_nodes")
					.find({ user_id: ADMIN_USER_ID })
					.sort({ avg_quality: -1 })
					.limit(100)
					.toArray();

				for (const doc of contentDocs) {
					const rawLabel = String(doc.label || doc.node_id || "Unknown");
					const label = formatBilingualLabel(rawLabel, doc.aliases);
					if (isEntityBlocklistedLabel(label)) continue;
					
					const labelKey = label.toLowerCase();
					const existing = conceptsByLabel.get(labelKey);
					
					if (existing) {
						// Merge: entity exists in both KGs
						existing.source = "both";
						// Combine scores (average)
						existing.wilson_score = (existing.wilson_score + (Number(doc.avg_quality) || 0.5)) / 2;
						existing.uses = existing.uses + (Number(doc.hit_count) || 0);
					} else {
						// New content-only entity
						const concept: KgConcept = {
							concept_id: `content_${doc.node_id || doc.label}`,
							label,
							wilson_score: Number(doc.avg_quality) || 0.5,
							uses: Number(doc.hit_count) || 0,
							tier_stats: {},
							source: "content",
						};
						conceptsByLabel.set(labelKey, concept);
					}
				}
			} catch (err) {
				console.debug("[API] KG: content entities unavailable", { err: String(err) });
			}
		}

		// Get action effectiveness (always included)
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

		// Convert map to array and sort by score
		const concepts = Array.from(conceptsByLabel.values())
			.sort((a, b) => b.wilson_score - a.wilson_score);

		return json({
			success: true,
			concepts,
			actionEffectiveness,
			meta: {
				mode,
				routing_count: concepts.filter(c => c.source === "routing" || c.source === "both").length,
				content_count: concepts.filter(c => c.source === "content" || c.source === "both").length,
				merged_count: concepts.filter(c => c.source === "both").length,
				built_ms: Date.now() - startedAt,
			},
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
