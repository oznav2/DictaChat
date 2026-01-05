import type { OpenAiTool } from "$lib/server/mcp/tools";
import {
	detectHebrewIntent,
	getBestPerplexityTool,
	scorePerplexityTools,
	type PerplexityTool,
} from "../utils/hebrewIntentDetector";

/**
 * Maximum number of tools to send to the model.
 * DictaLM at q4_k_m quantization can handle 3-4 tools reliably with JSON format.
 * More than 5 may cause context overflow or slow inference.
 */
const MAX_TOOLS = parseInt(process.env.MCP_MAX_TOOLS || "4", 10);

/**
 * Cache for tool filtering results to improve performance
 */
interface ToolFilterCacheEntry {
	tools: OpenAiTool[];
	categories: string[];
	timestamp: number;
}

class ToolFilterCache {
	private cache = new Map<string, ToolFilterCacheEntry>();
	private readonly TTL = 30000; // 30 seconds

	/**
	 * Get cached filtering results
	 */
	get(userQuery: string): { tools: OpenAiTool[]; categories: string[] } | null {
		const key = this.generateKey(userQuery);
		const entry = this.cache.get(key);

		if (entry && Date.now() - entry.timestamp < this.TTL) {
			return { tools: entry.tools, categories: entry.categories };
		}

		// Clean up expired entries
		this.cleanup();
		return null;
	}

	/**
	 * Cache filtering results
	 */
	set(userQuery: string, tools: OpenAiTool[], categories: string[]): void {
		const key = this.generateKey(userQuery);
		this.cache.set(key, {
			tools,
			categories,
			timestamp: Date.now(),
		});
	}

	/**
	 * Generate cache key from user query
	 */
	private generateKey(query: string): string {
		// Normalize query for caching - remove extra whitespace and convert to lowercase
		return query.toLowerCase().trim().replace(/\s+/g, " ").slice(0, 200); // Limit key length
	}

