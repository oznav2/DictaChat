/**
 * DocumentContextStore - MongoDB Operations for RAG
 *
 * Handles CRUD operations for document contexts, chunks, and conversation memory.
 * Uses MongoDB for persistent storage with vector search support.
 */

import type { MongoClient, Collection, ObjectId } from "mongodb";
import type {
	DocumentContext,
	DocumentChunk,
	ConversationMemory,
	DocumentMetadata,
	UserContext,
	AugmentationRecord,
	LearnedFact,
	QueryHistoryRecord,
	SupportedLanguage,
} from "../types/documentContext";

/**
 * Store for document context operations
 */
export class DocumentContextStore {
	private client: MongoClient;
	private readonly dbName: string;

	constructor(client: MongoClient, dbName = "bricksllm") {
		this.client = client;
		this.dbName = dbName;
	}

	// ============================================
	// Collection Accessors
	// ============================================

	private get contexts(): Collection<DocumentContext> {
		return this.client.db(this.dbName).collection("document_contexts");
	}

	private get chunks(): Collection<DocumentChunk> {
		return this.client.db(this.dbName).collection("document_chunks");
	}

	private get memory(): Collection<ConversationMemory> {
		return this.client.db(this.dbName).collection("conversation_memory");
	}

	// ============================================
	// Initialization
	// ============================================

	/**
	 * Initialize indexes (call once on startup)
	 */
	async initializeIndexes(): Promise<void> {
		// Conversation lookup index for contexts
		await this.contexts.createIndex(
			{ conversationId: 1 },
			{ name: "conversation_idx", unique: true }
		);

		// Document hash index for deduplication
		await this.contexts.createIndex({ documentHash: 1 }, { name: "document_hash_idx" });

		// Chunk lookup indexes
		await this.chunks.createIndex(
			{ conversationId: 1, chunkIndex: 1 },
			{ name: "chunk_lookup_idx" }
		);

		await this.chunks.createIndex({ documentId: 1 }, { name: "document_chunks_idx" });

		// Memory conversation index
		await this.memory.createIndex(
			{ conversationId: 1 },
			{ name: "memory_conversation_idx", unique: true }
		);

		console.log("DocumentContextStore: Indexes initialized");
	}

	// ============================================
	// Document Context Operations
	// ============================================

	/**
	 * Create a new document context
	 */
	async createDocumentContext(
		data: Omit<DocumentContext, "_id" | "createdAt" | "lastAccessedAt" | "augmentationHistory">
	): Promise<DocumentContext> {
		const { ObjectId } = await import("mongodb");

		const doc: DocumentContext = {
			...data,
			_id: new ObjectId(),
			createdAt: new Date(),
			lastAccessedAt: new Date(),
			augmentationHistory: [],
		};

		await this.contexts.insertOne(doc);
		return doc;
	}

	/**
	 * Get document context by conversation ID
	 */
	async getDocumentContext(conversationId: string): Promise<DocumentContext | null> {
		const doc = await this.contexts.findOne({ conversationId });

		if (doc) {
			// Update last accessed time
			await this.contexts.updateOne({ _id: doc._id }, { $set: { lastAccessedAt: new Date() } });
		}

		return doc;
	}

	/**
	 * Check if document already exists by hash
	 */
	async documentExistsByHash(documentHash: string): Promise<boolean> {
		const count = await this.contexts.countDocuments({ documentHash });
		return count > 0;
	}

