import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { z } from "zod";
import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { MEMORY_COLLECTIONS } from "$lib/server/memory";
import { isEntityBlocklistedLabel, normalizeEntityLabel } from "$lib/server/memory/kg/entityHygiene";
import { findEnglishTranslation, findHebrewTranslation } from "$lib/server/memory/seed/bilingualEntities";

function generateNodeId(label: string): string {
	return label.toLowerCase().replace(/\s+/g, "_").slice(0, 50);
}

const BodySchema = z
	.object({
		limit: z.number().int().min(1).max(2000).optional(),
		dry_run: z.boolean().optional(),
	})
	.strict();

export const POST: RequestHandler = async ({ request }) => {
	const startedAt = Date.now();

	try {
		const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
		const body = parsed.success ? parsed.data : {};
		const limit = body.limit ?? 250;
		const dryRun = body.dry_run ?? false;

		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		const itemsCol = db.collection(MEMORY_COLLECTIONS.ITEMS);
		const nodesCol = db.collection(MEMORY_COLLECTIONS.KG_NODES);
		const edgesCol = db.collection(MEMORY_COLLECTIONS.KG_EDGES);

		const memories = await itemsCol
			.find({
				user_id: ADMIN_USER_ID,
				status: "active",
				entities: { $exists: true, $ne: [] },
			})
			.sort({ updated_at: -1 })
			.limit(limit)
			.toArray();

		let processed = 0;
		let nodeOps = 0;
		let edgeOps = 0;

		const nodeBulk: any[] = [];
		const edgeBulk: any[] = [];

		for (const mem of memories) {
			const memoryId = String(mem.memory_id);
			const entitiesRaw = Array.isArray(mem.entities) ? mem.entities : [];
			const entities = Array.from(
				new Set(
					entitiesRaw
						.map((e: any) => (typeof e === "string" ? e.trim() : ""))
						.filter(Boolean)
						.map((e) => normalizeEntityLabel(e).toLowerCase())
						.filter((e) => e.length > 2 && !isEntityBlocklistedLabel(e))
				)
			).slice(0, 10);

			if (entities.length === 0) continue;

			const importance = Number(mem.quality?.importance ?? 0.5);
			const confidence = Number(mem.quality?.confidence ?? 0.5);
			const qualityContribution = importance * confidence;
			const now = new Date();

			const nodeIds = entities.map(generateNodeId);

			for (let i = 0; i < entities.length; i++) {
				const label = entities[i];
				const nodeId = nodeIds[i];
				const aliases = Array.from(
					new Set(
						[findHebrewTranslation(label), findEnglishTranslation(label)]
							.filter((v): v is string => typeof v === "string" && v.length > 0)
							.map(normalizeEntityLabel)
							.filter((v) => v.length > 0 && !isEntityBlocklistedLabel(v))
					)
				);
				nodeBulk.push({
					updateOne: {
						filter: { user_id: ADMIN_USER_ID, node_id: nodeId },
						update: [
							{
								$set: {
									label,
									node_type: "concept",
									aliases: { $setUnion: [{ $ifNull: ["$aliases", []] }, aliases] },
									first_seen_at: { $ifNull: ["$first_seen_at", now] },
									last_seen_at: now,
								},
							},
							{
								$set: {
									_next_memory_ids: { $setUnion: [{ $ifNull: ["$memory_ids", []] }, [memoryId]] },
								},
							},
							{
								$set: {
									mentions: { $size: "$_next_memory_ids" },
									quality_sum: {
										$add: [
											{ $ifNull: ["$quality_sum", 0] },
											{
												$cond: [
													{
														$gt: [
															{ $size: "$_next_memory_ids" },
															{ $size: { $ifNull: ["$memory_ids", []] } },
														],
													},
													qualityContribution,
													0,
												],
											},
										],
									},
									memory_ids: "$_next_memory_ids",
								},
							},
							{
								$set: {
									avg_quality: {
										$cond: [
											{ $gt: ["$mentions", 0] },
											{ $divide: ["$quality_sum", "$mentions"] },
											0.5,
										],
									},
								},
							},
							{ $unset: "_next_memory_ids" },
						],
						upsert: true,
					},
				});
				nodeOps++;
			}

			for (let i = 0; i < nodeIds.length; i++) {
				for (let j = i + 1; j < nodeIds.length; j++) {
					const a = nodeIds[i];
					const b = nodeIds[j];
					const sourceId = a < b ? a : b;
					const targetId = a < b ? b : a;
					const edgeId = `${sourceId}:${targetId}`;

					edgeBulk.push({
						updateOne: {
							filter: { user_id: ADMIN_USER_ID, edge_id: edgeId },
							update: [
								{
									$set: {
										source_id: sourceId,
										target_id: targetId,
										relation_type: "co_occurs",
										first_seen_at: { $ifNull: ["$first_seen_at", now] },
										last_seen_at: now,
									},
								},
								{
									$set: {
										_next_memory_ids: { $setUnion: [{ $ifNull: ["$memory_ids", []] }, [memoryId]] },
									},
								},
								{
									$set: {
										memory_ids: "$_next_memory_ids",
										weight: { $size: "$_next_memory_ids" },
									},
								},
								{ $unset: "_next_memory_ids" },
							],
							upsert: true,
						},
					});
					edgeOps++;
				}
			}

			processed++;
		}

		if (!dryRun) {
			if (nodeBulk.length > 0) {
				await nodesCol.bulkWrite(nodeBulk, { ordered: false });
			}
			if (edgeBulk.length > 0) {
				await edgesCol.bulkWrite(edgeBulk, { ordered: false });
			}
		}

		return json({
			success: true,
			result: {
				dry_run: dryRun,
				processed_memories: processed,
				node_ops: nodeOps,
				edge_ops: edgeOps,
				duration_ms: Date.now() - startedAt,
			},
			meta: {
				built_ms: Date.now() - startedAt,
			},
		});
	} catch (err) {
		console.error("[API] Content graph backfill failed:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Backfill failed",
				meta: { built_ms: Date.now() - startedAt },
			},
			{ status: 500 }
		);
	}
};
