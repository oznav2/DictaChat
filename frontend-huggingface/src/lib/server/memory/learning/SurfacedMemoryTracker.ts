/**
 * SurfacedMemoryTracker - Tracks surfaced memories between conversation turns
 *
 * Phase 8: Outcome Detection from User Follow-up
 *
 * Stores which memories were surfaced in each turn so we can correlate
 * user feedback in subsequent messages with the memories that generated
 * the response.
 *
 * Features:
 * - MongoDB storage with TTL (auto-cleanup after 1 hour)
 * - Conversation-scoped tracking
 * - Fire-and-forget storage (non-blocking)
 */

import { Database } from "$lib/server/database";
import { logger } from "$lib/server/logger";
import type { SearchPositionMap } from "../../textGeneration/mcp/memoryIntegration";

/**
 * Surfaced memory record stored in MongoDB
 */
export interface SurfacedMemoryRecord {
	conversation_id: string;
	user_id: string;
	/** Memory position map from search results */
	position_map: SearchPositionMap;
	/** Content previews for each memory (for inference fallback) */
	content_previews: Record<string, string>;
	/** When the memories were surfaced */
	surfaced_at: Date;
	/** Assistant response text (for outcome correlation) */
	response_preview?: string;
	/** Auto-expire after 1 hour (TTL index) */
	expires_at: Date;
}

/**
 * TTL for surfaced memory records (1 hour)
 */
const TTL_MS = 60 * 60 * 1000;

/**
 * Collection name for surfaced memory tracking
 */
const COLLECTION_NAME = "surfaced_memories";

/**
 * Get the surfaced memories collection
 */
async function getSurfacedMemoriesCollection() {
	const database = await Database.getInstance();
	const client = database.getClient();
	const db = client.db();

	const collection = db.collection<SurfacedMemoryRecord>(COLLECTION_NAME);

	// Ensure TTL index exists (MongoDB will auto-delete expired documents)
	try {
		await collection.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
	} catch (err) {
		// Index might already exist, that's fine
		logger.debug({ err }, "[surfaced-memory] TTL index creation skipped (may already exist)");
	}

	// Index for conversation lookups
	try {
		await collection.createIndex({ conversation_id: 1 }, { unique: true });
	} catch (err) {
		logger.debug({ err }, "[surfaced-memory] Conversation index creation skipped");
	}

	return collection;
}

/**
 * Store surfaced memories for a conversation turn
 *
 * Fire-and-forget pattern - doesn't block the response flow.
 */
export async function storeSurfacedMemories(params: {
	conversationId: string;
	userId: string;
	positionMap: SearchPositionMap;
	contentPreviews?: Record<string, string>;
	responsePreview?: string;
}): Promise<void> {
	try {
		const collection = await getSurfacedMemoriesCollection();
		const now = new Date();

		const record: SurfacedMemoryRecord = {
			conversation_id: params.conversationId,
			user_id: params.userId,
			position_map: params.positionMap,
			content_previews: params.contentPreviews ?? {},
			surfaced_at: now,
			response_preview: params.responsePreview?.slice(0, 500),
			expires_at: new Date(now.getTime() + TTL_MS),
		};

		// Upsert - replace existing record for this conversation
		await collection.updateOne(
			{ conversation_id: params.conversationId },
			{ $set: record },
			{ upsert: true }
		);

		logger.debug(
			{
				conversationId: params.conversationId,
				memoryCount: Object.keys(params.positionMap).length,
			},
			"[surfaced-memory] Stored surfaced memories for conversation"
		);
	} catch (err) {
		// Fire-and-forget - don't throw, just log
		logger.warn(
			{ err, conversationId: params.conversationId },
			"[surfaced-memory] Failed to store surfaced memories"
		);
	}
}

/**
 * Retrieve surfaced memories from previous turn
 *
 * Returns null if no surfaced memories exist or if they've expired.
 */
export async function getSurfacedMemories(
	conversationId: string
): Promise<SurfacedMemoryRecord | null> {
	try {
		const collection = await getSurfacedMemoriesCollection();

		const record = await collection.findOne({
			conversation_id: conversationId,
			// Only return if not expired (redundant with TTL but explicit)
			expires_at: { $gt: new Date() },
		});

		if (record) {
			logger.debug(
				{
					conversationId,
					memoryCount: Object.keys(record.position_map).length,
					age: Date.now() - record.surfaced_at.getTime(),
				},
				"[surfaced-memory] Retrieved surfaced memories"
			);
		}

		return record;
	} catch (err) {
		logger.warn({ err, conversationId }, "[surfaced-memory] Failed to retrieve surfaced memories");
		return null;
	}
}

/**
 * Clear surfaced memories after outcome is recorded
 *
 * Called after successful outcome detection to prevent double-scoring.
 */
export async function clearSurfacedMemories(conversationId: string): Promise<void> {
	try {
		const collection = await getSurfacedMemoriesCollection();
		await collection.deleteOne({ conversation_id: conversationId });

		logger.debug(
			{ conversationId },
			"[surfaced-memory] Cleared surfaced memories after outcome recording"
		);
	} catch (err) {
		logger.warn({ err, conversationId }, "[surfaced-memory] Failed to clear surfaced memories");
	}
}
