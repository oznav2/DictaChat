import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { collections, Database } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { ADMIN_USER_ID } from "$lib/server/constants";
import {
	extractDocumentText,
	sanitizeExtractedText,
} from "$lib/server/textGeneration/mcp/services/doclingClient";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { MemoryMongoStore } from "$lib/server/memory/stores/MemoryMongoStore";

function resolveUploadsDir(): string {
	if (env.UPLOADS_DIR) return env.UPLOADS_DIR;
	if (env.DOCKER_ENV === "true") return "/app/uploads";
	return join(process.cwd(), ".uploads");
}

const BOOK_UPLOADS_DIR = join(resolveUploadsDir(), "books");

/**
 * Check if a document already exists in the memory system by its content hash
 * This enables cross-chat document recognition
 */
async function checkMemorySystemForDocument(
	userId: string,
	documentHash: string
): Promise<{
	exists: boolean;
	bookId?: string;
	title?: string;
	chunkCount?: number;
} | null> {
	try {
		const db = await Database.getInstance();
		const client = db.getClient();
		const mongoStore = new MemoryMongoStore({ client, dbName: "chat-ui" });
		await mongoStore.initialize();

		const docInfo = await mongoStore.getDocumentByHash(userId, documentHash);
		if (docInfo) {
			return {
				exists: true,
				bookId: docInfo.bookId,
				title: docInfo.title,
				chunkCount: docInfo.chunkCount,
			};
		}
		return { exists: false };
	} catch (err) {
		console.error("[API] Memory system document check failed:", err);
		return null;
	}
}

async function saveTempFile(file: File): Promise<string> {
	if (!existsSync(BOOK_UPLOADS_DIR)) {
		await mkdir(BOOK_UPLOADS_DIR, { recursive: true });
	}
	const buffer = await file.arrayBuffer();
	const hash = createHash("sha256").update(Buffer.from(buffer)).digest("hex").slice(0, 16);
	const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
	const filePath = join(BOOK_UPLOADS_DIR, `${hash}_${safeName}`);
	await writeFile(filePath, Buffer.from(buffer));
	return filePath;
}

function getMimeFromExtension(ext: string): string {
	const mimeMap: Record<string, string> = {
		".pdf": "application/pdf",
		".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		".xls": "application/vnd.ms-excel",
		".csv": "text/csv",
		".tsv": "text/tab-separated-values",
		".txt": "text/plain",
		".md": "text/markdown",
		".html": "text/html",
		".htm": "text/html",
		".rtf": "application/rtf",
	};
	return mimeMap[ext] || "application/octet-stream";
}

