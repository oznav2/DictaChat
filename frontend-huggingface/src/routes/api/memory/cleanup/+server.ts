import { json, type RequestHandler } from "@sveltejs/kit";
import {
	cleanupOrphanedSessions,
	getOrphanedSessionStats,
} from "$lib/server/memory/ops/cleanupOrphanedSessions";

/**
 * GET /api/memory/cleanup - Get orphaned session statistics (dry run)
 *
 * Returns count of orphaned records without deleting them.
 * Useful to check how much data would be cleaned up.
 */
export const GET: RequestHandler = async () => {
	try {
		const stats = await getOrphanedSessionStats();

		return json({
			success: true,
			dryRun: true,
			stats,
			message: `Found ${stats.totalDeleted} orphaned records that would be deleted`,
		});
	} catch (err) {
		console.error("[API] Failed to get orphan stats:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get stats" },
			{ status: 500 }
		);
	}
};

/**
 * POST /api/memory/cleanup - Run orphaned session cleanup
 *
 * Actually deletes orphaned records from expired sessions.
 * Use with caution - this permanently removes data.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const dryRun = body.dryRun === true;

		const result = await cleanupOrphanedSessions(dryRun);

		return json({
			success: true,
			dryRun,
			result,
			message: dryRun
				? `Dry run: would delete ${result.totalDeleted} orphaned records`
				: `Deleted ${result.totalDeleted} orphaned records`,
		});
	} catch (err) {
		console.error("[API] Failed to run cleanup:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to run cleanup" },
			{ status: 500 }
		);
	}
};
