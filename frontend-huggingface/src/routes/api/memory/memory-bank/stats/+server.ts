import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections, Database } from "$lib/server/database";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { config } from "$lib/server/config";
import { MEMORY_COLLECTIONS } from "$lib/server/memory/stores/schemas";

// GET /api/memory/memory-bank/stats - Get memory bank statistics
// Queries from BOTH the dedicated memoryBank collection AND the memory_items collection (tier=memory_bank)
export const GET: RequestHandler = async () => {
	try {
		// Query from dedicated memoryBank collection
		const [mbActive, mbArchived, mbTotal] = await Promise.all([
			collections.memoryBank.countDocuments({ userId: ADMIN_USER_ID, status: "active" }),
			collections.memoryBank.countDocuments({ userId: ADMIN_USER_ID, status: "archived" }),
			collections.memoryBank.countDocuments({ userId: ADMIN_USER_ID }),
		]);

		// Also query from memory_items collection (tier=memory_bank)
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);
		const itemsCollection = db.collection(MEMORY_COLLECTIONS.ITEMS);

		const [itemsActive, itemsArchived, itemsTotal] = await Promise.all([
			itemsCollection.countDocuments({
				user_id: ADMIN_USER_ID,
				tier: "memory_bank",
				status: "active",
			}),
			itemsCollection.countDocuments({
				user_id: ADMIN_USER_ID,
				tier: "memory_bank",
				status: "archived",
			}),
			itemsCollection.countDocuments({ user_id: ADMIN_USER_ID, tier: "memory_bank" }),
		]);

		// Combine counts (approximation - may have some overlap)
		const active = mbActive + itemsActive;
		const archived = mbArchived + itemsArchived;
		const total = mbTotal + itemsTotal;

		// Get unique tags from both collections
		const [mbTags, itemsTags] = await Promise.all([
			collections.memoryBank
				.aggregate([
					{ $match: { userId: ADMIN_USER_ID } },
					{ $unwind: "$tags" },
					{ $group: { _id: "$tags" } },
				])
				.toArray(),
			itemsCollection
				.aggregate([
					{ $match: { user_id: ADMIN_USER_ID, tier: "memory_bank" } },
					{ $unwind: "$tags" },
					{ $group: { _id: "$tags" } },
				])
				.toArray(),
		]);

		// Combine and deduplicate tags
		const allTagsSet = new Set<string>();
		for (const t of mbTags) {
			if (t._id) allTagsSet.add(t._id as string);
		}
		for (const t of itemsTags) {
			if (t._id) allTagsSet.add(t._id as string);
		}
		const tags = Array.from(allTagsSet).sort();

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
