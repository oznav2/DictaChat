import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { isEntityBlocklistedLabel, normalizeEntityLabel } from "$lib/server/memory/kg/entityHygiene";

interface GraphNode {
	id: string;
	concept: string;
	type: "routing" | "content" | "action";
	score: number;
	usage: number;
	/**
	 * RoamPal v0.2.11 Fix #3: Pre-indexed relationship counts for O(1) lookups
	 * Number of edges connected to this node (cached in-memory during query)
	 */
	connectionCount?: number;
}

interface GraphEdge {
	source: string;
	target: string;
	weight: number;
}

type GraphMode = "routing" | "content" | "both";

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

// GET /api/memory/graph - Get graph data for D3.js visualization
export const GET: RequestHandler = async ({ url }) => {
	const nodes: GraphNode[] = [];
	const edgesByKey = new Map<string, GraphEdge>();
	const startedAt = Date.now();
	const modeRaw = String(url.searchParams.get("mode") ?? "both");
	const mode: GraphMode = modeRaw === "routing" || modeRaw === "content" || modeRaw === "both" ? modeRaw : "both";

	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		if (mode === "routing" || mode === "both") {
			try {
				const routingConcepts = await db
					.collection("kg_routing_concepts")
					.find({ user_id: ADMIN_USER_ID })
					.sort({ last_seen_at: -1 })
					.limit(30)
					.toArray();

				const conceptIds = routingConcepts
					.map((c: any) => String(c.concept_id ?? c.label ?? "").trim())
					.filter(Boolean);

				const routingStats = await db
					.collection("kg_routing_stats")
					.find({ user_id: ADMIN_USER_ID, concept_id: { $in: conceptIds } })
					.toArray();
				const statsByConcept = new Map<string, any>(
					routingStats.map((s: any) => [String(s.concept_id), s])
				);

				const routingNodeIds: string[] = [];
				for (const concept of routingConcepts) {
					const conceptId = String(concept.concept_id ?? concept.label ?? "").trim();
					if (!conceptId) continue;
					const label = normalizeEntityLabel(String(concept.label || concept.concept_id || "Unknown"));
					if (isEntityBlocklistedLabel(label)) continue;

					const stats = statsByConcept.get(conceptId);
					const tierRates = stats?.tier_success_rates ?? {};
					const tiers = Object.values(tierRates) as Array<any>;
					const usage = tiers.reduce((sum, t) => sum + Number(t?.uses ?? 0), 0);
					const score =
						tiers.length > 0
							? Math.max(0.3, Math.min(0.95, ...tiers.map((t) => Number(t?.wilson_score ?? 0.5))))
							: 0.5;

					const id = `routing_${conceptId}`;
					routingNodeIds.push(id);
					nodes.push({
						id,
						concept: label,
						type: "routing",
						score,
						usage,
					});
				}

				for (let i = 0; i < routingNodeIds.length; i++) {
					for (let j = i + 1; j < routingNodeIds.length; j++) {
						const aId = routingNodeIds[i];
						const bId = routingNodeIds[j];
						const aConceptId = aId.slice("routing_".length);
						const bConceptId = bId.slice("routing_".length);
						const aStats = statsByConcept.get(aConceptId);
						const bStats = statsByConcept.get(bConceptId);
						const aBest = Array.isArray(aStats?.best_tiers_cached) ? aStats.best_tiers_cached : [];
						const bBest = Array.isArray(bStats?.best_tiers_cached) ? bStats.best_tiers_cached : [];
						const shared = aBest.filter((t: any) => bBest.includes(t));
						if (shared.length === 0) continue;

						const weight = shared.reduce((sum: number, tier: any) => {
							const aTier = aStats?.tier_success_rates?.[tier];
							const bTier = bStats?.tier_success_rates?.[tier];
							const aScore = Number(aTier?.wilson_score ?? 0.5);
							const bScore = Number(bTier?.wilson_score ?? 0.5);
							return sum + (aScore + bScore) / 2;
						}, 0);
						const clamped = Math.min(3, Math.max(0.2, weight));
						const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
						edgesByKey.set(key, { source: aId, target: bId, weight: clamped });
					}
				}
			} catch (err) {
				console.debug("[API] Graph: routing mode unavailable", { err: String(err) });
			}
		}

		if (mode === "content" || mode === "both") {
			try {
				const contentNodes = await db
					.collection("kg_nodes")
					.find({ user_id: ADMIN_USER_ID })
					.sort({ avg_quality: -1 })
					.limit(200)
					.toArray();

				for (const node of contentNodes) {
					const label = formatBilingualLabel(String(node.label || node.node_id || "Unknown"), node.aliases);
					if (isEntityBlocklistedLabel(label)) continue;
					nodes.push({
						id: `content_${node.node_id || node.label}`,
						concept: label,
						type: "content",
						score: Number(node.avg_quality) || 0.5,
						usage: Number(node.hit_count) || 0,
					});
				}

				const nodeIds = new Set(nodes.map((n) => n.id));

				const kgEdges = await db
					.collection("kg_edges")
					.find({ user_id: ADMIN_USER_ID })
					.limit(2000)
					.toArray();

				for (const edge of kgEdges) {
					const sourceId = `content_${edge.source_id}`;
					const targetId = `content_${edge.target_id}`;

					if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) continue;

					const key = sourceId < targetId ? `${sourceId}|${targetId}` : `${targetId}|${sourceId}`;
					const weight = Number(edge.weight) || 0.5;

					const existing = edgesByKey.get(key);
					if (existing) {
						existing.weight += weight;
					} else {
						edgesByKey.set(key, { source: sourceId, target: targetId, weight });
					}
				}
			} catch (err) {
				console.debug("[API] Graph: content mode unavailable", { err: String(err) });
			}
		}

		if (mode === "both") {
			try {
				const actionDocs = await db
					.collection("kg_action_effectiveness")
					.find({ user_id: ADMIN_USER_ID })
					.sort({ wilson_score: -1 })
					.limit(25)
					.toArray();

				for (const doc of actionDocs) {
					const action = String(doc.action ?? doc.action_key ?? doc._id ?? "Unknown");
					const contextType = String(doc.context_type ?? "general");
					nodes.push({
						id: `action_${contextType}_${action}`,
						concept: `${action} (${contextType})`,
						type: "action",
						score: Number(doc.wilson_score ?? doc.success_rate) || 0.5,
						usage: Number(doc.uses ?? doc.total_uses) || 0,
					});
				}
			} catch (err) {
				console.debug("[API] Graph: action effectiveness unavailable", { err: String(err) });
			}
		}
	} catch (err) {
		console.error("[API] Graph fetch failed:", err);
	}

	const edges = Array.from(edgesByKey.values())
		.sort((a, b) => b.weight - a.weight)
		.slice(0, 2000);

	// RoamPal v0.2.11 Fix #3: Pre-indexed relationship counts
	// Build connection counts map for O(1) lookups
	const connectionCounts = new Map<string, number>();
	for (const edge of edges) {
		connectionCounts.set(edge.source, (connectionCounts.get(edge.source) ?? 0) + 1);
		connectionCounts.set(edge.target, (connectionCounts.get(edge.target) ?? 0) + 1);
	}

	// Annotate nodes with their connection counts
	for (const node of nodes) {
		node.connectionCount = connectionCounts.get(node.id) ?? 0;
	}

	return json({
		success: true,
		nodes,
		edges,
		meta: {
			built_ms: Date.now() - startedAt,
			// RoamPal v0.2.11: Include counts in response
			node_count: nodes.length,
			edge_count: edges.length,
		},
	});
};
