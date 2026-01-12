/**
 * DocumentRegistry - Fast URL lookup for processed documents
 *
 * Provides <50ms lookup to check if a URL has already been processed.
 * Uses URL hash index for O(1) lookup performance.
 */

import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { logger } from "$lib/server/logger";
import type { Book, DocumentRegistryEntry } from "$lib/types/Book";
// Book type used for bilingual document context
import { createHash } from "crypto";

// In-memory cache for ultra-fast lookups
const urlCache = new Map<string, { bookId: string; status: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Normalize URL for consistent hashing
 */
export function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		// Remove trailing slashes, normalize protocol
		let normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
		if (parsed.search) {
			// Sort query params for consistency
			const params = new URLSearchParams(parsed.search);
			const sorted = new URLSearchParams([...params.entries()].sort());
			normalized += `?${sorted.toString()}`;
		}
		return normalized.toLowerCase().replace(/\/$/, "");
	} catch {
		return url.toLowerCase().trim();
	}
}

/**
 * Create hash for URL lookup
 */
export function hashUrl(url: string): string {
	const normalized = normalizeUrl(url);
	return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

/**
 * Create hash for content deduplication (Phase 11)
 */
export function hashContent(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

/**
 * Check if URL is already in registry (< 50ms target)
 */
export async function checkUrlRegistry(
	url: string
): Promise<{ found: boolean; bookId?: string; status?: string }> {
	const startTime = performance.now();
	const urlHash = hashUrl(url);

	// Check in-memory cache first (< 1ms)
	const cached = urlCache.get(urlHash);
	if (cached && cached.expiresAt > Date.now()) {
		const elapsed = performance.now() - startTime;
		logger.debug({ url, elapsed, cached: true }, "[DocRegistry] URL lookup");
		return { found: true, bookId: cached.bookId, status: cached.status };
	}

	// Check MongoDB with indexed query
	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		const entry = await db
			.collection<DocumentRegistryEntry>("document_registry")
			.findOne({ urlHash }, { projection: { bookId: 1, status: 1 } });

		const elapsed = performance.now() - startTime;
		logger.debug({ url, elapsed, found: !!entry }, "[DocRegistry] URL lookup");

		if (entry) {
			// Update cache
			urlCache.set(urlHash, {
				bookId: entry.bookId.toString(),
				status: entry.status,
				expiresAt: Date.now() + CACHE_TTL_MS,
			});
			return { found: true, bookId: entry.bookId.toString(), status: entry.status };
		}

		return { found: false };
	} catch (err) {
		logger.error({ err, url }, "[DocRegistry] Lookup failed");
		return { found: false };
	}
}

/**
 * Register a URL in the registry
 */
export async function registerUrl(
	url: string,
	bookId: string,
	status: "processing" | "completed" | "failed" = "processing"
): Promise<void> {
	const urlHash = hashUrl(url);
	const normalized = normalizeUrl(url);

	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		await db.collection("document_registry").updateOne(
			{ urlHash },
			{
				$set: {
					urlHash,
					normalizedUrl: normalized,
					bookId,
					status,
					updatedAt: new Date(),
				},
				$setOnInsert: {
					createdAt: new Date(),
				},
			},
			{ upsert: true }
		);

		// Update cache
		urlCache.set(urlHash, {
			bookId,
			status,
			expiresAt: Date.now() + CACHE_TTL_MS,
		});

		logger.debug({ url, bookId, status }, "[DocRegistry] URL registered");
	} catch (err) {
		logger.error({ err, url }, "[DocRegistry] Registration failed");
	}
}

/**
 * Update registry entry status
 */
export async function updateRegistryStatus(
	urlHash: string,
	status: "processing" | "completed" | "failed"
): Promise<void> {
	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		await db
			.collection("document_registry")
			.updateOne({ urlHash }, { $set: { status, updatedAt: new Date() } });

		// Update cache if present
		const cached = urlCache.get(urlHash);
		if (cached) {
			cached.status = status;
			cached.expiresAt = Date.now() + CACHE_TTL_MS;
		}
	} catch (err) {
		logger.error({ err, urlHash }, "[DocRegistry] Status update failed");
	}
}

/**
 * Check if content was already processed (Phase 11 - content deduplication)
 */
export async function checkContentRegistry(
	contentHash: string
): Promise<{ found: boolean; bookId?: string; status?: string }> {
	try {
		const database = await Database.getInstance();
		const collections = database.getCollections();

		const book = await collections.books.findOne(
			{ documentHash: contentHash },
			{ projection: { _id: 1, status: 1 } }
		);

		if (book) {
			return { found: true, bookId: book._id.toString(), status: book.status };
		}
		return { found: false };
	} catch (err) {
		logger.error({ err, contentHash }, "[DocRegistry] Content lookup failed");
		return { found: false };
	}
}

/**
 * Get document content for context injection
 */
export async function getDocumentContext(bookId: string): Promise<{
	title: string;
	summary?: string;
	keyPoints?: string[];
	parsedMarkdown?: string;
} | null> {
	try {
		const database = await Database.getInstance();
		const collections = database.getCollections();

		const book = await collections.books.findOne(
			{ _id: bookId as unknown as Book["_id"] },
			{ projection: { title: 1, summary: 1, keyPoints: 1, parsedMarkdown: 1 } }
		);

		if (!book) return null;

		// Update access stats
		await collections.books.updateOne(
			{ _id: bookId as unknown as Book["_id"] },
			{
				$set: { lastAccessedAt: new Date() },
				$inc: { accessCount: 1 },
			}
		);

		return {
			title: book.title,
			summary: book.summary,
			keyPoints: book.keyPoints,
			parsedMarkdown: book.parsedMarkdown,
		};
	} catch (err) {
		logger.error({ err, bookId }, "[DocRegistry] Context fetch failed");
		return null;
	}
}

/**
 * Get bilingual document context (Phase 11)
 * Returns summary and key points in both Hebrew and English
 */
export async function getBilingualDocumentContext(
	bookId: string,
	preferredLang: "he" | "en" = "he"
): Promise<{
	title: string;
	summary: string | null;
	keyPoints: string[];
	language: "he" | "en" | "mixed";
} | null> {
	try {
		const database = await Database.getInstance();
		const collections = database.getCollections();

		const book = await collections.books.findOne(
			{ _id: bookId as unknown as Book["_id"] },
			{
				projection: {
					title: 1,
					summary: 1,
					summaryHe: 1,
					keyPoints: 1,
					keyPointsHe: 1,
					language: 1,
				},
			}
		);

		if (!book) return null;

		// Select appropriate language version
		const summary = preferredLang === "he" && book.summaryHe ? book.summaryHe : book.summary;
		const keyPoints =
			preferredLang === "he" && book.keyPointsHe ? book.keyPointsHe : book.keyPoints;

		return {
			title: book.title,
			summary: summary || null,
			keyPoints: keyPoints || [],
			language: book.language || "en",
		};
	} catch (err) {
		logger.error({ err, bookId }, "[DocRegistry] Bilingual context fetch failed");
		return null;
	}
}

/**
 * Clear expired cache entries
 */
export function cleanupCache(): void {
	const now = Date.now();
	for (const [key, value] of urlCache.entries()) {
		if (value.expiresAt < now) {
			urlCache.delete(key);
		}
	}
}

// Cleanup every 5 minutes
setInterval(cleanupCache, 5 * 60 * 1000);
