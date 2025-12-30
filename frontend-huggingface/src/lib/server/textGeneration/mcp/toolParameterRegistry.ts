/**
 * Universal MCP Tool Parameter Registry
 *
 * Defines expected parameters for all MCP tools across all servers.
 * This registry enables automatic normalization of model-generated parameters
 * to match what each tool expects, preventing errors.
 *
 * Registry-Based Approach:
 * - Each tool family defines its parameter schemas
 * - Common aliases (query/prompt/messages/text) are automatically mapped
 * - Type coercion ensures correct types (string, number, array, etc.)
 * - Validation rules enforce enum constraints and defaults
 */

import { logger } from "../../logger";

// ============================================================================
// Type Definitions
// ============================================================================

export type ParameterType = "string" | "number" | "boolean" | "array" | "object";

export interface ParameterSchema {
	/** Expected parameter name */
	name: string;
	/** Parameter type */
	type: ParameterType;
	/** Common aliases the model might use */
	aliases?: string[];
	/** Is this parameter required? */
	required?: boolean;
	/** Default value if not provided */
	default?: unknown;
	/** For enums, valid values */
	enum?: string[];
	/** Special transformation to apply */
	transform?: "toMessages" | "toNumber" | "toBoolean" | "toArray" | "toString";
	/** Description for logging */
	description?: string;
}

export interface ToolSchema {
	/** Tool name patterns (supports regex) */
	patterns: RegExp[];
	/** Parameter schemas */
	parameters: ParameterSchema[];
	/** Post-processing validations */
	validations?: Array<{
		field: string;
		validator: (value: unknown) => { valid: boolean; coerced?: unknown };
	}>;
}

// ============================================================================
// Tool Schemas Registry
// ============================================================================

