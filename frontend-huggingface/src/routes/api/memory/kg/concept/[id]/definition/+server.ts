import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { MEMORY_COLLECTIONS } from "$lib/server/memory";
import {
	isEntityBlocklistedLabel,
	normalizeEntityLabel,
} from "$lib/server/memory/kg/entityHygiene";

function normalizeConceptId(raw: string): string {
	if (raw.startsWith("content_")) return raw.slice("content_".length);
	if (raw.startsWith("routing_")) return raw.slice("routing_".length);
	if (raw.startsWith("action_")) return raw.slice("action_".length);
	return raw;
}

export const GET: RequestHandler = async ({ params }) => {
	const startedAt = Date.now();

	try {
		const conceptId = normalizeConceptId(String(params.id));

		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		const nodesCol = db.collection(MEMORY_COLLECTIONS.KG_NODES);
		const edgesCol = db.collection(MEMORY_COLLECTIONS.KG_EDGES);
		const routingCol = db.collection("kg_routing_concepts");
		const actionCol = db.collection("kg_action_effectiveness");
		const itemsCol = db.collection(MEMORY_COLLECTIONS.ITEMS);

		const isActionQuery = String(params.id).startsWith("action_");
		const [contentNode, routingNode, actionNode] = await Promise.all([
			nodesCol.findOne({ user_id: ADMIN_USER_ID, node_id: conceptId }),
			routingCol.findOne({ user_id: ADMIN_USER_ID, concept_id: conceptId }),
			isActionQuery
				? (async () => {
						const firstUnderscore = conceptId.indexOf("_");
						const contextType =
							firstUnderscore >= 0 ? conceptId.slice(0, firstUnderscore) : "general";
						const action = firstUnderscore >= 0 ? conceptId.slice(firstUnderscore + 1) : conceptId;
						return actionCol.findOne({
							user_id: ADMIN_USER_ID,
							context_type: contextType,
							action,
						});
					})()
				: Promise.resolve(null),
		]);

		if (!contentNode && !routingNode && !actionNode) {
			return json({ success: false, error: "Concept not found" }, { status: 404 });
		}

		const rawLabel = String(
			contentNode?.label ?? routingNode?.label ?? actionNode?.action ?? conceptId
		);
		const rawAliases = contentNode?.aliases;
		const labelBase = normalizeEntityLabel(rawLabel);
		const aliases = Array.isArray(rawAliases)
			? rawAliases.map((a: any) => normalizeEntityLabel(String(a))).filter(Boolean)
			: [];
		const hasHebrew = /[\u0590-\u05FF]/.test(labelBase);
		const aliasHeb = aliases.find((a) => /[\u0590-\u05FF]/.test(a));
		const aliasEn = aliases.find((a) => /[a-zA-Z]/.test(a));
		const label =
			contentNode && hasHebrew && aliasEn
				? `${labelBase} / ${aliasEn}`
				: contentNode && !hasHebrew && aliasHeb
					? `${aliasHeb} / ${labelBase}`
					: labelBase;
		const nodeType = contentNode ? "content" : actionNode ? "action" : "routing";

		if (nodeType !== "action" && isEntityBlocklistedLabel(label)) {
			return json({ success: false, error: "Concept not found" }, { status: 404 });
		}

		const edges = contentNode
			? await edgesCol
					.find({
						user_id: ADMIN_USER_ID,
						$or: [{ source_id: conceptId }, { target_id: conceptId }],
					})
					.sort({ weight: -1 })
					.limit(25)
					.toArray()
			: [];

		const filteredEdges = contentNode
			? await (async () => {
					const otherIds = Array.from(
						new Set(
							edges
								.flatMap((e: any) => [String(e.source_id), String(e.target_id)])
								.filter((id: string) => id !== conceptId)
						)
					);
					if (otherIds.length === 0) return [];
					const otherNodes = await nodesCol
						.find({ user_id: ADMIN_USER_ID, node_id: { $in: otherIds } })
						.project({ node_id: 1, label: 1 })
						.toArray();
					const allowed = new Set(
						otherNodes
							.filter(
								(n: any) => !isEntityBlocklistedLabel(normalizeEntityLabel(String(n.label ?? "")))
							)
							.map((n: any) => String(n.node_id))
					);
					allowed.add(conceptId);
					return edges
						.map((e: any) => ({
							source_id: String(e.source_id),
							target_id: String(e.target_id),
							weight: Number(e.weight ?? 0),
						}))
						.filter((e: any) => allowed.has(e.source_id) && allowed.has(e.target_id));
				})()
			: [];

		const memoryIds = Array.isArray(contentNode?.memory_ids)
			? contentNode.memory_ids.slice(0, 10)
			: [];
		const memories =
			memoryIds.length > 0
				? await itemsCol
						.find({ user_id: ADMIN_USER_ID, memory_id: { $in: memoryIds } })
						.limit(10)
						.toArray()
				: [];

		return json({
			success: true,
			concept: {
				id: conceptId,
				label,
				type: nodeType,
			},
			definition: {
				content: null,
				stats: contentNode
					? {
							mentions: Number(contentNode.mentions ?? 0),
							avg_quality: Number(contentNode.avg_quality ?? 0.5),
							first_seen_at: contentNode.first_seen_at
								? new Date(contentNode.first_seen_at).toISOString()
								: null,
							last_seen_at: contentNode.last_seen_at
								? new Date(contentNode.last_seen_at).toISOString()
								: null,
						}
					: actionNode
						? {
								context_type: String(actionNode.context_type ?? "general"),
								action: String(actionNode.action ?? conceptId),
								uses: Number(actionNode.uses ?? 0),
								success_rate: Number(actionNode.success_rate ?? 0.5),
								wilson_score: Number(actionNode.wilson_score ?? 0.5),
							}
						: {
								uses: Number(routingNode?.uses ?? 0),
								wilson_score: Number(routingNode?.wilson_score ?? 0.5),
								first_seen_at: routingNode?.first_seen_at
									? new Date(routingNode.first_seen_at).toISOString()
									: null,
								last_seen_at: routingNode?.last_seen_at
									? new Date(routingNode.last_seen_at).toISOString()
									: null,
							},
				related: {
					edges: nodeType === "content" ? filteredEdges : [],
					memories: memories.map((m: any) => ({
						memory_id: String(m.memory_id),
						tier: String(m.tier),
						text_preview: typeof m.text === "string" ? m.text.slice(0, 220) : "",
						updated_at: m.updated_at ? new Date(m.updated_at).toISOString() : null,
					})),
				},
			},
			meta: { built_ms: Date.now() - startedAt },
		});
	} catch (err) {
		console.error("[API] Failed to get concept definition:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to get concept definition",
				meta: { built_ms: Date.now() - startedAt },
			},
			{ status: 500 }
		);
	}
};
