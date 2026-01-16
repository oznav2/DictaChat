/**
 * UnifiedDocumentIngestionService - Enterprise-Grade Document Ingestion
 *
 * Consolidates two parallel document upload methods:
 * 1. RAG Upload (input area file attachment) - DocumentRAGService
 * 2. Bookstore Upload (navbar modal) - /api/memory/books
 *
 * This service provides a single, unified pipeline that combines the best of both:
 * - Document hash for deduplication and cross-chat recognition
 * - Semantic chunking with token-aware boundaries
 * - Embedding generation via dicta-retrieval
 * - Memory system integration (books tier)
 * - Progress streaming via callbacks
 * - Docling extraction for complex formats
 *
 * Key Design Principles:
 * - Single source of truth for document ingestion
 * - Fail-open: degrade gracefully when services unavailable
 * - Streaming progress for real-time UI feedback
 * - Cross-chat document recognition to avoid redundant processing
 */

import { createHash } from "crypto";
import type { ObjectId } from "mongodb";

// Types
export interface DocumentIngestionParams {
	/** User ID for memory storage */
	userId: string;
	/** Conversation ID (optional - for RAG context association) */
	conversationId?: string;
	/** File path on disk */
	filePath: string;
	/** Original file name */
	fileName: string;
	/** MIME type */
	mimeType: string;
	/** User's query/context (optional - for semantic relevance) */
	userQuery?: string;
	/** Custom title (optional - defaults to fileName) */
	title?: string;
	/** Author (optional) */
	author?: string;
}

export interface DocumentIngestionResult {
	/** Whether ingestion succeeded */
	success: boolean;
	/** Document ID in memory system */
	documentId?: string;
	/** Book ID in books collection */
	bookId?: string;
	/** SHA256 hash of extracted text */
	documentHash?: string;
	/** SHA256 hash of raw file bytes */
	fileHash?: string;
	/** Number of chunks created */
	chunkCount?: number;
	/** Total tokens across all chunks */
	totalTokens?: number;
	/** Whether document was recognized from previous session */
	recognizedFromPreviousChat?: boolean;
	/** Error message if failed */
	error?: string;
	/** Processing statistics */
	stats?: {
		extractionMs?: number;
		chunkingMs?: number;
		embeddingMs?: number;
		storageMs?: number;
		totalMs?: number;
	};
}

export interface DocumentChunk {
	content: string;
	chunkIndex: number;
	tokenCount: number;
	sectionTitle?: string;
	chunkType?: "text" | "code" | "table" | "heading";
}

export interface IngestionProgressCallback {
	(progress: IngestionProgress): void;
}

export interface IngestionProgress {
	stage: IngestionStage;
	message: string;
	messageHe?: string;
	detail?: string;
	progress?: number; // 0-100
}

export type IngestionStage =
	| "queued"
	| "reading"
	| "extracting"
	| "checking_duplicate"
	| "chunking"
	| "embedding"
	| "storing"
	| "completed"
	| "failed"
	| "recognized";

// Configuration
export interface UnifiedIngestionConfig {
	/** Maximum chunk size in tokens (default: 800) */
	maxChunkTokens: number;
	/** Chunk overlap in tokens (default: 100) */
	chunkOverlapTokens: number;
	/** Maximum file size in bytes (default: 10MB) */
	maxFileSizeBytes: number;
	/** Embedding service URL */
	embeddingServiceUrl?: string;
	/** Docling service URL */
	doclingServiceUrl?: string;
	/** Enable deduplication check (default: true) */
	enableDedup: boolean;
	/** Enable cross-chat recognition (default: true) */
	enableCrossChatRecognition: boolean;
}

const DEFAULT_CONFIG: UnifiedIngestionConfig = {
	maxChunkTokens: 800,
	chunkOverlapTokens: 100,
	maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
	enableDedup: true,
	enableCrossChatRecognition: true,
};

