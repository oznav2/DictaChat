/**
 * Memory Growth API - Returns memory accumulation data over time
 *
 * GET /api/memory/growth?days=30
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Database } from "$lib/server/database";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { config } from "$lib/server/config";

interface GrowthDataPoint {
	date: string;
	totalMemories: number;
	bySource: Record<string, number>;
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const days = parseInt(url.searchParams.get("days") || "30");

		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		// Aggregate memories by date and source
		// Handle both `created_at` (schema) and `timestamps.created_at` (legacy) formats
		const pipeline = [
			{ $match: { user_id: ADMIN_USER_ID } },
			{
				$addFields: {
					// Normalize date field - try created_at first, fall back to timestamps.created_at
					_normalizedDate: {
						$cond: {
							if: { $ne: ["$created_at", null] },
							then: "$created_at",
							else: { $ifNull: ["$timestamps.created_at", new Date()] },
						},
					},
				},
			},
			{
				$group: {
					_id: {
						date: { $dateToString: { format: "%Y-%m-%d", date: "$_normalizedDate" } },
						source: { $ifNull: ["$source.tool_name", "manual"] },
					},
					count: { $sum: 1 },
				},
			},
			{ $sort: { "_id.date": 1 } },
		];

		const memoryItems = db.collection("memory_items");
		const results = await memoryItems.aggregate(pipeline).toArray();

		// Transform to cumulative growth data
		const byDate = new Map<string, { total: number; bySource: Record<string, number> }>();
		let runningTotal = 0;

		for (const r of results) {
			const date = r._id.date;
			const source = r._id.source || "manual";
			const count = r.count;

			if (!byDate.has(date)) {
				byDate.set(date, { total: runningTotal, bySource: {} });
			}

			const entry = byDate.get(date)!;
			entry.bySource[source] = (entry.bySource[source] || 0) + count;
			runningTotal += count;
			entry.total = runningTotal;
		}

		// Fill in missing dates with last known total
		const data: GrowthDataPoint[] = [];
		const sortedDates = Array.from(byDate.keys()).sort();

		if (sortedDates.length > 0) {
			const startDate = new Date(sortedDates[0]);
			const endDate = new Date();
			let lastTotal = 0;
			let lastBySource: Record<string, number> = {};

			for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
				const dateStr = d.toISOString().split("T")[0];
				const entry = byDate.get(dateStr);

				if (entry) {
					lastTotal = entry.total;
					lastBySource = { ...lastBySource, ...entry.bySource };
				}

				data.push({
					date: dateStr,
					totalMemories: lastTotal,
					bySource: { ...lastBySource },
				});
			}
		}

		// Return last N days
		const result = data.slice(-days);

		return json(result);
	} catch (err) {
		console.error("[API] Growth stats failed:", err);
		return json([], { status: 500 });
	}
};
