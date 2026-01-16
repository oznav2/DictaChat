import type { ObjectId } from "mongodb";

export interface Book {
	_id: ObjectId;
	userId: string;
	title: string;
	author: string;
	uploadTimestamp: Date;
	status: "processing" | "completed" | "failed";
	totalChunks: number;
	chunksProcessed: number;
	taskId?: string;
	processingStage?: string;
	processingMessage?: string;
	doclingStatus?: string;
	doclingTaskId?: string | null;
	numPages?: number;
	fileType?: string;
	error?: string;

	// Enhanced fields for document registry (requirements 11, 15-20)
	sourceUrl?: string; // Original URL if web article
	sourceType?: "upload" | "web" | "api"; // How document was added
	description?: string; // LLM-generated description
	summary?: string; // LLM-generated summary (English)
	summaryHe?: string; // LLM-generated summary (Hebrew)
	keyPoints?: string[]; // Key points extracted (English)
	keyPointsHe?: string[]; // Key points (Hebrew)
	parsedMarkdown?: string; // Full parsed content from Docling
	language?: "he" | "en" | "mixed"; // Primary language
	urlHash?: string; // Hash for fast URL lookup (<50ms)
	mimeType?: string;
	documentHash?: string; // Content hash for deduplication
	fileHash?: string; // Raw file bytes hash for upload dedup
	fileName?: string; // Original file name
	fileSize?: number; // File size in bytes
	conversationId?: string | null;
	source?: string;
	recognizedFromPreviousChat?: boolean;
	linkedToBookId?: string | null;
	lastAccessedAt?: Date;
	accessCount?: number;

	// Phase 11: Source attribution for personality tracking
	sourcePersonalityId?: string | null;
	sourcePersonalityName?: string | null;
	sourceConversationId?: string | null;
}

/**
 * Document registry entry for fast URL lookup
 */
export interface DocumentRegistryEntry {
	_id: ObjectId;
	urlHash: string; // MD5/SHA256 of normalized URL
	normalizedUrl: string;
	bookId: ObjectId; // Reference to books collection
	status: "processing" | "completed" | "failed";
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Document summary for display in library
 */
export interface DocumentSummary {
	id: string;
	title: string;
	description?: string;
	sourceType: "upload" | "web" | "api";
	sourceUrl?: string;
	language?: "he" | "en" | "mixed";
	status: "processing" | "completed" | "failed";
	uploadTimestamp: Date;
	numPages?: number;
	fileType?: string;
}