	/**
	 * Update document metadata
	 */
	async updateMetadata(conversationId: string, metadata: Partial<DocumentMetadata>): Promise<void> {
		// Use dot notation to merge metadata fields
		const setFields: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(metadata)) {
			if (value !== undefined) {
				setFields[`metadata.${key}`] = value;
			}
		}
		if (Object.keys(setFields).length > 0) {
			await this.contexts.updateOne({ conversationId }, { $set: setFields });
		}
	}

	/**
	 * Update user context
	 */
	async updateUserContext(
		conversationId: string,
		userContext: Partial<UserContext>
	): Promise<void> {
		await this.contexts.updateOne(
			{ conversationId },
			{
				$set: Object.fromEntries(
					Object.entries(userContext).map(([k, v]) => [`userContext.${k}`, v])
				),
			}
		);
	}

	// ============================================
	// Chunk Operations
	// ============================================

	/**
	 * Create chunks for a document
	 */
	async createChunks(
		chunks: Array<Omit<DocumentChunk, "_id" | "retrievalCount" | "averageRerankerScore">>
	): Promise<void> {
		if (chunks.length === 0) return;

		const { ObjectId } = await import("mongodb");

		const docs = chunks.map((c) => ({
			...c,
			_id: new ObjectId(),
			retrievalCount: 0,
			averageRerankerScore: 0,
		}));

		await this.chunks.insertMany(docs);
	}

	/**
	 * Append additional chunks to existing document
	 */
	async appendChunks(
		documentId: ObjectId,
		chunks: Array<Omit<DocumentChunk, "_id" | "retrievalCount" | "averageRerankerScore">>
	): Promise<void> {
		if (chunks.length === 0) return;

		const { ObjectId } = await import("mongodb");

		const docs = chunks.map((c) => ({
			...c,
			_id: new ObjectId(),
			retrievalCount: 0,
			averageRerankerScore: 0,
		}));

		await this.chunks.insertMany(docs);

		// Update chunk count in context
		await this.contexts.updateOne({ _id: documentId }, { $inc: { chunkCount: chunks.length } });
	}

	/**
	 * Get all chunks for a conversation
	 */
	async getChunks(conversationId: string): Promise<DocumentChunk[]> {
		return this.chunks.find({ conversationId }).sort({ chunkIndex: 1 }).toArray();
	}

	/**
	 * Vector similarity search using cosine similarity
	 * Note: For production, consider using MongoDB Atlas Vector Search
	 */
	async vectorSearch(
		conversationId: string,
		queryEmbedding: number[],
		limit: number
	): Promise<DocumentChunk[]> {
		// Get all chunks for conversation
		const allChunks = await this.chunks.find({ conversationId }).toArray();

		if (allChunks.length === 0) return [];

		// Calculate cosine similarity for each chunk
		const scored = allChunks.map((chunk) => ({
			chunk,
			similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding),
		}));

		// Sort by similarity descending and take top N
		scored.sort((a, b) => b.similarity - a.similarity);

		return scored.slice(0, limit).map((s) => s.chunk);
	}

	/**
	 * Calculate cosine similarity between two vectors
	 */
	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) return 0;

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const denominator = Math.sqrt(normA) * Math.sqrt(normB);
		return denominator === 0 ? 0 : dotProduct / denominator;
	}

	/**
	 * Update retrieval stats for chunks
	 */
	async updateRetrievalStats(chunkIds: string[]): Promise<void> {
		if (chunkIds.length === 0) return;

		const { ObjectId } = await import("mongodb");

		const objectIds = chunkIds.map((id) => new ObjectId(id));

		await this.chunks.updateMany(
			{ _id: { $in: objectIds } },
			{
				$inc: { retrievalCount: 1 },
				$set: { lastRetrievedAt: new Date() },
			}
		);
	}

	/**
	 * Update average reranker score for a chunk
	 */
	async updateRerankerScore(chunkId: string, newScore: number): Promise<void> {
		const { ObjectId } = await import("mongodb");

		// Get current stats
		const chunk = await this.chunks.findOne({ _id: new ObjectId(chunkId) });
		if (!chunk) return;

		// Calculate new running average
		const count = chunk.retrievalCount || 1;
		const currentAvg = chunk.averageRerankerScore || 0;
		const newAvg = (currentAvg * (count - 1) + newScore) / count;

		await this.chunks.updateOne(
			{ _id: new ObjectId(chunkId) },
			{ $set: { averageRerankerScore: newAvg } }
		);
	}

	// ============================================
	// Augmentation History
	// ============================================

	/**
	 * Record augmentation event
	 */
	async recordAugmentation(documentId: ObjectId, record: AugmentationRecord): Promise<void> {
		await this.contexts.updateOne({ _id: documentId }, { $push: { augmentationHistory: record } });
	}

	// ============================================
	// Conversation Memory Operations
	// ============================================

	/**
	 * Add a learned fact to conversation memory
	 */
	async addLearnedFact(conversationId: string, fact: Omit<LearnedFact, "addedAt">): Promise<void> {
		await this.memory.updateOne(
			{ conversationId },
			{
				$push: {
					learnedFacts: {
						...fact,
						addedAt: new Date(),
					},
				},
			},
			{ upsert: true }
		);
	}

	/**
	 * Add query to history
	 */
	async addQueryToHistory(
		conversationId: string,
		query: Omit<QueryHistoryRecord, "timestamp">
	): Promise<void> {
		await this.memory.updateOne(
			{ conversationId },
			{
				$push: {
					queryHistory: {
						...query,
						timestamp: new Date(),
					},
				},
			},
			{ upsert: true }
		);
	}

	/**
	 * Get conversation memory
	 */
	async getConversationMemory(conversationId: string): Promise<ConversationMemory | null> {
		return this.memory.findOne({ conversationId });
	}

	/**
	 * Get learned facts for conversation
	 */
	async getLearnedFacts(conversationId: string): Promise<LearnedFact[]> {
		const memory = await this.memory.findOne({ conversationId });
		return memory?.learnedFacts || [];
	}

	// ============================================
	// Cleanup Operations
	// ============================================

	/**
	 * Delete all data for a conversation
	 */
	async deleteConversationData(conversationId: string): Promise<void> {
		await Promise.all([
			this.contexts.deleteOne({ conversationId }),
			this.chunks.deleteMany({ conversationId }),
			this.memory.deleteOne({ conversationId }),
		]);
	}

	/**
	 * Delete old contexts (for cleanup jobs)
	 */
	async deleteOldContexts(olderThanDays: number): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

		// Get conversation IDs to delete
		const oldContexts = await this.contexts
			.find({ lastAccessedAt: { $lt: cutoffDate } })
			.project({ conversationId: 1 })
			.toArray();

		const conversationIds = oldContexts.map((c) => c.conversationId);

		if (conversationIds.length === 0) return 0;

		// Delete all related data
		await Promise.all([
			this.contexts.deleteMany({ conversationId: { $in: conversationIds } }),
			this.chunks.deleteMany({ conversationId: { $in: conversationIds } }),
			this.memory.deleteMany({ conversationId: { $in: conversationIds } }),
		]);

		return conversationIds.length;
	}
}

/**
 * Factory function
 */
export function createDocumentContextStore(
	client: MongoClient,
	dbName?: string
): DocumentContextStore {
	return new DocumentContextStore(client, dbName);
}
