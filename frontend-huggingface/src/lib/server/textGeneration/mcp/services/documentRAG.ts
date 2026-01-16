/**
 * DocumentRAGService - Main RAG Orchestrator
 *
 * Coordinates document ingestion, retrieval, and context injection.
 * Implements the 3-tier retrieval strategy:
 *   Tier 1: Semantic search + reranking (score >= 0.7)
 *   Tier 2: LLM self-assessment
 *   Tier 3: Docling augmentation
 */

import { createHash } from "crypto";
import { env } from "$env/dynamic/private";
import type { MongoClient, ObjectId } from "mongodb";

import { TraceEmitter } from "./traceEmitter";
import { SemanticChunker, createSemanticChunker } from "./semanticChunker";
import { EmbeddingClient, createEmbeddingClient } from "./embeddingClient";
import { RerankerClient, createRerankerClient } from "./rerankerClient";
import { extractDocumentText } from "./doclingClient";
import { DocumentContextStore, createDocumentContextStore } from "../stores/documentContextStore";
import { TRACE_STEPS } from "../constants/traceSteps";

import type {
	DocumentContext,
	DocumentMetadata,
	UserContext,
	IngestParams,
	RetrieveParams,
	AugmentParams,
	RetrievalResult,
	SupportedLanguage,
	DocumentChunk,
} from "../types/documentContext";

/**
 * Normalize language to "he" | "en" for trace emitter
 */
function normalizeTraceLanguage(lang: SupportedLanguage): "he" | "en" {
	return lang === "he" ? "he" : "en";
}

/**
 * Dependencies for DocumentRAGService
 */
export interface DocumentRAGDependencies {
	traceEmitter: TraceEmitter;
	mongoClient: MongoClient;
	embeddingEndpoint?: string;
	rerankerEndpoint?: string;
}

/**
 * Configuration options
 */
export interface DocumentRAGConfig {
	rerankerThreshold: number;
	maxChunksToInject: number;
	maxChunkTokens: number;
	totalContextBudget: number;
}

const DEFAULT_CONFIG: DocumentRAGConfig = {
	rerankerThreshold: parseFloat(env.RERANKER_THRESHOLD || "0.7"),
	maxChunksToInject: parseInt(env.MAX_CONTEXT_CHUNKS || "10", 10),
	maxChunkTokens: 800,
	totalContextBudget: parseInt(env.CONTEXT_TOKEN_BUDGET || "8000", 10),
};

/**
 * Main Document RAG Service
 */
export class DocumentRAGService {
	private traceEmitter: TraceEmitter;
	private chunker: SemanticChunker;
	private embedder: EmbeddingClient;
	private reranker: RerankerClient;
	public readonly store: DocumentContextStore;
	private config: DocumentRAGConfig;

	constructor(deps: DocumentRAGDependencies, config?: Partial<DocumentRAGConfig>) {
		this.traceEmitter = deps.traceEmitter;
		this.config = { ...DEFAULT_CONFIG, ...config };

		this.chunker = createSemanticChunker(this.config.maxChunkTokens);
		this.embedder = createEmbeddingClient({ endpoint: deps.embeddingEndpoint });
		this.reranker = createRerankerClient({ endpoint: deps.rerankerEndpoint });
		this.store = createDocumentContextStore(deps.mongoClient);
	}

	// ============================================
	// Phase 1: Document Ingestion
	// ============================================

