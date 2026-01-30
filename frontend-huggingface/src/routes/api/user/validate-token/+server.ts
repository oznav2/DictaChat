import type { RequestHandler } from "./$types";

import { z } from "zod";

import { adminTokenManager } from "$lib/server/adminToken";
import { authCondition, singleUserAdminEnabled } from "$lib/server/auth";
import { collections } from "$lib/server/database";

const validateTokenSchema = z.object({
	token: z.string(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const { success, data } = validateTokenSchema.safeParse(await request.json());

	if (!success) {
		return new Response(JSON.stringify({ error: "Invalid token" }), { status: 400 });
	}

	const markWelcomeSeenForSession = async (): Promise<void> => {
		await collections.settings.updateOne(
			authCondition(locals),
			{
				$set: {
					welcomeModalSeenAt: new Date(),
					updatedAt: new Date(),
				},
				$setOnInsert: {
					createdAt: new Date(),
				},
			},
			{ upsert: true }
		);
	};

	if (singleUserAdminEnabled) {
		await markWelcomeSeenForSession();
		return new Response(JSON.stringify({ valid: true }));
	}

	if (adminTokenManager.checkToken(data.token, locals.sessionId)) {
		// Smooth dev UX: skip the welcome modal for admin CLI sessions.
		await markWelcomeSeenForSession();
		return new Response(JSON.stringify({ valid: true }));
	}

	return new Response(JSON.stringify({ valid: false }));
};
