import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections, Database } from "$lib/server/database";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ObjectId } from "mongodb";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { hashUrl } from "$lib/server/documents/DocumentRegistry";

// GET /api/memory/books/[id] - Get book details
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;
	if (!id) {
		return error(400, "Book ID is required");
	}

	try {
		// Validate ObjectId format
		if (!ObjectId.isValid(id)) {
			return error(400, "Invalid book ID format");
		}

		const book = await collections.books.findOne({
			_id: new ObjectId(id),
			userId: ADMIN_USER_ID,
		});

		if (!book) {
			return error(404, "Book not found");
		}

		// Update access stats for document tracking
		await collections.books.updateOne(
			{ _id: new ObjectId(id) },
			{
				$set: { lastAccessedAt: new Date() },
				$inc: { accessCount: 1 },
			}
		);

		return json({
			success: true,
			book: {
				id: book._id.toString(),
				title: book.title,
				author: book.author,
				uploadTimestamp: book.uploadTimestamp?.toISOString(),
				processing_stats: {
					total_chunks: book.totalChunks,
					chunks_processed: book.chunksProcessed,
				},
				status: book.status,
				processingStage: book.processingStage,
				processingMessage: book.processingMessage,
				doclingStatus: book.doclingStatus,
				doclingTaskId: book.doclingTaskId,
				error: book.error,
				// Enhanced document fields
				sourceUrl: book.sourceUrl,
				sourceType: book.sourceType || "upload",
				language: book.language,
				summary: book.summary,
				keyPoints: book.keyPoints,
				parsedMarkdown: book.parsedMarkdown,
				numPages: book.numPages,
				fileType: book.fileType,
			},
		});
	} catch (err) {
		console.error("[API] Failed to get book:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get book" },
			{ status: 500 }
		);
	}
};

// DELETE /api/memory/books/[id] - Delete book and ALL traces
export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;
	if (!id) {
		return error(400, "Book ID is required");
	}

	try {
		// Validate ObjectId format
		if (!ObjectId.isValid(id)) {
			return error(400, "Invalid book ID format");
		}

		// First check if book exists
		const book = await collections.books.findOne({
			_id: new ObjectId(id),
			userId: ADMIN_USER_ID,
		});

		if (!book) {
			return error(404, "Book not found");
		}

		// Remove all book chunks from memory system (memory_items, versions, outcomes, kg_nodes, qdrant)
		const facade = UnifiedMemoryFacade.getInstance();
		await facade.removeBook({ userId: ADMIN_USER_ID, bookId: id });

		// Clean up document_registry if book has sourceUrl
		if (book.sourceUrl) {
			const urlHash = hashUrl(book.sourceUrl);
			const database = await Database.getInstance();
			const client = database.getClient();
			const db = client.db("chat-ui");
			await db.collection("document_registry").deleteOne({ urlHash });
			console.log(`[API] Deleted document_registry entry for urlHash: ${urlHash}`);
		}

		// Clean up RAG collections (bricksllm database) by documentHash
		if (book.documentHash) {
			try {
				const database = await Database.getInstance();
				const client = database.getClient();
				const ragDb = client.db("bricksllm");

				// Find and delete document_contexts by hash
				const context = await ragDb
					.collection("document_contexts")
					.findOne({ documentHash: book.documentHash });

				if (context) {
					const conversationId = context.conversationId;
					// Delete chunks, context, and memory
					await ragDb.collection("document_chunks").deleteMany({ conversationId });
					await ragDb
						.collection("document_contexts")
						.deleteOne({ documentHash: book.documentHash });
					await ragDb.collection("conversation_memory").deleteOne({ conversationId });
					console.log(`[API] Deleted RAG data for documentHash: ${book.documentHash}`);
				}
			} catch (ragErr) {
				console.warn("[API] RAG cleanup failed (non-blocking):", ragErr);
			}
		}

		// Delete book record
		await collections.books.deleteOne({
			_id: new ObjectId(id),
			userId: ADMIN_USER_ID,
		});

		return json({
			success: true,
			message: "Book and all traces deleted successfully",
		});
	} catch (err) {
		console.error("[API] Failed to delete book:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to delete book" },
			{ status: 500 }
		);
	}
};