	/**
	 * Ingest a document with streaming progress
	 */
	async ingestDocument(params: IngestParams): Promise<DocumentContext> {
		const { runId, conversationId, filePath, fileName, mimeType, userQuery } = params;
		const language = this.detectLanguage(userQuery);

		// Step 1: Extract text via Docling (placeholder - actual extraction done externally)
		const traceLang = normalizeTraceLanguage(language);
		this.traceEmitter.stepStart(runId, TRACE_STEPS.EXTRACTING_DOCUMENT, traceLang);
		const rawText = await this.extractDocument(filePath, mimeType);
		this.traceEmitter.stepDone(runId, TRACE_STEPS.EXTRACTING_DOCUMENT.id);

		// Step 2: Semantic chunking
		this.traceEmitter.stepStart(runId, TRACE_STEPS.CHUNKING_CONTENT, traceLang);
		const chunks = await this.chunker.chunk(rawText);
		this.traceEmitter.stepDetail(
			runId,
			TRACE_STEPS.CHUNKING_CONTENT.id,
			language === "he" ? `${chunks.length} קטעים` : `${chunks.length} chunks`
		);
		this.traceEmitter.stepDone(runId, TRACE_STEPS.CHUNKING_CONTENT.id);

		this.traceEmitter.stepStart(runId, TRACE_STEPS.GENERATING_EMBEDDINGS, traceLang);
		this.traceEmitter.stepDone(runId, TRACE_STEPS.GENERATING_EMBEDDINGS.id);

		// Step 4: Extract metadata
		this.traceEmitter.stepStart(runId, TRACE_STEPS.EXTRACTING_METADATA, traceLang);
		const metadata = this.extractMetadataSync(rawText, language);
		this.traceEmitter.stepDone(runId, TRACE_STEPS.EXTRACTING_METADATA.id);

		// Step 5: Extract user context from query
		const userContext = this.extractUserContextSync(userQuery, language);

		// Step 6: Store in MongoDB
		this.traceEmitter.stepStart(runId, TRACE_STEPS.STORING_CONTEXT, traceLang);

		const docContext = await this.store.createDocumentContext({
			conversationId,
			documentHash: this.hashContent(rawText),
			fileName,
			mimeType,
			metadata,
			userContext,
			chunkCount: chunks.length,
			totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
		});

		await this.store.createChunks(
			chunks.map((chunk, idx) => ({
				documentId: docContext._id,
				conversationId,
				content: chunk.content,
				chunkIndex: idx,
				tokenCount: chunk.tokenCount,
				sectionTitle: chunk.sectionTitle,
				chunkType: chunk.type,
				embedding: [],
			}))
		);

		this.traceEmitter.stepDone(runId, TRACE_STEPS.STORING_CONTEXT.id);

		this.embedder.submitEmbedBatch(
			chunks.map((c) => c.content),
			async (embeddings) => {
				await this.store.updateChunkEmbeddings(docContext._id, embeddings);
			}
		);

		return docContext;
	}

	// ============================================
	// Phase 2: Context Retrieval
	// ============================================

	/**
	 * Retrieve relevant context for a follow-up query
	 */
	async retrieveContext(params: RetrieveParams): Promise<RetrievalResult> {
		const { runId, conversationId, query } = params;
		const language = this.detectLanguage(query);
		const traceLang = normalizeTraceLanguage(language);

		// Check if document context exists
		const docContext = await this.store.getDocumentContext(conversationId);
		if (!docContext) {
			return { hasContext: false, chunks: [], needsToolCall: true };
		}

		const existingChunks = await this.store.getChunks(conversationId);
		const hasEmbeddings = existingChunks.some(
			(c) => Array.isArray(c.embedding) && c.embedding.length > 0
		);
		if (!hasEmbeddings) {
			return {
				hasContext: false,
				chunks: [],
				needsToolCall: true,
				userContext: docContext.userContext,
			};
		}

		// TIER 1: Semantic search + reranking
		this.traceEmitter.stepStart(runId, TRACE_STEPS.SEARCHING_KNOWLEDGE, traceLang);
		const queryEmbedding = await this.embedder.embed(query);
		const candidates = await this.store.vectorSearch(
			conversationId,
			queryEmbedding,
			20 // Get top 20 candidates for reranking
		);
		this.traceEmitter.stepDone(runId, TRACE_STEPS.SEARCHING_KNOWLEDGE.id);

		if (candidates.length === 0) {
			return {
				hasContext: false,
				chunks: [],
				needsToolCall: true,
				userContext: docContext.userContext,
			};
		}

		// Rerank candidates
		this.traceEmitter.stepStart(runId, TRACE_STEPS.RANKING_RESULTS, traceLang);
		const ranked = await this.reranker.rerankChunks(query, candidates);

		// Filter by threshold
		const topChunks = ranked
			.filter((r) => r.score >= this.config.rerankerThreshold)
			.slice(0, this.config.maxChunksToInject);

		this.traceEmitter.stepDetail(
			runId,
			TRACE_STEPS.RANKING_RESULTS.id,
			language === "he"
				? `${topChunks.length} קטעים רלוונטיים (ציון > ${this.config.rerankerThreshold})`
				: `${topChunks.length} relevant chunks (score > ${this.config.rerankerThreshold})`
		);
		this.traceEmitter.stepDone(runId, TRACE_STEPS.RANKING_RESULTS.id);

		// TIER 1 success: High-confidence results found
		if (topChunks.length > 0) {
			// Update retrieval stats
			const chunkIds = topChunks.map((c) => c._id?.toString()).filter((id): id is string => !!id);
			await this.store.updateRetrievalStats(chunkIds);

			// Record query
			await this.store.addQueryToHistory(conversationId, {
				query,
				language,
				answeredFromCache: true,
			});

			return {
				hasContext: true,
				chunks: topChunks,
				userContext: docContext.userContext,
				needsToolCall: false,
				tier: 1,
			};
		}

		// TIER 2: Return all candidates for LLM self-assessment
		this.traceEmitter.stepStart(runId, TRACE_STEPS.ASSESSING_CONTEXT, traceLang);

		const allChunks = ranked.slice(0, this.config.maxChunksToInject);

		return {
			hasContext: true,
			chunks: allChunks,
			userContext: docContext.userContext,
			needsToolCall: false, // Let LLM decide
			tier: 2,
			requiresAssessment: true,
		};
	}

