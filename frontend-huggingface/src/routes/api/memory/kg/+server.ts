import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { KnowledgeGraphService } from "$lib/server/memory/kg";

// GET /api/memory/kg - Get knowledge graph data
export const GET: RequestHandler = async ({ url, locals }) => {
	const userId = locals.user?.id;

	// Return empty data for unauthenticated users
	if (!userId) {
		return json({
			success: true,
			concepts: [],
			actionEffectiveness: [],
		});
	}

	try {
		const timeFilter = url.searchParams.get("timeFilter") || "all";
		const sortBy = url.searchParams.get("sortBy") || "hybrid";
		const limit = parseInt(url.searchParams.get("limit") || "50", 10);

		const kgService = KnowledgeGraphService.getInstance();

		// Get concepts with filtering
		const concepts = await kgService.getConcepts({
			userId,
			timeFilter: timeFilter as "day" | "week" | "month" | "all",
			sortBy: sortBy as "frequency" | "recency" | "hybrid",
			limit,
		});

		// Get action effectiveness data
		const actionEffectiveness = await kgService.getActionEffectiveness({ userId });

		return json({
			success: true,
			concepts,
			actionEffectiveness,
		});
	} catch (err) {
		console.error("[API] Failed to get knowledge graph:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get KG data" },
			{ status: 500 }
		);
	}
};

// POST /api/memory/kg/concept - Record a concept interaction
export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.user?.id;
	if (!userId) {
		return error(401, "Authentication required");
	}

	try {
		const { concept, type, outcome } = await request.json();

		if (!concept || !type) {
			return error(400, "concept and type are required");
		}

		const kgService = KnowledgeGraphService.getInstance();
		await kgService.recordConceptInteraction({
			userId,
			concept,
			type,
			outcome,
		});

		return json({
			success: true,
			message: "Concept interaction recorded",
		});
	} catch (err) {
		console.error("[API] Failed to record concept:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to record concept" },
			{ status: 500 }
		);
	}
};
