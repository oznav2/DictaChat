import type { RequestHandler } from "./$types";

import { z } from "zod";

import { json, error } from "@sveltejs/kit";

import { ADMIN_USER_ID } from "$lib/server/constants";
import { UnifiedMemoryFacade } from "$lib/server/memory";

const bodySchema = z.object({
	conversationId: z.string().min(1).optional().default("perf"),
	query: z.string().min(1),
	recentMessages: z
		.array(
			z.object({
				role: z.string().min(1),
				content: z.string(),
			})
		)
		.optional()
		.default([]),
	hasDocuments: z.boolean().optional().default(false),
	includeDataGov: z.boolean().optional(),
	tokenBudget: z.number().int().positive().optional(),
	limit: z.number().int().positive().max(200).optional(),
	includeContext: z.boolean().optional().default(false),
});

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();

	try {
		const body = bodySchema.parse(await request.json());
		const facade = UnifiedMemoryFacade.getInstance();

		const result = await facade.prefetchContext({
			userId: ADMIN_USER_ID,
			conversationId: body.conversationId,
			query: body.query,
			recentMessages: body.recentMessages,
			hasDocuments: body.hasDocuments,
			limit: body.limit,
			includeDataGov: body.includeDataGov,
			tokenBudget: body.tokenBudget,
		});

		return json({
			success: true,
			latencyMs: Date.now() - startTime,
			retrievalConfidence: result.retrievalConfidence,
			retrievalDebug: result.retrievalDebug,
			memoryContextInjection: body.includeContext ? result.memoryContextInjection : null,
		});
	} catch (err) {
		if (err instanceof z.ZodError) {
			return error(400, err.message);
		}

		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Prefetch failed",
				latencyMs: Date.now() - startTime,
			},
			{ status: 500 }
		);
	}
};
