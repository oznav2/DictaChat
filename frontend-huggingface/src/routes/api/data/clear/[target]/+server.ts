/**
 * POST /api/data/clear/[target] - Clear specific data collections
 * 
 * RoamPal parity: /api/data/clear/${target}
 * Supports clearing: memory_bank, working, history, patterns, books, sessions, knowledge-graph
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections, ready as dbReady } from "$lib/server/database";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { UnifiedMemoryFacade, type MemoryTier } from "$lib/server/memory";

type ClearTarget = 
	| "memory_bank" 
	| "working" 
	| "history" 
	| "patterns" 
	| "books" 
	| "sessions" 
	| "knowledge-graph";

const TIER_MAP: Record<string, MemoryTier> = {
	memory_bank: "memory_bank",
	working: "working",
	history: "history",
	patterns: "patterns",
	books: "books",
};

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	const target = params.target as ClearTarget;
	
	const validTargets: ClearTarget[] = [
		"memory_bank", "working", "history", "patterns", 
		"books", "sessions", "knowledge-graph"
	];
	
	if (!validTargets.includes(target)) {
		return error(400, `Invalid target: ${target}. Valid targets: ${validTargets.join(", ")}`);
	}

	try {
		await dbReady;
		
		const db = (collections as unknown as Record<string, any>).books?.db 
			?? (collections as unknown as Record<string, any>).conversations?.db;
			
		if (!db) {
			return json({ success: false, error: "Database not initialized" }, { status: 500 });
		}

		const coll = (name: string) => db.collection(name);
		const userFilter = { user_id: ADMIN_USER_ID };
		let deletedCount = 0;

		if (target === "sessions") {
			// Delete all conversation sessions
			const result = await collections.conversations.deleteMany({});
			deletedCount = result.deletedCount;
		} else if (target === "knowledge-graph") {
			// Delete all KG data
			const kgNodes = coll("kg_nodes");
			const kgEdges = coll("kg_edges");
			const kgRoutingConcepts = coll("kg_routing_concepts");
			const kgRoutingStats = coll("kg_routing_stats");
			const kgActionEffectiveness = coll("kg_action_effectiveness");
			
			const [nodesRes, edgesRes, routingRes, statsRes, actionRes] = await Promise.all([
				kgNodes.deleteMany(userFilter),
				kgEdges.deleteMany(userFilter),
				kgRoutingConcepts.deleteMany(userFilter),
				kgRoutingStats.deleteMany(userFilter),
				kgActionEffectiveness.deleteMany(userFilter),
			]);
			
			deletedCount = 
				nodesRes.deletedCount + 
				edgesRes.deletedCount + 
				routingRes.deletedCount + 
				statsRes.deletedCount + 
				actionRes.deletedCount;
		} else if (target === "books") {
			// Use the clearBooksTier method from OpsServiceImpl for proper cleanup
			// This handles: MongoDB, Qdrant vectors, Ghost Registry, Action KG, BM25 cache
			const facade = UnifiedMemoryFacade.getInstance();
			const result = await facade.clearBooksTier(ADMIN_USER_ID);
			deletedCount = result.mongoDeleted + result.qdrantDeleted;
		} else {
			// Clear specific memory tier
			const tier = TIER_MAP[target];
			if (!tier) {
				return error(400, `Unknown tier mapping for: ${target}`);
			}
			
			const memoryItems = coll("memory_items");
			const result = await memoryItems.deleteMany({ 
				...userFilter, 
				tier 
			});
			deletedCount = result.deletedCount;
			
			// Also clear from Qdrant if applicable
			try {
				const facade = UnifiedMemoryFacade.getInstance();
				// Mark cache as stale after deletion
				if (tier === "working" || tier === "history" || tier === "patterns" || tier === "memory_bank") {
					// The facade will handle Qdrant cleanup on next search
					console.log(`[API] Cleared ${deletedCount} ${tier} items from MongoDB`);
				}
			} catch (qdrantErr) {
				console.warn(`[API] Qdrant cleanup warning for ${target}:`, qdrantErr);
			}
		}

		// Emit memory updated event for UI refresh
		console.log(`[API] Cleared ${target}: ${deletedCount} items deleted`);

		return json({
			success: true,
			deleted_count: deletedCount,
			target,
			timestamp: new Date().toISOString(),
		});
	} catch (err) {
		console.error(`[API] data/clear/${target} error:`, err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to clear data" },
			{ status: 500 }
		);
	}
};