	// ============================================
	// Phase 3: Context Augmentation (Tier 3)
	// ============================================

	/**
	 * Augment context with additional Docling extraction
	 */
	async augmentContext(params: AugmentParams): Promise<void> {
		const { runId, conversationId, query, filePath } = params;
		const language = this.detectLanguage(query);
		const traceLang = normalizeTraceLanguage(language);

		this.traceEmitter.stepStart(runId, TRACE_STEPS.AUGMENTING_CONTEXT, traceLang);

		// Get existing document
		const docContext = await this.store.getDocumentContext(conversationId);
		if (!docContext) {
			this.traceEmitter.stepError(runId, TRACE_STEPS.AUGMENTING_CONTEXT.id);
			return;
		}

		// Extract additional content (focused on query)
		const additionalText = await this.extractDocument(filePath);

		// Chunk and embed new content
		const newChunks = await this.chunker.chunk(additionalText);
		const baseChunkIndex = docContext.chunkCount;

		// Append new chunks
		await this.store.appendChunks(
			docContext._id,
			newChunks.map((chunk, idx) => ({
				documentId: docContext._id,
				conversationId,
				content: chunk.content,
				chunkIndex: baseChunkIndex + idx,
				tokenCount: chunk.tokenCount,
				sectionTitle: chunk.sectionTitle,
				chunkType: chunk.type,
				embedding: [],
			}))
		);

		this.embedder.submitEmbedBatch(
			newChunks.map((c) => c.content),
			async (embeddings) => {
				await this.store.updateChunkEmbeddings(docContext._id, embeddings, baseChunkIndex);
			}
		);

		// Record augmentation
		await this.store.recordAugmentation(docContext._id, {
			timestamp: new Date(),
			reason: query,
			chunksAdded: newChunks.length,
		});

		this.traceEmitter.stepDetail(
			runId,
			TRACE_STEPS.AUGMENTING_CONTEXT.id,
			language === "he"
				? `נוספו ${newChunks.length} קטעים חדשים`
				: `Added ${newChunks.length} new chunks`
		);
		this.traceEmitter.stepDone(runId, TRACE_STEPS.AUGMENTING_CONTEXT.id);
	}

	// ============================================
	// Context Injection
	// ============================================

	/**
	 * Build context injection string for LLM prompt
	 */
	buildContextInjection(result: RetrievalResult): string {
		if (!result.hasContext || result.chunks.length === 0) {
			return "";
		}

		let injection = "<document_context>\n";

		// User context (compact)
		if (result.userContext) {
			const uc = result.userContext;
			if (uc.profession) {
				injection += `User profession: ${uc.profession}\n`;
			}
			if (uc.preferredLanguage) {
				injection += `Preferred language: ${uc.preferredLanguage}\n`;
			}
			if (uc.customContext && uc.customContext.length > 0) {
				injection += `Context: ${uc.customContext.join(", ")}\n`;
			}
		}

		injection += "\n<retrieved_chunks>\n";

		// Add chunks within token budget
		let tokenCount = 0;
		for (const chunk of result.chunks) {
			if (tokenCount + chunk.tokenCount > this.config.totalContextBudget) {
				break;
			}

			const header = chunk.sectionTitle
				? `[Chunk ${chunk.chunkIndex} - ${chunk.sectionTitle}]`
				: `[Chunk ${chunk.chunkIndex}]`;

			injection += `${header}\n${chunk.content}\n\n`;
			tokenCount += chunk.tokenCount;
		}

		injection += "</retrieved_chunks>\n</document_context>";

		return injection;
	}

	// ============================================
	// Helper Methods
	// ============================================

	/**
	 * Detect language from text
	 */
	detectLanguage(text: string): SupportedLanguage {
		const hebrewRegex = /[\u0590-\u05FF]/g;
		const hebrewChars = (text.match(hebrewRegex) || []).length;
		const englishChars = (text.match(/[a-zA-Z]/g) || []).length;

		if (hebrewChars + englishChars === 0) return "en";

		const hebrewRatio = hebrewChars / (hebrewChars + englishChars);

		if (hebrewRatio > 0.5) return "he";
		if (hebrewRatio < 0.2) return "en";
		return "mixed";
	}

