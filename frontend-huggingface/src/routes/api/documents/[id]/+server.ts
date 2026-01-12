/**
 * Documents API - Individual document endpoint
 *
 * GET /api/documents/[id] - Get full document with content
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { ADMIN_USER_ID } from "$lib/server/constants";

// GET /api/documents/[id] - Get full document content
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	if (!id) {
		return error(400, "Document ID is required");
	}

	try {
		if (!ObjectId.isValid(id)) {
			return error(400, "Invalid document ID format");
		}

		const doc = await collections.books.findOne({
			_id: new ObjectId(id),
			userId: ADMIN_USER_ID,
		});

		if (!doc) {
			return error(404, "Document not found");
		}

		// Update access stats
		await collections.books.updateOne(
			{ _id: new ObjectId(id) },
			{
				$set: { lastAccessedAt: new Date() },
				$inc: { accessCount: 1 },
			}
		);

		return json({
			id: doc._id.toString(),
			title: doc.title,
			author: doc.author,
			sourceUrl: doc.sourceUrl,
			sourceType: doc.sourceType || "upload",
			language: doc.language,
			parsedMarkdown: doc.parsedMarkdown,
			summary: doc.summary,
			keyPoints: doc.keyPoints,
			numPages: doc.numPages,
			fileType: doc.fileType,
			uploadTimestamp: doc.uploadTimestamp?.toISOString(),
			status: doc.status,
		});
	} catch (err) {
		console.error("[API] Failed to get document:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get document" },
			{ status: 500 }
		);
	}
};
