import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";

// POST /api/memory/feedback - Submit feedback for a response
export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.user?.id;
	if (!userId) {
		return error(401, "Authentication required");
	}

	try {
		const body = await request.json();
		const { messageId, conversationId, score, citations } = body;

		if (!messageId || typeof score !== "number") {
			return error(400, "messageId and score are required");
		}

		if (score !== -1 && score !== 0 && score !== 1) {
			return error(400, "score must be -1, 0, or 1");
		}

		const facade = UnifiedMemoryFacade.getInstance();

		// Record feedback for each citation
		if (Array.isArray(citations) && citations.length > 0) {
			for (const memoryId of citations) {
				if (typeof memoryId === "string") {
					await facade.recordFeedback({
						userId,
						memoryId,
						score,
						conversationId,
						messageId,
					});
				}
			}
		}

		// Also record general response feedback
		await facade.recordResponseFeedback({
			userId,
			conversationId,
			messageId,
			score,
			citationCount: citations?.length ?? 0,
		});

		return json({
			success: true,
			message: "Feedback recorded",
			score,
			citationsScored: citations?.length ?? 0,
		});
	} catch (err) {
		console.error("[API] Failed to record feedback:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to record feedback" },
			{ status: 500 }
		);
	}
};
