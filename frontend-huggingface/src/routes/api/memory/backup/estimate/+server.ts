import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { z } from "zod";
import { type MemoryTier, getMemoryEnvConfig, QdrantAdapter } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { collections, ready as dbReady } from "$lib/server/database";

const estimateQuerySchema = z.object({
	includeArchived: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeTiers: z.string().optional(),
	includeOutcomes: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeActionOutcomes: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeKg: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeRoutingKg: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeActionKg: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeVersions: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includePersonalityMappings: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeReindexCheckpoints: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeConsistencyLogs: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
});

function parseTiers(raw: string | undefined): MemoryTier[] | "all" {
	if (!raw) return "all";
	if (raw === "all") return "all";
	const parts = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return parts as MemoryTier[];
}

async function approxBytes<T extends Record<string, unknown>>(
	coll: { find: (q: any, o?: any) => any },
	query: Record<string, unknown>,
	count: number
): Promise<number> {
	if (count <= 0) return 0;
	const limit = Math.min(20, count);
	const sample = await coll.find(query, { limit, projection: { _id: 0 } }).toArray();
	if (!Array.isArray(sample) || sample.length === 0) return 0;
	const avg =
		sample.reduce((acc: number, d: unknown) => acc + Buffer.byteLength(JSON.stringify(d), "utf8"), 0) /
		sample.length;
	return Math.round(avg * count);
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	await dbReady;

	const parsed = estimateQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ success: false, error: "Invalid query" }, { status: 400 });
	}

	const includeTiers = parseTiers(parsed.data.includeTiers);
	const tierFilter = includeTiers === "all" ? undefined : { $in: includeTiers as MemoryTier[] };
	const statusFilter = parsed.data.includeArchived
		? ({ $in: ["active", "archived", "deleted"] as const } as const)
		: ("active" as const);

	const db =
		((collections as unknown as Record<string, any>).books?.db as any) ??
		((collections as unknown as Record<string, any>).conversations?.db as any);
	if (!db) {
		return json({ success: false, error: "Database not initialized" }, { status: 500 });
	}

	const coll = (name: string) => db.collection(name);
	const userFilter: Record<string, unknown> = { user_id: ADMIN_USER_ID };

	const estimates: Record<string, { count: number; approx_bytes: number }> = {};

	const estimateCollection = async (
		name: string,
		enabled: boolean,
		query: Record<string, unknown>
	) => {
		if (!enabled) return;
		const c = coll(name);
		const count = await c.countDocuments(query);
		const bytes = await approxBytes(c, query, count);
		estimates[name] = { count, approx_bytes: bytes };
	};

	await estimateCollection("memory_items", true, {
		...userFilter,
		...(tierFilter ? { tier: tierFilter } : {}),
		status: statusFilter,
	});

	await estimateCollection("memory_versions", parsed.data.includeVersions, userFilter);
	await estimateCollection("memory_outcomes", parsed.data.includeOutcomes, userFilter);
	await estimateCollection(
		"known_solutions",
		parsed.data.includeOutcomes,
		userFilter
	);
	await estimateCollection("action_outcomes", parsed.data.includeActionOutcomes, userFilter);
	await estimateCollection("kg_nodes", parsed.data.includeKg, userFilter);
	await estimateCollection("kg_edges", parsed.data.includeKg, userFilter);
	await estimateCollection("kg_routing_concepts", parsed.data.includeRoutingKg, userFilter);
	await estimateCollection("kg_routing_stats", parsed.data.includeRoutingKg, userFilter);
	await estimateCollection("kg_action_effectiveness", parsed.data.includeActionKg, userFilter);
	await estimateCollection("kg_context_action_effectiveness", parsed.data.includeActionKg, userFilter);
	await estimateCollection("personality_memory_mappings", parsed.data.includePersonalityMappings, userFilter);
	await estimateCollection("reindex_checkpoints", parsed.data.includeReindexCheckpoints, userFilter);
	await estimateCollection("consistency_logs", parsed.data.includeConsistencyLogs, userFilter);

	const total_docs = Object.values(estimates).reduce((a, v) => a + v.count, 0);
	const total_approx_bytes = Object.values(estimates).reduce((a, v) => a + v.approx_bytes, 0);

	const envCfg = getMemoryEnvConfig();
	const qdrant = new QdrantAdapter({
		host: envCfg.qdrantHost,
		port: envCfg.qdrantPort,
		https: envCfg.qdrantHttps,
	});
	const qdrantHealth = await qdrant.getHealth();

	return json({
		success: true,
		as_of: new Date().toISOString(),
		estimate: {
			total_docs,
			total_bytes: total_approx_bytes,
			collection_counts: Object.fromEntries(
				Object.entries(estimates).map(([k, v]) => [k, v.count])
			) as Record<string, number>,
			qdrant: {
				ok: qdrantHealth.healthy,
				point_count: qdrantHealth.pointCount,
				collection_exists: qdrantHealth.collectionExists,
				vector_dims: qdrantHealth.vectorDims,
			},
		},
	});
};
