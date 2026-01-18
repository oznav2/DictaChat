/**
 * RAG Integration Helper for runMcpFlow
 *
 * Provides functions to integrate the RAG system into the MCP flow.
 * Checks for document context and injects retrieved chunks into prompts.
 *
 * ENTERPRISE STREAMING ARCHITECTURE:
 * - Trace events are streamed in REAL-TIME as RAG operations progress
 * - User sees immediate feedback ("Extracting document...", "Generating embeddings...")
 * - No waiting until all work is done before showing progress
 */

import { env } from "$env/dynamic/private";
import type { EndpointMessage } from "../../endpoints/endpoints";
import { createTraceEmitter, TraceEmitter } from "./services/traceEmitter";
import { createDocumentRAGService, DocumentRAGService } from "./services/documentRAG";
import { getMongoClient } from "./services/ragDatabase";
import type { RetrievalResult, SupportedLanguage } from "./types/documentContext";
import type {
	MessageTraceUpdate,
	MessageMemoryDocumentIngestingUpdate,
} from "$lib/types/MessageUpdate";
import { MessageUpdateType, MessageMemoryUpdateType } from "$lib/types/MessageUpdate";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { UnifiedDocumentIngestionService } from "$lib/server/documents/UnifiedDocumentIngestionService";

/**
 * Create a document ingesting update for streaming to UI
 */
function createDocumentIngestingUpdate(params: {
	documentName: string;
	stage: MessageMemoryDocumentIngestingUpdate["stage"];
	chunksProcessed?: number;
	totalChunks?: number;
	recognized?: boolean;
	message?: string;
}): MessageMemoryDocumentIngestingUpdate {
	return {
		type: MessageUpdateType.Memory,
		subtype: MessageMemoryUpdateType.DocumentIngesting,
		...params,
	};
}

/**
 * Check if RAG is enabled via environment variable
 */
export function isRAGEnabled(): boolean {
	return env.DOCUMENT_RAG_ENABLED === "true";
}

/**
 * Detect language from user query
 */
export function detectQueryLanguage(query: string): SupportedLanguage {
	const hebrewRegex = /[\u0590-\u05FF]/g;
	const hebrewChars = (query.match(hebrewRegex) || []).length;
	const englishChars = (query.match(/[a-zA-Z]/g) || []).length;

	if (hebrewChars + englishChars === 0) return "en";

	const hebrewRatio = hebrewChars / (hebrewChars + englishChars);

	if (hebrewRatio > 0.5) return "he";
	if (hebrewRatio < 0.2) return "en";
	return "mixed";
}

/**
 * Extract user query from messages
 */
export function extractUserQueryFromMessages(messages: EndpointMessage[]): string {
	// Find the last user message
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.from === "user" && typeof msg.content === "string") {
			return msg.content;
		}
	}
	return "";
}

/**
 * Document MIME types supported for RAG ingestion
 */
const DOCUMENT_MIMES = [
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"text/plain",
	"text/markdown",
	"application/rtf",
];

/**
 * Bridge RAG document chunks to Memory system
 * Stores ingested document chunks in the permanent memory system
 * This ensures documents uploaded via chat are also stored in memory for the Memory Panel
 *
 * ENHANCED: Now includes document_hash for cross-chat recognition
 */
async function bridgeRAGToMemory(
	ragService: DocumentRAGService,
	conversationId: string,
	docFile: { path: string; name: string; mime: string },
	documentHash?: string
): Promise<void> {
	try {
		// Get chunks from RAG store
		const chunks = await ragService.store.getChunks(conversationId);
		if (chunks.length === 0) {
			console.log("[RAG→Memory] No chunks to bridge");
			return;
		}

		console.log(`[RAG→Memory] Bridging ${chunks.length} chunks to memory system`);

		const facade = UnifiedMemoryFacade.getInstance();
		const documentId = `rag:${conversationId}`;

		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			await facade.store({
				userId: ADMIN_USER_ID,
				tier: "documents",
				text: chunk.content,
				metadata: {
					book_id: documentId,
					chunk_index: i,
					title: docFile.name,
					file_type: docFile.mime,
					source: "rag_upload",
					conversation_id: conversationId,
					// CRITICAL: Include document_hash for cross-chat recognition
					document_hash: documentHash || null,
				},
			});
		}

		console.log(`[RAG→Memory] Successfully bridged ${chunks.length} chunks with document_hash`);
	} catch (err) {
		console.error("[RAG→Memory] Bridge failed:", err);
		// Don't throw - memory storage is enhancement, not critical path
	}
}

