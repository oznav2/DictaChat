import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import type { MemoryTier, SortBy } from "$lib/server/memory/types";

// POST /api/memory/search - Search memories
export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.user?.id;

	// Return empty results for unauthenticated users
	if (!userId) {
		return json({
			success: true,
			results: [],
			total: 0,
			debug: null,
		});
	}

	try {
		const { query, tier, sortBy, limit } = await request.json();

		if (!query || typeof query !== "string") {
			return error(400, "query is required");
		}

		const facade = UnifiedMemoryFacade.getInstance();
		const collections: MemoryTier[] | "all" = tier && tier !== "all" ? [tier as MemoryTier] : "all";

		const results = await facade.search({
			userId,
			query,
			collections,
			sortBy: (sortBy as SortBy) || "relevance",
			limit: limit || 20,
		});

		return json({
			success: true,
			results: results.hits,
			total: results.total,
			debug: results.debug,
		});
	} catch (err) {
		console.error("[API] Memory search failed:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Search failed" },
			{ status: 500 }
		);
	}
};
