import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { ADMIN_USER_ID } from "$lib/server/constants";

// GET /api/memory/memory-bank/stats - Get memory bank statistics
export const GET: RequestHandler = async () => {
	try {
		// Get counts
		const [active, archived, total] = await Promise.all([
			collections.memoryBank.countDocuments({ userId: ADMIN_USER_ID, status: "active" }),
			collections.memoryBank.countDocuments({ userId: ADMIN_USER_ID, status: "archived" }),
			collections.memoryBank.countDocuments({ userId: ADMIN_USER_ID }),
		]);

		// Get unique tags
		const tagAggregation = await collections.memoryBank
			.aggregate([
				{ $match: { userId: ADMIN_USER_ID } },
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