/**
 * Check if document already exists in memory system (cross-chat recognition)
 * This is the KEY function for recognizing previously processed documents
 */
async function checkDocumentInMemorySystem(docFile: {
	path: string;
	name: string;
	mime: string;
}): Promise<{
	recognized: boolean;
	documentHash?: string;
	existingBookId?: string;
	existingTitle?: string;
	chunkCount?: number;
}> {
	try {
		const fs = await import("fs/promises");
		const fileContent = await fs.readFile(docFile.path);
		const { createHash } = await import("crypto");
		const fileHash = createHash("sha256").update(fileContent).digest("hex");

		const { collections } = await import("$lib/server/database");
		const existing = await collections.books.findOne(
			{ userId: ADMIN_USER_ID, fileHash, status: "completed" },
			{ projection: { _id: 1, title: 1, totalChunks: 1 } }
		);

		if (existing?._id) {
			return {
				recognized: true,
				documentHash: fileHash,
				existingBookId: existing._id.toString(),
				existingTitle: existing.title ?? docFile.name,
				chunkCount: existing.totalChunks ?? 0,
			};
		}

		return { recognized: false, documentHash: fileHash };
	} catch (err) {
		console.error("[RAG] Document recognition check failed:", err);
		return { recognized: false };
	}
}

async function loadStoredBookChunks(params: {
	userId: string;
	bookId: string;
	limit: number;
}): Promise<
	Array<{
		memoryId: string;
		chunkIndex: number;
		content: string;
		title: string;
	}>
> {
	const { Database } = await import("$lib/server/database");
	const db = await Database.getInstance();
	const client = db.getClient();
	const items = client.db().collection("memory_items");

	const docs = await items
		.find(
			{
				user_id: params.userId,
				tier: "documents",
				status: "active",
				"source.book.book_id": params.bookId,
			},
			{ projection: { memory_id: 1, text: 1, source: 1 } }
		)
		.sort({ "source.book.chunk_index": 1 })
		.limit(params.limit)
		.toArray();

	return docs.map((doc: any) => ({
		memoryId: String(doc.memory_id),
		chunkIndex: Number(doc.source?.book?.chunk_index ?? 0),
		content: String(doc.text ?? ""),
		title: String(doc.source?.book?.title ?? "Unknown"),
	}));
}

function scoreChunk(query: string, content: string): number {
	const q = query.trim();
	if (!q) return 0;
	const contentLower = content.toLowerCase();
	const queryLower = q.toLowerCase();

	let score = 0;
	if (contentLower.includes(queryLower)) score += 5;

	const tokens = queryLower
		.split(/\s+/)
		.filter((t) => t.length >= 2)
		.slice(0, 12);
	for (const t of tokens) {
		if (contentLower.includes(t)) score += 1;
	}

	return score;
}

/**
 * Check if conversation has document files attached
 */
export function hasDocumentAttachments(messages: EndpointMessage[]): boolean {
	return messages.some((msg) =>
		(msg.files ?? []).some(
			(file) => file?.mime && DOCUMENT_MIMES.some((m) => file.mime?.startsWith(m))
		)
	);
}

/**
 * Extract the first document file info from messages
 */
