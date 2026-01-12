import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";

// POST /api/memory/ghost - Ghost (soft-delete) a memory
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { memoryId, tier, reason } = await request.json();

		if (!memoryId || typeof memoryId !== "string") {
			return error(400, "memoryId is required");
		}

		if (!tier || typeof tier !== "string") {
			return error(400, "tier is required");
		}

		const facade = UnifiedMemoryFacade.getInstance();
		const success = await facade.ghostMemory({
			userId: ADMIN_USER_ID,
			memoryId,
			tier,
			reason: reason || "user_action",
		});

		if (success) {
			return json({
				success: true,
				message: "Memory ghosted successfully",
			});
		} else {
			return json(
				{
					success: false,
					error: "Failed to ghost memory",
				},
				{ status: 500 }
			);
		}
	} catch (err) {
		console.error("[API] Failed to ghost memory:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to ghost memory",
			},
			{ status: 500 }
		);
	}
};

// DELETE /api/memory/ghost - Restore a ghosted memory
export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { memoryId } = await request.json();

		if (!memoryId || typeof memoryId !== "string") {
			return error(400, "memoryId is required");
		}

		const facade = UnifiedMemoryFacade.getInstance();
		const success = await facade.restoreMemory(ADMIN_USER_ID, memoryId);

		if (success) {
			return json({
				success: true,
				message: "Memory restored successfully",
			});
		} else {
			return json(
				{
					success: false,
					error: "Failed to restore memory",
				},
				{ status: 500 }
			);
		}
	} catch (err) {
		console.error("[API] Failed to restore memory:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to restore memory",
			},
			{ status: 500 }
		);
	}
};

// GET /api/memory/ghost - List ghosted memories
export const GET: RequestHandler = async () => {
	try {
		const facade = UnifiedMemoryFacade.getInstance();
		const ghostedMemories = await facade.getGhostedMemories(ADMIN_USER_ID);

		return json({
			success: true,
			memories: ghostedMemories,
		});
	} catch (err) {
		console.error("[API] Failed to list ghosted memories:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to list ghosted memories",
			},
			{ status: 500 }
		);
	}
};
