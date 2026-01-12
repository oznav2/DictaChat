import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";

/**
 * Score Hook API - Records user feedback for memory scoring
 *
 * POST /api/hooks/score
 *
 * This hook allows recording feedback scores for memories used in a response.
 * The score is used to improve memory retrieval and ranking over time.
 *
 * Score values:
 *  -1 = negative feedback (unhelpful, wrong, irrelevant)
 *   0 = neutral feedback (neither helpful nor harmful)
 *   1 = positive feedback (helpful, correct, relevant)
 */

export interface ScoreRequest {
	messageId: string;
	conversationId: string;
	score: -1 | 0 | 1;
	memoryIds: string[];
	feedback?: string; // Optional text feedback
}

export interface ScoreResponse {
	updated: number;
	success: boolean;
	messageId: string;
	timestamp: string;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body: ScoreRequest = await request.json();
		const { messageId, conversationId, score, memoryIds, feedback } = body;

		// Validate required fields
		if (!messageId || typeof messageId !== "string") {
			return error(400, "messageId is required");
		}

		if (!conversationId || typeof conversationId !== "string") {
			return error(400, "conversationId is required");
		}

		if (typeof score !== "number" || ![-1, 0, 1].includes(score)) {
			return error(400, "score must be -1, 0, or 1");
		}

		if (!Array.isArray(memoryIds)) {
			return error(400, "memoryIds must be an array");
		}

		const facade = UnifiedMemoryFacade.getInstance();
		let updated = 0;

		// Record feedback for each memory that was cited
		if (memoryIds.length > 0) {
			for (const memoryId of memoryIds) {
				if (typeof memoryId === "string" && memoryId.trim()) {
					try {
						await facade.recordFeedback({
							userId: ADMIN_USER_ID,
							memoryId: memoryId.trim(),
							score: score as -1 | 0 | 1,
							conversationId,
							messageId,
						});
						updated++;
					} catch (err) {
						console.warn(`[API] Failed to record feedback for memory ${memoryId}:`, err);
						// Continue with other memories even if one fails
					}
				}
			}
		}

		// Record general response feedback (for analytics)
		await facade.recordResponseFeedback({
			userId: ADMIN_USER_ID,
			conversationId,
			messageId,
			score: score as -1 | 0 | 1,
			citationCount: memoryIds.length,
		});

		// Log feedback for analytics
		console.log(`[Score] User ${ADMIN_USER_ID} scored ${memoryIds.length} memories with ${score}`, {
			messageId,
			conversationId,
			memoryIds,
			feedback: feedback?.slice(0, 100), // Truncate for logging
		});

		return json({
			updated,
			success: true,
			messageId,
			timestamp: new Date().toISOString(),
		} satisfies ScoreResponse);
	} catch (err) {
		console.error("[API] Score hook failed:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Score hook failed",
				updated: 0,
			},
			{ status: 500 }
		);
	}
};

/**
 * GET endpoint for retrieving scoring status
 * Useful for checking if a message has already been scored
 */
export const GET: RequestHandler = async ({ url }) => {
	const messageId = url.searchParams.get("messageId");
	const conversationId = url.searchParams.get("conversationId");

	if (!messageId) {
		return error(400, "messageId parameter is required");
	}

	// For now, return a simple status
	// In a full implementation, this would query the database for existing scores
	return json({
		messageId,
		conversationId,
		scored: false, // Would be determined by querying feedback records
		timestamp: null,
	});
};