// Progress messages (bilingual)
const PROGRESS_MESSAGES: Record<IngestionStage, { en: string; he: string }> = {
	queued: { en: "Queued for processing", he: "ממתין לעיבוד" },
	reading: { en: "Reading file...", he: "קורא קובץ..." },
	extracting: { en: "Extracting text via Docling...", he: "מחלץ טקסט באמצעות Docling..." },
	checking_duplicate: { en: "Checking for existing document...", he: "בודק אם המסמך כבר קיים..." },
	chunking: { en: "Chunking document...", he: "מחלק את המסמך לקטעים..." },
	embedding: { en: "Generating embeddings...", he: "מייצר embeddings..." },
	storing: { en: "Storing in memory system...", he: "שומר במערכת הזיכרון..." },
	completed: { en: "Document processed successfully", he: "המסמך עובד בהצלחה" },
	failed: { en: "Processing failed", he: "העיבוד נכשל" },
	recognized: {
		en: "Document already processed in previous session",
		he: "המסמך כבר עובד בשיחה קודמת",
	},
};

/**
 * UnifiedDocumentIngestionService
 *
 * Single entry point for all document ingestion in DictaChat.
 * Used by both RAG uploads and Bookstore uploads.
 */
export class UnifiedDocumentIngestionService {
	private config: UnifiedIngestionConfig;
	private progressCallback?: IngestionProgressCallback;

