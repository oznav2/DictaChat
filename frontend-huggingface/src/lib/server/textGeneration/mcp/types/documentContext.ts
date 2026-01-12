/**
 * Document Context Types for RAG System
 *
 * These types define MongoDB document schemas for storing
 * processed document content with vector embeddings.
 */

import type { ObjectId } from "mongodb";

/**
 * Document classification types
 */
export type DocumentClassification =
	| "legal"
	| "financial"
	| "technical"
	| "medical"
	| "academic"
	| "government"
	| "business"
	| "general";

/**
 * Chunk types based on document structure
 */
export type ChunkType =
	| "paragraph"
	| "table"
	| "list"
	| "header"
	| "citation"
	| "code"
	| "footnote";

/**
 * Supported languages
 */
export type SupportedLanguage = "he" | "en" | "mixed";

// ============================================
// MongoDB Document Schemas
// ============================================

/**
 * Document metadata (for retrieval, NOT injected to LLM)
 */
export interface DocumentMetadata {
	classification: DocumentClassification;
	subject: string;
	keywords: {
		hebrew: string[];
		english: string[];
	};
	citations: string[];
	datePublished?: Date;
	source?: string;
	authors: string[];
	language: SupportedLanguage;
	extractedAt: Date;
}

/**
 * User context extracted from queries (compact, injected to LLM)
 */
export interface UserContext {
	profession?: string; // e.g., "Israeli lawyer"
	expertiseLevel?: string; // "expert", "beginner"
	preferredLanguage: SupportedLanguage;
	customContext: string[]; // Other extracted preferences
}

/**
 * Augmentation history record
 */
export interface AugmentationRecord {
	timestamp: Date;
	reason: string;
	chunksAdded: number;
}

/**
 * Main document context schema (MongoDB: document_contexts)
 */
export interface DocumentContext {
	_id: ObjectId;

	// Identity
	conversationId: string;
	documentHash: string; // SHA-256 of file content
	fileName: string;
	mimeType: string;

	// Metadata
	metadata: DocumentMetadata;

	// User context
	userContext: UserContext;

	// Chunk info
	chunkCount: number;
	totalTokens: number;

	// Lifecycle
	createdAt: Date;
	lastAccessedAt: Date;
	augmentationHistory: AugmentationRecord[];
}

/**
 * Document chunk schema (MongoDB: document_chunks)
 */
export interface DocumentChunk {
	_id: ObjectId;
	documentId: ObjectId; // Reference to document_contexts
	conversationId: string;

	// Content
	content: string;
	chunkIndex: number;
	tokenCount: number;

	// Semantic info
	sectionTitle?: string;
	chunkType: ChunkType;

	// Vector embedding (1024-dim from dicta-retrieval)
	embedding: number[];

	// Retrieval stats
	retrievalCount: number;
	lastRetrievedAt?: Date;
	averageRerankerScore: number;
}

/**
 * Learned fact from conversation
 */
export interface LearnedFact {
	fact: string;
	source: "document" | "user" | "inference";
	confidence: number;
	addedAt: Date;
}

/**
 * Query history record
 */
export interface QueryHistoryRecord {
	query: string;
	language: SupportedLanguage;
	answeredFromCache: boolean;
	timestamp: Date;
}

/**
 * Conversation memory schema (MongoDB: conversation_memory)
 */
export interface ConversationMemory {
	_id: ObjectId;
	conversationId: string;

	// Accumulated context from assistant responses
	learnedFacts: LearnedFact[];

	// Query history for context
	queryHistory: QueryHistoryRecord[];
}

// ============================================
// Service Parameter Types
// ============================================

/**
 * Document ingestion parameters
 */
export interface IngestParams {
	runId: string;
	conversationId: string;
	filePath: string;
	fileName: string;
	mimeType: string;
	userQuery: string;
}

/**
 * Context retrieval parameters
 */
export interface RetrieveParams {
	runId: string;
	conversationId: string;
	query: string;
}

/**
 * Context augmentation parameters
 */
export interface AugmentParams {
	runId: string;
	conversationId: string;
	query: string;
	filePath: string;
}

/**
 * Retrieval result from RAG
 */
export interface RetrievalResult {
	hasContext: boolean;
	chunks: Array<DocumentChunk & { score?: number }>;
	userContext?: UserContext;
	needsToolCall: boolean;
	tier?: 1 | 2 | 3;
	requiresAssessment?: boolean;
}

/**
 * Chunker result
 */
export interface ChunkResult {
	content: string;
	tokenCount: number;
	sectionTitle?: string;
	type: ChunkType;
}

/**
 * Reranked result from reranker service
 */
export interface RerankedResult {
	content: string;
	score: number;
	chunkId: string;
	originalIndex: number;
	tokenCount?: number;
}
