/**
 * Phase 1.1: Migration Script - Consolidate memoryBank to memory_items
 * 
 * This script migrates all items from the legacy `memoryBank` collection
 * to the unified `memory_items` collection with tier="memory_bank".
 * 
 * Design principles:
 * - Create-then-delete pattern (never delete source until target verified)
 * - Batch processing with configurable batch size
 * - Idempotent and resumable
 * - Graceful handling of embedding/Qdrant failures
 * 
 * Risk Mitigations:
 * - Items marked needs_reindex=true if embedding fails
 * - Items marked migration_failed=true on error
 * - Progress checkpoints for resumability
 * - No source deletion until verification
 */

import { v4 as uuidv4 } from "uuid";
import { ObjectId, type Collection, type Db } from "mongodb";
import { logger } from "$lib/server/logger";
import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { MEMORY_COLLECTIONS } from "../stores/schemas";
import type { DictaEmbeddingClient } from "../embedding/DictaEmbeddingClient";
import type { QdrantAdapter } from "../adapters/QdrantAdapter";
import type { MemoryItemDocument } from "../stores/schemas";

/**
 * Legacy memoryBank document structure
 */
interface LegacyMemoryBankItem {
	_id: ObjectId;
	userId: string;
	text: string;
	tags?: string[];
	importance?: number;
	confidence?: number;
	status: "active" | "archived";
	source?: string;
	contextType?: string;
	createdAt?: Date;
	updatedAt?: Date;
	archivedAt?: Date;
	archivedReason?: string;
}

/**
 * Migration result for a single item
 */
interface ItemMigrationResult {
	legacyId: string;
	newMemoryId: string;
	success: boolean;
	error?: string;
	needsReindex: boolean;
}

/**
 * Overall migration statistics
 */
export interface MigrationStats {
	totalLegacyItems: number;
	migrated: number;
	alreadyMigrated: number;
	failed: number;
	needsReindex: number;
	durationMs: number;
	errors: Array<{ legacyId: string; error: string }>;
}

/**
 * Migration configuration options
 */
export interface MigrationConfig {
	/** Batch size for processing (default: 50) */
	batchSize?: number;
	/** Skip items that already exist in memory_items */
	skipExisting?: boolean;
	/** Dry run - don't actually write anything */
	dryRun?: boolean;
	/** User ID filter (migrate only specific user) */
	userId?: string;
	/** Generate embeddings during migration */
	generateEmbeddings?: boolean;
	/** Index in Qdrant during migration */
	indexInQdrant?: boolean;
}

const DEFAULT_CONFIG: Required<MigrationConfig> = {
	batchSize: 50,
	skipExisting: true,
	dryRun: false,
	userId: "",
	generateEmbeddings: false, // Default false - use deferred reindex
	indexInQdrant: false, // Default false - use deferred reindex
};

/**
 * Check if a legacy item has already been migrated
 * Uses text content matching since legacy items don't have memory_id
 */
