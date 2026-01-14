/**
 * Phase 1.1: Migration API Endpoint
 * 
 * POST /api/memory/ops/migrate - Trigger migration from memoryBank to memory_items
 * GET /api/memory/ops/migrate - Get migration status
 * 
 * Admin-only endpoint for migrating legacy memoryBank items to the unified memory_items collection.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { ADMIN_USER_ID } from "$lib/server/constants";
import {
	migrateMemoryBankToUnified,
	getMigrationStatus,
	verifyMigration,
	type MigrationConfig,
} from "$lib/server/memory/migrations/consolidateMemoryBank";

// GET /api/memory/ops/migrate - Get migration status
export const GET: RequestHandler = async () => {
	try {
		const status = await getMigrationStatus();
		
		return json({
			success: true,
			status,
			message: status.pendingCount > 0 
				? `${status.pendingCount} items pending migration`
				: "Migration complete - all items synchronized",
		});
	} catch (err) {
		console.error("[API] Failed to get migration status:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get status" },
			{ status: 500 }
		);
	}
};

// POST /api/memory/ops/migrate - Trigger migration
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		
		const migrationConfig: MigrationConfig = {
			batchSize: body.batchSize ?? 50,
			skipExisting: body.skipExisting ?? true,
			dryRun: body.dryRun ?? false,
			userId: body.userId ?? ADMIN_USER_ID,
			generateEmbeddings: body.generateEmbeddings ?? false,
			indexInQdrant: body.indexInQdrant ?? false,
		};

		console.log("[API] Starting migration with config:", migrationConfig);

		// Run migration (without embedding client or Qdrant - use deferred reindex)
		const stats = await migrateMemoryBankToUnified(null, null, migrationConfig);

		return json({
			success: true,
			stats,
			message: migrationConfig.dryRun 
				? "Dry run completed - no data was modified"
				: `Migration completed: ${stats.migrated} items migrated, ${stats.failed} failed`,
		});
	} catch (err) {
		console.error("[API] Migration failed:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Migration failed" },
			{ status: 500 }
		);
	}
};

// PUT /api/memory/ops/migrate - Verify migration integrity
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const userId = body.userId ?? ADMIN_USER_ID;

		const verification = await verifyMigration(userId);

		return json({
			success: true,
			verification,
			message: verification.verified
				? "All legacy items have been migrated successfully"
				: `${verification.missingCount} items have not been migrated`,
		});
	} catch (err) {
		console.error("[API] Verification failed:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Verification failed" },
			{ status: 500 }
		);
	}
};