	constructor(config?: Partial<UnifiedIngestionConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Set progress callback for real-time updates
	 */
	onProgress(callback: IngestionProgressCallback): void {
		this.progressCallback = callback;
	}

	/**
	 * Emit progress update
	 */
	private emitProgress(stage: IngestionStage, detail?: string, progress?: number): void {
		if (this.progressCallback) {
			const msg = PROGRESS_MESSAGES[stage];
			this.progressCallback({
				stage,
				message: msg.en,
				messageHe: msg.he,
				detail,
				progress,
			});
		}
	}

	/**
	 * Main ingestion method - processes document through unified pipeline
	 */
	async ingestDocument(params: DocumentIngestionParams): Promise<DocumentIngestionResult> {
		const startTime = Date.now();
		const stats: DocumentIngestionResult["stats"] = {};

		try {
			this.emitProgress("reading");

			let fileHash: string | null = null;
			let fileSizeBytes: number | null = null;
			if (this.config.enableDedup) {
				try {
					const fs = await import("fs/promises");
					const buf = await fs.readFile(params.filePath);
					fileHash = UnifiedDocumentIngestionService.calculateHash(buf);
					fileSizeBytes = buf.byteLength;

					const existingByFileHash = await this.checkExistingBookByFileHash(
						params.userId,
						fileHash
					);
					if (existingByFileHash) {
						this.emitProgress("recognized", `Found existing: ${existingByFileHash.title}`);
						return {
							success: true,
							documentId: existingByFileHash.documentId,
							bookId: existingByFileHash.bookId,
							fileHash,
							chunkCount: existingByFileHash.chunkCount,
							recognizedFromPreviousChat: true,
							stats: { ...stats, totalMs: Date.now() - startTime },
						};
					}
				} catch {
					fileHash = null;
					fileSizeBytes = null;
				}
			}

			// Step 1: Read and extract text
			const extractionStart = Date.now();
			const extractedText = await this.extractText(params.filePath, params.mimeType);
			stats.extractionMs = Date.now() - extractionStart;

			if (!extractedText || extractedText.trim().length === 0) {
				this.emitProgress("failed", "No text could be extracted from document");
				return {
					success: false,
					error: "No text could be extracted from the document",
					stats,
				};
			}

			// Step 2: Generate document hash for deduplication
			const documentHash = this.hashContent(extractedText);

			// Step 3: Check for cross-chat recognition
			if (this.config.enableCrossChatRecognition) {
				this.emitProgress("checking_duplicate");
				const existingDoc = await this.checkExistingDocument(params.userId, documentHash);

				if (existingDoc) {
					this.emitProgress("recognized", `Found existing: ${existingDoc.title}`);
					return {
						success: true,
						documentId: existingDoc.documentId,
						bookId: existingDoc.bookId,
						documentHash,
						fileHash: fileHash ?? undefined,
						chunkCount: existingDoc.chunkCount,
						recognizedFromPreviousChat: true,
						stats: { ...stats, totalMs: Date.now() - startTime },
					};
				}
			}

			// Step 4: Semantic chunking
			this.emitProgress("chunking");
			const chunkingStart = Date.now();
			const chunks = await this.semanticChunk(extractedText);
			stats.chunkingMs = Date.now() - chunkingStart;
			this.emitProgress("chunking", `Created ${chunks.length} chunks`);

			// Step 5: Generate embeddings
			this.emitProgress("embedding");
			const embeddingStart = Date.now();
			const embeddings = await this.generateEmbeddings(chunks.map((c) => c.content));
			stats.embeddingMs = Date.now() - embeddingStart;

			// Step 6: Store in memory system
			this.emitProgress("storing");
			const storageStart = Date.now();
			const storeResult = await this.storeInMemorySystem({
				userId: params.userId,
				conversationId: params.conversationId,
				chunks,
				embeddings,
				documentHash,
				fileHash: fileHash ?? undefined,
				fileSizeBytes: fileSizeBytes ?? undefined,
				fileName: params.fileName,
				title: params.title || params.fileName.replace(/\.[^/.]+$/, ""),
				author: params.author,
				mimeType: params.mimeType,
			});
			stats.storageMs = Date.now() - storageStart;

			stats.totalMs = Date.now() - startTime;
			this.emitProgress("completed", `${chunks.length} chunks stored`);

			return {
				success: true,
				documentId: storeResult.documentId,
				bookId: storeResult.bookId,
				documentHash,
				fileHash: fileHash ?? undefined,
				chunkCount: chunks.length,
				totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
				recognizedFromPreviousChat: false,
				stats,
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : "Unknown error";
			this.emitProgress("failed", errorMsg);
			return {
				success: false,
				error: errorMsg,
				stats: { ...stats, totalMs: Date.now() - startTime },
			};
		}
	}

	/**
	 * Extract text from document using Docling or direct read
	 */
	private async extractText(filePath: string, mimeType: string): Promise<string> {
		this.emitProgress("extracting");

		// Plain text formats - read directly
		const plainTextMimes = ["text/plain", "text/markdown", "text/csv"];
		if (plainTextMimes.some((m) => mimeType.startsWith(m))) {
			const fs = await import("fs/promises");
			return fs.readFile(filePath, "utf-8");
		}

		// Complex formats - use Docling
		try {
			const { extractDocumentText } = await import(
				"$lib/server/textGeneration/mcp/services/doclingClient"
			);
			const result = await extractDocumentText(filePath);
			return result.text;
		} catch (error) {
			console.error("[UnifiedIngestion] Docling extraction failed:", error);
			// Fallback to direct read
			const fs = await import("fs/promises");
			try {
				return await fs.readFile(filePath, "utf-8");
			} catch {
				throw new Error("Failed to extract text from document");
			}
		}
	}

	/**
	 * Semantic chunking with token-aware boundaries
	 *
	 * Improved over simple fixed-size chunking:
	 * - Respects paragraph and sentence boundaries
	 * - Preserves section headings
	 * - Detects code blocks
	 * - Estimates token counts
	 */
	private async semanticChunk(text: string): Promise<DocumentChunk[]> {
		const chunks: DocumentChunk[] = [];
		const maxTokens = this.config.maxChunkTokens;
		const overlapTokens = this.config.chunkOverlapTokens;

		// Split into paragraphs first
		const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

		let currentChunk = "";
		let currentTokens = 0;
		let chunkIndex = 0;
		let currentSectionTitle: string | undefined;

		for (const para of paragraphs) {
			const paraTokens = this.estimateTokens(para);

			// Detect section headings
			const headingMatch = para.match(/^#+\s+(.+)$|^([A-Z][^.]+)$/);
			if (headingMatch) {
				currentSectionTitle = headingMatch[1] || headingMatch[2];
			}

			// Check if adding this paragraph exceeds max tokens
			if (currentTokens + paraTokens > maxTokens && currentChunk.length > 0) {
				// Save current chunk
				chunks.push({
					content: currentChunk.trim(),
					chunkIndex,
					tokenCount: currentTokens,
					sectionTitle: currentSectionTitle,
					chunkType: this.detectChunkType(currentChunk),
				});
				chunkIndex++;

				// Start new chunk with overlap
				const overlapContent = this.getOverlapContent(currentChunk, overlapTokens);
				currentChunk = overlapContent + "\n\n" + para;
				currentTokens = this.estimateTokens(currentChunk);
			} else {
				// Add paragraph to current chunk
				currentChunk += (currentChunk.length > 0 ? "\n\n" : "") + para;
				currentTokens += paraTokens;
			}
		}

		// Don't forget the last chunk
		if (currentChunk.trim().length > 0) {
			chunks.push({
				content: currentChunk.trim(),
				chunkIndex,
				tokenCount: currentTokens,
				sectionTitle: currentSectionTitle,
				chunkType: this.detectChunkType(currentChunk),
			});
		}

		return chunks;
	}

	/**
	 * Estimate token count (rough approximation)
	 * ~4 characters per token for English, ~2 for Hebrew
	 */
	private estimateTokens(text: string): number {
		const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
		const otherChars = text.length - hebrewChars;
		return Math.ceil(hebrewChars / 2 + otherChars / 4);
	}

	/**
	 * Get overlap content from end of chunk
	 */
	private getOverlapContent(text: string, targetTokens: number): string {
		const sentences = text.split(/(?<=[.!?])\s+/);
		let result = "";
		let tokens = 0;

		// Work backwards from end
		for (let i = sentences.length - 1; i >= 0 && tokens < targetTokens; i--) {
			const sentenceTokens = this.estimateTokens(sentences[i]);
			result = sentences[i] + (result ? " " + result : "");
			tokens += sentenceTokens;
		}

		return result;
	}

	/**
	 * Detect chunk type (text, code, table, heading)
	 */
	private detectChunkType(text: string): DocumentChunk["chunkType"] {
		if (/^```[\s\S]*```$/m.test(text)) return "code";
		if (/^\|.*\|$/m.test(text)) return "table";
		if (/^#+\s+.+$/m.test(text)) return "heading";
		return "text";
	}

	/**
	 * Generate embeddings for chunks
	 */
	private async generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
		try {
			const { createDictaEmbeddingClient } = await import("$lib/server/memory/embedding");
			const embeddingClient = createDictaEmbeddingClient({
				endpoint: this.config.embeddingServiceUrl,
			});

			const results: (number[] | null)[] = [];
			for (const text of texts) {
				const embedding = await embeddingClient.embed(text);
				results.push(embedding);
			}
			return results;
		} catch (error) {
			console.error("[UnifiedIngestion] Embedding generation failed:", error);
			// Return nulls - storage will mark for reindex
			return texts.map(() => null);
		}
	}

	/**
	 * Check if document already exists in memory system
	 */
	private async checkExistingDocument(
		userId: string,
		documentHash: string
	): Promise<{
		documentId: string;
		bookId: string;
		title: string;
		chunkCount: number;
	} | null> {
		try {
			const { Database } = await import("$lib/server/database");
			const { MemoryMongoStore } = await import("$lib/server/memory/stores/MemoryMongoStore");

			const db = await Database.getInstance();
			const mongoStore = new MemoryMongoStore({ client: db.getClient(), dbName: "chat-ui" });
			await mongoStore.initialize();

			const docInfo = await mongoStore.getDocumentByHash(userId, documentHash);
			if (docInfo) {
				return {
					documentId: `book:${docInfo.bookId}`,
					bookId: docInfo.bookId,
					title: docInfo.title,
					chunkCount: docInfo.chunkCount,
				};
			}
			return null;
		} catch (error) {
			console.error("[UnifiedIngestion] Document check failed:", error);
			return null;
		}
	}

	/**
	 * Store chunks in memory system
	 */
	private async storeInMemorySystem(params: {
		userId: string;
		conversationId?: string;
		chunks: DocumentChunk[];
		embeddings: (number[] | null)[];
		documentHash: string;
		fileHash?: string;
		fileSizeBytes?: number;
		fileName: string;
		title: string;
		author?: string;
		mimeType: string;
	}): Promise<{ documentId: string; bookId: string }> {
		const { UnifiedMemoryFacade } = await import("$lib/server/memory");
		const { collections } = await import("$lib/server/database");
		const { ObjectId } = await import("mongodb");

		const facade = UnifiedMemoryFacade.getInstance();
		const bookId = new ObjectId().toString();
		const documentId = `book:${bookId}`;

		// Create book record
		await collections.books.insertOne({
			_id: new ObjectId(bookId),
			userId: params.userId,
			title: params.title,
			author: params.author || "Unknown",
			uploadTimestamp: new Date(),
			status: "completed",
			taskId: bookId,
			processingStage: "completed",
			processingMessage: "Processed via unified ingestion",
			totalChunks: params.chunks.length,
			chunksProcessed: params.chunks.length,
			documentHash: params.documentHash,
			fileHash: params.fileHash,
			fileName: params.fileName,
			fileSize: params.fileSizeBytes ?? 0,
			source: params.conversationId ? "rag_upload" : "bookstore_upload",
		});

		// Store chunks in memory system
		for (let i = 0; i < params.chunks.length; i++) {
			const chunk = params.chunks[i];
			const progress = Math.round(((i + 1) / params.chunks.length) * 100);
			this.emitProgress("storing", `Chunk ${i + 1}/${params.chunks.length}`, progress);

			await facade.store({
				userId: params.userId,
				tier: "books",
				text: chunk.content,
				metadata: {
					book_id: bookId,
					chunk_index: chunk.chunkIndex,
					title: params.title,
					author: params.author,
					upload_timestamp: new Date().toISOString(),
					file_type: params.mimeType,
					document_hash: params.documentHash,
					file_hash: params.fileHash ?? null,
					section_title: chunk.sectionTitle,
					chunk_type: chunk.chunkType,
					token_count: chunk.tokenCount,
					// RAG context association
					conversation_id: params.conversationId || null,
					source: params.conversationId ? "rag_upload" : "bookstore_upload",
				},
			});
		}

		return { documentId, bookId };
	}

	/**
	 * Hash content for deduplication
	 */
	private hashContent(content: string): string {
		return createHash("sha256").update(content).digest("hex");
	}

	private async checkExistingBookByFileHash(
		userId: string,
		fileHash: string
	): Promise<{ documentId: string; bookId: string; title: string; chunkCount: number } | null> {
		try {
			const { collections } = await import("$lib/server/database");

			const existing = await collections.books.findOne(
				{ userId, fileHash, status: "completed" },
				{ projection: { _id: 1, title: 1, totalChunks: 1 } }
			);

			if (!existing?._id) return null;
			return {
				documentId: `book:${existing._id.toString()}`,
				bookId: existing._id.toString(),
				title: existing.title ?? "Unknown",
				chunkCount: existing.totalChunks ?? 0,
			};
		} catch {
			return null;
		}
	}

	/**
	 * Calculate document hash from content (static utility)
	 */
	static calculateHash(content: string | Buffer): string {
		return createHash("sha256").update(content).digest("hex");
	}
}

export function calculateDocumentHash(content: string | Buffer): string {
	return UnifiedDocumentIngestionService.calculateHash(content);
}

/**
 * Factory function
 */
export function createUnifiedDocumentIngestionService(
	config?: Partial<UnifiedIngestionConfig>
): UnifiedDocumentIngestionService {
	return new UnifiedDocumentIngestionService(config);
}

/**
 * Singleton instance for shared use
 */
let _instance: UnifiedDocumentIngestionService | null = null;

export function getUnifiedDocumentIngestionService(): UnifiedDocumentIngestionService {
	if (!_instance) {
		_instance = createUnifiedDocumentIngestionService();
	}
	return _instance;
}