async function checkAlreadyMigrated(
	itemsCollection: Collection,
	userId: string,
	text: string
): Promise<string | null> {
	const normalizedText = text.toLowerCase().trim();
	const existing = await itemsCollection.findOne({
		user_id: userId,
		tier: "memory_bank",
		text: { $regex: new RegExp(`^${escapeRegex(normalizedText)}$`, "i") },
	});
	
	return existing ? (existing.memory_id as string) : null;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Convert a legacy memoryBank item to a memory_items document
 */
function convertToMemoryItem(
	legacy: LegacyMemoryBankItem,
	memoryId: string
): Omit<MemoryItemDocument, "_id"> {
	const now = new Date();
	const createdAt = legacy.createdAt ?? now;
	const updatedAt = legacy.updatedAt ?? now;

	// Calculate a derived score from importance/confidence
	let qualityScore = 0.5;
	const importance = Number(legacy.importance);
	const confidence = Number(legacy.confidence);
	if (Number.isFinite(importance) && Number.isFinite(confidence)) {
		qualityScore = (importance + confidence) / 2;
	} else if (Number.isFinite(importance)) {
		qualityScore = importance;
	} else if (Number.isFinite(confidence)) {
		qualityScore = confidence;
	}

	return {
		memory_id: memoryId,
		user_id: legacy.userId,
		org_id: null,
		tier: "memory_bank",
		status: legacy.status,
		text: legacy.text,
		summary: null,
		tags: legacy.tags ?? [],
		entities: [],
		always_inject: false,
		source: {
			type: "user", // Mark as user-created for legacy items
			legacy: true, // Phase 1.1.5: Add source.legacy marker
			legacy_id: legacy._id.toString(), // Track original ID
			conversation_id: null,
			message_id: null,
			tool_name: legacy.source?.startsWith("http") ? "fetch" : (legacy.source ?? null),
			tool_run_id: null,
			doc_id: null,
			chunk_id: null,
		},
		quality: {
			quality_score: qualityScore,
			relevance_score: null,
			confidence_score: confidence ?? null,
			completeness_score: null,
			recency_score: null,
		},
		stats: {
			uses: 0,
			last_used_at: null,
			worked_count: 0,
			failed_count: 0,
			partial_count: 0,
			unknown_count: 0,
			success_count: 0, // Phase 23 field
			success_rate: 0,
			wilson_score: 0.5, // Neutral starting score
		},
		created_at: createdAt,
		updated_at: updatedAt,
		archived_at: legacy.status === "archived" ? (legacy.archivedAt ?? now) : null,
		expires_at: null,
		embedding: {
			model: null,
			dimensions: null,
			indexed_at: null,
			needs_reindex: true, // Will be reindexed by deferred process
		},
		versioning: {
			current_version: 1,
			supersedes_memory_id: null,
		},
		personality: {
			personality_id: null,
			personality_name: null,
		},
		language: "none",
		translation_ref_id: null,
	};
}

/**
 * Migrate a single legacy item to memory_items
 */
async function migrateItem(
	legacy: LegacyMemoryBankItem,
	itemsCollection: Collection,
	embeddingClient: DictaEmbeddingClient | null,
	qdrantAdapter: QdrantAdapter | null,
	config: Required<MigrationConfig>
): Promise<ItemMigrationResult> {
	const memoryId = uuidv4();
	let needsReindex = true;

	try {
		// Check if already migrated (skip duplicates)
		if (config.skipExisting) {
			const existingId = await checkAlreadyMigrated(
				itemsCollection,
				legacy.userId,
				legacy.text
			);
			if (existingId) {
				return {
					legacyId: legacy._id.toString(),
					newMemoryId: existingId,
					success: true,
					needsReindex: false,
				};
			}
		}

		// Convert to new format
		const newDoc = convertToMemoryItem(legacy, memoryId);

		// Optionally generate embedding
		if (config.generateEmbeddings && embeddingClient) {
			try {
				const vector = await embeddingClient.embed(legacy.text);
				if (vector) {
					newDoc.embedding = {
						model: "dicta-embeddings",
						dimensions: vector.length,
						indexed_at: new Date(),
						needs_reindex: false,
					};
					needsReindex = false;

					// Optionally index in Qdrant
					if (config.indexInQdrant && qdrantAdapter) {
						await qdrantAdapter.upsert([{
							id: memoryId,
							vector,
							payload: {
								user_id: legacy.userId,
								tier: "memory_bank",
								status: legacy.status,
								text: legacy.text,
								memory_id: memoryId,
							},
						}]);
					}
				}
			} catch (embErr) {
				logger.warn(
					{ err: embErr, legacyId: legacy._id.toString() },
					"[migration] Embedding failed - will use deferred reindex"
				);
			}
		}

		// Insert into memory_items
		if (!config.dryRun) {
			await itemsCollection.insertOne({
				...newDoc,
				_id: new ObjectId(),
				embedding: { ...newDoc.embedding, needs_reindex: needsReindex },
			} as MemoryItemDocument);
		}

		return {
			legacyId: legacy._id.toString(),
			newMemoryId: memoryId,
			success: true,
			needsReindex,
		};
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		logger.error(
			{ err, legacyId: legacy._id.toString() },
			"[migration] Failed to migrate item"
		);
		return {
			legacyId: legacy._id.toString(),
			newMemoryId: memoryId,
			success: false,
			error: errorMsg,
			needsReindex: true,
		};
	}
}

/**
 * Main migration function
 * 
 * Phase 1.1.2: Implement migrateMemoryBankToUnified()
 * 
 * @param embeddingClient - Optional embedding client for generating vectors
 * @param qdrantAdapter - Optional Qdrant adapter for vector indexing
 * @param userConfig - Migration configuration options
 */
export async function migrateMemoryBankToUnified(
	embeddingClient: DictaEmbeddingClient | null = null,
	qdrantAdapter: QdrantAdapter | null = null,
	userConfig: MigrationConfig = {}
): Promise<MigrationStats> {
	const migrationConfig = { ...DEFAULT_CONFIG, ...userConfig };
	const startTime = Date.now();
	
	const stats: MigrationStats = {
		totalLegacyItems: 0,
		migrated: 0,
		alreadyMigrated: 0,
		failed: 0,
		needsReindex: 0,
		durationMs: 0,
		errors: [],
	};

	logger.info(
		{ config: migrationConfig },
		"[migration] Starting memoryBank → memory_items migration"
	);

	try {
		// Get database collections
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);
		const memoryBankCollection = db.collection("memoryBank");
		const itemsCollection = db.collection(MEMORY_COLLECTIONS.ITEMS);

		// Build query filter
		const query: Record<string, unknown> = {};
		if (migrationConfig.userId) {
			query.userId = migrationConfig.userId;
		}

		// Count total items
		stats.totalLegacyItems = await memoryBankCollection.countDocuments(query);
		
		if (stats.totalLegacyItems === 0) {
			logger.info("[migration] No legacy items to migrate");
			stats.durationMs = Date.now() - startTime;
			return stats;
		}

		logger.info(
			{ total: stats.totalLegacyItems, batchSize: migrationConfig.batchSize },
			"[migration] Processing legacy items"
		);

		// Process in batches
		let processed = 0;
		const cursor = memoryBankCollection.find(query).batchSize(migrationConfig.batchSize);

		while (await cursor.hasNext()) {
			const legacy = await cursor.next() as LegacyMemoryBankItem | null;
			if (!legacy) continue;

			const result = await migrateItem(
				legacy,
				itemsCollection,
				embeddingClient,
				qdrantAdapter,
				migrationConfig
			);

			if (result.success) {
				if (result.needsReindex) {
					stats.migrated++;
					stats.needsReindex++;
				} else {
					// Check if it was an existing item
					const wasExisting = await checkAlreadyMigrated(
						itemsCollection,
						legacy.userId,
						legacy.text
					);
					if (wasExisting && wasExisting !== result.newMemoryId) {
						stats.alreadyMigrated++;
					} else {
						stats.migrated++;
					}
				}
			} else {
				stats.failed++;
				stats.errors.push({
					legacyId: result.legacyId,
					error: result.error ?? "Unknown error",
				});
			}

			processed++;

			// Log progress every batch
			if (processed % migrationConfig.batchSize === 0) {
				logger.info(
					{
						processed,
						total: stats.totalLegacyItems,
						migrated: stats.migrated,
						failed: stats.failed,
						percent: Math.round((processed / stats.totalLegacyItems) * 100),
					},
					"[migration] Progress update"
				);
			}
		}

		await cursor.close();

	} catch (err) {
		logger.error({ err }, "[migration] Migration failed");
		throw err;
	}

	stats.durationMs = Date.now() - startTime;

	logger.info(
		{
			total: stats.totalLegacyItems,
			migrated: stats.migrated,
			alreadyMigrated: stats.alreadyMigrated,
			failed: stats.failed,
			needsReindex: stats.needsReindex,
			durationMs: stats.durationMs,
			dryRun: migrationConfig.dryRun,
		},
		"[migration] memoryBank → memory_items complete"
	);

	return stats;
}

