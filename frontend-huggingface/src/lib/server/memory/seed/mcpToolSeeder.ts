/**
 * MCP Tool Seeder - Seeds memory system with MCP tool capabilities
 *
 * Pre-populates the system tier with tool descriptions so the model
 * can answer questions about available capabilities.
 */

import { Database } from "$lib/server/database";
import { logger } from "$lib/server/logger";
import { config } from "$lib/server/config";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { v4 as uuid } from "uuid";

interface McpToolInfo {
	name: string;
	description: string;
	capabilities: string[];
	category: string;
}

/**
 * Known MCP tools with their capabilities
 * This is a static registry - tools are discovered at runtime but
 * we seed known capabilities for better context injection
 */
const KNOWN_MCP_TOOLS: McpToolInfo[] = [
	{
		name: "tavily_search",
		description: "Web search engine with AI-powered result extraction",
		capabilities: ["web_search", "news_search", "research"],
		category: "search",
	},
	{
		name: "perplexity_search",
		description: "AI-powered research assistant for comprehensive answers",
		capabilities: ["research", "fact_checking", "summarization"],
		category: "search",
	},
	{
		name: "datagov_search",
		description: "Israeli government open data portal search",
		capabilities: ["government_data", "statistics", "public_records"],
		category: "data",
	},
	{
		name: "datagov_query",
		description: "Query specific Israeli government datasets",
		capabilities: ["data_query", "aggregation", "filtering"],
		category: "data",
	},
	{
		name: "docling_parse",
		description: "Document parsing and text extraction",
		capabilities: ["pdf_parsing", "ocr", "document_analysis"],
		category: "documents",
	},
	{
		name: "filesystem_read",
		description: "Read files from the local filesystem",
		capabilities: ["file_reading", "text_extraction"],
		category: "files",
	},
	{
		name: "filesystem_write",
		description: "Write files to the local filesystem",
		capabilities: ["file_writing", "file_creation"],
		category: "files",
	},
];

/**
 * Seeds MCP tool information into the system memory tier
 */
export async function seedMcpTools(): Promise<void> {
	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);
		const collection = db.collection("memory_items");

		let seededCount = 0;

		for (const tool of KNOWN_MCP_TOOLS) {
			const memoryId = `system_tool_${tool.name}`;

			await collection.updateOne(
				{
					memory_id: memoryId,
					user_id: ADMIN_USER_ID,
				},
				{
					$set: {
						memory_id: memoryId,
						user_id: ADMIN_USER_ID,
						org_id: null,
						tier: "system",
						status: "active",
						text: formatToolDescription(tool),
						summary: tool.description,
						tags: ["mcp_tool", "system_knowledge", tool.category, ...tool.capabilities],
						entities: [tool.name, ...tool.capabilities],
						always_inject: false,
						source: {
							type: "system_seed",
							tool_name: tool.name,
							conversation_id: null,
							message_id: null,
							doc_id: null,
							chunk_id: null,
						},
						quality: {
							importance: 0.9,
							confidence: 1.0,
							mentioned_count: 0,
							quality_score: 1.0,
						},
						stats: {
							uses: 0,
							last_used_at: null,
							worked_count: 0,
							failed_count: 0,
							partial_count: 0,
							unknown_count: 0,
							success_rate: 1.0,
							wilson_score: 0.5,
						},
						personality: {
							source_personality_id: null,
							source_personality_name: null,
						},
						language: "en",
						translation_ref_id: null,
						updated_at: new Date(),
					},
					$setOnInsert: {
						_id: uuid(),
						created_at: new Date(),
						archived_at: null,
						expires_at: null,
						embedding: null,
						versioning: {
							current_version: 1,
							supersedes_memory_id: null,
						},
					},
				},
				{ upsert: true }
			);

			seededCount++;
		}

		logger.info({ toolCount: seededCount }, "[Seeder] MCP tools seeded");
	} catch (err) {
		logger.error({ err }, "[Seeder] Failed to seed MCP tools");
	}
}

function formatToolDescription(tool: McpToolInfo): string {
	return `Tool: ${tool.name}
Category: ${tool.category}
Description: ${tool.description}
Capabilities: ${tool.capabilities.join(", ")}

Use this tool when the user asks about: ${tool.capabilities.join(", ")}.`;
}
