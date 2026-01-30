/**
 * KG Seeder - Pre-populate knowledge graph with initial concepts
 *
 * Seeds routing concepts and content nodes for the D3 knowledge graph visualization.
 * These represent common query patterns and entity types the system understands.
 */

import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { logger } from "$lib/server/logger";
import { v5 as uuidv5 } from "uuid";

interface RoutingConcept {
	concept_id: string;
	label: string;
	label_he: string;
	tier_stats: Record<
		string,
		{ success_rate: number; uses: number; worked: number; failed: number }
	>;
	wilson_score: number;
	uses: number;
	user_id: string;
	created_at: Date;
}

interface KgNode {
	node_id: string;
	label: string;
	label_he: string;
	type: "entity" | "concept" | "tool" | "category";
	avg_quality: number;
	hit_count: number;
	user_id: string;
	created_at: Date;
}

interface KgEdge {
	edge_id: string;
	source_id: string;
	target_id: string;
	relation: string;
	weight: number;
	user_id: string;
	created_at: Date;
}

/**
 * Initial routing concepts representing common query patterns
 */
const ROUTING_CONCEPTS: Array<{ id: string; label: string; label_he: string; tier: string }> = [
	// Tools
	{ id: "web_search", label: "Web Search", label_he: "חיפוש באינטרנט", tier: "memory_bank" },
	{
		id: "document_analysis",
		label: "Document Analysis",
		label_he: "ניתוח מסמכים",
		tier: "documents",
	},
	{ id: "data_lookup", label: "Data Lookup", label_he: "חיפוש נתונים", tier: "memory_bank" },

	// Topics
	{ id: "general_knowledge", label: "General Knowledge", label_he: "ידע כללי", tier: "patterns" },
	{
		id: "conversation_history",
		label: "Conversation History",
		label_he: "היסטוריית שיחה",
		tier: "history",
	},
	{
		id: "personal_preferences",
		label: "Personal Preferences",
		label_he: "העדפות אישיות",
		tier: "memory_bank",
	},
	{
		id: "code_programming",
		label: "Code & Programming",
		label_he: "קוד ותכנות",
		tier: "memory_bank",
	},
	{ id: "creative_writing", label: "Creative Writing", label_he: "כתיבה יצירתית", tier: "working" },

	// Israeli Government Data
	{
		id: "transportation_data",
		label: "Transportation Data",
		label_he: "נתוני תחבורה",
		tier: "memory_bank",
	},
	{
		id: "health_statistics",
		label: "Health Statistics",
		label_he: "סטטיסטיקות בריאות",
		tier: "memory_bank",
	},
	{ id: "education_info", label: "Education Info", label_he: "מידע חינוך", tier: "memory_bank" },
	{ id: "economic_data", label: "Economic Data", label_he: "נתונים כלכליים", tier: "memory_bank" },
];

/**
 * Initial content nodes representing key entities
 */
const CONTENT_NODES: Array<{ id: string; label: string; label_he: string; type: KgNode["type"] }> =
	[
		// Tools
		{ id: "tavily_search", label: "Tavily Search", label_he: "חיפוש Tavily", type: "tool" },
		{
			id: "perplexity_search",
			label: "Perplexity Search",
			label_he: "חיפוש Perplexity",
			type: "tool",
		},
		{ id: "datagov_search", label: "DataGov Israel", label_he: "data.gov.il", type: "tool" },
		{ id: "docling_parser", label: "Document Parser", label_he: "מנתח מסמכים", type: "tool" },

		// Categories
		{ id: "ai_ml", label: "AI & Machine Learning", label_he: "בינה מלאכותית", type: "category" },
		{ id: "programming", label: "Programming", label_he: "תכנות", type: "category" },
		{ id: "israel_gov", label: "Israeli Government", label_he: "ממשלת ישראל", type: "category" },
		{ id: "memory_system", label: "Memory System", label_he: "מערכת זיכרון", type: "category" },
	];

/**
 * Edges connecting concepts and nodes
 */
const EDGES: Array<{ source: string; target: string; relation: string }> = [
	{ source: "web_search", target: "tavily_search", relation: "uses" },
	{ source: "web_search", target: "perplexity_search", relation: "uses" },
	{ source: "data_lookup", target: "datagov_search", relation: "uses" },
	{ source: "document_analysis", target: "docling_parser", relation: "uses" },
	{ source: "ai_ml", target: "programming", relation: "related_to" },
	{ source: "israel_gov", target: "datagov_search", relation: "provided_by" },
	{ source: "transportation_data", target: "israel_gov", relation: "belongs_to" },
	{ source: "health_statistics", target: "israel_gov", relation: "belongs_to" },
	{ source: "education_info", target: "israel_gov", relation: "belongs_to" },
	{ source: "economic_data", target: "israel_gov", relation: "belongs_to" },
];

/**
 * Seed knowledge graph with initial concepts and nodes
 */
export async function seedKnowledgeGraph(): Promise<void> {
	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);

		const now = new Date();

		// Seed routing concepts
		const routingCollection = db.collection("kg_routing_concepts");
		for (const concept of ROUTING_CONCEPTS) {
			const doc: RoutingConcept = {
				concept_id: concept.id,
				label: concept.label,
				label_he: concept.label_he,
				tier_stats: {
					[concept.tier]: { success_rate: 0.8, uses: 5, worked: 4, failed: 1 },
				},
				wilson_score: 0.7 + Math.random() * 0.25, // 0.7-0.95
				uses: Math.floor(5 + Math.random() * 20),
				user_id: ADMIN_USER_ID,
				created_at: now,
			};

			await routingCollection.updateOne(
				{ concept_id: concept.id, user_id: ADMIN_USER_ID },
				{ $setOnInsert: doc },
				{ upsert: true }
			);
		}

		// Seed content nodes
		const nodesCollection = db.collection("kg_nodes");
		for (const node of CONTENT_NODES) {
			const doc: KgNode = {
				node_id: node.id,
				label: node.label,
				label_he: node.label_he,
				type: node.type,
				avg_quality: 0.7 + Math.random() * 0.25,
				hit_count: Math.floor(3 + Math.random() * 15),
				user_id: ADMIN_USER_ID,
				created_at: now,
			};

			await nodesCollection.updateOne(
				{ node_id: node.id, user_id: ADMIN_USER_ID },
				{ $setOnInsert: doc },
				{ upsert: true }
			);
		}

		// Seed edges
		// UUID v5 namespace for deterministic edge IDs
		const KG_EDGE_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
		const edgesCollection = db.collection("kg_edges");
		for (const edge of EDGES) {
			// Generate deterministic edge_id from source+target+relation
			const edgeKey = `${edge.source}:${edge.target}:${edge.relation}`;
			const edgeId = uuidv5(edgeKey, KG_EDGE_NAMESPACE);

			const doc: KgEdge = {
				edge_id: edgeId,
				source_id: edge.source,
				target_id: edge.target,
				relation: edge.relation,
				weight: 0.5 + Math.random() * 0.5,
				user_id: ADMIN_USER_ID,
				created_at: now,
			};

			await edgesCollection.updateOne(
				{ source_id: edge.source, target_id: edge.target, user_id: ADMIN_USER_ID },
				{ $setOnInsert: doc },
				{ upsert: true }
			);
		}

		logger.info(
			`[KG Seeder] Seeded ${ROUTING_CONCEPTS.length} routing concepts, ${CONTENT_NODES.length} nodes, ${EDGES.length} edges`
		);
	} catch (err) {
		logger.error({ err }, "[KG Seeder] Failed to seed knowledge graph");
	}
}