// GET /api/memory/books - List uploaded books
export const GET: RequestHandler = async () => {
	try {
		const books = await collections.books
			.find({ userId: ADMIN_USER_ID })
			.sort({ uploadTimestamp: -1 })
			.toArray();

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
				processingStage: b.processingStage,
				processingMessage: b.processingMessage,
				doclingStatus: b.doclingStatus,
				// Cross-chat recognition info
				recognizedFromPreviousChat: b.recognizedFromPreviousChat ?? false,
				linkedToBookId: b.linkedToBookId ?? null,
				documentHash: b.documentHash ?? null,
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
export const POST: RequestHandler = async ({ request }) => {
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

		const allowedExtensions = [
			".txt",
			".md",
			".pdf",
			".docx",
			".xlsx",
			".xls",
			".csv",
			".tsv",
			".html",
			".htm",
			".rtf",
		];
		const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
		if (!allowedExtensions.includes(extension)) {
			return error(400, "Unsupported file type. Allowed: " + allowedExtensions.join(", "));
		}

		const bookTitle = title || file.name.replace(/\.[^/.]+$/, "");

		// Check for duplicate by title
		const existingBookByTitle = await collections.books.findOne({
			userId: ADMIN_USER_ID,
			title: bookTitle,
		});

		if (existingBookByTitle) {
			return json(
				{
					success: false,
					processing_status: "duplicate",
					message: "A book with this title already exists in your library",
					existing_book_id: existingBookByTitle._id.toString(),
				},
				{ status: 409 }
			);
		}

		// Also check for duplicate by file content hash (catches same file with different title)
		const fileBuffer = await file.arrayBuffer();
		const fileHash = createHash("sha256").update(Buffer.from(fileBuffer)).digest("hex");

		const existingBookByHash = await collections.books.findOne({
			userId: ADMIN_USER_ID,
			fileHash,
		});

		if (existingBookByHash) {
			return json(
				{
					success: false,
					processing_status: "duplicate",
					message: `This file already exists as "${existingBookByHash.title}"`,
					existing_book_id: existingBookByHash._id.toString(),
				},
				{ status: 409 }
			);
		}

		const bookId = new ObjectId();
		const taskId = new ObjectId();

		await collections.books.insertOne({
			_id: bookId,
			userId: ADMIN_USER_ID,
			title: bookTitle,
			author: author || "Unknown",
			uploadTimestamp: new Date(),
			status: "processing",
			processingStage: "queued",
			processingMessage: "Queued",
			totalChunks: 0,
			chunksProcessed: 0,
			taskId: taskId.toString(),
			fileHash, // Store for duplicate detection
			fileName: file.name,
			fileSize: file.size,
		});

		processBookInBackground(ADMIN_USER_ID, bookId.toString(), taskId.toString(), file).catch(
			(err) => {
				console.error("[API] Book processing failed:", err);
			}
		);

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
	let tempFilePath: string | undefined;

	try {
		const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
		const mimeType = file.type || getMimeFromExtension(extension);
		const plainTextExtensions = [".txt", ".md", ".csv", ".tsv"];

		let extractedText: string;
		let numPages: number | undefined;
		let format: string | undefined;

		if (plainTextExtensions.includes(extension)) {
			await collections.books.updateOne(
				{ _id: new ObjectId(bookId) },
				{ $set: { processingStage: "reading", processingMessage: "Reading file..." } }
			);
			// Direct text for plain files, sanitize to remove any binary artifacts
			const rawText = await file.text();
			extractedText = sanitizeExtractedText(rawText);
			console.log(
				`[API] Plain text extracted: ${rawText.length} chars, after sanitization: ${extractedText.length} chars`
			);
		} else {
			// Use Docling for PDF, DOCX, etc.
			console.log(`[API] Processing ${extension} file with Docling...`);
			await collections.books.updateOne(
				{ _id: new ObjectId(bookId) },
				{
					$set: {
						processingStage: "docling",
						processingMessage: "Extracting text via Docling...",
						doclingStatus: "starting",
						doclingTaskId: null,
					},
				}
			);
			tempFilePath = await saveTempFile(file);
			console.log(`[API] Temp file saved: ${tempFilePath}`);

			try {
				let lastDoclingStatus: string | null = null;
				const result = await extractDocumentText(tempFilePath, {
					onStatus: async ({ taskId: doclingTaskId, status }) => {
						if (status === lastDoclingStatus) return;
						lastDoclingStatus = status;
						await collections.books.updateOne(
							{ _id: new ObjectId(bookId) },
							{
								$set: {
									doclingStatus: status,
									doclingTaskId: doclingTaskId === "sync" ? null : doclingTaskId,
									processingStage: "docling",
									processingMessage: `Docling: ${status}`,
								},
							}
						);
					},
				});
				extractedText = result.text;
				numPages = result.pages;
				format = result.format;
				console.log(`[API] Docling extracted: ${extractedText.length} chars, ${numPages} pages`);
			} catch (doclingErr) {
				console.error(`[API] Docling extraction failed:`, doclingErr);
				throw new Error(
					`Document extraction failed: ${doclingErr instanceof Error ? doclingErr.message : "Unknown error"}`
				);
			}
		}

		// Check if extraction produced any content
		if (!extractedText || extractedText.trim().length === 0) {
			throw new Error(
				"No text could be extracted from the document. The file may be empty, image-only, or corrupted."
			);
		}

		// Generate document hash for dedup
		const documentHash = createHash("sha256").update(extractedText).digest("hex");

		// ============================================
		// Cross-Chat Document Recognition
		// Check if this document's content was already processed in memory system
		// ============================================
		const existingInMemory = await checkMemorySystemForDocument(userId, documentHash);
		if (existingInMemory?.exists) {
			console.log(
				`[API] Document already exists in memory system: ${existingInMemory.title} (${existingInMemory.chunkCount} chunks)`
			);
			// Update book record to indicate it's using existing memories
			await collections.books.updateOne(
				{ _id: new ObjectId(bookId) },
				{
					$set: {
						status: "completed",
						processingStage: "completed",
						processingMessage: `Document already processed. Using existing ${existingInMemory.chunkCount} memories.`,
						doclingStatus: "completed",
						totalChunks: existingInMemory.chunkCount ?? 0,
						chunksProcessed: existingInMemory.chunkCount ?? 0,
						documentHash,
						linkedToBookId: existingInMemory.bookId,
						recognizedFromPreviousChat: true,
					},
				}
			);
			// Skip further processing - memories already exist
			return;
		}

		await collections.books.updateOne(
			{ _id: new ObjectId(bookId) },
			{ $set: { processingStage: "chunking", processingMessage: "Chunking document..." } }
		);

		// Chunk with overlap
		const chunkSize = 1000;
		const overlap = 200;
		const chunks: string[] = [];
		for (let i = 0; i < extractedText.length; i += chunkSize - overlap) {
			chunks.push(extractedText.slice(i, i + chunkSize));
		}

		console.log(`[API] Created ${chunks.length} chunks for book ${bookId}`);

		await collections.books.updateOne(
			{ _id: new ObjectId(bookId) },
			{
				$set: {
					totalChunks: chunks.length,
					numPages,
					fileType: format || extension.replace(".", ""),
					processingStage: "ingesting",
					processingMessage: "Ingesting chunks...",
				},
			}
		);

		const { UnifiedMemoryFacade } = await import("$lib/server/memory");
		const facade = UnifiedMemoryFacade.getInstance();

		const bookDoc = await collections.books.findOne({ _id: new ObjectId(bookId) });
		const bookTitleMeta = typeof bookDoc?.title === "string" ? bookDoc.title : "Unknown";
		const bookAuthorMeta = typeof bookDoc?.author === "string" ? bookDoc.author : null;
		const uploadTimestampMeta =
			bookDoc?.uploadTimestamp instanceof Date ? bookDoc.uploadTimestamp.toISOString() : null;

		for (let i = 0; i < chunks.length; i++) {
			await facade.store({
				userId,
				tier: "documents",
				text: chunks[i],
				metadata: {
					book_id: bookId,
					chunk_index: i,
					task_id: taskId,
					title: bookTitleMeta,
					author: bookAuthorMeta,
					upload_timestamp: uploadTimestampMeta,
					file_type: format || extension.replace(".", ""),
					mime_type: mimeType,
					num_pages: numPages ?? null,
					document_hash: documentHash,
				},
			});

			await collections.books.updateOne(
				{ _id: new ObjectId(bookId) },
				{
					$set: {
						chunksProcessed: i + 1,
						processingStage: "ingesting",
						processingMessage: `Ingesting chunk ${i + 1}/${chunks.length}...`,
					},
				}
			);
		}

		await collections.books.updateOne(
			{ _id: new ObjectId(bookId) },
			{
				$set: {
					status: "completed",
					processingStage: "completed",
					processingMessage: "Completed. Knowledge added to the graph.",
					doclingStatus: "completed",
					documentHash, // Store for cross-chat recognition
				},
			}
		);
	} catch (err) {
		console.error("[API] Book processing error:", err);
		await collections.books.updateOne(
			{ _id: new ObjectId(bookId) },
			{
				$set: {
					status: "failed",
					processingStage: "failed",
					processingMessage: "Failed",
					error: err instanceof Error ? err.message : "Processing failed",
				},
			}
		);
	} finally {
		// Cleanup temp file
		if (tempFilePath) {
			try {
				await unlink(tempFilePath);
			} catch {
				// Ignore cleanup errors
			}
		}
	}
}