export function extractDocumentFile(messages: EndpointMessage[]): {
	path: string;
	name: string;
	mime: string;
} | null {
	for (const msg of messages) {
		for (const file of msg.files ?? []) {
			if (file?.mime && DOCUMENT_MIMES.some((m) => file.mime?.startsWith(m))) {
				// File path is stored in the file object (added by uploadFile.ts)
				const filePath = (file as { path?: string }).path;
				if (filePath) {
					return {
						path: filePath,
						name: file.name || "document",
						mime: file.mime,
					};
				}
			}
		}
	}
	return null;
}

/**
 * RAG context result from retrieval
 */
export interface RAGContextResult {
	hasContext: boolean;
	contextInjection: string;
	language: SupportedLanguage;
	retrievalResult?: RetrievalResult;
	traceEmitter?: TraceEmitter;
	runId?: string;
}

/**
 * Try to retrieve RAG context for the conversation
 *
 * @param conversationId - The conversation ID
 * @param messages - The conversation messages
 * @returns RAG context result with injection string
 */
export async function tryRetrieveRAGContext(
	conversationId: string,
	messages: EndpointMessage[]
): Promise<RAGContextResult> {
	// Check if RAG is enabled
	if (!isRAGEnabled()) {
		return { hasContext: false, contextInjection: "", language: "en" };
	}

	const userQuery = extractUserQueryFromMessages(messages);
	if (!userQuery) {
		return { hasContext: false, contextInjection: "", language: "en" };
	}

	const language = detectQueryLanguage(userQuery);

	try {
		// Get MongoDB client
		const mongoClient = await getMongoClient();

		// Create trace emitter for progress tracking
		const traceEmitter = createTraceEmitter();
		traceEmitter.setLanguage(language === "mixed" ? "en" : language);
		const runId = traceEmitter.startRun(conversationId);

		// Create RAG service
		const ragService = createDocumentRAGService({
			traceEmitter,
			mongoClient,
			embeddingEndpoint: env.EMBEDDING_SERVICE_URL,
			rerankerEndpoint: env.RERANKER_SERVICE_URL,
		});

		// Check if document is already ingested
		let isIngested = await ragService.isDocumentIngested(conversationId);

		// Debug: Log file info
		const hasFiles = hasDocumentAttachments(messages);
		console.log("[RAG] Debug:", {
			conversationId,
			isIngested,
			hasDocumentAttachments: hasFiles,
			messageCount: messages.length,
			filesInMessages: messages.flatMap((m) =>
				(m.files ?? []).map((f) => ({
					name: f.name,
					mime: f.mime,
					path: (f as { path?: string }).path,
				}))
			),
		});

		// If not ingested but has document attachments, ingest now
		if (!isIngested) {
			const docFile = extractDocumentFile(messages);
			if (docFile) {
				// ENHANCED: Check if document already exists in memory system (cross-chat recognition)
				const memoryCheck = await checkDocumentInMemorySystem(docFile);

				if (memoryCheck.recognized && memoryCheck.existingBookId) {
					const stored = await loadStoredBookChunks({
						userId: ADMIN_USER_ID,
						bookId: memoryCheck.existingBookId,
						limit: 200,
					});

					const ranked = stored
						.map((c) => ({ ...c, score: scoreChunk(userQuery, c.content) }))
						.sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex);

					const selected = ranked.filter((c) => c.content.trim().length > 0).slice(0, 10);
					const title =
						selected[0]?.title ?? memoryCheck.existingTitle ?? docFile.name ?? "Document";

					const contextBody = selected
						.map((c) => `[#${c.chunkIndex}]\n${c.content.slice(0, 1800)}`)
						.join("\n\n---\n\n");

					traceEmitter.completeRun(runId);
					return {
						hasContext: selected.length > 0,
						contextInjection: `<document_recognition>
I have already processed this document ("${title}") in a previous session.
Using cached chunks from memory instead of re-processing.

// Hebrew:
כבר עיבדתי את המסמך הזה ("${title}") בשיחה קודמת.
משתמש בקטעים שנשמרו בזיכרון במקום לעבד מחדש.
</document_recognition>\n\n<retrieved_document_context>\n${contextBody}\n</retrieved_document_context>`,
						language,
						traceEmitter,
						runId,
					};
				}

				console.log("[RAG] Document not ingested, starting ingestion:", docFile.name);
				try {
					await ragService.ingestDocument({
						runId,
						conversationId,
						filePath: docFile.path,
						fileName: docFile.name,
						mimeType: docFile.mime,
						userQuery,
					});
					isIngested = true;
					console.log("[RAG] Document ingested successfully");

					// Bridge to memory system so documents appear in Memory Panel
					// ENHANCED: Now includes document_hash for cross-chat recognition
					await bridgeRAGToMemory(ragService, conversationId, docFile, memoryCheck.documentHash);
				} catch (ingestError) {
					console.error("[RAG] Document ingestion failed:", ingestError);
					traceEmitter.completeRun(runId);
					return {
						hasContext: false,
						contextInjection: "",
						language,
						traceEmitter,
						runId,
					};
				}
			} else {
				// No document file found
				traceEmitter.completeRun(runId);
				return {
					hasContext: false,
					contextInjection: "",
					language,
					traceEmitter,
					runId,
				};
			}
		}

		// Retrieve context
		const retrievalResult = await ragService.retrieveContext({
			runId,
			conversationId,
			query: userQuery,
		});

		if (!retrievalResult.hasContext || retrievalResult.chunks.length === 0) {
			traceEmitter.completeRun(runId);
			return {
				hasContext: false,
				contextInjection: "",
				language,
				retrievalResult,
				traceEmitter,
				runId,
			};
		}

		// Build context injection
		const contextInjection = ragService.buildContextInjection(retrievalResult);

		traceEmitter.completeRun(runId);

		return {
			hasContext: true,
			contextInjection,
			language,
			retrievalResult,
			traceEmitter,
			runId,
		};
	} catch (error) {
		console.error("[RAG] Error retrieving context:", error);
		return { hasContext: false, contextInjection: "", language };
	}
}

