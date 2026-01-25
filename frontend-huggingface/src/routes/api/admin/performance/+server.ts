/**
 * GET /api/admin/performance - Get MCP performance summary
 * POST /api/admin/performance - Clear metrics
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
	getPerformanceSummary,
	clearPerformanceMetrics,
} from "$lib/server/textGeneration/mcp/performanceMonitor";

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.isAdmin) {
		return error(403, "Admin access required");
	}

	try {
		const summary = getPerformanceSummary();
		return json({
			success: true,
			summary,
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
		const action = body.action ?? "clear";

		if (action === "clear") {
			clearPerformanceMetrics();
			return json({
				success: true,
				message: "Performance metrics cleared",
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
