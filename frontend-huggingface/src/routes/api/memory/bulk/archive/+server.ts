import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { collections } from "$lib/server/database";
import { ADMIN_USER_ID } from "$lib/server/constants";

const bodySchema = z.object({
	ids: z.array(z.string()).min(1).max(500),
	archived_reason: z.string().trim().min(1).max(100).optional(),
});

export const POST: RequestHandler = async ({ request }) => {
	const body = bodySchema.parse(await request.json());
	const ids = body.ids;

	if (!ids.every((id) => ObjectId.isValid(id))) {
		return error(400, "Invalid memory ID");
	}

	const objectIds = ids.map((id) => new ObjectId(id));
	const now = new Date();

	const result = await collections.memoryBank.updateMany(
		{ _id: { $in: objectIds }, userId: ADMIN_USER_ID },
		{
			$set: {
				status: "archived",
				archivedAt: now,
				archivedReason: body.archived_reason ?? "user_action",
				updatedAt: now,
			},
		}
	);

	return json({
		success: true,
		matched: result.matchedCount,
		modified: result.modifiedCount,
	});
};

