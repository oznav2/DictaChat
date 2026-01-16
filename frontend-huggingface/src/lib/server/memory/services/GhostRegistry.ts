/**
 * GhostRegistry - Non-destructive memory deletion service
 *
 * Provides soft-delete functionality for memories, allowing:
 * - Reversible deletion (ghost/restore)
 * - Filtering ghosted memories from search results
 * - Automatic cleanup after expiration period
 *
 * Based on roampal's ghost registry pattern.
 */

import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { logger } from "$lib/server/logger";

export interface GhostMemoryParams {
	userId: string;
	memoryId: string;
	tier: string;
	reason: string;
	expiresInDays?: number; // Default: 30 days
}

export interface GhostRecord {
	memoryId: string;
	tier: string;
	ghostedAt: Date;
	reason: string;
	expiresAt: Date;
}

export class GhostRegistry {
	private readonly DEFAULT_EXPIRY_DAYS = 30;

	/**
	 * Ghost (soft-delete) a memory
	 *
	 * The memory is not actually deleted, just marked as ghosted.
	 * It will be filtered from search results but can be restored.
	 */
	async ghostMemory(params: GhostMemoryParams): Promise<boolean> {
		const { userId, memoryId, tier, reason, expiresInDays } = params;

		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + (expiresInDays ?? this.DEFAULT_EXPIRY_DAYS));

		try {
			await collections.memoryGhosts.updateOne(
				{ userId, memoryId },
				{
					$set: {
						userId,
						memoryId,
						tier,
						ghostedAt: new Date(),
						reason,
						expiresAt,
					},
					$setOnInsert: {
						_id: new ObjectId(),
					},
				},
				{ upsert: true }
			);

			logger.debug({ userId, memoryId, reason }, "Memory ghosted");
			return true;
		} catch (err) {
			logger.error({ err, userId, memoryId }, "Failed to ghost memory");
			return false;
		}
	}

	/**
	 * Check if a memory is ghosted
	 */
	async isGhosted(userId: string, memoryId: string): Promise<boolean> {
		try {
			const ghost = await collections.memoryGhosts.findOne({
				userId,
				memoryId,
			});
			return !!ghost;
		} catch (err) {
			logger.error({ err, userId, memoryId }, "Failed to check ghost status");
			return false;
		}
	}

	/**
	 * Restore a ghosted memory
	 *
	 * Removes the ghost record, making the memory visible again.
	 */
	async restoreMemory(userId: string, memoryId: string): Promise<boolean> {
		try {
			const result = await collections.memoryGhosts.deleteOne({
				userId,
				memoryId,
			});

			if (result.deletedCount > 0) {
				logger.debug({ userId, memoryId }, "Memory restored from ghost");
				return true;
			}

			return false;
		} catch (err) {
			logger.error({ err, userId, memoryId }, "Failed to restore memory");
			return false;
		}
	}

	/**
	 * Filter out ghosted memories from a list of memory IDs
	 *
	 * Use this to clean search results before returning to user.
	 */
	async filterGhosted(userId: string, memoryIds: string[]): Promise<string[]> {
		if (memoryIds.length === 0) return [];

		try {
			const ghosts = await collections.memoryGhosts
				.find({ userId, memoryId: { $in: memoryIds } })
				.toArray();

			const ghostedSet = new Set(ghosts.map((g) => g.memoryId));
			return memoryIds.filter((id) => !ghostedSet.has(id));
		} catch (err) {
			logger.error({ err, userId }, "Failed to filter ghosted memories");
			// Fail-open: return original list on error
			return memoryIds;
		}
	}

	/**
	 * Get all ghosted memories for a user
	 */
	async getGhostedMemories(userId: string): Promise<GhostRecord[]> {
		try {
			const ghosts = await collections.memoryGhosts.find({ userId }).toArray();

			return ghosts.map((g) => ({
				memoryId: g.memoryId,
				tier: g.tier,
				ghostedAt: g.ghostedAt,
				reason: g.reason,
				expiresAt: g.expiresAt,
			}));
		} catch (err) {
			logger.error({ err, userId }, "Failed to get ghosted memories");
			return [];
		}
	}

	/**
	 * Bulk ghost multiple memories
	 */
	async bulkGhost(
		userId: string,
		memories: Array<{ memoryId: string; tier: string }>,
		reason: string
	): Promise<number> {
		if (memories.length === 0) return 0;

		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + this.DEFAULT_EXPIRY_DAYS);

		const operations = memories.map((m) => ({
			updateOne: {
				filter: { userId, memoryId: m.memoryId },
				update: {
					$set: {
						userId,
						memoryId: m.memoryId,
						tier: m.tier,
						ghostedAt: new Date(),
						reason,
						expiresAt,
					},
					$setOnInsert: {
						_id: new ObjectId(),
					},
				},
				upsert: true,
			},
		}));

		try {
			const result = await collections.memoryGhosts.bulkWrite(operations);
			logger.debug({ userId, count: result.upsertedCount }, "Bulk ghosted memories");
			return result.upsertedCount + result.modifiedCount;
		} catch (err) {
			logger.error({ err, userId }, "Failed to bulk ghost memories");
			return 0;
		}
	}

	/**
	 * Count ghosted memories by tier
	 */
	async countByTier(userId: string): Promise<Record<string, number>> {
		try {
			const counts = await collections.memoryGhosts
				.aggregate([{ $match: { userId } }, { $group: { _id: "$tier", count: { $sum: 1 } } }])
				.toArray();

			const result: Record<string, number> = {};
			for (const item of counts) {
				result[item._id as string] = item.count;
			}
			return result;
		} catch (err) {
			logger.error({ err, userId }, "Failed to count ghosted memories");
			return {};
		}
	}

	/**
	 * Clear all ghosted memories for a specific tier
	 * v0.2.9 Parity: Used by "Clear Books" to remove all ghost records for books tier
	 *
	 * @param userId - User identifier
	 * @param tier - Tier to clear (e.g., "books")
	 * @returns Number of ghost records cleared
	 */
	async clearByTier(userId: string, tier: string): Promise<number> {
		try {
			const result = await collections.memoryGhosts.deleteMany({
				userId,
				tier,
			});

			logger.info({ userId, tier, deleted: result.deletedCount }, "Ghost records cleared for tier");
			return result.deletedCount;
		} catch (err) {
			logger.error({ err, userId, tier }, "Failed to clear ghost records for tier");
			return 0;
		}
	}

	/**
	 * Clear all ghosted memories for a user
	 * v0.2.9 Parity: Used by collection nuke to remove all ghost records
	 *
	 * @param userId - User identifier
	 * @returns Number of ghost records cleared
	 */
	async clearAll(userId: string): Promise<number> {
		try {
			const result = await collections.memoryGhosts.deleteMany({
				userId,
			});

			logger.info({ userId, deleted: result.deletedCount }, "All ghost records cleared");
			return result.deletedCount;
		} catch (err) {
			logger.error({ err, userId }, "Failed to clear all ghost records");
			return 0;
		}
	}
}

/**
 * Singleton instance
 */
let _instance: GhostRegistry | null = null;

export function getGhostRegistry(): GhostRegistry {
	if (!_instance) {
		_instance = new GhostRegistry();
	}
	return _instance;
}
