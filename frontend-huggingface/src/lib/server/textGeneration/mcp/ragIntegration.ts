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
import { createDocumentRAGService } from "./services/documentRAG";
import { getMongoClient } from "./services/ragDatabase";
import type { RetrievalResult, SupportedLanguage } from "./types/documentContext";
import type { MessageTraceUpdate } from "$lib/types/MessageUpdate";

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
  "application/rtf"
];

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
            mime: file.mime
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
      rerankerEndpoint: env.RERANKER_SERVICE_URL
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
        (m.files ?? []).map((f) => ({ name: f.name, mime: f.mime, path: (f as { path?: string }).path }))
      )
    });

    // If not ingested but has document attachments, ingest now
    if (!isIngested) {
      const docFile = extractDocumentFile(messages);
      if (docFile) {
        console.log("[RAG] Document not ingested, starting ingestion:", docFile.name);
        try {
          await ragService.ingestDocument({
            runId,
            conversationId,
            filePath: docFile.path,
            fileName: docFile.name,
            mimeType: docFile.mime,
            userQuery
          });
          isIngested = true;
          console.log("[RAG] Document ingested successfully");
        } catch (ingestError) {
          console.error("[RAG] Document ingestion failed:", ingestError);
          traceEmitter.completeRun(runId);
          return {
            hasContext: false,
            contextInjection: "",
            language,
            traceEmitter,
            runId
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
          runId
        };
      }
    }

    // Retrieve context
    const retrievalResult = await ragService.retrieveContext({
      runId,
      conversationId,
      query: userQuery
    });

    if (!retrievalResult.hasContext || retrievalResult.chunks.length === 0) {
      traceEmitter.completeRun(runId);
      return {
        hasContext: false,
        contextInjection: "",
        language,
        retrievalResult,
        traceEmitter,
        runId
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
      runId
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
export function injectRAGContext(
  prepromptPieces: string[],
  ragResult: RAGContextResult
): void {
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
 * Streaming RAG result - either a trace update or the final result
 */
export type StreamingRAGItem =
  | { type: "trace"; update: MessageTraceUpdate }
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
    timestamp: Date.now()
  });
  if (runCreatedUpdate) {
    yield { type: "trace", update: runCreatedUpdate };
  }

  // Queue for trace events from background work
  const eventQueue: MessageTraceUpdate[] = [];
  let workComplete = false;
  let workResult: RAGContextResult | null = null;
  let workError: Error | null = null;

  // Subscribe to trace events - push to queue as they happen
  const unsubscribe = traceEmitter.subscribe((event) => {
    const update = traceEmitter.toMessageUpdate(event);
    if (update) {
      eventQueue.push(update);
    }
  });

  // Start RAG work in background (don't await)
  const ragWorkPromise = (async () => {
    try {
      const mongoClient = await getMongoClient();
      const ragService = createDocumentRAGService({
        traceEmitter,
        mongoClient,
        embeddingEndpoint: env.EMBEDDING_SERVICE_URL,
        rerankerEndpoint: env.RERANKER_SERVICE_URL
      });

      // Check if document is already ingested
      let isIngested = await ragService.isDocumentIngested(conversationId);

      // Debug logging
      const hasFiles = hasDocumentAttachments(messages);
      console.log("[RAG] Streaming pipeline started:", {
        conversationId,
        isIngested,
        hasDocumentAttachments: hasFiles
      });

      // If not ingested but has document attachments, ingest now
      if (!isIngested) {
        const docFile = extractDocumentFile(messages);
        if (docFile) {
          console.log("[RAG] Starting document ingestion:", docFile.name);
          await ragService.ingestDocument({
            runId,
            conversationId,
            filePath: docFile.path,
            fileName: docFile.name,
            mimeType: docFile.mime,
            userQuery
          });
          isIngested = true;
          console.log("[RAG] Document ingested successfully");
        } else {
          // No document file found
          traceEmitter.completeRun(runId);
          return {
            hasContext: false,
            contextInjection: "",
            language,
            traceEmitter,
            runId
          } as RAGContextResult;
        }
      }

      // Retrieve context
      const retrievalResult = await ragService.retrieveContext({
        runId,
        conversationId,
        query: userQuery
      });

      if (!retrievalResult.hasContext || retrievalResult.chunks.length === 0) {
        traceEmitter.completeRun(runId);
        return {
          hasContext: false,
          contextInjection: "",
          language,
          retrievalResult,
          traceEmitter,
          runId
        } as RAGContextResult;
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
        runId
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

  // Yield trace events as they come, while work is in progress
  while (!workComplete || eventQueue.length > 0) {
    // Yield any queued events
    while (eventQueue.length > 0) {
      const update = eventQueue.shift()!;
      yield { type: "trace", update };
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
      result: { hasContext: false, contextInjection: "", language }
    };
    return;
  }

  // Yield final result
  if (workResult) {
    yield { type: "done", result: workResult };
  } else {
    yield {
      type: "done",
      result: { hasContext: false, contextInjection: "", language }
    };
  }
}
