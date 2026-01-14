/**
 * Memory Bank Item API - Individual memory CRUD operations
 * Phase 1: Consolidate Memory Collections
 * 
 * This route now uses UnifiedMemoryFacade for all operations,
 * with backward compatibility for legacy ObjectId formats.
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections, Database } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { MEMORY_COLLECTIONS } from "$lib/server/memory/stores/schemas";
import { config } from "$lib/server/config";

/**
 * Check if string is a valid UUID v4 format
 * Phase 1.2.1: Add UUID validation alongside ObjectId
 */
function isValidUUID(str: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(str);
}

/**
 * Check if a memory ID is valid (ObjectId or UUID)
 * Phase 1.2.2: Create isValidMemoryId() helper function
 */
function isValidMemoryId(id: string): { valid: boolean; type: "objectId" | "uuid" | "invalid" } {
	if (ObjectId.isValid(id)) {
		return { valid: true, type: "objectId" };
	}
	if (isValidUUID(id)) {
		return { valid: true, type: "uuid" };
	}
	return { valid: false, type: "invalid" };
}

/**
 * Try to find memory in legacy memoryBank collection by ObjectId
 * Phase 1.2.7: Add backward compatibility for legacy ObjectId lookups
 */
async function findLegacyMemory(objectId: string): Promise<{ found: boolean; data?: Record<string, unknown> }> {
	try {
		const doc = await collections.memoryBank.findOne({
			_id: new ObjectId(objectId),
			userId: ADMIN_USER_ID,
		});
		if (doc) {
			return { found: true, data: doc as Record<string, unknown> };
		}
	} catch {
		// Not found or invalid
	}
	return { found: false };
}

/**
 * Try to find memory in memory_items collection by memory_id (UUID)
 * Also handles ObjectId-based lookup for transition period
 */
async function findUnifiedMemory(memoryId: string): Promise<{ found: boolean; data?: Record<string, unknown> }> {
	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);
		const collection = db.collection(MEMORY_COLLECTIONS.ITEMS);

		// First try by memory_id (UUID format)
		let doc = await collection.findOne({
			memory_id: memoryId,
			user_id: ADMIN_USER_ID,
		});

		// If not found and it's a valid ObjectId, try by _id
		if (!doc && ObjectId.isValid(memoryId)) {
			doc = await collection.findOne({
				_id: new ObjectId(memoryId),
				user_id: ADMIN_USER_ID,
			});
		}

		if (doc) {
			return { found: true, data: doc as Record<string, unknown> };
		}
	} catch {
		// Not found or error
	}
	return { found: false };
}

// GET /api/memory/memory-bank/[id] - Get a single memory by ID
// Phase 1.2.3: Route GET through UnifiedMemoryFacade.getById()
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;
	if (!id) {
		return error(400, "Memory ID is required");
	}

	const idValidation = isValidMemoryId(id);
	console.log(`[memory-bank] GET request for ID: ${id} (type: ${idValidation.type})`);

	try {
		// Try unified memory system first (for UUID or ObjectId)
		const facade = UnifiedMemoryFacade.getInstance();
		const memory = await facade.getById({
			userId: ADMIN_USER_ID,
			memoryId: id,
		});

		if (memory) {
			return json({
				success: true,
				memory: {
					id: memory.memory_id,
					text: memory.text,
					tags: memory.tags,
					status: memory.status,
					tier: memory.tier,
					score: memory.score,
					created_at: memory.created_at?.toISOString(),
					updated_at: memory.updated_at?.toISOString(),
					archived_at: memory.archived_at?.toISOString(),
				},
			});
		}

		// Phase 1.2.7: Fallback to legacy collection for ObjectId
		if (idValidation.type === "objectId") {
			const legacy = await findLegacyMemory(id);
			if (legacy.found && legacy.data) {
				const m = legacy.data;
				return json({
					success: true,
					memory: {
						id: (m._id as ObjectId).toString(),
						text: m.text as string,
						tags: (m.tags as string[]) || [],
						status: m.status as string,
						tier: "memory_bank",
						score: 0.5,
						created_at: (m.createdAt as Date)?.toISOString(),
						updated_at: (m.updatedAt as Date)?.toISOString(),
						archived_at: (m.archivedAt as Date)?.toISOString(),
					},
					source: "legacy",
				});
			}
		}

		return error(404, "Memory not found");
	} catch (err) {
		console.error("[API] Failed to get memory:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get memory" },
			{ status: 500 }
		);
	}
};

