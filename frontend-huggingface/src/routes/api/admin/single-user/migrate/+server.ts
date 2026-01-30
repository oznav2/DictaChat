import type { RequestHandler } from "./$types";

import { json } from "@sveltejs/kit";

import { getSingleUserSessionId, singleUserAdminEnabled } from "$lib/server/auth";
import { collections } from "$lib/server/database";

export const POST: RequestHandler = async ({ locals }) => {
	if (!singleUserAdminEnabled || !locals.isAdmin) {
		return json({ success: false, error: "Not allowed" }, { status: 403 });
	}

	const targetSessionId = await getSingleUserSessionId();
	const sessionScopedFilter = { sessionId: { $exists: true }, userId: { $exists: false } };

	const [conversations, settings, assistants, userPersonality, books] = await Promise.all([
		collections.conversations.updateMany(sessionScopedFilter, {
			$set: { sessionId: targetSessionId, updatedAt: new Date() },
		}),
		collections.settings.updateMany(sessionScopedFilter, {
			$set: { sessionId: targetSessionId, updatedAt: new Date() },
			$setOnInsert: { createdAt: new Date() },
		}),
		collections.assistants.updateMany(sessionScopedFilter, {
			$set: { sessionId: targetSessionId, updatedAt: new Date() },
			$setOnInsert: { createdAt: new Date() },
		}),
		collections.userPersonality.updateMany(sessionScopedFilter, {
			$set: { sessionId: targetSessionId, updatedAt: new Date() },
			$setOnInsert: { createdAt: new Date() },
		}),
		collections.books.updateMany(sessionScopedFilter, {
			$set: { sessionId: targetSessionId, updatedAt: new Date() },
			$setOnInsert: { createdAt: new Date() },
		}),
	]);

	// Sessions collection has a unique index on sessionId. Collapse to one stable session.
	await collections.sessions.deleteMany({ sessionId: { $ne: targetSessionId } });
	await collections.sessions.updateOne(
		{ sessionId: targetSessionId },
		{
			$set: { sessionId: targetSessionId, updatedAt: new Date() },
			$setOnInsert: { createdAt: new Date() },
		},
		{ upsert: true }
	);

	return json({
		success: true,
		targetSessionId,
		results: {
			conversations: { matched: conversations.matchedCount, modified: conversations.modifiedCount },
			settings: { matched: settings.matchedCount, modified: settings.modifiedCount },
			assistants: { matched: assistants.matchedCount, modified: assistants.modifiedCount },
			userPersonality: {
				matched: userPersonality.matchedCount,
				modified: userPersonality.modifiedCount,
			},
			books: { matched: books.matchedCount, modified: books.modifiedCount },
		},
	});
};