const TOOL_SCHEMAS: ToolSchema[] = [
	// =========================================================================
	// PERPLEXITY TOOLS
	// =========================================================================
	{
		// perplexity_search expects "query" (string)
		patterns: [/^perplexity[_-]search$/i],
		parameters: [
			{
				name: "query",
				type: "string",
				aliases: ["prompt", "text", "question", "q", "search_query", "input"],
				required: true,
				transform: "toString",
				description: "Search query string",
			},
		],
	},
	{
		// perplexity_ask, perplexity_research, perplexity_reason expect "messages" (array)
		patterns: [
			/^perplexity[_-]ask$/i,
			/^perplexity[_-]research$/i,
			/^perplexity[_-]reason$/i,
		],
		parameters: [
			{
				name: "messages",
				type: "array",
				aliases: ["query", "prompt", "text", "question", "q", "input"],
				required: true,
				transform: "toMessages",
				description: "Chat messages array [{role, content}]",
			},
		],
	},

	// =========================================================================
	// TAVILY TOOLS
	// =========================================================================
	{
		patterns: [/^tavily[_-]search$/i],
		parameters: [
			{
				name: "query",
				type: "string",
				aliases: ["prompt", "text", "question", "q", "search_query", "input"],
				required: true,
				transform: "toString",
				description: "Search query string",
			},
			{
				name: "topic",
				type: "string",
				enum: ["general", "news"],
				default: "general",
				description: "Search topic category",
			},
			{
				name: "days",
				type: "number",
				transform: "toNumber",
				description: "Number of days for news results",
			},
			{
				name: "max_results",
				type: "number",
				aliases: ["limit", "num_results", "count"],
				transform: "toNumber",
				description: "Maximum number of results",
			},
			{
				name: "include_domains",
				type: "array",
				aliases: ["domains", "sites"],
				transform: "toArray",
				description: "Domains to include",
			},
			{
				name: "exclude_domains",
				type: "array",
				aliases: ["blocked_domains"],
				transform: "toArray",
				description: "Domains to exclude",
			},
		],
	},
	{
		patterns: [/^tavily[_-]extract$/i],
		parameters: [
			{
				name: "urls",
				type: "array",
				aliases: ["url", "link", "links"],
				required: true,
				transform: "toArray",
				description: "URLs to extract content from",
			},
		],
	},

	// =========================================================================
	// DATAGOV TOOLS (Israeli Government Data - data.gov.il)
	// Based on actual server.py implementation
	// =========================================================================
	{
		// PRIMARY TOOL: datagov_query - Natural language search
		patterns: [/^datagov[_-]query$/i],
		parameters: [
			{
				name: "query",
				type: "string",
				aliases: ["search", "q", "search_query", "keyword", "text", "prompt"],
				required: true,
				transform: "toString",
				description: "Natural language search in Hebrew or English",
			},
			{
				name: "limit",
				type: "number",
				aliases: ["max_results", "count", "rows", "n"],
				default: 20,
				transform: "toNumber",
				description: "Max records to return (1-100)",
			},
			{
				name: "offset",
				type: "number",
				aliases: ["skip", "start"],
				default: 0,
				transform: "toNumber",
				description: "Starting record for pagination",
			},
			{
				name: "format_output",
				type: "boolean",
				aliases: ["format", "markdown", "formatted"],
				default: true,
				transform: "toBoolean",
				description: "Return markdown table (true) or raw JSON (false)",
			},
		],
	},
	{
		// datastore_search - Search specific resource
		patterns: [/^datastore[_-]search$/i],
		parameters: [
			{
				name: "resource_id",
				type: "string",
				aliases: ["resourceId", "resource", "id"],
				required: true,
				transform: "toString",
				description: "Resource ID to search",
			},
			{
				name: "q",
				type: "string",
				aliases: ["query", "search", "text"],
				transform: "toString",
				description: "Full-text search query",
			},
			{
				name: "limit",
				type: "number",
				aliases: ["max_results", "count", "rows"],
				default: 100,
				transform: "toNumber",
			},
			{
				name: "offset",
				type: "number",
				aliases: ["skip", "start"],
				default: 0,
				transform: "toNumber",
			},
			{
				name: "fields",
				type: "string",
				aliases: ["columns", "select"],
				transform: "toString",
				description: "Comma-separated field names to select",
			},
			{
				name: "sort",
				type: "string",
				aliases: ["order_by", "order"],
				transform: "toString",
			},
		],
	},
	{
		// package_search - Find datasets
		patterns: [/^package[_-]search$/i],
		parameters: [
			{
				name: "q",
				type: "string",
				aliases: ["query", "search", "text"],
				transform: "toString",
				description: "Query search term",
			},
			{
				name: "rows",
				type: "number",
				aliases: ["limit", "count", "max_results"],
				default: 20,
				transform: "toNumber",
			},
			{
				name: "start",
				type: "number",
				aliases: ["offset", "skip"],
				default: 0,
				transform: "toNumber",
			},
			{
				name: "sort",
				type: "string",
				aliases: ["order_by", "order"],
				transform: "toString",
			},
		],
	},
	{
		// package_show - Get dataset metadata
		patterns: [/^package[_-]show$/i],
		parameters: [
			{
				name: "id",
				type: "string",
				aliases: ["package_id", "packageId", "dataset_id", "datasetId", "name"],
				required: true,
				transform: "toString",
				description: "Dataset ID or name",
			},
		],
	},
	{
		// resource_search - Find resources
		patterns: [/^resource[_-]search$/i],
		parameters: [
			{
				name: "query",
				type: "string",
				aliases: ["q", "search", "text"],
				transform: "toString",
			},
			{
				name: "limit",
				type: "number",
				aliases: ["max_results", "count", "rows"],
				default: 100,
				transform: "toNumber",
			},
			{
				name: "offset",
				type: "number",
				aliases: ["skip", "start"],
				default: 0,
				transform: "toNumber",
			},
		],
	},
	{
		// fetch_data - Fetch dataset data with caching
		patterns: [/^fetch[_-]data$/i],
		parameters: [
			{
				name: "dataset_name",
				type: "string",
				aliases: ["dataset", "name", "id", "dataset_id"],
				required: true,
				transform: "toString",
				description: "Dataset name or ID",
			},
			{
				name: "limit",
				type: "number",
				aliases: ["max_results", "count", "rows"],
				default: 100,
				transform: "toNumber",
			},
			{
				name: "offset",
				type: "number",
				aliases: ["skip", "start"],
				default: 0,
				transform: "toNumber",
			},
		],
	},
	{
		// datagov_helper - Combined search and selection
		patterns: [/^datagov[_-]helper$/i, /^datagov[_-]helper[_-]map$/i],
		parameters: [
			{
				name: "query",
				type: "string",
				aliases: ["search", "q", "text"],
				required: true,
				transform: "toString",
			},
			{
				name: "category",
				type: "string",
				aliases: ["cat", "type"],
				transform: "toString",
			},
			{
				name: "limit",
				type: "number",
				aliases: ["max_results", "count"],
				default: 20,
				transform: "toNumber",
			},
		],
	},
	{
		// organization_show - Get organization details
		patterns: [/^organization[_-]show$/i],
		parameters: [
			{
				name: "id",
				type: "string",
				aliases: ["org_id", "orgId", "name", "organization"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		// No-param tools
		patterns: [
			/^status[_-]show$/i,
			/^license[_-]list$/i,
			/^package[_-]list$/i,
			/^organization[_-]list$/i,
		],
		parameters: [],
	},

	// =========================================================================
	// FILESYSTEM TOOLS
	// =========================================================================
	{
		patterns: [/^read[_-]file$/i, /^file[_-]read$/i],
		parameters: [
			{
				name: "path",
				type: "string",
				aliases: ["file", "filepath", "file_path", "filename"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^write[_-]file$/i, /^file[_-]write$/i, /^create[_-]file$/i],
		parameters: [
			{
				name: "path",
				type: "string",
				aliases: ["file", "filepath", "file_path", "filename"],
				required: true,
				transform: "toString",
			},
			{
				name: "content",
				type: "string",
				aliases: ["text", "data", "body", "contents"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^list[_-]directory$/i, /^ls$/i, /^dir$/i, /^read[_-]directory$/i],
		parameters: [
			{
				name: "path",
				type: "string",
				aliases: ["dir", "directory", "folder", "dirpath"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^search[_-]files$/i, /^find[_-]files$/i, /^glob$/i],
		parameters: [
			{
				name: "path",
				type: "string",
				aliases: ["dir", "directory", "root", "base_path"],
				required: true,
				transform: "toString",
			},
			{
				name: "pattern",
				type: "string",
				aliases: ["glob", "query", "regex", "search"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^get[_-]file[_-]info$/i, /^file[_-]info$/i, /^stat$/i],
		parameters: [
			{
				name: "path",
				type: "string",
				aliases: ["file", "filepath", "file_path"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^create[_-]directory$/i, /^mkdir$/i, /^make[_-]dir$/i],
		parameters: [
			{
				name: "path",
				type: "string",
				aliases: ["dir", "directory", "folder", "dirpath"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^move[_-]file$/i, /^rename[_-]file$/i, /^mv$/i],
		parameters: [
			{
				name: "source",
				type: "string",
				aliases: ["src", "from", "old_path", "oldPath", "source_path"],
				required: true,
				transform: "toString",
			},
			{
				name: "destination",
				type: "string",
				aliases: ["dest", "to", "new_path", "newPath", "target", "destination_path"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^edit[_-]file$/i],
		parameters: [
			{
				name: "path",
				type: "string",
				aliases: ["file", "filepath", "file_path"],
				required: true,
				transform: "toString",
			},
			{
				name: "edits",
				type: "array",
				aliases: ["changes", "replacements", "modifications"],
				required: true,
				description: "Array of {oldText, newText} replacements",
			},
		],
	},

	// =========================================================================
	// GIT TOOLS
	// =========================================================================
	{
		patterns: [/^git[_-]status$/i],
		parameters: [
			{
				name: "repo_path",
				type: "string",
				aliases: ["path", "repository", "repo", "dir", "directory"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^git[_-]log$/i],
		parameters: [
			{
				name: "repo_path",
				type: "string",
				aliases: ["path", "repository", "repo"],
				required: true,
				transform: "toString",
			},
			{
				name: "max_count",
				type: "number",
				aliases: ["limit", "n", "count", "num"],
				default: 10,
				transform: "toNumber",
			},
		],
	},
	{
		patterns: [/^git[_-]diff$/i],
		parameters: [
			{
				name: "repo_path",
				type: "string",
				aliases: ["path", "repository", "repo"],
				required: true,
				transform: "toString",
			},
			{
				name: "target",
				type: "string",
				aliases: ["ref", "commit", "branch", "file"],
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^git[_-]commit$/i],
		parameters: [
			{
				name: "repo_path",
				type: "string",
				aliases: ["path", "repository", "repo"],
				required: true,
				transform: "toString",
			},
			{
				name: "message",
				type: "string",
				aliases: ["msg", "commit_message", "description", "text"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^git[_-]branch$/i, /^git[_-]branches$/i],
		parameters: [
			{
				name: "repo_path",
				type: "string",
				aliases: ["path", "repository", "repo"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^git[_-]checkout$/i],
		parameters: [
			{
				name: "repo_path",
				type: "string",
				aliases: ["path", "repository", "repo"],
				required: true,
				transform: "toString",
			},
			{
				name: "branch",
				type: "string",
				aliases: ["ref", "target", "branch_name"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^git[_-]clone$/i],
		parameters: [
			{
				name: "url",
				type: "string",
				aliases: ["repo_url", "repository_url", "remote"],
				required: true,
				transform: "toString",
			},
			{
				name: "path",
				type: "string",
				aliases: ["target", "destination", "dir", "directory"],
				transform: "toString",
			},
		],
	},

	// =========================================================================
	// DOCKER TOOLS
	// =========================================================================
	{
		patterns: [/^docker[_-]ps$/i, /^list[_-]containers$/i],
		parameters: [
			{
				name: "all",
				type: "boolean",
				aliases: ["show_all", "include_stopped"],
				default: false,
				transform: "toBoolean",
			},
		],
	},
	{
		patterns: [/^docker[_-]images$/i, /^list[_-]images$/i],
		parameters: [],
	},
	{
		patterns: [/^docker[_-]logs$/i, /^container[_-]logs$/i],
		parameters: [
			{
				name: "container",
				type: "string",
				aliases: ["container_id", "containerId", "name", "id"],
				required: true,
				transform: "toString",
			},
			{
				name: "tail",
				type: "number",
				aliases: ["lines", "n", "limit"],
				default: 100,
				transform: "toNumber",
			},
		],
	},
	{
		patterns: [/^docker[_-]exec$/i, /^container[_-]exec$/i],
		parameters: [
			{
				name: "container",
				type: "string",
				aliases: ["container_id", "containerId", "name", "id"],
				required: true,
				transform: "toString",
			},
			{
				name: "command",
				type: "string",
				aliases: ["cmd", "exec", "run"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^docker[_-]start$/i, /^start[_-]container$/i],
		parameters: [
			{
				name: "container",
				type: "string",
				aliases: ["container_id", "containerId", "name", "id"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^docker[_-]stop$/i, /^stop[_-]container$/i],
		parameters: [
			{
				name: "container",
				type: "string",
				aliases: ["container_id", "containerId", "name", "id"],
				required: true,
				transform: "toString",
			},
		],
	},

	// =========================================================================
	// FETCH TOOLS
	// =========================================================================
	{
		patterns: [/^fetch$/i, /^http[_-]fetch$/i, /^web[_-]fetch$/i],
		parameters: [
			{
				name: "url",
				type: "string",
				aliases: ["uri", "link", "href", "address"],
				required: true,
				transform: "toString",
			},
			{
				name: "user_agent",
				type: "string",
				aliases: ["userAgent", "ua"],
				transform: "toString",
			},
			{
				name: "max_length",
				type: "number",
				aliases: ["maxLength", "limit", "max_size"],
				transform: "toNumber",
			},
		],
	},

	// =========================================================================
	// TIME TOOLS
	// =========================================================================
	{
		patterns: [/^get[_-]current[_-]time$/i, /^current[_-]time$/i, /^now$/i, /^time$/i],
		parameters: [
			{
				name: "timezone",
				type: "string",
				aliases: ["tz", "zone", "time_zone", "timeZone"],
				default: "Asia/Jerusalem",
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^convert[_-]time$/i, /^time[_-]convert$/i],
		parameters: [
			{
				name: "source_timezone",
				type: "string",
				aliases: ["from_tz", "source_tz", "from"],
				required: true,
				transform: "toString",
			},
			{
				name: "target_timezone",
				type: "string",
				aliases: ["to_tz", "target_tz", "to"],
				required: true,
				transform: "toString",
			},
			{
				name: "time",
				type: "string",
				aliases: ["datetime", "timestamp", "value"],
				required: true,
				transform: "toString",
			},
		],
	},

	// =========================================================================
	// MEMORY TOOLS
	// =========================================================================
	{
		patterns: [/^create[_-]entities$/i],
		parameters: [
			{
				name: "entities",
				type: "array",
				aliases: ["items", "nodes", "data"],
				required: true,
			},
		],
	},
	{
		patterns: [/^create[_-]relations$/i],
		parameters: [
			{
				name: "relations",
				type: "array",
				aliases: ["relationships", "edges", "links"],
				required: true,
			},
		],
	},
	{
		patterns: [/^search[_-]nodes$/i, /^search[_-]memory$/i],
		parameters: [
			{
				name: "query",
				type: "string",
				aliases: ["search", "q", "text"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^read[_-]graph$/i, /^get[_-]graph$/i],
		parameters: [],
	},
	{
		patterns: [/^delete[_-]entities$/i],
		parameters: [
			{
				name: "entityNames",
				type: "array",
				aliases: ["names", "entities", "ids"],
				required: true,
				transform: "toArray",
			},
		],
	},

	// =========================================================================
	// YOUTUBE SUMMARIZER TOOLS
	// =========================================================================
	{
		patterns: [/^summarize[_-]youtube$/i, /^youtube[_-]summarize$/i, /^youtube[_-]summary$/i],
		parameters: [
			{
				name: "url",
				type: "string",
				aliases: ["video_url", "videoUrl", "link", "video", "youtube_url"],
				required: true,
				transform: "toString",
			},
			{
				name: "language",
				type: "string",
				aliases: ["lang", "output_language"],
				default: "he",
				transform: "toString",
			},
		],
	},

	// =========================================================================
	// SEQUENTIAL THINKING TOOLS
	// =========================================================================
	{
		patterns: [/^sequential[_-]thinking$/i, /^think$/i, /^reason$/i],
		parameters: [
			{
				name: "thought",
				type: "string",
				aliases: ["input", "prompt", "question", "problem"],
				required: true,
				transform: "toString",
			},
		],
	},

	// =========================================================================
	// DOCLING TOOLS (Document Processing)
	// =========================================================================
	{
		patterns: [/^docling[_-]?convert$/i, /^convert[_-]?document$/i],
		parameters: [
			{
				name: "file_path",
				type: "string",
				aliases: ["path", "file", "document", "source", "קובץ", "מסמך", "נתיב"],
				required: true,
				transform: "toString",
				description: "Path to the document file",
			},
			{
				name: "format",
				type: "string",
				aliases: ["output", "output_format", "type", "פורמט", "סוג"],
				default: "markdown",
				enum: ["markdown", "json", "text", "html"],
				transform: "toString",
				description: "Output format",
			},
			{
				name: "ocr_enabled",
				type: "boolean",
				aliases: ["ocr", "scan", "recognize", "סריקה", "זיהוי"],
				default: true,
				transform: "toBoolean",
				description: "Enable OCR for scanned documents",
			},
		],
	},
	{
		patterns: [/^docling[_-]?convert[_-]?url$/i],
		parameters: [
			{
				name: "url",
				type: "string",
				aliases: ["link", "source", "קישור", "כתובת"],
				required: true,
				transform: "toString",
				description: "URL of the document",
			},
			{
				name: "format",
				type: "string",
				aliases: ["output", "output_format", "פורמט"],
				default: "markdown",
				enum: ["markdown", "json", "text"],
				transform: "toString",
			},
			{
				name: "ocr_enabled",
				type: "boolean",
				aliases: ["ocr", "scan"],
				default: true,
				transform: "toBoolean",
			},
		],
	},
	{
		patterns: [/^docling[_-]?extract[_-]?tables$/i, /^extract[_-]?tables$/i],
		parameters: [
			{
				name: "file_path",
				type: "string",
				aliases: ["path", "file", "document", "קובץ", "מסמך"],
				required: true,
				transform: "toString",
			},
			{
				name: "output_format",
				type: "string",
				aliases: ["format", "type", "פורמט"],
				default: "json",
				enum: ["json", "csv", "markdown"],
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^docling[_-]?extract[_-]?images$/i],
		parameters: [
			{
				name: "file_path",
				type: "string",
				aliases: ["path", "file", "document", "קובץ"],
				required: true,
				transform: "toString",
			},
			{
				name: "classify",
				type: "boolean",
				aliases: ["classification", "סיווג"],
				default: true,
				transform: "toBoolean",
			},
		],
	},
	{
		patterns: [/^docling[_-]?ocr$/i, /^ocr$/i],
		parameters: [
			{
				name: "file_path",
				type: "string",
				aliases: ["path", "file", "image", "קובץ", "תמונה"],
				required: true,
				transform: "toString",
			},
			{
				name: "language",
				type: "string",
				aliases: ["lang", "languages", "שפה", "שפות"],
				default: "heb+eng",
				enum: ["heb", "eng", "ara", "heb+eng", "ara+heb+eng"],
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^docling[_-]?status$/i],
		parameters: [
			{
				name: "task_id",
				type: "string",
				aliases: ["id", "job_id", "task"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^docling[_-]?list[_-]?formats$/i],
		parameters: [],
	},
	{
		patterns: [/^docling[_-]?analyze$/i],
		parameters: [
			{
				name: "file_path",
				type: "string",
				aliases: ["path", "file", "document", "קובץ"],
				required: true,
				transform: "toString",
			},
		],
	},

	// =========================================================================
	// EVERYTHING TOOLS (demo/test)
	// =========================================================================
	{
		patterns: [/^echo$/i],
		parameters: [
			{
				name: "message",
				type: "string",
				aliases: ["text", "input", "content"],
				required: true,
				transform: "toString",
			},
		],
	},
	{
		patterns: [/^add$/i, /^sum$/i],
		parameters: [
			{
				name: "a",
				type: "number",
				aliases: ["x", "first", "num1"],
				required: true,
				transform: "toNumber",
			},
			{
				name: "b",
				type: "number",
				aliases: ["y", "second", "num2"],
				required: true,
				transform: "toNumber",
			},
		],
	},
];

// ============================================================================
// Transformation Functions
// ============================================================================

function transformToString(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === null || value === undefined) return "";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function transformToNumber(value: unknown): number | undefined {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = parseFloat(value);
		if (!isNaN(parsed)) return parsed;
	}
	return undefined;
}

function transformToBoolean(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const lower = value.toLowerCase();
		return lower === "true" || lower === "1" || lower === "yes";
	}
	if (typeof value === "number") return value !== 0;
	return Boolean(value);
}

function transformToArray(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	if (typeof value === "string") {
		// Try JSON parse
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) return parsed;
		} catch {
			// Not JSON, treat as single-element array
		}
		return [value];
	}
	if (value !== null && value !== undefined) return [value];
	return [];
}

function transformToMessages(value: unknown): Array<{ role: string; content: string }> {
	// Already in correct format
	if (Array.isArray(value)) {
		// Validate it's messages array
		const isMessagesArray = value.every(
			(m) => typeof m === "object" && m !== null && "role" in m && "content" in m
		);
		if (isMessagesArray) return value as Array<{ role: string; content: string }>;
		// Array of strings? Convert to messages
		if (value.every((v) => typeof v === "string")) {
			return value.map((v) => ({ role: "user", content: String(v) }));
		}
	}
	// Single string → single user message
	if (typeof value === "string") {
		return [{ role: "user", content: value }];
	}
	// Object with content field
	if (typeof value === "object" && value !== null && "content" in value) {
		const content = (value as Record<string, unknown>).content;
		return [{ role: "user", content: transformToString(content) }];
	}
	// Fallback: stringify
	return [{ role: "user", content: transformToString(value) }];
}

function applyTransform(value: unknown, transform: string): unknown {
	switch (transform) {
		case "toString":
			return transformToString(value);
		case "toNumber":
			return transformToNumber(value);
		case "toBoolean":
			return transformToBoolean(value);
		case "toArray":
			return transformToArray(value);
		case "toMessages":
			return transformToMessages(value);
		default:
			return value;
	}
}

// ============================================================================
// Schema Matching & Normalization
// ============================================================================

function findMatchingSchema(toolName: string): ToolSchema | undefined {
	for (const schema of TOOL_SCHEMAS) {
		for (const pattern of schema.patterns) {
			if (pattern.test(toolName)) {
				return schema;
			}
		}
	}
	return undefined;
}

export interface NormalizationResult {
	success: boolean;
	normalized: Record<string, unknown>;
	warnings: string[];
	appliedMappings: Array<{ from: string; to: string }>;
}

/**
 * Normalizes tool arguments based on the registry schema.
 *
 * @param toolName - Name of the tool being called
 * @param args - Raw arguments from the model
 * @returns Normalized arguments matching tool expectations
 */
export function normalizeWithRegistry(
	toolName: string,
	args: Record<string, unknown>
): NormalizationResult {
	const result: NormalizationResult = {
		success: true,
		normalized: { ...args },
		warnings: [],
		appliedMappings: [],
	};

	const schema = findMatchingSchema(toolName);
	if (!schema) {
		// No schema found - return args unchanged
		logger.debug({ toolName }, "[registry] No schema found, passing args unchanged");
		return result;
	}

	logger.debug({ toolName, schemaParams: schema.parameters.length }, "[registry] Found schema");

	// Process each expected parameter
	for (const param of schema.parameters) {
		const { name, aliases = [], required, transform, type } = param;

		// Check if expected param already exists
		if (name in result.normalized && result.normalized[name] !== undefined) {
			// Apply transform if specified
			if (transform) {
				result.normalized[name] = applyTransform(result.normalized[name], transform);
			}
			continue;
		}

		// Try to find value from aliases
		let foundAlias: string | undefined;
		let foundValue: unknown;

		for (const alias of aliases) {
			if (alias in result.normalized && result.normalized[alias] !== undefined) {
				foundAlias = alias;
				foundValue = result.normalized[alias];
				break;
			}
		}

		if (foundAlias !== undefined) {
			// Map alias to expected name
			if (transform) {
				foundValue = applyTransform(foundValue, transform);
			}
			result.normalized[name] = foundValue;
			delete result.normalized[foundAlias];
			result.appliedMappings.push({ from: foundAlias, to: name });
			logger.debug(
				{ toolName, from: foundAlias, to: name },
				"[registry] Mapped alias to expected parameter"
			);
		} else if (param.default !== undefined) {
			// Apply default value
			result.normalized[name] = param.default;
		} else if (required) {
			// Required parameter missing
			result.warnings.push(`Required parameter "${name}" not found`);
		}

		// Validate enum if specified
		if (param.enum && result.normalized[name] !== undefined) {
			const val = String(result.normalized[name]).toLowerCase();
			const validValue = param.enum.find((e) => e.toLowerCase() === val);
			if (!validValue && param.default !== undefined) {
				result.warnings.push(
					`Invalid value "${result.normalized[name]}" for "${name}", using default "${param.default}"`
				);
				result.normalized[name] = param.default;
			} else if (validValue) {
				result.normalized[name] = validValue;
			}
		}
	}

	// Run custom validations
	if (schema.validations) {
		for (const validation of schema.validations) {
			const value = result.normalized[validation.field];
			if (value !== undefined) {
				const { valid, coerced } = validation.validator(value);
				if (!valid && coerced !== undefined) {
					result.normalized[validation.field] = coerced;
				}
			}
		}
	}

	if (result.appliedMappings.length > 0) {
		logger.info(
			{
				toolName,
				mappings: result.appliedMappings,
			},
			"[registry] Applied parameter normalization"
		);
	}

	return result;
}

/**
 * Get schema for a tool (for debugging/inspection)
 */
export function getToolSchema(toolName: string): ToolSchema | undefined {
	return findMatchingSchema(toolName);
}

/**
 * Check if a tool has a registered schema
 */
export function hasSchema(toolName: string): boolean {
	return findMatchingSchema(toolName) !== undefined;
}

/**
 * Get all registered tool patterns (for documentation)
 */
export function getRegisteredPatterns(): string[] {
	const patterns: string[] = [];
	for (const schema of TOOL_SCHEMAS) {
		for (const pattern of schema.patterns) {
			patterns.push(pattern.source);
		}
	}
	return patterns;
}
