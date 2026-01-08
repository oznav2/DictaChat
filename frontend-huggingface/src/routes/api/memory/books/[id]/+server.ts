import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { UnifiedMemoryFacade } from "$lib/server/memory";

// GET /api/memory/books/[id] - Get book details
export const GET: RequestHandler = async ({ params, locals }) => {
	const userId = locals.user?.id;
	if (!userId) {
		return error(401, "Authentication required");
	}

	const { id } = params;
	if (!id) {
		return error(400, "Book ID is required");
	}

	try {
		const book = await collections.books.findOne({
			_id: id as unknown as import("mongodb").ObjectId,
			userId,
		});

		if (!book) {
			return error(404, "Book not found");
		}

		return json({
			success: true,
			book: {
				book_id: book._id.toString(),
				title: book.title,
				author: book.author,
				upload_timestamp: book.uploadTimestamp?.toISOString(),
				processing_stats: {
					total_chunks: book.totalChunks,
					chunks_processed: book.chunksProcessed,
				},
				status: book.status,
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

// DELETE /api/memory/books/[id] - Delete book and all its chunks
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const userId = locals.user?.id;
	if (!userId) {
		return error(401, "Authentication required");
	}

	const { id } = params;
	if (!id) {
		return error(400, "Book ID is required");
	}

	try {
		// First check if book exists
		const book = await collections.books.findOne({
			_id: id as unknown as import("mongodb").ObjectId,
			userId,
		});

		if (!book) {
			return error(404, "Book not found");
		}

		// Remove all book chunks from memory
		const facade = UnifiedMemoryFacade.getInstance();
		await facade.removeBook({ userId, bookId: id });

		// Delete book record
		await collections.books.deleteOne({
			_id: id as unknown as import("mongodb").ObjectId,
			userId,
		});

		return json({
			success: true,
			message: "Book deleted successfully",
		});
	} catch (err) {
		console.error("[API] Failed to delete book:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to delete book" },
			{ status: 500 }
		);
	}
};
