/**
 * POST /api/data/compact-database - Compact/optimize the database
 * 
 * RoamPal parity: /api/data/compact-database
 * Runs database compaction to reclaim disk space after deletions
 */
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections, ready as dbReady } from "$lib/server/database";

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	try {
		await dbReady;
		
		const db = (collections as unknown as Record<string, any>).books?.db 
			?? (collections as unknown as Record<string, any>).conversations?.db;
			
		if (!db) {
			return json({ success: false, error: "Database not initialized" }, { status: 500 });
		}

		// Get database stats before compaction
		const statsBefore = await db.command({ dbStats: 1 });
		const sizeBefore = statsBefore.dataSize || 0;

		// Run compact on main collections
		const collectionsToCompact = [
			"memory_items",
			"memory_versions", 
			"memory_outcomes",
			"known_solutions",
			"action_outcomes",
			"kg_nodes",
			"kg_edges",
			"kg_routing_concepts",
			"kg_routing_stats",
		];

		const compactResults: Record<string, boolean> = {};
		
		for (const collName of collectionsToCompact) {
			try {
				await db.command({ compact: collName });
				compactResults[collName] = true;
			} catch (err) {
				// Collection may not exist or compact may not be supported
				compactResults[collName] = false;
				console.warn(`[API] compact ${collName}:`, err);
			}
		}

		// Get database stats after compaction
		const statsAfter = await db.command({ dbStats: 1 });
		const sizeAfter = statsAfter.dataSize || 0;

		const spaceReclaimedBytes = Math.max(0, sizeBefore - sizeAfter);
		const spaceReclaimedMb = spaceReclaimedBytes / (1024 * 1024);

		return json({
			success: true,
			space_reclaimed_mb: Math.round(spaceReclaimedMb * 100) / 100,
			space_reclaimed_bytes: spaceReclaimedBytes,
			collections_compacted: Object.keys(compactResults).filter(k => compactResults[k]).length,
			compact_results: compactResults,
			timestamp: new Date().toISOString(),
		});
	} catch (err) {
		console.error("[API] compact-database error:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Compaction failed" },
			{ status: 500 }
		);
	}
};
