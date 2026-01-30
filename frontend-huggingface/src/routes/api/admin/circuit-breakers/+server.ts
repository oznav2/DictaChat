/**
 * GET /api/admin/circuit-breakers - Get all circuit breaker stats
 * POST /api/admin/circuit-breakers - Reset all circuit breakers
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
	getCircuitBreakerStats,
	resetAllCircuitBreakers,
} from "$lib/server/textGeneration/mcp/circuitBreaker";

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.isAdmin) {
		return error(403, "Admin access required");
	}

	try {
		const stats = getCircuitBreakerStats();
		return json({
			success: true,
			stats,
			timestamp: new Date().toISOString(),
		});
	} catch (err) {
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Unknown error" },
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.isAdmin) {
		return error(403, "Admin access required");
	}

	try {
		const body = await request.json().catch(() => ({}));
		const action = body.action ?? "reset";

		if (action === "reset") {
			resetAllCircuitBreakers();
			return json({
				success: true,
				message: "All circuit breakers reset",
				timestamp: new Date().toISOString(),
			});
		}

		return error(400, `Unknown action: ${action}`);
	} catch (err) {
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Unknown error" },
			{ status: 500 }
		);
	}
};
