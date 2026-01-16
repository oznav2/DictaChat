/**
 * Document Recognition API Endpoint
 *
 * Enables cross-chat document recognition:
 * - Check if a document was already processed by its content hash
 * - Retrieve memories for known documents
 * - Provides user-facing messages about document status
 *
 * POST /api/memory/books/recognize
 * Body: { documentHash: string } or { content: string } (will hash)
 *
 * Response:
 * {
 *   success: true,
 *   recognized: true/false,
 *   document?: {
 *     bookId, title, author, chunkCount, preview, processedAt
 *   },
 *   message?: string,
 *   messageHe?: string
 * }
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createHash } from "crypto";

// Dynamic import to avoid circular dependencies
async function getDocumentRecognitionService() {
	const { Database } = await import("$lib/server/database");
	const { MemoryMongoStore } = await import("$lib/server/memory/stores/MemoryMongoStore");
	const { DocumentRecognitionService } = await import(
		"$lib/server/memory/services/DocumentRecognitionService"
	);

	const db = await Database.getInstance();
	const client = db.getClient();

	const mongoStore = new MemoryMongoStore({
		client,
		dbName: "chat-ui",
	});
	await mongoStore.initialize();

	return new DocumentRecognitionService({ mongoStore });
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { documentHash, content, userId } = body as {
			documentHash?: string;
			content?: string;
			userId?: string;
		};

		// Use admin user if not specified (for backwards compatibility)
		const { ADMIN_USER_ID } = await import("$lib/server/constants");
		const effectiveUserId = userId || ADMIN_USER_ID;

		// Calculate hash if content provided instead of hash
		let hash = documentHash;
		if (!hash && content) {
			hash = createHash("sha256").update(content).digest("hex");
		}

		if (!hash) {
			return error(400, "Either documentHash or content must be provided");
		}

		const recognitionService = await getDocumentRecognitionService();
		const result = await recognitionService.recognizeDocument(effectiveUserId, hash);

		if (!result.isKnown) {
			return json({
				success: true,
				recognized: false,
				message: "Document not found in memory system",
				messageHe: "המסמך לא נמצא במערכת הזיכרון",
			});
		}

		return json({
			success: true,
			recognized: true,
			document: {
				bookId: result.bookId,
				title: result.title,
				author: result.author,
				chunkCount: result.chunkCount,
				preview: result.preview,
				processedAt: result.processedAt,
			},
			message: result.userMessage,
			messageHe: result.userMessageHe,
		});
	} catch (err) {
		console.error("[API] Document recognition failed:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Document recognition failed",
			},
			{ status: 500 }
		);
	}
};

/**
 * GET endpoint to check document existence by hash (query param)
 * GET /api/memory/books/recognize?hash=<documentHash>
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const hash = url.searchParams.get("hash");
		const userId = url.searchParams.get("userId");

		if (!hash) {
			return error(400, "hash query parameter is required");
		}

		const { ADMIN_USER_ID } = await import("$lib/server/constants");
		const effectiveUserId = userId || ADMIN_USER_ID;

		const recognitionService = await getDocumentRecognitionService();
		const result = await recognitionService.recognizeDocument(effectiveUserId, hash);

		return json({
			success: true,
			recognized: result.isKnown,
			document: result.isKnown
				? {
						bookId: result.bookId,
						title: result.title,
						author: result.author,
						chunkCount: result.chunkCount,
						processedAt: result.processedAt,
					}
				: undefined,
			message: result.isKnown ? result.userMessage : "Document not found",
		});
	} catch (err) {
		console.error("[API] Document recognition check failed:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Recognition check failed",
			},
			{ status: 500 }
		);
	}
};
