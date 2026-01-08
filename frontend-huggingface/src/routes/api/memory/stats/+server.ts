import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";

// GET /api/memory/stats - Get memory statistics
export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.user?.id;

	// Return empty stats for unauthenticated users
	if (!userId) {
		return json({
			success: true,
			stats: {
				user_id: "anonymous",
				as_of: new Date().toISOString(),
				tiers: {
					working: { active_count: 0, archived_count: 0, deleted_count: 0, uses_total: 0, success_rate: 0 },
					history: { active_count: 0, archived_count: 0, deleted_count: 0, uses_total: 0, success_rate: 0 },
					patterns: { active_count: 0, archived_count: 0, deleted_count: 0, uses_total: 0, success_rate: 0 },
					books: { active_count: 0, archived_count: 0, deleted_count: 0, uses_total: 0, success_rate: 0 },
					memory_bank: { active_count: 0, archived_count: 0, deleted_count: 0, uses_total: 0, success_rate: 0 },
				},
			},
		});
	}

	try {
		const facade = UnifiedMemoryFacade.getInstance();
		const stats = await facade.getStats(userId);

		return json({
			success: true,
			stats,
		});
	} catch (err) {
		console.error("[API] Failed to get memory stats:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get stats" },
			{ status: 500 }
		);
	}
};
