import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";

// GET /api/memory/stats - Get memory statistics
export const GET: RequestHandler = async () => {
	try {
		console.log(`[API] Fetching memory stats for user: ${ADMIN_USER_ID}`);
		const facade = UnifiedMemoryFacade.getInstance();
		if (!facade.isInitialized()) {
			console.warn("[API] Memory facade not initialized");
			return json({ success: false, error: "System not ready" });
		}

		const stats = await facade.getStats(ADMIN_USER_ID);
		console.log(`[API] Got memory stats:`, JSON.stringify(stats));

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