	/**
	 * Clean up expired cache entries
	 */
	private cleanup(): void {
		const now = Date.now();
		const entries = Array.from(this.cache.entries());
		for (const [key, entry] of entries) {
			if (now - entry.timestamp > this.TTL) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Clear all cache entries
	 */
	clear(): void {
		this.cache.clear();
	}
}

// Global cache instance
const toolFilterCache = new ToolFilterCache();

/**
 * Tool categories mapped to keywords that indicate user intent.
 * Tools in matching categories will be prioritized.
 * Includes both English and Hebrew keywords for bilingual support.
 */
/**
 * Tool name patterns for MCP identification
 * Used for graceful error handling and intent-based filtering
 */
const TOOL_PATTERNS = {
	perplexity: /^perplexity[_-]/i,
	tavily: /^tavily[_-]/i,
	datagov: /^(datagov|package_|organization_|resource_|datastore_|status_show|license_list)/i,
} as const;

const TOOL_CATEGORIES: Record<string, { keywords: RegExp; tools: string[] }> = {
	// DOCUMENT PROCESSING: Docling tools for PDF/document handling
	// CRITICAL: Must be available when documents are attached to conversation
	document: {
		keywords: /\b(document|pdf|file|parse|extract|convert|ocr|scan|מסמך|קובץ|pdf|עמודים)\b/i,
		tools: [
			"docling_convert",
			"docling_convert_url",
			"docling_extract_tables",
			"docling_extract_images",
			"docling_ocr",
			"docling_status",
			"docling_list_formats",
			"docling_analyze",
		],
	},
	// DEEP RESEARCH: Perplexity-only (מחקר, research, deep dive)
	// Tavily is explicitly EXCLUDED for research intent
	deepResearch: {
		keywords: /\b(research|deep dive|in-depth|comprehensive|analyze)\b|מחקר|לחקור|ניתוח מעמיק/i,
		tools: [
			"perplexity-ask",
			"perplexity-search",
			"perplexity-research",
			"perplexity-reason",
		],
	},
	// SIMPLE SEARCH: Tavily (חפש, search, find)
	simpleSearch: {
		keywords: /\b(search|find|look up|what is|who is)\b|חפש|חיפוש|מצא/i,
		tools: [
			"tavily-search",
			"tavily-extract",
			"tavily-map",
			"fetch",
		],
	},
	// GENERAL INFO: Perplexity preferred (info, news, explain, etc.)
	// NOTE: Tavily is NOT included here - use simpleSearch category for Tavily
	research: {
		// English + Hebrew: information, news, buy, price, compare, recommend, best
		keywords:
			/\b(how to|why|explain|information|news|article|latest|current|today|buy|purchase|price|compare|review|market|recommend|best|top|popular)\b|מידע|חדשות|מאמר|עדכני|היום|קנה|לקנות|מחיר|השווה|השוואה|ביקורת|שוק|המלצה|הטוב ביותר|פופולרי|מה זה|מי זה|איך|למה|הסבר/i,
		tools: [
			"perplexity-ask",
			"perplexity-search",
			"perplexity-research",
			"perplexity-reason",
			"search", // Context7
			"fetch",
		],
	},
	reasoning: {
		// English + Hebrew: think, reason, plan, solve, analyze, step by step
		keywords:
			/\b(think|reason|plan|solve|analyze|step by step|logic)\b|חשוב|תכנן|פתור|נתח|צעד אחר צעד|היגיון/i,
		tools: ["sequentialthinking"],
	},
	utility: {
		// English + Hebrew: echo, add, math, test, env, print, sample
		keywords: /\b(echo|add|math|test|env|print|sample|calculate)\b|הדפס|חבר|חשב|בדיקה|סביבה/i,
		tools: ["echo", "add", "longRunningOperation", "printEnv", "sampleLLM"],
	},
	fileOps: {
		// English + Hebrew: file, read, write, edit, create, delete, directory, folder, save, open
		keywords:
			/\b(file|read|write|edit|create|delete|move|copy|directory|folder|path|save|load|open|content)\b|קובץ|קרא|כתוב|ערוך|צור|מחק|העבר|העתק|תיקייה|נתיב|שמור|טען|פתח|תוכן/i,
		tools: [
			"read_file",
			"read_multiple_files",
			"read_text_file",
			"write_file",
			"edit_file",
			"create_directory",
			"list_directory",
			"directory_tree",
			"list_allowed_directories",
			"search_files",
			"move_file",
			"get_file_info",
		],
	},
	git: {
		// English + Hebrew: git, commit, branch, merge, repository, version control
		keywords:
			/\b(git|commit|branch|merge|pull|push|diff|status|checkout|clone|repository|repo|version control)\b|גיט|קומיט|ענף|מיזוג|משיכה|דחיפה|מאגר|בקרת גרסאות/i,
		tools: [
			"git_status",
			"git_diff",
			"git_diff_unstaged",
			"git_diff_staged",
			"git_commit",
			"git_add",
			"git_log",
			"git_branch",
			"git_checkout",
			"git_pull",
			"git_push",
		],
	},
	docker: {
		// English + Hebrew: docker, container, image, build, deploy
		keywords:
			/\b(docker|container|image|build|deploy|kubernetes|k8s|pod|service)\b|דוקר|קונטיינר|תמונה|בנייה|פריסה/i,
		tools: [
			"list_containers",
			"create_container",
			"run_container",
			"stop_container",
			"docker_container_ls",
			"docker_container_inspect",
			"docker_logs",
			"docker_compose_up",
			"docker_compose_down",
			"list_images",
			"pull_image",
			"build_image",
		],
	},
	time: {
		// English + Hebrew: time, date, timezone, when, schedule, clock, hour, calendar
		keywords:
			/\b(time|date|timezone|convert|when|schedule|clock|hour|minute|calendar)\b|זמן|תאריך|אזור זמן|המרה|מתי|לוח זמנים|שעון|שעה|דקה|לוח שנה/i,
		tools: ["get_current_time", "convert_time"],
	},
	knowledge: {
		// English + Hebrew: remember, recall, note, knowledge, memory, save for later
		keywords:
			/\b(remember|recall|note|entity|relation|graph|knowledge|store|memory|save for later)\b|זכור|היזכר|הערה|ישות|קשר|גרף|ידע|אחסן|זיכרון|שמור להמשך/i,
		tools: [
			"create_entities",
			"create_relations",
			"read_graph",
			"search_nodes",
			"add_observations",
			"memory_store",
			"memory_retrieve",
			"memory_list",
			"memory_clear",
		],
	},
	video: {
		// English + Hebrew: video, youtube, watch, summary, transcript
		keywords:
			/\b(video|youtube|watch|summary|transcript|clip)\b|וידאו|יוטיוב|צפה|סיכום|תמליל|קליפ/i,
		tools: ["get-video-info-for-summary-from-url"],
	},
	library: {
		// English + Hebrew: library, package, documentation, docs, module
		keywords:
			/\b(library|package|npm|pip|documentation|docs|api reference|module)\b|ספרייה|חבילה|תיעוד|מודול/i,
		tools: ["resolve-library-id", "get-library-docs"],
	},
	datagov: {
		// English + Hebrew: Israeli government data, data.gov.il, ministries, statistics, public data
		// Matches: datagov, data.gov, government data, ministry of health, census, hospitals, budget, etc.
		// CRITICAL: Include "מאגרים רשמיים" (official repositories) - explicit user request for government data
		keywords:
			/\b(datagov|data\.gov|data gov|government data|public data|open data|official data|official repo|ckan|israel data|census|statistics|ministry|health data|education data|budget data|hospitals?|trauma|medical|centers?|jerusalem|israel|electric vehicles?|EV|vehicles?)\b|מאגר(?:ים)?\s*רשמי|נתונים\s*רשמי|נתונים ממשלתיים|נתונים פתוחים|מידע ממשלתי|לשכת הסטטיסטיקה|משרד הבריאות|משרד החינוך|משרד התחבורה|מאגר מידע|דאטהגוב|ממשלתי|תקציב|בריאות|חינוך|סטטיסטיקה|מרכז טראומה|בית חולים|בתי חולים|מוסדות|רישוי|עסקים|רשויות|עיריות|ירושלים|רכב חשמלי|רכבים חשמליים|כלי רכב|כמה רכבים|מספר רכבים/i,
		tools: [
			// Primary unified tool
			"datagov_query",
			// CKAN API tools (exported by datagov server)
			"status_show",
			"license_list",
			"package_list",
			"package_search",
			"package_show",
			"organization_list",
			"organization_show",
			"resource_search",
			"datastore_search",
			// Helper tools
			"datagov_helper",
			"datagov_helper_map",
			"datagov_helper_pick",
			"datagov_resource_map",
			"get_resource_metadata_offline",
		],
	},
};

/**
 * Priority scores for "Best-in-Class" tool selection.
 * Higher score = higher priority.
 * Used to ensure high-quality tools (Perplexity, Tavily) are selected over generic ones.
 */
const TOOL_PRIORITIES: Record<string, number> = {
	sequentialthinking: 95,
	// Perplexity tools (hyphen format - MCP standard)
	"perplexity-ask": 100,
	"perplexity-search": 100,
	"perplexity-research": 100,
	"perplexity-reason": 100,
	// Tavily tools (hyphen format - MCP standard)
	"tavily-search": 90,
	"tavily-extract": 90,
	"tavily-map": 85,
	"get-video-info-for-summary-from-url": 90,
	// DataGov tools - datagov_query is PRIMARY (highest priority)
	datagov_query: 95,
	datagov_helper: 85,
	datagov_helper_map: 85,
	datagov_helper_pick: 85,
	datagov_resource_map: 85,
	datastore_search: 80,
	package_search: 75,
	package_show: 75,
	package_list: 70,
	organization_list: 70,
	organization_show: 70,
	resource_search: 70,
	status_show: 60,
	license_list: 60,
	get_resource_metadata_offline: 75,
	// File operations
	read_file: 80,
	write_file: 80,
	edit_file: 80,
	git_status: 80,
	git_diff: 80,
	docker_container_ls: 80,
	list_containers: 80,
	fetch: 90,
	search: 40,
	google_search: 10,
};

/**
 * Always-included tools - keep this empty or minimal.
 * sequentialthinking was removed because its description alone is 500+ tokens
 * which overwhelms quantized models.
 */
const ALWAYS_INCLUDE: string[] = [];

/**
 * Maps PerplexityTool type to both underscore and hyphen variants
 * MCP tools use hyphens, but model might generate underscores
 */
const PERPLEXITY_TOOL_VARIANTS: Record<PerplexityTool, string[]> = {
	perplexity_ask: ["perplexity_ask", "perplexity-ask"],
	perplexity_search: ["perplexity_search", "perplexity-search"],
	perplexity_research: ["perplexity_research", "perplexity-research"],
	perplexity_reason: ["perplexity_reason", "perplexity-reason"],
};

/**
 * Selects the single best Perplexity tool based on intelligent scoring.
 * Removes all other Perplexity tools from the filtered list.
 * Preserves non-Perplexity tools in their original order.
 */
function selectBestPerplexityTool(
	allTools: OpenAiTool[],
	userQuery: string,
	currentFiltered: OpenAiTool[]
): OpenAiTool[] {
	// Get the best tool based on scoring
	const scores = scorePerplexityTools(userQuery);
	const bestTool = scores[0];

	console.log(`[tool-filter] Perplexity scoring for query: "${userQuery.slice(0, 50)}..."`);
	console.log(`[tool-filter] Scores: ${JSON.stringify(scores.map((s) => ({ tool: s.tool, score: s.score, signals: s.matchedSignals })))}`);
	console.log(`[tool-filter] Selected: ${bestTool.tool} (score: ${bestTool.score}, signals: ${bestTool.matchedSignals.join(", ")})`);

	// Get the valid name variants for the best tool
	const validNames = PERPLEXITY_TOOL_VARIANTS[bestTool.tool] || [bestTool.tool];

	// Find the actual tool in allTools (handles both underscore and hyphen formats)
	const selectedPerplexityTool = allTools.find((t) =>
		validNames.some((name) => t.function.name.toLowerCase() === name.toLowerCase())
	);

	if (!selectedPerplexityTool) {
		console.warn(`[tool-filter] Best Perplexity tool ${bestTool.tool} not found in available tools`);
		// Fallback: remove all Perplexity tools and keep others
		return currentFiltered.filter((t) => !TOOL_PATTERNS.perplexity.test(t.function.name));
	}

	// Remove ALL Perplexity tools from filtered, then add only the best one at the front
	const nonPerplexityTools = currentFiltered.filter((t) => !TOOL_PATTERNS.perplexity.test(t.function.name));

	// Also remove Tavily to prevent confusion when Perplexity is selected
	const withoutTavily = nonPerplexityTools.filter((t) => !TOOL_PATTERNS.tavily.test(t.function.name));

	const result = [selectedPerplexityTool, ...withoutTavily];
	console.log(`[tool-filter] Final Perplexity selection: ${selectedPerplexityTool.function.name}, total tools: ${result.length}`);

	return result;
}

/**
 * Options for tool filtering
 */
export interface ToolFilterOptions {
	/** If true, always include docling tools regardless of query intent */
	hasDocuments?: boolean;
}

/**
 * Filters tools based on user query intent to reduce grammar complexity.
 * Returns a subset of tools (max MAX_TOOLS) relevant to the query.
 *
 * @param allTools - All available MCP tools
 * @param userQuery - The user's query text
 * @param options - Optional configuration (e.g., hasDocuments flag)
 */
export function filterToolsByIntent(
	allTools: OpenAiTool[],
	userQuery: string,
	options?: ToolFilterOptions
): { filtered: OpenAiTool[]; categories: string[] } {
	const { hasDocuments = false } = options || {};

	// CRITICAL: If documents are attached, ALWAYS include docling tools
	// This ensures the model can process PDFs/documents regardless of query wording
	if (hasDocuments) {
		console.log("[tool-filter] Documents attached - including docling tools");
	}

	// Check cache first (but not if documents attached - need fresh filtering)
	if (!hasDocuments) {
		const cached = toolFilterCache.get(userQuery);
		if (cached) {
			return { filtered: cached.tools, categories: cached.categories };
		}
	}

	const matchedCategories: string[] = [];
	const relevantToolNames = new Set<string>(ALWAYS_INCLUDE);

	// CRITICAL: If documents attached, always include document category
	if (hasDocuments) {
		matchedCategories.push("document");
		TOOL_CATEGORIES.document.tools.forEach((t) => relevantToolNames.add(t));
	}

	// Find categories that match the user query
	for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
		if (config.keywords.test(userQuery)) {
			matchedCategories.push(category);
			config.tools.forEach((t) => relevantToolNames.add(t));
		}
	}

	// If no specific intent detected, default to research tools
	if (matchedCategories.length === 0) {
		matchedCategories.push("research");
		TOOL_CATEGORIES.research.tools.forEach((t) => relevantToolNames.add(t));
	}

	// Filter available tools to only those in our relevant set
	let filtered = allTools.filter((tool) => relevantToolNames.has(tool.function.name));

	// Sort filtered tools by Best-in-Class priority score (Descending)
	filtered.sort((a, b) => {
		const scoreA = TOOL_PRIORITIES[a.function.name] || 0;
		const scoreB = TOOL_PRIORITIES[b.function.name] || 0;
		return scoreB - scoreA;
	});

	const hebrewIntent = detectHebrewIntent(userQuery);
	if (hebrewIntent) {
		console.log(`[tool-filter] Hebrew intent detected: ${hebrewIntent}`);

		if (hebrewIntent === "official_data") {
			// User explicitly wants official Israeli government data -> DataGov ONLY
			// EXCLUDE all other search tools to prevent model confusion
			const datagovTools = allTools.filter((t) =>
				t.function.name === "datagov_query" ||
				TOOL_PATTERNS.datagov.test(t.function.name)
			);
			if (datagovTools.length > 0) {
				filtered = datagovTools;
				console.log(`[tool-filter] Official data: filtered to ${datagovTools.length} DataGov tools`);
			}
		} else if (hebrewIntent === "research") {
			// User explicitly wants "Deep Research" (מחקר) -> Single BEST Perplexity tool
			// Use intelligent scoring to pick the most appropriate tool
			filtered = selectBestPerplexityTool(allTools, userQuery, filtered);
		} else if (hebrewIntent === "search") {
			// User explicitly wants "Simple Search" (חפש) -> Tavily preferred
			const tavilyTools = allTools.filter((t) =>
				TOOL_PATTERNS.tavily.test(t.function.name)
			);
			if (tavilyTools.length > 0) {
				const tavilyNames = new Set(tavilyTools.map((t) => t.function.name));
				const others = filtered.filter((t) => !tavilyNames.has(t.function.name));
				filtered = [...tavilyTools, ...others];
				console.log(`[tool-filter] Search intent: Tavily-first (${tavilyTools.length} tools)`);
			}
		}
	}

	// INTELLIGENT PERPLEXITY SELECTION: If we have multiple Perplexity tools, pick only the best one
	// This prevents model confusion and ensures accurate tool selection
	const perplexityInFiltered = filtered.filter((t) => TOOL_PATTERNS.perplexity.test(t.function.name));
	if (perplexityInFiltered.length > 1) {
		filtered = selectBestPerplexityTool(allTools, userQuery, filtered);
	}

	// If we still have no tools after filtering, take the first MAX_TOOLS from research
	if (filtered.length === 0) {
		filtered = allTools
			.filter((t) => TOOL_CATEGORIES.research.tools.includes(t.function.name))
			.slice(0, MAX_TOOLS);
	}

	// Final fallback: just take first MAX_TOOLS tools
	if (filtered.length === 0) {
		filtered = allTools.slice(0, MAX_TOOLS);
	}

	// ALWAYS enforce MAX_TOOLS cap - critical for quantized models
	if (filtered.length > MAX_TOOLS) {
		filtered = filtered.slice(0, MAX_TOOLS);
	}

	const result = { filtered, categories: matchedCategories };

	// Cache the result for future use
	toolFilterCache.set(userQuery, filtered, matchedCategories);

	return result;
}

/**
 * Extracts the last user message content from the message array.
 */
export function extractUserQuery(messages: Array<{ from?: string; content?: string }>): string {
	const lastUserMsg = [...messages].reverse().find((m) => m.from === "user");
	return lastUserMsg?.content?.toLowerCase() || "";
}

export function clearToolFilterCache(): void {
	toolFilterCache.clear();
}

/**
 * Identifies which MCP server a tool belongs to based on name pattern.
 * Used for graceful error handling when tool is not found.
 * Returns null if tool pattern is unknown.
 */
export function identifyToolMcp(toolName: string): { mcpName: string; displayName: string } | null {
	const name = toolName.toLowerCase();

	if (TOOL_PATTERNS.perplexity.test(name)) {
		return { mcpName: "perplexity", displayName: "Perplexity AI" };
	}
	if (TOOL_PATTERNS.tavily.test(name)) {
		return { mcpName: "Tavily", displayName: "Tavily Search" };
	}
	if (TOOL_PATTERNS.datagov.test(name)) {
		return { mcpName: "DataGov", displayName: "Israel Government Data (data.gov.il)" };
	}
	// Add more patterns as needed
	if (/^(read_file|write_file|edit_file|list_directory|create_directory)/i.test(name)) {
		return { mcpName: "filesystem", displayName: "Filesystem" };
	}
	if (/^git_/i.test(name)) {
		return { mcpName: "git", displayName: "Git" };
	}
	if (/^(docker_|list_containers|run_container)/i.test(name)) {
		return { mcpName: "docker", displayName: "Docker" };
	}
	if (/^(get_current_time|convert_time)/i.test(name)) {
		return { mcpName: "time", displayName: "Time" };
	}
	if (/^sequentialthinking$/i.test(name)) {
		return { mcpName: "sequential-thinking", displayName: "Sequential Thinking" };
	}
	if (/^fetch$/i.test(name)) {
		return { mcpName: "fetch", displayName: "Web Fetch" };
	}

	return null;
}