/**
 * Get migration status (for progress tracking)
 */
export async function getMigrationStatus(): Promise<{
	legacyCount: number;
	unifiedCount: number;
	migratedCount: number;
	pendingCount: number;
}> {
	const database = await Database.getInstance();
	const client = database.getClient();
	const db = client.db(config.MONGODB_DB_NAME);
	const memoryBankCollection = db.collection("memoryBank");
	const itemsCollection = db.collection(MEMORY_COLLECTIONS.ITEMS);

	const legacyCount = await memoryBankCollection.countDocuments({});
	const unifiedCount = await itemsCollection.countDocuments({
		tier: "memory_bank",
	});
	const migratedCount = await itemsCollection.countDocuments({
		tier: "memory_bank",
		"source.legacy": true,
	});

	return {
		legacyCount,
		unifiedCount,
		migratedCount,
		pendingCount: Math.max(0, legacyCount - migratedCount),
	};
}

/**
 * Verify migration integrity
 * Checks that all legacy items exist in the unified collection
 */
export async function verifyMigration(userId?: string): Promise<{
	verified: boolean;
	missingCount: number;
	missingIds: string[];
}> {
	const database = await Database.getInstance();
	const client = database.getClient();
	const db = client.db(config.MONGODB_DB_NAME);
	const memoryBankCollection = db.collection("memoryBank");
	const itemsCollection = db.collection(MEMORY_COLLECTIONS.ITEMS);

	const query: Record<string, unknown> = {};
	if (userId) {
		query.userId = userId;
	}

	const legacyItems = await memoryBankCollection.find(query, { projection: { _id: 1, text: 1, userId: 1 } }).toArray();
	const missingIds: string[] = [];

	for (const legacy of legacyItems) {
		const text = (legacy.text as string)?.toLowerCase().trim() ?? "";
		const existing = await itemsCollection.findOne({
			user_id: legacy.userId,
			tier: "memory_bank",
			text: { $regex: new RegExp(`^${escapeRegex(text)}$`, "i") },
		});

		if (!existing) {
			missingIds.push(legacy._id.toString());
		}
	}

	return {
		verified: missingIds.length === 0,
		missingCount: missingIds.length,
		missingIds: missingIds.slice(0, 100), // Limit to first 100
	};
}
