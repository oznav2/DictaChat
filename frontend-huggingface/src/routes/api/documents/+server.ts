/**
 * Documents API - Unified document library endpoint
 *
 * GET /api/documents - List all documents (books with enhanced fields)
 * POST /api/documents/check-url - Check if URL is already processed
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { checkUrlRegistry, registerUrl } from "$lib/server/documents/DocumentRegistry";

// GET /api/documents - List all documents with enhanced fields
export const GET: RequestHandler = async ({ url }) => {
	const sourceType = url.searchParams.get("sourceType"); // filter by source type
	const language = url.searchParams.get("language"); // filter by language
	const limit = parseInt(url.searchParams.get("limit") || "50");
	const skip = parseInt(url.searchParams.get("skip") || "0");

	try {
		const filter: Record<string, unknown> = { userId: ADMIN_USER_ID };

		if (sourceType) {
			filter.sourceType = sourceType;
		}
		if (language) {
			filter.language = language;
		}

		const [documents, total] = await Promise.all([
			collections.books
				.find(filter)
				.sort({ uploadTimestamp: -1 })
				.skip(skip)
				.limit(limit)
				.toArray(),
			collections.books.countDocuments(filter),
		]);

		return json({
			success: true,
			documents: documents.map((doc) => ({
				id: doc._id.toString(),
				title: doc.title,
				author: doc.author,
				description: doc.description,
				sourceType: doc.sourceType || "upload",
				sourceUrl: doc.sourceUrl,
				language: doc.language,
				status: doc.status,
				uploadTimestamp: doc.uploadTimestamp?.toISOString(),
				numPages: doc.numPages,
				fileType: doc.fileType,
				accessCount: doc.accessCount || 0,
				lastAccessedAt: doc.lastAccessedAt?.toISOString(),
			})),
			total,
			hasMore: skip + documents.length < total,
		});
	} catch (err) {
		console.error("[API] Failed to list documents:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to list documents" },
			{ status: 500 }
		);
	}
};

// POST /api/documents/check-url - Check if URL is already processed (<50ms target)
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { url: targetUrl, action } = await request.json();

		if (!targetUrl || typeof targetUrl !== "string") {
			return error(400, "URL is required");
		}

		// Fast URL lookup
		const result = await checkUrlRegistry(targetUrl);

		if (action === "register" && !result.found) {
			// Queue for processing (register as pending)
			const { ObjectId } = await import("mongodb");
			const bookId = new ObjectId();

			// Create placeholder book record
			await collections.books.insertOne({
				_id: bookId,
				userId: ADMIN_USER_ID,
				title: new URL(targetUrl).hostname,
				author: "Web",
				sourceUrl: targetUrl,
				sourceType: "web",
				status: "processing",
				uploadTimestamp: new Date(),
				totalChunks: 0,
				chunksProcessed: 0,
				taskId: bookId.toString(),
			});

			// Register in URL registry
			await registerUrl(targetUrl, bookId.toString(), "processing");

			return json({
				success: true,
				found: false,
				queued: true,
				bookId: bookId.toString(),
				message: "URL queued for Docling processing",
			});
		}

		return json({
			success: true,
			found: result.found,
			bookId: result.bookId,
			status: result.status,
		});
	} catch (err) {
		console.error("[API] URL check failed:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "URL check failed" },
			{ status: 500 }
		);
	}
};
