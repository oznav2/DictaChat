import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { UnifiedMemoryFacade } from "$lib/server/memory";

// GET /api/memory/memory-bank - List memory bank items
export const GET: RequestHandler = async ({ url, locals }) => {
	const userId = locals.user?.id;

	// Return empty list for unauthenticated users
	if (!userId) {
		return json({
			success: true,
			memories: [],
			total: 0,
		});
	}

	try {
		const status = url.searchParams.get("status") || "active";
		const tag = url.searchParams.get("tag");
		const limit = parseInt(url.searchParams.get("limit") || "100", 10);
		const offset = parseInt(url.searchParams.get("offset") || "0", 10);

		const query: Record<string, unknown> = {
			userId,
			status: status === "archived" ? "archived" : "active",
		};

		if (tag) {
			query.tags = tag;
		}

		const memories = await collections.memoryBank
			.find(query)
			.sort({ createdAt: -1 })
			.skip(offset)
			.limit(limit)
			.toArray();

		const total = await collections.memoryBank.countDocuments(query);

		return json({
			success: true,
			memories: memories.map((m) => ({
				id: m._id.toString(),
				text: m.text,
				tags: m.tags || [],
				status: m.status,
				created_at: m.createdAt?.toISOString(),
				archived_at: m.archivedAt?.toISOString(),
				archived_reason: m.archivedReason,
			})),
			total,
		});
	} catch (err) {
		console.error("[API] Failed to list memory bank:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to list memories" },
			{ status: 500 }
		);
	}
};

// POST /api/memory/memory-bank - Add to memory bank
export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.user?.id;
	if (!userId) {
		return error(401, "Authentication required");
	}

	try {
		const { text, tags, importance } = await request.json();

		if (!text || typeof text !== "string") {
			return error(400, "text is required");
		}

		const facade = UnifiedMemoryFacade.getInstance();
		const result = await facade.store({
			userId,
			tier: "memory_bank",
			text,
			tags: tags || [],
			importance: importance || 0.8,
		});

		return json({
			success: true,
			id: result.id,
			message: "Added to memory bank",
		});
	} catch (err) {
		console.error("[API] Failed to add to memory bank:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to add to memory bank",
			},
			{ status: 500 }
		);
	}
};
