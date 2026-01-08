import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";

// GET /api/memory/books - List uploaded books
export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.user?.id;

	// Return empty list for unauthenticated users
	if (!userId) {
		return json({
			success: true,
			books: [],
		});
	}

	try {
		const books = await collections.books.find({ userId }).sort({ uploadTimestamp: -1 }).toArray();

		return json({
			success: true,
			books: books.map((b) => ({
				book_id: b._id.toString(),
				title: b.title,
				author: b.author,
				upload_timestamp: b.uploadTimestamp?.toISOString(),
				processing_stats: {
					total_chunks: b.totalChunks,
					chunks_processed: b.chunksProcessed,
				},
				status: b.status,
			})),
		});
	} catch (err) {
		console.error("[API] Failed to list books:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to list books" },
			{ status: 500 }
		);
	}
};

// POST /api/memory/books/upload - Upload and process a book
export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.user?.id;
	if (!userId) {
		return error(401, "Authentication required");
	}

	try {
		const formData = await request.formData();
		const file = formData.get("file") as File | null;
		const title = formData.get("title") as string | null;
		const author = formData.get("author") as string | null;

		if (!file) {
			return error(400, "File is required");
		}

		const MAX_SIZE = 10 * 1024 * 1024;
		if (file.size > MAX_SIZE) {
			return error(400, "File too large. Maximum size is 10MB.");
		}

		const allowedExtensions = [".txt", ".md", ".pdf", ".docx", ".html", ".rtf"];
		const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
		if (!allowedExtensions.includes(extension)) {
			return error(400, "Unsupported file type. Allowed: " + allowedExtensions.join(", "));
		}

		const bookTitle = title || file.name.replace(/\.[^/.]+$/, "");

		const existingBook = await collections.books.findOne({
			userId,
			title: bookTitle,
		});

		if (existingBook) {
			return json(
				{
					success: false,
					processing_status: "duplicate",
					message: "A book with this title already exists in your library",
				},
				{ status: 409 }
			);
		}

		const bookId = new ObjectId();
		const taskId = new ObjectId();

		await collections.books.insertOne({
			_id: bookId,
			userId,
			title: bookTitle,
			author: author || "Unknown",
			uploadTimestamp: new Date(),
			status: "processing",
			totalChunks: 0,
			chunksProcessed: 0,
			taskId: taskId.toString(),
		});

		processBookInBackground(userId, bookId.toString(), taskId.toString(), file).catch((err) => {
			console.error("[API] Book processing failed:", err);
		});

		return json({
			success: true,
			book_id: bookId.toString(),
			task_id: taskId.toString(),
			message: "Book upload started",
		});
	} catch (err) {
		console.error("[API] Failed to upload book:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to upload book" },
			{ status: 500 }
		);
	}
};

async function processBookInBackground(
	userId: string,
	bookId: string,
	taskId: string,
	file: File
): Promise<void> {
	try {
		const content = await file.text();
		const chunkSize = 1000;
		const overlap = 200;
		const chunks: string[] = [];

		for (let i = 0; i < content.length; i += chunkSize - overlap) {
			chunks.push(content.slice(i, i + chunkSize));
		}

		await collections.books.updateOne(
			{ _id: new ObjectId(bookId) },
			{ $set: { totalChunks: chunks.length } }
		);

		const { UnifiedMemoryFacade } = await import("$lib/server/memory");
		const facade = UnifiedMemoryFacade.getInstance();

		for (let i = 0; i < chunks.length; i++) {
			await facade.store({
				userId,
				tier: "books",
				text: chunks[i],
				metadata: {
					book_id: bookId,
					chunk_index: i,
					task_id: taskId,
				},
			});

			await collections.books.updateOne(
				{ _id: new ObjectId(bookId) },
				{ $set: { chunksProcessed: i + 1 } }
			);
		}

		await collections.books.updateOne({ _id: new ObjectId(bookId) }, { $set: { status: "completed" } });
	} catch (err) {
		console.error("[API] Book processing error:", err);
		await collections.books.updateOne(
			{ _id: new ObjectId(bookId) },
			{
				$set: {
					status: "failed",
					error: err instanceof Error ? err.message : "Processing failed",
				},
			}
		);
	}
}