	/**
	 * Extract document content using Docling service
	 */
	private async extractDocument(filePath: string, mimeType?: string): Promise<string> {
		// For plain text files, read directly
		const textMimes = ["text/plain", "text/markdown"];
		if (mimeType && textMimes.some((m) => mimeType.startsWith(m))) {
			try {
				const fs = await import("fs/promises");
				const content = await fs.readFile(filePath, "utf-8");
				return content;
			} catch {
				return "";
			}
		}

		// For PDFs and other complex formats, use Docling
		try {
			console.log("[RAG] Extracting document with Docling:", filePath);
			const result = await extractDocumentText(filePath);
			console.log("[RAG] Docling extraction complete:", {
				textLength: result.text.length,
				pages: result.pages,
				format: result.format,
			});
			return result.text;
		} catch (error) {
			console.error("[RAG] Docling extraction failed:", error);
			// Fallback to direct read for text-based formats
			try {
				const fs = await import("fs/promises");
				const content = await fs.readFile(filePath, "utf-8");
				return content;
			} catch {
				return "";
			}
		}
	}

	/**
	 * Extract metadata synchronously (basic version)
	 */
	private extractMetadataSync(text: string, language: SupportedLanguage): DocumentMetadata {
		// Basic metadata extraction without LLM
		const keywords = this.extractKeywords(text);

		return {
			classification: "general",
			subject: "",
			keywords,
			citations: this.extractCitations(text),
			authors: [],
			language,
			extractedAt: new Date(),
		};
	}

	/**
	 * Extract basic keywords from text
	 */
	private extractKeywords(text: string): { hebrew: string[]; english: string[] } {
		const hebrew: string[] = [];
		const english: string[] = [];

		// Extract Hebrew words (3+ chars, common)
		const hebrewWords = text.match(/[\u0590-\u05FF]{3,}/g) || [];
		const hebrewCounts = new Map<string, number>();
		for (const word of hebrewWords) {
			hebrewCounts.set(word, (hebrewCounts.get(word) || 0) + 1);
		}
		// Get top 10 by frequency
		const sortedHebrew = [...hebrewCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
		hebrew.push(...sortedHebrew.map(([word]) => word));

		// Extract English words (4+ chars, common)
		const englishWords = text.match(/[a-zA-Z]{4,}/gi) || [];
		const englishCounts = new Map<string, number>();
		for (const word of englishWords) {
			const lower = word.toLowerCase();
			englishCounts.set(lower, (englishCounts.get(lower) || 0) + 1);
		}
		const sortedEnglish = [...englishCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
		english.push(...sortedEnglish.map(([word]) => word));

		return { hebrew, english };
	}

	/**
	 * Extract citations from text
	 */
	private extractCitations(text: string): string[] {
		const citations: string[] = [];

		// Match various citation patterns
		const patterns = [
			/\[(\d+)\]/g, // [1], [2]
			/\(([A-Z][a-z]+,?\s+\d{4})\)/g, // (Author, 2020)
			/פס"ד\s+[\u0590-\u05FF\s]+/g, // Hebrew case law
			/ע"א\s+\d+\/\d+/g, // Israeli appeal format
		];

		for (const pattern of patterns) {
			const matches = text.match(pattern) || [];
			citations.push(...matches.slice(0, 5)); // Limit per pattern
		}

		return [...new Set(citations)].slice(0, 20);
	}

	/**
	 * Extract user context from query (basic version)
	 */
	private extractUserContextSync(query: string, language: SupportedLanguage): UserContext {
		const context: UserContext = {
			preferredLanguage: language,
			customContext: [],
		};

		// Detect profession mentions
		const professionPatterns = [
			/עורך[ת]?\s*דין|lawyer|attorney/i,
			/רופא|רופאה|doctor|physician/i,
			/מהנדס|מהנדסת|engineer/i,
			/רואה?\s*חשבון|accountant/i,
		];

		for (const pattern of professionPatterns) {
			if (pattern.test(query)) {
				const match = query.match(pattern);
				if (match) {
					context.profession = match[0];
					break;
				}
			}
		}

		return context;
	}

	/**
	 * Hash content for deduplication
	 */
	private hashContent(content: string): string {
		return createHash("sha256").update(content).digest("hex");
	}

	/**
	 * Check if document is already ingested
	 */
	async isDocumentIngested(conversationId: string): Promise<boolean> {
		const context = await this.store.getDocumentContext(conversationId);
		return context !== null;
	}
}

/**
 * Factory function
 */
export function createDocumentRAGService(
	deps: DocumentRAGDependencies,
	config?: Partial<DocumentRAGConfig>
): DocumentRAGService {
	return new DocumentRAGService(deps, config);
}
