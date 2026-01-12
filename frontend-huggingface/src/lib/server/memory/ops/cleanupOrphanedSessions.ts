/**
 * Cleanup Orphaned Session Data
 *
 * When sessions expire (TTL in MongoDB), related data in other collections
 * becomes orphaned. This utility cleans up that data.
 *
 * Collections affected:
 * - memoryBank
 * - books
 * - memoryOutcomes
 * - memoryStats
 * - memoryGhosts
 * - userPersonality
 *
 * Usage:
 * - Run as a scheduled job (e.g., daily via cron)
 * - Or call manually when needed
 */

import { collections } from "$lib/server/database";
import { logger } from "$lib/server/logger";

export interface CleanupResult {
	memoryBank: number;
	books: number;
	memoryOutcomes: number;
	memoryStats: number;
	memoryGhosts: number;
	userPersonality: number;
	totalDeleted: number;
	durationMs: number;
}

/**
 * Find all session-based userIds that no longer have active sessions
 *
 * Session-based userIds are SHA256 hashes (64 hex characters),
 * while authenticated user IDs are MongoDB ObjectIds (24 hex characters).
 */
async function findOrphanedSessionIds(): Promise<string[]> {
	// Get all active session IDs
	const activeSessions = await collections.sessions
		.find({}, { projection: { sessionId: 1 } })
		.toArray();
	const activeSessionIds = new Set(activeSessions.map((s) => s.sessionId));

	// Find session-based userIds in memoryBank that don't have active sessions
	// Session IDs are 64-char hex strings (SHA256), ObjectIds are 24-char hex
	const sessionPattern = /^[a-f0-9]{64}$/i;

	const memoryBankUsers = await collections.memoryBank.distinct("userId");
	const orphanedIds: string[] = [];

	for (const userId of memoryBankUsers) {
		// Check if it looks like a session ID (64 hex chars) and isn't active
		if (
			typeof userId === "string" &&
			sessionPattern.test(userId) &&
			!activeSessionIds.has(userId)
		) {
			orphanedIds.push(userId);
		}
	}

	return orphanedIds;
}

/**
 * Clean up orphaned session data from all memory collections
 *
 * @param dryRun - If true, only report what would be deleted without deleting
 * @returns Cleanup statistics
 */
export async function cleanupOrphanedSessions(dryRun = false): Promise<CleanupResult> {
	const startTime = Date.now();
	logger.info({ dryRun }, "Starting orphaned session cleanup");

	const orphanedIds = await findOrphanedSessionIds();

	if (orphanedIds.length === 0) {
		logger.info("No orphaned session data found");
		return {
			memoryBank: 0,
			books: 0,
			memoryOutcomes: 0,
			memoryStats: 0,
			memoryGhosts: 0,
			userPersonality: 0,
			totalDeleted: 0,
			durationMs: Date.now() - startTime,
		};
	}

	logger.info({ count: orphanedIds.length }, "Found orphaned session IDs");

	const result: CleanupResult = {
		memoryBank: 0,
		books: 0,
		memoryOutcomes: 0,
		memoryStats: 0,
		memoryGhosts: 0,
		userPersonality: 0,
		totalDeleted: 0,
		durationMs: 0,
	};

	if (dryRun) {
		// Count what would be deleted
		result.memoryBank = await collections.memoryBank.countDocuments({
			userId: { $in: orphanedIds },
		});
		result.books = await collections.books.countDocuments({
			userId: { $in: orphanedIds },
		});
		result.memoryOutcomes = await collections.memoryOutcomes.countDocuments({
			userId: { $in: orphanedIds },
		});
		result.memoryStats = await collections.memoryStats.countDocuments({
			userId: { $in: orphanedIds },
		});
		result.memoryGhosts = await collections.memoryGhosts.countDocuments({
			userId: { $in: orphanedIds },
		});
		result.userPersonality = await collections.userPersonality.countDocuments({
			userId: { $in: orphanedIds },
		});
	} else {
		// Actually delete orphaned data
		const memoryBankResult = await collections.memoryBank.deleteMany({
			userId: { $in: orphanedIds },
		});
		result.memoryBank = memoryBankResult.deletedCount;

		const booksResult = await collections.books.deleteMany({
			userId: { $in: orphanedIds },
		});
		result.books = booksResult.deletedCount;

		const outcomesResult = await collections.memoryOutcomes.deleteMany({
			userId: { $in: orphanedIds },
		});
		result.memoryOutcomes = outcomesResult.deletedCount;

		const statsResult = await collections.memoryStats.deleteMany({
			userId: { $in: orphanedIds },
		});
		result.memoryStats = statsResult.deletedCount;

		const ghostsResult = await collections.memoryGhosts.deleteMany({
			userId: { $in: orphanedIds },
		});
		result.memoryGhosts = ghostsResult.deletedCount;

		const personalityResult = await collections.userPersonality.deleteMany({
			userId: { $in: orphanedIds },
		});
		result.userPersonality = personalityResult.deletedCount;
	}

	result.totalDeleted =
		result.memoryBank +
		result.books +
		result.memoryOutcomes +
		result.memoryStats +
		result.memoryGhosts +
		result.userPersonality;

	result.durationMs = Date.now() - startTime;

	logger.info(
		{
			...result,
			dryRun,
			orphanedSessionCount: orphanedIds.length,
		},
		"Orphaned session cleanup completed"
	);

	return result;
}

/**
 * Get statistics about orphaned session data without deleting
 */
export async function getOrphanedSessionStats(): Promise<CleanupResult> {
	return cleanupOrphanedSessions(true);
}
