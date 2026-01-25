import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade, getMemoryFeatureFlags } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { logger } from "$lib/server/logger";

// GET /api/memory/stats - Get memory statistics
export const GET: RequestHandler = async () => {
	try {
		logger.debug(`[API] Fetching memory stats for user: ${ADMIN_USER_ID}`);

		// Check feature flags first
		const flags = getMemoryFeatureFlags();
		if (!flags.systemEnabled) {
			logger.warn("[API] Memory system disabled via MEMORY_SYSTEM_ENABLED flag");
			return json({
				success: false,
				error: "Memory system disabled",
				reason: "MEMORY_SYSTEM_ENABLED is not set to true",
				flags: { systemEnabled: flags.systemEnabled },
			});
		}

		const facade = UnifiedMemoryFacade.getInstance();
		if (!facade.isInitialized()) {
			logger.warn(
				"[API] Memory facade not initialized - possible race condition or initialization failure"
			);
			return json({
				success: false,
				error: "System not ready",
				reason: "Memory facade exists but initialize() was not called - check server startup logs",
				flags: { systemEnabled: flags.systemEnabled },
			});
		}

		const stats = await facade.getStats(ADMIN_USER_ID);
		logger.debug(`[API] Got memory stats for tiers: ${Object.keys(stats.tiers).join(", ")}`);

		return json({
			success: true,
			stats,
		});
	} catch (err) {
		logger.error({ err }, "[API] Failed to get memory stats");
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get stats" },
			{ status: 500 }
		);
	}
};
