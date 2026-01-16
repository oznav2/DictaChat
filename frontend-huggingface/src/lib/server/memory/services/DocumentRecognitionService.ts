/**
 * DocumentRecognitionService - Cross-chat document recognition
 *
 * Enables the memory system to identify documents that have already been
 * processed in previous chat sessions, avoiding redundant tool calls
 * and memory duplication.
 *
 * Key features:
 * - Recognize previously processed documents by content hash
 * - Provide user-facing messages about document status
 * - Retrieve existing memories for known documents
 * - Support for RoamPal-style persistent memory across chats
 */

import { logger } from "$lib/server/logger";
import type { MemoryMongoStore } from "../stores/MemoryMongoStore";
import type { MemoryItem } from "../types";
import { createHash } from "crypto";

export interface DocumentRecognitionConfig {
	mongoStore: MemoryMongoStore;
}

export interface DocumentRecognitionResult {
	/** Whether the document was previously processed */
	isKnown: boolean;
	/** Book ID if document is known */
	bookId?: string;
	/** Document title */
	title?: string;
	/** Document author */
	author?: string | null;
	/** Number of memory chunks for this document */
	chunkCount?: number;
	/** Preview of the first chunk */
	preview?: string;
	/** When the document was originally processed */
	processedAt?: string;
	/** User-facing message about document status */
	userMessage?: string;
	/** User-facing message in Hebrew */
	userMessageHe?: string;
}

export interface DocumentMemoryRetrievalResult {
	/** Whether memories were found */
	found: boolean;
	/** Number of memories found */
	count: number;
	/** The memory items */
	memories: MemoryItem[];
	/** User-facing message */
	userMessage?: string;
	/** User-facing message in Hebrew */
	userMessageHe?: string;
}

/**
 * Calculate document hash from content
 * Uses SHA256 for consistent fingerprinting
 */
export function calculateDocumentHash(content: string | Buffer): string {
	return createHash("sha256").update(content).digest("hex");
}

export class DocumentRecognitionService {
	private mongoStore: MemoryMongoStore;

	constructor(config: DocumentRecognitionConfig) {
		this.mongoStore = config.mongoStore;
	}

	/**
	 * Check if a document is already known (processed in a previous session)
	 *
	 * @param userId - User ID
	 * @param documentHash - SHA256 hash of document content
	 * @returns Recognition result with document info if known
	 */
	async recognizeDocument(
		userId: string,
		documentHash: string
	): Promise<DocumentRecognitionResult> {
		try {
			const docInfo = await this.mongoStore.getDocumentByHash(userId, documentHash);

			if (!docInfo) {
				return { isKnown: false };
			}

			const preview = docInfo.firstChunkPreview;
			const processedAt = docInfo.uploadTimestamp;

			const userMessage = `I have already digested this document "${docInfo.title}". Let me collect the memories I have from it and verify they are relevant to your query.`;
			const userMessageHe = `כבר עיבדתי את המסמך "${docInfo.title}". הרשו לי לאסוף את הזיכרונות שיש לי ממנו ולוודא שהם רלוונטיים לשאילתה שלכם.`;

			logger.info(
				{
					userId,
					documentHash: documentHash.slice(0, 16) + "...",
					bookId: docInfo.bookId,
					title: docInfo.title,
					chunkCount: docInfo.chunkCount,
				},
				"Document recognized from previous session"
			);

			return {
				isKnown: true,
				bookId: docInfo.bookId,
				title: docInfo.title,
				author: docInfo.author,
				chunkCount: docInfo.chunkCount,
				preview: preview === null ? undefined : (preview as string),
				processedAt: processedAt === null ? undefined : processedAt,
				userMessage,
				userMessageHe,
			};
		} catch (err) {
			logger.error({ err, userId, documentHash }, "Failed to recognize document");
			return { isKnown: false };
		}
	}

	/**
	 * Retrieve memories for a known document
	 *
	 * @param userId - User ID
	 * @param documentHash - SHA256 hash of document content
	 * @param limit - Maximum memories to retrieve
	 * @returns Memory retrieval result
	 */
	async retrieveDocumentMemories(
		userId: string,
		documentHash: string,
		limit = 50
	): Promise<DocumentMemoryRetrievalResult> {
		try {
			const memories = await this.mongoStore.findByDocumentHash(userId, documentHash, {
				tier: "books",
				status: ["active"],
				limit,
			});

			if (memories.length === 0) {
				return {
					found: false,
					count: 0,
					memories: [],
					userMessage: "No memories found for this document.",
					userMessageHe: "לא נמצאו זיכרונות עבור מסמך זה.",
				};
			}

			const userMessage = `Found ${memories.length} memory chunk${memories.length > 1 ? "s" : ""} from this document.`;
			const userMessageHe = `נמצאו ${memories.length} קטעי זיכרון מהמסמך הזה.`;

			return {
				found: true,
				count: memories.length,
				memories,
				userMessage,
				userMessageHe,
			};
		} catch (err) {
			logger.error({ err, userId, documentHash }, "Failed to retrieve document memories");
			return {
				found: false,
				count: 0,
				memories: [],
			};
		}
	}

	/**
	 * Check if document processing can be skipped (already processed)
	 *
	 * @param userId - User ID
	 * @param documentContent - Raw document content (string or Buffer)
	 * @returns Recognition result
	 */
	async checkAndRecognize(
		userId: string,
		documentContent: string | Buffer
	): Promise<DocumentRecognitionResult> {
		const documentHash = calculateDocumentHash(documentContent);
		return this.recognizeDocument(userId, documentHash);
	}

	/**
	 * Quick existence check (faster than full recognition)
	 *
	 * @param userId - User ID
	 * @param documentHash - SHA256 hash of document content
	 * @returns true if document exists in memory system
	 */
	async documentExists(userId: string, documentHash: string): Promise<boolean> {
		return this.mongoStore.documentExists(userId, documentHash);
	}

	/**
	 * Get a formatted context injection string for a known document
	 *
	 * This can be injected into the LLM prompt to inform it about
	 * the document's presence in memory without re-processing.
	 *
	 * @param recognition - Document recognition result
	 * @returns Context injection string
	 */
	formatRecognitionContext(recognition: DocumentRecognitionResult): string {
		if (!recognition.isKnown) {
			return "";
		}

		const lines = [
			"═══ DOCUMENT RECOGNITION ═══",
			"",
			`📚 Document: "${recognition.title}"`,
			recognition.author ? `👤 Author: ${recognition.author}` : null,
			`📄 Memory chunks: ${recognition.chunkCount}`,
			recognition.processedAt
				? `🕐 Processed: ${new Date(recognition.processedAt).toLocaleDateString()}`
				: null,
			"",
			"This document has already been processed and stored in memory.",
			"Use the search_memory tool to retrieve relevant content.",
			"",
			"═════════════════════════════",
		].filter(Boolean);

		return lines.join("\n");
	}
}

/**
 * Create a DocumentRecognitionService instance
 */
export function createDocumentRecognitionService(
	config: DocumentRecognitionConfig
): DocumentRecognitionService {
	return new DocumentRecognitionService(config);
}