/**
 * Build language instruction based on detected language
 */
export function buildLanguageInstruction(language: SupportedLanguage): string {
	if (language === "he") {
		return "**Language**: The user is writing in Hebrew. Respond in Hebrew unless the content requires English (e.g., code, technical terms).";
	}
	if (language === "mixed") {
		return "**Language**: The user is writing in both Hebrew and English. Match the user's language preference based on the primary language of their query.";
	}
	return "";
}

/**
 * Inject RAG context into preprompt pieces
 *
 * @param prepromptPieces - Array of preprompt pieces to append to
 * @param ragResult - RAG context result
 */
export function injectRAGContext(prepromptPieces: string[], ragResult: RAGContextResult): void {
	if (!ragResult.hasContext || !ragResult.contextInjection) {
		return;
	}

	// Add language instruction if needed
	const langInstruction = buildLanguageInstruction(ragResult.language);
	if (langInstruction) {
		prepromptPieces.push(langInstruction);
	}

	// Add context injection with explicit instruction to NOT call docling
	prepromptPieces.push(`**IMPORTANT - Document Already Processed**:
The attached document has ALREADY been processed and extracted. The content is provided below.
DO NOT call docling_convert, docling_ocr, or any document extraction tools - the document is already in context.
המסמך המצורף כבר עובד ותוכנו מוצג למטה. אין לקרוא לכלי docling - המסמך כבר בהקשר.

**Retrieved Document Context**:
${ragResult.contextInjection}

Use the above document context to answer the user's question. Cite specific chunks when referencing information from the document.`);
}

// ============================================
// ENTERPRISE STREAMING RAG PIPELINE
// ============================================

/**
 * Streaming RAG result - either a trace update, memory update, or the final result
 */
export type StreamingRAGItem =
	| { type: "trace"; update: MessageTraceUpdate }
	| { type: "memory"; update: MessageMemoryDocumentIngestingUpdate }
	| { type: "done"; result: RAGContextResult };

