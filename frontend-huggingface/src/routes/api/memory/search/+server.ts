import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import type { MemoryTier, SortBy } from "$lib/server/memory/types";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { MEMORY_COLLECTIONS, type MemoryItemDocument } from "$lib/server/memory/stores/schemas";

// POST /api/memory/search - Search memories with offset-based pagination
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { query, tier, sortBy, limit = 50, offset = 0 } = await request.json();

		if (!query || typeof query !== "string") {
			return error(400, "query is required");
		}

		const facade = UnifiedMemoryFacade.getInstance();
		const collections: MemoryTier[] | "all" = tier && tier !== "all" ? [tier as MemoryTier] : "all";

		// Fetch one extra to detect if there are more results
		const fetchLimit = limit + 1;

		const searchResponse = await facade.search({
			userId: ADMIN_USER_ID,
			query,
			collections,
			sortBy: (sortBy as SortBy) || "relevance",
			limit: fetchLimit + offset,
		});

		// Apply offset and check if there are more results
		const offsetResults = searchResponse.results.slice(offset);
		const hasMore = offsetResults.length > limit;
		const paginatedResults = hasMore ? offsetResults.slice(0, limit) : offsetResults;
		const nextOffset = hasMore ? offset + limit : null;

		return json({
			success: true,
			results: paginatedResults,
			total: searchResponse.results.length,
			debug: searchResponse.debug,
			retrievalDebug: searchResponse.debug,
			// Pagination metadata
			hasMore,
			nextOffset,
		});
	} catch (err) {
		console.error("[API] Memory search failed:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Search failed" },
			{ status: 500 }
		);
	}
};

// GET /api/memory/search - List/search memories (legacy-friendly)
export const GET: RequestHandler = async ({ url }) => {
	try {
		const tier = url.searchParams.get("tier");
		const sortBy = url.searchParams.get("sort_by") ?? "recent";
		const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? "100")));
		const query = (url.searchParams.get("query") ?? "").trim();

		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);
		const items = db.collection<MemoryItemDocument>(MEMORY_COLLECTIONS.ITEMS);

		const filter: Record<string, unknown> = { user_id: ADMIN_USER_ID, status: "active" };
		if (tier && tier !== "all") {
			filter.tier = tier;
		}
		if (query) {
			filter.$text = { $search: query };
		}

		const sort: Record<string, 1 | -1> =
			sortBy === "score" ? { "stats.wilson_score": -1, updated_at: -1 } : { updated_at: -1 };

		const docs = await items
			.find(filter, {
				projection: {
					_id: 0,
					memory_id: 1,
					text: 1,
					tier: 1,
					"stats.wilson_score": 1,
					created_at: 1,
					updated_at: 1,
					tags: 1,
					"stats.worked_count": 1,
					"stats.failed_count": 1,
					"stats.partial_count": 1,
					"stats.uses": 1,
					"stats.last_used_at": 1,
				},
			})
			.sort(sort)
			.limit(limit)
			.toArray();

		const memories = docs.map((doc) => ({
			memory_id: doc.memory_id,
			content: doc.text,
			tier: doc.tier,
			wilson_score: doc.stats?.wilson_score ?? 0.5,
			created_at: (doc.created_at ?? doc.updated_at ?? new Date()).toISOString(),
			tags: doc.tags ?? [],
			outcomes: {
				worked: doc.stats?.worked_count ?? 0,
				failed: doc.stats?.failed_count ?? 0,
				partial: doc.stats?.partial_count ?? 0,
			},
			last_used: doc.stats?.last_used_at
				? (doc.stats.last_used_at as unknown as Date).toISOString()
				: undefined,
		}));

		return json({ success: true, memories });
	} catch (err) {
		console.error("[API] Memory list/search (GET) failed:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Search failed", memories: [] },
			{ status: 500 }
		);
	}
};
