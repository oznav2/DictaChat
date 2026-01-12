import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { ADMIN_USER_ID } from "$lib/server/constants";

// PUT /api/memory/memory-bank/[id] - Update memory (archive/restore)
export const PUT: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	if (!id || !ObjectId.isValid(id)) {
		return error(400, "Invalid memory ID");
	}

	try {
		const { status, archived_reason, tags } = await request.json();

		const updateData: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (status === "archived") {
			updateData.status = "archived";
			updateData.archivedAt = new Date();
			updateData.archivedReason = archived_reason || "user_action";
		} else if (status === "active") {
			updateData.status = "active";
			updateData.archivedAt = null;
			updateData.archivedReason = null;
		}

		if (tags !== undefined) {
			updateData.tags = tags;
		}

		const result = await collections.memoryBank.updateOne(
			{ _id: new ObjectId(id), userId: ADMIN_USER_ID },
			{ $set: updateData }
		);

		if (result.matchedCount === 0) {
			return error(404, "Memory not found");
		}

		return json({
			success: true,
			message: "Memory updated",
		});
	} catch (err) {
		console.error("[API] Failed to update memory:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to update memory" },
			{ status: 500 }
		);
	}
};

// DELETE /api/memory/memory-bank/[id] - Delete memory permanently
export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;
	if (!id || !ObjectId.isValid(id)) {
		return error(400, "Invalid memory ID");
	}

	try {
		const result = await collections.memoryBank.deleteOne({
			_id: new ObjectId(id),
			userId: ADMIN_USER_ID,
		});

		if (result.deletedCount === 0) {
			return error(404, "Memory not found");
		}

		return json({
			success: true,
			message: "Memory deleted",
		});
	} catch (err) {
		console.error("[API] Failed to delete memory:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to delete memory" },
			{ status: 500 }
		);
	}
};
