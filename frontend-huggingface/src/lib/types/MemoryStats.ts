import type { ObjectId } from "mongodb";

/**
 * MemoryStats - Usage statistics for memories
 *
 * Based on roampal's memory statistics tracking.
 * Used for Wilson score ranking and promotion eligibility.
 */
export interface MemoryStats {
	_id: ObjectId;
	userId: string;
	memoryId: string;
	tier: string; // working, history, patterns, documents, memory_bank
	hits: number; // Positive interactions (relevant, helpful)
	misses: number; // Negative interactions (not relevant, not helpful)
	accessCount: number; // Total access count
	lastAccessed: Date;
	createdAt: Date;
}
