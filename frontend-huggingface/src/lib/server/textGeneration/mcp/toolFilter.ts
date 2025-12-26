import type { OpenAiTool } from "$lib/server/mcp/tools";
import { detectHebrewIntent } from "../utils/hebrewIntentDetector";

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
const TOOL_CATEGORIES: Record<string, { keywords: RegExp; tools: string[] }> = {
	research: {
		// English + Hebrew: search, find, research, information, news, buy, price, compare, recommend, best
		keywords:
			/\b(search|find|research|look up|what is|who is|how to|why|explain|information|news|article|latest|current|today|buy|purchase|price|compare|review|market|recommend|best|top|popular)\b|חפש|חיפוש|מצא|מחקר|מידע|חדשות|מאמר|עדכני|היום|קנה|לקנות|מחיר|השווה|השוואה|ביקורת|שוק|המלצה|הטוב ביותר|פופולרי|מה זה|מי זה|איך|למה|הסבר/i,
		tools: [
			"perplexity_search",
			"perplexity_ask",
			"perplexity_research",
			"perplexity_reason",
			"tavily-search",
			"tavily-extract",
			"tavily_search",
			"tavily_extract",
			"tavily_context",
			"tavily_qna",
			"tavily-map",
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
		keywords:
			/\b(datagov|data\.gov|data gov|government data|public data|open data|ckan|israel data|census|statistics|ministry|health data|education data|budget data|hospitals?|trauma|medical|centers?|jerusalem|israel)\b|נתונים ממשלתיים|נתונים פתוחים|מידע ממשלתי|לשכת הסטטיסטיקה|משרד הבריאות|משרד החינוך|מאגר מידע|דאטהגוב|ממשלתי|תקציב|בריאות|חינוך|סטטיסטיקה|מרכז טראומה|בית חולים|בתי חולים|מוסדות|רישוי|עסקים|רשויות|עיריות|ירושלים/i,
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
	perplexity_ask: 100,
	perplexity_search: 100,
	perplexity_research: 100,
	perplexity_reason: 100,
	tavily_search: 90,
	"tavily-search": 90,
	tavily_extract: 90,
	"tavily-extract": 90,
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
 * Filters tools based on user query intent to reduce grammar complexity.
 * Returns a subset of tools (max MAX_TOOLS) relevant to the query.
 */
export function filterToolsByIntent(
	allTools: OpenAiTool[],
	userQuery: string
): { filtered: OpenAiTool[]; categories: string[] } {
	// Check cache first
	const cached = toolFilterCache.get(userQuery);
	if (cached) {
		return { filtered: cached.tools, categories: cached.categories };
	}

	const matchedCategories: string[] = [];
	const relevantToolNames = new Set<string>(ALWAYS_INCLUDE);

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
		let preferredTools: OpenAiTool[] = [];
		if (hebrewIntent === "research") {
			// User explicitly wants "Deep Research" -> Perplexity
			preferredTools = allTools.filter((t) => t.function.name.toLowerCase().includes("perplexity"));
		} else if (hebrewIntent === "search") {
			// User explicitly wants "Search" -> Tavily
			preferredTools = allTools.filter((t) => t.function.name.toLowerCase().includes("tavily"));
		}

		if (preferredTools.length > 0) {
			const preferredNames = new Set(preferredTools.map((t) => t.function.name));
			// Keep tools that are NOT in preferred (to avoid dupes)
			// 'others' are already sorted by priority from above
			const others = filtered.filter((t) => !preferredNames.has(t.function.name));
			// Put preferred first
			filtered = [...preferredTools, ...others];
		}
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