// PUT /api/memory/memory-bank/[id] - Update memory (archive/restore)
// Phase 1.2.4: Route PUT through UnifiedMemoryFacade.update()
export const PUT: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	if (!id) {
		return error(400, "Memory ID is required");
	}

	const idValidation = isValidMemoryId(id);
	if (!idValidation.valid) {
		return error(400, "Invalid memory ID format");
	}

	console.log(`[memory-bank] PUT request for ID: ${id} (type: ${idValidation.type})`);

	try {
		const { status, archived_reason, tags } = await request.json();

		// Try unified memory system first
		const facade = UnifiedMemoryFacade.getInstance();
		const result = await facade.update({
			userId: ADMIN_USER_ID,
			memoryId: id,
			status: status as "active" | "archived" | undefined,
			tags,
			archivedReason: archived_reason,
		});

		if (result) {
			return json({
				success: true,
				message: "Memory updated",
				memory_id: result.memory_id,
			});
		}

		// Phase 1.2.7: Fallback to legacy collection for ObjectId
		if (idValidation.type === "objectId") {
			const updateData: Record<string, unknown> = {
				updatedAt: new Date(),
			};

			if (status === "archived") {
				updateData.status = "archived";
				updateData.archivedAt = new Date();
				updateData.archivedReason = archived_reason || "user_action";
			} else if (status === "active") {
				updateData.status = "active";
				updateData.archivedAt = null;
				updateData.archivedReason = null;
			}

			if (tags !== undefined) {
				updateData.tags = tags;
			}

			const legacyResult = await collections.memoryBank.updateOne(
				{ _id: new ObjectId(id), userId: ADMIN_USER_ID },
				{ $set: updateData }
			);

			if (legacyResult.matchedCount > 0) {
				return json({
					success: true,
					message: "Memory updated (legacy)",
					source: "legacy",
				});
			}
		}

		return error(404, "Memory not found");
	} catch (err) {
		console.error("[API] Failed to update memory:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to update memory" },
			{ status: 500 }
		);
	}
};

// DELETE /api/memory/memory-bank/[id] - Delete memory permanently
// Phase 1.2.5: Route DELETE through UnifiedMemoryFacade.delete()
export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;
	if (!id) {
		return error(400, "Memory ID is required");
	}

	const idValidation = isValidMemoryId(id);
	if (!idValidation.valid) {
		return error(400, "Invalid memory ID format");
	}

	console.log(`[memory-bank] DELETE request for ID: ${id} (type: ${idValidation.type})`);

	try {
		// Try unified memory system first
		const facade = UnifiedMemoryFacade.getInstance();
		const deleted = await facade.deleteMemory({
			userId: ADMIN_USER_ID,
			memoryId: id,
		});

		if (deleted) {
			return json({
				success: true,
				message: "Memory deleted",
			});
		}

		// Phase 1.2.7: Fallback to legacy collection for ObjectId
		if (idValidation.type === "objectId") {
			const legacyResult = await collections.memoryBank.deleteOne({
				_id: new ObjectId(id),
				userId: ADMIN_USER_ID,
			});

			if (legacyResult.deletedCount > 0) {
				return json({
					success: true,
					message: "Memory deleted (legacy)",
					source: "legacy",
				});
			}
		}

		return error(404, "Memory not found");
	} catch (err) {
		console.error("[API] Failed to delete memory:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to delete memory" },
			{ status: 500 }
		);
	}
};
