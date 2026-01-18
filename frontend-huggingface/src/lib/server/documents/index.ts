/**
 * Unified Document Module
 *
 * Exports consolidated document ingestion services that provide parity
 * between RAG uploads (input area file attachment) and Bookstore uploads (navbar modal).
 *
 * Both upload paths now use the same underlying ingestion pipeline:
 * - Document hash for cross-chat recognition
 * - Semantic chunking with token-aware boundaries
 * - Embedding generation via dicta-retrieval
 * - Memory system integration (documents tier)
 * - Docling extraction for complex formats
 */

// Unified Ingestion Service (main entry point)
export {
	UnifiedDocumentIngestionService,
	createUnifiedDocumentIngestionService,
	getUnifiedDocumentIngestionService,
	type DocumentIngestionParams,
	type DocumentIngestionResult,
	type DocumentChunk,
	type IngestionProgressCallback,
	type IngestionProgress,
	type IngestionStage,
	type UnifiedIngestionConfig,
} from "./UnifiedDocumentIngestionService";

// Document Registry (existing)
export {
	checkUrlRegistry,
	registerUrl,
	updateRegistryStatus,
	checkContentRegistry,
	getDocumentContext,
	getBilingualDocumentContext,
	hashUrl,
	hashContent,
	normalizeUrl,
} from "./DocumentRegistry";
