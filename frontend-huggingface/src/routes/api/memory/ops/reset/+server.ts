import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Database } from "$lib/server/database";
import { QdrantAdapter, getMemoryEnvConfig } from "$lib/server/memory";
import { config } from "$lib/server/config";

/**
 * Memory System Nuclear Reset API
 *
 * GET: Returns what will be deleted (dry run / preview)
 * POST: Executes the reset (requires confirmation token)
 *
 * This endpoint completely wipes all memory system data:
 * - All MongoDB memory collections
 * - All Qdrant vector embeddings
 */

// All MongoDB collections to drop
const MONGO_COLLECTIONS = [
	// Core Memory System
	"memory_items",
	"memory_versions",
	"memory_outcomes",
	"action_outcomes",
	"known_solutions",

	// Knowledge Graph
	"kg_nodes",
	"kg_edges",
	"kg_routing_concepts",
	"kg_routing_stats",
	"kg_action_effectiveness",
	"kg_context_action_effectiveness",

	// Personality & Mappings
	"personality_memory_mappings",

	// Operations & Logging
	"reindex_checkpoints",
	"consistency_logs",

	// Legacy Memory Bank
	"memoryBank",

	// Books & Documents
	"books",
	"document_chunks",
	"document_contexts",
	"document_registry",

	// Conversation Memory
	"conversation_memory",
];

interface CollectionInfo {
	name: string;
	count: number;
	exists: boolean;
}

interface ResetPreview {
	mongodb: {
		collections: CollectionInfo[];
		totalDocuments: number;
	};
	qdrant: {
		collection: string;
		pointCount: number;
		exists: boolean;
	};
}

/**
 * GET - Preview what will be deleted
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		if (!locals.isAdmin) {
			return json(
				{
					success: false,
					error: "Admin only",
				},
				{ status: 403 }
			);
		}

		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		// Get counts for each collection
		const collectionInfos: CollectionInfo[] = [];
		let totalDocuments = 0;

		for (const collectionName of MONGO_COLLECTIONS) {
			try {
				const collection = db.collection(collectionName);
				const count = await collection.countDocuments();
				collectionInfos.push({
					name: collectionName,
					count,
					exists: count > 0,
				});
				totalDocuments += count;
			} catch {
				collectionInfos.push({
					name: collectionName,
					count: 0,
					exists: false,
				});
			}
		}

		// Check Qdrant
		const envConfig = getMemoryEnvConfig();
		let qdrantInfo = {
			collection: envConfig.qdrantCollection,
			pointCount: 0,
			exists: false,
		};

		try {
			const qdrantAdapter = new QdrantAdapter({
				host: envConfig.qdrantHost,
				port: envConfig.qdrantPort,
				https: envConfig.qdrantHttps,
			});
			await qdrantAdapter.initialize();

			// Get collection info
			const collectionInfo = await qdrantAdapter.getCollectionInfo();
			if (collectionInfo) {
				qdrantInfo = {
					collection: envConfig.qdrantCollection,
					pointCount: collectionInfo.points_count || 0,
					exists: true,
				};
			}
		} catch {
			// Qdrant not available or collection doesn't exist
		}

		const preview: ResetPreview = {
			mongodb: {
				collections: collectionInfos,
				totalDocuments,
			},
			qdrant: qdrantInfo,
		};

		return json({
			success: true,
			preview,
			warning:
				"This operation will PERMANENTLY DELETE all memory data. Use POST with confirm=true to execute.",
			confirmationRequired: true,
		});
	} catch (err) {
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : String(err),
			},
			{ status: 500 }
		);
	}
};

/**
 * POST - Execute the reset
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => ({}));
	const confirm = body.confirm === true;

	if (!locals.isAdmin) {
		return json(
			{
				success: false,
				error: "Admin only",
			},
			{ status: 403 }
		);
	}

	if (!confirm) {
		return json(
			{
				success: false,
				error: "Confirmation required. Send { confirm: true } to execute reset.",
			},
			{ status: 400 }
		);
	}

	const results: {
		mongodb: Array<{
			collection: string;
			status: "dropped" | "not_found" | "error";
			error?: string;
		}>;
		qdrant: { collection: string; status: "deleted" | "not_found" | "error"; error?: string };
	} = {
		mongodb: [],
		qdrant: { collection: "", status: "not_found" },
	};

	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		// Drop all MongoDB collections
		for (const collectionName of MONGO_COLLECTIONS) {
			try {
				const collection = db.collection(collectionName);
				await collection.drop();
				results.mongodb.push({ collection: collectionName, status: "dropped" });
			} catch (err: unknown) {
				const errMsg = err instanceof Error ? err.message : String(err);
				if (errMsg.includes("ns not found") || errMsg.includes("NamespaceNotFound")) {
					results.mongodb.push({ collection: collectionName, status: "not_found" });
				} else {
					results.mongodb.push({ collection: collectionName, status: "error", error: errMsg });
				}
			}
		}

		// Delete Qdrant collection
		const envConfig = getMemoryEnvConfig();
		results.qdrant.collection = envConfig.qdrantCollection;

		try {
			const qdrantAdapter = new QdrantAdapter({
				host: envConfig.qdrantHost,
				port: envConfig.qdrantPort,
				https: envConfig.qdrantHttps,
			});
			await qdrantAdapter.initialize();

			// Delete collection
			await qdrantAdapter.deleteCollection();
			results.qdrant.status = "deleted";
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.message : String(err);
			if (errMsg.includes("not found") || errMsg.includes("doesn't exist")) {
				results.qdrant.status = "not_found";
			} else {
				results.qdrant.status = "error";
				results.qdrant.error = errMsg;
			}
		}

		const droppedCount = results.mongodb.filter((r) => r.status === "dropped").length;
		const errorCount = results.mongodb.filter((r) => r.status === "error").length;

		return json({
			success: errorCount === 0,
			message: `Memory system reset complete. Dropped ${droppedCount} MongoDB collections. Qdrant: ${results.qdrant.status}`,
			results,
			nextSteps: [
				"1. Restart the frontend service to reinitialize collections",
				"2. The memory system will start fresh with empty data",
				"3. Upload new documents via Bookstore or RAG",
			],
		});
	} catch (err) {
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : String(err),
				results,
			},
			{ status: 500 }
		);
	}
};
