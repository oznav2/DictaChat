/**
 * GET /api/data/stats - Get comprehensive data statistics for Data Management UI
 *
 * RoamPal parity: /api/data/stats
 * Returns counts for all memory tiers, sessions, and knowledge graph
 */
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections, ready as dbReady } from "$lib/server/database";
import { ADMIN_USER_ID } from "$lib/server/constants";

interface DataStats {
	memory_bank: { count: number; active: number; archived: number };
	working: { count: number };
	history: { count: number };
	patterns: { count: number };
	books: { count: number };
	sessions: { count: number };
	knowledge_graph: { nodes: number; edges: number };
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	try {
		await dbReady;

		const db =
			(collections as unknown as Record<string, any>).books?.db ??
			(collections as unknown as Record<string, any>).conversations?.db;

		if (!db) {
			return json({ success: false, error: "Database not initialized" }, { status: 500 });
		}

		const coll = (name: string) => db.collection(name);
		const userFilter = { user_id: ADMIN_USER_ID };

		// Memory bank counts
		const memoryBank = coll("memory_items");
		const memoryBankAll = await memoryBank.countDocuments({
			...userFilter,
			tier: "memory_bank",
		});
		const memoryBankActive = await memoryBank.countDocuments({
			...userFilter,
			tier: "memory_bank",
			status: "active",
		});
		const memoryBankArchived = await memoryBank.countDocuments({
			...userFilter,
			tier: "memory_bank",
			status: "archived",
		});

		// Tier counts
		const workingCount = await memoryBank.countDocuments({
			...userFilter,
			tier: "working",
		});
		const historyCount = await memoryBank.countDocuments({
			...userFilter,
			tier: "history",
		});
		const patternsCount = await memoryBank.countDocuments({
			...userFilter,
			tier: "patterns",
		});
		const booksCount = await memoryBank.countDocuments({
			...userFilter,
			tier: "books",
		});

		// Sessions count (conversations)
		const sessionsCount = await collections.conversations.countDocuments({});

		// Knowledge graph counts
		const kgNodes = coll("kg_nodes");
		const kgEdges = coll("kg_edges");
		const nodesCount = await kgNodes.countDocuments(userFilter);
		const edgesCount = await kgEdges.countDocuments(userFilter);

		const stats: DataStats = {
			memory_bank: {
				count: memoryBankAll,
				active: memoryBankActive,
				archived: memoryBankArchived,
			},
			working: { count: workingCount },
			history: { count: historyCount },
			patterns: { count: patternsCount },
			books: { count: booksCount },
			sessions: { count: sessionsCount },
			knowledge_graph: {
				nodes: nodesCount,
				edges: edgesCount,
			},
		};

		return json(stats);
	} catch (err) {
		console.error("[API] data/stats error:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get stats" },
			{ status: 500 }
		);
	}
};
