import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";

// GET /api/memory/memory-bank/stats - Get memory bank statistics
export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.user?.id;

	// Return empty stats for unauthenticated users
	if (!userId) {
		return json({
			success: true,
			total_memories: 0,
			active: 0,
			archived: 0,
			unique_tags: 0,
			tags: [],
		});
	}

	try {
		// Get counts
		const [active, archived, total] = await Promise.all([
			collections.memoryBank.countDocuments({ userId, status: "active" }),
			collections.memoryBank.countDocuments({ userId, status: "archived" }),
			collections.memoryBank.countDocuments({ userId }),
		]);

		// Get unique tags
		const tagAggregation = await collections.memoryBank
			.aggregate([
				{ $match: { userId } },
				{ $unwind: "$tags" },
				{ $group: { _id: "$tags" } },
				{ $sort: { _id: 1 } },
			])
			.toArray();

		const tags = tagAggregation.map((t) => t._id as string);

		return json({
			success: true,
			total_memories: total,
			active,
			archived,
			unique_tags: tags.length,
			tags,
		});
	} catch (err) {
		console.error("[API] Failed to get memory bank stats:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get stats" },
			{ status: 500 }
		);
	}
};
