import type { ObjectId } from "mongodb";

/**
 * MemoryGhost - Soft delete record for memories
 *
 * Based on roampal's ghost registry.
 * Allows non-destructive deletion with optional recovery.
 */
export interface MemoryGhost {
	_id: ObjectId;
	userId: string;
	memoryId: string;
	tier: string; // working, history, patterns, books, memory_bank
	ghostedAt: Date;
	reason: string;
	expiresAt: Date; // When the ghost record expires (for auto-cleanup)
}