/**
 * Stream RAG pipeline with real-time trace events
 *
 * This is the ENTERPRISE-GRADE solution that yields trace events
 * IMMEDIATELY as operations progress, not after everything is done.
 *
 * Usage:
 * ```typescript
 * for await (const item of streamRAGPipeline(conversationId, messages)) {
 *   if (item.type === "trace") {
 *     yield item.update; // Stream to client immediately
 *   } else {
 *     ragContext = item.result; // Final result
 *   }
 * }
 * ```
 */
export async function* streamRAGPipeline(
	conversationId: string,
	messages: EndpointMessage[]
): AsyncGenerator<StreamingRAGItem> {
	// Check if RAG is enabled
	if (!isRAGEnabled()) {
		yield { type: "done", result: { hasContext: false, contextInjection: "", language: "en" } };
		return;
	}

	const userQuery = extractUserQueryFromMessages(messages);
	if (!userQuery) {
		yield { type: "done", result: { hasContext: false, contextInjection: "", language: "en" } };
		return;
	}

	const language = detectQueryLanguage(userQuery);
	const traceLang = language === "mixed" ? "en" : language;

	// Create trace emitter for real-time progress tracking
	const traceEmitter = createTraceEmitter();
	traceEmitter.setLanguage(traceLang);
	const runId = traceEmitter.startRun(conversationId);

	// IMMEDIATELY yield run.created event - user sees feedback right away
	const runCreatedUpdate = traceEmitter.toMessageUpdate({
		type: "run.created",
		runId,
		conversationId,
		timestamp: Date.now(),
	});
	if (runCreatedUpdate) {
		yield { type: "trace", update: runCreatedUpdate };
	}

	// Queue for trace events and memory events from background work
	const eventQueue: Array<
		| { kind: "trace"; update: MessageTraceUpdate }
		| { kind: "memory"; update: MessageMemoryDocumentIngestingUpdate }
	> = [];
	let workComplete = false;
	let workResult: RAGContextResult | null = null;
	let workError: Error | null = null;

	// Helper to push document processing events
	const pushDocumentEvent = (
		documentName: string,
		stage: MessageMemoryDocumentIngestingUpdate["stage"],
		extra?: {
			chunksProcessed?: number;
			totalChunks?: number;
			recognized?: boolean;
			message?: string;
		}
	) => {
		eventQueue.push({
			kind: "memory",
			update: createDocumentIngestingUpdate({
				documentName,
				stage,
				...extra,
			}),
		});
	};

	// Subscribe to trace events - push to queue as they happen
	const unsubscribe = traceEmitter.subscribe((event) => {
		const update = traceEmitter.toMessageUpdate(event);
		if (update) {
			eventQueue.push({ kind: "trace", update });
		}
	});

	// Start RAG work in background (don't await)
	const ragWorkPromise = (async () => {
		try {
			const hasFiles = hasDocumentAttachments(messages);
			if (!hasFiles) {
				traceEmitter.completeRun(runId);
				return {
					hasContext: false,
					contextInjection: "",
					language,
					traceEmitter,
					runId,
				} as RAGContextResult;
			}

			const docFile = extractDocumentFile(messages);
			if (!docFile) {
				traceEmitter.completeRun(runId);
				return {
					hasContext: false,
					contextInjection: "",
					language,
					traceEmitter,
					runId,
				} as RAGContextResult;
			}

			pushDocumentEvent(docFile.name, "reading", { message: `Reading ${docFile.name}...` });

			const ingestionService = new UnifiedDocumentIngestionService();
			ingestionService.onProgress((progress) => {
				if (progress.stage === "chunking") {
					pushDocumentEvent(docFile.name, "chunking", { message: progress.message });
					return;
				}
				if (progress.stage === "embedding") {
					pushDocumentEvent(docFile.name, "embedding", { message: progress.message });
					return;
				}
				if (progress.stage === "storing") {
					pushDocumentEvent(docFile.name, "storing", { message: progress.message });
					return;
				}
				if (progress.stage === "completed") {
					pushDocumentEvent(docFile.name, "completed", { message: progress.message });
					return;
				}
				if (progress.stage === "recognized") {
					pushDocumentEvent(docFile.name, "recognized", {
						recognized: true,
						message: progress.message,
					});
					return;
				}
				// Map queued/reading/extracting/checking_duplicate/failed to existing stages
				pushDocumentEvent(docFile.name, "extracting", { message: progress.message });
			});

			const ingestResult = await ingestionService.ingestDocument({
				userId: ADMIN_USER_ID,
				conversationId,
				filePath: docFile.path,
				fileName: docFile.name,
				mimeType: docFile.mime,
				userQuery,
			});

			if (!ingestResult.success || !ingestResult.bookId) {
				traceEmitter.completeRun(runId);
				return {
					hasContext: false,
					contextInjection: "",
					language,
					traceEmitter,
					runId,
				} as RAGContextResult;
			}

			if (ingestResult.recognizedFromPreviousChat) {
				pushDocumentEvent(docFile.name, "recognized", {
					recognized: true,
					totalChunks: ingestResult.chunkCount,
					message: `Document recognized from previous session (${ingestResult.chunkCount ?? 0} chunks)`,
				});
			}

			const facade = UnifiedMemoryFacade.getInstance();
			const searchResponse = await facade.search({
				userId: ADMIN_USER_ID,
				query: userQuery,
				collections: ["documents"],
				limit: 16,
			});

			const sameBook = searchResponse.results.filter((r) =>
				r.citations.some((c) => c.book?.book_id === ingestResult.bookId)
			);
			const selected = (sameBook.length > 0 ? sameBook : searchResponse.results).slice(0, 10);
			const title =
				selected.find((r) => r.citations.some((c) => c.book?.title))?.citations.find((c) => c.book)
					?.book?.title ?? docFile.name;

			const contextBody = selected
				.map((r) => {
					const book = r.citations.find((c) => c.book)?.book;
					const idx = book?.chunk_index ?? r.position;
					return `[#${idx}]\n${r.content.slice(0, 1800)}`;
				})
				.join("\n\n---\n\n");

			const contextInjection = `<document_context>
Document: "${title}" (documents tier)

IMPORTANT:
The document has already been extracted and chunked.
DO NOT call docling_convert, docling_ocr, or any document extraction tools.

// Hebrew:
המסמך כבר חולץ וחולק לקטעים.
אין לקרוא לכלי docling_convert או docling_ocr.
</document_context>\n\n<retrieved_document_context>\n${contextBody}\n</retrieved_document_context>`;
			traceEmitter.completeRun(runId);

			return {
				hasContext: true,
				contextInjection,
				language,
				traceEmitter,
				runId,
			} as RAGContextResult;
		} catch (error) {
			console.error("[RAG] Pipeline error:", error);
			traceEmitter.completeRun(runId);
			throw error;
		}
	})();

	// Handle work completion
	ragWorkPromise
		.then((result) => {
			workResult = result;
			workComplete = true;
		})
		.catch((error) => {
			workError = error;
			workComplete = true;
		});

	// Yield trace and memory events as they come, while work is in progress
	while (!workComplete || eventQueue.length > 0) {
		// Yield any queued events
		while (eventQueue.length > 0) {
			const event = eventQueue.shift()!;
			if (event.kind === "trace") {
				yield { type: "trace", update: event.update };
			} else {
				yield { type: "memory", update: event.update };
			}
		}

		// If work is not complete, wait a bit for more events
		if (!workComplete) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}

	// Cleanup
	unsubscribe();

	// Handle errors
	if (workError) {
		yield {
			type: "done",
			result: { hasContext: false, contextInjection: "", language },
		};
		return;
	}

	// Yield final result
	if (workResult) {
		yield { type: "done", result: workResult };
	} else {
		yield {
			type: "done",
			result: { hasContext: false, contextInjection: "", language },
		};
	}
}
